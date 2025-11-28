
import React, { useState, useEffect } from 'react';
import { dbService } from '@/services/dbService';
import { Project, TimeEntry, OrgUser, Category } from '@/types';
import { X, Save, AlertTriangle, ChevronLeft, ChevronRight, Calculator, Loader2 } from 'lucide-react';
import { PROJECTS as DEFAULT_PROJECTS, LEAVE_PROJECTS } from '@/constants';

interface AdminTimesheetEditorProps {
  isOpen: boolean;
  onClose: () => void;
  user: OrgUser | null;
}

export const AdminTimesheetEditor: React.FC<AdminTimesheetEditorProps> = ({ isOpen, onClose, user }) => {
  const [week, setWeek] = useState<number>(getISOWeek(new Date()));
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Data State
  const [entries, setEntries] = useState<Record<string, TimeEntry>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(40);

  // Load Data when User/Week changes
  useEffect(() => {
    if (isOpen && user) {
        loadData();
    }
  }, [isOpen, user, week, year]);

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);
    
    // 1. Fetch Projects
    const dbProjects = await dbService.getProjects();
    setProjects(dbProjects);

    // 2. Fetch Timesheet
    const dbEntries = await dbService.getTimesheet(user.id, year, week);
    
    // 3. Initialize Entries (Merge DB entries with empty state for active projects to show them)
    // We infer the Total Capacity from the data if possible, else default to 40
    let calculatedCapacity = 40;
    
    // Simple heuristic: If sum of hours > 0 and sum of % > 0, cap = hours / (%/100)
    let sumHours = 0;
    let sumPct = 0;
    Object.values(dbEntries).forEach(e => {
        if (!LEAVE_PROJECTS.some(lp => lp.id === e.projectId)) {
            sumHours += e.hours;
            sumPct += e.percentage;
        }
    });
    
    if (sumHours > 0 && sumPct > 0) {
        calculatedCapacity = Math.round(sumHours / (sumPct / 100));
    }

    setTotalCapacity(calculatedCapacity);
    setEntries(dbEntries);
    setIsLoading(false);
  };

  const handleEntryChange = (projectId: string, field: 'percentage' | 'days', value: number) => {
    setEntries(prev => {
        const newEntries = { ...prev };
        const currentEntry = newEntries[projectId] || { projectId, percentage: 0, hours: 0, days: 0 };
        
        const isLeave = LEAVE_PROJECTS.some(lp => lp.id === projectId);

        if (isLeave && field === 'days') {
            newEntries[projectId] = {
                ...currentEntry,
                days: value,
                hours: value * 8
            };
        } else if (!isLeave && field === 'percentage') {
             newEntries[projectId] = {
                ...currentEntry,
                percentage: value,
                // Recalculate hours immediately based on current Capacity - Leave
                // We'll do a full recalc pass below
            };
        }

        // Recalculate all work hours based on new State
        // 1. Calculate Leave Hours
        let totalLeave = 0;
        LEAVE_PROJECTS.forEach(lp => {
            if (newEntries[lp.id]) totalLeave += newEntries[lp.id].hours;
        });

        const availableWorkHours = Math.max(0, totalCapacity - totalLeave);

        // 2. Update Work Hours
        Object.keys(newEntries).forEach(pid => {
            if (!LEAVE_PROJECTS.some(lp => lp.id === pid)) {
                newEntries[pid].hours = (newEntries[pid].percentage / 100) * availableWorkHours;
            }
        });

        return newEntries;
    });
  };

  const handleSave = async () => {
      if (!user) return;
      setIsSaving(true);
      
      const res = await dbService.saveTimesheet(user.id, year, week, entries);
      
      setIsSaving(false);
      
      if (res.success) {
          onClose(); 
          alert("Timesheet corrected successfully.");
      } else {
          // Explicitly show the error message from the DB service (e.g. RLS policy violation)
          alert(`Error Saving: ${res.error}\n\nYou likely need to run the SQL script to allow Admins to overwrite timesheets.`);
      }
  };

  // Metrics
  const totalPct = (Object.values(entries) as TimeEntry[])
    .filter(e => !LEAVE_PROJECTS.some(lp => lp.id === e.projectId))
    .reduce((sum, e) => sum + e.percentage, 0);
    
  const totalHours = (Object.values(entries) as TimeEntry[]).reduce((sum, e) => sum + e.hours, 0);

  // Combine Projects for Dropdown/List
  const allAvailableProjects = [...projects, ...LEAVE_PROJECTS];
  
  // Helper to add a row if missing
  const ensureEntry = (projectId: string) => {
     if (!entries[projectId]) {
         setEntries(prev => ({
             ...prev,
             [projectId]: { projectId, percentage: 0, hours: 0, days: 0 }
         }));
     }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden transition-colors">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-900">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Calculator size={24} className="text-indigo-600 dark:text-indigo-400"/>
                Timesheet Editor
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Correcting inputs for <span className="font-bold text-gray-800 dark:text-white">{user.name}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-wrap items-center gap-6 justify-between transition-colors">
            <div className="flex items-center gap-4">
                <div className="flex items-center bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                    <button onClick={() => setWeek(w => w > 1 ? w - 1 : 52)} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded shadow-sm text-gray-700 dark:text-gray-200"><ChevronLeft size={16}/></button>
                    <span className="px-3 font-mono font-bold text-gray-700 dark:text-white">W{week}</span>
                    <button onClick={() => setWeek(w => w < 52 ? w + 1 : 1)} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded shadow-sm text-gray-700 dark:text-gray-200"><ChevronRight size={16}/></button>
                </div>
                <div className="flex items-center bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                    <button onClick={() => setYear(y => y - 1)} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded shadow-sm text-gray-700 dark:text-gray-200"><ChevronLeft size={16}/></button>
                    <span className="px-3 font-mono font-bold text-gray-700 dark:text-white">{year}</span>
                    <button onClick={() => setYear(y => y + 1)} className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded shadow-sm text-gray-700 dark:text-gray-200"><ChevronRight size={16}/></button>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Total Capacity</label>
                <input 
                    type="number" 
                    value={totalCapacity}
                    onChange={(e) => setTotalCapacity(Number(e.target.value))}
                    className="w-16 p-2 border border-gray-300 dark:border-slate-600 rounded font-bold text-center focus:ring-indigo-500 dark:bg-slate-700 dark:text-white"
                />
            </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-slate-900/50">
            {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500"/></div>
            ) : (
                <div className="space-y-6">
                    {/* Add Project Dropdown */}
                    <div className="flex gap-2">
                        <select 
                            className="flex-1 p-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                            onChange={(e) => {
                                if (e.target.value) ensureEntry(e.target.value);
                                e.target.value = '';
                            }}
                        >
                            <option value="" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">+ Add Project to Timesheet...</option>
                            {allAvailableProjects.map(p => (
                                <option key={p.id} value={p.id} className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white">{p.name} ({p.category})</option>
                            ))}
                        </select>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-4 py-3">Project</th>
                                    <th className="px-4 py-3">Category</th>
                                    <th className="px-4 py-3 w-32 text-center">Input</th>
                                    <th className="px-4 py-3 w-24 text-right">Hours</th>
                                    <th className="px-4 py-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {(Object.values(entries) as TimeEntry[]).map(entry => {
                                    const project = allAvailableProjects.find(p => p.id === entry.projectId);
                                    if (!project) return null;
                                    const isLeave = project.category === Category.LEAVE;

                                    return (
                                        <tr key={entry.projectId} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{project.name}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase ${getCategoryStyle(project.category)}`}>
                                                    {project.category}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {isLeave ? (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <input 
                                                            type="number"
                                                            step="0.5"
                                                            className="w-16 p-1 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded text-center font-bold"
                                                            value={entry.days || 0}
                                                            onChange={(e) => handleEntryChange(entry.projectId, 'days', Number(e.target.value))}
                                                        />
                                                        <span className="text-xs text-gray-400">Days</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <input 
                                                            type="number"
                                                            className="w-16 p-1 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded text-center font-bold"
                                                            value={entry.percentage || 0}
                                                            onChange={(e) => handleEntryChange(entry.projectId, 'percentage', Number(e.target.value))}
                                                        />
                                                        <span className="text-xs text-gray-400">%</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-300">
                                                {entry.hours.toFixed(1)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button 
                                                    onClick={() => {
                                                        const newEntries = { ...entries };
                                                        delete newEntries[entry.projectId];
                                                        setEntries(newEntries);
                                                    }}
                                                    className="text-gray-300 hover:text-red-500"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-gray-50 dark:bg-slate-900 font-bold text-gray-900 dark:text-white border-t border-gray-200 dark:border-slate-700">
                                <tr>
                                    <td colSpan={2} className="px-4 py-3 text-right">Totals:</td>
                                    <td className={`px-4 py-3 text-center ${totalPct !== 100 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-500'}`}>
                                        {totalPct}%
                                    </td>
                                    <td className="px-4 py-3 text-right">{totalHours.toFixed(1)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-between items-center transition-colors">
             <div className="flex items-center gap-2 text-sm">
                {totalPct !== 100 && (
                    <span className="text-amber-600 dark:text-amber-500 font-bold flex items-center gap-1">
                        <AlertTriangle size={16}/> Warning: Total allocation is not 100%
                    </span>
                )}
             </div>
             <div className="flex gap-3">
                 <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                 <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md flex items-center gap-2 disabled:opacity-50"
                 >
                    {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                    Save Corrections
                 </button>
             </div>
        </div>
      </div>
    </div>
  );
};

// Helper
const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const getCategoryStyle = (cat: Category) => {
    switch(cat) {
      case Category.RD: return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800';
      case Category.RD_SUPPORT: return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800';
      case Category.MFG_SUPPORT: return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800';
      case Category.LEAVE: return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800';
      default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600';
    }
};
