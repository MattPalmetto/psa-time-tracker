
import React, { useState } from 'react';
import { Project, Category } from '@/types';
import { CATEGORY_OPTIONS } from '@/constants';
import { X, Plus, FolderPlus, Tag, Hash, Loader2 } from 'lucide-react';

interface AdminProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onAddProject: (project: Project) => Promise<void>;
}

export const AdminProjectManager: React.FC<AdminProjectManagerProps> = ({ isOpen, onClose, projects, onAddProject }) => {
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCategory, setNewProjectCategory] = useState<Category>(Category.RD);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Auto-generate ID from name
  const generatedId = newProjectName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName) return;

    setIsSubmitting(true);
    await onAddProject({
        id: generatedId,
        name: newProjectName,
        category: newProjectCategory
    });
    setNewProjectName('');
    setIsSubmitting(false);
  };

  // Group existing projects for display
  const groupedProjects = projects.reduce((acc, project) => {
    if (!acc[project.category]) acc[project.category] = [];
    acc[project.category].push(project);
    return acc;
  }, {} as Record<Category, Project[]>);

  const getCategoryStyle = (cat: Category) => {
    switch(cat) {
      case Category.RD: return 'bg-purple-100 text-purple-700';
      case Category.RD_SUPPORT: return 'bg-blue-100 text-blue-700';
      case Category.MFG_SUPPORT: return 'bg-emerald-100 text-emerald-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Manage Projects</h2>
            <p className="text-sm text-gray-500 mt-1">Add new projects or review existing ones.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Left Panel: Add New Project */}
          <div className="w-full md:w-1/3 bg-gray-50 p-6 border-r border-gray-100 overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
              <FolderPlus size={16} className="text-indigo-600" />
              Create Project
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Project Name</label>
                <input 
                  type="text" 
                  required
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="e.g. Project Apollo"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Project ID (Auto-generated)</label>
                <div className="relative">
                  <Hash size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input 
                    type="text" 
                    readOnly
                    value={generatedId}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-500 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                <div className="relative">
                  <Tag size={14} className="absolute left-3 top-3 text-gray-400" />
                  <select 
                    value={newProjectCategory}
                    onChange={e => setNewProjectCategory(e.target.value as Category)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                  >
                    {CATEGORY_OPTIONS.map(cat => (
                        <option key={cat} value={cat} className="bg-white text-gray-900">{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting || !newProjectName}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-sm mt-2 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Add Project
              </button>
            </form>
          </div>

          {/* Right Panel: Project List */}
          <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-white">
             <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Active Projects Library</h3>
             </div>

             <div className="space-y-6">
                {Object.keys(groupedProjects).map((cat) => (
                    <div key={cat} className="space-y-3">
                         <h4 className={`text-xs font-bold px-2 py-1 rounded w-fit uppercase ${getCategoryStyle(cat as Category)}`}>
                             {cat}
                         </h4>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                             {groupedProjects[cat as Category].map(p => (
                                 <div key={p.id} className="border border-gray-200 rounded-lg p-3 flex justify-between items-center hover:border-indigo-200 transition-colors bg-white">
                                     <div>
                                         <div className="font-semibold text-gray-800 text-sm">{p.name}</div>
                                         <div className="text-[10px] text-gray-400 font-mono">{p.id}</div>
                                     </div>
                                 </div>
                             ))}
                         </div>
                    </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
