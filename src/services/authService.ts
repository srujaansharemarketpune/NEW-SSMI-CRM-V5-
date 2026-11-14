import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  User
} from 'firebase/auth';
import {
  auth,
  savePersistedAdminSession,
  loadPersistedAdminSession,
  clearPersistedAdminSession
} from './firebase';

export const PRIMARY_ADMIN_EMAIL = 'srujaansharemarketpune@gmail.com'.toLowerCase();
export const PRIMARY_ADMIN_ALIAS_EMAIL = 'srujaanshareamarketpune@gmail.com'.toLowerCase();
export const SECONDARY_OPERATOR_EMAIL = 'udayhajare18@gmail.com'.toLowerCase();

export const AUTHORIZED_USERS_MAP: Record<string, 'admin' | 'operator'> = {
  [PRIMARY_ADMIN_EMAIL]: 'admin',
  [PRIMARY_ADMIN_ALIAS_EMAIL]: 'admin',
  [SECONDARY_OPERATOR_EMAIL]: 'operator'
};

export const ALLOWED_EMAILS = [
  PRIMARY_ADMIN_EMAIL,
  PRIMARY_ADMIN_ALIAS_EMAIL,
  SECONDARY_OPERATOR_EMAIL
];

export type UserRole = 'admin' | 'operator' | 'unauthorized';

export function getUserRole(email?: string | null): UserRole {
  if (!email) return 'unauthorized';
  const normalized = email.trim().toLowerCase();
  return AUTHORIZED_USERS_MAP[normalized] || 'unauthorized';
}

export function isAuthorizedUser(email?: string | null): boolean {
  if (!email) return false;
  return getUserRole(email) !== 'unauthorized';
}

export function isAuthorizedAdmin(email?: string | null): boolean {
  return getUserRole(email) === 'admin';
}

export function isAuthorizedOperator(email?: string | null): boolean {
  return getUserRole(email) === 'operator';
}

// Google Auth Provider configured with default Master Admin hint & account chooser prompt
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  login_hint: PRIMARY_ADMIN_EMAIL,
  prompt: 'select_account'
});

/**
 * Explicitly configures browserSessionPersistence at startup/mount (tab-scoped) so no async delay precedes signInWithPopup.
 * Same-tab reloads stay logged in, while new tabs/windows/devices always require a fresh login.
 */
export function ensureBrowserSessionPersistence(): Promise<void> {
  try {
    return setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.warn('[AuthService] Could not set browserSessionPersistence:', err);
    });
  } catch (err) {
    console.warn('[AuthService] Sync persistence setup fallback:', err);
    return Promise.resolve();
  }
}

export const ensureBrowserLocalPersistence = ensureBrowserSessionPersistence;

if (typeof window !== 'undefined') {
  void ensureBrowserSessionPersistence();
}

export interface AuthSessionResult {
  user: User;
  role: 'admin' | 'operator';
}

/**
 * Constructs a pre-logged-in session User object for the active Master Admin / Operator cache
 */
export function buildDefaultMasterAdminUser(email = PRIMARY_ADMIN_EMAIL, name?: string): User {
  const cleanEmail = email.trim().toLowerCase() === PRIMARY_ADMIN_ALIAS_EMAIL
    ? PRIMARY_ADMIN_EMAIL
    : email.trim().toLowerCase() || PRIMARY_ADMIN_EMAIL;
  const isOp = cleanEmail === SECONDARY_OPERATOR_EMAIL;
  const displayName = name || (isOp ? 'Uday Hajare' : 'Prasad Sir');
  const uid = isOp ? 'staff_operator_uday' : 'srujaan_master_admin_root';
  return {
    uid,
    email: cleanEmail,
    emailVerified: true,
    displayName,
    isAnonymous: false,
    photoURL: null,
    phoneNumber: null,
    providerId: 'google.com',
    metadata: {},
    providerData: [
      {
        providerId: 'google.com',
        uid: cleanEmail,
        displayName,
        email: cleanEmail,
        phoneNumber: null,
        photoURL: null
      }
    ],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'default-master-admin-token',
    getIdTokenResult: async () => ({
      token: 'default-master-admin-token',
      authTime: new Date().toISOString(),
      issuedAtTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 86400000).toISOString(),
      signInProvider: 'google.com',
      signInSecondFactor: null,
      claims: { email: cleanEmail, email_verified: true }
    }),
    reload: async () => {},
    toJSON: () => ({ uid, email: cleanEmail })
  } as unknown as User;
}

/**
 * Synchronously resolves the active CRM session from `ssmi_crm_user_session` (defaulting to Prasad Sir / Master Admin)
 * so the app boots straight into the dashboard with zero login wall. Returns null only when explicitly signed out.
 */
export function getInitialAuthSession(): AuthSessionResult | null {
  // Only a real Firebase Auth user is an authenticated CRM session.
  // Cached local profiles may restore offline data, but never unlock cloud access.
  if (auth.currentUser && auth.currentUser.email && isAuthorizedUser(auth.currentUser.email)) {
    const role = getUserRole(auth.currentUser.email);
    if (role !== 'unauthorized') return { user: auth.currentUser, role };
  }
  return null;
}

