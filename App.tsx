
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppStage, ChallengeProgress, Feedback, Topic } from './types';
import { CHALLENGE_TOPICS, APP_STORAGE_KEY } from './constants';
import Dashboard from './components/Dashboard';
import RecordingSession from './components/RecordingSession';
import AnalysisView from './components/AnalysisView';
import { getAnalysis, getTTSAudio, generateReplacementQuestion } from './services/geminiService';
import { decode, decodeAudioData } from './services/audioUtils';

const App: React.FC = () => {
  const [stage, setStage] = useState<AppStage>(AppStage.DASHBOARD);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [progress, setProgress] = useState<ChallengeProgress[]>([]);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [currentFeedback, setCurrentFeedback] = useState<Feedback | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [hasSwappedOnce, setHasSwappedOnce] = useState(false);

  // Audio management for TTS
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsCtxRef = useRef<AudioContext | null>(null);

  // Load progress
  useEffect(() => {
    const saved = localStorage.getItem(APP_STORAGE_KEY);
    if (saved) {
      try {
        setProgress(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load progress", e);
      }
    }
    return () => stopCurrentSpeech();
  }, []);

  const saveProgress = useCallback((newProgress: ChallengeProgress[]) => {
    setProgress(newProgress);
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(newProgress));
  }, []);

  const stopCurrentSpeech = () => {
    if (ttsSourceRef.current) {
      try { ttsSourceRef.current.stop(); } catch (e) {}
      ttsSourceRef.current = null;
    }
    window.speechSynthesis.cancel();
  };

  const speakQuestion = async (text: string) => {
    stopCurrentSpeech();
    try {
      const base64Audio = await getTTSAudio(text);
      if (base64Audio) {
        if (!ttsCtxRef.current) {
          ttsCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = ttsCtxRef.current;
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        ttsSourceRef.current = source;
        source.start();
      }
    } catch (err) {
      console.error("Gemini TTS failed, falling back to basic synthesis", err);
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const resetToHome = () => {
    stopCurrentSpeech();
    setStage(AppStage.DASHBOARD);
    setSelectedDay(null);
    setCurrentTopic(null);
    setCurrentVideoUrl(null);
    setCurrentFeedback(null);
    setHasSwappedOnce(false);
    setIsSwapping(false);
  };

  const handleLogoClick = () => {
    if (stage === AppStage.RECORDING) {
      if (confirm('Stop recording and return to home?')) {
        resetToHome();
      }
    } else {
      resetToHome();
    }
  };

  const handleDaySelect = async (day: number) => {
    const topic = CHALLENGE_TOPICS.find(t => t.id === day);
    if (topic) {
      setCurrentTopic(topic);
      speakQuestion(topic.title);
    }
    setSelectedDay(day);
    setStage(AppStage.TOPIC_PREVIEW);
    setHasSwappedOnce(false);
  };

  const handleSwapQuestion = async () => {
    if (!selectedDay || hasSwappedOnce) return;
    
    setIsSwapping(true);
    try {
      const newTopic = await generateReplacementQuestion(selectedDay);
      setCurrentTopic(newTopic);
      setHasSwappedOnce(true);
      speakQuestion(newTopic.title);
    } catch (err) {
      console.error("Failed to swap question", err);
    } finally {
      setIsSwapping(false);
    }
  };

  const startChallenge = () => {
    stopCurrentSpeech();
    setStage(AppStage.RECORDING);
  };

  const handleFinishRecording = async (videoBlob: Blob, transcript: string) => {
    setIsLoading(true);
    setStage(AppStage.ANALYSIS);
    
    const url = URL.createObjectURL(videoBlob);
    setCurrentVideoUrl(url);

    const feedback = await getAnalysis(transcript, currentTopic?.title || "Unknown Topic");
    setCurrentFeedback(feedback);
    setIsLoading(false);
  };

  const completeDay = () => {
    if (selectedDay === null) return;
    
    const newProgress = [...progress];
    const existingIndex = newProgress.findIndex(p => p.day === selectedDay);
    
    const dayData: ChallengeProgress = {
      day: selectedDay,
      completed: true,
      timestamp: Date.now(),
      feedback: currentFeedback || undefined
    };

    if (existingIndex > -1) {
      newProgress[existingIndex] = dayData;
    } else {
      newProgress.push(dayData);
    }

    saveProgress(newProgress);
    resetToHome();
  };

  const renderContent = () => {
    switch (stage) {
      case AppStage.DASHBOARD:
        return <Dashboard progress={progress} onSelectDay={handleDaySelect} />;
      
      case AppStage.TOPIC_PREVIEW:
        if (!currentTopic) return null;
        return (
          <div className="max-w-3xl mx-auto mt-20 p-12 bg-white rounded-2xl border border-slate-100 shadow-2xl shadow-slate-200/50 text-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col items-center gap-4">
              <span className="inline-block px-5 py-2 bg-emerald-50 text-emerald-600 rounded-full text-xs font-black uppercase tracking-[0.2em]">Day {selectedDay} Prompt</span>
              {hasSwappedOnce && (
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full">Swapped with AI</span>
              )}
            </div>
            
            <div className="min-h-[140px] flex items-center justify-center px-4">
              {isSwapping ? (
                <div className="flex flex-col items-center gap-4 text-slate-400">
                  <div className="w-8 h-8 border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin" />
                  <span className="font-bold text-lg animate-pulse">Brainstorming...</span>
                </div>
              ) : (
                <h1 className="text-4xl font-black text-slate-900 leading-[1.3] tracking-tight">{currentTopic.title}</h1>
              )}
            </div>

            <p className="text-slate-400 text-lg font-medium italic">"Click the button below when you're ready to speak."</p>
            
            <div className="pt-6 flex flex-col items-center gap-6">
              <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                <button 
                  onClick={resetToHome} 
                  className="px-10 py-4 rounded-xl border-2 border-slate-100 text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all font-bold text-lg"
                >
                  Maybe later
                </button>
                <button 
                  onClick={startChallenge} 
                  disabled={isSwapping}
                  className="px-12 py-4 rounded-xl bg-slate-900 hover:bg-black text-white font-black text-xl shadow-xl shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  Start Recording
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/></svg>
                </button>
              </div>

              {!hasSwappedOnce && !isSwapping && (
                <button 
                  onClick={handleSwapQuestion}
                  className="flex items-center gap-2 text-emerald-500 hover:text-emerald-700 font-bold text-sm uppercase tracking-widest transition-all p-3 rounded-xl hover:bg-emerald-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15" /></svg>
                  Swap Question (Once)
                </button>
              )}
            </div>
          </div>
        );

      case AppStage.RECORDING:
        if (!currentTopic) return null;
        return (
          <RecordingSession 
            topic={currentTopic} 
            onFinish={handleFinishRecording} 
            onCancel={resetToHome} 
          />
        );

      case AppStage.ANALYSIS:
        if (isLoading) {
          return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8">
              <div className="relative">
                <div className="w-20 h-20 border-8 border-slate-100 border-t-emerald-600 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center font-black text-slate-200">AI</div>
              </div>
              <div className="text-center">
                <p className="text-3xl font-black text-slate-900 tracking-tight">Processing your speak...</p>
                <p className="text-slate-400 mt-3 font-medium text-lg">Analyzing flow, energy, and transcript quality.</p>
              </div>
            </div>
          );
        }
        if (!currentVideoUrl || !currentFeedback || !currentTopic) return null;
        return (
          <AnalysisView 
            topicTitle={currentTopic.title}
            videoUrl={currentVideoUrl} 
            feedback={currentFeedback} 
            onComplete={completeDay}
            onRetry={() => setStage(AppStage.RECORDING)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white selection:bg-emerald-100">
      <nav className="px-10 py-6 border-b border-slate-50 flex justify-between items-center bg-white/90 backdrop-blur-xl sticky top-0 z-40 transition-all">
        <button onClick={handleLogoClick} className="flex items-center gap-4 group">
          <span className="font-black text-2xl tracking-tighter text-slate-900">Speak<span className="text-emerald-600">Up</span></span>
        </button>
        {stage !== AppStage.DASHBOARD && (
          <button 
            onClick={handleLogoClick}
            className="text-slate-400 hover:text-red-500 text-[10px] font-black uppercase tracking-[0.25em] transition-all bg-slate-50 px-5 py-2.5 rounded-lg hover:bg-red-50"
          >
            End Session
          </button>
        )}
      </nav>
      
      <main className="container mx-auto px-6">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
