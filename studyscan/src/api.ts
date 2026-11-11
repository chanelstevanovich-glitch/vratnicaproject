import type { GradeResult, ScanExercise, ScanResult, SourceType } from "./types";

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Couldn't reach the StudyScan server. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  if (!json) throw new Error("Empty response from server");
  return json;
}

export interface ServerStatus {
  ok: boolean;
  demo: boolean;
}

export async function getStatus(): Promise<ServerStatus | null> {
  try {
    const res = await fetch("/api/health");
    return res.ok ? ((await res.json()) as ServerStatus) : null;
  } catch {
    return null;
  }
}

export interface ScanRequest {
  images: { mediaType: string; data: string }[];
  context: {
    targetLanguage: string;
    nativeLanguage: string;
    courseName: string;
    sourceType: SourceType;
    level: string | null;
    appendTo: { title: string; knownTerms: string[]; grammarTitles: string[] } | null;
    otherLessonTitles: string[];
  };
}

export const scanPages = (req: ScanRequest, signal?: AbortSignal) => post<ScanResult>("/api/scan", req, signal);

export const morePractice = (req: {
  targetLanguage: string;
  nativeLanguage: string;
  lessonTitle: string;
  vocabulary: { term: string; translation: string }[];
  grammar: { title: string; explanation: string }[];
  weakSpots: string[];
  existingPrompts: string[];
  count: number;
}) => post<{ exercises: ScanExercise[] }>("/api/practice", req);

export const gradeAnswer = (req: {
  targetLanguage: string;
  nativeLanguage: string;
  prompt: string;
  expected: string[];
  given: string;
}) => post<GradeResult>("/api/grade", req);