/** @deprecated Quick-resume local sessions cannot authenticate with Firebase. */
export function loginWithDefaultMasterAdmin(): AuthSessionResult {
  throw new Error('Quick Resume is disabled. Continue with Google using srujaansharemarketpune@gmail.com to access shared cloud data.');
}

let redirectCheckPromise: Promise<AuthSessionResult | null> | null = null;

/**
 * Checks if returning from a browser redirect authentication flow (signInWithRedirect).
 * Deduplicated so multiple mount listeners safely share the single getRedirectResult(auth) call.
 */
export async function checkRedirectResult(): Promise<AuthSessionResult | null> {
  if (!redirectCheckPromise) {
    redirectCheckPromise = (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result || !result.user) return null;

        const user = result.user;
        const email = (user.email || '').trim().toLowerCase();
        const role = getUserRole(email);

        if (role === 'unauthorized') {
          clearPersistedAdminSession(true);
          try {
            await signOut(auth);
          } catch {
            // ignore signOut errors
          }
          const accessError = new Error(
            'Access Denied: Your Google account is not authorized for Srujaan Share Market Institute Management System.'
          );
          (accessError as any).code = 'ACCESS_DENIED';
          throw accessError;
        }

        savePersistedAdminSession(user, role === 'operator');
        return { user, role };
      } catch (err: any) {
        if (err?.code) {
          throw err;
        }
        console.warn('[AuthService] Redirect result check fallback (non-blocking):', err);
        return null;
      }
    })();
  }
  return redirectCheckPromise;
}

/**
 * Direct redirect authentication flow for mobile or restricted iframe environments
 */
export async function loginWithRedirect(): Promise<void> {
  googleProvider.setCustomParameters({
    login_hint: PRIMARY_ADMIN_EMAIL,
    prompt: 'select_account'
  });
  await signInWithRedirect(auth, googleProvider);
}

/**
 * Primary Google Sign-In via signInWithPopup triggered synchronously inside onClick (zero preceding awaits),
 * with automatic fallback to signInWithRedirect on popup-blocked / cancelled-popup-request / unsupported-env.
 */
export async function loginWithGoogle(): Promise<AuthSessionResult | null> {
  googleProvider.setCustomParameters({
    login_hint: PRIMARY_ADMIN_EMAIL,
    prompt: 'select_account'
  });

  let result;
  try {
    // Call signInWithPopup directly with zero awaiting beforehand to preserve browser user gesture
    result = await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    const code = String(error?.code || '');
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }

  const user = result.user;
  const email = (user.email || '').trim().toLowerCase();
  const role = getUserRole(email);

  if (role === 'unauthorized') {
    clearPersistedAdminSession(true);
    await signOut(auth);
    const accessError = new Error(
      'Access Denied: Your Google account is not authorized for Srujaan Share Market Institute Management System.'
    );
    (accessError as any).code = 'ACCESS_DENIED';
    throw accessError;
  }

  savePersistedAdminSession(user, role === 'operator');
  return { user, role };
}

export async function logoutAdmin(): Promise<void> {
  clearPersistedAdminSession(true);
  try {
    await signOut(auth);
  } catch {
    // ignore signout notice
  }
}

export const logoutUser = logoutAdmin;
export const logoutOperator = logoutAdmin;

/**
 * Single source of truth for tab-scoped auth state (requires fresh Google Sign-In on every new tab/visit/device)
 */
export function subscribeToAuth(
  onAuthChange: (authData: AuthSessionResult | null) => void
): () => void {
  // Immediately hydrate ONLY if already signed in within the current tab's sessionStorage
  const initialSession = getInitialAuthSession();
  onAuthChange(initialSession);

  try {
    return onAuthStateChanged(
      auth,
      async (user) => {
        try {
          if (user && user.email) {
            const email = user.email.trim().toLowerCase();
            const role = getUserRole(email);

            if (role !== 'unauthorized') {
              savePersistedAdminSession(user, role === 'operator');
              onAuthChange({ user, role });
              return;
            } else {
              clearPersistedAdminSession(true);
              try {
                await signOut(auth);
              } catch {
                // ignore signout errors
              }
              onAuthChange(null);
              return;
            }
          }
        } catch (cbErr) {
          console.warn('[AuthService] onAuthStateChanged callback fallback:', cbErr);
        }

        // No live Firebase session in this tab's browserSessionPersistence — clear any stale tab storage and require Login
        clearPersistedAdminSession(false);
        onAuthChange(null);
      },
      (authErr) => {
        console.warn('[AuthService] onAuthStateChanged listener warning:', authErr);
        const fallbackSession = getInitialAuthSession();
        onAuthChange(fallbackSession);
      }
    );
  } catch (err) {
    console.warn('[AuthService] Failed to attach auth listener:', err);
    return () => {};
  }
}
