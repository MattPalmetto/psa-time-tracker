import React, { useState, useEffect } from 'react';
import { Team, OrgUser } from '@/types';
import { X, Plus, UserPlus, GripVertical, Save, AlertCircle } from 'lucide-react';
import { dbService } from '@/services/dbService';

interface OrgChartVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  users: OrgUser[];
  onRefreshData: () => void;
}

export const OrgChartVisualizer: React.FC<OrgChartVisualizerProps> = ({ isOpen, onClose, teams, users, onRefreshData }) => {
  const [localUsers, setLocalUsers] = useState<OrgUser[]>(users);
  const [localTeams, setLocalTeams] = useState<Team[]>(teams);
  const [draggedUser, setDraggedUser] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // New Team / User State
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  
  const [isAddingUser, setIsAddingUser] = useState<string | null>(null); // Team ID to add to
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');

  useEffect(() => {
    setLocalUsers(users);
    setLocalTeams(teams);
  }, [users, teams]);

  if (!isOpen) return null;

  // --- Drag & Drop Handlers ---

  const handleDragStart = (e: React.DragEvent, userId: string) => {
    setDraggedUser(userId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetTeamId: string | null) => {
    e.preventDefault();
    if (!draggedUser) return;

    // 1. Snapshot previous state for rollback
    const previousUsers = [...localUsers];

    // 2. Optimistic Update
    const updatedUsers = localUsers.map(u => {
        if (u.id === draggedUser) {
            return { ...u, teamId: targetTeamId || '' };
        }
        return u;
    });
    setLocalUsers(updatedUsers);
    setDraggedUser(null);

    // 3. Persist to DB
    const user = localUsers.find(u => u.id === draggedUser);
    if (user) {
        setIsSaving(true);
        const result = await dbService.updateUserProfile({ ...user, teamId: targetTeamId || '' });
        
        if (!result.success) {
            // Revert if failed
            console.error("Failed to move user:", result.error);
            alert(`Failed to move user: ${result.error || 'User may not exist in database yet, or schema is missing "status" column.'}`);
            setLocalUsers(previousUsers); // Rollback
        } else {
            // Success
            onRefreshData(); // Trigger full refresh in background
        }
        setIsSaving(false);
    }
  };

  // --- Creation Handlers ---

  const handleCreateTeam = async () => {
    if (!newTeamName) return;
    const id = 't_' + newTeamName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newTeam: Team = { id, name: newTeamName, type: 'rd' };
    
    setIsSaving(true);
    await dbService.createTeam(newTeam);
    setNewTeamName('');
    setIsAddingTeam(false);
    onRefreshData();
    setIsSaving(false);
  };

  const handleCreateUser = async (teamId: string) => {
    if (!newUserEmail || !newUserName) return;
    
    // Note: This won't create the user in Auth, but would trigger provisioning logic if we had it.
    // For now, this is a UI stub as requested.
    setIsSaving(true);
    await dbService.preProvisionUser(newUserName, newUserEmail, teamId);
    
    setNewUserEmail('');
    setNewUserName('');
    setIsAddingUser(null);
    onRefreshData();
    setIsSaving(false);
  };

  // Group users by team
  const unassignedUsers = localUsers.filter(u => !u.teamId || u.teamId === 'unassigned' || (u.status === 'active' && !localTeams.find(t => t.id === u.teamId)));
  const getTeamUsers = (teamId: string) => localUsers.filter(u => u.teamId === teamId && u.status === 'active');

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex flex-col overflow-hidden font-sans">
      
      {/* Header */}
      <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center shadow-md z-10">
        <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900">Organization Chart</h2>
            <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                Drag cards to move members
            </div>
            {isSaving && <span className="text-xs font-bold text-indigo-600 animate-pulse flex items-center gap-1"><Save size={14}/> Saving...</span>}
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={() => setIsAddingTeam(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium text-sm"
            >
                <Plus size={16} /> Add Team
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
                <X size={24} />
            </button>
        </div>
      </div>

      {/* Board Canvas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-slate-100 p-6">
        <div className="flex h-full gap-6 min-w-max">
            
            {/* Unassigned Column */}
            <div 
                className="w-72 flex-shrink-0 flex flex-col bg-slate-200/50 rounded-xl border-2 border-dashed border-slate-300"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, null)}
            >
                <div className="p-4 border-b border-slate-300/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-500 uppercase tracking-wider text-sm">Unassigned</h3>
                    <span className="bg-slate-300 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{unassignedUsers.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {unassignedUsers.map(user => (
                        <UserCard key={user.id} user={user} onDragStart={handleDragStart} />
                    ))}
                    {unassignedUsers.length === 0 && (
                        <div className="text-center py-10 text-slate-400 text-sm">No unassigned members</div>
                    )}
                </div>
            </div>

            {/* Team Columns */}
            {localTeams.sort((a,b) => a.name.localeCompare(b.name)).map(team => (
                <div 
                    key={team.id}
                    className="w-80 flex-shrink-0 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 hover:border-indigo-300 transition-colors"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, team.id)}
                >
                    <div className={`p-4 border-b border-gray-100 rounded-t-xl ${team.type === 'rd' ? 'bg-indigo-50/50' : 'bg-blue-50/50'}`}>
                        <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-gray-900 text-sm">{team.name}</h3>
                            <span className="text-[10px] text-gray-400 font-mono">{team.id}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${team.type === 'rd' ? 'text-indigo-600 bg-indigo-100' : 'text-blue-600 bg-blue-100'}`}>
                                {team.type === 'rd' ? 'R&D' : 'Support'}
                            </span>
                            <span className="text-xs text-gray-500 font-medium">{getTeamUsers(team.id).length} Members</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/30">
                        {getTeamUsers(team.id).map(user => (
                            <UserCard key={user.id} user={user} onDragStart={handleDragStart} />
                        ))}
                        
                        {/* Add User Input Area */}
                        {isAddingUser === team.id ? (
                            <div className="bg-white p-3 rounded-lg border border-indigo-200 shadow-lg animate-in fade-in zoom-in-95">
                                <input 
                                    autoFocus
                                    className="w-full mb-2 px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="Full Name"
                                    value={newUserName}
                                    onChange={e => setNewUserName(e.target.value)}
                                />
                                <input 
                                    className="w-full mb-2 px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="email@company.com"
                                    value={newUserEmail}
                                    onChange={e => setNewUserEmail(e.target.value)}
                                />
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleCreateUser(team.id)}
                                        className="flex-1 bg-indigo-600 text-white text-xs py-1.5 rounded font-medium hover:bg-indigo-700"
                                    >
                                        Add
                                    </button>
                                    <button 
                                        onClick={() => setIsAddingUser(null)}
                                        className="flex-1 bg-gray-100 text-gray-600 text-xs py-1.5 rounded font-medium hover:bg-gray-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setIsAddingUser(team.id)}
                                className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs font-medium text-gray-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-white transition-all flex items-center justify-center gap-1"
                            >
                                <UserPlus size={14} /> Add Member
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {/* Create Team Column */}
            {isAddingTeam && (
                <div className="w-72 flex-shrink-0 p-4 bg-white rounded-xl shadow-lg border-2 border-indigo-500 animate-in slide-in-from-right-4 h-fit">
                    <h3 className="font-bold text-gray-900 mb-4">New Team</h3>
                    <input 
                        autoFocus
                        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        placeholder="Team Name"
                        value={newTeamName}
                        onChange={e => setNewTeamName(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <button 
                            onClick={handleCreateTeam}
                            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                        >
                            Create
                        </button>
                        <button 
                            onClick={() => setIsAddingTeam(false)}
                            className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

const UserCard: React.FC<{ user: OrgUser; onDragStart: (e: React.DragEvent, id: string) => void }> = ({ user, onDragStart }) => {
    return (
        <div 
            draggable 
            onDragStart={(e) => onDragStart(e, user.id)}
            className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-grab active:cursor-grabbing group transition-all"
        >
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {user.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">{user.name}</h4>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
                <div className="ml-auto text-gray-300 group-hover:text-gray-500">
                    <GripVertical size={16} />
                </div>
            </div>
        </div>
    );
};