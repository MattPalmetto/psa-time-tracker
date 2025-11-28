
import { supabase } from './supabaseClient';
import { TimeEntry, User, AggregatedDataPoint, Category, Project, Team, OrgUser, Invite } from '@/types';
import { DEFAULT_USER_PROJECTS, LEAVE_PROJECTS, PROJECTS as DEFAULT_PROJECTS, TEAMS as DEFAULT_TEAMS, MOCK_ORG_USERS } from '@/constants';

export const dbService = {
  // Check if user exists in 'profiles', if not create them
  async ensureUserProfile(user: { id: string; email: string; full_name?: string }): Promise<User | null> {
    if (!supabase) return null;
    
    try {
      // 1. Check Domain Restriction
      const emailLower = user.email.toLowerCase();
      const allowedDomains = ['jjech.com', 'palmettostatearmory.com', 'advanced-armament.com'];
      const domain = emailLower.split('@')[1];

      if (!allowedDomains.includes(domain)) {
          console.error(`Access Denied: Domain ${domain} not allowed.`);
          return null;
      }

      // 2. Try to fetch profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
         console.error('Error fetching profile:', error);
      }

      const isAdminEmail = emailLower.startsWith('thomas.victa');

      // 3. If no profile, create one
      if (!profile) {
        // Auto-Provisioning Step 1: Check Pending Invites Table
        const { data: invite } = await supabase
            .from('invites')
            .select('*')
            .eq('email', emailLower)
            .single();

        // Auto-Provisioning Step 2: Check Static Org Chart (Legacy/Backup)
        const orgMatch = MOCK_ORG_USERS.find(u => u.email.toLowerCase() === emailLower);

        // Helper to format "firstname.lastname" -> "Firstname Lastname"
        const formatNameFromEmail = (emailStr: string) => {
            const localPart = emailStr.split('@')[0];
            return localPart
                .split('.') // Split by dot
                .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()) // Capitalize
                .join(' '); // Join with space
        };

        const calculatedName = invite 
            ? invite.name 
            : orgMatch 
                ? orgMatch.name 
                : (user.full_name || formatNameFromEmail(user.email));

        // Determine Role: invite role > admin override > org match role > user
        let finalRole = 'user';
        if (isAdminEmail) finalRole = 'admin';
        else if (invite && invite.role) finalRole = invite.role;
        else if (orgMatch && orgMatch.role) finalRole = orgMatch.role;

        const newProfile = {
          id: user.id,
          email: user.email,
          full_name: calculatedName,
          role: finalRole, 
          preferred_projects: DEFAULT_USER_PROJECTS,
          team_id: invite ? invite.team_id : (orgMatch ? orgMatch.teamId : null) 
        };

        const { error: insertError } = await supabase
          .from('profiles')
          .insert([newProfile]);

        if (insertError) {
            console.error('Error creating profile:', insertError);
            
            // Fallback: Foreign Key Violation means Team ID missing. Create without team.
            if (insertError.code === '23503') {
                console.warn(`Team ID '${newProfile.team_id}' missing in DB. Creating user without team.`);
                const fallbackProfile = { ...newProfile, team_id: null };
                const { error: retryError } = await supabase.from('profiles').insert([fallbackProfile]);
                if (retryError) return null;
                return {
                    id: fallbackProfile.id,
                    email: fallbackProfile.email,
                    name: fallbackProfile.full_name,
                    role: fallbackProfile.role as 'user' | 'admin' | 'manager',
                    preferredProjects: fallbackProfile.preferred_projects,
                    teamId: null
                };
            }
            return null;
        }

        // Cleanup: If used an invite, delete it
        if (invite) {
            await supabase.from('invites').delete().eq('email', emailLower);
        }

        return {
            id: newProfile.id,
            email: newProfile.email,
            name: newProfile.full_name,
            role: newProfile.role as 'user' | 'admin' | 'manager',
            preferredProjects: newProfile.preferred_projects,
            teamId: newProfile.team_id
        };
      }

      // 4. Existing profile - Auto-promote to admin if email matches
      if (isAdminEmail && profile.role !== 'admin') {
         await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id);
         profile.role = 'admin';
      }

      return {
        id: profile.id,
        email: profile.email,
        name: profile.full_name,
        role: profile.role as 'user' | 'admin' | 'manager',
        preferredProjects: profile.preferred_projects || DEFAULT_USER_PROJECTS,
        teamId: profile.team_id
      };

    } catch (e) {
      console.error('Unexpected error in ensureUserProfile:', e);
      return null;
    }
  },

  async getAllUsers(): Promise<OrgUser[]> {
      if (!supabase) return MOCK_ORG_USERS;
      
      // 1. Fetch Real Profiles
      const { data: profiles, error } = await supabase.from('profiles').select('*').order('full_name');
      if (error || !profiles) return [];
      
      const realUsers: OrgUser[] = profiles.map((p: any) => ({
          id: p.id,
          name: p.full_name,
          email: p.email,
          teamId: p.team_id || '',
          role: (p.role || 'user') as 'user' | 'manager' | 'admin',
          status: (p.status || 'active') as 'active' | 'inactive' | 'pending', 
          startDate: p.start_date || '2023-01-01',
          endDate: p.end_date,
          leaveReason: p.leave_reason
      }));

      // 2. Fetch Pending Invites (treat as users)
      const { data: invites } = await supabase.from('invites').select('*');
      const pendingUsers: OrgUser[] = (invites || []).map((i: any) => ({
          id: `invite::${i.email}`, // Special ID for invites
          name: i.name,
          email: i.email,
          teamId: i.team_id || '',
          role: (i.role || 'user') as 'user' | 'manager' | 'admin',
          status: 'pending' as const,
          startDate: i.created_at || ''
      }));

      return [...realUsers, ...pendingUsers].sort((a,b) => a.name.localeCompare(b.name));
  },

  async updateUserProfile(user: OrgUser): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No DB connection" };
      
      // Handle Pending Invite Updates differently
      if (user.id.startsWith('invite::')) {
          const originalEmail = user.id.replace('invite::', '');
          const { error } = await supabase.from('invites')
            .update({ name: user.name, email: user.email, team_id: user.teamId, role: user.role })
            .eq('email', originalEmail);
          return error ? { success: false, error: error.message } : { success: true };
      }

      // Handle Real Profile Updates
      const { error } = await supabase.from('profiles').update({
              full_name: user.name,
              email: user.email,
              team_id: user.teamId || null,
              role: user.role, // Allows promoting to manager/admin
              status: user.status,
              end_date: user.endDate,
              leave_reason: user.leaveReason
          }).eq('id', user.id);
      return error ? { success: false, error: error.message } : { success: true };
  },

  async deleteUserProfile(userId: string): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No DB connection" };
      
      if (userId.startsWith('invite::')) {
          const email = userId.replace('invite::', '');
          const { error } = await supabase.from('invites').delete().eq('email', email);
          return error ? { success: false, error: error.message } : { success: true };
      }

      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      return error ? { success: false, error: error.message } : { success: true };
  },

  async preloadDefaultRoster(): Promise<{ success: boolean; msg: string }> {
      if (!supabase) return { success: false, msg: "No DB" };

      // 1. SYNC TEAMS FIRST (Fixes Foreign Key Error)
      const { error: teamError } = await supabase.from('teams').upsert(DEFAULT_TEAMS);
      
      if (teamError) {
          console.error("Failed to sync teams:", teamError);
          return { success: false, msg: "Failed to sync teams: " + teamError.message };
      }
      
      // 2. Get all existing emails
      const { data: profiles } = await supabase.from('profiles').select('email');
      const { data: invites } = await supabase.from('invites').select('email');

      const existingEmails = new Set([
          ...(profiles || []).map((p: any) => p.email.toLowerCase()),
          ...(invites || []).map((i: any) => i.email.toLowerCase())
      ]);

      // 3. Filter Mock Roster
      const usersToImport = MOCK_ORG_USERS.filter(u => !existingEmails.has(u.email.toLowerCase()));

      if (usersToImport.length === 0) {
          return { success: true, msg: "All users are already in the system." };
      }

      // 4. Bulk Insert
      const rows = usersToImport.map(u => ({
          email: u.email.toLowerCase(),
          name: u.name,
          team_id: u.teamId,
          role: u.role || 'user'
      }));

      const { error } = await supabase.from('invites').insert(rows);

      if (error) return { success: false, msg: "Error importing: " + error.message };
      return { success: true, msg: `Successfully imported ${rows.length} new users.` };
  },

  async bulkImportInvites(csvData: { name: string; email: string; teamName: string }[]): Promise<{ success: boolean; msg: string }> {
     if (!supabase) return { success: false, msg: "No DB" };

     // 1. Get Teams Map (Name -> ID)
     const dbTeams = await this.getTeams();
     const teamMap = new Map(dbTeams.map(t => [t.name.toLowerCase(), t.id]));
     const teamIdMap = new Map(dbTeams.map(t => [t.id, t.id])); // Also map IDs

     // 2. Get Existing Emails
     const { data: profiles } = await supabase.from('profiles').select('email');
     const { data: invites } = await supabase.from('invites').select('email');
     const existingEmails = new Set([
        ...(profiles || []).map((p: any) => p.email.toLowerCase()),
        ...(invites || []).map((i: any) => i.email.toLowerCase())
     ]);

     // 3. Process CSV Rows
     const rowsToInsert: any[] = [];
     let skippedCount = 0;
     let teamNotFoundCount = 0;

     csvData.forEach(row => {
         const email = row.email.trim().toLowerCase();
         if (existingEmails.has(email)) {
             skippedCount++;
             return;
         }

         const teamNameLower = row.teamName.trim().toLowerCase();
         // Try finding by name, then by ID
         const teamId = teamMap.get(teamNameLower) || teamIdMap.get(teamNameLower) || null;

         if (!teamId && row.teamName) {
             teamNotFoundCount++;
         }

         rowsToInsert.push({
             email: email,
             name: row.name.trim(),
             team_id: teamId, // Can be null if not found
             role: 'user' // Default bulk import to user
         });
     });

     if (rowsToInsert.length === 0) {
         return { success: true, msg: "No new users to import (all emails exist)." };
     }

     const { error } = await supabase.from('invites').insert(rowsToInsert);
     
     if (error) return { success: false, msg: "Error: " + error.message };
     
     let msg = `Imported ${rowsToInsert.length} users.`;
     if (skippedCount > 0) msg += ` Skipped ${skippedCount} duplicates.`;
     if (teamNotFoundCount > 0) msg += ` Warning: ${teamNotFoundCount} users had unknown teams.`;

     return { success: true, msg };
  },

  // --- INVITE MANAGEMENT ---

  async getInvites(): Promise<Invite[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('invites').select('*').order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map((i: any) => ({
        email: i.email,
        name: i.name,
        teamId: i.team_id,
        role: i.role || 'user',
        createdAt: i.created_at
    }));
  },

  async createInvite(invite: Invite): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No DB" };
      const { error } = await supabase.from('invites').insert([{
          email: invite.email.toLowerCase(),
          name: invite.name,
          team_id: invite.teamId,
          role: invite.role || 'user'
      }]);
      return error ? { success: false, error: error.message } : { success: true };
  },

  async deleteInvite(email: string): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No DB" };
      const { error } = await supabase.from('invites').delete().eq('email', email);
      return error ? { success: false, error: error.message } : { success: true };
  },

  async preProvisionUser(name: string, email: string, teamId: string): Promise<{ success: boolean; error?: string }> {
     // Wrapper for createInvite to match legacy calls
     return this.createInvite({
         name, 
         email, 
         teamId, 
         role: 'user',
         createdAt: new Date().toISOString()
     });
  },

  async updatePreferredProjects(userId: string, projectIds: string[]) {
      if (!supabase) return;
      await supabase.from('profiles').update({ preferred_projects: projectIds }).eq('id', userId);
  },

  // --- TEAM MANAGEMENT ---

  async getTeams(): Promise<Team[]> {
      if (!supabase) return DEFAULT_TEAMS;
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error || !data) return DEFAULT_TEAMS;
      return data.map((t: any) => ({ id: t.id, name: t.name, type: t.type }));
  },

  async createTeam(team: Team): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No DB" };
      const { error } = await supabase.from('teams').insert([{ id: team.id, name: team.name, type: team.type }]);
      return error ? { success: false, error: error.message } : { success: true };
  },

  async deleteTeam(teamId: string): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No DB" };
      // Safety: Unassign all members first to prevent FK error
      const { error: unassignError } = await supabase.from('profiles').update({ team_id: null }).eq('team_id', teamId);
      // Also unassign pending invites
      await supabase.from('invites').update({ team_id: null }).eq('team_id', teamId);
      
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      return error ? { success: false, error: error.message } : { success: true };
  },

  async deleteAllTeams(): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No DB" };
      // 1. Unassign all profiles
      await supabase.from('profiles').update({ team_id: null }).neq('team_id', 'unassigned'); // Dummy filter to update all
      // 2. Unassign all invites
      await supabase.from('invites').update({ team_id: null }).neq('team_id', 'unassigned');
      // 3. Delete all teams
      const { error } = await supabase.from('teams').delete().neq('id', 'placeholder'); // Delete all
      return error ? { success: false, error: error.message } : { success: true };
  },

  // --- PROJECT MANAGEMENT ---

  async getProjects(): Promise<Project[]> {
    if (!supabase) return DEFAULT_PROJECTS;
    const { data, error } = await supabase.from('projects').select('*').order('category', { ascending: true }).order('name', { ascending: true });
    if (error || !data) return DEFAULT_PROJECTS;
    return data.map((p: any) => ({ id: p.id, name: p.name, category: p.category as Category }));
  },

  async createProject(project: Project): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No DB" };
      const { error } = await supabase.from('projects').insert([{ id: project.id, name: project.name, category: project.category }]);
      return error ? { success: false, error: error.message } : { success: true };
  },

  // --- TIMESHEETS ---

  async getTimesheet(userId: string, year: number, week: number): Promise<Record<string, TimeEntry>> {
    if (!supabase) return {};
    const { data, error } = await supabase.from('timesheets').select('*').eq('user_id', userId).eq('year', year).eq('week_number', week);
    if (error) return {};

    const entries: Record<string, TimeEntry> = {};
    data.forEach((row: any) => {
        const isLeave = LEAVE_PROJECTS.some(lp => lp.id === row.project_id);
        if (entries[row.project_id]) {
            entries[row.project_id].hours += Number(row.hours);
            entries[row.project_id].percentage += Number(row.percentage);
            if (isLeave) entries[row.project_id].days += (Number(row.hours) / 8);
        } else {
            entries[row.project_id] = {
                projectId: row.project_id,
                percentage: Number(row.percentage),
                hours: Number(row.hours),
                days: isLeave ? Number(row.hours) / 8 : 0 
            };
        }
    });
    return entries;
  },

  async getSubmittedUserIds(year: number, week: number): Promise<string[]> {
      if (!supabase) return [];
      const { data, error } = await supabase.from('timesheets').select('user_id').eq('year', year).eq('week_number', week);
      if (error || !data) return [];
      // Use Set to handle duplicates, convert to array for component usage
      const ids = new Set<string>();
      data.forEach((row: any) => ids.add(String(row.user_id)));
      return Array.from(ids);
  },

  async saveTimesheet(userId: string, year: number, week: number, entries: Record<string, TimeEntry>): Promise<{ success: boolean; error?: string }> {
      if (!supabase) return { success: false, error: "No connection" };
      
      // Attempt Delete First
      const { error: deleteError } = await supabase.from('timesheets').delete().eq('user_id', userId).eq('year', year).eq('week_number', week);
      
      if (deleteError) {
          console.error("Save failed during delete:", deleteError);
          return { success: false, error: "Database permission error: Admin requires 'delete' policy on timesheets." };
      }

      const rowsToInsert = Object.values(entries).filter(e => e.hours > 0 || e.percentage > 0).map(e => ({
            user_id: userId,
            year: year,
            week_number: week,
            project_id: e.projectId,
            hours: e.hours,
            percentage: e.percentage
        }));

      if (rowsToInsert.length === 0) return { success: true };
      
      const { error } = await supabase.from('timesheets').insert(rowsToInsert);
      return error ? { success: false, error: error.message } : { success: true };
  },

  // Analytics
  async getAnalyticsData(scope: 'department' | 'team' | 'user', targetId?: string): Promise<AggregatedDataPoint[]> {
    if (!supabase) return [];
    let query = supabase.from('timesheets').select(`hours, week_number, year, project_id, profiles!inner ( team_id )`);
    if (scope === 'team' && targetId) query = query.eq('profiles.team_id', targetId);
    else if (scope === 'user' && targetId) query = query.eq('user_id', targetId);

    const { data, error } = await query;
    if (error) return [];

    const dbProjects = await this.getProjects();
    const allProjects = [...dbProjects, ...LEAVE_PROJECTS];
    const weeks: Record<string, AggregatedDataPoint> = {};

    data.forEach((row: any) => {
        const uniqueKey = `${row.year}-W${row.week_number}`;
        if (!weeks[uniqueKey]) {
            weeks[uniqueKey] = { name: `W${row.week_number} '${row.year.toString().slice(-2)}`, year: row.year, week: row.week_number, rd: 0, support: 0, mfg: 0, leave: 0 };
        }
        const project = allProjects.find(p => p.id === row.project_id);
        const hours = Number(row.hours);
        if (project) {
            weeks[uniqueKey][project.id] = (Number(weeks[uniqueKey][project.id]) || 0) + hours;
            if (project.category === Category.RD) weeks[uniqueKey].rd += hours;
            else if (project.category === Category.RD_SUPPORT) weeks[uniqueKey].support += hours;
            else if (project.category === Category.MFG_SUPPORT) weeks[uniqueKey].mfg += hours;
            else if (project.category === Category.LEAVE) weeks[uniqueKey].leave += hours;
        }
    });
    return Object.values(weeks).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.week - b.week;
    });
  },

  // Detailed CSV Export
  async generateDetailedCsv(scope: 'department' | 'team' | 'user', targetId: string, activeWeeks: Set<string>): Promise<string> {
      if (!supabase) return "";

      // 1. Fetch All Data Matching Scope
      let query = supabase.from('timesheets')
        .select(`
            hours, percentage, week_number, year, project_id,
            profiles!inner ( full_name, team_id, teams ( name ) )
        `);
      
      if (scope === 'team' && targetId) query = query.eq('profiles.team_id', targetId);
      else if (scope === 'user' && targetId) query = query.eq('user_id', targetId);

      const { data, error } = await query;
      if (error || !data) return "";

      // 2. Fetch Projects to Map IDs to Names
      const dbProjects = await this.getProjects();
      const allProjects = [...dbProjects, ...LEAVE_PROJECTS];
      const projectMap = new Map(allProjects.map(p => [p.id, p]));

      // 3. Process Data - Aggregate by User
      // Structure: UserID -> { name, team, totalHours, projects: { projId: hours }, categories: { rd: hours, ... } }
      const userMap: Record<string, any> = {};
      const globalTotals: Record<string, number> = { total: 0 };

      data.forEach((row: any) => {
          // Filter by Active Weeks (passed from frontend to match time range like 3M/YTD)
          const weekKey = `${row.year}-W${row.week_number}`;
          if (activeWeeks.size > 0 && !activeWeeks.has(weekKey)) return;

          const userId = row.profiles.full_name; // Group by Name for CSV readability
          
          if (!userMap[userId]) {
              userMap[userId] = {
                  name: row.profiles.full_name,
                  team: row.profiles.teams?.name || 'Unassigned',
                  totalHours: 0,
                  projects: {},
                  categories: { [Category.RD]: 0, [Category.RD_SUPPORT]: 0, [Category.MFG_SUPPORT]: 0, [Category.LEAVE]: 0 }
              };
          }

          const hours = Number(row.hours);
          const project = projectMap.get(row.project_id);

          if (project) {
              userMap[userId].totalHours += hours;
              userMap[userId].projects[project.name] = (userMap[userId].projects[project.name] || 0) + hours;
              userMap[userId].categories[project.category] += hours;

              // Global Totals
              globalTotals.total += hours;
              globalTotals[project.name] = (globalTotals[project.name] || 0) + hours;
              globalTotals[project.category] = (globalTotals[project.category] || 0) + hours;
          }
      });

      // 4. Build CSV Columns
      // Fixed Columns: Name, Team, Total Hours, Category Breakdowns
      // Dynamic Columns: All active projects
      const activeProjectNames = Array.from(new Set(data.map((r: any) => projectMap.get(r.project_id)?.name).filter(Boolean))).sort();
      
      const headers = [
          "Name", "Team", "Total Hours", 
          "R&D %", "Support %", "MFG %", "Leave %",
          ...activeProjectNames.map(p => `${p} %`) // Dynamic Project Columns
      ];

      const rows = Object.values(userMap).map((u: any) => {
          const row = [
              `"${u.name}"`,
              `"${u.team}"`,
              u.totalHours.toFixed(1),
              // Category Percentages
              u.totalHours ? ((u.categories[Category.RD] / u.totalHours) * 100).toFixed(1) + '%' : '0%',
              u.totalHours ? ((u.categories[Category.RD_SUPPORT] / u.totalHours) * 100).toFixed(1) + '%' : '0%',
              u.totalHours ? ((u.categories[Category.MFG_SUPPORT] / u.totalHours) * 100).toFixed(1) + '%' : '0%',
              u.totalHours ? ((u.categories[Category.LEAVE] / u.totalHours) * 100).toFixed(1) + '%' : '0%',
              // Project Percentages
              ...activeProjectNames.map((p: any) => {
                  const hours = u.projects[p] || 0;
                  return u.totalHours ? ((hours / u.totalHours) * 100).toFixed(1) + '%' : '0%';
              })
          ];
          return row.join(',');
      });

      // 5. Add Totals Row
      const totalRow = [
          "ALL USERS TOTAL",
          "-",
          globalTotals.total.toFixed(1),
          // Global Category Percentages
          globalTotals.total ? ((globalTotals[Category.RD] || 0) / globalTotals.total * 100).toFixed(1) + '%' : '0%',
          globalTotals.total ? ((globalTotals[Category.RD_SUPPORT] || 0) / globalTotals.total * 100).toFixed(1) + '%' : '0%',
          globalTotals.total ? ((globalTotals[Category.MFG_SUPPORT] || 0) / globalTotals.total * 100).toFixed(1) + '%' : '0%',
          globalTotals.total ? ((globalTotals[Category.LEAVE] || 0) / globalTotals.total * 100).toFixed(1) + '%' : '0%',
          // Global Project Percentages
          ...activeProjectNames.map((p: any) => {
              const hours = globalTotals[p] || 0;
              return globalTotals.total ? ((hours / globalTotals.total) * 100).toFixed(1) + '%' : '0%';
          })
      ];

      return [headers.join(','), ...rows, totalRow.join(',')].join('\n');
  }
};
