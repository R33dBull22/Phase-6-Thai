import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { Vocabulary, UserProgress } from '../types/vocab';
import { STARTER_VOCABULARY } from '../data/initialVocab';
import { calculateNextReviewDate, calculateResetReviewDate } from '../utils/leitner';

const VOCAB_COLLECTION = 'vocabularies';
const PROGRESS_COLLECTION = 'user_progress';

// Local storage fallback keys for offline persistence & caching
const LOCAL_VOCAB_KEY = 'phase6_thai_vocabularies_v1';
const LOCAL_PROGRESS_KEY = 'phase6_thai_progress_v1';

/**
 * Seed initial starter vocabulary list directly into Firestore and local cache
 */
export async function seedInitialVocabularies(creatorId = 'system_starter'): Promise<Vocabulary[]> {
  const seededList: Vocabulary[] = [];

  for (let i = 0; i < STARTER_VOCABULARY.length; i++) {
    const item = STARTER_VOCABULARY[i];
    const id = `thai_init_${i + 1}`;
    const vocabData: Vocabulary = {
      id,
      ...item,
      creatorId,
      creatorName: 'phase6 Thai Team',
      createdAt: new Date().toISOString(),
    };
    seededList.push(vocabData);
  }

  // Save to local cache first
  try {
    localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(seededList));
  } catch {}

  // Commit batch seed to Firestore so all users have access
  try {
    const batch = writeBatch(db);
    for (const vocabData of seededList) {
      const ref = doc(db, VOCAB_COLLECTION, vocabData.id);
      batch.set(ref, {
        german: vocabData.german,
        thai: vocabData.thai,
        romanization: vocabData.romanization || '',
        lesson: vocabData.lesson,
        exampleThai: vocabData.exampleThai || '',
        exampleGerman: vocabData.exampleGerman || '',
        creatorId: vocabData.creatorId || 'system_starter',
        creatorName: vocabData.creatorName || 'phase6 Thai Team',
        createdAt: vocabData.createdAt,
      });
    }
    await batch.commit();
  } catch (error) {
    console.warn('Could not commit starter seed to Firestore, kept in local cache:', error);
  }

  return seededList;
}

/**
 * Upload any vocabularies that exist in local cache but are missing from Firestore
 */
export async function syncLocalVocabulariesToCloud(): Promise<number> {
  const cached = localStorage.getItem(LOCAL_VOCAB_KEY);
  if (!cached) return 0;

  try {
    const localList: Vocabulary[] = JSON.parse(cached);
    if (!Array.isArray(localList) || localList.length === 0) return 0;

    const snap = await getDocs(collection(db, VOCAB_COLLECTION));
    const remoteIds = new Set<string>();
    snap.forEach((d) => remoteIds.add(d.id));

    const missingInCloud = localList.filter((v) => !remoteIds.has(v.id));
    if (missingInCloud.length === 0) return 0;

    const batch = writeBatch(db);
    for (const v of missingInCloud) {
      const ref = doc(db, VOCAB_COLLECTION, v.id);
      batch.set(ref, {
        german: v.german,
        thai: v.thai,
        romanization: v.romanization || '',
        lesson: v.lesson || 'Allgemein',
        exampleThai: v.exampleThai || '',
        exampleGerman: v.exampleGerman || '',
        creatorId: v.creatorId || auth.currentUser?.uid || 'community_user',
        creatorName: v.creatorName || auth.currentUser?.displayName || 'Community',
        createdAt: v.createdAt || new Date().toISOString(),
      });
    }
    await batch.commit();
    return missingInCloud.length;
  } catch (err) {
    console.warn('Error syncing local vocabularies to Firestore:', err);
    return 0;
  }
}

/**
 * Fetch all community vocabularies from Firestore
 */
