import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import {
  loginWithGoogle,
  checkRedirectResult,
  ensureBrowserSessionPersistence,
  AuthSessionResult
} from '../services/authService';
import {
  formatFirebaseAuthError,
  FormattedFirebaseAuthError
} from '../services/firebase';
import { Lock, ShieldCheck, AlertCircle, RefreshCw, Copy, Check, X } from 'lucide-react';

interface LoginProps {
  onLoginSuccess?: (authData: AuthSessionResult) => void;
  initialAuthError?: FormattedFirebaseAuthError | null;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, initialAuthError = null }) => {
  const [loading, setLoading] = useState(false);
  const [redirectingNotice, setRedirectingNotice] = useState(false);
  const [authError, setAuthError] = useState<FormattedFirebaseAuthError | null>(initialAuthError);
  const [copiedHost, setCopiedHost] = useState(false);
  const onLoginSuccessRef = useRef(onLoginSuccess);
  onLoginSuccessRef.current = onLoginSuccess;

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  useEffect(() => {
    if (initialAuthError) {
      setAuthError(initialAuthError);
    }
  }, [initialAuthError]);

  // Configure browserSessionPersistence eagerly & handle any redirect result on mount safely
  useEffect(() => {
    let mounted = true;
    try {
      void ensureBrowserSessionPersistence();
    } catch {
      // ignore startup persistence notice
    }

    checkRedirectResult()
      .then((authData) => {
        if (mounted && authData && onLoginSuccessRef.current) {
          onLoginSuccessRef.current(authData);
        }
      })
      .catch((err: any) => {
        if (!mounted) return;
        console.warn('[Login Startup Redirect Error]:', err);
        setAuthError(formatFirebaseAuthError(err));
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Trigger signInWithPopup synchronously inside onClick (zero awaits beforehand)
  const handleGoogleSignIn = () => {
    if (loading) return;
    setLoading(true);
    setRedirectingNotice(false);
    setAuthError(null);

    loginWithGoogle()
      .then((authData) => {
        if (authData === null) {
          // Automatic signInWithRedirect fallback triggered
          setRedirectingNotice(true);
          return;
        }
        if (onLoginSuccessRef.current && authData) {
          onLoginSuccessRef.current(authData);
        }
      })
      .catch((err: any) => {
        console.warn('[Login Google Sign-In Error]:', err);
        setAuthError(formatFirebaseAuthError(err));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleCopyHostname = async () => {
    if (!currentHostname || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(currentHostname);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-[#0a1122] to-slate-950 flex flex-col items-center justify-center px-4 py-8 sm:px-6 text-slate-100 select-none relative overflow-hidden">
      {/* Subtle Financial Backdrop Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[420px] bg-blue-600/12 rounded-full blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 w-[420px] h-[320px] bg-emerald-500/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 left-1/4 w-[320px] h-[320px] bg-amber-500/5 rounded-full blur-[110px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Elevated Glassmorphic Institutional Card */}
        <div className="bg-slate-900/85 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-8 sm:p-10 shadow-2xl shadow-black/60 relative overflow-hidden">
          {/* Subtle Top Institutional Hairline Accent */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500/80 via-emerald-400/70 to-amber-400/80" />

          {/* Top Branding: Official Logo, Full Title, Tagline */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="mb-5 p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 shadow-lg shadow-black/40 flex items-center justify-center">
              <Logo variant="card" className="w-14 h-14 border-0 bg-transparent" />
            </div>

            <h1 className="text-xl sm:text-[22px] font-bold tracking-tight text-white leading-snug">
              Srujaan Share Market Institute Management System
            </h1>

            <p className="mt-2.5 text-[11px] font-bold tracking-[0.18em] text-amber-400/95 uppercase">
              WHERE KNOWLEDGE MEETS PROFIT.
            </p>
          </div>

          {/* Center Action: Single "Continue with Google" Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-white hover:bg-slate-50 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 active:translate-y-0 text-slate-900 font-semibold text-sm flex items-center justify-center gap-3 shadow-lg shadow-black/25 transition-all duration-150 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed disabled:hover:translate-y-0 border border-slate-200/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            aria-label="Continue with Google"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 text-slate-700 animate-spin shrink-0" />
                <span>Authenticating with Google...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Institutional Security Notice Banner + Diagnostic Error Display */}
          <div className="mt-6 rounded-xl bg-slate-950/65 border border-slate-800/80 p-4 space-y-3 text-left">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
                  Authorized Staff &amp; Admin Access Only
                </h2>
                <p className="text-xs leading-relaxed text-slate-400">
                  This Srujaan Share Market Institute Management System portal is restricted to verified administrators and faculty. All login sessions and student data actions are encrypted and logged.
                </p>
              </div>
            </div>

            {redirectingNotice && !authError && (
              <div className="pt-2.5 border-t border-slate-800/80 flex items-center gap-2 text-xs text-blue-300">
                <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                <span>Redirecting to Google Sign-In...</span>
              </div>
            )}

            {authError && (
              <div
                role="alert"
                className="rounded-lg bg-rose-950/60 border border-rose-500/40 p-3 space-y-2 text-xs text-rose-100 select-text"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 min-w-0">
                      {!authError.isAccessDenied && (
                        <div className="inline-flex items-center px-2 py-0.5 rounded bg-rose-900/80 border border-rose-500/40 font-mono text-[11px] font-semibold text-rose-200">
                          {authError.code}
                        </div>
                      )}
                      <p className="font-medium leading-relaxed break-words">
                        {authError.isAccessDenied
                          ? authError.message
                          : authError.rawMessage || authError.message}
                      </p>
                      {authError.isUnauthorizedDomain && (
                        <p className="text-[11px] text-rose-200/90 leading-relaxed">
                          Add this hostname to Firebase Console → Authentication → Settings → Authorized domains.
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAuthError(null)}
                    className="text-rose-300/80 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
                    aria-label="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!authError.isAccessDenied && (authError.hostname || currentHostname) && (
                  <div className="p-2 rounded-lg bg-slate-950/90 border border-rose-500/30 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                        Host Domain
                      </span>
                      <code className="text-[11px] font-mono text-emerald-300 break-all select-all">
                        {authError.hostname || currentHostname}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyHostname}
                      className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-medium flex items-center gap-1 shrink-0 cursor-pointer border border-slate-700"
                    >
                      {copiedHost ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-300" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subtle Security Footer Badge */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Protected by Google OAuth 2.0 &amp; Firebase Security</span>
          </div>
        </div>

        {/* Quiet Copyright Footer */}
        <p className="text-center text-slate-500 text-xs mt-6">
          © {new Date().getFullYear()} Srujaan Share Market Institute Management System. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
