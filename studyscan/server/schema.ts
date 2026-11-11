import { z } from "zod";

/**
 * Shapes shared between the AI extraction step and the web client.
 * Nullable (rather than optional) fields keep the schema friendly to
 * structured outputs: every key is always present.
 */

export const VocabItem = z.object({
  term: z.string().describe("The word or phrase exactly as written in the target language, with articles/accents preserved"),
  translation: z.string().describe("Meaning in the student's native language"),
  partOfSpeech: z
    .string()
    .nullable()
    .describe("noun, verb, adjective, adverb, phrase, expression, etc."),
  gender: z.string().nullable().describe("Grammatical gender if the language has it (m, f, n), else null"),
  example: z.string().nullable().describe("A short example sentence in the target language using the term"),
  exampleTranslation: z.string().nullable(),
  note: z
    .string()
    .nullable()
    .describe("Irregular forms, plural, aspect pair, usage tips. Null if nothing useful."),
});

export const GrammarExample = z.object({
  target: z.string(),
  translation: z.string(),
});

export const GrammarPoint = z.object({
  title: z.string().describe("Short name, e.g. 'Present tense of -ar verbs'"),
  explanation: z
    .string()
    .describe("Student-friendly explanation written in the native language, 2-6 sentences, may include a compact table in markdown"),
  examples: z.array(GrammarExample),
});

export const ExerciseKind = z.enum(["fill_blank", "multiple_choice", "translate_to_target", "translate_to_native"]);

export const Exercise = z.object({
  kind: ExerciseKind,
  grammarTitle: z
    .string()
    .nullable()
    .describe("Title of the grammar point this practises (must match a grammar title), or null for vocabulary practice"),
  prompt: z
    .string()
    .describe("The question. For fill_blank use ___ for the gap and put the base form in parentheses, e.g. 'Yo ___ (hablar) español.'"),
  answer: z.string().describe("The single best correct answer"),
  acceptableAnswers: z
    .array(z.string())
    .describe("Other fully correct answers (alternate word order, synonyms). Empty if none."),
  options: z
    .array(z.string())
    .describe("For multiple_choice: 3-4 options including the answer. Empty array for other kinds."),
  hint: z.string().nullable(),
  explanation: z.string().nullable().describe("Why the answer is right, shown after answering"),
});

export const ScanResult = z.object({
  detected: z.object({
    contentType: z.enum(["textbook", "handwritten_notes", "mixed", "unclear"]),
    language: z.string().describe("Target language detected on the pages"),
    legible: z.boolean().describe("False if the images are too blurry/dark to read reliably"),
    warning: z.string().nullable().describe("Anything the student should know, e.g. 'Page 2 is cut off', else null"),
  }),
  lessonTitle: z.string().describe("Concise title for the lesson, e.g. 'Unit 3 · At the market'"),
  unit: z.string().nullable().describe("Unit/chapter/lesson number if printed or written, else null"),
  summary: z.string().describe("2-4 sentence overview of what this lesson teaches, in the native language"),
  vocabulary: z.array(VocabItem),
  grammar: z.array(GrammarPoint),
  exercises: z.array(Exercise),
});

export type ScanResult = z.infer<typeof ScanResult>;

export const PracticeResult = z.object({
  exercises: z.array(Exercise),
});
export type PracticeResult = z.infer<typeof PracticeResult>;

export const GradeResult = z.object({
  verdict: z.enum(["correct", "almost", "incorrect"]),
  feedback: z.string().describe("One or two short sentences for the student, in their native language"),
  correctedAnswer: z.string().nullable(),
});
export type GradeResult = z.infer<typeof GradeResult>;
