import React, { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ActiveTab, Vocabulary, UserProgress } from './types/vocab';
import {
  fetchCommunityVocabularies,
  fetchUserProgress,
  addVocabulary,
  updateVocabulary,
  deleteVocabulary,
  restoreVocabulary,
  addBatchToUserDeck,
  recordReviewResult,
  addVocabToUserDeck,
  syncLocalVocabulariesToCloud,
  subscribeToCommunityVocabularies,
  renameLesson,
  deleteLesson,
  moveVocabulariesToLesson,
  updateVocabPhase,
  resetVocabsToPhaseOne,
  stepBackLessonPhase,
} from './services/vocabService';
import { Navigation } from './components/Navigation';
import { LearnView } from './components/LearnView';
import { PoolView } from './components/PoolView';
import { CreateView } from './components/CreateView';
import { SettingsView } from './components/SettingsView';
import { StudySession, StudyMode, StudyDirection, StudyInputMethod } from './components/StudySession';
import { AuthModal } from './components/AuthModal';
import { isCardDue } from './utils/leitner';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('learn');
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, UserProgress>>({});
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  // Active study session state
  const [activeSession, setActiveSession] = useState<{
    cards: { vocab: Vocabulary; progress?: UserProgress }[];
    mode: StudyMode;
    direction: StudyDirection;
    inputMethod: StudyInputMethod;
  } | null>(null);

  // User preference: default hide romanization
  const [defaultHideRomanization, setDefaultHideRomanization] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('thai_hasis_hide_romanization') || localStorage.getItem('phase6_hide_romanization');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  // User preference: default typing input mode
  const [defaultInputMethod, setDefaultInputMethod] = useState<StudyInputMethod>(() => {
    try {
      const stored = localStorage.getItem('thai_hasis_default_input_method') || localStorage.getItem('phase6_default_input_method');
      return (stored as StudyInputMethod) || 'typing';
    } catch {
      return 'typing';
    }
  });

  // User preference: default study direction
  const [studyDirection, setStudyDirection] = useState<StudyDirection>(() => {
    try {
      const stored = localStorage.getItem('thai_hasis_study_direction') || localStorage.getItem('phase6_study_direction');
      return (stored as StudyDirection) || 'both';
    } catch {
      return 'both';
    }
  });

  // User preference: default study mode
  const [studyMode, setStudyMode] = useState<StudyMode>(() => {
    try {
      const stored = localStorage.getItem('thai_hasis_study_mode') || localStorage.getItem('phase6_study_mode');
      return (stored as StudyMode) || 'skip_preview';
    } catch {
      return 'skip_preview';
    }
  });

  // User preference: accept romanization when typing
  const [acceptRomanizationTyping, setAcceptRomanizationTyping] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('thai_hasis_accept_romanization') || localStorage.getItem('phase6_accept_romanization');
      return stored !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleHideRomanization = (val: boolean) => {
    setDefaultHideRomanization(val);
    try {
      localStorage.setItem('thai_hasis_hide_romanization', String(val));
    } catch {}
  };

  const handleToggleDefaultInputMethod = (val: StudyInputMethod) => {
    setDefaultInputMethod(val);
    try {
      localStorage.setItem('thai_hasis_default_input_method', val);
    } catch {}
  };

  const handleToggleStudyDirection = (val: StudyDirection) => {
    setStudyDirection(val);
    try {
      localStorage.setItem('thai_hasis_study_direction', val);
    } catch {}
  };

  const handleToggleStudyMode = (val: StudyMode) => {
    setStudyMode(val);
    try {
      localStorage.setItem('thai_hasis_study_mode', val);
    } catch {}
  };

  const handleUpdateStudyPreferences = (
    mode: StudyMode,
    direction: StudyDirection,
    inputMethod: StudyInputMethod
  ) => {
    setStudyMode(mode);
    setStudyDirection(direction);
    setDefaultInputMethod(inputMethod);
    try {
      localStorage.setItem('thai_hasis_study_mode', mode);
      localStorage.setItem('thai_hasis_study_direction', direction);
      localStorage.setItem('thai_hasis_default_input_method', inputMethod);
    } catch {}
  };

  const handleToggleAcceptRomanizationTyping = (val: boolean) => {
    setAcceptRomanizationTyping(val);
    try {
      localStorage.setItem('thai_hasis_accept_romanization', String(val));
    } catch {}
  };

  // Load vocabularies & progress (only when logged in!)
  const loadAllData = async () => {
    if (!user) {
      setVocabularies([]);
      setProgressMap({});
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    try {
      const userId = user.uid;

      // 1. Upload any locally created vocabularies to Firestore so all users see them
      await syncLocalVocabulariesToCloud(userId).catch(() => {});

      // 2. Fetch all shared vocabularies from Firestore (filtering out deleted items)
      const vocabs = await fetchCommunityVocabularies(userId);
      setVocabularies(vocabs);

      const prog = await fetchUserProgress(userId);
      setProgressMap(prog);

      // If user progress is completely empty on fresh install, auto-enroll initial cards into deck
      if (Object.keys(prog).length === 0 && vocabs.length > 0) {
        const initialDeckIds = vocabs.slice(0, 8).map((v) => v.id);
        await addBatchToUserDeck(userId, initialDeckIds);
        const updatedProg = await fetchUserProgress(userId);
        setProgressMap(updatedProg);
      }
    } catch (err) {
      console.error('Data loading error:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        loadAllData();

        // Subscribe to real-time updates from Firestore
        const unsubscribe = subscribeToCommunityVocabularies((remoteVocabs) => {
          setVocabularies(remoteVocabs);
        }, user.uid);

        return () => unsubscribe();
      } else {
        setVocabularies([]);
        setProgressMap({});
        setLoadingData(false);
      }
    }
  }, [authLoading, user?.uid]);

  // Unique lessons list for creation dropdown
  const existingLessons = useMemo(() => {
    const set = new Set<string>();
    vocabularies.forEach((v) => {
      if (v.lesson) set.add(v.lesson);
    });
    return Array.from(set);
  }, [vocabularies]);

  // Due count for badge
  const dueCount = useMemo(() => {
    return vocabularies.filter((v) => {
      const prog = progressMap[v.id];
      return prog && isCardDue(prog.nextReviewDate);
    }).length;
  }, [vocabularies, progressMap]);

  // Answer handler in active study session
  const handleAnswerReview = async (vocabId: string, isCorrect: boolean): Promise<UserProgress> => {
    if (!user) throw new Error('Nicht angemeldet');
    const userId = user.uid;
    const curProg = progressMap[vocabId];
    const updated = await recordReviewResult(userId, vocabId, curProg, isCorrect);
    setProgressMap((prev) => ({
      ...prev,
      [vocabId]: updated,
    }));
    return updated;
  };

  // Add new vocabulary handler
  const handleAddVocab = async (newVocab: Omit<Vocabulary, 'id' | 'createdAt'>) => {
    if (!user) return;
    const userId = user.uid;
    const created = await addVocabulary(newVocab, userId);
    setVocabularies((prev) => [created, ...prev]);

    // Update progress
    const updatedProgress = await fetchUserProgress(userId);
    setProgressMap(updatedProgress);
  };

  // Batch add to deck
  const handleBatchAddToDeck = async (vocabIds: string[]) => {
    if (!user) return;
    const userId = user.uid;
    await addBatchToUserDeck(userId, vocabIds);
    const updated = await fetchUserProgress(userId);
    setProgressMap(updated);
  };

  // Import handler with phase support (phase applied ONLY to current user's progress)
  const handleImportVocabs = async (
    items: (Omit<Vocabulary, 'id' | 'createdAt'> & { phase?: number })[]
  ): Promise<number> => {
    if (!user) return 0;
    const userId = user.uid;
    let count = 0;
    const addedDeckItems: { vocabId: string; phase: number }[] = [];

    for (const item of items) {
      const { phase, ...vocabData } = item;
      const created = await addVocabulary(vocabData, userId);
      setVocabularies((prev) => [created, ...prev]);
      addedDeckItems.push({
        vocabId: created.id,
        phase: phase && phase >= 1 && phase <= 6 ? phase : 1,
      });
      count++;
    }

    if (addedDeckItems.length > 0) {
      await addBatchToUserDeck(userId, addedDeckItems);
      const updated = await fetchUserProgress(userId);
      setProgressMap(updated);
    }

    return count;
  };

  // Rename lesson across all cards
  const handleRenameLesson = async (oldName: string, newName: string) => {
    await renameLesson(oldName, newName);
    setVocabularies((prev) =>
      prev.map((v) => (v.lesson === oldName ? { ...v, lesson: newName } : v))
    );
  };

  // Delete lesson
  const handleDeleteLesson = async (lessonName: string, deleteVocabs: boolean, moveToLesson?: string) => {
    const target = moveToLesson || 'Allgemein';
    const userId = user?.uid;
    await deleteLesson(lessonName, deleteVocabs, target, userId);
    if (deleteVocabs) {
      setVocabularies((prev) => prev.filter((v) => v.lesson !== lessonName));
    } else {
      setVocabularies((prev) =>
        prev.map((v) => (v.lesson === lessonName ? { ...v, lesson: target } : v))
      );
    }
  };

  // Move vocabularies to another lesson
  const handleMoveVocabs = async (vocabIds: string[], targetLesson: string) => {
    await moveVocabulariesToLesson(vocabIds, targetLesson);
    const idSet = new Set(vocabIds);
    setVocabularies((prev) =>
      prev.map((v) => (idSet.has(v.id) ? { ...v, lesson: targetLesson } : v))
    );
  };

  // Update existing vocabulary handler
  const handleUpdateVocab = async (
    id: string,
    updatedData: Partial<Omit<Vocabulary, 'id' | 'createdAt'>>
  ) => {
    if (!user) return;
    const userId = user.uid;
    const updated = await updateVocabulary(id, updatedData, userId);
    setVocabularies((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...updated } : v))
    );
  };

  // Delete vocabulary handler
  const handleDeleteVocab = async (id: string) => {
    if (!user) return;
    const userId = user.uid;
    const targetVocab = vocabularies.find((v) => v.id === id);
    await deleteVocabulary(id, userId, targetVocab);
    setVocabularies((prev) => prev.filter((v) => v.id !== id));
    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Restore vocabulary handler
  const handleRestoreVocab = async (id: string) => {
    if (!user) return;
    const userId = user.uid;
    const restored = await restoreVocabulary(id, userId);
    if (restored) {
      setVocabularies((prev) => {
        if (prev.some((v) => v.id === restored.id)) return prev;
        return [restored, ...prev];
      });
      const updatedProg = await fetchUserProgress(userId);
      setProgressMap(updatedProg);
    }
  };

  // Step back all vocabularies in a lesson by 1 phase
  const handleStepBackLesson = async (lessonName: string): Promise<number> => {
    if (!user) return 0;
    const userId = user.uid;
    const lessonVocabs = vocabularies.filter((v) => (v.lesson || 'Allgemein') === lessonName);
    const lessonVocabIds = lessonVocabs.map((v) => v.id);
    if (!lessonVocabIds.length) return 0;

    const updatedProgress = await stepBackLessonPhase(userId, lessonVocabIds, progressMap);
    setProgressMap((prev) => ({
      ...prev,
      ...updatedProgress,
    }));
    return lessonVocabIds.length;
  };

  // Reset multiple selected vocabularies to start from Phase 1 (von Anfang an lernen)
  const handleResetVocabsPhase = async (vocabIds: string[]): Promise<number> => {
    if (!user || !vocabIds.length) return 0;
    const userId = user.uid;
    const updatedProgress = await resetVocabsToPhaseOne(userId, vocabIds);
    setProgressMap((prev) => ({
      ...prev,
      ...updatedProgress,
    }));
    return vocabIds.length;
  };

  // Update single vocabulary phase
  const handleUpdateSinglePhase = async (vocabId: string, newPhase: number) => {
    if (!user) return;
    const userId = user.uid;
    const updated = await updateVocabPhase(userId, vocabId, newPhase);
    setProgressMap((prev) => ({
      ...prev,
      [vocabId]: updated,
    }));
  };

  // Start active study session
  const handleStartSession = (
    cards: { vocab: Vocabulary; progress?: UserProgress }[],
    mode: StudyMode,
    direction: StudyDirection,
    inputMethod?: StudyInputMethod
  ) => {
    setActiveSession({
      cards,
      mode,
      direction,
      inputMethod: inputMethod || defaultInputMethod,
    });
  };

  // If active study session is running, render full-screen study interface
  if (activeSession) {
    return (
      <StudySession
        cards={activeSession.cards}
        mode={activeSession.mode}
        direction={activeSession.direction}
        inputMethod={activeSession.inputMethod}
        onFinish={() => setActiveSession(null)}
        onAnswer={handleAnswerReview}
        defaultHideRomanization={defaultHideRomanization}
        acceptRomanizationTyping={acceptRomanizationTyping}
        onUpdateVocab={handleUpdateVocab}
        existingLessons={existingLessons}
      />
    );
  }

  // Lockout for guests: unauthenticated visitors cannot see cards or study
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-[#121214] text-white flex flex-col justify-center items-center p-4 selection:bg-[#FF7A00] selection:text-black">
        <div className="w-full max-w-sm text-center mb-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-[#2E2E32] to-[#1C1C1E] border border-[#3A3A3D] flex items-center justify-center text-3xl shadow-xl mb-3">
            🇹🇭
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Thai Hasis Vokabeltrainer
          </h1>
          <p className="text-xs text-[#8E8E93] mt-1.5 leading-relaxed">
            6-Phasen-Lernsystem & Community-Wortschatz.<br />
            Zugang nur für registrierte Mitglieder.
          </p>
        </div>

        <AuthModal
          isOpen={true}
          onClose={() => {}}
          isClosable={false}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121214] text-white flex flex-col justify-between selection:bg-[#FF7A00] selection:text-black">
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto">
        {loadingData ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <div className="w-10 h-10 border-3 border-[#FF7A00] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[#8E8E93] font-medium">Lade Thai Hasis Vokabeltrainer...</p>
          </div>
        ) : (
          <>
            {activeTab === 'learn' && (
              <LearnView
                vocabularies={vocabularies}
                progressMap={progressMap}
                studyMode={studyMode}
                studyDirection={studyDirection}
                defaultInputMethod={defaultInputMethod}
                onUpdateStudyPreferences={handleUpdateStudyPreferences}
                onStartSession={handleStartSession}
                onNavigatePool={() => setActiveTab('pool')}
                onNavigateCreate={() => setActiveTab('create')}
              />
            )}

            {activeTab === 'pool' && (
              <PoolView
                vocabularies={vocabularies}
                progressMap={progressMap}
                onSelectForStudy={(selected) => {
                  handleStartSession(selected, studyMode, studyDirection, defaultInputMethod);
                }}
                onAddBatchToDeck={handleBatchAddToDeck}
                onNavigateCreate={() => setActiveTab('create')}
                onUpdateVocab={handleUpdateVocab}
                onDeleteVocab={handleDeleteVocab}
                onRenameLesson={handleRenameLesson}
                onDeleteLesson={handleDeleteLesson}
                onMoveVocabs={handleMoveVocabs}
                onStepBackLesson={handleStepBackLesson}
                onResetVocabsPhase={handleResetVocabsPhase}
                onUpdateSinglePhase={handleUpdateSinglePhase}
                existingLessons={existingLessons}
              />
            )}

            {activeTab === 'create' && (
              <CreateView
                existingLessons={existingLessons}
                onAddVocab={handleAddVocab}
                onSuccessNavigate={() => setActiveTab('pool')}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                vocabularies={vocabularies}
                progressMap={progressMap}
                onImportVocabs={handleImportVocabs}
                onRestoreVocab={handleRestoreVocab}
                defaultHideRomanization={defaultHideRomanization}
                onToggleDefaultHideRomanization={handleToggleHideRomanization}
                defaultInputMethod={defaultInputMethod}
                onToggleDefaultInputMethod={handleToggleDefaultInputMethod}
                acceptRomanizationTyping={acceptRomanizationTyping}
                onToggleAcceptRomanizationTyping={handleToggleAcceptRomanizationTyping}
                studyMode={studyMode}
                onToggleStudyMode={handleToggleStudyMode}
                studyDirection={studyDirection}
                onToggleStudyDirection={handleToggleStudyDirection}
                onOpenAuthModal={() => setAuthModalOpen(true)}
                onRefreshData={loadAllData}
              />
            )}
          </>
        )}
      </main>

      {/* iOS Bottom Navigation Bar */}
      <Navigation
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        dueCount={dueCount}
      />

      {/* Firebase Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
