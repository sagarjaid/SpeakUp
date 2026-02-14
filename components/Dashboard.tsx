
import React from 'react';
import { CHALLENGE_TOPICS } from '../constants';
import { ChallengeProgress } from '../types';

interface DashboardProps {
  progress: ChallengeProgress[];
  onSelectDay: (day: number) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ progress, onSelectDay }) => {
  const getStatusStyle = (day: number) => {
    const p = progress.find(item => item.day === day);
    if (p?.completed) return 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100';
    
    const lastCompleted = progress.filter(p => p.completed).length;
    if (day === lastCompleted + 1) return 'bg-white text-slate-900 border-slate-200 hover:border-emerald-500 hover:shadow-lg shadow-sm ring-2 ring-emerald-50/50';
    
    return 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed grayscale opacity-60';
  };

  const isLocked = (day: number) => {
    const lastCompleted = progress.filter(p => p.completed).length;
    return day > lastCompleted + 1;
  };

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <header className="mb-16 text-center max-w-2xl mx-auto">
        <h1 className="text-5xl font-extrabold mb-4 text-slate-900 tracking-tight">Your 30-Day Journey</h1>
        <p className="text-slate-500 text-lg font-medium">Build confidence on camera with daily AI-assisted practice.</p>
        
        <div className="mt-10 flex flex-col items-center">
          <div className="w-full max-w-md h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-600 transition-all duration-1000 ease-out" 
              style={{ width: `${(progress.filter(p => p.completed).length / 30) * 100}%` }}
            />
          </div>
          <p className="text-sm font-bold mt-4 text-slate-400 uppercase tracking-widest">
            {progress.filter(p => p.completed).length} Days Mastered
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-6">
        {CHALLENGE_TOPICS.map((topic) => (
          <button
            key={topic.id}
            disabled={isLocked(topic.id)}
            onClick={() => onSelectDay(topic.id)}
            className={`
              aspect-square rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-300 transform active:scale-95
              ${getStatusStyle(topic.id)}
              font-black text-2xl relative
            `}
          >
            <span className="mb-1">{topic.id}</span>
            {progress.find(p => p.day === topic.id)?.completed && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
