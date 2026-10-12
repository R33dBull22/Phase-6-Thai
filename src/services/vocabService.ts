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
import { Vocabulary, UserProgress, DeletedVocabEntry, DirectionProgress, QueryDirection } from '../types/vocab';
import { STARTER_VOCABULARY } from '../data/initialVocab';
import { calculateNextReviewDate, calculateResetReviewDate, getDirectionProgress } from '../utils/leitner';

const VOCAB_COLLECTION = 'vocabularies';
const PROGRESS_COLLECTION = 'user_progress';

// Local storage keys for offline persistence & caching
const LOCAL_VOCAB_KEY = 'thai_hasis_vocabularies_v1';
const LEGACY_VOCAB_KEY = 'phase6_thai_vocabularies_v1';
const LOCAL_PROGRESS_KEY = 'thai_hasis_progress_v1';
const LEGACY_PROGRESS_KEY = 'phase6_thai_progress_v1';
const LOCAL_DELETED_VOCABS_KEY = 'thai_hasis_deleted_vocabs_v1';
const LOCAL_DELETED_LESSONS_KEY = 'thai_hasis_deleted_lessons_v1';

export function getDeletedVocabs(userId?: string): DeletedVocabEntry[] {
  try {
    const key = userId ? `${LOCAL_DELETED_VOCABS_KEY}_${userId}` : LOCAL_DELETED_VOCABS_KEY;
    const raw = localStorage.getItem(key) || localStorage.getItem(LOCAL_DELETED_VOCABS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeletedVocabs(entries: DeletedVocabEntry[], userId?: string) {
  try {
    const key = userId ? `${LOCAL_DELETED_VOCABS_KEY}_${userId}` : LOCAL_DELETED_VOCABS_KEY;
    localStorage.setItem(key, JSON.stringify(entries));
    // also keep general key in sync
    localStorage.setItem(LOCAL_DELETED_VOCABS_KEY, JSON.stringify(entries));
  } catch {}
}

export function getDeletedLessons(userId?: string): string[] {
  try {
    const key = userId ? `${LOCAL_DELETED_LESSONS_KEY}_${userId}` : LOCAL_DELETED_LESSONS_KEY;
    const raw = localStorage.getItem(key) || localStorage.getItem(LOCAL_DELETED_LESSONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeletedLessons(lessons: string[], userId?: string) {
  try {
    const key = userId ? `${LOCAL_DELETED_LESSONS_KEY}_${userId}` : LOCAL_DELETED_LESSONS_KEY;
    localStorage.setItem(key, JSON.stringify(lessons));
    localStorage.setItem(LOCAL_DELETED_LESSONS_KEY, JSON.stringify(lessons));
  } catch {}
}

export function filterOutUserDeletedVocabs(list: Vocabulary[], userId?: string): Vocabulary[] {
  const deletedEntries = getDeletedVocabs(userId);
  const deletedIds = new Set(deletedEntries.map((e) => e.vocab.id));
  const deletedLessons = new Set(getDeletedLessons(userId).map((l) => l.trim().toLowerCase()));

  return list.filter((v) => {
    if (deletedIds.has(v.id)) return false;
    if (v.lesson && deletedLessons.has(v.lesson.trim().toLowerCase())) return false;
    return true;
  });
}

function getCachedVocabs(): Vocabulary[] {
  try {
    const raw = localStorage.getItem(LOCAL_VOCAB_KEY) || localStorage.getItem(LEGACY_VOCAB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCachedVocabs(list: Vocabulary[]) {
  try {
    localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(list));
  } catch {}
}

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
      creatorName: 'Thai Hasi Team',
      createdAt: new Date().toISOString(),
    };
    seededList.push(vocabData);
  }

  // Save to local cache first
  saveCachedVocabs(seededList);

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
        creatorName: vocabData.creatorName || 'Thai Hasi Team',
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
export async function syncLocalVocabulariesToCloud(userId?: string): Promise<number> {
  const localList = getCachedVocabs();
  const activeLocal = filterOutUserDeletedVocabs(localList, userId);
  if (!Array.isArray(activeLocal) || activeLocal.length === 0) return 0;

  try {
    const snap = await getDocs(collection(db, VOCAB_COLLECTION));
    const remoteIds = new Set<string>();
    snap.forEach((d) => remoteIds.add(d.id));

    const missingInCloud = activeLocal.filter((v) => !remoteIds.has(v.id));
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
        creatorName: v.creatorName || auth.currentUser?.displayName || 'Thai Hasi',
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
export async function fetchCommunityVocabularies(userId?: string): Promise<Vocabulary[]> {
  try {
    const snap = await getDocs(collection(db, VOCAB_COLLECTION));
    if (!snap.empty) {
      const list: Vocabulary[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Vocabulary, 'id'>) });
      });

      // Filter out vocabs or lessons that this user deleted
      const activeList = filterOutUserDeletedVocabs(list, userId);

      // Also check if there are local vocabs not yet in Firestore, and sync them
      try {
        const localList = getCachedVocabs();
        const activeLocal = filterOutUserDeletedVocabs(localList, userId);
        const remoteIds = new Set(list.map((v) => v.id));
        const unsynced = activeLocal.filter((v) => !remoteIds.has(v.id));
        if (unsynced.length > 0) {
          activeList.unshift(...unsynced);
          syncLocalVocabulariesToCloud(userId).catch(() => {});
        }
      } catch {}

      saveCachedVocabs(activeList);
      return activeList;
    }
  } catch (error) {
    console.warn('Failed fetching community vocab from Firestore, falling back to local cache:', error);
  }

  // If Firestore is empty or failed, check local storage cache
  const localList = getCachedVocabs();
  const activeLocal = filterOutUserDeletedVocabs(localList, userId);
  if (Array.isArray(activeLocal) && activeLocal.length > 0) {
    syncLocalVocabulariesToCloud(userId).catch(() => {});
    return activeLocal;
  }

  // If both Firestore and local cache are empty, seed starter vocabularies
  const initialItems = await seedInitialVocabularies();
  return filterOutUserDeletedVocabs(initialItems, userId);
}

/**
 * Subscribe to real-time updates for community vocabularies
 */
export function subscribeToCommunityVocabularies(
  onUpdate: (vocabs: Vocabulary[]) => void,
  userId?: string
): () => void {
  return onSnapshot(
    collection(db, VOCAB_COLLECTION),
    (snap) => {
      if (!snap.empty) {
        const list: Vocabulary[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<Vocabulary, 'id'>) });
        });
        const activeList = filterOutUserDeletedVocabs(list, userId);
        try {
          localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(activeList));
        } catch {}
        onUpdate(activeList);
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
 * Delete a vocabulary item from Firestore and local storage,
 * and track it in deleted history so it never reappears on sync
 * and can be restored in Settings.
 */
export async function deleteVocabulary(
  id: string,
  userId: string,
  vocabSnapshot?: Vocabulary
): Promise<void> {
  // Determine vocab snapshot to store in deleted history
  let snapshot = vocabSnapshot;
  if (!snapshot) {
    const cached = getCachedVocabs();
    snapshot = cached.find((v) => v.id === id);
  }

  // Find user's progress if any
  let userProg: UserProgress | undefined;
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cachedProg = localStorage.getItem(key);
    if (cachedProg) {
      const map = JSON.parse(cachedProg);
      userProg = map[id];
    }
  } catch {}

  // 1. Record in deleted vocabs list for the user
  if (snapshot) {
    const deletedList = getDeletedVocabs(userId);
    const existingIdx = deletedList.findIndex((d) => d.vocab.id === id);
    const entry: DeletedVocabEntry = {
      vocab: snapshot,
      deletedAt: new Date().toISOString(),
      previousProgress: userProg,
    };
    if (existingIdx !== -1) {
      deletedList[existingIdx] = entry;
    } else {
      deletedList.unshift(entry);
    }
    saveDeletedVocabs(deletedList, userId);
  }

  // 2. Remove from local storage
  try {
    const cached = localStorage.getItem(LOCAL_VOCAB_KEY);
    if (cached) {
      const list: Vocabulary[] = JSON.parse(cached);
      const filtered = list.filter((v) => v.id !== id);
      localStorage.setItem(LOCAL_VOCAB_KEY, JSON.stringify(filtered));
    }
  } catch {}

  // 3. Remove from local progress
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cachedProg = localStorage.getItem(key);
    if (cachedProg) {
      const map = JSON.parse(cachedProg);
      delete map[id];
      localStorage.setItem(key, JSON.stringify(map));
    }
  } catch {}

  // 4. Delete from Firestore
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
 * Restore a previously deleted vocabulary item
 */
export async function restoreVocabulary(
  vocabId: string,
  userId: string
): Promise<Vocabulary | null> {
  const deletedList = getDeletedVocabs(userId);
  const entryIdx = deletedList.findIndex((e) => e.vocab.id === vocabId);
  if (entryIdx === -1) return null;

  const entry = deletedList[entryIdx];
  const vocab = entry.vocab;

  // Remove from deleted list
  deletedList.splice(entryIdx, 1);
  saveDeletedVocabs(deletedList, userId);

  // If the lesson was also marked as deleted, unmark it so the item becomes visible
  if (vocab.lesson) {
    const deletedLessons = getDeletedLessons(userId);
    const lessonIdx = deletedLessons.indexOf(vocab.lesson.trim());
    if (lessonIdx !== -1) {
      deletedLessons.splice(lessonIdx, 1);
      saveDeletedLessons(deletedLessons, userId);
    }
  }

  // 1. Add back to local cache
  try {
    const cached = getCachedVocabs();
    if (!cached.some((v) => v.id === vocab.id)) {
      cached.unshift(vocab);
      saveCachedVocabs(cached);
    }
  } catch {}

  // 2. Restore in Firestore so community/cloud has it
  try {
    const docRef = doc(db, VOCAB_COLLECTION, vocab.id);
    await setDoc(docRef, {
      german: vocab.german,
      thai: vocab.thai,
      romanization: vocab.romanization || '',
      lesson: vocab.lesson || 'Allgemein',
      exampleThai: vocab.exampleThai || '',
      exampleGerman: vocab.exampleGerman || '',
      creatorId: vocab.creatorId || userId || 'restored_user',
      creatorName: vocab.creatorName || 'Thai Hasi',
      createdAt: vocab.createdAt || new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Error restoring vocab in Firestore:', err);
  }

  // 3. Restore progress if previously possessed
  if (entry.previousProgress && userId) {
    try {
      const prog = entry.previousProgress;
      const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
      const cached = localStorage.getItem(key);
      const map = cached ? JSON.parse(cached) : {};
      map[vocab.id] = prog;
      localStorage.setItem(key, JSON.stringify(map));

      await setDoc(doc(db, PROGRESS_COLLECTION, `${userId}_${vocab.id}`), prog);
    } catch (err) {
      console.warn('Error restoring progress:', err);
    }
  }

  return vocab;
}

/**
 * Permanently delete from trash (cannot be restored)
 */
export function permanentlyDeleteFromTrash(vocabId: string, userId?: string) {
  const deletedList = getDeletedVocabs(userId);
  const filtered = deletedList.filter((e) => e.vocab.id !== vocabId);
  saveDeletedVocabs(filtered, userId);
}

/**
 * Empty entire deleted trash
 */
export function clearAllDeletedVocabs(userId?: string) {
  saveDeletedVocabs([], userId);
}

/**
 * Add a vocabulary item to a user's Leitner study deck
 */
export async function addVocabToUserDeck(
  userId: string,
  vocabId: string,
  initialPhase = 1
): Promise<UserProgress> {
  const phase = initialPhase >= 1 && initialPhase <= 6 ? initialPhase : 1;
  const id = `${userId}_${vocabId}`;
  const now = new Date().toISOString();
  // When added or imported into a phase, card is treated as newly arrived in that phase:
  // its review is scheduled according to the phase interval (not immediately due)
  const nextReviewDate = calculateNextReviewDate(phase);
  const dirProg: DirectionProgress = {
    phase,
    nextReviewDate,
    lastReviewedAt: undefined,
    streak: phase > 1 ? phase - 1 : 0,
    correctCount: phase > 1 ? phase - 1 : 0,
    incorrectCount: 0,
  };

  const progress: UserProgress = {
    id,
    userId,
    vocabId,
    phase,
    nextReviewDate,
    lastReviewedAt: undefined,
    streak: phase > 1 ? phase - 1 : 0,
    correctCount: phase > 1 ? phase - 1 : 0,
    incorrectCount: 0,
    updatedAt: now,
    deToTh: { ...dirProg },
    thToDe: { ...dirProg },
  };

  // Save to local cache
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key) || localStorage.getItem(`${LEGACY_PROGRESS_KEY}_${userId}`);
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

export type DeckItemInput =
  | string
  | { vocabId: string; phase?: number; phaseDeToTh?: number; phaseThToDe?: number };

/**
 * Explicitly update the Leitner phase of a single vocabulary item for a user.
 * Supports updating a specific direction ('de_to_th' or 'th_to_de') or both ('both').
 */
export async function updateVocabPhase(
  userId: string,
  vocabId: string,
  targetPhase: number,
  targetDirection: 'de_to_th' | 'th_to_de' | 'both' = 'both',
  currentProgress?: UserProgress
): Promise<UserProgress> {
  const newPhase = Math.max(1, Math.min(6, targetPhase));
  const id = `${userId}_${vocabId}`;
  const now = new Date().toISOString();
  const nextReviewDate = newPhase > 1 ? calculateNextReviewDate(newPhase) : now;

  // Retrieve current directional progress if available
  const existingDeToTh = getDirectionProgress(currentProgress, 'de_to_th');
  const existingThToDe = getDirectionProgress(currentProgress, 'th_to_de');

  let updatedDeToTh: DirectionProgress = existingDeToTh;
  let updatedThToDe: DirectionProgress = existingThToDe;

  const targetDirProg: DirectionProgress = {
    phase: newPhase,
    nextReviewDate,
    lastReviewedAt: undefined,
    streak: newPhase > 1 ? newPhase - 1 : 0,
    correctCount: newPhase > 1 ? newPhase - 1 : 0,
    incorrectCount: 0,
  };

  if (targetDirection === 'de_to_th') {
    updatedDeToTh = targetDirProg;
  } else if (targetDirection === 'th_to_de') {
    updatedThToDe = targetDirProg;
  } else {
    updatedDeToTh = { ...targetDirProg };
    updatedThToDe = { ...targetDirProg };
  }

  const combinedPhase = Math.min(updatedDeToTh.phase, updatedThToDe.phase);
  const combinedNextReviewDate =
    new Date(updatedDeToTh.nextReviewDate).getTime() <= new Date(updatedThToDe.nextReviewDate).getTime()
      ? updatedDeToTh.nextReviewDate
      : updatedThToDe.nextReviewDate;

  const progress: UserProgress = {
    id,
    userId,
    vocabId,
    phase: combinedPhase,
    nextReviewDate: combinedNextReviewDate,
    lastReviewedAt: undefined,
    streak: combinedPhase > 1 ? combinedPhase - 1 : 0,
    correctCount: (currentProgress?.correctCount || 0),
    incorrectCount: (currentProgress?.incorrectCount || 0),
    updatedAt: now,
    deToTh: updatedDeToTh,
    thToDe: updatedThToDe,
  };

  // 1. Local update
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key);
    const map = cached ? JSON.parse(cached) : {};
    map[vocabId] = progress;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}

  // 2. Firestore update
  try {
    await setDoc(doc(db, PROGRESS_COLLECTION, id), progress);
  } catch (err) {
    console.warn('Error updating vocab phase in Firestore:', err);
  }

  return progress;
}

/**
 * Reset multiple selected vocabularies to start from Phase 1 (von Anfang an lernen)
 */
export async function resetVocabsToPhaseOne(
  userId: string,
  vocabIds: string[]
): Promise<Record<string, UserProgress>> {
  if (!vocabIds.length || !userId) return {};
  const now = new Date().toISOString();
  const updatedMap: Record<string, UserProgress> = {};

  const dirProg1: DirectionProgress = {
    phase: 1,
    nextReviewDate: now,
    lastReviewedAt: undefined,
    streak: 0,
    correctCount: 0,
    incorrectCount: 0,
  };

  // Local cache update
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key);
    const map = cached ? JSON.parse(cached) : {};

    for (const vId of vocabIds) {
      const p: UserProgress = {
        id: `${userId}_${vId}`,
        userId,
        vocabId: vId,
        phase: 1,
        nextReviewDate: now,
        lastReviewedAt: undefined,
        streak: 0,
        correctCount: 0,
        incorrectCount: 0,
        updatedAt: now,
        deToTh: { ...dirProg1 },
        thToDe: { ...dirProg1 },
      };
      map[vId] = p;
      updatedMap[vId] = p;
    }
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}

  // Firestore batch update
  try {
    const batch = writeBatch(db);
    for (const vId of vocabIds) {
      const id = `${userId}_${vId}`;
      const ref = doc(db, PROGRESS_COLLECTION, id);
      batch.set(ref, {
        id,
        userId,
        vocabId: vId,
        phase: 1,
        nextReviewDate: now,
        streak: 0,
        correctCount: 0,
        incorrectCount: 0,
        updatedAt: now,
        deToTh: { ...dirProg1 },
        thToDe: { ...dirProg1 },
      });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Error resetting vocabs to phase 1 in Firestore:', err);
  }

  return updatedMap;
}

/**
 * Step back all vocabularies in a lesson by one phase (um eine Phase zurückschieben).
 * For cards in Phase > 1: phase = phase - 1.
 * For cards in Phase 1: stays in Phase 1 and resets nextReviewDate to now (due immediately).
 * For cards not yet in the user deck: enqueues them into Phase 1.
 */
export async function stepBackLessonPhase(
  userId: string,
  lessonVocabIds: string[],
  currentProgressMap: Record<string, UserProgress>
): Promise<Record<string, UserProgress>> {
  if (!lessonVocabIds.length || !userId) return {};
  const now = new Date().toISOString();
  const updatedMap: Record<string, UserProgress> = {};

  // 1. Compute changes locally
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key);
    const map = cached ? JSON.parse(cached) : {};

    for (const vId of lessonVocabIds) {
      const existing = currentProgressMap[vId] || map[vId];
      const existingDe = getDirectionProgress(existing, 'de_to_th');
      const existingTh = getDirectionProgress(existing, 'th_to_de');

      const newDePhase = Math.max(1, existingDe.phase - 1);
      const newThPhase = Math.max(1, existingTh.phase - 1);
      const deNextReview = newDePhase > 1 ? calculateNextReviewDate(newDePhase) : now;
      const thNextReview = newThPhase > 1 ? calculateNextReviewDate(newThPhase) : now;

      const newDeToTh: DirectionProgress = {
        phase: newDePhase,
        nextReviewDate: deNextReview,
        lastReviewedAt: existingDe.lastReviewedAt,
        streak: newDePhase > 1 ? newDePhase - 1 : 0,
        correctCount: existingDe.correctCount,
        incorrectCount: existingDe.incorrectCount,
      };
      const newThToDe: DirectionProgress = {
        phase: newThPhase,
        nextReviewDate: thNextReview,
        lastReviewedAt: existingTh.lastReviewedAt,
        streak: newThPhase > 1 ? newThPhase - 1 : 0,
        correctCount: existingTh.correctCount,
        incorrectCount: existingTh.incorrectCount,
      };

      const combinedPhase = Math.min(newDePhase, newThPhase);
      const combinedNextReview =
        new Date(deNextReview).getTime() <= new Date(thNextReview).getTime() ? deNextReview : thNextReview;

      const p: UserProgress = {
        id: `${userId}_${vId}`,
        userId,
        vocabId: vId,
        phase: combinedPhase,
        nextReviewDate: combinedNextReview,
        lastReviewedAt: existing?.lastReviewedAt,
        streak: combinedPhase > 1 ? combinedPhase - 1 : 0,
        correctCount: existing?.correctCount || 0,
        incorrectCount: existing?.incorrectCount || 0,
        updatedAt: now,
        deToTh: newDeToTh,
        thToDe: newThToDe,
      };
      map[vId] = p;
      updatedMap[vId] = p;
    }
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}

  // 2. Batch update Firestore
  try {
    const batch = writeBatch(db);
    for (const [vId, p] of Object.entries(updatedMap)) {
      const ref = doc(db, PROGRESS_COLLECTION, p.id);
      batch.set(ref, p);
    }
    await batch.commit();
  } catch (err) {
    console.warn('Error stepping back lesson phases in Firestore:', err);
  }

  return updatedMap;
}