export async function fetchCommunityVocabularies(): Promise<Vocabulary[]> {
  try {
    const snap = await getDocs(collection(db, VOCAB_COLLECTION));
    if (!snap.empty) {
      const list: Vocabulary[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Vocabulary, 'id'>) });
      });

      // Also check if there are local vocabularies not yet in Firestore, and sync them
      try {
        const cached = localStorage.getItem(LOCAL_VOCAB_KEY);
        if (cached) {
          const localList: Vocabulary[] = JSON.parse(cached);
          const remoteIds = new Set(list.map((v) => v.id));
          const unsynced = localList.filter((v) => !remoteIds.has(v.id));
          if (unsynced.length > 0) {
            // Add unsynced local cards to list
            list.unshift(...unsynced);
            // Sync in background to Firestore
            syncLocalVocabulariesToCloud().catch(() => {});
          }
        }
      } catch {}

      // Save merged list to local cache
      try {
        localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(list));
      } catch {}
      return list;
    }
  } catch (error) {
    console.warn('Failed fetching community vocab from Firestore, falling back to local cache:', error);
  }

  // If Firestore is empty or failed, check local storage cache
  const cached = localStorage.getItem(LOCAL_VOCAB_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Attempt background push of these cached items to Firestore
        syncLocalVocabulariesToCloud().catch(() => {});
        return parsed;
      }
    } catch {}
  }

  // If both Firestore and local cache are empty, seed starter vocabularies
  const initialItems = await seedInitialVocabularies();
  return initialItems;
}

/**
 * Subscribe to real-time updates for community vocabularies
 */
export function subscribeToCommunityVocabularies(
  onUpdate: (vocabs: Vocabulary[]) => void
): () => void {
  return onSnapshot(
    collection(db, VOCAB_COLLECTION),
    (snap) => {
      if (!snap.empty) {
        const list: Vocabulary[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<Vocabulary, 'id'>) });
        });
        try {
          localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(list));
        } catch {}
        onUpdate(list);
      }
    },
    (error) => {
      console.warn('Realtime vocab listener warning:', error);
    }
  );
}

/**
 * Fetch progress for a specific user
 */
export async function fetchUserProgress(userId: string): Promise<Record<string, UserProgress>> {
  const result: Record<string, UserProgress> = {};
  if (!userId) return result;

  // Check local cache first for fast display
  const cached = localStorage.getItem(`${LOCAL_PROGRESS_KEY}_${userId}`);
  if (cached) {
    try {
      Object.assign(result, JSON.parse(cached));
    } catch {}
  }

  // Query Firestore for this user's progress
  try {
    const q = query(collection(db, PROGRESS_COLLECTION), where('userId', '==', userId));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const p = d.data() as UserProgress;
      result[p.vocabId] = { ...p, id: d.id };
    });

    try {
      localStorage.setItem(`${LOCAL_PROGRESS_KEY}_${userId}`, JSON.stringify(result));
    } catch {}
  } catch (error) {
    console.warn('Error fetching user progress from Firestore (using local cache):', error);
  }

  return result;
}

/**
 * Add a new vocabulary item (persists to Firestore and local storage)
 */
