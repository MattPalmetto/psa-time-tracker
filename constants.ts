

import { Category, Project, Team, OrgUser } from './types';

export const PROJECTS: Project[] = [
  // R&D
  { id: 'vadr', name: 'VADR / MFC', category: Category.RD },
  { id: 'x57', name: 'X5.7', category: Category.RD },
  { id: 'shotgun', name: 'Shotgun', category: Category.RD },
  { id: 'new_dagger', name: 'New Dagger', category: Category.RD },
  { id: 'new_rock', name: 'New Rock', category: Category.RD },
  { id: 'new_jakl', name: 'New JAKL', category: Category.RD },
  { id: 'new_ar', name: 'New AR', category: Category.RD },
  { id: 'new_aac', name: 'New AAC', category: Category.RD },
  { id: 'new_ak', name: 'New AK', category: Category.RD },
  { id: 'new_hr', name: 'New H&R', category: Category.RD },
  { id: 'new_dpms', name: 'New DPMS', category: Category.RD },
  { id: 'new_sabre', name: 'New Sabre', category: Category.RD },
  
  // R&D Support
  { id: 'dwg_cleanup', name: 'DWG Cleanup', category: Category.RD_SUPPORT },
  { id: 'project_mgmt', name: 'Project MGMT', category: Category.RD_SUPPORT },
  { id: 'testing_guns', name: 'Testing Guns', category: Category.RD_SUPPORT },
  { id: 'testing_ammo', name: 'Testing Ammo', category: Category.RD_SUPPORT },
  { id: 'training', name: 'Training', category: Category.RD_SUPPORT },
  { id: 'admin', name: 'Admin', category: Category.RD_SUPPORT },

  // MFG Support
  { id: 'dagger_support', name: 'Dagger Support', category: Category.MFG_SUPPORT },
  { id: 'rock_support', name: 'Rock Support', category: Category.MFG_SUPPORT },
  { id: 'ar_support', name: 'AR Support', category: Category.MFG_SUPPORT },
  { id: 'jakl_support', name: 'JAKL Support', category: Category.MFG_SUPPORT },
  { id: 'ak_support', name: 'AK Support', category: Category.MFG_SUPPORT },
  { id: 'sabre_support', name: 'Sabre Support', category: Category.MFG_SUPPORT },
  { id: 'hr_support', name: 'H&R Support', category: Category.MFG_SUPPORT },
  { id: 'ammo_support', name: 'Ammo Support', category: Category.MFG_SUPPORT },
];

export const CATEGORY_OPTIONS = [Category.RD, Category.RD_SUPPORT, Category.MFG_SUPPORT];

export const LEAVE_PROJECTS: Project[] = [
  { id: 'vacation', name: 'Vacation', category: Category.LEAVE },
  { id: 'sick', name: 'Sick Leave', category: Category.LEAVE },
];

export const DEFAULT_USER_PROJECTS = ['new_dagger', 'project_mgmt', 'testing_guns'];

export const TEAMS: Team[] = [
  { id: 't_npd', name: 'New Product Development', type: 'rd' },
  { id: 't_project', name: 'Project Team', type: 'rd' },
  { id: 't_pistol', name: 'Pistol Team', type: 'rd' },
  { id: 't_pistol_sus', name: 'Pistol Sustaining', type: 'rd' },
  { id: 't_rifle', name: 'Rifle Team', type: 'rd' },
  { id: 't_rifle_sus', name: 'Rifle Sustaining', type: 'rd' },
  { id: 't_cad', name: 'CAD Team', type: 'rd' },
  { id: 't_test', name: 'Test Center', type: 'support' },
];

const startDate = '2023-01-15';

