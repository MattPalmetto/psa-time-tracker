
import React, { useState, useEffect, useRef } from 'react';
import { TEAMS } from '@/constants';
import { OrgUser, Team, Invite } from '@/types';
import { Trash2, X, Briefcase, Users, Plus, Info, Edit2, UserX, Mail, Upload, FileSpreadsheet, Check, Shield } from 'lucide-react';
import { dbService } from '@/services/dbService';

interface TeamManagerProps {
  isOpen: boolean;
  onClose: () => void;
  users: OrgUser[];
  onAddUser: (user: OrgUser) => void;
  onUpdateUser: (user: OrgUser) => void;
  onDeleteUser?: (userId: string) => void;
  onOffboardUser: (userId: string, endDate: string, reason: 'voluntary' | 'involuntary') => void;
  teams?: Team[];
  onAddTeam?: (team: Team) => void;
  onDeleteTeam?: (teamId: string) => void;
  onRefreshData?: () => void;
}

export const TeamManager: React.FC<TeamManagerProps> = ({ 
    isOpen, onClose, users, onUpdateUser, onDeleteUser, onOffboardUser,
    teams = TEAMS, onAddTeam, onDeleteTeam, onRefreshData
}) => {
  const [activeTab, setActiveTab] = useState<'members' | 'teams' | 'invites'>('members');

  // Edit User State
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);

  // Offboard User State
  const [offboardTarget, setOffboardTarget] = useState<string | null>(null);
  const [offboardDate, setOffboardDate] = useState(new Date().toISOString().split('T')[0]);
  const [offboardReason, setOffboardReason] = useState<'voluntary' | 'involuntary'>('voluntary');

  // Add Team State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamType, setNewTeamType] = useState<'rd' | 'support'>('rd');

  // Invites State
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTeam, setInviteTeam] = useState(teams[0]?.id || '');
  const [inviteRole, setInviteRole] = useState<'user' | 'manager' | 'admin'>('user');
  const [isImporting, setIsImporting] = useState(false);
  
  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View Toggle
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
      if (isOpen && activeTab === 'invites') {
          loadInvites();
      }
  }, [isOpen, activeTab]);

  const loadInvites = async () => {
      const data = await dbService.getInvites();
      setInvites(data);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inviteName || !inviteEmail || !inviteTeam) return;
      
      const res = await dbService.createInvite({
          name: inviteName,
          email: inviteEmail,
          teamId: inviteTeam,
          role: inviteRole,
          createdAt: new Date().toISOString()
      });
      
      if (res.success) {
          setInviteName('');
          setInviteEmail('');
          setInviteRole('user');
          loadInvites();
          onRefreshData?.(); // Refresh parent data
      } else {
          alert("Error creating invite: " + res.error);
      }
  };

  const handleDeleteInvite = async (email: string) => {
      await dbService.deleteInvite(email);
      loadInvites();
      onRefreshData?.(); // Refresh parent data
  };

  const handleCSVImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      
      const reader = new FileReader();
      reader.onload = async (event) => {
          const text = event.target?.result as string;
          if (!text) return;
          
          // Simple CSV Parser: Name,Email,TeamName
          const lines = text.split('\n');
          const dataToImport = [];
          
          for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              if (line.toLowerCase().startsWith('name')) continue; // Skip header

              const parts = line.split(',');
              if (parts.length >= 2) {
                  dataToImport.push({
                      name: parts[0].trim(),
                      email: parts[1].trim(),
                      teamName: parts[2]?.trim() || ''
                  });
              }
          }

          if (dataToImport.length > 0) {
              const res = await dbService.bulkImportInvites(dataToImport);
              alert(res.msg);
              loadInvites();
              onRefreshData?.(); 
          } else {
              alert("No valid rows found in CSV.");
          }
          setIsImporting(false);
          // Clear input
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      
      reader.readAsText(file);
  };

  const downloadTemplate = () => {
      const csvContent = "data:text/csv;charset=utf-8,Name,Email,Team Name\nJohn Doe,john.doe@jjech.com,Rifle Team";
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "roster_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const handleUpdate = () => {
    if (editingUser) {
        onUpdateUser(editingUser);
        setEditingUser(null);
        onRefreshData?.();
    }
  };

  const handleOffboardSubmit = () => {
      if (offboardTarget) {
          onOffboardUser(offboardTarget, offboardDate, offboardReason);
          setOffboardTarget(null);
          onRefreshData?.();
      }
  };

  const handleDeleteUser = () => {
      if (editingUser && onDeleteUser) {
          if (confirm(`Are you sure you want to PERMANENTLY delete the profile for ${editingUser.name}? This cannot be undone.`)) {
              onDeleteUser(editingUser.id);
              setEditingUser(null);
              onRefreshData?.();
          }
      }
  };

  const handleCreateTeam = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTeamName || !onAddTeam) return;
      const teamId = 't_' + newTeamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      onAddTeam({ id: teamId, name: newTeamName, type: newTeamType });
      setNewTeamName('');
      onRefreshData?.();
  };

  const handleDeleteTeamWrapper = (id: string) => {
      onDeleteTeam?.(id);
      onRefreshData?.();
  };

  // Group users
  const activeUsers = users.filter(u => u.status === 'active' || u.status === 'pending');
  const unassignedUsers = activeUsers.filter(u => !u.teamId || u.teamId === 'unassigned' || !teams.some(t => t.id === u.teamId));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans text-left">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden transition-colors">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-900">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Manage Organization</h2>
            <div className="flex p-1 bg-gray-200 dark:bg-slate-700 rounded-lg">
                <button onClick={() => setActiveTab('members')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'members' ? 'bg-white dark:bg-slate-600 text-indigo-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>Members</button>
                <button onClick={() => setActiveTab('teams')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'teams' ? 'bg-white dark:bg-slate-600 text-indigo-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>Teams</button>
                <button onClick={() => setActiveTab('invites')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'invites' ? 'bg-white dark:bg-slate-600 text-indigo-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>Pending Invites</button>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* MEMBERS TAB */}
          {activeTab === 'members' && (
            <>
                {/* Left Panel */}
                <div className="w-full md:w-1/3 bg-gray-50 dark:bg-slate-800/50 p-6 border-r border-gray-100 dark:border-slate-700 overflow-y-auto">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4 flex items-center gap-2">
                    <Info size={16} className="text-indigo-600 dark:text-indigo-400" /> How to Onboard
                    </h3>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">Users cannot be manually created here. They must sign in themselves.</p>
                        <ol className="list-decimal list-inside text-sm text-gray-600 dark:text-gray-300 space-y-2">
                            <li>Ask the team member to visit the app URL.</li>
                            <li>They enter their work email (e.g. <strong>@jjech.com</strong>, <strong>@palmettostatearmory.com</strong>, <strong>@advanced-armament.com</strong>).</li>
                            <li>They click the Magic Link in their inbox.</li>
                        </ol>
                        <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-lg text-xs text-indigo-800 dark:text-indigo-300">
                            <strong>Tip:</strong> Use the <b>Pending Invites</b> tab to pre-assign teams.
                        </div>
                    </div>
                </div>

                {/* Right Panel */}
                <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-white dark:bg-slate-900 relative">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">Current Roster</h3>
                        <button onClick={() => setShowInactive(!showInactive)} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{showInactive ? 'Hide Past Employees' : 'Show Past Employees'}</button>
                    </div>
                    <div className="space-y-6 mb-8">
                        {/* UNASSIGNED */}
                        {unassignedUsers.length > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden shadow-sm mb-6">
                                <div className="bg-amber-100 dark:bg-amber-900/30 px-4 py-2 border-b border-amber-200 dark:border-amber-800 flex justify-between items-center">
                                    <span className="font-bold text-amber-800 dark:text-amber-200 text-sm flex items-center gap-2"><UserX size={16} /> Unassigned Members</span>
                                    <span className="text-xs bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full text-amber-700 dark:text-amber-300 font-bold">{unassignedUsers.length} Action Needed</span>
                                </div>
                                <div className="divide-y divide-amber-100 dark:divide-amber-800/30">
                                    {unassignedUsers.map(u => (
                                        <div key={u.id} className="px-4 py-3 flex items-center justify-between group hover:bg-amber-100/50 dark:hover:bg-amber-900/20">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-200 flex items-center justify-center text-xs font-bold border border-amber-300 dark:border-amber-700">{u.name.charAt(0)}</div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                                        {u.name}
                                                        {u.status === 'pending' && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Pending</span>}
                                                        {u.role === 'manager' && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Shield size={8}/>Mgr</span>}
                                                        {u.role === 'admin' && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Shield size={8}/>Admin</span>}
                                                    </div>
                                                    <div className="text-xs text-amber-600 dark:text-amber-400">{u.email}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                                <button onClick={() => setEditingUser(u)} className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2"><Edit2 size={16} /></button>
                                                <button onClick={() => setOffboardTarget(u.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-2"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* TEAMS */}
                        {teams.map(team => {
                            const teamUsers = activeUsers.filter(u => u.teamId === team.id);
                            if (teamUsers.length === 0) return null;
                            return (
                                <div key={team.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
                                    <div className="bg-gray-50 dark:bg-slate-800/80 px-4 py-2 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                                        <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm">{team.name} <span className="text-[10px] text-gray-400 font-mono ml-2">{team.id}</span></span>
                                        <span className="text-xs bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-2 py-0.5 rounded-full text-gray-500 dark:text-gray-300">{teamUsers.length}</span>
                                    </div>
                                    <div className="divide-y divide-gray-100 dark:divide-slate-700">
                                        {teamUsers.map(u => (
                                            <div key={u.id} className="px-4 py-3 flex items-center justify-between group hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-xs font-bold border border-indigo-200 dark:border-indigo-800">{u.name.charAt(0)}</div>
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                                            {u.name}
                                                            {u.status === 'pending' && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Pending</span>}
                                                            {u.role === 'manager' && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Shield size={8}/>Mgr</span>}
                                                            {u.role === 'admin' && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Shield size={8}/>Admin</span>}
                                                        </div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                                    <button onClick={() => setEditingUser(u)} className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2"><Edit2 size={16} /></button>
                                                    <button onClick={() => setOffboardTarget(u.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-2"><Trash2 size={16} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </>
          )}

          {/* TEAMS TAB */}
          {activeTab === 'teams' && (
             <>
                <div className="w-full md:w-1/3 bg-gray-50 dark:bg-slate-800/50 p-6 border-r border-gray-100 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4 flex items-center gap-2"><Users size={16}/> Create New Team</h3>
                    <form onSubmit={handleCreateTeam} className="space-y-4">
                        <input type="text" required value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm outline-none" placeholder="Team Name" />
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setNewTeamType('rd')} className={`px-3 py-2 rounded-lg text-sm border ${newTeamType === 'rd' ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600'}`}>R&D</button>
                            <button type="button" onClick={() => setNewTeamType('support')} className={`px-3 py-2 rounded-lg text-sm border ${newTeamType === 'support' ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600'}`}>Support</button>
                        </div>
                        <button type="submit" disabled={!onAddTeam} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-indigo-700 flex items-center justify-center gap-2"><Plus size={16} /> Create</button>
                    </form>
                </div>
                <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-white dark:bg-slate-900">
                     <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-6">Active Teams</h3>
                     <div className="grid grid-cols-1 gap-3">
                        {[...teams].sort((a, b) => a.name.localeCompare(b.name)).map(team => (
                            <div key={team.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${team.type === 'rd' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}><Briefcase size={20} /></div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-gray-800 dark:text-white">{team.name}</h4>
                                            <span className="text-[10px] text-gray-400 font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{team.id}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{team.type === 'rd' ? 'R&D' : 'Support'}</div>
                                    </div>
                                </div>
                                {onDeleteTeam && <button onClick={() => { if (confirm(`Delete ${team.name}?`)) handleDeleteTeamWrapper(team.id); }} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={18} /></button>}
                            </div>
                        ))}
                     </div>
                </div>
             </>
          )}

          {/* PENDING INVITES TAB */}
          {activeTab === 'invites' && (
              <>
                <div className="w-full md:w-1/3 bg-gray-50 dark:bg-slate-800/50 p-6 border-r border-gray-100 dark:border-slate-700 overflow-y-auto">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4 flex items-center gap-2"><Mail size={16}/> Invite New Member</h3>
                    <form onSubmit={handleCreateInvite} className="space-y-4">
                        <input type="text" required value={inviteName} onChange={e => setInviteName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm outline-none" placeholder="Full Name" />
                        <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm outline-none" placeholder="Email" />
                        <select value={inviteTeam} onChange={e => setInviteTeam(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm outline-none">
                            {teams.map(t => <option key={t.id} value={t.id} className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">{t.name}</option>)}
                        </select>
                        <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm outline-none">
                            <option value="user" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">User (Engineer)</option>
                            <option value="manager" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">Manager</option>
                            <option value="admin" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">Admin</option>
                        </select>
                        <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-indigo-700 flex items-center justify-center gap-2"><Plus size={16} /> Pre-provision User</button>
                    </form>
                    
                    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-700">
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Bulk Import Users</h4>
                        <div className="space-y-3">
                            
                            <div className="flex gap-2">
                                <button 
                                    onClick={downloadTemplate}
                                    className="flex-1 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-1"
                                >
                                    <FileSpreadsheet size={14}/> Template
                                </button>
                                <button 
                                    onClick={handleCSVImportClick}
                                    disabled={isImporting}
                                    className="flex-1 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-1"
                                >
                                    <Upload size={14}/> Import CSV
                                </button>
                                <input 
                                    type="file" 
                                    accept=".csv"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-white dark:bg-slate-900">
                     <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-6">Pending Invites</h3>
                     <div className="space-y-3">
                         {invites.length === 0 && <p className="text-gray-500 text-sm">No pending invites.</p>}
                         {invites.map(invite => (
                             <div key={invite.email} className="flex justify-between items-center p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                 <div>
                                     <div className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                         {invite.name}
                                         {invite.role === 'manager' && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Mgr</span>}
                                         {invite.role === 'admin' && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Admin</span>}
                                     </div>
                                     <div className="text-xs text-gray-500 dark:text-gray-400">{invite.email} • {teams.find(t => t.id === invite.teamId)?.name}</div>
                                 </div>
                                 <button onClick={() => handleDeleteInvite(invite.email)} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={16}/></button>
                             </div>
                         ))}
                     </div>
                </div>
              </>
          )}

          {/* Modals */}
          {offboardTarget && (
             <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-20 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">Offboard Employee</h3>
                    <div className="bg-gray-50 dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 space-y-4">
                            <input type="date" className="w-full p-2 rounded border dark:bg-slate-700 dark:text-white" value={offboardDate} onChange={(e) => setOffboardDate(e.target.value)} />
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setOffboardReason('voluntary')} className={`py-2 rounded border text-sm font-medium ${offboardReason === 'voluntary' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-700 dark:text-gray-300'}`}>Voluntary</button>
                                <button onClick={() => setOffboardReason('involuntary')} className={`py-2 rounded border text-sm font-medium ${offboardReason === 'involuntary' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-700 dark:text-gray-300'}`}>Involuntary</button>
                            </div>
                    </div>
                    <div className="flex gap-3"><button onClick={() => setOffboardTarget(null)} className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 rounded-xl">Cancel</button><button onClick={handleOffboardSubmit} className="flex-1 py-3 bg-red-600 text-white rounded-xl">Confirm</button></div>
                </div>
             </div>
          )}
          {editingUser && (
             <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-20 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">Edit Team Member</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Full Name</label>
                            <input type="text" className="w-full p-3 rounded-lg border dark:bg-slate-700 dark:text-white" value={editingUser.name} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
                            <input type="email" className="w-full p-3 rounded-lg border dark:bg-slate-700 dark:text-white" value={editingUser.email} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Team</label>
                            <select className="w-full p-3 rounded-lg border dark:bg-slate-700 dark:text-white" value={editingUser.teamId} onChange={(e) => setEditingUser({ ...editingUser, teamId: e.target.value })}>
                                <option value="" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">Unassigned</option>
                                {teams.map(t => <option key={t.id} value={t.id} className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Role</label>
                            <select 
                                className="w-full p-3 rounded-lg border dark:bg-slate-700 dark:text-white" 
                                value={editingUser.role || 'user'} 
                                onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as 'user' | 'manager' | 'admin' })}
                            >
                                <option value="user" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">User (Engineer)</option>
                                <option value="manager" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">Manager (Team Lead)</option>
                                <option value="admin" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">Administrator</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-4 justify-between items-center">
                         {onDeleteUser && <button onClick={handleDeleteUser} className="text-red-500 hover:bg-red-50 px-4 py-3 rounded-xl font-medium text-sm flex items-center gap-2"><Trash2 size={16} /> Delete Profile</button>}
                        <div className="flex gap-3 flex-1 justify-end"><button onClick={() => setEditingUser(null)} className="px-6 py-3 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl">Cancel</button><button onClick={handleUpdate} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 flex items-center gap-2"><Check size={18} /> Save</button></div>
                    </div>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
