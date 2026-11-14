import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { subscribeToAuth, logoutAdmin, getInitialAuthSession, AuthSessionResult } from '../services/authService';
import { Login } from './Login';
import { Logo } from './Logo';

export interface AuthContextValue {
  user: User;
  role: 'admin' | 'operator';
  isMasterAdmin: boolean;
  onSignOut: () => Promise<void>;
}

interface AuthGateProps {
  children: (auth: AuthContextValue) => React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [authData, setAuthData] = useState<AuthSessionResult | null>(() => getInitialAuthSession());
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((data) => {
      setAuthData(data);
      setInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await logoutAdmin();
      setAuthData(null);
    } catch (err) {
      console.warn('Sign out error:', err);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 select-none">
        <div className="flex flex-col items-center gap-4">
          <Logo variant="card" className="scale-110" />
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-xs font-mono tracking-wider">
            Verifying Authorized Session...
          </p>
        </div>
      </div>
    );
  }

  if (!authData) {
    return <Login onLoginSuccess={(data) => setAuthData(data)} />;
  }

  return (
    <>
      {children({
        user: authData.user,
        role: authData.role,
        isMasterAdmin: authData.role === 'admin',
        onSignOut: handleSignOut
      })}
    </>
  );
};
export default AuthGate;