export const MOCK_ORG_USERS: OrgUser[] = [
    // New Product Development (Admin/Directors)
    { id: 'u_tvicta', name: 'Thomas Victa', email: 'thomas.victa@jjech.com', teamId: 't_npd', role: 'admin', status: 'active', startDate },
    { id: 'u_gmirdo', name: 'Gregory Mirdo', email: 'gregory.mirdo@jjech.com', teamId: 't_npd', role: 'admin', status: 'active', startDate },
    { id: 'u_kcollins', name: 'Kevin Collins', email: 'kevin.collins@jjech.com', teamId: 't_npd', role: 'admin', status: 'active', startDate },

    // Project Team (PMs)
    { id: 'u_kfattman', name: 'Kurt Fattman', email: 'kurt.fattman@jjech.com', teamId: 't_project', role: 'manager', status: 'active', startDate },
    { id: 'u_dcrowley', name: 'David Crowley', email: 'david.crowley@jjech.com', teamId: 't_project', role: 'manager', status: 'active', startDate },

    // Pistol Team
    { id: 'u_sgammons', name: 'Scott Gammons', email: 'scott.gammons@jjech.com', teamId: 't_pistol', role: 'user', status: 'active', startDate },
    { id: 'u_mstacey', name: 'Maxwell Stacey', email: 'maxwell.stacey@jjech.com', teamId: 't_pistol', role: 'user', status: 'active', startDate },
    { id: 'u_jshearer', name: 'Jacob Shearer', email: 'jacob.shearer@jjech.com', teamId: 't_pistol', role: 'user', status: 'active', startDate },
    { id: 'u_hhall', name: 'Hunter Hall', email: 'hunter.hall@jjech.com', teamId: 't_pistol', role: 'user', status: 'active', startDate },
    { id: 'u_rkoscelnick', name: 'Rachael Koscelnick', email: 'rachael.koscelnick@jjech.com', teamId: 't_pistol', role: 'user', status: 'active', startDate },

    // Pistol Sustaining
    { id: 'u_jraciti', name: 'John Raciti', email: 'john.raciti@jjech.com', teamId: 't_pistol_sus', role: 'user', status: 'active', startDate },
    { id: 'u_cfusco', name: 'Corey Fusco', email: 'corey.fusco@jjech.com', teamId: 't_pistol_sus', role: 'user', status: 'active', startDate },

    // Rifle Team
    { id: 'u_tboruchowski', name: 'Thaddeus Boruchowski', email: 'thaddeus.boruchowski@jjech.com', teamId: 't_rifle', role: 'user', status: 'active', startDate },
    { id: 'u_jbowles', name: 'Jordan Bowles', email: 'jordan.bowles@jjech.com', teamId: 't_rifle', role: 'user', status: 'active', startDate },
    { id: 'u_bmolinaro', name: 'Brandon Molinaro', email: 'brandon.molinaro@jjech.com', teamId: 't_rifle', role: 'user', status: 'active', startDate },
    { id: 'u_fcrooks', name: 'Forrest Crooks', email: 'forrest.crooks@jjech.com', teamId: 't_rifle', role: 'user', status: 'active', startDate },

    // Rifle Sustaining
    { id: 'u_jmerck', name: 'Justin Merck', email: 'justin.merck@jjech.com', teamId: 't_rifle_sus', role: 'user', status: 'active', startDate },
    { id: 'u_jtippmann', name: 'Jacob Tippmann', email: 'jacob.tippmann@jjech.com', teamId: 't_rifle_sus', role: 'user', status: 'active', startDate },

    // CAD Team
    { id: 'u_ksmith', name: 'Kyle Smith', email: 'kyle.smith@jjech.com', teamId: 't_cad', role: 'user', status: 'active', startDate },
    { id: 'u_mspires', name: 'Marshall Spires', email: 'marshall.spires@jjech.com', teamId: 't_cad', role: 'user', status: 'active', startDate },
    { id: 'u_aemory', name: 'Andrew Emory', email: 'andrew.emory@jjech.com', teamId: 't_cad', role: 'user', status: 'active', startDate },
    { id: 'u_nsargent', name: 'Noah Sargent', email: 'noah.sargent@jjech.com', teamId: 't_cad', role: 'user', status: 'active', startDate },

    // Test Center
    { id: 'u_kseeger', name: 'Karl Seeger', email: 'karl.seeger@jjech.com', teamId: 't_test', role: 'user', status: 'active', startDate },
    { id: 'u_mmeadows', name: 'Matthew Meadows', email: 'matthew.meadows@jjech.com', teamId: 't_test', role: 'user', status: 'active', startDate },
    { id: 'u_kjohnson', name: 'Kelly Johnson', email: 'kelly.johnson@jjech.com', teamId: 't_test', role: 'user', status: 'active', startDate },
    { id: 'u_rschnepple', name: 'Ryan Schnepple', email: 'ryan.schnepple@jjech.com', teamId: 't_test', role: 'user', status: 'active', startDate },
    { id: 'u_flora', name: 'Frank Lora', email: 'frank.lora@jjech.com', teamId: 't_test', role: 'user', status: 'active', startDate },
];