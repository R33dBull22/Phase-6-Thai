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
  registerWithEmail: (email: string, pass: string, displayName?: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
}

const LOCAL_ACCOUNTS_KEY = 'phase6_accounts_v1';
const ACTIVE_SESSION_KEY = 'phase6_active_user_v1';
const GUEST_USER: AuthUser = {
  uid: 'local_guest',
  email: null,
  displayName: 'Gast-Lernender',
  isAnonymous: true,
};

async function hashPassword(password: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(`phase6_thai_salt_2026:${password}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return btoa(`phase6_${password}`);
  }
}

function getStoredAccounts(): Record<string, StoredAccount> {
  try {
    const data = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
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

function migrateGuestProgress(newUserId: string) {
  try {
    const guestKey = 'phase6_thai_progress_v1_local_guest';
    const targetKey = `phase6_thai_progress_v1_${newUserId}`;
    const guestData = localStorage.getItem(guestKey);
    const existingTargetData = localStorage.getItem(targetKey);

    if (guestData && (!existingTargetData || existingTargetData === '{}')) {
      const parsed = JSON.parse(guestData);
      const migrated: Record<string, any> = {};
      for (const [vocabId, prog] of Object.entries(parsed)) {
        migrated[vocabId] = {
          ...(prog as any),
          id: `${newUserId}_${vocabId}`,
          userId: newUserId,
        };
      }
      localStorage.setItem(targetKey, JSON.stringify(migrated));
    }
  } catch (err) {
    console.warn('Could not migrate guest progress:', err);
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (stored) {
        return JSON.parse(stored) as AuthUser;
      }
    } catch {}
    return GUEST_USER;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Run connection test on boot
    testConnection().catch(() => {});

    // Listen to Firebase auth changes
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const authUser: AuthUser = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          isAnonymous: currentUser.isAnonymous,
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
          const stored = localStorage.getItem(ACTIVE_SESSION_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as AuthUser;
            if (parsed && !parsed.isAnonymous) {
              setUser(parsed);
              setLoading(false);
              return;
            }
          }
        } catch {}

        // Fallback to guest user
        setUser(GUEST_USER);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const registerWithEmail = async (email: string, pass: string, displayName?: string) => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();
    const finalDisplayName = displayName?.trim() || cleanEmail.split('@')[0];

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
      migrateGuestProgress(authUser.uid);
      firebaseSuccess = true;
    } catch (fbErr: any) {
      console.info('Firebase registration unavailable or disabled, registering in local account registry:', fbErr?.code || fbErr?.message);
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
      migrateGuestProgress(uid);
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
        const msg = 'Kein Konto mit dieser E-Mail-Adresse gefunden. Bitte erstelle zuerst ein Konto.';
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
      migrateGuestProgress(account.uid);
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
      migrateGuestProgress(res.user.uid);
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

  const loginAsGuest = async () => {
    setAuthError(null);
    try {
      await signInAnonymously(auth);
    } catch {
      // Offline / anonymous fallback
      setUser(GUEST_USER);
      try {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      } catch {}
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {}
    try {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {}
    setUser(GUEST_USER);
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isGuest: !user || Boolean(user.isAnonymous) || user.uid === 'local_guest',
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        loginAsGuest,
        logout,
        authError,
        clearAuthError,
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
