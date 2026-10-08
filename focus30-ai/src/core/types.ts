// Focus30 AI — interconnected adaptive learning model
// Content → AI analysis → Plan → Tasks → Recall → Flashcards → Tests → Errors → Mastery → SRS → Tutor/Coach → Reports → auto replan

export type ID = string;
export type ConceptKind =
  | 'definition' | 'law' | 'term' | 'idea' | 'example'
  | 'relation' | 'memorize' | 'understand' | 'exam';
export type MasteryBand = 'mastered' | 'review' | 'weak' | 'danger';

export interface Concept {
  id: ID; lessonId: ID; title: string; detail: string;
  kind: ConceptKind; needsMemorize: boolean; examWeight: 1 | 2 | 3;
  mastery: number; // 0..100
  stability: number; // days of memory stability (FSRS-lite)
  difficulty: number; // 1..5
  confidence: number; // 1..5 self-reported
  reviews: number; lapses: number;
  avgTimeMs: number;
  lastReview: string | null; nextReview: string;
  forgetRisk: number; // 0..1
  sourceRef: string;
}

export interface Lesson {
  id: ID; unitId: ID; title: string;
  sourceText: string; sourceRef: string;
  concepts: Concept[];
  summary: string; mindmap: MindNode;
  mastery: number;
}

export interface Unit { id: ID; materialId: ID; title: string; lessons: Lesson[]; mastery: number }
export interface Material { id: ID; name: string; color: string; icon: string; units: Unit[]; mastery: number; minutes: number }

export interface MindNode { label: string; children: MindNode[]; color?: string }

export interface StudyPack {
  lessonId: ID; summary: string; notes: string[];
  flashcards: string[]; recallQs: RecallQ[];
  examples: string[]; expectedQs: { q: string; confidence: 'high' | 'mid' | 'low' }[];
  mindmap: MindNode; weakSpots: string[]; reviewPlan: string[]; tasks: string[];
}

export type RecallKind = 'qa' | 'mcq' | 'tf' | 'fill' | 'why' | 'explain' | 'compare' | 'apply' | 'solve' | 'link';
export interface RecallQ {
  id: ID; conceptId: ID; kind: RecallKind; prompt: string;
  choices?: string[]; answer: string; hint: string;
}

export type CardKind = 'qa' | 'cloze' | 'image' | 'occlusion' | 'map' | 'formula' | 'draw';
export interface Flashcard {
  id: ID; conceptId: ID; kind: CardKind; front: string; back: string;
  ease: number; interval: number; due: string; reps: number; lapses: number;
}

export interface Attempt {
  id: ID; date: string; conceptId: ID; kind: string;
  correct: boolean; timeMs: number; confidence: 1 | 2 | 3 | 4 | 5;
}

export interface ErrorEntry {
  id: ID; date: string; conceptId: ID;
  question: string; userAnswer: string; correctAnswer: string;
  reason: string; count: number; lastReview: string | null; resolved: boolean;
}

export interface Task {
  id: ID; title: string; materialId: ID; lessonId?: ID;
  date: string; mins: number; kind: 'study' | 'review' | 'test' | 'recall' | 'custom';
  done: boolean; priority: 1 | 2 | 3;
}

export interface SchedBlock {
  id: ID; day: 0 | 1 | 2 | 3 | 4 | 5 | 6; start: string; end: string;
  label: string; type: 'school' | 'class' | 'busy' | 'exam' | 'free';
}

export interface PlanDay { day: number; date: string; taskIds: string[]; note: string; done: boolean }

export interface ExamPaper {
  id: ID; title: string; materialId: ID; date: string;
  rawText: string; attachments?: string[];
  analysis: { types: string[]; topics: string[]; hotConcepts: string[]; difficulty: string; pattern: string; distribution: { label: string; pct: number }[] };
}

export interface CityB { id: string; name: string; level: number; unlocked: boolean; reason: string }

export interface Milestone { id: ID; title: string; targetDate: string; progress: number; custom: boolean }

export type SourceKind = 'video' | 'article' | 'pdf' | 'book' | 'channel' | 'other';
export interface SourceLink {
  id: ID; title: string; url: string; kind: SourceKind;
  materialId: ID; notes: string; date: string; favorite: boolean;
}

export interface DayLog { date: string; minutes: number; byMaterial: Record<string, number>; attempts: number; correct: number; errors: number; xp: number }

export interface AppState {
  lang: 'ar' | 'en';
  materials: Material[];
  flashcards: Flashcard[];
  recallBank: RecallQ[];
  attempts: Attempt[];
  errors: ErrorEntry[];
  tasks: Task[];
  schedule: SchedBlock[];
  plan: PlanDay[];
  planGoal: string;
  exams: ExamPaper[];
  city: CityB[];
  milestones: Milestone[];
  logs: DayLog[];
  xp: number; streak: number; level: number;
  nightMode: boolean;
  examDate: string;
  targetUni: { uni: string; major: string; target: number; current: number };
  notifPrefs: { forgetting: boolean; daily: boolean; coach: boolean };
  blackouts: { id: ID; title: string; text: string; stage: number }[];
  diagrams: { id: ID; title: string; labels: string[]; masked: boolean }[];
  sources: SourceLink[];
}

export const bandOf = (m: number): MasteryBand =>
  m >= 85 ? 'mastered' : m >= 65 ? 'review' : m >= 40 ? 'weak' : 'danger';

export const bandColor = (b: MasteryBand) =>
  b === 'mastered' ? '#34d399' : b === 'review' ? '#fbbf24' : b === 'weak' ? '#fb923c' : '#f87171';

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
