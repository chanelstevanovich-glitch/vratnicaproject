import Dexie, { type EntityTable } from "dexie";
import type { Activity, Card, Course, Exercise, GrammarPoint, Lesson, ScanExercise, ScanGrammar, ScanVocab } from "./types";
import { newCardState } from "./srs";
import { todayKey } from "./util";

class StudyDB extends Dexie {
  courses!: EntityTable<Course, "id">;
  lessons!: EntityTable<Lesson, "id">;
  cards!: EntityTable<Card, "id">;
  grammar!: EntityTable<GrammarPoint, "id">;
  exercises!: EntityTable<Exercise, "id">;
  activity!: EntityTable<Activity, "date">;

  constructor() {
    super("studyscan");
    this.version(1).stores({
      courses: "id, createdAt",
      lessons: "id, courseId, createdAt",
      cards: "id, courseId, lessonId, due",
      grammar: "id, courseId, lessonId",
      exercises: "id, courseId, lessonId, grammarId",
      activity: "date",
    });
  }
}

export const db = new StudyDB();

export const uid = (): string => crypto.randomUUID();

export async function bumpActivity(patch: Partial<Omit<Activity, "date">>): Promise<void> {
  const date = todayKey();
  await db.transaction("rw", db.activity, async () => {
    const cur = (await db.activity.get(date)) ?? { date, reviews: 0, correct: 0, newCards: 0, practice: 0, scans: 0 };
    for (const [k, v] of Object.entries(patch) as [keyof Omit<Activity, "date">, number][]) {
      cur[k] += v;
    }
    await db.activity.put(cur);
  });
}

export async function deleteLesson(lessonId: string): Promise<void> {
  await db.transaction("rw", [db.lessons, db.cards, db.grammar, db.exercises], async () => {
    await db.cards.where("lessonId").equals(lessonId).delete();
    await db.grammar.where("lessonId").equals(lessonId).delete();
    await db.exercises.where("lessonId").equals(lessonId).delete();
    await db.lessons.delete(lessonId);
  });
}

export async function deleteCourse(courseId: string): Promise<void> {
  await db.transaction("rw", [db.courses, db.lessons, db.cards, db.grammar, db.exercises], async () => {
    await db.cards.where("courseId").equals(courseId).delete();
    await db.grammar.where("courseId").equals(courseId).delete();
    await db.exercises.where("courseId").equals(courseId).delete();
    await db.lessons.where("courseId").equals(courseId).delete();
    await db.courses.delete(courseId);
  });
}

export function makeCard(courseId: string, lessonId: string, v: ScanVocab): Card {
  const now = Date.now();
  return { id: uid(), courseId, lessonId, ...v, createdAt: now, ...newCardState(now) };
}

export function makeExercise(courseId: string, lessonId: string, grammarId: string | null, e: ScanExercise): Exercise {
  return {
    id: uid(),
    courseId,
    lessonId,
    grammarId,
    kind: e.kind,
    prompt: e.prompt,
    answer: e.answer,
    acceptableAnswers: e.acceptableAnswers,
    options: e.options,
    hint: e.hint,
    explanation: e.explanation,
    attempts: 0,
    correct: 0,
    lastResult: null,
    lastSeen: null,
    createdAt: Date.now(),
  };
}

/** Adds extracted content to a lesson, linking exercises to grammar points by title. */
export async function addContentToLesson(
  courseId: string,
  lessonId: string,
  content: { vocabulary: ScanVocab[]; grammar: ScanGrammar[]; exercises: ScanExercise[] },
): Promise<void> {
  await db.transaction("rw", [db.cards, db.grammar, db.exercises], async () => {
    const existingGrammar = await db.grammar.where("lessonId").equals(lessonId).toArray();
    const byTitle = new Map(existingGrammar.map((g) => [g.title.trim().toLowerCase(), g.id]));
    const now = Date.now();
    const newGrammar: GrammarPoint[] = content.grammar.map((g) => {
      const gp = { id: uid(), courseId, lessonId, ...g, createdAt: now };
      byTitle.set(g.title.trim().toLowerCase(), gp.id);
      return gp;
    });
    const existingTerms = new Set(
      (await db.cards.where("lessonId").equals(lessonId).toArray()).map((c) => c.term.trim().toLowerCase()),
    );
    const cards = content.vocabulary
      .filter((v) => v.term.trim() && !existingTerms.has(v.term.trim().toLowerCase()))
      .map((v) => makeCard(courseId, lessonId, v));
    const exercises = content.exercises.map((e) =>
      makeExercise(courseId, lessonId, e.grammarTitle ? (byTitle.get(e.grammarTitle.trim().toLowerCase()) ?? null) : null, e),
    );
    await db.grammar.bulkAdd(newGrammar);
    await db.cards.bulkAdd(cards);
    await db.exercises.bulkAdd(exercises);
  });
}

// ---------- backup ----------

export interface Backup {
  app: "studyscan";
  version: 1;
  exportedAt: string;
  courses: Course[];
  lessons: Lesson[];
  cards: Card[];
  grammar: GrammarPoint[];
  exercises: Exercise[];
  activity: Activity[];
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: "studyscan",
    version: 1,
    exportedAt: new Date().toISOString(),
    courses: await db.courses.toArray(),
    lessons: await db.lessons.toArray(),
    cards: await db.cards.toArray(),
    grammar: await db.grammar.toArray(),
    exercises: await db.exercises.toArray(),
    activity: await db.activity.toArray(),
  };
}

export async function importBackup(data: unknown): Promise<void> {
  const b = data as Partial<Backup>;
  if (!b || b.app !== "studyscan" || !Array.isArray(b.courses)) {
    throw new Error("That file isn't a StudyScan backup.");
  }
  await db.transaction("rw", [db.courses, db.lessons, db.cards, db.grammar, db.exercises, db.activity], async () => {
    await db.courses.bulkPut(b.courses ?? []);
    await db.lessons.bulkPut(b.lessons ?? []);
    await db.cards.bulkPut(b.cards ?? []);
    await db.grammar.bulkPut(b.grammar ?? []);
    await db.exercises.bulkPut(b.exercises ?? []);
    await db.activity.bulkPut(b.activity ?? []);
  });
}

export async function wipeAll(): Promise<void> {
  await db.transaction("rw", [db.courses, db.lessons, db.cards, db.grammar, db.exercises, db.activity], async () => {
    await Promise.all([db.courses, db.lessons, db.cards, db.grammar, db.exercises, db.activity].map((t) => t.clear()));
  });
}
