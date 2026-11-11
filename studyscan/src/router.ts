import { useSyncExternalStore } from "react";

/** Minimal hash router: "#/lesson/abc?x=1" -> { path: ["lesson","abc"], query } */
export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [p, q = ""] = raw.split("?");
  return { path: p.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

let snapshotKey = window.location.hash;
let snapshot = parse();

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => {
    if (window.location.hash !== snapshotKey) {
      snapshotKey = window.location.hash;
      snapshot = parse();
    }
    return snapshot;
  });
}

export function href(path: string, query?: Record<string, string | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) qs.set(k, v);
  const s = qs.toString();
  return `#${path}${s ? `?${s}` : ""}`;
}

export function navigate(path: string, query?: Record<string, string | undefined | null>, replace = false): void {
  const target = href(path, query);
  if (replace) {
    history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target.slice(1);
  }
  window.scrollTo(0, 0);
}
