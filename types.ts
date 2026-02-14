
export interface ChallengeProgress {
  day: number;
  completed: boolean;
  timestamp?: number;
  videoUrl?: string;
  feedback?: Feedback;
}

export interface Feedback {
  score: number;
  strengths: string[];
  improvements: string[];
  transcript: string;
}

export interface Topic {
  id: number;
  title: string;
  description: string;
  hints: string[]; // Added hints property
}

export enum AppStage {
  DASHBOARD = 'DASHBOARD',
  TOPIC_PREVIEW = 'TOPIC_PREVIEW',
  RECORDING = 'RECORDING',
  ANALYSIS = 'ANALYSIS',
  REWATCH = 'REWATCH'
}
