import type { Card } from "./types";
import { DAY, startOfDay } from "./util";

/**
 * A compact SM-2 style scheduler.
 * Ratings: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy.
 */
export type Rating = 0 | 1 | 2 | 3;

type SrsState = Pick<Card, "due" | "interval" | "ease" | "reps" | "lapses" | "lastReviewed">;

export function newCardState(now = Date.now()): SrsState {
  return { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, lastReviewed: null };
}

export function isNew(card: Pick<Card, "reps" | "lastReviewed">): boolean {
  return card.reps === 0 && card.lastReviewed === null;
}

export function schedule(card: SrsState, rating: Rating, now = Date.now()): SrsState {
  let { interval, ease, reps, lapses } = card;

  if (rating === 0) {
    // Forgotten: see it again in this session, and again tomorrow.
    lapses += card.reps > 0 ? 1 : 0;
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    interval = 0;
    return { due: now, interval, ease, reps, lapses, lastReviewed: now };
  }

  if (reps === 0) {
    interval = rating === 1 ? 1 : rating === 2 ? 1 : 4;
  } else if (reps === 1) {
    interval = rating === 1 ? 2 : rating === 2 ? 3 : 6;
  } else {
    const base = Math.max(interval, 1);
    interval = rating === 1 ? base * 1.2 : rating === 2 ? base * ease : base * ease * 1.3;
  }
  if (rating === 1) ease = Math.max(1.3, ease - 0.15);
  if (rating === 3) ease += 0.15;
  interval = Math.min(365, Math.max(1, Math.round(interval)));
  reps += 1;

  return { due: startOfDay(now) + interval * DAY, interval, ease, reps, lapses, lastReviewed: now };
}

/** Preview label for a rating button, e.g. "3d". */
export function previewInterval(card: SrsState, rating: Rating): string {
  if (rating === 0) return "now";
  const days = schedule(card, rating).interval;
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return "1y";
}

export function isDue(card: Pick<Card, "due">, now = Date.now()): boolean {
  return card.due <= now;
}
