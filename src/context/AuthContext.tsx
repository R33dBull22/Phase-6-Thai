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
  sendPasswordResetEmail as fbSendPasswordResetEmail,
} from 'firebase/auth';
import { auth, db, testConnection } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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
  resetPasswordDirect: (email: string, registrationCode: string, newPassword: string) => Promise<{ message: string }>;
  requestPasswordResetEmail: (email: string) => Promise<{ message: string }>;
  resetPasswordWithEmail: (email: string, registrationCode?: string, newPassword?: string) => Promise<{ method: 'firebase_email' | 'direct_reset'; message: string }>;
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

async function getEmailDocId(email: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(email.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return 'u_' + hashArray.map((b) => b.toString(16).padStart(2, '0')).slice(0, 32).join('');
  } catch {
    return 'u_' + btoa(email.trim().toLowerCase()).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
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

    const passwordHash = await hashPassword(cleanPass);
    let uid = `usr_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;

    // Try Firebase Auth
    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      if (finalDisplayName && res.user) {
        await updateProfile(res.user, { displayName: finalDisplayName });
      }
      uid = res.user.uid;
    } catch (fbErr: any) {
      console.info('Firebase registration falling back to local/cloud registry:', fbErr?.code || fbErr?.message);
    }

    // Save to local account registry
    const accounts = getStoredAccounts();
    const newAccount: StoredAccount = {
      uid,
      email: cleanEmail,
      displayName: finalDisplayName,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    accounts[cleanEmail] = newAccount;
    saveStoredAccounts(accounts);

    // Sync to Firestore app_users
    try {
      const docId = await getEmailDocId(cleanEmail);
      await setDoc(doc(db, 'app_users', docId), {
        uid,
        email: cleanEmail,
        displayName: finalDisplayName,
        passwordHash,
        createdAt: newAccount.createdAt,
        updatedAt: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('Could not sync app_user to Firestore:', dbErr);
    }

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
      console.info('Firebase login fallback to local/cloud account store:', fbErr?.code || fbErr?.message);
    }

    if (!firebaseSuccess) {
      const accounts = getStoredAccounts();
      let account = accounts[cleanEmail];

      // If not in localStorage, query Firestore app_users
      if (!account) {
        try {
          const docId = await getEmailDocId(cleanEmail);
          const snap = await getDoc(doc(db, 'app_users', docId));
          if (snap.exists()) {
            const data = snap.data();
            account = {
              uid: data.uid,
              email: data.email,
              displayName: data.displayName || cleanEmail.split('@')[0],
              passwordHash: data.passwordHash,
              createdAt: data.createdAt || new Date().toISOString(),
            };
            accounts[cleanEmail] = account;
            saveStoredAccounts(accounts);
          }
        } catch (dbErr) {
          console.warn('Could not query Firestore app_users:', dbErr);
        }
      }

      if (!account) {
        const msg = 'Kein Konto mit dieser E-Mail-Adresse gefunden. Bitte erstelle zuerst ein Konto mit dem Registrierungs-Passwort.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const passwordHash = await hashPassword(cleanPass);
      if (account.passwordHash !== passwordHash) {
        const msg = 'Falsches Passwort. Bitte überprüfe deine Eingabe oder nutze „Passwort vergessen?“.';
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

  const resetPasswordDirect = async (
    email: string,
    registrationCode: string,
    newPassword: string
  ): Promise<{ message: string }> => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = newPassword.trim();
    const cleanCode = registrationCode.trim();

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      const msg = 'Bitte eine gültige E-Mail-Adresse eingeben.';
      setAuthError(msg);
      throw new Error(msg);
    }

    const isCodeValid = await checkRegistrationCode(cleanCode);
    if (!isCodeValid) {
      const msg = 'Ungültiges Registrierungs-Passwort. Bitte gib das korrekte Zugangs-Passwort von Thai Hasis ein.';
      setAuthError(msg);
      throw new Error(msg);
    }

    if (cleanPass.length < 6) {
      const msg = 'Das neue Passwort muss mindestens 6 Zeichen lang sein.';
      setAuthError(msg);
      throw new Error(msg);
    }

    const newPasswordHash = await hashPassword(cleanPass);
    const accounts = getStoredAccounts();
    let account = accounts[cleanEmail];

    // Check Firestore if not found in local cache
    if (!account) {
      try {
        const docId = await getEmailDocId(cleanEmail);
        const snap = await getDoc(doc(db, 'app_users', docId));
        if (snap.exists()) {
          const data = snap.data();
          account = {
            uid: data.uid,
            email: data.email,
            displayName: data.displayName || cleanEmail.split('@')[0],
            passwordHash: data.passwordHash,
            createdAt: data.createdAt || new Date().toISOString(),
          };
        }
      } catch {}
    }

    const uid = account?.uid || `usr_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    const displayName = account?.displayName || cleanEmail.split('@')[0];

    const updatedAccount: StoredAccount = {
      uid,
      email: cleanEmail,
      displayName,
      passwordHash: newPasswordHash,
      createdAt: account?.createdAt || new Date().toISOString(),
    };

    accounts[cleanEmail] = updatedAccount;
    saveStoredAccounts(accounts);

    // Persist to Firestore app_users
    try {
      const docId = await getEmailDocId(cleanEmail);
      await setDoc(doc(db, 'app_users', docId), {
        uid,
        email: cleanEmail,
        displayName,
        passwordHash: newPasswordHash,
        createdAt: updatedAccount.createdAt,
        updatedAt: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('Could not persist updated password to Firestore:', dbErr);
    }

    // Auto-login user immediately
    const authUser: AuthUser = {
      uid,
      email: cleanEmail,
      displayName,
      isAnonymous: false,
    };
    setUser(authUser);
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(authUser));
    } catch {}

    return {
      message: 'Dein Passwort wurde erfolgreich neu gesetzt! Du bist ab sofort angemeldet.',
    };
  };

  const requestPasswordResetEmail = async (email: string): Promise<{ message: string }> => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      const msg = 'Bitte eine gültige E-Mail-Adresse eingeben.';
      setAuthError(msg);
      throw new Error(msg);
    }

    try {
      await fbSendPasswordResetEmail(auth, cleanEmail);
      return {
        message: 'Eine E-Mail zum Zurücksetzen wurde angefordert. Bitte prüfe deinen Posteingang und deinen Spam-Ordner. Sollte keine E-Mail ankommen, nutze bitte die Option „Sofort mit Zugangs-Passwort“, um dein Passwort ohne Wartezeit direkt zu ändern.',
      };
    } catch (fbErr: any) {
      console.info('Firebase sendPasswordResetEmail error:', fbErr?.code || fbErr?.message);
      let errMsg = 'E-Mail konnte nicht gesendet werden. ';
      if (fbErr?.code === 'auth/user-not-found') {
        errMsg = 'Kein Firebase-Konto mit dieser E-Mail gefunden. ';
      }
      errMsg += 'Bitte nutze die Option „Sofort mit Zugangs-Passwort“, um dein Passwort direkt und ohne E-Mail neu zu setzen!';
      setAuthError(errMsg);
      throw new Error(errMsg);
    }
  };

  const resetPasswordWithEmail = async (
    email: string,
    registrationCode?: string,
    newPassword?: string
  ): Promise<{ method: 'firebase_email' | 'direct_reset'; message: string }> => {
    if (registrationCode && newPassword) {
      const res = await resetPasswordDirect(email, registrationCode, newPassword);
      return {
        method: 'direct_reset',
        message: res.message,
      };
    } else {
      const res = await requestPasswordResetEmail(email);
      return {
        method: 'firebase_email',
        message: res.message,
      };
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
        resetPasswordDirect,
        requestPasswordResetEmail,
        resetPasswordWithEmail,
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
