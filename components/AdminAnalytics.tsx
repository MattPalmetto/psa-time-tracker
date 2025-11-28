
import React, { useEffect, useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { dbService } from '@/services/dbService';
import { generateExecutiveSummary, detectAnomalies } from '@/services/geminiService';
import { Sparkles, Loader2, AlertTriangle, Layers, ChevronRight, ChevronLeft, ArrowLeft, Users, Building2, User, Settings2, Download, Briefcase, Calendar, Edit, CheckCircle, Clock, PieChart as PieChartIcon } from 'lucide-react';
import { PROJECTS as DEFAULT_PROJECTS, TEAMS as DEFAULT_TEAMS, MOCK_ORG_USERS } from '@/constants';
import { Category, ScopeType, Team, OrgUser, Project } from '@/types';
import { TeamManager } from './TeamManager';
import { AdminProjectManager } from './AdminProjectManager';
import { AdminTimesheetEditor } from './AdminTimesheetEditor';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { generateMockHistory } from '@/services/mockData';

// Helper
const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Formatting helper
const formatTooltip = (value: number, name: string, props: any) => {
    return [`${value.toFixed(2)} hrs`, name];
};

const COLORS = [
  '#4F46E5', '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', 
  '#F43F5E', '#F59E0B', '#10B981', '#14B8A6', '#06B6D4'
];

type ViewLevel = 'overview' | 'category' | 'project';
type TimeRange = '3M' | 'YTD' | '1Y' | 'ALL';

interface DrillState {
  level: ViewLevel;
  category?: Category;
  projectId?: string;
  projectName?: string;
}

const KEY_MAP: Record<string, Category> = {
  rd: Category.RD,
  support: Category.RD_SUPPORT,
  mfg: Category.MFG_SUPPORT
};

interface AdminAnalyticsProps {
    currentUserRole?: 'admin' | 'manager';
    currentUserTeamId?: string;
}

export const AdminAnalytics: React.FC<AdminAnalyticsProps> = ({ currentUserRole = 'admin', currentUserTeamId }) => {
  // Org Hierarchy State
  // If manager, default to 'team' scope and their team ID.
  const [scope, setScope] = useState<ScopeType>(currentUserRole === 'manager' ? 'team' : 'department');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(currentUserRole === 'manager' && currentUserTeamId ? currentUserTeamId : '');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  
  // User Management State
  const [allUsers, setAllUsers] = useState<OrgUser[]>(MOCK_ORG_USERS);
  const [teams, setTeams] = useState<Team[]>([]); 
  const [isTeamManagerOpen, setIsTeamManagerOpen] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [isTimesheetEditorOpen, setIsTimesheetEditorOpen] = useState(false);

  // Missing Submission State
  const [missingSubmissionWeek, setMissingSubmissionWeek] = useState(getISOWeek(new Date()));
  const [missingSubmissionYear, setMissingSubmissionYear] = useState(new Date().getFullYear());
  const [submittedUserIds, setSubmittedUserIds] = useState<string[]>([]);
  const [isMissingReportOpen, setIsMissingReportOpen] = useState(true);

  // Data State
  const [data, setData] = useState<any[]>([]);
  const [activeProjects, setActiveProjects] = useState<Project[]>(DEFAULT_PROJECTS);
  const [insights, setInsights] = useState<string>("");
  const [anomalies, setAnomalies] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('3M');
  
  // Drill Down State (Project/Category)
  const [drillState, setDrillState] = useState<DrillState>({ level: 'overview' });

  // Init Data Fetching
  const fetchMetadata = async () => {
    const projs = await dbService.getProjects();
    setActiveProjects(projs);

    if (isSupabaseConfigured()) {
       const dbTeams = await dbService.getTeams();
       setTeams(dbTeams);
       const dbUsers = await dbService.getAllUsers();
       setAllUsers(dbUsers);
    } else {
       setTeams(DEFAULT_TEAMS);
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  // For managers, ensure their team ID is locked
  useEffect(() => {
      if (currentUserRole === 'manager' && currentUserTeamId) {
          setScope('team');
          setSelectedTeamId(currentUserTeamId);
      }
  }, [currentUserRole, currentUserTeamId]);

  // Fetch Submitted Users for Missing Report
  useEffect(() => {
      const fetchSubmitted = async () => {
          if (isSupabaseConfigured()) {
            const ids = await dbService.getSubmittedUserIds(missingSubmissionYear, missingSubmissionWeek);
            setSubmittedUserIds(ids);
          }
      };
      fetchSubmitted();
  }, [missingSubmissionWeek, missingSubmissionYear, allUsers]);

  // Data Fetching based on Scope
  useEffect(() => {
    const fetchData = async () => {
        // If manager but no team ID yet, wait
        if (currentUserRole === 'manager' && !selectedTeamId) return;

        setLoading(true);
        let newData;
        
        if (isSupabaseConfigured()) {
            // Real Data
            const targetId = scope === 'user' ? selectedUserId : selectedTeamId;
            newData = await dbService.getAnalyticsData(scope, targetId);
        } else {
            // Fallback to Mock if no DB connection
            let context: 'department' | 'rd_team' | 'support_team' | 'user' = 'department';
            if (scope === 'team' && selectedTeamId) {
                const team = teams.find(t => t.id === selectedTeamId);
                context = team?.type === 'rd' ? 'rd_team' : 'support_team';
            } else if (scope === 'user') {
                context = 'user';
            }
            newData = generateMockHistory(context);
        }

        setData(newData);
        
        // Reset drill state when scope changes
        setDrillState({ level: 'overview' });

        if (newData.length > 0) {
            const [summaryRes, anomalyRes] = await Promise.all([
                generateExecutiveSummary(newData),
                detectAnomalies(newData)
            ]);
            setInsights(summaryRes);
            setAnomalies(anomalyRes);
        } else {
            setInsights("No data available for the selected range yet.");
            setAnomalies("");
        }
        setLoading(false);
    };

    fetchData();
  }, [scope, selectedTeamId, selectedUserId, teams, isTimesheetEditorOpen, currentUserRole]);

  // Filter Data based on Time Range
  const filteredData = useMemo(() => {
    if (timeRange === 'ALL') return data;
    
    const len = data.length;
    // Data is sorted by year/week
    if (timeRange === '3M') return data.slice(Math.max(0, len - 13)); // Approx 13 weeks
    if (timeRange === '1Y') return data.slice(Math.max(0, len - 52)); // 52 weeks
    if (timeRange === 'YTD') {
        const currentYear = new Date().getFullYear();
        return data.filter(d => d.year === currentYear);
    }
    return data;
  }, [data, timeRange]);

  // Aggregated Pie Chart Data
  const pieChartData = useMemo(() => {
      const projectTotals: Record<string, number> = {};
      
      filteredData.forEach(weekData => {
          activeProjects.forEach(proj => {
              const hours = Number(weekData[proj.id]) || 0;
              if (hours > 0) {
                  projectTotals[proj.name] = (projectTotals[proj.name] || 0) + hours;
              }
          });
      });

      return Object.entries(projectTotals)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value) // Sort desc
          .slice(0, 10); // Top 10 projects to keep pie readable
  }, [filteredData, activeProjects]);

  // Determine series to display based on drill level
  const chartSeries = useMemo(() => {
    if (drillState.level === 'overview') {
       return [
        { key: 'rd', name: 'R&D', color: '#4F46E5', category: Category.RD },
        { key: 'support', name: 'Support', color: '#0EA5E9', category: Category.RD_SUPPORT },
        { key: 'mfg', name: 'MFG', color: '#10B981', category: Category.MFG_SUPPORT },
       ];
    }
    if (drillState.level === 'category' && drillState.category) {
       const categoryProjects = activeProjects.filter(p => p.category === drillState.category);
       // Ensure we only show projects that exist in data
       const filteredProjects = categoryProjects.filter(p => {
          return filteredData.some(d => (Number(d[p.id]) || 0) > 0);
       });
       return filteredProjects.map((p, index) => ({
          key: p.id,
          name: p.name,
          color: COLORS[index % COLORS.length]
       }));
    }
    if (drillState.level === 'project' && drillState.projectId) {
       return [{
         key: drillState.projectId,
         name: drillState.projectName || 'Project',
         color: '#4F46E5'
       }];
    }
    return [];
  }, [drillState, filteredData, activeProjects]);

  // Project Trends Series (for bottom chart)
  const projectTrendSeries = useMemo(() => {
     const usedProjectIds = new Set<string>();
     filteredData.forEach(week => {
        activeProjects.forEach(p => {
             if (Number(week[p.id]) > 0) usedProjectIds.add(p.id);
        });
     });
     
     return activeProjects
        .filter(p => usedProjectIds.has(p.id))
        .map((p, index) => ({
             key: p.id,
             name: p.name,
             color: COLORS[index % COLORS.length]
        }));

  }, [filteredData, activeProjects]);

  const handleBarClick = (dataKey: string) => {
    if (drillState.level === 'overview') {
      const category = KEY_MAP[dataKey];
      if (category) setDrillState({ level: 'category', category });
    } else if (drillState.level === 'category') {
      const project = activeProjects.find(p => p.id === dataKey);
      if (project) setDrillState({ level: 'project', category: drillState.category, projectId: project.id, projectName: project.name });
    }
  };

  const goToOverview = () => setDrillState({ level: 'overview' });
  const goUp = () => {
     if (drillState.level === 'project') setDrillState({ level: 'category', category: drillState.category });
     else setDrillState({ level: 'overview' });
  };

  // Scope Handlers
  const handleTeamChange = (id: string) => {
      if (!id) {
          setScope('department');
          setSelectedTeamId('');
          return;
      }
      setScope('team');
      setSelectedTeamId(id);
      setSelectedUserId('');
  };

  const handleUserChange = (id: string) => {
      if (!id) {
          if (selectedTeamId) setScope('team');
          else setScope('department');
          setSelectedUserId('');
          return;
      }
      setScope('user');
      setSelectedUserId(id);
  };

  // User Management Handlers
  const addUser = (newUser: OrgUser) => {
    setAllUsers(prev => [...prev, newUser]);
  };

  const updateUser = async (updatedUser: OrgUser) => {
    setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    
    if (isSupabaseConfigured()) {
        await dbService.updateUserProfile(updatedUser);
    }
  };

  const deleteUser = async (userId: string) => {
      if (isSupabaseConfigured()) {
          const res = await dbService.deleteUserProfile(userId);
          if (res.success) {
              setAllUsers(prev => prev.filter(u => u.id !== userId));
              if (selectedUserId === userId) {
                  setSelectedUserId('');
                  setScope(selectedTeamId ? 'team' : 'department');
              }
          } else {
              alert("Error deleting user: " + res.error);
          }
      }
  };

  const offboardUser = (userId: string, endDate: string, reason: 'voluntary' | 'involuntary') => {
    setAllUsers(prev => prev.map(user => {
        if (user.id === userId) {
            return {
                ...user,
                status: 'inactive',
                endDate,
                leaveReason: reason
            };
        }
        return user;
    }));
    
    if (selectedUserId === userId) {
      setSelectedUserId('');
      setScope(selectedTeamId ? 'team' : 'department');
    }
  };

  // Team Management Handlers
  const addTeam = async (newTeam: Team) => {
      if (isSupabaseConfigured()) {
          const res = await dbService.createTeam(newTeam);
          if (res.success) {
              setTeams(prev => [...prev, newTeam].sort((a,b) => a.name.localeCompare(b.name)));
          }
      } else {
          setTeams(prev => [...prev, newTeam].sort((a,b) => a.name.localeCompare(b.name)));
      }
  };

  const deleteTeam = async (teamId: string) => {
      if (isSupabaseConfigured()) {
          const res = await dbService.deleteTeam(teamId);
          if (res.success) {
              setTeams(prev => prev.filter(t => t.id !== teamId));
              if (selectedTeamId === teamId) {
                  setScope('department');
                  setSelectedTeamId('');
              }
          } else {
              alert("Error deleting team: " + res.error);
          }
      } else {
          setTeams(prev => prev.filter(t => t.id !== teamId));
      }
  };

  const addProject = async (newProject: Project) => {
      await dbService.createProject(newProject);
      await fetchMetadata();
  };

  const downloadCSV = async () => {
    setExporting(true);
    
    if (isSupabaseConfigured()) {
        // Capture currently filtered weeks to generate exact report
        // filteredData is aggregated, but keys contain 'year' and 'week'
        const activeWeeks = new Set<string>();
        filteredData.forEach(d => activeWeeks.add(`${d.year}-W${d.week}`));

        const targetId = scope === 'user' ? selectedUserId : selectedTeamId;
        const csvData = await dbService.generateDetailedCsv(scope, targetId, activeWeeks);
        
        if (csvData) {
            const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvData);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `detailed_eng_report_${scope}_${timeRange}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert("No data found to export.");
        }
    } else {
        // Legacy export for Mock Data
        if (data.length === 0) return;
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(row => Object.values(row).join(','));
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `mock_report_${scope}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    setExporting(false);
  };

  const activeUsers = allUsers.filter(u => u.status === 'active');
  const filteredUsers = selectedTeamId 
    ? activeUsers.filter(u => u.teamId === selectedTeamId)
    : activeUsers;

  // Calculate Missing Submissions
  // If manager, only check their team. If admin, check filteredUsers or all.
  const usersToCheck = currentUserRole === 'manager' ? activeUsers.filter(u => u.teamId === selectedTeamId) : activeUsers;
  const missingUsers = usersToCheck.filter(u => !submittedUserIds.includes(u.id));
  const missingCount = missingUsers.length;
  const complianceRate = usersToCheck.length > 0 ? ((usersToCheck.length - missingCount) / usersToCheck.length) * 100 : 100;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 pb-32 font-sans transition-colors">
      
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
           <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
               {currentUserRole === 'manager' ? 'Team Dashboard' : 'Engineering Analytics'}
           </h1>
           <p className="text-gray-500 dark:text-gray-400 mt-1">Real-time team allocation trends & burnout monitoring.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
            {/* Time Range Selector */}
            <div className="flex items-center bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg p-1 shadow-sm mr-2">
                {(['3M', 'YTD', '1Y', 'ALL'] as TimeRange[]).map((range) => (
                    <button
                        key={range}
                        onClick={() => setTimeRange(range)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${timeRange === range ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                    >
                        {range}
                    </button>
                ))}
            </div>

            <button 
                onClick={downloadCSV}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm disabled:opacity-50"
            >
                {exporting ? <Loader2 size={16} className="animate-spin"/> : <Download size={16} />}
                {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            
            {currentUserRole === 'admin' && (
                <>
                    <button 
                        onClick={() => setIsProjectManagerOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm"
                    >
                        <Briefcase size={16} />
                        Manage Projects
                    </button>
                    
                    <button 
                        onClick={() => setIsTeamManagerOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white border border-transparent rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                        <Settings2 size={16} />
                        Manage Team
                    </button>
                </>
            )}
        </div>
      </div>

      {/* Org Hierarchy Selector & Breadcrumbs */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-center gap-4 justify-between transition-colors">
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 font-semibold min-w-fit">
                <Building2 size={20} />
                <span>Org View:</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full">
                {/* Department Button - Only visible for Admin */}
                {currentUserRole === 'admin' && (
                    <>
                        <button 
                            onClick={() => { setScope('department'); setSelectedTeamId(''); setSelectedUserId(''); }}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${scope === 'department' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                        >
                            Engineering Dept
                        </button>
                        <ChevronRight size={16} className="text-gray-300 dark:text-gray-600" />
                    </>
                )}

                {/* Team Selector - Locked for Manager */}
                <div className="relative">
                    <select 
                        value={selectedTeamId}
                        onChange={(e) => handleTeamChange(e.target.value)}
                        disabled={currentUserRole === 'manager'}
                        className={`appearance-none pl-10 pr-8 py-2 rounded-lg font-medium border focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer ${scope === 'team' || (scope === 'user' && selectedTeamId) ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200'} ${currentUserRole === 'manager' ? 'opacity-100 cursor-default' : ''}`}
                    >
                        <option value="" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">Select Team...</option>
                        {teams.map(t => (
                            <option key={t.id} value={t.id} className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">{t.name}</option>
                        ))}
                    </select>
                    <Users size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${scope === 'team' || selectedTeamId ? 'text-indigo-500' : 'text-gray-400'}`} />
                </div>

                <ChevronRight size={16} className="text-gray-300 dark:text-gray-600" />

                {/* User Selector */}
                <div className="relative">
                    <select 
                        value={selectedUserId}
                        onChange={(e) => handleUserChange(e.target.value)}
                        disabled={!selectedTeamId} 
                        className={`appearance-none pl-10 pr-8 py-2 rounded-lg font-medium border focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer ${scope === 'user' ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200'} ${!selectedTeamId ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <option value="" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">{selectedTeamId ? 'Select User...' : 'Select Team First'}</option>
                        {filteredUsers.map(u => (
                            <option key={u.id} value={u.id} className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">{u.name}</option>
                        ))}
                    </select>
                    <User size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${scope === 'user' ? 'text-indigo-500' : 'text-gray-400'}`} />
                </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
                onClick={() => setIsMissingReportOpen(!isMissingReportOpen)}
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors shadow-sm ${isMissingReportOpen ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
            >
                <Clock size={16} />
                Time Sheet Report
            </button>

            {/* Timesheet Correct Button */}
            {scope === 'user' && selectedUserId && (
                <button 
                    onClick={() => setIsTimesheetEditorOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors font-semibold shadow-sm whitespace-nowrap"
                >
                    <Edit size={16}/> Edit Timesheet
                </button>
            )}
          </div>
      </div>

       {/* Time Sheet Report Widget */}
       {isMissingReportOpen && (
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm transition-colors animate-in fade-in slide-in-from-top-2">
              <div className="bg-gray-50 dark:bg-slate-900/50 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-center gap-4">
                      <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                          <Clock size={20} />
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Submission Compliance</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                              <span>Week {missingSubmissionWeek}, {missingSubmissionYear}</span>
                              <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                              <span className={complianceRate === 100 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>
                                  {complianceRate.toFixed(0)}% Submitted
                              </span>
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setMissingSubmissionWeek(w => w > 1 ? w - 1 : 52)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded text-gray-600 dark:text-gray-300"
                      >
                          <ChevronLeft size={16} />
                      </button>
                      <button 
                        onClick={() => setMissingSubmissionWeek(w => w < 52 ? w + 1 : 1)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded text-gray-600 dark:text-gray-300"
                      >
                          <ChevronRight size={16} />
                      </button>
                      <button 
                        onClick={() => setIsMissingReportOpen(false)} 
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-4 underline"
                      >
                          Hide Report
                      </button>
                  </div>
              </div>
              
              {missingCount > 0 ? (
                <div className="p-6">
                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Pending Submissions ({missingCount})</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Admin sees all teams, Manager sees only their team */}
                        {(currentUserRole === 'admin' ? teams : teams.filter(t => t.id === currentUserTeamId)).map(team => {
                            const teamMissing = missingUsers.filter(u => u.teamId === team.id);
                            if (teamMissing.length === 0) return null;
                            return (
                                <div key={team.id} className="bg-gray-50 dark:bg-slate-900/30 p-3 rounded-lg border border-gray-100 dark:border-slate-700">
                                    <h5 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-2">{team.name}</h5>
                                    <ul className="space-y-1">
                                        {teamMissing.map(u => (
                                            <li key={u.id} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                                                {u.name}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                        {/* Unassigned missing users - Only Admin */}
                        {currentUserRole === 'admin' && missingUsers.filter(u => !u.teamId || u.teamId === 'unassigned').length > 0 && (
                            <div className="bg-gray-50 dark:bg-slate-900/30 p-3 rounded-lg border border-gray-100 dark:border-slate-700">
                                <h5 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-2">Unassigned</h5>
                                <ul className="space-y-1">
                                    {missingUsers.filter(u => !u.teamId || u.teamId === 'unassigned').map(u => (
                                        <li key={u.id} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                                            {u.name}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
              ) : (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center">
                      <CheckCircle className="text-emerald-500 mb-2" size={32} />
                      <p>All active users have submitted timesheets for Week {missingSubmissionWeek}!</p>
                  </div>
              )}
          </div>
      )}

      {/* Breadcrumbs for Drill Down */}
      <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm w-fit text-sm transition-colors">
          <button onClick={goToOverview} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${drillState.level === 'overview' ? 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-750'}`}>Overview</button>
          
          {drillState.category && (
            <>
              <ChevronRight size={16} className="text-gray-400" />
              <button 
                 onClick={() => setDrillState({ level: 'category', category: drillState.category })}
                 className={`px-3 py-1.5 rounded-md font-medium transition-colors ${drillState.level === 'category' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-750'}`}
              >
                {drillState.category}
              </button>
            </>
          )}

          {drillState.projectId && (
            <>
              <ChevronRight size={16} className="text-gray-400" />
              <span className="px-3 py-1.5 rounded-md font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">{drillState.projectName}</span>
            </>
          )}
      </div>

      {/* Charts */}
      {filteredData.length === 0 && !loading ? (
        <div className="text-center py-20 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
            <p className="text-gray-500 dark:text-gray-400">No timesheet data available for this range yet.</p>
        </div>
      ) : (
      <div className="flex flex-col space-y-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 1. Category Allocation Breakdown */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-gray-800 dark:text-white">
                    {drillState.level === 'overview' ? 'Allocation Breakdown' : drillState.level === 'category' ? `${drillState.category} Breakdown` : drillState.projectName} (Hours)
                </h3>
                
                <div className="flex items-center gap-2">
                    {drillState.level !== 'project' && <span className="text-xs text-indigo-500 font-medium hidden sm:inline-block">Click columns to drill down</span>}
                    {drillState.level !== 'overview' && (
                    <button 
                        onClick={goUp}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md shadow-sm text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-500 transition-all"
                    >
                        <ArrowLeft size={14} />
                        Up a Level
                    </button>
                    )}
                </div>
            </div>
            
            <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.3} />
                    <XAxis dataKey="name" tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" />
                    <YAxis tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" />
                    <Tooltip 
                        formatter={formatTooltip}
                        cursor={{fill: 'rgba(148, 163, 184, 0.1)'}}
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} 
                    />
                    <Legend formatter={(value) => <span className="text-slate-600 dark:text-slate-300 ml-1">{value}</span>} />
                    {chartSeries.map(series => (
                    <Bar 
                        key={series.key} 
                        dataKey={series.key} 
                        name={series.name} 
                        fill={series.color} 
                        onClick={() => handleBarClick(series.key)}
                        cursor="pointer"
                        />
                    ))}
                </BarChart>
                </ResponsiveContainer>
            </div>
            </div>

            {/* 1.5 Project Distribution Pie Chart */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <PieChartIcon className="text-gray-400" size={18} />
                        Top Projects
                    </h3>
                </div>
                <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {pieChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                ))}
                            </Pie>
                            <Tooltip 
                                formatter={(value: number, name: string) => [`${value.toFixed(1)} hrs`, name]}
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            />
                            <Legend 
                                layout="vertical" 
                                verticalAlign="middle" 
                                align="right"
                                wrapperStyle={{ fontSize: '11px' }}
                                formatter={(value) => <span className="text-slate-600 dark:text-slate-300 ml-1">{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* 2. Detailed Project Trends (Stacked Bar) */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
           <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Layers className="text-gray-400" size={18} />
                    Detailed Project Trends
                </h3>
            </div>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.3} />
                        <XAxis dataKey="name" tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" />
                        <YAxis tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" />
                        <Tooltip 
                            formatter={formatTooltip}
                            cursor={{fill: 'rgba(148, 163, 184, 0.1)'}}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} 
                        />
                        <Legend iconType="circle" formatter={(value) => <span className="text-slate-600 dark:text-slate-300 ml-1">{value}</span>} />
                        {projectTrendSeries.map((series) => (
                            <Bar 
                                key={series.key} 
                                dataKey={series.key} 
                                name={series.name} 
                                stackId="a" 
                                fill={series.color} 
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* 3. Leave Trends */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
            <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Calendar className="text-gray-400" size={18} />
                Leave Trends
            </h3>
            </div>
            <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.3} />
                <XAxis dataKey="name" tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" />
                <YAxis tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" />
                <Tooltip 
                    formatter={formatTooltip}
                    cursor={{fill: 'rgba(148, 163, 184, 0.1)'}}
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} 
                />
                <Bar dataKey="leave" name="Hours Off" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
            </ResponsiveContainer>
            </div>
        </div>

      </div>
      )}

      {/* AI Insights Card (Moved to Bottom) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-800 shadow-sm transition-colors">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-indigo-600 dark:text-indigo-400" size={20} />
            <h2 className="font-bold text-indigo-900 dark:text-indigo-300">AI Executive Summary</h2>
          </div>
          {loading ? (
            <div className="flex items-center space-x-2 text-indigo-400 animate-pulse">
              <Loader2 className="animate-spin" />
              <span>Analyzing team velocity...</span>
            </div>
          ) : (
            <div className="prose prose-sm prose-indigo text-gray-700 dark:text-gray-300">
              <p className="whitespace-pre-wrap">{insights}</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm transition-colors">
          <div className="flex items-center gap-2 mb-4 text-amber-600 dark:text-amber-500">
            <AlertTriangle size={20} />
            <h2 className="font-bold">Detected Anomalies</h2>
          </div>
           {loading ? (
             <div className="h-20 w-full bg-gray-100 dark:bg-slate-700 rounded animate-pulse"></div>
           ) : (
             <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{anomalies}</p>
           )}
        </div>
      </div>

      {/* Modals */}
      <TeamManager 
        isOpen={isTeamManagerOpen}
        onClose={() => setIsTeamManagerOpen(false)}
        users={allUsers}
        onAddUser={addUser}
        onUpdateUser={updateUser}
        onDeleteUser={deleteUser}
        onOffboardUser={offboardUser}
        teams={teams}
        onAddTeam={addTeam}
        onDeleteTeam={deleteTeam}
        onRefreshData={fetchMetadata}
      />

      <AdminProjectManager 
        isOpen={isProjectManagerOpen} 
        onClose={() => setIsProjectManagerOpen(false)}
        projects={activeProjects}
        onAddProject={addProject}
      />

      <AdminTimesheetEditor
        isOpen={isTimesheetEditorOpen}
        onClose={() => setIsTimesheetEditorOpen(false)}
        user={allUsers.find(u => u.id === selectedUserId) || null}
      />

    </div>
  );
};
