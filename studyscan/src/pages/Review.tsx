import { useCallback, useEffect, useRef, useState } from "react";
import { bumpActivity, db } from "../db";
import { buildReviewQueue } from "../queries";
import { isNew, previewInterval, schedule, type Rating } from "../srs";
import { useSettings } from "../settings";
import { speak } from "../speech";
import { href } from "../router";
import { Empty, Loading, Progress, SpeakButton } from "../components/ui";
import type { Card, Course } from "../types";
import { plural } from "../util";

const RATINGS: { r: Rating; label: string; cls: string }[] = [
  { r: 0, label: "Again", cls: "again" },
  { r: 1, label: "Hard", cls: "hard" },
  { r: 2, label: "Good", cls: "good" },
  { r: 3, label: "Easy", cls: "easy" },
];

export function ReviewPage({ query }: { query: URLSearchParams }) {
  const courseId = query.get("course");
  const lessonId = query.get("lesson");
  const mode = query.get("mode") === "all" ? "all" : "due";
  const settings = useSettings();

  const [queue, setQueue] = useState<Card[] | null>(null);
  const [courses, setCourses] = useState<Map<string, Course>>(new Map());
  const [initial, setInitial] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState({ again: 0, ok: 0 });
  const [frontIsTarget, setFrontIsTarget] = useState(true);
  const [title, setTitle] = useState("All courses");
  const seenNew = useRef(new Set<string>());

  useEffect(() => {
    void (async () => {
      const [q, cs] = await Promise.all([buildReviewQueue({ courseId, lessonId }, mode), db.courses.toArray()]);
      setCourses(new Map(cs.map((c) => [c.id, c])));
      if (lessonId) setTitle((await db.lessons.get(lessonId))?.title ?? "Lesson");
      else if (courseId) setTitle(cs.find((c) => c.id === courseId)?.name ?? "Course");
      setQueue(q);
      setInitial(q.length);
    })();
  }, [courseId, lessonId, mode]);

  const card = queue?.[0];
  const course = card ? courses.get(card.courseId) : undefined;

  // Choose which side is shown first for each new card.
  useEffect(() => {
    if (!card) return;
    const target = settings.cardFront === "target" || (settings.cardFront === "mixed" && Math.random() < 0.5);
    setFrontIsTarget(target);
    setFlipped(false);
    if (settings.autoSpeak && target && course) speak(card.term, course.targetLanguage);
  }, [card?.id, done]);

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card || !queue) return;
      const wasNew = isNew(card) && !seenNew.current.has(card.id);
      if (wasNew) seenNew.current.add(card.id);
      const next = schedule(card, rating);
      await db.cards.update(card.id, next);
      await bumpActivity({ reviews: 1, correct: rating > 0 ? 1 : 0, newCards: wasNew ? 1 : 0 });
      const rest = queue.slice(1);
      // "Again" brings the card back a few cards later in this session.
      if (rating === 0) rest.splice(Math.min(rest.length, 3), 0, { ...card, ...next });
      setQueue(rest);
      setDone((d) => d + 1);
      setStats((s) => (rating === 0 ? { ...s, again: s.again + 1 } : { ...s, ok: s.ok + 1 }));
    },
    [card, queue],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card) return;
      if (e.target instanceof HTMLInputElement) return;
      if ((e.key === " " || e.key === "Enter") && !flipped) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        void rate((Number(e.key) - 1) as Rating);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, flipped, rate]);

  const back = lessonId ? `#/lesson/${lessonId}` : courseId ? `#/course/${courseId}` : "#/";

  if (!queue) return <Loading />;

  if (!card) {
    if (initial === 0) {
      return (
        <div className="page narrow">
          <a className="back" href={back}>✕ Close</a>
          <Empty
            title="Nothing due right now"
            action={
              <div className="row gap center">
                <a className="btn primary" href={href("/review", { course: courseId, lesson: lessonId, mode: "all" })}>
                  Review all cards anyway
                </a>
                <a className="btn" href={href("/practice", { course: courseId, lesson: lessonId })}>
                  Practise instead
                </a>
              </div>
            }
          >
            You've reviewed everything that's due. Cards come back on the day you're about to forget them.
          </Empty>
        </div>
      );
    }
    const pct = Math.round((stats.ok / Math.max(1, stats.ok + stats.again)) * 100);
    return (
      <div className="page narrow center">
        <div className="finish">
          <div className="big-emoji">🎉</div>
          <h1>Session complete</h1>
          <p className="muted">
            {plural(stats.ok + stats.again, "review")} · {pct}% remembered first time
          </p>
          <div className="row gap center">
            <a className="btn primary" href={href("/practice", { course: courseId, lesson: lessonId })}>
              Practise grammar
            </a>
            <a className="btn" href={back}>
              Done
            </a>
          </div>
        </div>
      </div>
    );
  }

  const lang = course?.targetLanguage ?? "";
  const front = frontIsTarget ? card.term : card.translation;

  return (
    <div className="study">
      <div className="study-top">
        <a className="back" href={back} aria-label="Close review">
          ✕
        </a>
        <div className="grow">
          <div className="small muted">{title}</div>
          <Progress value={done} max={done + queue.length} />
        </div>
        <span className="small muted">{queue.length} left</span>
      </div>

      <div className={`flashcard${flipped ? " flipped" : ""}`} onClick={() => setFlipped(true)} style={{ "--accent": course?.color } as React.CSSProperties}>
        <div className="fc-inner">
          {isNew(card) && <span className="tag new-tag">new</span>}
          <div className="fc-front">
            <span className="fc-term" lang={frontIsTarget ? lang : undefined}>
              {front}
            </span>
            {frontIsTarget && <SpeakButton text={card.term} language={lang} size="lg" />}
            {!frontIsTarget && card.partOfSpeech && <span className="muted small">({card.partOfSpeech})</span>}
          </div>
          {flipped ? (
            <div className="fc-back">
              <hr />
              <span className="fc-answer">
                {frontIsTarget ? card.translation : card.term}
                {!frontIsTarget && <SpeakButton text={card.term} language={lang} />}
              </span>
              <div className="fc-details">
                {(card.partOfSpeech || card.gender) && (
                  <span className="muted small">{[card.partOfSpeech, card.gender].filter(Boolean).join(" · ")}</span>
                )}
                {card.example && (
                  <p className="fc-example">
                    <span lang={lang}>{card.example}</span>
                    {card.exampleTranslation && <span className="muted"> — {card.exampleTranslation}</span>}
                  </p>
                )}
                {card.note && <p className="note small">{card.note}</p>}
              </div>
            </div>
          ) : (
            <p className="muted small fc-hint">Tap or press space to reveal</p>
          )}
        </div>
      </div>

      <div className="rating">
        {flipped ? (
          RATINGS.map(({ r, label, cls }) => (
            <button key={r} className={`rate ${cls}`} onClick={() => void rate(r)}>
              <strong>{label}</strong>
              <span>{previewInterval(card, r)}</span>
            </button>
          ))
        ) : (
          <button className="btn primary lg block" onClick={() => setFlipped(true)}>
            Show answer
          </button>
        )}
      </div>
    </div>
  );
}
