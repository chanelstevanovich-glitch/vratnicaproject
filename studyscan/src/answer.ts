/** Local answer checking, before (optionally) asking the AI for a lenient grade. */

export type LocalVerdict = "correct" | "accent" | "typo" | "wrong";

export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[¿¡?!.,;:"“”„«»()…]/g, " ")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarks(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function checkLocally(given: string, expected: string[]): { verdict: LocalVerdict; closest: string } {
  const g = normalize(given);
  const exp = expected.filter(Boolean);
  let closest = exp[0] ?? "";
  if (!g) return { verdict: "wrong", closest };

  for (const e of exp) if (normalize(e) === g) return { verdict: "correct", closest: e };
  for (const e of exp) if (stripMarks(normalize(e)) === stripMarks(g)) return { verdict: "accent", closest: e };

  let best = Infinity;
  for (const e of exp) {
    const d = levenshtein(stripMarks(normalize(e)), stripMarks(g));
    if (d < best) {
      best = d;
      closest = e;
    }
  }
  const len = normalize(closest).length;
  if ((len >= 5 && best === 1) || (len >= 12 && best === 2)) return { verdict: "typo", closest };
  return { verdict: "wrong", closest };
}
