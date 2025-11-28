
export enum Category {
  RD = 'R&D',
  RD_SUPPORT = 'R&D Support',
  MFG_SUPPORT = 'MFG Support',
  LEAVE = 'Leave'
}

export interface Project {
  id: string;
  name: string;
  category: Category;
}

export interface TimeEntry {
  projectId: string;
  percentage: number; // 0-100
  days: number; // Only for Leave categories
  hours: number; // Calculated
}

export interface WeekData {
  weekNumber: number;
  year: number;
  entries: TimeEntry[];
  isLocked: boolean;
  submitted: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'manager' | 'admin';
  preferredProjects: string[]; // IDs of visible projects
  teamId?: string; // Needed to know which team they manage
}

export interface AggregatedDataPoint {
  name: string;
  year: number; // Added for filtering
  week: number; // Added for sorting
  rd: number;
  support: number;
  mfg: number;
  leave: number;
  // Allow dynamic keys for individual project hours (e.g., 'vadr': 12.5)
  [key: string]: string | number;
}

export interface Team {
  id: string;
  name: string;
  type: 'rd' | 'support';
}

export interface OrgUser {
  id: string;
  name: string;
  email: string;
  teamId: string;
  role: 'user' | 'manager' | 'admin'; 
  status: 'active' | 'inactive' | 'pending';
  startDate: string;
  endDate?: string;
  leaveReason?: 'voluntary' | 'involuntary';
}

export interface Invite {
    email: string;
    name: string;
    teamId: string;
    role?: 'user' | 'manager' | 'admin';
    createdAt: string;
}

export type ScopeType = 'department' | 'team' | 'user';
