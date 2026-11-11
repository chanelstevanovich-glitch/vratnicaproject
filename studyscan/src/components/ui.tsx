import type { ReactNode } from "react";
import { canSpeak, speak } from "../speech";

export function SpeakButton({ text, language, size = "sm" }: { text: string; language: string; size?: "sm" | "lg" }) {
  if (!canSpeak) return null;
  return (
    <button
      type="button"
      className={`icon-btn speak ${size}`}
      aria-label={`Hear “${text}”`}
      title="Listen"
      onClick={(e) => {
        e.stopPropagation();
        speak(text, language);
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <a className="back" href={to}>
      ‹ {label}
    </a>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="loading">{label}</div>;
}
