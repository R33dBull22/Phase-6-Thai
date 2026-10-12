import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInAnonymously,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth, testConnection } from '../firebase/config';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  photoURL?: string | null;
}

interface StoredAccount {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isGuest: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, registrationCode: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
  verifyRegistrationCode: (code: string) => Promise<boolean>;
}

const LOCAL_ACCOUNTS_KEY = 'thai_hasis_accounts_v1';
const LEGACY_ACCOUNTS_KEY = 'phase6_accounts_v1';
const ACTIVE_SESSION_KEY = 'thai_hasis_active_user_v1';
const LEGACY_SESSION_KEY = 'phase6_active_user_v1';

// SHA-256 hash of the required registration code (stored only as hash):
const REGISTRATION_CODE_HASH = '37c9951b34c6841108e527f77a53325ec68e8ec98a07bb6a68e73c1a1436f68d';

export async function checkRegistrationCode(code: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(code.trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex.toLowerCase() === REGISTRATION_CODE_HASH;
  } catch {
    return false;
  }
}

async function hashPassword(password: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(`thai_hasis_salt_2026:${password}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return btoa(`thai_hasis_${password}`);
  }
}

function getStoredAccounts(): Record<string, StoredAccount> {
  try {
    const data = localStorage.getItem(LOCAL_ACCOUNTS_KEY) || localStorage.getItem(LEGACY_ACCOUNTS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveStoredAccounts(accounts: Record<string, StoredAccount>) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Failed saving accounts to localStorage:', e);
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AuthUser;
        if (parsed && !parsed.isAnonymous) {
          return parsed;
        }
      }
    } catch {}
    return null; // Guest by default has no access until registered / logged in
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Run connection test on boot
    testConnection().catch(() => {});

    // Listen to Firebase auth changes
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && !currentUser.isAnonymous) {
        const authUser: AuthUser = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          isAnonymous: false,
          photoURL: currentUser.photoURL,
        };
        setUser(authUser);
        try {
          localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
        } catch {}
        setLoading(false);
      } else {
        // If we don't have a Firebase user, check if a registered local user was signed in
        try {
          const stored = localStorage.getItem(ACTIVE_SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as AuthUser;
            if (parsed && !parsed.isAnonymous) {
              setUser(parsed);
              setLoading(false);
              return;
            }
          }
        } catch {}

        // Not authenticated -> no access for guests
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const registerWithEmail = async (
    email: string,
    pass: string,
    registrationCode: string,
    displayName?: string
  ) => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();
    const finalDisplayName = displayName?.trim() || cleanEmail.split('@')[0];

    // Verify registration passkey against hash
    const isCodeValid = await checkRegistrationCode(registrationCode);
    if (!isCodeValid) {
      const msg = 'Ungültiges Registrierungs-Passwort. Eine Registrierung ist nur mit dem korrekten Zugangs-Passwort möglich.';
      setAuthError(msg);
      throw new Error(msg);
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      const msg = 'Bitte eine gültige E-Mail-Adresse eingeben.';
      setAuthError(msg);
      throw new Error(msg);
    }

    if (cleanPass.length < 6) {
      const msg = 'Das Passwort muss mindestens 6 Zeichen lang sein.';
      setAuthError(msg);
      throw new Error(msg);
    }

    // First try Firebase Auth
    let firebaseSuccess = false;
    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      if (finalDisplayName && res.user) {
        await updateProfile(res.user, { displayName: finalDisplayName });
      }
      const authUser: AuthUser = {
        uid: res.user.uid,
        email: res.user.email,
        displayName: finalDisplayName,
        isAnonymous: false,
      };
      setUser(authUser);
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
      firebaseSuccess = true;
    } catch (fbErr: any) {
      console.info('Firebase registration falling back to local registry:', fbErr?.code || fbErr?.message);
    }

    if (!firebaseSuccess) {
      // Local account registry
      const accounts = getStoredAccounts();
      if (accounts[cleanEmail]) {
        const msg = 'Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const passwordHash = await hashPassword(cleanPass);
      const uid = `usr_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
      const newAccount: StoredAccount = {
        uid,
        email: cleanEmail,
        displayName: finalDisplayName,
        passwordHash,
        createdAt: new Date().toISOString(),
      };

      accounts[cleanEmail] = newAccount;
      saveStoredAccounts(accounts);

      const authUser: AuthUser = {
        uid,
        email: cleanEmail,
        displayName: finalDisplayName,
        isAnonymous: false,
      };

      setUser(authUser);
      try {
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
      } catch {}
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    if (!cleanEmail || !cleanPass) {
      const msg = 'Bitte E-Mail und Passwort eingeben.';
      setAuthError(msg);
      throw new Error(msg);
    }

    let firebaseSuccess = false;
    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      const authUser: AuthUser = {
        uid: res.user.uid,
        email: res.user.email,
        displayName: res.user.displayName,
        isAnonymous: false,
      };
      setUser(authUser);
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
      firebaseSuccess = true;
    } catch (fbErr: any) {
      console.info('Firebase login fallback to local account store:', fbErr?.code || fbErr?.message);
    }

    if (!firebaseSuccess) {
      const accounts = getStoredAccounts();
      const account = accounts[cleanEmail];

      if (!account) {
        const msg = 'Kein Konto mit dieser E-Mail-Adresse gefunden. Bitte erstelle zuerst ein Konto mit dem Registrierungs-Passwort.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const passwordHash = await hashPassword(cleanPass);
      if (account.passwordHash !== passwordHash) {
        const msg = 'Falsches Passwort. Bitte überprüfe deine Eingabe.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const authUser: AuthUser = {
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
        isAnonymous: false,
      };

      setUser(authUser);
      try {
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
      } catch {}
    }
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      const res = await signInWithPopup(auth, provider);
      const authUser: AuthUser = {
        uid: res.user.uid,
        email: res.user.email,
        displayName: res.user.displayName,
        isAnonymous: false,
        photoURL: res.user.photoURL,
      };
      setUser(authUser);
      try {
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
      } catch {}
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return;
      }
      console.warn('Google sign-in error:', err);
      const msg = err.message || 'Google-Anmeldung fehlgeschlagen.';
      setAuthError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {}
    try {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {}
    setUser(null);
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isGuest: !user,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        logout,
        authError,
        clearAuthError,
        verifyRegistrationCode: checkRegistrationCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
