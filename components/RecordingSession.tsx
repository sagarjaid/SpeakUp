
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Topic } from '../types';
import { encode, decode, decodeAudioData, createBlob } from '../services/audioUtils';

interface RecordingSessionProps {
  topic: Topic;
  onFinish: (videoBlob: Blob, transcript: string) => void;
  onCancel: () => void;
}

const RecordingSession: React.FC<RecordingSessionProps> = ({ topic, onFinish, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);
  const [activeSpeakingTime, setActiveSpeakingTime] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiStatus, setAiStatus] = useState('Initializing AI...');
  const [coachSuggestion, setCoachSuggestion] = useState<string | null>(null);
  const [coveredIndices, setCoveredIndices] = useState<Set<number>>(new Set());
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  
  // Live API refs
  const sessionRef = useRef<any>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Naive 5W Detector
  useEffect(() => {
    const text = transcript.toLowerCase();
    const newCovered = new Set(coveredIndices);
    
    topic.hints.forEach((hint, idx) => {
      const label = hint.split(':')[0].toLowerCase();
      let keywords: string[] = [];
      
      if (label.includes('who')) keywords = ['i ', 'me ', 'my ', 'he ', 'she ', 'they ', 'people ', 'friend', 'person', 'who'];
      if (label.includes('what')) keywords = ['it ', 'thing', 'about', 'task', 'hobby', 'what'];
      if (label.includes('where')) keywords = ['at ', 'in ', 'location', 'place', 'there', 'where', 'city', 'home'];
      if (label.includes('when')) keywords = ['when', 'time', 'day', 'ago', 'year', 'month', 'last', 'yesterday'];
      if (label.includes('why')) keywords = ['because', 'reason', 'since', 'why', 'important', 'impact'];

      if (keywords.some(kw => text.includes(kw))) {
        newCovered.add(idx);
      }
    });

    if (newCovered.size !== coveredIndices.size) {
      setCoveredIndices(newCovered);
    }
  }, [transcript, topic.hints]);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      const container = transcriptContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [transcript]);

  const startMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setAiStatus('Coach Listening...');
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            inputAudioCtxRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioCtx.destination);
          },
          onmessage: async (message) => {
            if (message.serverContent?.inputTranscription) {
              const newText = message.serverContent.inputTranscription.text;
              setTranscript(prev => prev + ' ' + newText);
              setIsSpeaking(true);
              if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
              silenceTimeoutRef.current = setTimeout(() => setIsSpeaking(false), 10000);
            }
            
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioCtxRef.current) {
              const ctx = outputAudioCtxRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              
              setAiStatus('Coach Hinting...');
              setCoachSuggestion("Listen to your coach...");
              setTimeout(() => {
                setAiStatus('Coach Listening...');
                setCoachSuggestion(null);
              }, buffer.duration * 1000 + 500);
            }
          },
          onerror: (e) => console.error('Live API Error', e),
          onclose: () => console.log('Live API Closed'),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are a patient AI speech coach. The user is practicing: "${topic.title}". 
          
          CRITICAL RULES FOR FLOW:
          1. BE EXTREMELY PASSIVE. Stay completely silent while the user speaks.
          2. YOU MUST WAIT FOR AT LEAST 10 SECONDS OF TOTAL SILENCE before saying anything.
          3. If and only if the user is stuck (10s+ silence), provide a VERY SHORT (max 5-8 words) nudge based on the 5W Framework: ${topic.hints.join(', ')}.
          4. Focus your nudge on the next logical 5W point they haven't covered well.
          5. Never interrupt. If they start speaking while you are about to talk, stop immediately (if possible) and stay silent.
          6. Your goal is to keep them going without breaking their concentration.`
        }
      });

      sessionRef.current = await sessionPromise;
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => onFinish(new Blob(chunksRef.current, { type: 'video/webm' }), transcript);
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      onCancel();
    }
  }, [topic, onFinish, onCancel, transcript]);

  useEffect(() => {
    startMedia();
    return () => {
      if (mediaRecorderRef.current) try { mediaRecorderRef.current.stop(); } catch(e) {}
      if (sessionRef.current) sessionRef.current.close();
      if (inputAudioCtxRef.current) inputAudioCtxRef.current.close();
      if (outputAudioCtxRef.current) outputAudioCtxRef.current.close();
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      if (isSpeaking) {
        setTimeLeft(prev => {
          if (prev <= 1) { stopRecording(); return 0; }
          return prev - 1;
        });
        setActiveSpeakingTime(prev => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording, isSpeaking]);

  const stopRecording = () => {
    if (activeSpeakingTime < 60) return;
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const isStopDisabled = activeSpeakingTime < 60;

  return (
    <div className="fixed inset-0 bg-white flex flex-col z-50 overflow-hidden text-slate-900">
      {/* Header */}
      <div className="px-8 py-4 flex justify-between items-center bg-white border-b border-slate-100 relative z-10">
        <div className="flex items-center gap-6">
          <h2 className="text-xl font-extrabold tracking-tight">
            <span className="text-emerald-600">Day {topic.id}:</span> {topic.title}
          </h2>
          {!isSpeaking && isRecording && (
            <span className="bg-amber-50 text-amber-600 text-[10px] px-3 py-1 rounded-full border border-amber-100 uppercase font-bold animate-pulse">
              Speak to resume timer
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-50 text-slate-900 px-5 py-1.5 rounded-lg flex items-center gap-3 border border-slate-100 font-mono font-bold text-lg tabular-nums">
            <div className={`w-2.5 h-2.5 rounded-full ${isSpeaking ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-red-500 px-3 py-1 font-bold text-sm uppercase tracking-widest transition-colors">Cancel</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Hints */}
        <aside className="w-72 bg-slate-50/50 border-r border-slate-100 p-8 flex flex-col gap-8 overflow-y-auto">
          <div className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.25em] font-black text-slate-400">5W Framework</h3>
            <p className="text-[10px] text-slate-400 font-medium">Use these to structure your talk.</p>
          </div>
          <div className="space-y-6">
            {topic.hints.map((hint, idx) => {
              const [label, text] = hint.includes(':') ? hint.split(':') : ['', hint];
              const isCovered = coveredIndices.has(idx);
              return (
                <div key={idx} className="group relative">
                  <div className="flex justify-between items-start">
                    <div className="text-[10px] font-bold text-emerald-500 mb-1.5 opacity-60 uppercase">{label}</div>
                    {isCovered && (
                      <div className="bg-emerald-500 text-white rounded-full p-0.5 animate-in zoom-in duration-300">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </div>
                  <p className={`text-sm font-medium leading-relaxed transition-colors ${isCovered ? 'text-slate-400' : 'text-slate-600'}`}>{text}</p>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Video Area */}
        <div className="flex-1 relative bg-slate-100">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          
          {coachSuggestion && (
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-full max-w-sm">
              <div className="bg-white/95 backdrop-blur-md text-slate-900 px-8 py-5 rounded-xl shadow-2xl text-center font-bold border border-emerald-100 animate-bounce">
                {coachSuggestion}
              </div>
            </div>
          )}

          <div className="absolute top-6 left-6">
             <div className="flex items-center gap-3 bg-white/90 backdrop-blur px-5 py-2.5 rounded-lg border border-slate-100 shadow-sm">
                <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-[11px] uppercase tracking-widest font-black text-slate-600">{aiStatus}</span>
             </div>
          </div>
        </div>

        {/* Right Transcript */}
        <aside className="w-80 bg-white border-l border-slate-100 flex flex-col shadow-2xl z-20">
          <div className="p-6 border-b border-slate-50">
            <h3 className="text-[11px] uppercase tracking-[0.25em] font-black text-slate-400">Real-time Transcript</h3>
          </div>
          <div 
            ref={transcriptContainerRef}
            className="flex-1 overflow-y-auto p-8 space-y-4 scroll-smooth"
          >
            <div className="text-base leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">
              {transcript || <span className="text-slate-300 italic">Listening for speech...</span>}
            </div>
          </div>
          {isStopDisabled && (
            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase mb-3">
                <span>Minimum Progress</span>
                <span className="text-emerald-600">{Math.min(100, Math.floor((activeSpeakingTime/60) * 100))}%</span>
              </div>
              <div className="h-1.5 w-full bg-white rounded-full overflow-hidden border border-slate-200 shadow-inner">
                <div 
                  className="h-full bg-emerald-600 transition-all duration-700 ease-out" 
                  style={{ width: `${Math.min(100, (activeSpeakingTime / 60) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Footer */}
      <div className="p-8 bg-white border-t border-slate-100 flex justify-center items-center relative z-10">
        <button 
          onClick={stopRecording}
          disabled={isStopDisabled}
          className={`
            group relative flex items-center gap-4 font-black px-12 py-4 rounded-xl text-lg transition-all shadow-lg active:scale-95
            ${isStopDisabled 
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed grayscale' 
              : 'bg-slate-900 text-white hover:bg-black shadow-slate-200'}
          `}
        >
          <div className={`w-3.5 h-3.5 rounded-sm ${isStopDisabled ? 'bg-slate-300' : 'bg-red-500'}`} />
          {isStopDisabled ? `SPEAK ${Math.max(0, 60 - activeSpeakingTime)}s MORE` : 'FINISH & ANALYZE'}
        </button>
      </div>
    </div>
  );
};

export default RecordingSession;
