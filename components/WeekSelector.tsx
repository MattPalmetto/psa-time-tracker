
import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface WeekSelectorProps {
  currentWeek: number;
  currentYear: number;
  onChange: (week: number, year: number) => void;
}

export const WeekSelector: React.FC<WeekSelectorProps> = ({ currentWeek, currentYear, onChange }) => {
  
  const getWeekDateRange = (week: number, year: number) => {
    const simpleDate = new Date(year, 0, 1 + (week - 1) * 7);
    const start = new Date(simpleDate.setDate(simpleDate.getDate() - simpleDate.getDay() + 1));
    const end = new Date(start);
    end.setDate(end.getDate() + 4); // Friday
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const handlePrev = () => {
    let newWeek = currentWeek - 1;
    let newYear = currentYear;
    if (newWeek < 1) {
      newWeek = 52;
      newYear -= 1;
    }
    onChange(newWeek, newYear);
  };

  const handleNext = () => {
    let newWeek = currentWeek + 1;
    let newYear = currentYear;
    if (newWeek > 52) {
      newWeek = 1;
      newYear += 1;
    }
    onChange(newWeek, newYear);
  };

  return (
    <div className="flex items-center space-x-4 bg-white dark:bg-slate-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
      <button onClick={handlePrev} className="p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
        <ChevronLeft size={20} />
      </button>
      <div className="flex flex-col items-center min-w-[140px]">
        <span className="text-lg font-bold text-gray-800 dark:text-white">Week {currentWeek}</span>
        <span className="text-xs text-gray-500 dark:text-slate-400 font-medium flex items-center gap-1">
          <Calendar size={10} />
          {currentYear} • {getWeekDateRange(currentWeek, currentYear)}
        </span>
      </div>
      <button onClick={handleNext} className="p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
        <ChevronRight size={20} />
      </button>
    </div>
  );
};
