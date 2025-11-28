import React, { useState } from 'react';
import { PROJECTS } from '@/constants';
import { Project } from '@/types';

interface ProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  preferredProjectIds: string[];
  onSave: (ids: string[]) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ isOpen, onClose, preferredProjectIds, onSave }) => {
  const [selected, setSelected] = useState<string[]>(preferredProjectIds);

  if (!isOpen) return null;

  const toggleProject = (id: string) => {
    setSelected(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const categories = Array.from(new Set(PROJECTS.map(p => p.category)));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Manage Your Projects</h2>
          <p className="text-sm text-gray-500 mt-1">Select the projects you actively work on to declutter your dashboard.</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {categories.map(cat => (
            <div key={cat} className="mb-6">
              <h3 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-3 sticky top-0 bg-white py-2">{cat}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PROJECTS.filter(p => p.category === cat).map(project => (
                  <label key={project.id} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${selected.includes(project.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input 
                      type="checkbox" 
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      checked={selected.includes(project.id)}
                      onChange={() => toggleProject(project.id)}
                    />
                    <span className="ml-3 text-sm font-medium text-gray-700">{project.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:text-gray-800">Cancel</button>
          <button 
            onClick={() => { onSave(selected); onClose(); }}
            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
