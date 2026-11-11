import { useRef, useState } from "react";
import { exportBackup, importBackup, wipeAll } from "../db";
import type { ServerStatus } from "../api";
import { updateSettings, useSettings } from "../settings";
import { canSpeak } from "../speech";
import { todayKey } from "../util";

export function SettingsPage({ status }: { status: ServerStatus | null | undefined }) {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function doExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `studyscan-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("Backup downloaded.");
  }

  async function doImport(file: File) {
    try {
      await importBackup(JSON.parse(await file.text()));
      setMsg("Backup restored.");
    } catch (e) {
      setMsg((e as Error).message || "Couldn't read that file.");
    }
  }

  return (
    <div className="page narrow">
      <h1>Settings</h1>

      <section className="form card-surface">
        <h2>Studying</h2>
        <label>
          My language (default for new courses)
          <input value={s.nativeLanguage} onChange={(e) => updateSettings({ nativeLanguage: e.target.value })} />
        </label>
        <label>
          New flashcards per day
          <input
            type="number"
            min={0}
            max={200}
            value={s.newCardsPerDay}
            onChange={(e) => updateSettings({ newCardsPerDay: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="muted small">
            Applies when reviewing a whole course. Opening a single lesson's flashcards always shows all its new words.
          </span>
        </label>
        <label>
          Flashcard front
          <select value={s.cardFront} onChange={(e) => updateSettings({ cardFront: e.target.value as typeof s.cardFront })}>
            <option value="target">Word in the language I'm learning</option>
            <option value="native">Meaning in my language (harder)</option>
            <option value="mixed">Mix both directions</option>
          </select>
        </label>
        {canSpeak && (
          <label className="check">
            <input type="checkbox" checked={s.autoSpeak} onChange={(e) => updateSettings({ autoSpeak: e.target.checked })} />
            Read words aloud automatically
          </label>
        )}
      </section>

      <section className="form card-surface">
        <h2>Your data</h2>
        <p className="muted small">
          Everything is saved on this device. Download a backup to move to another device or keep it safe.
        </p>
        <div className="row gap wrap">
          <button className="btn" onClick={doExport}>
            Download backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Restore backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = "";
            }}
          />
        </div>
        {msg && <p className="notice small">{msg}</p>}
        <button
          className="btn danger ghost sm"
          onClick={async () => {
            if (confirm("Delete ALL courses, lessons and progress on this device?")) {
              await wipeAll();
              setMsg("All data deleted.");
            }
          }}
        >
          Delete all data
        </button>
      </section>

      <p className="muted small center">
        Server: {status === undefined ? "checking…" : status === null ? "offline" : status.demo ? "demo mode (no API key)" : "connected"}
      </p>
    </div>
  );
}
