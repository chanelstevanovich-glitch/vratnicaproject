import { db } from "./db";
import { isNew } from "./srs";
import { getSettings } from "./settings";
import type { Card, Exercise } from "./types";
import { DAY, shuffle, todayKey } from "./util";

export interface Scope {
  courseId?: string | null;
  lessonId?: string | null;
}

export async function cardsInScope(scope: Scope): Promise<Card[]> {
  if (scope.lessonId) return db.cards.where("lessonId").equals(scope.lessonId).toArray();
  if (scope.courseId) return db.cards.where("courseId").equals(scope.courseId).toArray();
  return db.cards.toArray();
}

export async function exercisesInScope(scope: Scope): Promise<Exercise[]> {
  if (scope.lessonId) return db.exercises.where("lessonId").equals(scope.lessonId).toArray();
  if (scope.courseId) return db.exercises.where("courseId").equals(scope.courseId).toArray();
  return db.exercises.toArray();
}

export async function newCardsLeftToday(): Promise<number> {
  const act = await db.activity.get(todayKey());
  return Math.max(0, getSettings().newCardsPerDay - (act?.newCards ?? 0));
}

/**
 * Builds a review queue: due cards first (most overdue first), then new cards.
 * The daily new-card limit applies to course/all-courses review; when a student
 * opens a specific lesson they get all of its new cards.
 */
export async function buildReviewQueue(scope: Scope, mode: "due" | "all" = "due"): Promise<Card[]> {
  const cards = await cardsInScope(scope);
  if (mode === "all") return shuffle(cards);
  const now = Date.now();
  const due = cards.filter((c) => !isNew(c) && c.due <= now).sort((a, b) => a.due - b.due);
  let fresh = cards.filter(isNew).sort((a, b) => a.createdAt - b.createdAt);
  if (!scope.lessonId) fresh = fresh.slice(0, await newCardsLeftToday());
  // Interleave a few new cards among reviews so sessions don't end on a wall of unknown words.
  const out: Card[] = [];
  let i = 0;
  let j = 0;
  while (i < due.length || j < fresh.length) {
    for (let k = 0; k < 3 && i < due.length; k++) out.push(due[i++]);
    if (j < fresh.length) out.push(fresh[j++]);
  }
  return out;
}

export interface DueSummary {
  due: number;
  fresh: number;
  total: number;
}

export function summarize(cards: Card[], newLimit: number | null): DueSummary {
  const now = Date.now();
  const due = cards.filter((c) => !isNew(c) && c.due <= now).length;
  const freshAll = cards.filter(isNew).length;
  return { due, fresh: newLimit == null ? freshAll : Math.min(freshAll, newLimit), total: cards.length };
}

export async function streak(): Promise<number> {
  const acts = await db.activity.toArray();
  const active = new Set(acts.filter((a) => a.reviews + a.practice + a.scans > 0).map((a) => a.date));
  let t = Date.now();
  if (!active.has(todayKey(t))) t -= DAY; // today not done yet - streak still alive from yesterday
  let n = 0;
  while (active.has(todayKey(t))) {
    n++;
    t -= DAY;
  }
  return n;
}

/** Pick practice exercises: never tried and last-wrong first, then least recently seen. */
export function pickExercises(all: Exercise[], n: number): Exercise[] {
  const score = (e: Exercise) =>
    (e.lastResult === "incorrect" ? 0 : e.attempts === 0 ? 1 : 2) * 1e13 + (e.lastSeen ?? 0) + Math.random() * 1e6;
  return all
    .slice()
    .sort((a, b) => score(a) - score(b))
    .slice(0, n);
}

/** Cards answered wrong most often - fed back to the AI when generating more practice. */
export function weakCards(cards: Card[], n = 15): Card[] {
  return cards
    .filter((c) => c.lapses > 0 || (c.ease < 2.3 && c.reps > 0))
    .sort((a, b) => b.lapses - a.lapses || a.ease - b.ease)
    .slice(0, n);
}
