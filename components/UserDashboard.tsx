
import React, { useState, useEffect, useMemo } from 'react';
import { Project, TimeEntry, Category } from '@/types';
import { PROJECTS as DEFAULT_PROJECTS, LEAVE_PROJECTS } from '@/constants';
import { WeekSelector } from './WeekSelector';
import { Settings, AlertCircle, CheckCircle, Clock, AlertTriangle, CalendarDays, Briefcase, Coffee, Loader2, Copy } from 'lucide-react';
import { ProjectManager } from './ProjectManager';
import { dbService } from '@/services/dbService';

interface UserDashboardProps {
  userId: string;
  preferredProjects: string[];
  onUpdatePreferred: (ids: string[]) => void;
}

// Helper to get current ISO week
const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Helper for category colors (Slack-like palette) - Adjusted for dark mode
const getCategoryStyle = (cat: Category) => {
  switch(cat) {
    case Category.RD: return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
    case Category.RD_SUPPORT: return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    case Category.MFG_SUPPORT: return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
    default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600';
  }
};

export const UserDashboard: React.FC<UserDashboardProps> = ({ userId, preferredProjects, onUpdatePreferred }) => {
  const today = new Date();
  const [week, setWeek] = useState(getISOWeek(today));
  const [year, setYear] = useState(today.getFullYear());
  
  const [entries, setEntries] = useState<Record<string, TimeEntry>>({});
  const [weeklyHoursTarget, setWeeklyHoursTarget] = useState(40);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmittedData, setHasSubmittedData] = useState(false);
  const [prefilledFromPrev, setPrefilledFromPrev] = useState(false);
  
  // Dynamic Projects State
  const [activeProjectsList, setActiveProjectsList] = useState<Project[]>(DEFAULT_PROJECTS);

  // Determine if editing is allowed based on the 2-week rule
  const isFutureLocked = useMemo(() => {
    const currentW = getISOWeek(new Date());
    const currentY = new Date().getFullYear();
    const absoluteCurrent = currentY * 52 + currentW;
    const absoluteSelected = year * 52 + week;
    return absoluteSelected > absoluteCurrent + 2;
  }, [week, year]);

  const isWorkLocked = isFutureLocked;

  // Load Projects and Data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setSaveStatus('idle');
      setPrefilledFromPrev(false);
      
      // 1. Fetch available projects (so user sees new ones)
      const fetchedProjects = await dbService.getProjects();
      setActiveProjectsList(fetchedProjects);

      // Load User Pref for hours
      const savedHours = localStorage.getItem(`engtrack_hours_${userId}`);
      let currentHoursTarget = savedHours ? parseFloat(savedHours) : 40;
      setWeeklyHoursTarget(currentHoursTarget);

      // 2. Load Timesheet for CURRENT week
      const dbEntries = await dbService.getTimesheet(userId, year, week);
      
      if (Object.keys(dbEntries).length > 0) {
        // CASE A: Existing Data Found
        setEntries(dbEntries);
        setHasSubmittedData(true);
      } else {
        // CASE B: No Data -> Try to pre-fill from Previous Week
        let prevWeek = week - 1;
        let prevYear = year;
        if (prevWeek < 1) {
            prevWeek = 52;
            prevYear -= 1;
        }

        const prevEntries = await dbService.getTimesheet(userId, prevYear, prevWeek);

        if (Object.keys(prevEntries).length > 0) {
            // Found previous data! Copy Percentages only.
            const newEntries: Record<string, TimeEntry> = {};
            let hasWorkData = false;
            
            // Reconstruct available hours
            const availableWorkHours = currentHoursTarget; // Assuming 0 leave to start

            Object.values(prevEntries).forEach(e => {
                const isLeave = LEAVE_PROJECTS.some(lp => lp.id === e.projectId);
                
                if (isLeave) {
                    // Reset Leave to 0
                    newEntries[e.projectId] = { projectId: e.projectId, percentage: 0, days: 0, hours: 0 };
                } else {
                    // Copy Work Percentage
                    const hours = (e.percentage / 100) * availableWorkHours;
                    newEntries[e.projectId] = { 
                        projectId: e.projectId, 
                        percentage: e.percentage, 
                        days: 0, 
                        hours: hours 
                    };
                    if (e.percentage > 0) hasWorkData = true;
                }
            });

            // Ensure all preferred projects are present in the structure even if 0
            preferredProjects.forEach(pid => {
                if (!newEntries[pid]) {
                     newEntries[pid] = { projectId: pid, percentage: 0, days: 0, hours: 0 };
                }
            });
            LEAVE_PROJECTS.forEach(lp => {
                if (!newEntries[lp.id]) {
                    newEntries[lp.id] = { projectId: lp.id, percentage: 0, days: 0, hours: 0 };
                }
            });

            setEntries(newEntries);
            setHasSubmittedData(false);
            if (hasWorkData) setPrefilledFromPrev(true);

        } else {
            // CASE C: No current OR previous data -> Blank Slate
            const newEntries: Record<string, TimeEntry> = {};
            preferredProjects.forEach(pid => {
                newEntries[pid] = { projectId: pid, percentage: 0, days: 0, hours: 0 };
            });
            LEAVE_PROJECTS.forEach(lp => {
                newEntries[lp.id] = { projectId: lp.id, percentage: 0, days: 0, hours: 0 };
            });
            setEntries(newEntries);
            setHasSubmittedData(false);
        }
      }
      setIsLoading(false);
    };

    loadData();
  }, [week, year, userId]); // Reload when week/year changes

  // Sync entries with preferred projects. 
  useEffect(() => {
     setEntries(prev => {
        const newEntries = { ...prev };
        let hasChanges = false;
        
        // 1. Add new preferred projects
        preferredProjects.forEach(pid => {
            if (!newEntries[pid]) {
                newEntries[pid] = { projectId: pid, percentage: 0, days: 0, hours: 0 };
                hasChanges = true;
            }
        });

        // 2. Zero out removed projects
        Object.keys(newEntries).forEach(pid => {
            const isLeave = LEAVE_PROJECTS.some(lp => lp.id === pid);
            const isPreferred = preferredProjects.includes(pid);
            
            if (!isLeave && !isPreferred) {
                if (newEntries[pid].percentage > 0 || newEntries[pid].hours > 0) {
                    newEntries[pid] = { ...newEntries[pid], percentage: 0, hours: 0 };
                    hasChanges = true;
                }
            }
        });

        return hasChanges ? newEntries : prev;
     });
  }, [preferredProjects]);


  const calculateAvailableWorkHours = (currentEntries: Record<string, TimeEntry>, target: number) => {
    let leaveHours = 0;
    LEAVE_PROJECTS.forEach(lp => {
      if (currentEntries[lp.id]) {
        leaveHours += currentEntries[lp.id].hours;
      }
    });
    return Math.max(0, target - leaveHours);
  };

  const handleTotalHoursChange = (newTotal: number) => {
    setWeeklyHoursTarget(newTotal);
    localStorage.setItem(`engtrack_hours_${userId}`, newTotal.toString());

    setEntries(prev => {
        const newEntries = { ...prev };
        const availableWorkHours = calculateAvailableWorkHours(newEntries, newTotal);
        
        preferredProjects.forEach(pid => {
            const entry = newEntries[pid];
            if (entry) {
                newEntries[pid] = {
                    ...entry,
                    hours: (entry.percentage / 100) * availableWorkHours
                };
            }
        });
        return newEntries;
    });
    setSaveStatus('idle');
  };

  const handleLeaveChange = (projectId: string, days: number) => {
    setEntries(prev => {
      const newEntries = { ...prev };
      
      newEntries[projectId] = {
        ...newEntries[projectId] || { projectId, percentage: 0, days: 0, hours: 0 },
        days: days,
        hours: days * 8
      };

      const availableWorkHours = calculateAvailableWorkHours(newEntries, weeklyHoursTarget);

      preferredProjects.forEach(pid => {
        const entry = newEntries[pid];
        if (entry) {
          newEntries[pid] = {
            ...entry,
            hours: (entry.percentage / 100) * availableWorkHours
          };
        }
      });

      return newEntries;
    });
    setSaveStatus('idle');
  };

  const handleWorkChange = (projectId: string, percentage: number) => {
    setEntries(prev => {
      const newEntries = { ...prev };
      const availableWorkHours = calculateAvailableWorkHours(newEntries, weeklyHoursTarget);

      newEntries[projectId] = {
        ...newEntries[projectId] || { projectId, percentage: 0, days: 0, hours: 0 },
        percentage: percentage,
        hours: (percentage / 100) * availableWorkHours
      };
      
      return newEntries;
    });
    setSaveStatus('idle');
  };

  const calculateTotals = () => {
    let totalHours = 0;
    let leaveHours = 0;
    let workHours = 0;
    let totalPercentage = 0;

    (Object.values(entries) as TimeEntry[]).forEach(e => {
      if (LEAVE_PROJECTS.find(lp => lp.id === e.projectId)) {
        leaveHours += e.hours;
      } else {
        workHours += e.hours;
        if (preferredProjects.includes(e.projectId)) {
            totalPercentage += e.percentage;
        }
      }
    });
    totalHours = leaveHours + workHours;
    return { totalHours, leaveHours, workHours, totalPercentage };
  };

  const { totalHours, leaveHours, totalPercentage } = calculateTotals();
  const availableWorkHours = Math.max(0, weeklyHoursTarget - leaveHours);
  const isAllocationValid = availableWorkHours === 0 || Math.abs(totalPercentage - 100) < 0.1;

  const handleSave = async () => {
    setSaveStatus('saving');
    
    // Save to DB
    await dbService.saveTimesheet(userId, year, week, entries);

    setSaveStatus('saved');
    setHasSubmittedData(true);
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const visibleWorkProjects = preferredProjects
    .map(id => activeProjectsList.find(p => p.id === id))
    .filter((p): p is Project => !!p);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 pb-32 font-sans transition-colors">
      
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
        <WeekSelector currentWeek={week} currentYear={year} onChange={(w, y) => { setWeek(w); setYear(y); setSaveStatus('idle'); }} />
        <button 
          onClick={() => setIsManagerOpen(true)}
          className="group flex items-center text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-purple-300 hover:text-purple-700 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-700 px-4 py-2.5 rounded-lg transition-all shadow-sm"
        >
          <Settings size={16} className="mr-2 group-hover:rotate-45 transition-transform" />
          Customize Projects
        </button>
      </div>

      {/* Notifications */}
      {isWorkLocked && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start text-amber-900 dark:text-amber-300 animate-in fade-in slide-in-from-top-2 shadow-sm">
          <AlertCircle size={20} className="mt-0.5 mr-3 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-medium">You are viewing a future week. Only Leave entries are currently editable.</p>
        </div>
      )}

      {/* Auto-fill Notification */}
      {prefilledFromPrev && !hasSubmittedData && (
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 flex items-start text-indigo-900 dark:text-indigo-300 animate-in fade-in slide-in-from-top-2 shadow-sm">
          <Copy size={20} className="mt-0.5 mr-3 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm font-medium">
             <strong>Baseline Loaded:</strong> To save you time, we've pre-filled your project percentages from last week. Please update and save.
          </p>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden relative transition-colors">
        
        {isLoading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
                <Loader2 className="animate-spin text-purple-600 dark:text-purple-400" size={32} />
            </div>
        )}

        {/* Capacity Header */}
        <div className="bg-slate-50 dark:bg-slate-900 px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 transition-colors">
          <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Briefcase size={20} className="text-purple-600 dark:text-purple-400" />
                {hasSubmittedData ? "What I have already Logged" : "What I worked on this Week"}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Adjust your total hours and allocate effort across projects.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
             {/* Total Hours Input Card */}
             <div className="flex items-center bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm transition-colors">
                <div className="px-3 py-1 flex flex-col border-r border-gray-100 dark:border-slate-700">
                   <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Total Capacity</label>
                   <div className="flex items-center gap-1">
                      <input 
                          type="number" 
                          min="0" 
                          max="168"
                          value={weeklyHoursTarget}
                          onChange={(e) => handleTotalHoursChange(parseFloat(e.target.value) || 0)}
                          className="w-16 text-lg font-bold text-slate-800 dark:text-white bg-transparent border-none p-0 focus:ring-0 outline-none hover:text-purple-700 dark:hover:text-purple-400 transition-colors"
                      />
                      <span className="text-xs font-semibold text-slate-400">hrs</span>
                   </div>
                </div>
                <div className="px-3 py-1 flex flex-col border-r border-gray-100 dark:border-slate-700">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Time Off</label>
                    <div className="text-lg font-bold text-slate-600 dark:text-slate-300">{leaveHours} <span className="text-xs text-slate-400">hrs</span></div>
                </div>
                <div className="px-3 py-1 flex flex-col">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Available</label>
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{availableWorkHours} <span className="text-xs text-purple-300 dark:text-purple-500">hrs</span></div>
                </div>
             </div>

             {/* Allocation Progress */}
             <div className="flex-1 min-w-[200px] flex flex-col justify-center bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm transition-colors">
                 <div className="flex justify-between text-xs mb-1.5 font-semibold">
                    <span className="text-slate-500 dark:text-slate-400">Allocation</span>
                    <span className={`${totalPercentage > 100 ? 'text-red-500' : totalPercentage === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-purple-600 dark:text-purple-400'}`}>{totalPercentage}%</span>
                 </div>
                 <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-500 rounded-full ${totalPercentage > 100 ? 'bg-red-500' : totalPercentage === 100 ? 'bg-emerald-500' : 'bg-purple-500'}`}
                        style={{ width: `${Math.min(100, totalPercentage)}%` }}
                    />
                 </div>
             </div>
          </div>
        </div>
        
        {/* Work Projects */}
        <div className={`p-6 space-y-2 transition-all duration-300 ${isWorkLocked || availableWorkHours === 0 ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
           {visibleWorkProjects.length === 0 ? (
             <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
               <p className="text-slate-500 dark:text-slate-400 mb-4 font-medium">No projects pinned to your dashboard.</p>
               <button onClick={() => setIsManagerOpen(true)} className="text-purple-600 dark:text-purple-400 font-bold hover:text-purple-800 dark:hover:text-purple-300 hover:underline">Customize your view</button>
             </div>
           ) : visibleWorkProjects.map(project => {
             const entry = entries[project.id] || { percentage: 0, hours: 0 };
             return (
               <div key={project.id} className="group bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 rounded-xl p-4 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                 <div className="flex flex-col md:flex-row md:items-center gap-4">
                   
                   {/* Project Name & Category */}
                   <div className="flex-1 min-w-[200px]">
                     <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-slate-800 dark:text-slate-200 text-base">{project.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getCategoryStyle(project.category)} uppercase tracking-wide`}>
                            {project.category}
                        </span>
                     </div>
                     <span className="text-sm text-slate-400 font-medium font-mono group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors">
                        ~{entry.hours.toFixed(1)} hours
                     </span>
                   </div>

                   {/* Slider & Input */}
                   <div className="flex items-center gap-6 flex-[2]">
                       <div className="relative flex-grow h-10 flex items-center">
                          <div className="absolute w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-purple-500 dark:bg-purple-600 rounded-full transition-all duration-150 ease-out shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                              style={{ width: `${entry.percentage}%` }}
                            />
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={entry.percentage || 0}
                            onChange={(e) => handleWorkChange(project.id, parseInt(e.target.value))}
                            className="absolute w-full h-full opacity-0 cursor-pointer"
                          />
                          {/* Custom Thumb Visual */}
                          <div 
                             className="absolute h-5 w-5 bg-white dark:bg-slate-300 border-2 border-purple-500 dark:border-purple-600 rounded-full shadow-md pointer-events-none transition-all duration-150"
                             style={{ left: `calc(${entry.percentage}% - 10px)` }}
                          ></div>
                       </div>

                       <div className="flex-shrink-0 relative group/input">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={entry.percentage || ''}
                              onChange={(e) => handleWorkChange(project.id, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                              className="w-28 pl-3 pr-8 py-2 text-right text-lg font-bold text-slate-700 dark:text-slate-200 bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-purple-500 dark:focus:border-purple-500 outline-none transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-3 text-slate-400 text-sm font-medium">%</span>
                       </div>
                   </div>
                 </div>
               </div>
             );
           })}
        </div>

        {/* Leave Section */}
        <div className="bg-slate-50 dark:bg-slate-900 px-6 py-6 border-t border-slate-200 dark:border-slate-800 transition-colors">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
             <Coffee size={16} className="text-slate-400" />
             Time Off / Leave
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LEAVE_PROJECTS.map(project => (
              <div key={project.id} className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${project.id === 'sick' ? 'bg-red-400 shadow-red-200' : 'bg-emerald-400 shadow-emerald-200'} shadow-lg`}></div>
                  {project.name}
                </label>
                <div className="flex items-center gap-3">
                  {/* Updated Input Container */}
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-1 shadow-sm focus-within:ring-2 focus-within:ring-purple-200 dark:focus-within:ring-purple-900 transition-all">
                     <button 
                        onClick={() => handleLeaveChange(project.id, Math.max(0, (entries[project.id]?.days || 0) - 0.5))}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-600 rounded-md transition-colors"
                     >
                        −
                     </button>
                     <div className="flex flex-col items-center w-12">
                        <input
                            type="number"
                            min="0"
                            max="7"
                            step="0.5"
                            value={entries[project.id]?.days || ''}
                            onChange={(e) => handleLeaveChange(project.id, parseFloat(e.target.value) || 0)}
                            className="w-full text-center font-bold text-slate-900 dark:text-white border-none focus:ring-0 outline-none p-0 text-lg placeholder:text-slate-300 bg-transparent no-spinner"
                            placeholder="0"
                        />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">Days</span>
                     </div>
                     <button 
                        onClick={() => handleLeaveChange(project.id, Math.min(7, (entries[project.id]?.days || 0) + 0.5))}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-600 rounded-md transition-colors"
                     >
                        +
                     </button>
                  </div>
                  <span className="text-slate-400 text-xs font-mono w-12 text-right">
                    {(entries[project.id]?.hours || 0)}h
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sticky Footer Summary */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 shadow-[0_-8px_30px_rgba(0,0,0,0.04)] py-4 px-4 z-20 transition-colors">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Summary Stats */}
          <div className="flex items-center gap-8">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-0.5">Total Logged</span>
              <div className="flex items-baseline gap-1.5">
                <Clock className="text-purple-600 dark:text-purple-400" size={18} />
                <span className={`text-2xl font-bold ${totalHours > weeklyHoursTarget ? 'text-amber-600 dark:text-amber-500' : 'text-slate-900 dark:text-white'}`}>
                  {totalHours.toFixed(1)}
                </span>
                <span className="text-sm font-medium text-slate-400">/ {weeklyHoursTarget}h</span>
              </div>
            </div>
            
            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

            <div className="hidden sm:block">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block mb-0.5">Completion</span>
                <div className={`text-sm font-bold flex items-center gap-1.5 ${isAllocationValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-500'}`}>
                    {isAllocationValid ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
                    {totalPercentage}% Allocated
                </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
             {!isAllocationValid && (
                 <div className="hidden md:flex items-center text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-800">
                    Total allocation must equal 100%
                 </div>
             )}
            <button
                onClick={handleSave}
                disabled={saveStatus === 'saving' || isWorkLocked || !isAllocationValid}
                className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-bold text-white shadow-lg shadow-purple-200 dark:shadow-none transition-all transform active:scale-95 flex items-center justify-center gap-2 min-w-[180px]
                ${saveStatus === 'saved' 
                    ? 'bg-emerald-500 hover:bg-emerald-600' 
                    : !isAllocationValid 
                        ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed text-slate-500 dark:text-slate-400 shadow-none'
                        : 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500'
                } ${isWorkLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {saveStatus === 'saved' ? <CheckCircle size={18}/> : <CalendarDays size={18} className={saveStatus === 'saving' ? 'animate-pulse' : ''} />}
                {saveStatus === 'saved' ? 'Timesheet Saved' : saveStatus === 'saving' ? 'Saving...' : hasSubmittedData ? 'Update Timesheet' : 'Submit Timesheet'}
            </button>
          </div>
        </div>
      </div>

      <ProjectManager 
        isOpen={isManagerOpen} 
        onClose={() => setIsManagerOpen(false)}
        preferredProjectIds={preferredProjects}
        onSave={onUpdatePreferred}
      />
    </div>
  );
};
