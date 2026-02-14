
import React, { useState, useRef, useEffect } from 'react';
import { Feedback } from '../types';

interface AnalysisViewProps {
  topicTitle: string;
  videoUrl: string;
  feedback: Feedback;
  onComplete: () => void;
  onRetry: () => void;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({ topicTitle, videoUrl, feedback, onComplete, onRetry }) => {
  const [hasRewatched, setHasRewatched] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const p = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(p);
      if (p > 99) {
        setHasRewatched(true);
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-12">
      {/* Question Header - Left Aligned */}
      <div className="text-left space-y-4">
        <span className="inline-block px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-[0.2em]">Session Review</span>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight tracking-tight max-w-4xl">
          {topicTitle}
        </h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        {/* Video Player */}
        <div className="space-y-6">
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video shadow-2xl ring-1 ring-slate-200">
            <video 
              ref={videoRef}
              src={videoUrl} 
              controls 
              onTimeUpdate={handleTimeUpdate}
              className="w-full h-full"
            />
            {!hasRewatched && (
              <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md text-slate-900 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-xl ring-1 ring-slate-100">
                Rewatch fully to complete
              </div>
            )}
          </div>
          <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
            <div 
              className={`h-full transition-all duration-300 ${hasRewatched ? 'bg-emerald-500' : 'bg-emerald-600'}`} 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Feedback Section */}
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Coach Feedback</h2>
              <div className="text-right">
                <span className="block text-4xl font-black text-emerald-600">{feedback.score}</span>
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Score</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Strengths
                </h3>
                <ul className="space-y-2">
                  {feedback.strengths.map((s, i) => (
                    <li key={i} className="text-slate-600 text-sm font-medium leading-relaxed bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/30">{s}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-600" />
                  Growth areas
                </h3>
                <ul className="space-y-2">
                  {feedback.improvements.map((s, i) => (
                    <li key={i} className="text-slate-600 text-sm font-medium leading-relaxed bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/30">{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-slate-50/50 p-6 rounded-xl border border-slate-100">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Refined Transcript</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed max-h-40 overflow-y-auto pr-4 italic">
              "{feedback.transcript}"
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pb-20">
        <button 
          onClick={onRetry}
          className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-slate-100 text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all font-bold text-lg"
        >
          Retry Session
        </button>
        <button 
          disabled={!hasRewatched}
          onClick={onComplete}
          className={`
            w-full sm:w-auto px-12 py-4 rounded-xl font-black text-lg transition-all shadow-xl
            ${hasRewatched 
              ? 'bg-slate-900 text-white hover:bg-black shadow-slate-200 hover:scale-105' 
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'}
          `}
        >
          {hasRewatched ? 'Complete Challenge' : 'Finish Rewatch to Complete'}
        </button>
      </div>
    </div>
  );
};

export default AnalysisView;
