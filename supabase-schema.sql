-- =====================================================
-- PSA NPD Time Tracker - Supabase Database Schema
-- =====================================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- =====================================================

-- 1. TEAMS TABLE
-- Stores engineering teams (R&D teams, support teams, etc.)
CREATE TABLE IF NOT EXISTS public.teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('rd', 'support')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. PROFILES TABLE
-- Stores user profiles (linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'manager', 'admin')),
    team_id TEXT REFERENCES public.teams(id) ON DELETE SET NULL,
    preferred_projects TEXT[] DEFAULT ARRAY['new_dagger', 'project_mgmt', 'testing_guns'],
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    leave_reason TEXT CHECK (leave_reason IN ('voluntary', 'involuntary')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. PROJECTS TABLE
-- Stores available projects that users can log time against
CREATE TABLE IF NOT EXISTS public.projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('R&D', 'R&D Support', 'MFG Support', 'Leave')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TIMESHEETS TABLE
-- Stores time entries for each user/week/project combination
CREATE TABLE IF NOT EXISTS public.timesheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    week_number INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 53),
    project_id TEXT NOT NULL,
    hours DECIMAL(5,2) NOT NULL DEFAULT 0,
    percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, year, week_number, project_id)
);

-- 5. INVITES TABLE
-- Stores pending user invitations (pre-provisioning)
CREATE TABLE IF NOT EXISTS public.invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    team_id TEXT REFERENCES public.teams(id) ON DELETE SET NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'manager', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_team ON public.profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_user ON public.timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_week ON public.timesheets(year, week_number);
CREATE INDEX IF NOT EXISTS idx_timesheets_user_week ON public.timesheets(user_id, year, week_number);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- TEAMS: Everyone can read, only admins can modify
CREATE POLICY "Teams are viewable by everyone" ON public.teams
    FOR SELECT USING (true);

CREATE POLICY "Teams are editable by admins" ON public.teams
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- PROFILES: Users can read all profiles, but only edit their own (admins can edit all)
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile" ON public.profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- PROJECTS: Everyone can read, only admins can modify
CREATE POLICY "Projects are viewable by everyone" ON public.projects
    FOR SELECT USING (true);

CREATE POLICY "Projects are editable by admins" ON public.projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- TIMESHEETS: Users can manage their own, admins can manage all
CREATE POLICY "Users can view own timesheets" ON public.timesheets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins and managers can view all timesheets" ON public.timesheets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Users can insert own timesheets" ON public.timesheets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own timesheets" ON public.timesheets
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own timesheets" ON public.timesheets
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all timesheets" ON public.timesheets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- INVITES: Only admins can manage
CREATE POLICY "Invites viewable by admins" ON public.invites
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Invites viewable during signup" ON public.invites
    FOR SELECT USING (true);

CREATE POLICY "Invites manageable by admins" ON public.invites
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- =====================================================
-- SEED DATA - DEFAULT TEAMS
-- =====================================================

INSERT INTO public.teams (id, name, type) VALUES
    ('t_npd', 'New Product Development', 'rd'),
    ('t_project', 'Project Team', 'rd'),
    ('t_pistol', 'Pistol Team', 'rd'),
    ('t_pistol_sus', 'Pistol Sustaining', 'rd'),
    ('t_rifle', 'Rifle Team', 'rd'),
    ('t_rifle_sus', 'Rifle Sustaining', 'rd'),
    ('t_cad', 'CAD Team', 'rd'),
    ('t_test', 'Test Center', 'support')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- SEED DATA - DEFAULT PROJECTS
-- =====================================================

INSERT INTO public.projects (id, name, category) VALUES
    -- R&D Projects
    ('vadr', 'VADR / MFC', 'R&D'),
    ('x57', 'X5.7', 'R&D'),
    ('shotgun', 'Shotgun', 'R&D'),
    ('new_dagger', 'New Dagger', 'R&D'),
    ('new_rock', 'New Rock', 'R&D'),
    ('new_jakl', 'New JAKL', 'R&D'),
    ('new_ar', 'New AR', 'R&D'),
    ('new_aac', 'New AAC', 'R&D'),
    ('new_ak', 'New AK', 'R&D'),
    ('new_hr', 'New H&R', 'R&D'),
    ('new_dpms', 'New DPMS', 'R&D'),
    ('new_sabre', 'New Sabre', 'R&D'),
    -- R&D Support Projects
    ('dwg_cleanup', 'DWG Cleanup', 'R&D Support'),
    ('project_mgmt', 'Project MGMT', 'R&D Support'),
    ('testing_guns', 'Testing Guns', 'R&D Support'),
    ('testing_ammo', 'Testing Ammo', 'R&D Support'),
    ('training', 'Training', 'R&D Support'),
    ('admin', 'Admin', 'R&D Support'),
    -- MFG Support Projects
    ('dagger_support', 'Dagger Support', 'MFG Support'),
    ('rock_support', 'Rock Support', 'MFG Support'),
    ('ar_support', 'AR Support', 'MFG Support'),
    ('jakl_support', 'JAKL Support', 'MFG Support'),
    ('ak_support', 'AK Support', 'MFG Support'),
    ('sabre_support', 'Sabre Support', 'MFG Support'),
    ('hr_support', 'H&R Support', 'MFG Support'),
    ('ammo_support', 'Ammo Support', 'MFG Support'),
    -- Leave Projects
    ('vacation', 'Vacation', 'Leave'),
    ('sick', 'Sick Leave', 'Leave')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- HELPER FUNCTION: Auto-update updated_at timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to profiles and timesheets
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_timesheets_updated_at ON public.timesheets;
CREATE TRIGGER update_timesheets_updated_at
    BEFORE UPDATE ON public.timesheets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- DONE! Your database is ready.
-- =====================================================
