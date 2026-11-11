import { useEffect, useRef, useState, type FormEvent } from "react";
import { bumpActivity, db } from "../db";
import { gradeAnswer, type ServerStatus } from "../api";
import { checkLocally } from "../answer";
import { cardsInScope, exercisesInScope, pickExercises } from "../queries";
import { href } from "../router";
import { Empty, Loading, Progress, SpeakButton } from "../components/ui";
import type { Card, Course, ExerciseKind } from "../types";
import { plural, shuffle } from "../util";

interface Item {
  key: string;
  kind: ExerciseKind;
  prompt: string;
  answer: string;
  accepted: string[];
  options: string[];
  hint: string | null;
  explanation: string | null;
  courseId: string;
  exerciseId?: string;
  cardId?: string;
  retry?: boolean;
}

type Verdict = "correct" | "almost" | "incorrect";
interface Feedback {
  verdict: Verdict;
  message: string;
  shown: string;
  given: string;
}

const ACCENTS: Record<string, string> = {
  spanish: "á é í ó ú ñ ü ¿ ¡",
  french: "é è ê à â ç ô û ù ë ï œ",
  german: "ä ö ü ß",
  italian: "à è é ì ò ù",
  portuguese: "á â ã à ç é ê í ó ô õ ú",
  serbian: "č ć đ š ž",
  croatian: "č ć đ š ž",
  bosnian: "č ć đ š ž",
  polish: "ą ć ę ł ń ó ś ź ż",
  czech: "á č ď é ě í ň ó ř š ť ú ů ý ž",
  turkish: "ç ğ ı ö ş ü",
  swedish: "å ä ö",
  norwegian: "å æ ø",
  danish: "å æ ø",
  dutch: "é ë ï ó",
  romanian: "ă â î ș ț",
  vietnamese: "ă â đ ê ô ơ ư",
};