export async function addVocabulary(
  vocab: Omit<Vocabulary, 'id' | 'createdAt'>,
  userId: string
): Promise<Vocabulary> {
  const id = `vocab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const actualCreatorId = auth.currentUser?.uid || userId || 'community_user';
  const newVocab: Vocabulary = {
    ...vocab,
    id,
    creatorId: actualCreatorId,
    creatorName: vocab.creatorName || auth.currentUser?.displayName || 'Lernender',
    createdAt: new Date().toISOString(),
  };

  // 1. Update local cache immediately
  try {
    const cached = localStorage.getItem(LOCAL_VOCAB_KEY);
    const list: Vocabulary[] = cached ? JSON.parse(cached) : [];
    list.unshift(newVocab);
    localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(list));
  } catch {}

  // 2. Always persist directly to Firestore so all users can see it
  try {
    await setDoc(doc(db, VOCAB_COLLECTION, id), {
      german: newVocab.german,
      thai: newVocab.thai,
      romanization: newVocab.romanization || '',
      lesson: newVocab.lesson,
      exampleThai: newVocab.exampleThai || '',
      exampleGerman: newVocab.exampleGerman || '',
      creatorId: newVocab.creatorId,
      creatorName: newVocab.creatorName || 'Lernender',
      createdAt: newVocab.createdAt,
    });
  } catch (error) {
    console.warn('Firestore addVocabulary error (preserved in local cache):', error);
  }

  // 3. Auto-add to current user's deck in Phase 1
  if (userId) {
    await addVocabToUserDeck(userId, id);
  }

  return newVocab;
}

/**
 * Update an existing vocabulary item (persists to Firestore and local storage)
 */
export async function updateVocabulary(
  id: string,
  updatedData: Partial<Omit<Vocabulary, 'id' | 'createdAt'>>,
  userId: string
): Promise<Vocabulary> {
  let existingVocab: Vocabulary | undefined;

  // 1. Update in local storage
  try {
    const cached = localStorage.getItem(LOCAL_VOCAB_KEY);
    if (cached) {
      const list: Vocabulary[] = JSON.parse(cached);
      const index = list.findIndex((v) => v.id === id);
      if (index !== -1) {
        list[index] = {
          ...list[index],
          ...updatedData,
        };
        existingVocab = list[index];
        localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(list));
      }
    }
  } catch (err) {
    console.warn('Error updating local vocab cache:', err);
  }

  if (!existingVocab) {
    existingVocab = {
      id,
      german: updatedData.german || '',
      thai: updatedData.thai || '',
      romanization: updatedData.romanization,
      lesson: updatedData.lesson || 'Allgemein',
      exampleThai: updatedData.exampleThai,
      exampleGerman: updatedData.exampleGerman,
      creatorId: userId || 'community_user',
      createdAt: new Date().toISOString(),
    };
  }

  // 2. Always persist to Firestore
  try {
    const docRef = doc(db, VOCAB_COLLECTION, id);
    await setDoc(
      docRef,
      {
        german: existingVocab.german,
        thai: existingVocab.thai,
        romanization: existingVocab.romanization || '',
        lesson: existingVocab.lesson,
        exampleThai: existingVocab.exampleThai || '',
        exampleGerman: existingVocab.exampleGerman || '',
        creatorId: existingVocab.creatorId || 'community_user',
        createdAt: existingVocab.createdAt,
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Firestore updateVocabulary error (changes kept in local cache):', error);
  }

  return existingVocab;
}

/**
 * Delete a vocabulary item from Firestore and local storage
 */
export async function deleteVocabulary(id: string, userId: string): Promise<void> {
  // 1. Remove from local storage
  try {
    const cached = localStorage.getItem(LOCAL_VOCAB_KEY);
    if (cached) {
      const list: Vocabulary[] = JSON.parse(cached);
      const filtered = list.filter((v) => v.id !== id);
      localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(filtered));
    }
  } catch {}

  // 2. Also remove from local progress
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cachedProg = localStorage.getItem(key);
    if (cachedProg) {
      const map = JSON.parse(cachedProg);
      delete map[id];
      localStorage.setItem(key, JSON.stringify(map));
    }
  } catch {}

  // 3. Delete from Firestore
  try {
    await deleteDoc(doc(db, VOCAB_COLLECTION, id));
  } catch (err) {
    console.warn('Firestore deleteVocabulary error:', err);
  }
  try {
    await deleteDoc(doc(db, PROGRESS_COLLECTION, `${userId}_${id}`));
  } catch {}
}

/**
 * Add a vocabulary item to a user's Leitner study deck
 */
export async function addVocabToUserDeck(userId: string, vocabId: string): Promise<UserProgress> {
  const id = `${userId}_${vocabId}`;
  const now = new Date().toISOString();
  const progress: UserProgress = {
    id,
    userId,
    vocabId,
    phase: 1,
    nextReviewDate: now,
    lastReviewedAt: undefined,
    streak: 0,
    correctCount: 0,
    incorrectCount: 0,
    updatedAt: now,
  };

  // Save to local cache
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key);
    const map = cached ? JSON.parse(cached) : {};
    map[vocabId] = progress;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}

  // Sync to Firestore
  try {
    await setDoc(doc(db, PROGRESS_COLLECTION, id), progress);
  } catch (error) {
    console.warn('Firestore set progress error (fallback to local):', error);
  }

  return progress;
}

/**
 * Add multiple vocabulary items to a user's Leitner deck
 */
export async function addBatchToUserDeck(userId: string, vocabIds: string[]): Promise<void> {
  if (!vocabIds.length) return;
  const now = new Date().toISOString();

  // Save to local cache
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key);
    const map = cached ? JSON.parse(cached) : {};
    for (const vocabId of vocabIds) {
      map[vocabId] = {
        id: `${userId}_${vocabId}`,
        userId,
        vocabId,
        phase: 1,
        nextReviewDate: now,
        streak: 0,
        correctCount: 0,
        incorrectCount: 0,
        updatedAt: now,
      };
    }
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}

  // Sync batch to Firestore
  try {
    const batch = writeBatch(db);
    for (const vocabId of vocabIds) {
      const id = `${userId}_${vocabId}`;
      const ref = doc(db, PROGRESS_COLLECTION, id);
      batch.set(ref, {
        id,
        userId,
        vocabId,
        phase: 1,
        nextReviewDate: now,
        streak: 0,
        correctCount: 0,
        incorrectCount: 0,
        updatedAt: now,
      });
    }
    await batch.commit();
  } catch (error) {
    console.warn('Batch add error (saved locally):', error);
  }
}

/**
 * Remove a vocabulary item from user's active study deck
 */
export async function removeVocabFromUserDeck(userId: string, vocabId: string): Promise<void> {
  const id = `${userId}_${vocabId}`;

  // Update local cache
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key);
    if (cached) {
      const map = JSON.parse(cached);
      delete map[vocabId];
      localStorage.setItem(key, JSON.stringify(map));
    }
  } catch {}

  // Delete from Firestore
  try {
    await deleteDoc(doc(db, PROGRESS_COLLECTION, id));
  } catch (error) {
    console.warn('Error deleting progress doc:', error);
  }
}

/**
 * Record Leitner spaced repetition review answer (Phase 1-6)
 */
export async function recordReviewResult(
  userId: string,
  vocabId: string,
  currentProgress: UserProgress | undefined,
  isCorrect: boolean
): Promise<UserProgress> {
  const curPhase = currentProgress ? currentProgress.phase : 1;
  const now = new Date().toISOString();

  let nextPhase: number;
  let nextReviewDate: string;

  if (isCorrect) {
    nextPhase = Math.min(6, curPhase + 1);
    nextReviewDate = calculateNextReviewDate(nextPhase);
  } else {
    nextPhase = 1;
    nextReviewDate = calculateResetReviewDate();
  }

  const updated: UserProgress = {
    id: `${userId}_${vocabId}`,
    userId,
    vocabId,
    phase: nextPhase,
    nextReviewDate,
    lastReviewedAt: now,
    streak: isCorrect ? (currentProgress?.streak || 0) + 1 : 0,
    correctCount: (currentProgress?.correctCount || 0) + (isCorrect ? 1 : 0),
    incorrectCount: (currentProgress?.incorrectCount || 0) + (!isCorrect ? 1 : 0),
    updatedAt: now,
  };

  // 1. Update local storage
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key);
    const map = cached ? JSON.parse(cached) : {};
    map[vocabId] = updated;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}

  // 2. Sync with Firestore
  try {
    await setDoc(doc(db, PROGRESS_COLLECTION, updated.id), updated);
  } catch (error) {
    console.warn('Firestore progress sync warning (progress preserved in localStorage):', error);
  }

  return updated;
}
