export type ExerciseKind = "fill_blank" | "multiple_choice" | "translate_to_target" | "translate_to_native";
export type SourceType = "textbook" | "notes" | "auto";

export interface Course {
  id: string;
  name: string;
  targetLanguage: string;
  nativeLanguage: string;
  level: string | null;
  color: string;
  createdAt: number;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  unit: string | null;
  summary: string;
  sourceTypes: SourceType[];
  /** Small JPEG data URLs of the scanned pages, for reference. */
  pages: string[];
  warning: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Card {
  id: string;
  courseId: string;
  lessonId: string;
  term: string;
  translation: string;
  partOfSpeech: string | null;
  gender: string | null;
  example: string | null;
  exampleTranslation: string | null;
  note: string | null;
  createdAt: number;
  // spaced repetition state
  due: number;
  interval: number; // days
  ease: number;
  reps: number;
  lapses: number;
  lastReviewed: number | null;
}

export interface GrammarPoint {
  id: string;
  courseId: string;
  lessonId: string;
  title: string;
  explanation: string;
  examples: { target: string; translation: string }[];
  createdAt: number;
}

export interface Exercise {
  id: string;
  courseId: string;
  lessonId: string;
  grammarId: string | null;
  kind: ExerciseKind;
  prompt: string;
  answer: string;
  acceptableAnswers: string[];
  options: string[];
  hint: string | null;
  explanation: string | null;
  attempts: number;
  correct: number;
  lastResult: "correct" | "incorrect" | null;
  lastSeen: number | null;
  createdAt: number;
}

export interface Activity {
  date: string; // YYYY-MM-DD local
  reviews: number;
  correct: number;
  newCards: number;
  practice: number;
  scans: number;
}

/** Shapes returned by the server (mirror server/schema.ts). */
export interface ScanVocab {
  term: string;
  translation: string;
  partOfSpeech: string | null;
  gender: string | null;
  example: string | null;
  exampleTranslation: string | null;
  note: string | null;
}
export interface ScanGrammar {
  title: string;
  explanation: string;
  examples: { target: string; translation: string }[];
}
export interface ScanExercise {
  kind: ExerciseKind;
  grammarTitle: string | null;
  prompt: string;
  answer: string;
  acceptableAnswers: string[];
  options: string[];
  hint: string | null;
  explanation: string | null;
}
export interface ScanResult {
  detected: {
    contentType: "textbook" | "handwritten_notes" | "mixed" | "unclear";
    language: string;
    legible: boolean;
    warning: string | null;
  };
  lessonTitle: string;
  unit: string | null;
  summary: string;
  vocabulary: ScanVocab[];
  grammar: ScanGrammar[];
  exercises: ScanExercise[];
}
export interface GradeResult {
  verdict: "correct" | "almost" | "incorrect";
  feedback: string;
  correctedAnswer: string | null;
}