function vocabItems(cards: Card[], n: number): Item[] {
  if (cards.length === 0) return [];
  // Prefer words the student struggles with or hasn't learned yet.
  const ranked = shuffle(cards).sort((a, b) => b.lapses - a.lapses || a.interval - b.interval);
  return ranked.slice(0, n).map((c, i): Item => {
    const mc = cards.length >= 4 && i % 2 === 0;
    if (mc) {
      const distractors = shuffle(cards.filter((x) => x.id !== c.id && x.translation !== c.translation))
        .slice(0, 3)
        .map((x) => x.translation);
      return {
        key: `v-${c.id}`,
        kind: "multiple_choice",
        prompt: `What does “${c.term}” mean?`,
        answer: c.translation,
        accepted: [],
        options: shuffle([c.translation, ...distractors]),
        hint: null,
        explanation: c.example ? `${c.example}${c.exampleTranslation ? ` — ${c.exampleTranslation}` : ""}` : null,
        courseId: c.courseId,
        cardId: c.id,
      };
    }
    return {
      key: `v-${c.id}`,
      kind: "translate_to_target",
      prompt: c.translation,
      answer: c.term,
      accepted: [c.term.replace(/^(el|la|los|las|le|la|les|l'|der|die|das|il|lo|gli|un|una|a|an|the)\s+/i, "")],
      options: [],
      hint: c.partOfSpeech,
      explanation: c.note,
      courseId: c.courseId,
      cardId: c.id,
    };
  });
}

export function PracticePage({ query, status }: { query: URLSearchParams; status: ServerStatus | null | undefined }) {
  const courseId = query.get("course");
  const lessonId = query.get("lesson");
  const grammarId = query.get("grammar");
  const [items, setItems] = useState<Item[] | null>(null);
  const [courses, setCourses] = useState<Map<string, Course>>(new Map());
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<{ item: Item; verdict: Verdict; given: string }[]>([]);
  const [round, setRound] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const [exs, cards, cs] = await Promise.all([
        exercisesInScope({ courseId, lessonId }),
        cardsInScope({ courseId, lessonId }),
        db.courses.toArray(),
      ]);
      setCourses(new Map(cs.map((c) => [c.id, c])));
      const pool = grammarId ? exs.filter((e) => e.grammarId === grammarId) : exs;
      const chosen = pickExercises(pool, grammarId ? 12 : 10).map(
        (e): Item => ({
          key: e.id,
          kind: e.kind,
          prompt: e.prompt,
          answer: e.answer,
          accepted: e.acceptableAnswers,
          options: e.kind === "multiple_choice" ? shuffle(e.options.length ? e.options : [e.answer]) : [],
          hint: e.hint,
          explanation: e.explanation,
          courseId: e.courseId,
          exerciseId: e.id,
        }),
      );
      const vocab = grammarId ? [] : vocabItems(cards, Math.max(4, 14 - chosen.length));
      setItems(shuffle([...chosen, ...vocab]));
      setIdx(0);
      setResults([]);
    })();
  }, [courseId, lessonId, grammarId, round]);

  const item = items?.[idx];
  const course = item ? courses.get(item.courseId) : undefined;

  useEffect(() => {
    setInput("");
    setShowHint(false);
    setFeedback(null);
    inputRef.current?.focus();
    // Keyed on the current item, not the list: queuing a retry must not wipe the feedback.
  }, [idx, item?.key]);

  const back = lessonId ? `#/lesson/${lessonId}` : courseId ? `#/course/${courseId}` : "#/";

  async function record(it: Item, verdict: Verdict, given: string) {
    const ok = verdict !== "incorrect";
    if (it.exerciseId) {
      const ex = await db.exercises.get(it.exerciseId);
      if (ex)
        await db.exercises.update(ex.id, {
          attempts: ex.attempts + 1,
          correct: ex.correct + (ok ? 1 : 0),
          lastResult: ok ? "correct" : "incorrect",
          lastSeen: Date.now(),
        });
    }
    if (it.cardId && !ok) {
      // Missed a word in practice: bring its flashcard back for review now.
      await db.cards.update(it.cardId, { due: Date.now() });
    }
    if (!it.retry) await bumpActivity({ practice: 1 });
    setResults((r) => [...r.filter((x) => x.item.key !== it.key || x.item.retry !== it.retry), { item: it, verdict, given }]);
    if (!ok && !it.retry) setItems((list) => (list ? [...list, { ...it, retry: true, key: `${it.key}-retry` }] : list));
  }

  async function submit(given: string) {
    if (!item || feedback || checking) return;
    const expected = [item.answer, ...item.accepted];
    let fb: Feedback;
    if (item.kind === "multiple_choice") {
      const ok = given === item.answer;
      fb = { verdict: ok ? "correct" : "incorrect", message: ok ? "Correct!" : "Not quite.", shown: item.answer, given };
    } else {
      const local = checkLocally(given, expected);
      if (local.verdict === "correct") fb = { verdict: "correct", message: "Correct!", shown: local.closest, given };
      else if (local.verdict === "accent")
        fb = { verdict: "almost", message: "Almost: check the accents.", shown: local.closest, given };
      else if (local.verdict === "typo") fb = { verdict: "almost", message: "Almost: small spelling slip.", shown: local.closest, given };
      else if (status && !status.demo && given.trim() && item.kind !== "fill_blank" && course) {
        // A different wording can still be right: ask the AI for a fair grade.
        setChecking(true);
        try {
          const g = await gradeAnswer({
            targetLanguage: course.targetLanguage,
            nativeLanguage: course.nativeLanguage,
            prompt: item.prompt,
            expected,
            given,
          });
          fb = { verdict: g.verdict, message: g.feedback, shown: g.correctedAnswer ?? item.answer, given };
        } catch {
          fb = { verdict: "incorrect", message: "Not quite.", shown: item.answer, given };
        } finally {
          setChecking(false);
        }
      } else {
        fb = { verdict: "incorrect", message: given.trim() ? "Not quite." : "Here's the answer.", shown: item.answer, given };
      }
    }
    setFeedback(fb);
    await record(item, fb.verdict, given);
  }

  function overrule() {
    if (!item || !feedback) return;
    setFeedback({ ...feedback, verdict: "correct", message: "Marked as correct." });
    // Undo the queued retry and mistake.
    setItems((list) => list?.filter((x) => x.key !== `${item.key}-retry`) ?? list);
    setResults((r) => r.map((x) => (x.item.key === item.key ? { ...x, verdict: "correct" } : x)));
    if (item.exerciseId) {
      void db.exercises.get(item.exerciseId).then((ex) => {
        if (ex) void db.exercises.update(ex.id, { correct: ex.correct + 1, lastResult: "correct" });
      });
    }
  }

  function next() {
    setIdx((i) => i + 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (feedback && e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (!feedback && item?.kind === "multiple_choice" && /^[1-4]$/.test(e.key)) {
        const opt = item.options[Number(e.key) - 1];
        if (opt) void submit(opt);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!items) return <Loading />;

  if (items.length === 0) {
    return (
      <div className="page narrow">
        <a className="back" href={back}>✕ Close</a>
        <Empty title="Nothing to practise yet" action={<a className="btn primary" href={href("/scan", { course: courseId })}>Scan pages</a>}>
          Scan a lesson first. Its exercises and vocabulary will show up here.
        </Empty>
      </div>
    );
  }

  if (!item) {
    const firstTry = results.filter((r) => !r.item.retry);
    const right = firstTry.filter((r) => r.verdict !== "incorrect").length;
    const missed = firstTry.filter((r) => r.verdict === "incorrect");
    return (
      <div className="page narrow">
        <div className="finish">
          <div className="big-emoji">{right / Math.max(1, firstTry.length) >= 0.8 ? "🌟" : "💪"}</div>
          <h1>
            {right} / {firstTry.length} correct
          </h1>
          <p className="muted">
            {missed.length
              ? "Missed words are back in your flashcards, and missed exercises come first next time."
              : "Perfect round!"}
          </p>
        </div>
        {missed.length > 0 && (
          <ul className="mistakes">
            {missed.map((m) => (
              <li key={m.item.key}>
                <span>{m.item.prompt}</span>
                <span className="muted small">
                  You: {m.given || "—"} · Answer: <b>{m.item.answer}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="row gap center">
          <button className="btn primary" onClick={() => setRound((r) => r + 1)}>
            Another round
          </button>
          {lessonId && (
            <a className="btn" href={`#/lesson/${lessonId}`}>
              Get more exercises
            </a>
          )}
          <a className="btn ghost" href={back}>
            Done
          </a>
        </div>
      </div>
    );
  }

  const lang = course?.targetLanguage ?? "";
  const answerInTarget = item.kind === "fill_blank" || item.kind === "translate_to_target";
  const instruction =
    item.kind === "fill_blank"
      ? "Fill in the blank"
      : item.kind === "multiple_choice"
        ? "Choose the right answer"
        : item.kind === "translate_to_target"
          ? `Write it in ${lang}`
          : `Translate into ${course?.nativeLanguage ?? "your language"}`;
  const accents = answerInTarget ? ACCENTS[lang.toLowerCase()]?.split(" ") : undefined;

  return (
    <div className="study">
      <div className="study-top">
        <a className="back" href={back} aria-label="Close practice">
          ✕
        </a>
        <div className="grow">
          <Progress value={idx} max={items.length} />
        </div>
        <span className="small muted">
          {idx + 1} / {items.length}
        </span>
      </div>

      <div className="exercise card-surface" style={{ "--accent": course?.color } as React.CSSProperties}>
        <p className="eyebrow">
          {instruction}
          {item.retry && " · try again"}
        </p>
        <h2 className="prompt" lang={item.kind === "translate_to_native" || item.kind === "fill_blank" ? lang : undefined}>
          {item.prompt}
          {(item.kind === "translate_to_native" || item.kind === "fill_blank") && (
            <SpeakButton text={item.prompt.replace(/_+/g, "…")} language={lang} />
          )}
        </h2>

        {item.kind === "multiple_choice" ? (
          <div className="options">
            {item.options.map((o, i) => {
              const state = feedback ? (o === item.answer ? "right" : o === feedback.given ? "wrong" : "") : "";
              return (
                <button key={o} className={`option ${state}`} disabled={!!feedback} onClick={() => void submit(o)}>
                  <span className="opt-key">{i + 1}</span>
                  {o}
                </button>
              );
            })}
          </div>
        ) : (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!feedback) void submit(input);
            }}
          >
            <input
              ref={inputRef}
              className={`answer-input ${feedback?.verdict ?? ""}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!!feedback || checking}
              placeholder="Type your answer"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              lang={answerInTarget ? lang : undefined}
            />
            {accents && !feedback && (
              <div className="accent-keys">
                {accents.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => {
                      setInput((v) => v + a);
                      inputRef.current?.focus();
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
            {!feedback && (
              <div className="row gap">
                <button className="btn primary lg" disabled={checking}>
                  {checking ? "Checking…" : "Check"}
                </button>
                {item.hint && !showHint && (
                  <button type="button" className="btn ghost" onClick={() => setShowHint(true)}>
                    Hint
                  </button>
                )}
                <button type="button" className="btn ghost push-right" onClick={() => void submit("")}>
                  I don't know
                </button>
              </div>
            )}
          </form>
        )}
        {showHint && item.hint && !feedback && <p className="hint">💡 {item.hint}</p>}

        {feedback && (
          <div className={`feedback ${feedback.verdict}`} role="status">
            <strong>{feedback.message}</strong>
            {feedback.verdict !== "correct" && (
              <p>
                Answer: <b lang={answerInTarget ? lang : undefined}>{feedback.shown}</b>
                {answerInTarget && <SpeakButton text={feedback.shown} language={lang} />}
              </p>
            )}
            {item.explanation && <p className="small">{item.explanation}</p>}
            <div className="row gap">
              <button className="btn primary" onClick={next} autoFocus>
                Continue
              </button>
              {feedback.verdict === "incorrect" && feedback.given.trim() && (
                <button className="btn ghost sm" onClick={overrule}>
                  I was right
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="muted small center">{plural(results.filter((r) => r.verdict !== "incorrect").length, "correct answer")} so far</p>
    </div>
  );
}
