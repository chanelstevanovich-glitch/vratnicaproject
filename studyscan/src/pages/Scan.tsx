import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addContentToLesson, bumpActivity, db, uid } from "../db";
import { scanPages, type ServerStatus } from "../api";
import { prepareImage, type PreparedImage } from "../image";
import { navigate } from "../router";
import { Markdown } from "../components/Markdown";
import { BackLink, Empty, Loading } from "../components/ui";
import type { Lesson, ScanResult, SourceType } from "../types";
import { plural } from "../util";

const MAX_PAGES = 10;
const MESSAGES = [
  "Reading your pages…",
  "Picking out vocabulary…",
  "Working out the grammar…",
  "Writing practice exercises…",
  "Checking spelling and accents…",
  "Almost there…",
];

interface Page {
  id: string;
  img: PreparedImage;
}

export function ScanPage({ query, status }: { query: URLSearchParams; status: ServerStatus | null | undefined }) {
  const courses = useLiveQuery(() => db.courses.orderBy("createdAt").toArray(), []);
  const [courseId, setCourseId] = useState<string>(query.get("course") ?? "");
  const [lessonId, setLessonId] = useState<string>(query.get("lesson") ?? "");
  const [sourceType, setSourceType] = useState<SourceType>("auto");
  const [pages, setPages] = useState<Page[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [phase, setPhase] = useState<"setup" | "processing" | "review">("setup");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // Default to the first course once loaded.
  useEffect(() => {
    if (courses && !courseId && courses.length) setCourseId(courses[0].id);
  }, [courses, courseId]);

  const lessons = useLiveQuery(
    (): Promise<Lesson[]> => (courseId ? db.lessons.where("courseId").equals(courseId).sortBy("createdAt") : Promise.resolve([])),
    [courseId],
  );

  useEffect(() => {
    if (phase !== "processing") return;
    setMsgIdx(0);
    const t = setInterval(() => setMsgIdx((i) => Math.min(i + 1, MESSAGES.length - 1)), 6000);
    return () => clearInterval(t);
  }, [phase]);

  if (!courses) return <Loading />;
  if (courses.length === 0) {
    return (
      <div className="page narrow">
        <Empty title="Create a course first" action={<a className="btn primary" href="#/courses/new">New course</a>}>
          Courses keep each language or textbook separate, so your flashcards and practice stay organised.
        </Empty>
      </div>
    );
  }

  const course = courses.find((c) => c.id === courseId) ?? courses[0];
  const appendLesson = lessons?.find((l) => l.id === lessonId) ?? null;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, MAX_PAGES - pages.length);
    if (files.length > list.length) setError(`You can scan up to ${MAX_PAGES} pages at a time.`);
    setPreparing((n) => n + list.length);
    for (const f of list) {
      try {
        const img = await prepareImage(f);
        setPages((p) => [...p, { id: uid(), img }]);
      } catch {
        setError(`Couldn't open “${f.name}”. Try a JPEG or PNG photo.`);
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  }

  async function run() {
    setError(null);
    setPhase("processing");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      let appendTo = null;
      if (appendLesson) {
        const [cards, grammar] = await Promise.all([
          db.cards.where("lessonId").equals(appendLesson.id).toArray(),
          db.grammar.where("lessonId").equals(appendLesson.id).toArray(),
        ]);
        appendTo = { title: appendLesson.title, knownTerms: cards.map((c) => c.term), grammarTitles: grammar.map((g) => g.title) };
      }
      const res = await scanPages(
        {
          images: pages.map((p) => ({ mediaType: p.img.mediaType, data: p.img.data })),
          context: {
            targetLanguage: course.targetLanguage,
            nativeLanguage: course.nativeLanguage,
            courseName: course.name,
            sourceType,
            level: course.level,
            appendTo,
            otherLessonTitles: (lessons ?? []).filter((l) => l.id !== lessonId).map((l) => l.title),
          },
        },
        ctrl.signal,
      );
      setResult(res);
      setPhase("review");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setPhase("setup");
        return;
      }
      setError((e as Error).message);
      setPhase("setup");
    }
  }

  if (phase === "processing") {
    return (
      <div className="page narrow center">
        <div className="scanning">
          <div className="scan-stack">
            {pages.slice(0, 3).map((p, i) => (
              <img key={p.id} src={p.img.thumb} alt="" style={{ transform: `rotate(${(i - 1) * 4}deg)` }} />
            ))}
            <div className="scan-line" />
          </div>
          <h2 aria-live="polite">{MESSAGES[msgIdx]}</h2>
          <p className="muted">This usually takes 20–90 seconds, depending on how many pages you scanned.</p>
          <button className="btn ghost" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === "review" && result) {
    return (
      <ReviewResult
        result={result}
        courseName={course.name}
        targetLanguage={course.targetLanguage}
        appendTitle={appendLesson?.title ?? null}
        onBack={() => setPhase("setup")}
        onSave={async (r) => {
          const now = Date.now();
          const thumbs = pages.map((p) => p.img.thumb);
          let id: string;
          if (appendLesson) {
            id = appendLesson.id;
            await db.lessons.update(id, {
              pages: [...appendLesson.pages, ...thumbs],
              sourceTypes: Array.from(new Set([...appendLesson.sourceTypes, sourceType])),
              updatedAt: now,
            });
          } else {
            id = uid();
            await db.lessons.add({
              id,
              courseId: course.id,
              title: r.lessonTitle.trim() || "Untitled lesson",
              unit: r.unit,
              summary: r.summary,
              sourceTypes: [sourceType],
              pages: thumbs,
              warning: r.detected.warning,
              createdAt: now,
              updatedAt: now,
            });
          }
          await addContentToLesson(course.id, id, r);
          await bumpActivity({ scans: 1 });
          navigate(`/lesson/${id}`, { saved: "1" });
        }}
      />
    );
  }

  const busy = preparing > 0;

  return (
    <div className="page narrow">
      <BackLink to="#/" label="Home" />
      <h1>Scan pages</h1>
      <p className="muted">Photograph textbook pages, worksheets or your handwritten notes from class.</p>

      <div className="form">
        <div className="two">
          <label>
            Course
            <select
              value={course.id}
              onChange={(e) => {
                setCourseId(e.target.value);
                setLessonId("");
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.targetLanguage})
                </option>
              ))}
            </select>
          </label>
          <label>
            Save to
            <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">A new lesson</option>
              {(lessons ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  Add to: {l.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>What are you scanning?</legend>
          <div className="segmented" role="radiogroup">
            {(
              [
                ["textbook", "Textbook"],
                ["notes", "Handwritten notes"],
                ["auto", "A mix / not sure"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={sourceType === v}
                className={sourceType === v ? "on" : ""}
                onClick={() => setSourceType(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="pages-grid">
          {pages.map((p, i) => (
            <figure key={p.id} className="page-thumb">
              <img src={p.img.thumb} alt={`Page ${i + 1}`} />
              <figcaption>{i + 1}</figcaption>
              <button
                type="button"
                className="remove"
                aria-label={`Remove page ${i + 1}`}
                onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))}
              >
                ×
              </button>
            </figure>
          ))}
          {Array.from({ length: preparing }).map((_, i) => (
            <div key={`p${i}`} className="page-thumb placeholder" />
          ))}
          {pages.length + preparing < MAX_PAGES && (
            <div className="add-tiles">
              <button type="button" className="add-tile" onClick={() => cameraRef.current?.click()}>
                <span className="big">📷</span>
                Take photo
              </button>
              <button type="button" className="add-tile" onClick={() => libraryRef.current?.click()}>
                <span className="big">🖼️</span>
                Choose photos
              </button>
            </div>
          )}
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <details className="tips">
          <summary>Tips for a good scan</summary>
          <ul>
            <li>Lay the page flat in good light and avoid shadows from your phone.</li>
            <li>Fill the frame with one page; two-page spreads work if the text is still sharp.</li>
            <li>Scan a lesson's pages together so they become one lesson.</li>
            <li>For notes, write the target-language words clearly; the AI corrects small spelling slips.</li>
          </ul>
        </details>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary lg block" disabled={!pages.length || busy || status === null} onClick={run}>
          {busy
            ? "Preparing photos…"
            : pages.length
              ? `Read ${plural(pages.length, "page")}`
              : "Add at least one page"}
        </button>
        {status === null && <p className="muted small center">The server is unreachable, so scanning is unavailable.</p>}
      </div>
    </div>
  );
}

function ReviewResult({
  result,
  courseName,
  targetLanguage,
  appendTitle,
  onBack,
  onSave,
}: {
  result: ScanResult;
  courseName: string;
  targetLanguage: string;
  appendTitle: string | null;
  onBack: () => void;
  onSave: (r: ScanResult) => Promise<void>;
}) {
  const [title, setTitle] = useState(appendTitle ?? result.lessonTitle);
  const [summary, setSummary] = useState(result.summary);
  const [vocab, setVocab] = useState(result.vocabulary.map((v) => ({ ...v, keep: true })));
  const [grammarKeep, setGrammarKeep] = useState(result.grammar.map(() => true));
  const [keepExercises, setKeepExercises] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const langMismatch =
    result.detected.language &&
    !result.detected.language.toLowerCase().includes(targetLanguage.toLowerCase()) &&
    !targetLanguage.toLowerCase().includes(result.detected.language.toLowerCase());
  const keptVocab = vocab.filter((v) => v.keep);
  const nothing = !result.vocabulary.length && !result.grammar.length;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await onSave({
        ...result,
        lessonTitle: title,
        summary,
        vocabulary: keptVocab.map(({ keep: _keep, ...v }) => v),
        grammar: result.grammar.filter((_, i) => grammarKeep[i]),
        exercises: keepExercises ? result.exercises : [],
      });
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="page narrow">
      <button className="back linklike" onClick={onBack}>
        ‹ Back to photos
      </button>
      <h1>Check what was found</h1>
      <p className="muted">
        Untick anything you don't want, and fix any words the scan got wrong. You can still edit everything later.
      </p>

      {!result.detected.legible && (
        <p className="notice warn">Some of these pages were hard to read. Consider retaking the photo in better light.</p>
      )}
      {result.detected.warning && <p className="notice">{result.detected.warning}</p>}
      {langMismatch && (
        <p className="notice warn">
          These pages look like {result.detected.language}, but this course is {targetLanguage}. Double-check you picked the
          right course.
        </p>
      )}

      {nothing ? (
        <Empty title="No study content found" action={<button className="btn primary" onClick={onBack}>Try other photos</button>}>
          The AI couldn't find vocabulary or grammar on these pages.
        </Empty>
      ) : (
        <div className="form">
          {appendTitle ? (
            <p>
              Adding to <b>{appendTitle}</b> in {courseName}.
            </p>
          ) : (
            <>
              <label>
                Lesson title
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                Summary
                <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
              </label>
            </>
          )}

          <section>
            <div className="section-head">
              <h2>Vocabulary ({keptVocab.length})</h2>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setVocab((vs) => vs.map((v) => ({ ...v, keep: keptVocab.length !== vs.length })))}
              >
                {keptVocab.length === vocab.length ? "Select none" : "Select all"}
              </button>
            </div>
            <ul className="vocab-edit">
              {vocab.map((v, i) => (
                <li key={i} className={v.keep ? "" : "off"}>
                  <input
                    type="checkbox"
                    checked={v.keep}
                    aria-label={`Keep ${v.term}`}
                    onChange={(e) => setVocab((vs) => vs.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
                  />
                  <input
                    className="term"
                    value={v.term}
                    aria-label="Word"
                    onChange={(e) => setVocab((vs) => vs.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)))}
                  />
                  <input
                    value={v.translation}
                    aria-label="Translation"
                    onChange={(e) =>
                      setVocab((vs) => vs.map((x, j) => (j === i ? { ...x, translation: e.target.value } : x)))
                    }
                  />
                </li>
              ))}
            </ul>
          </section>

          {result.grammar.length > 0 && (
            <section>
              <h2>Grammar</h2>
              {result.grammar.map((g, i) => (
                <details key={i} className={`grammar-pick${grammarKeep[i] ? "" : " off"}`}>
                  <summary>
                    <input
                      type="checkbox"
                      checked={grammarKeep[i]}
                      aria-label={`Keep ${g.title}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setGrammarKeep((k) => k.map((x, j) => (j === i ? e.target.checked : x)))}
                    />
                    {g.title}
                  </summary>
                  <Markdown text={g.explanation} />
                </details>
              ))}
            </section>
          )}

          {result.exercises.length > 0 && (
            <label className="check">
              <input type="checkbox" checked={keepExercises} onChange={(e) => setKeepExercises(e.target.checked)} />
              Include {plural(result.exercises.length, "practice exercise")}
            </label>
          )}

          {err && <p className="error">{err}</p>}
          <button className="btn primary lg block" disabled={saving} onClick={save}>
            {saving ? "Saving…" : appendTitle ? "Add to lesson" : "Save lesson"}
          </button>
        </div>
      )}
    </div>
  );
}