/**
 * Add multiple vocabulary items to a user's Leitner deck with optional custom initial phase
 */
export async function addBatchToUserDeck(
  userId: string,
  items: DeckItemInput[]
): Promise<void> {
  if (!items.length) return;
  const now = new Date().toISOString();

  // Normalize inputs
  const normalized: { vocabId: string; phase: number; phaseDeToTh: number; phaseThToDe: number }[] = items.map((it) => {
    if (typeof it === 'string') return { vocabId: it, phase: 1, phaseDeToTh: 1, phaseThToDe: 1 };
    const p = it.phase && it.phase >= 1 && it.phase <= 6 ? it.phase : 1;
    const pDe = it.phaseDeToTh && it.phaseDeToTh >= 1 && it.phaseDeToTh <= 6 ? it.phaseDeToTh : p;
    const pTh = it.phaseThToDe && it.phaseThToDe >= 1 && it.phaseThToDe <= 6 ? it.phaseThToDe : p;
    return { vocabId: it.vocabId, phase: Math.min(pDe, pTh), phaseDeToTh: pDe, phaseThToDe: pTh };
  });

  // Save to local cache
  try {
    const key = `${LOCAL_PROGRESS_KEY}_${userId}`;
    const cached = localStorage.getItem(key) || localStorage.getItem(`${LEGACY_PROGRESS_KEY}_${userId}`);
    const map = cached ? JSON.parse(cached) : {};
    for (const { vocabId, phase, phaseDeToTh, phaseThToDe } of normalized) {
      const deNextReview = calculateNextReviewDate(phaseDeToTh);
      const thNextReview = calculateNextReviewDate(phaseThToDe);
      const combinedReview =
        new Date(deNextReview).getTime() <= new Date(thNextReview).getTime() ? deNextReview : thNextReview;

      const deDirProg: DirectionProgress = {
        phase: phaseDeToTh,
        nextReviewDate: deNextReview,
        lastReviewedAt: undefined,
        streak: phaseDeToTh > 1 ? phaseDeToTh - 1 : 0,
        correctCount: phaseDeToTh > 1 ? phaseDeToTh - 1 : 0,
        incorrectCount: 0,
      };

      const thDirProg: DirectionProgress = {
        phase: phaseThToDe,
        nextReviewDate: thNextReview,
        lastReviewedAt: undefined,
        streak: phaseThToDe > 1 ? phaseThToDe - 1 : 0,
        correctCount: phaseThToDe > 1 ? phaseThToDe - 1 : 0,
        incorrectCount: 0,
      };

      map[vocabId] = {
        id: `${userId}_${vocabId}`,
        userId,
        vocabId,
        phase,
        nextReviewDate: combinedReview,
        streak: phase > 1 ? phase - 1 : 0,
        correctCount: phase > 1 ? phase - 1 : 0,
        incorrectCount: 0,
        updatedAt: now,
        deToTh: deDirProg,
        thToDe: thDirProg,
      };
    }
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}

  // Sync batch to Firestore
  try {
    const batch = writeBatch(db);
    for (const { vocabId, phase, phaseDeToTh, phaseThToDe } of normalized) {
      const id = `${userId}_${vocabId}`;
      const ref = doc(db, PROGRESS_COLLECTION, id);
      const deNextReview = calculateNextReviewDate(phaseDeToTh);
      const thNextReview = calculateNextReviewDate(phaseThToDe);
      const combinedReview =
        new Date(deNextReview).getTime() <= new Date(thNextReview).getTime() ? deNextReview : thNextReview;

      const deDirProg: DirectionProgress = {
        phase: phaseDeToTh,
        nextReviewDate: deNextReview,
        lastReviewedAt: undefined,
        streak: phaseDeToTh > 1 ? phaseDeToTh - 1 : 0,
        correctCount: phaseDeToTh > 1 ? phaseDeToTh - 1 : 0,
        incorrectCount: 0,
      };

      const thDirProg: DirectionProgress = {
        phase: phaseThToDe,
        nextReviewDate: thNextReview,
        lastReviewedAt: undefined,
        streak: phaseThToDe > 1 ? phaseThToDe - 1 : 0,
        correctCount: phaseThToDe > 1 ? phaseThToDe - 1 : 0,
        incorrectCount: 0,
      };

      batch.set(ref, {
        id,
        userId,
        vocabId,
        phase,
        nextReviewDate: combinedReview,
        streak: phase > 1 ? phase - 1 : 0,
        correctCount: phase > 1 ? phase - 1 : 0,
        incorrectCount: 0,
        updatedAt: now,
        deToTh: deDirProg,
        thToDe: thDirProg,
      });
    }
    await batch.commit();
  } catch (error) {
    console.warn('Batch add error (saved locally):', error);
  }
}

