import { useSyncExternalStore } from "react";

export interface Settings {
  nativeLanguage: string;
  newCardsPerDay: number;
  cardFront: "target" | "native" | "mixed";
  autoSpeak: boolean;
}

const KEY = "studyscan.settings";
const DEFAULTS: Settings = { nativeLanguage: "English", newCardsPerDay: 20, cardFront: "target", autoSpeak: false };

let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage unavailable (private mode) - keep in memory
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
