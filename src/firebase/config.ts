import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Read FIREBASEAPI from environment variables (e.g. Vercel env, local .env, or localStorage override)
const getEnvOrLocalApiKey = (): string => {
  if (typeof process !== 'undefined' && process.env?.FIREBASEAPI) {
    return process.env.FIREBASEAPI;
  }
  if ((import.meta.env as any)?.FIREBASEAPI) {
    return (import.meta.env as any).FIREBASEAPI;
  }
  if ((import.meta.env as any)?.VITE_FIREBASEAPI) {
    return (import.meta.env as any).VITE_FIREBASEAPI;
  }
  if (typeof window !== 'undefined') {
    try {
      const localKey = localStorage.getItem('thai_hasis_firebase_api_key');
      if (localKey && localKey.trim()) return localKey.trim();
    } catch {}
  }
  if (firebaseConfig.apiKey && firebaseConfig.apiKey.trim()) {
    return firebaseConfig.apiKey.trim();
  }
  return '';
};

const rawApiKey = getEnvOrLocalApiKey();

// Safe placeholder prevents Firebase SDK from throwing 'auth/invalid-api-key' at module import time
// when running in AI Studio preview without local environment variable set.
// On Vercel, the real key is injected via the FIREBASEAPI environment variable.
const FALLBACK_DEV_KEY = 'AIzaSy_DEV_PREVIEW_KEY_SET_FIREBASEAPI_IN_VERCEL';
export const isLiveFirebaseApiKeyConfigured = Boolean(rawApiKey && rawApiKey !== FALLBACK_DEV_KEY);

const resolvedApiKey = rawApiKey || FALLBACK_DEV_KEY;

const appConfig = {
  ...firebaseConfig,
  apiKey: resolvedApiKey,
};

const app = initializeApp(appConfig);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on app boot as required by skill
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is currently offline or unreachable.');
    }
    return false;
  }
}
