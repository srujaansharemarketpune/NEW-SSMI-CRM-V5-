import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import {
  User,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import {
  auth,
  PRIMARY_ADMIN_EMAIL,
  SECONDARY_USER_EMAIL,
  ALLOWED_EMAILS,
  SESSION_LIMIT_MS,
  SESSION_START_TIME_KEY,
  SESSION_USER_EMAIL_KEY,
  evaluateSessionExpiry,
  savePersistedAdminSession,
  loadPersistedAdminSession,
  clearPersistedAdminSession,
  testConnection,
  formatFirebaseAuthError
} from '../services/firebase';

import { getInitialAuthSession, loginWithGoogle } from '../services/authService';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authError: string;
  setAuthError: (msg: string) => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const initial = getInitialAuthSession();
    return initial ? initial.user : null;
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const timerRef = useRef<number | null>(null);

  const clearSessionTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleLogout = async () => {
    clearSessionTimer();
    clearPersistedAdminSession(true);
    try {
      await signOut(auth);
    } catch {
      // ignore signOut warning
    }
    setUser(null);
  };

  const startOneHourTimer = (remainingMs: number) => {
    clearSessionTimer();
    timerRef.current = window.setTimeout(async () => {
      console.warn('Session expired after 1 hour.');
      await handleLogout();
      setAuthError('Your 1-hour session has expired. Please sign in again.');
    }, Math.max(0, remainingMs));
  };

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(
        auth,
        async (currentUser) => {
          try {
            if (currentUser) {
              const normalizedEmail = (currentUser.email || '').toLowerCase().trim();

              if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
                clearPersistedAdminSession(true);
                try {
                  await signOut(auth);
                } catch {
                  // ignore
                }
                setUser(null);
                setAuthError('Access Denied: Your Google account is not authorized for Srujaan Share Market Institute Management System.');
                setLoading(false);
                return;
              }

              const expiryCheck = evaluateSessionExpiry(normalizedEmail);
              if (!expiryCheck.valid) {
                await handleLogout();
                setAuthError(
                  expiryCheck.expired
                    ? 'Your 1-hour session has expired. Please sign in again.'
                    : 'Access Denied: Your account is not authorized to access this system.'
                );
                setLoading(false);
                return;
              }

              if (normalizedEmail === SECONDARY_USER_EMAIL && expiryCheck.remainingMs !== null) {
                startOneHourTimer(expiryCheck.remainingMs);
              } else {
                clearSessionTimer();
              }

              savePersistedAdminSession(currentUser, false);
              setUser(currentUser);
              setAuthError('');
              testConnection();
            } else {
              const initial = getInitialAuthSession();
              if (initial) {
                setUser(initial.user);
                setAuthError('');
                clearSessionTimer();
              } else {
                const cached = loadPersistedAdminSession();
                if (cached) {
                  const normalizedCached = (cached.email || '').toLowerCase().trim();
                  const expiryCheck = evaluateSessionExpiry(normalizedCached);
                  if (expiryCheck.valid) {
                    if (normalizedCached === SECONDARY_USER_EMAIL && expiryCheck.remainingMs !== null) {
                      startOneHourTimer(expiryCheck.remainingMs);
                    }
                    setUser({
                      uid: cached.uid,
                      email: cached.email,
                      displayName: cached.displayName,
                      photoURL: cached.photoURL || null,
                      emailVerified: true
                    } as unknown as User);
                  } else {
                    clearPersistedAdminSession();
                    setUser(null);
                    if (expiryCheck.expired) {
                      setAuthError('Your 1-hour session has expired. Please sign in again.');
                    }
                  }
                } else {
                  clearPersistedAdminSession(false);
                  setUser(null);
                  clearSessionTimer();
                }
              }
            }
          } catch (cbErr) {
            console.warn('[AuthContext] Auth callback notice:', cbErr);
            const fallback = getInitialAuthSession();
            setUser(fallback ? fallback.user : null);
          }
          setLoading(false);
        },
        (authErr) => {
          console.warn('[AuthContext] Auth listener notice:', authErr);
          const fallback = getInitialAuthSession();
          setUser(fallback ? fallback.user : null);
          setLoading(false);
        }
      );
    } catch (initErr) {
      console.warn('[AuthContext] Auth init notice:', initErr);
      const fallback = getInitialAuthSession();
      setUser(fallback ? fallback.user : null);
      setLoading(false);
    }

    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
      clearSessionTimer();
    };
  }, []);

  const handleLoginWithGoogle = async () => {
    setAuthError('');
    setLoading(true);

    try {
      const authResult = await loginWithGoogle();
      if (authResult) {
        setUser(authResult.user);
        setAuthError('');
      }
    } catch (err: any) {
      const formatted = formatFirebaseAuthError(err);
      if (formatted.isAccessDenied) {
        setAuthError('Access Denied: Your Google account is not authorized for Srujaan Share Market Institute Management System.');
      } else if (err?.code !== 'auth/popup-closed-by-user') {
        setAuthError(formatted.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        setAuthError,
        loginWithGoogle: handleLoginWithGoogle,
        logout: handleLogout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
