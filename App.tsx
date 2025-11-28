
import React, { useState, useEffect, useRef } from 'react';
import { UserDashboard } from './components/UserDashboard';
import { AdminAnalytics } from './components/AdminAnalytics';
import { UserAnalytics } from './components/UserAnalytics';
import { DEFAULT_USER_PROJECTS } from './constants';
import { User } from './types';
import { dbService } from './services/dbService';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { LayoutDashboard, PieChart, LineChart, LogOut, ShieldCheck, Loader2, Send, Moon, Sun, Lock, Mail, RefreshCw, Users } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  
  // Auth Mode State
  const [authMode, setAuthMode] = useState<'magic' | 'password'>('magic');
  const [showResetModal, setShowResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Navigation State
  const [activeTab, setActiveTab] = useState<'timesheet' | 'trends' | 'admin' | 'manager'>('timesheet');
  
  // App State
  const [preferredProjects, setPreferredProjects] = useState<string[]>([]);
  
  // Dark Mode State
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Ref to track current user ID to prevent redundant fetches
  const currentUserIdRef = useRef<string | null>(null);

  // Toggle Dark Mode Class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Safety: Global Loading Timeout
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoading) {
        timer = setTimeout(() => {
            console.warn("Global loading timeout hit. Forcing UI render.");
            setIsLoading(false);
            // Force clean state if stuck
            if (!currentUserIdRef.current) {
                localStorage.removeItem('sb-access-token');
                localStorage.removeItem('sb-refresh-token');
            }
        }, 10000); 
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Centralized User Loading Logic
  const loadUserProfile = async (userId: string, userEmail: string) => {
    if (currentUserIdRef.current === userId) {
        setIsLoading(false);
        return;
    }

    setIsLoading(true);

    try {
        const profile = await dbService.ensureUserProfile({
            id: userId,
            email: userEmail
        });
        
        if (profile) {
            setUser(profile);
            currentUserIdRef.current = profile.id;
            setPreferredProjects(profile.preferredProjects);
            
            // Set default tab based on role
            if (profile.role === 'admin') setActiveTab('admin');
            else if (profile.role === 'manager') setActiveTab('manager');
            else setActiveTab('timesheet');
        } else {
            console.error("Profile creation failed (likely domain restriction). Signing out.");
            alert("Access Denied: You must use a corporate email address (@jjech.com, @palmettostatearmory.com, @advanced-armament.com).");
            await supabase?.auth.signOut();
            setUser(null);
            currentUserIdRef.current = null;
        }
    } catch (e) {
        console.error("Error loading profile:", e);
    } finally {
        setIsLoading(false);
    }
  };

  // 1. Auth Initialization
  useEffect(() => {
    if (!isSupabaseConfigured()) {
        setIsLoading(false);
        return;
    }

    // Check if we are in a redirect flow (Magic Link or Reset Password) based on URL hash
    // If these exist, we SKIP the standard session check and let the listener handle it.
    const isRedirectFlow = window.location.hash && (
        window.location.hash.includes('type=recovery') || 
        window.location.hash.includes('access_token')
    );

    const initAuth = async () => {
        try {
            const { data: { session }, error } = await supabase!.auth.getSession();
            if (error) throw error;
            
            if (session?.user) {
                await loadUserProfile(session.user.id, session.user.email!);
            } else {
                setIsLoading(false);
            }
        } catch (e) {
            console.warn("Session check failed, clearing local storage.", e);
            localStorage.removeItem('sb-access-token');
            localStorage.removeItem('sb-refresh-token');
            setIsLoading(false);
        }
    };

    if (!isRedirectFlow) {
        initAuth();
    } else {
        // If redirecting, stay loading until the event fires
        setIsLoading(true);
    }

    const { data: authListener } = supabase!.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth Event:", event);
        
        if (event === 'PASSWORD_RECOVERY') {
            setShowResetModal(true);
            setIsLoading(false);
        } else if (event === 'SIGNED_IN' && session?.user) {
            if (!showResetModal) {
                const hashRecovery = window.location.hash.includes('type=recovery');
                if (hashRecovery) {
                    setShowResetModal(true);
                    setIsLoading(false);
                } else {
                    await loadUserProfile(session.user.id, session.user.email!);
                }
            }
        } else if (event === 'SIGNED_OUT') {
            setUser(null);
            currentUserIdRef.current = null;
            setActiveTab('timesheet');
            setIsLoading(false);
        }
    });

    return () => {
        authListener.subscription.unsubscribe();
    };
  }, []);

  // Helper to validate domain
  const isValidDomain = (email: string) => {
    const allowedDomains = ['jjech.com', 'palmettostatearmory.com', 'advanced-armament.com'];
    const domain = email.toLowerCase().split('@')[1];
    return allowedDomains.includes(domain);
  };

  const handleMagicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    if (!isValidDomain(email)) {
        alert("Access Restricted: Please use your work email (@jjech.com, @palmettostatearmory.com, or @advanced-armament.com).");
        return;
    }

    if (!isSupabaseConfigured()) {
        mockLogin();
        return;
    }

    setLoginStatus('sending');
    const { error } = await supabase!.auth.signInWithOtp({
        email: email,
        options: {
            emailRedirectTo: window.location.origin
        }
    });

    if (error) {
        console.error('Login error:', error);
        setLoginStatus('error');
    } else {
        setLoginStatus('sent');
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !password) return;
      
      if (!isValidDomain(email)) {
        alert("Access Restricted: Please use your work email (@jjech.com, @palmettostatearmory.com, or @advanced-armament.com).");
        return;
      }

      if (!isSupabaseConfigured()) {
          mockLogin();
          return;
      }

      setLoginStatus('sending');
      const { error } = await supabase!.auth.signInWithPassword({
          email,
          password
      });

      if (error) {
          alert("Login Failed: " + error.message);
          setLoginStatus('idle');
          setIsLoading(false); 
      } else {
          setLoginStatus('idle');
          // Force reload logic
          const { data: { session } } = await supabase!.auth.getSession();
          if (session?.user) {
              currentUserIdRef.current = null; // Force refresh
              await loadUserProfile(session.user.id, session.user.email!);
          }
      }
  };

  const handleForgotPassword = async () => {
      if (!email) {
          alert("Please enter your email address in the field above first.");
          return;
      }
      if (!isValidDomain(email)) {
        alert("Access Restricted: Please use your work email.");
        return;
      }

      setLoginStatus('sending');
      const { error } = await supabase!.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin
      });

      if (error) {
          alert("Error: " + error.message);
      } else {
          alert("Password reset link sent! Check your email.");
      }
      setLoginStatus('idle');
  };

  const handleUpdatePassword = async () => {
      if (!newPassword) return;
      const { error } = await supabase!.auth.updateUser({ password: newPassword });
      if (error) {
          alert("Error updating password: " + error.message);
      } else {
          alert("Password updated successfully!");
          setShowResetModal(false);
          setNewPassword('');
          window.history.replaceState(null, '', window.location.pathname);
          
          const { data: { session } } = await supabase!.auth.getSession();
          if (session?.user) {
              await loadUserProfile(session.user.id, session.user.email!);
          }
      }
  };

  const mockLogin = () => {
    const emailLower = email.toLowerCase();
    const isAdmin = emailLower.startsWith('thomas.victa');
    
    const mockUser: User = {
        id: 'u_demo_' + Date.now(),
        email: email,
        name: email.split('@')[0],
        role: isAdmin ? 'admin' : 'user',
        preferredProjects: DEFAULT_USER_PROJECTS
    };
    setUser(mockUser);
    setPreferredProjects(mockUser.preferredProjects);
    if (isAdmin) setActiveTab('admin');
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
        await supabase!.auth.signOut();
    }
    setUser(null);
    currentUserIdRef.current = null;
    setLoginStatus('idle');
    setEmail('');
    setPassword('');
  };

  const handleUpdatePreferred = async (newIds: string[]) => {
      setPreferredProjects(newIds);
      if (user && isSupabaseConfigured()) {
          await dbService.updatePreferredProjects(user.id, newIds);
      }
  };

  if (isLoading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 transition-colors">
              <Loader2 className="animate-spin text-indigo-600 dark:text-indigo-400" size={48} />
          </div>
      );
  }

  if (showResetModal) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 p-4 font-sans">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 dark:border-slate-700">
                  <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600 dark:text-indigo-400">
                          <RefreshCw size={32} />
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Update Password</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Set a new password for your account.</p>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                          <input 
                              type="password" 
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="Enter new password"
                          />
                      </div>
                      <button 
                          onClick={handleUpdatePassword}
                          className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors"
                      >
                          Set Password
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-900 p-4 font-sans transition-colors">
        <div className="absolute top-4 right-4">
             <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-slate-800 transition-colors"
             >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
             </button>
        </div>

        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 dark:border-slate-700 transition-colors">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mx-auto mb-4 text-indigo-600 dark:text-indigo-400">
               <PieChart size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NPD Time Tracker</h1>
          </div>

          {!isSupabaseConfigured() && (
             <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400 text-xs p-3 rounded-lg flex items-start gap-2">
                <ShieldCheck size={14} className="mt-0.5 flex-shrink-0" />
                <p>
                  <strong>Demo Mode:</strong> No database configured. Enter any email to simulate login. 
                  Use <code>thomas.victa@jjech.com</code> to simulate Admin access.
                </p>
             </div>
          )}

          <div className="flex p-1 bg-gray-100 dark:bg-slate-700 rounded-xl mb-6">
              <button 
                onClick={() => { setAuthMode('magic'); setLoginStatus('idle'); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${authMode === 'magic' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                  <Mail size={16} /> Magic Link
              </button>
              <button 
                onClick={() => { setAuthMode('password'); setLoginStatus('idle'); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${authMode === 'password' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                  <Lock size={16} /> Password
              </button>
          </div>

          {authMode === 'magic' ? (
              loginStatus === 'sent' ? (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 text-center animate-in fade-in zoom-in-95">
                      <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Send size={20} />
                      </div>
                      <h3 className="font-bold text-emerald-900 dark:text-emerald-400 text-lg">Check your email</h3>
                      <p className="text-emerald-700 dark:text-emerald-500 text-sm mt-1">We sent a magic login link to <strong>{email}</strong>.</p>
                      <button 
                        onClick={() => setLoginStatus('idle')}
                        className="mt-6 text-sm text-emerald-600 dark:text-emerald-400 font-semibold hover:text-emerald-800 dark:hover:text-emerald-300 underline"
                      >
                        Try a different email
                      </button>
                  </div>
              ) : (
                <form onSubmit={handleMagicLogin} className="space-y-4">
                    <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enter your work email to login</label>
                    <input 
                        type="email" 
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400"
                        placeholder="name@company.com"
                    />
                    </div>
                    <button 
                    type="submit" 
                    disabled={loginStatus === 'sending'}
                    className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                    {loginStatus === 'sending' && <Loader2 className="animate-spin" size={18} />}
                    {loginStatus === 'sending' ? 'Sending Link...' : 'Send Login Link'}
                    </button>
                </form>
              )
          ) : (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Work Email</label>
                    <input 
                        type="email" 
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400"
                        placeholder="name@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                    <input 
                        type="password" 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        placeholder="••••••••"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={loginStatus === 'sending'}
                    className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loginStatus === 'sending' && <Loader2 className="animate-spin" size={18} />}
                    {loginStatus === 'sending' ? 'Logging in...' : 'Sign In'}
                  </button>
                  
                  <div className="text-center pt-2">
                      <button 
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                      >
                          First time? Or forgot password? <br/> Click here to set it.
                      </button>
                  </div>
              </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 font-sans transition-colors duration-300">
      <nav className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm transition-colors">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="flex justify-between h-16">
             <div className="flex">
               <div className="flex-shrink-0 flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('timesheet')}>
                 <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
                    <PieChart size={20} />
                 </div>
                 <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">PSA NPD Time Tracker</span>
               </div>
               
               <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                 <button
                   onClick={() => setActiveTab('timesheet')}
                   className={`${activeTab === 'timesheet' ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full transition-all`}
                 >
                   <LayoutDashboard className={`w-4 h-4 mr-2 ${activeTab === 'timesheet' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                   My Timesheet
                 </button>

                 <button
                   onClick={() => setActiveTab('trends')}
                   className={`${activeTab === 'trends' ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full transition-all`}
                 >
                   <LineChart className={`w-4 h-4 mr-2 ${activeTab === 'trends' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                   My Trends
                 </button>

                 {user.role === 'admin' && (
                   <button
                     onClick={() => setActiveTab('admin')}
                     className={`${activeTab === 'admin' ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full transition-all`}
                   >
                     <ShieldCheck className={`w-4 h-4 mr-2 ${activeTab === 'admin' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                     Admin Dashboard
                   </button>
                 )}

                 {user.role === 'manager' && (
                   <button
                     onClick={() => setActiveTab('manager')}
                     className={`${activeTab === 'manager' ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full transition-all`}
                   >
                     <Users className={`w-4 h-4 mr-2 ${activeTab === 'manager' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                     Team Dashboard
                   </button>
                 )}
               </div>
             </div>
             
             <div className="flex items-center ml-6 gap-4">
                 <button
                    onClick={() => setDarkMode(!darkMode)}
                    className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-colors"
                    title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                 >
                    {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                 </button>

                <div className="hidden md:flex flex-col items-end">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{user.name}</span>
                    <span className="text-xs text-gray-400">
                        {user.role === 'admin' ? 'Administrator' : user.role === 'manager' ? 'Manager' : 'Engineer'}
                    </span>
                </div>
                <div className="h-8 w-px bg-gray-200 dark:bg-slate-700 hidden md:block"></div>
                <button 
                    onClick={handleLogout} 
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                    title="Sign Out"
                >
                  <LogOut size={20} />
                </button>
             </div>
           </div>
         </div>
         
         <div className="sm:hidden border-t border-gray-100 dark:border-slate-800 flex justify-around p-2 bg-gray-50 dark:bg-slate-900">
            <button onClick={() => setActiveTab('timesheet')} className={`p-2 rounded ${activeTab === 'timesheet' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}><LayoutDashboard size={20}/></button>
            <button onClick={() => setActiveTab('trends')} className={`p-2 rounded ${activeTab === 'trends' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}><LineChart size={20}/></button>
            {user.role === 'admin' && (
                <button onClick={() => setActiveTab('admin')} className={`p-2 rounded ${activeTab === 'admin' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}><ShieldCheck size={20}/></button>
            )}
            {user.role === 'manager' && (
                <button onClick={() => setActiveTab('manager')} className={`p-2 rounded ${activeTab === 'manager' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}><Users size={20}/></button>
            )}
         </div>
      </nav>

      <main>
        {activeTab === 'timesheet' && (
            <UserDashboard 
                userId={user.id} 
                preferredProjects={preferredProjects}
                onUpdatePreferred={handleUpdatePreferred}
            />
        )}
        {activeTab === 'trends' && (
            <UserAnalytics userId={user.id} />
        )}
        {activeTab === 'admin' && user.role === 'admin' && (
            <AdminAnalytics currentUserRole="admin" />
        )}
        {activeTab === 'manager' && user.role === 'manager' && (
            <AdminAnalytics currentUserRole="manager" currentUserTeamId={user.teamId} />
        )}
      </main>
    </div>
  );
}
