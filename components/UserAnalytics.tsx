
import React, { useState, useEffect, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  BarChart, Bar
} from 'recharts';
import { generateMockUserHistory } from '@/services/mockData';
import { TrendingUp, Calendar, ChevronRight, ArrowLeft, Loader2, Layers, Filter } from 'lucide-react';
import { PROJECTS } from '@/constants';
import { Category } from '@/types';
import { dbService } from '@/services/dbService';
import { isSupabaseConfigured } from '../services/supabaseClient';

// Formatting helper
const formatTooltip = (value: number, name: string) => [`${value.toFixed(2)} hrs`, name];

const COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#ec4899', '#6366f1', '#14b8a6', '#84cc16', '#f97316'
];

type ViewLevel = 'overview' | 'category' | 'project';
type TimeRange = '3M' | 'YTD' | '1Y' | 'ALL';

interface DrillState {
  level: ViewLevel;
  category?: Category;
  projectId?: string;
  projectName?: string;
}

interface UserAnalyticsProps {
    userId: string;
}

// Maps data keys to Category Enums
const KEY_MAP: Record<string, Category> = {
  rd: Category.RD,
  support: Category.RD_SUPPORT,
  mfg: Category.MFG_SUPPORT
};

export const UserAnalytics: React.FC<UserAnalyticsProps> = ({ userId }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillState, setDrillState] = useState<DrillState>({ level: 'overview' });
  const [timeRange, setTimeRange] = useState<TimeRange>('3M');

  useEffect(() => {
    const fetchData = async () => {
        setLoading(true);
        if (isSupabaseConfigured() && userId) {
            // Fetch real data from DB
            const realData = await dbService.getAnalyticsData('user', userId);
            setData(realData);
        } else {
            // Fallback to mock
            setData(generateMockUserHistory());
        }
        setLoading(false);
    };

    fetchData();
  }, [userId]);

  // Filter Data based on Time Range
  const filteredData = useMemo(() => {
    if (timeRange === 'ALL') return data;
    
    const len = data.length;
    // Data is sorted by year then week in dbService
    if (timeRange === '3M') return data.slice(Math.max(0, len - 13)); // Last 13 weeks
    if (timeRange === '1Y') return data.slice(Math.max(0, len - 52)); // Last 52 weeks
    if (timeRange === 'YTD') {
        const currentYear = new Date().getFullYear();
        return data.filter(d => d.year === currentYear);
    }
    return data;
  }, [data, timeRange]);


  // 1. Determine which series to show based on drill level
  const chartSeries = useMemo(() => {
    if (drillState.level === 'overview') {
      return [
        { key: 'rd', name: 'R&D', color: '#8b5cf6', category: Category.RD },
        { key: 'support', name: 'R&D Support', color: '#3b82f6', category: Category.RD_SUPPORT },
        { key: 'mfg', name: 'MFG Support', color: '#10b981', category: Category.MFG_SUPPORT },
      ];
    }

    if (drillState.level === 'category' && drillState.category) {
      // Find all projects in this category that actually have data
      const categoryProjects = PROJECTS.filter(p => p.category === drillState.category);
      
      // Filter out projects with 0 hours to keep chart clean
      const activeCategoryProjects = categoryProjects.filter(p => {
        return filteredData.some(d => (Number(d[p.id]) || 0) > 0);
      });

      return activeCategoryProjects.map((p, index) => ({
        key: p.id,
        name: p.name,
        color: COLORS[index % COLORS.length],
        projectId: p.id
      }));
    }

    if (drillState.level === 'project' && drillState.projectId) {
      return [{
        key: drillState.projectId,
        name: drillState.projectName || 'Project',
        color: '#8b5cf6' // Single focus color
      }];
    }

    return [];
  }, [drillState, filteredData]);

  // 2. Determine Project Trends Series (for the detailed stacked bar chart)
  const projectTrendSeries = useMemo(() => {
    // Identify all projects that have data > 0 across any week
    const usedProjectIds = new Set<string>();
    filteredData.forEach(week => {
       PROJECTS.forEach(p => {
            if (Number(week[p.id]) > 0) usedProjectIds.add(p.id);
       });
    });
    
    return PROJECTS
       .filter(p => usedProjectIds.has(p.id))
       .map((p, index) => ({
            key: p.id,
            name: p.name,
            color: COLORS[index % COLORS.length]
       }));

 }, [filteredData]);

  // 3. Handle Click Events on Chart Areas
  const handleAreaClick = (dataKey: string) => {
    if (drillState.level === 'overview') {
      const category = KEY_MAP[dataKey];
      if (category) {
        setDrillState({ level: 'category', category });
      }
    } else if (drillState.level === 'category') {
      const project = PROJECTS.find(p => p.id === dataKey);
      if (project) {
        setDrillState({ 
          level: 'project', 
          category: drillState.category, 
          projectId: project.id, 
          projectName: project.name 
        });
      }
    }
  };

  // 4. Navigation Helpers
  const goUp = () => {
    if (drillState.level === 'project') {
      setDrillState({ level: 'category', category: drillState.category });
    } else {
      setDrillState({ level: 'overview' });
    }
  };

  const goToOverview = () => setDrillState({ level: 'overview' });

  if (loading) {
      return (
          <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="animate-spin text-purple-600 dark:text-purple-400" size={32} />
          </div>
      );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 pb-32 font-sans transition-colors">
      
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <TrendingUp className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">My Work Trends</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Review your historical focus areas.</p>
              </div>
            </div>
            
            {/* Time Range Selector */}
            <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
                {(['3M', 'YTD', '1Y', 'ALL'] as TimeRange[]).map((range) => (
                    <button
                        key={range}
                        onClick={() => setTimeRange(range)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${timeRange === range ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    >
                        {range}
                    </button>
                ))}
            </div>
        </div>

        {/* Breadcrumb Bar */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-sm overflow-x-auto min-h-[46px]">
          <button 
            onClick={goToOverview}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${drillState.level === 'overview' ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
          >
            Overview
          </button>
          
          {drillState.category && (
            <>
              <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
              <button 
                 onClick={() => setDrillState({ level: 'category', category: drillState.category })}
                 className={`px-3 py-1.5 rounded-md font-medium transition-colors ${drillState.level === 'category' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                {drillState.category}
              </button>
            </>
          )}

          {drillState.projectId && (
            <>
              <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
              <span className="px-3 py-1.5 rounded-md font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                {drillState.projectName}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Main Interactive Chart (Category Breakdown) */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 relative transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
               {drillState.level === 'overview' ? 'Category Distribution' : drillState.level === 'category' ? `${drillState.category} Breakdown` : drillState.projectName}
               <span className="text-xs font-normal text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">Hrs / Week</span>
            </h3>

            <div className="flex items-center gap-3">
                {drillState.level !== 'project' && (
                   <span className="text-xs text-slate-400 font-medium animate-pulse hidden sm:inline-block">Click chart to drill down</span>
                )}
                
                {drillState.level !== 'overview' && (
                    <button 
                        onClick={goUp}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md shadow-sm text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-200 dark:hover:border-purple-500 transition-all"
                    >
                       <ArrowLeft size={14} />
                       Up a Level
                    </button>
                )}
            </div>
          </div>
          
          {filteredData.length === 0 ? (
             <div className="h-96 w-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                 <p>No historical data available for this range.</p>
             </div>
          ) : (
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                   {/* Gradients for Overview level */}
                   <linearGradient id="grad_rd" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient>
                   <linearGradient id="grad_support" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                   <linearGradient id="grad_mfg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                </defs>
                
                <XAxis dataKey="name" tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.3} />
                <Tooltip 
                  formatter={formatTooltip}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Legend 
                    iconType="circle" 
                    wrapperStyle={{ paddingTop: '20px' }} 
                    formatter={(value) => <span className="text-slate-600 dark:text-slate-300 font-medium ml-1">{value}</span>}
                />
                
                {chartSeries.map((series) => (
                  <Area 
                    key={series.key}
                    type="monotone" 
                    dataKey={series.key} 
                    name={series.name} 
                    stackId="1" 
                    stroke={series.color} 
                    fill={
                        drillState.level === 'overview' 
                        ? `url(#grad_${series.key})` 
                        : series.color
                    } 
                    fillOpacity={drillState.level === 'overview' ? 1 : 0.6}
                    strokeWidth={2}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    className={drillState.level !== 'project' ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
                    onClick={() => handleAreaClick(series.key)}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        {/* Detailed Project Trends (Stacked Bar) */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
           <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Layers className="text-slate-400" size={18} />
                    Project Distribution
                </h3>
            </div>
            {filteredData.length === 0 ? (
                 <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl">No project data available.</div>
            ) : (
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={filteredData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.3} />
                            <XAxis dataKey="name" tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
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
                                    stackId="1" 
                                    fill={series.color} 
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>

        {/* Leave History Bar Chart (Independent) */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
           <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Calendar className="text-slate-400" size={18} />
                Leave Trends
            </h3>
          </div>
           {filteredData.length === 0 ? (
             <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl">No leave data available.</div>
           ) : (
           <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.3} />
                <XAxis dataKey="name" tick={{fontSize: 12, fill: '#94a3b8'}} stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <Tooltip 
                    formatter={formatTooltip}
                    cursor={{fill: 'rgba(148, 163, 184, 0.1)'}}
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} 
                />
                <Bar dataKey="leave" name="Hours Off" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
           )}
        </div>
      </div>
    </div>
  );
};
