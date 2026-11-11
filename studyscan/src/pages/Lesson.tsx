import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addContentToLesson, db, deleteLesson, makeCard } from "../db";
import { morePractice, type ServerStatus } from "../api";
import { weakCards } from "../queries";
import { isNew } from "../srs";
import { href, navigate, useRoute } from "../router";
import { Markdown } from "../components/Markdown";
import { BackLink, Empty, Loading, SpeakButton } from "../components/ui";
import type { Card, Course } from "../types";
import { plural, relativeDays } from "../util";

type Tab = "vocab" | "grammar" | "exercises" | "pages";

export function LessonPage({ id, status }: { id: string; status: ServerStatus | null | undefined }) {
  const route = useRoute();
  const [tab, setTab] = useState<Tab>("vocab");
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<string | null>(route.query.get("saved") ? "Lesson saved. Start with the flashcards!" : null);

  const data = useLiveQuery(async () => {
    const lesson = await db.lessons.get(id);
    if (!lesson) return { lesson: null } as const;
    const [course, cards, grammar, exercises] = await Promise.all([
      db.courses.get(lesson.courseId),
      db.cards.where("lessonId").equals(id).sortBy("createdAt"),
      db.grammar.where("lessonId").equals(id).sortBy("createdAt"),
      db.exercises.where("lessonId").equals(id).sortBy("createdAt"),
    ]);
    return { lesson, course, cards, grammar, exercises };
  }, [id]);

  if (!data) return <Loading />;
  if (!data.lesson || !data.course) return <Empty title="Lesson not found" action={<a className="btn" href="#/">Home</a>} />;
  const { lesson, course, cards, grammar, exercises } = data;
  const due = cards.filter((c) => c.due <= Date.now()).length;

  async function generateMore() {
    setGenerating(true);
    setMsg(null);
    try {
      const res = await morePractice({
        targetLanguage: course!.targetLanguage,
        nativeLanguage: course!.nativeLanguage,
        lessonTitle: lesson!.title,
        vocabulary: cards.map((c) => ({ term: c.term, translation: c.translation })),
        grammar: grammar.map((g) => ({ title: g.title, explanation: g.explanation })),
        weakSpots: [
          ...weakCards(cards).map((c) => `${c.term} (${c.translation})`),
          ...exercises.filter((e) => e.lastResult === "incorrect").map((e) => e.prompt),
        ].slice(0, 40),
        existingPrompts: exercises.map((e) => e.prompt).slice(-200),
        count: 10,
      });
      await addContentToLesson(course!.id, lesson!.id, { vocabulary: [], grammar: [], exercises: res.exercises });
      setMsg(`Added ${plural(res.exercises.length, "new exercise")}.`);
      setTab("exercises");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete “${lesson!.title}” with its ${plural(cards.length, "card")} and progress?`)) return;
    await deleteLesson(lesson!.id);
    navigate(`/course/${course!.id}`);
  }

  return (
    <div className="page" style={{ "--accent": course.color } as React.CSSProperties}>
      <BackLink to={`#/course/${course.id}`} label={course.name} />
      <header className="page-head accent-bar">
        <div className="grow">
          <EditableTitle value={lesson.title} onSave={(title) => db.lessons.update(lesson.id, { title })} />
          {lesson.summary && <p className="muted">{lesson.summary}</p>}
        </div>
      </header>

      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}
      {lesson.warning && <p className="notice small">{lesson.warning}</p>}

      <div className="action-grid">
        <a className={`action primary${cards.length ? "" : " disabled"}`} href={href("/review", { lesson: id })}>
          <strong>Flashcards</strong>
          <span>{due > 0 ? `${due} to study` : "Up to date"}</span>
        </a>
        <a className={`action${exercises.length || cards.length ? "" : " disabled"}`} href={href("/practice", { lesson: id })}>
          <strong>Practice</strong>
          <span>{plural(exercises.length, "exercise")}</span>
        </a>
        <a className={`action${cards.length >= 4 ? "" : " disabled"}`} href={href("/match", { lesson: id })}>
          <strong>Match game</strong>
          <span>Pair words fast</span>
        </a>
        <a className="action" href={href("/scan", { course: course.id, lesson: id })}>
          <strong>Add pages</strong>
          <span>Scan more for this lesson</span>
        </a>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ["vocab", `Vocabulary (${cards.length})`],
            ["grammar", `Grammar (${grammar.length})`],
            ["exercises", `Exercises (${exercises.length})`],
            ["pages", `Pages (${lesson.pages.length})`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "vocab" && <VocabList cards={cards} course={course} lessonId={id} />}

      {tab === "grammar" &&
        (grammar.length === 0 ? (
          <Empty title="No grammar points">Grammar found on your scans will appear here.</Empty>
        ) : (
          grammar.map((g) => (
            <article key={g.id} className="grammar card-surface">
              <h3>{g.title}</h3>
              <Markdown text={g.explanation} />
              {g.examples.length > 0 && (
                <ul className="examples">
                  {g.examples.map((ex, i) => (
                    <li key={i}>
                      <span className="target">
                        {ex.target} <SpeakButton text={ex.target} language={course.targetLanguage} />
                      </span>
                      <span className="muted">{ex.translation}</span>
                    </li>
                  ))}
                </ul>
              )}
              <a className="btn sm" href={href("/practice", { lesson: id, grammar: g.id })}>
                Practise this
              </a>
            </article>
          ))
        ))}

      {tab === "exercises" && (
        <>
          <div className="row gap wrap">
            <button className="btn" disabled={generating || !status || (!cards.length && !grammar.length)} onClick={generateMore}>
              {generating ? "Writing new exercises…" : "✨ Generate more practice"}
            </button>
            <span className="muted small">Focuses on the words and grammar you get wrong most.</span>
          </div>
          <ul className="exercise-list">
            {exercises.map((e) => (
              <li key={e.id}>
                <div className="grow">
                  <span className="kind">{e.kind.replace(/_/g, " ")}</span>
                  <p>{e.prompt}</p>
                  <p className="muted small">Answer: {e.answer}</p>
                </div>
                <span className={`score ${e.lastResult ?? ""}`}>{e.attempts ? `${e.correct}/${e.attempts}` : "new"}</span>
                <button className="icon-btn" aria-label="Delete exercise" onClick={() => db.exercises.delete(e.id)}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "pages" &&
        (lesson.pages.length ? (
          <div className="pages-grid view">
            {lesson.pages.map((p, i) => (
              <a key={i} href={p} target="_blank" rel="noreferrer" className="page-thumb">
                <img src={p} alt={`Page ${i + 1}`} />
                <figcaption>{i + 1}</figcaption>
              </a>
            ))}
          </div>
        ) : (
          <Empty title="No page images" />
        ))}

      <div className="danger-zone">
        <button className="btn danger ghost sm" onClick={remove}>
          Delete lesson
        </button>
      </div>
    </div>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => unknown }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (!editing)
    return (
      <h1 className="editable" onClick={() => (setV(value), setEditing(true))} title="Click to rename">
        {value}
      </h1>
    );
  return (
    <form
      className="row gap"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) void onSave(v.trim());
        setEditing(false);
      }}
    >
      <input className="title-input" value={v} autoFocus onChange={(e) => setV(e.target.value)} />
      <button className="btn sm primary">Save</button>
    </form>
  );
}

function VocabList({ cards, course, lessonId }: { cards: Card[]; course: Course; lessonId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      {cards.length === 0 && <Empty title="No vocabulary yet">Add words manually or scan more pages.</Empty>}
      <ul className="vocab-list">
        {cards.map((c) =>
          editing === c.id ? (
            <li key={c.id}>
              <CardForm
                initial={c}
                onCancel={() => setEditing(null)}
                onSave={async (patch) => {
                  await db.cards.update(c.id, patch);
                  setEditing(null);
                }}
                onDelete={async () => {
                  await db.cards.delete(c.id);
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li key={c.id} className="vocab-row">
              <div className="grow">
                <div className="term-line">
                  <strong lang={course.targetLanguage}>{c.term}</strong>
                  <SpeakButton text={c.term} language={course.targetLanguage} />
                  {c.partOfSpeech && <span className="tag">{c.partOfSpeech}</span>}
                  {c.gender && <span className="tag">{c.gender}</span>}
                </div>
                <div>{c.translation}</div>
                {c.example && (
                  <div className="muted small">
                    {c.example}
                    {c.exampleTranslation && ` — ${c.exampleTranslation}`}
                  </div>
                )}
                {c.note && <div className="note small">{c.note}</div>}
              </div>
              <div className="vocab-meta">
                <span className={`srs-tag ${isNew(c) ? "new" : c.interval >= 21 ? "known" : ""}`}>
                  {isNew(c) ? "new" : c.interval >= 21 ? "known" : relativeDays(c.due)}
                </span>
                <button className="icon-btn" aria-label={`Edit ${c.term}`} onClick={() => setEditing(c.id)}>
                  ✎
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {adding ? (
        <CardForm
          onCancel={() => setAdding(false)}
          onSave={async (v) => {
            await db.cards.add(
              makeCard(course.id, lessonId, {
                term: v.term ?? "",
                translation: v.translation ?? "",
                partOfSpeech: v.partOfSpeech ?? null,
                gender: null,
                example: v.example ?? null,
                exampleTranslation: null,
                note: v.note ?? null,
              }),
            );
            setAdding(false);
          }}
        />
      ) : (
        <button className="btn ghost" onClick={() => setAdding(true)}>
          + Add a word
        </button>
      )}
    </>
  );
}

function CardForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: Card;
  onSave: (v: Partial<Card>) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [term, setTerm] = useState(initial?.term ?? "");
  const [translation, setTranslation] = useState(initial?.translation ?? "");
  const [partOfSpeech, setPos] = useState(initial?.partOfSpeech ?? "");
  const [example, setExample] = useState(initial?.example ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  return (
    <form
      className="card-form card-surface"
      onSubmit={(e) => {
        e.preventDefault();
        if (!term.trim() || !translation.trim()) return;
        void onSave({
          term: term.trim(),
          translation: translation.trim(),
          partOfSpeech: partOfSpeech.trim() || null,
          example: example.trim() || null,
          note: note.trim() || null,
        });
      }}
    >
      <div className="two">
        <label>
          Word / phrase
          <input value={term} onChange={(e) => setTerm(e.target.value)} required autoFocus />
        </label>
        <label>
          Meaning
          <input value={translation} onChange={(e) => setTranslation(e.target.value)} required />
        </label>
      </div>
      <div className="two">
        <label>
          Type <input value={partOfSpeech} onChange={(e) => setPos(e.target.value)} placeholder="noun, verb…" />
        </label>
        <label>
          Note <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="irregular, plural…" />
        </label>
      </div>
      <label>
        Example sentence
        <input value={example} onChange={(e) => setExample(e.target.value)} />
      </label>
      <div className="row gap">
        <button className="btn primary sm">Save</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className="btn danger ghost sm push-right" onClick={() => void onDelete()}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
