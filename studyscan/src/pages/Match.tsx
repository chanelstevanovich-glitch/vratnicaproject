import { useEffect, useState } from "react";
import { bumpActivity } from "../db";
import { cardsInScope } from "../queries";
import { Empty, Loading } from "../components/ui";
import type { Card } from "../types";
import { shuffle } from "../util";

const PAIRS = 6;

interface Tile {
  id: string;
  cardId: string;
  text: string;
  side: "term" | "meaning";
}

export function MatchPage({ query }: { query: URLSearchParams }) {
  const courseId = query.get("course");
  const lessonId = query.get("lesson");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [start, setStart] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [round, setRound] = useState(0);

  useEffect(() => {
    void cardsInScope({ courseId, lessonId }).then(setCards);
  }, [courseId, lessonId]);

  useEffect(() => {
    if (!cards || cards.length < 4) return;
    // Favour cards that need work, with some randomness.
    const pool = shuffle(cards)
      .sort((a, b) => a.interval - b.interval)
      .slice(0, PAIRS * 2);
    const pick = shuffle(pool).slice(0, Math.min(PAIRS, cards.length));
    const terms = shuffle(pick.map((c) => ({ id: `t-${c.id}`, cardId: c.id, text: c.term, side: "term" as const })));
    const means = shuffle(pick.map((c) => ({ id: `m-${c.id}`, cardId: c.id, text: c.translation, side: "meaning" as const })));
    setTiles(terms.flatMap((t, i) => [t, means[i]]));
    setMatched(new Set());
    setSelected(null);
    setMistakes(0);
    setStart(Date.now());
    setElapsed(0);
  }, [cards, round]);

  const total = tiles.length / 2;
  const finished = total > 0 && matched.size === total;

  useEffect(() => {
    if (finished) {
      void bumpActivity({ practice: 1 });
      return;
    }
    const t = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(t);
  }, [finished, start]);

  const back = lessonId ? `#/lesson/${lessonId}` : courseId ? `#/course/${courseId}` : "#/";

  if (!cards) return <Loading />;
  if (cards.length < 4) {
    return (
      <div className="page narrow">
        <a className="back" href={back}>✕ Close</a>
        <Empty title="Not enough words yet">The match game needs at least 4 vocabulary cards.</Empty>
      </div>
    );
  }

  function pick(tile: Tile) {
    if (matched.has(tile.cardId) || finished) return;
    if (!selected || selected.side === tile.side) {
      setSelected(tile);
      return;
    }
    if (selected.cardId === tile.cardId) {
      setMatched((m) => new Set(m).add(tile.cardId));
    } else {
      setMistakes((n) => n + 1);
      setWrong([selected.id, tile.id]);
      setTimeout(() => setWrong([]), 450);
    }
    setSelected(null);
  }

  const secs = (elapsed / 1000).toFixed(1);

  return (
    <div className="study">
      <div className="study-top">
        <a className="back" href={back} aria-label="Close game">
          ✕
        </a>
        <div className="grow small muted">Match each word with its meaning</div>
        <span className="small muted">
          ⏱ {secs}s · {mistakes} miss{mistakes === 1 ? "" : "es"}
        </span>
      </div>

      {finished ? (
        <div className="finish">
          <div className="big-emoji">⚡</div>
          <h1>{secs} seconds</h1>
          <p className="muted">{mistakes === 0 ? "No mistakes. Brilliant!" : `${mistakes} miss${mistakes === 1 ? "" : "es"}. Go again to beat your time.`}</p>
          <div className="row gap center">
            <button className="btn primary" onClick={() => setRound((r) => r + 1)}>
              Play again
            </button>
            <a className="btn" href={back}>
              Done
            </a>
          </div>
        </div>
      ) : (
        <div className="match-grid">
          {tiles.map((t) => (
            <button
              key={t.id}
              className={[
                "tile",
                t.side,
                selected?.id === t.id ? "sel" : "",
                matched.has(t.cardId) ? "done" : "",
                wrong.includes(t.id) ? "bad" : "",
              ].join(" ")}
              onClick={() => pick(t)}
              disabled={matched.has(t.cardId)}
            >
              {t.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
