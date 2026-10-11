import React, { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ActiveTab, Vocabulary, UserProgress } from './types/vocab';
import {
  fetchCommunityVocabularies,
  fetchUserProgress,
  addVocabulary,
  updateVocabulary,
  deleteVocabulary,
  addBatchToUserDeck,
  recordReviewResult,
  addVocabToUserDeck,
  syncLocalVocabulariesToCloud,
  subscribeToCommunityVocabularies,
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
      return localStorage.getItem('phase6_hide_romanization') === 'true';
    } catch {
      return false;
    }
  });

  // User preference: default typing input mode
  const [defaultInputMethod, setDefaultInputMethod] = useState<StudyInputMethod>(() => {
    try {
      const stored = localStorage.getItem('phase6_default_input_method');
      return (stored as StudyInputMethod) || 'typing';
    } catch {
      return 'typing';
    }
  });

  // User preference: default study direction
  const [studyDirection, setStudyDirection] = useState<StudyDirection>(() => {
    try {
      const stored = localStorage.getItem('phase6_study_direction');
      return (stored as StudyDirection) || 'both';
    } catch {
      return 'both';
    }
  });

  // User preference: default study mode
  const [studyMode, setStudyMode] = useState<StudyMode>(() => {
    try {
      const stored = localStorage.getItem('phase6_study_mode');
      return (stored as StudyMode) || 'skip_preview';
    } catch {
      return 'skip_preview';
    }
  });

  // User preference: accept romanization when typing
  const [acceptRomanizationTyping, setAcceptRomanizationTyping] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('phase6_accept_romanization');
      return stored !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleHideRomanization = (val: boolean) => {
    setDefaultHideRomanization(val);
    try {
      localStorage.setItem('phase6_hide_romanization', String(val));
    } catch {}
  };

  const handleToggleDefaultInputMethod = (val: StudyInputMethod) => {
    setDefaultInputMethod(val);
    try {
      localStorage.setItem('phase6_default_input_method', val);
    } catch {}
  };

  const handleToggleStudyDirection = (val: StudyDirection) => {
    setStudyDirection(val);
    try {
      localStorage.setItem('phase6_study_direction', val);
    } catch {}
  };

  const handleToggleStudyMode = (val: StudyMode) => {
    setStudyMode(val);
    try {
      localStorage.setItem('phase6_study_mode', val);
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
      localStorage.setItem('phase6_study_mode', mode);
      localStorage.setItem('phase6_study_direction', direction);
      localStorage.setItem('phase6_default_input_method', inputMethod);
    } catch {}
  };

  const handleToggleAcceptRomanizationTyping = (val: boolean) => {
    setAcceptRomanizationTyping(val);
    try {
      localStorage.setItem('phase6_accept_romanization', String(val));
    } catch {}
  };

  // Load vocabularies & progress
  const loadAllData = async () => {
    setLoadingData(true);
    try {
      // 1. Upload any locally created vocabularies to Firestore so all users see them
      await syncLocalVocabulariesToCloud().catch(() => {});

      // 2. Fetch all shared vocabularies from Firestore
      const vocabs = await fetchCommunityVocabularies();
      setVocabularies(vocabs);

      const userId = user?.uid || 'local_guest';
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
      loadAllData();

      // Subscribe to real-time updates from Firestore so new/edited vocabularies appear immediately
      const unsubscribe = subscribeToCommunityVocabularies((remoteVocabs) => {
        setVocabularies(remoteVocabs);
      });

      return () => unsubscribe();
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
    const userId = user?.uid || 'local_guest';
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
    const userId = user?.uid || 'local_guest';
    const created = await addVocabulary(newVocab, userId);
    setVocabularies((prev) => [created, ...prev]);

    // Update progress
    const updatedProgress = await fetchUserProgress(userId);
    setProgressMap(updatedProgress);
  };

  // Batch add to deck
  const handleBatchAddToDeck = async (vocabIds: string[]) => {
    const userId = user?.uid || 'local_guest';
    await addBatchToUserDeck(userId, vocabIds);
    const updated = await fetchUserProgress(userId);
    setProgressMap(updated);
  };

  // CSV Import handler
  const handleImportVocabs = async (
    items: Omit<Vocabulary, 'id' | 'createdAt'>[]
  ): Promise<number> => {
    const userId = user?.uid || 'local_guest';
    let count = 0;
    const addedIds: string[] = [];

    for (const item of items) {
      const created = await addVocabulary(item, userId);
      setVocabularies((prev) => [created, ...prev]);
      addedIds.push(created.id);
      count++;
    }

    if (addedIds.length > 0) {
      await addBatchToUserDeck(userId, addedIds);
      const updated = await fetchUserProgress(userId);
      setProgressMap(updated);
    }

    return count;
  };

  // Update existing vocabulary handler
  const handleUpdateVocab = async (
    id: string,
    updatedData: Partial<Omit<Vocabulary, 'id' | 'createdAt'>>
  ) => {
    const userId = user?.uid || 'local_guest';
    const updated = await updateVocabulary(id, updatedData, userId);
    setVocabularies((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...updated } : v))
    );
  };

  // Delete vocabulary handler
  const handleDeleteVocab = async (id: string) => {
    const userId = user?.uid || 'local_guest';
    await deleteVocabulary(id, userId);
    setVocabularies((prev) => prev.filter((v) => v.id !== id));
    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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

  // If active study session is running, render full-screen phase6 query interface
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

  return (
    <div className="min-h-screen bg-[#121214] text-white flex flex-col justify-between selection:bg-[#FF7A00] selection:text-black">
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto">
        {loadingData ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <div className="w-10 h-10 border-3 border-[#FF7A00] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[#8E8E93] font-medium">Lade phase6 Thai...</p>
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