/**
 * Rename a lesson across all vocabularies in local cache & Firestore
 */
export async function renameLesson(oldName: string, newName: string): Promise<number> {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return 0;

  // 1. Local update
  const list = getCachedVocabs();
  let updatedCount = 0;
  const updatedList = list.map((v) => {
    if (v.lesson === cleanOld) {
      updatedCount++;
      return { ...v, lesson: cleanNew };
    }
    return v;
  });
  saveCachedVocabs(updatedList);

  // 2. Firestore batch update
  try {
    const q = query(collection(db, VOCAB_COLLECTION), where('lesson', '==', cleanOld));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.forEach((d) => {
        batch.update(d.ref, { lesson: cleanNew });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('Error renaming lesson in Firestore:', err);
  }

  return updatedCount;
}

/**
 * Delete a lesson: either delete all its vocabularies or move them to another lesson.
 * If deleting cards, adds them to deleted history so they can be restored in Settings.
 */
export async function deleteLesson(
  lessonName: string,
  deleteVocabs: boolean,
  moveToLesson = 'Allgemein',
  userId?: string
): Promise<number> {
  const cleanLesson = lessonName.trim();
  if (!cleanLesson) return 0;

  // Add lesson to user deleted lessons list
  if (deleteVocabs) {
    const deletedLessons = getDeletedLessons(userId);
    if (!deletedLessons.includes(cleanLesson)) {
      deletedLessons.push(cleanLesson);
      saveDeletedLessons(deletedLessons, userId);
    }
  }

  const list = getCachedVocabs();
  const matched = list.filter((v) => v.lesson === cleanLesson);
  const matchedIds = matched.map((v) => v.id);

  if (deleteVocabs) {
    // Record matched vocabs in user's deleted history
    if (matched.length > 0) {
      const deletedList = getDeletedVocabs(userId);
      const now = new Date().toISOString();
      for (const vocab of matched) {
        if (!deletedList.some((e) => e.vocab.id === vocab.id)) {
          deletedList.unshift({
            vocab,
            deletedAt: now,
          });
        }
      }
      saveDeletedVocabs(deletedList, userId);
    }

    // Remove from local cache
    const remaining = list.filter((v) => v.lesson !== cleanLesson);
    saveCachedVocabs(remaining);

    // Remove from Firestore
    try {
      const batch = writeBatch(db);
      for (const id of matchedIds) {
        batch.delete(doc(db, VOCAB_COLLECTION, id));
      }
      await batch.commit();
    } catch (err) {
      console.warn('Error deleting lesson vocabularies in Firestore:', err);
    }
  } else {
    // Move to another lesson
    await renameLesson(cleanLesson, moveToLesson);
  }

  return matchedIds.length;
}

/**
 * Move multiple vocabularies to a target lesson
 */
export async function moveVocabulariesToLesson(
  vocabIds: string[],
  targetLesson: string
): Promise<number> {
  const cleanTarget = targetLesson.trim();
  if (!vocabIds.length || !cleanTarget) return 0;

  // 1. Local update
  const list = getCachedVocabs();
  const idSet = new Set(vocabIds);
  const updatedList = list.map((v) => (idSet.has(v.id) ? { ...v, lesson: cleanTarget } : v));
  saveCachedVocabs(updatedList);

  // 2. Firestore update
  try {
    const batch = writeBatch(db);
    for (const id of vocabIds) {
      batch.update(doc(db, VOCAB_COLLECTION, id), { lesson: cleanTarget });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Error moving vocabularies in Firestore:', err);
  }

  return vocabIds.length;
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
 * Supports independent progression for both directions ('de_to_th' and 'th_to_de').
 */
export async function recordReviewResult(
  userId: string,
  vocabId: string,
  currentProgress: UserProgress | undefined,
  isCorrect: boolean,
  direction: QueryDirection = 'de_to_th'
): Promise<UserProgress> {
  const now = new Date().toISOString();

  // Retrieve directional progress for both directions
  const curDirProg = getDirectionProgress(currentProgress, direction);
  const otherDirection: QueryDirection = direction === 'de_to_th' ? 'th_to_de' : 'de_to_th';
  const otherDirProg = getDirectionProgress(currentProgress, otherDirection);

  let nextDirPhase: number;
  let nextDirReviewDate: string;

  if (isCorrect) {
    nextDirPhase = Math.min(6, curDirProg.phase + 1);
    nextDirReviewDate = calculateNextReviewDate(nextDirPhase);
  } else {
    nextDirPhase = 1;
    nextDirReviewDate = calculateResetReviewDate();
  }

  const updatedTargetDir: DirectionProgress = {
    phase: nextDirPhase,
    nextReviewDate: nextDirReviewDate,
    lastReviewedAt: now,
    streak: isCorrect ? (curDirProg.streak || 0) + 1 : 0,
    correctCount: (curDirProg.correctCount || 0) + (isCorrect ? 1 : 0),
    incorrectCount: (curDirProg.incorrectCount || 0) + (!isCorrect ? 1 : 0),
  };

  const updatedDeToTh = direction === 'de_to_th' ? updatedTargetDir : otherDirProg;
  const updatedThToDe = direction === 'th_to_de' ? updatedTargetDir : otherDirProg;

  // The overall phase reflects the minimum mastered phase between both directions
  const combinedPhase = Math.min(updatedDeToTh.phase, updatedThToDe.phase);

  // Overall next review date is the earlier of the two
  const combinedNextReviewDate =
    new Date(updatedDeToTh.nextReviewDate).getTime() <= new Date(updatedThToDe.nextReviewDate).getTime()
      ? updatedDeToTh.nextReviewDate
      : updatedThToDe.nextReviewDate;

  const updated: UserProgress = {
    id: `${userId}_${vocabId}`,
    userId,
    vocabId,
    phase: combinedPhase,
    nextReviewDate: combinedNextReviewDate,
    lastReviewedAt: now,
    streak: isCorrect ? (currentProgress?.streak || 0) + 1 : 0,
    correctCount: (currentProgress?.correctCount || 0) + (isCorrect ? 1 : 0),
    incorrectCount: (currentProgress?.incorrectCount || 0) + (!isCorrect ? 1 : 0),
    updatedAt: now,
    deToTh: updatedDeToTh,
    thToDe: updatedThToDe,
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
