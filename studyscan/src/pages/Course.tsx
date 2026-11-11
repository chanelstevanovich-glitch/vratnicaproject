import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { summarize } from "../queries";
import { href } from "../router";
import { BackLink, Empty, Loading, Progress } from "../components/ui";
import { plural } from "../util";

export function CoursePage({ id }: { id: string }) {
  const data = useLiveQuery(async () => {
    const course = await db.courses.get(id);
    if (!course) return { course: null } as const;
    const [lessons, cards, exercises, grammar] = await Promise.all([
      db.lessons.where("courseId").equals(id).sortBy("createdAt"),
      db.cards.where("courseId").equals(id).toArray(),
      db.exercises.where("courseId").equals(id).toArray(),
      db.grammar.where("courseId").equals(id).toArray(),
    ]);
    return { course, lessons, cards, exercises, grammar };
  }, [id]);

  if (!data) return <Loading />;
  if (!data.course) return <Empty title="Course not found" action={<a className="btn" href="#/">Home</a>} />;
  const { course, lessons, cards, exercises, grammar } = data;
  const s = summarize(cards, null);
  const mastered = cards.filter((c) => c.interval >= 21).length;

  return (
    <div className="page" style={{ "--accent": course.color } as React.CSSProperties}>
      <BackLink to="#/" label="Home" />
      <header className="page-head accent-bar">
        <div>
          <span className="lang-pill">{course.targetLanguage}</span>
          <h1>{course.name}</h1>
          <p className="muted">
            {plural(lessons.length, "lesson")} · {plural(cards.length, "card")} · {plural(grammar.length, "grammar point")}
            {course.level && ` · ${course.level}`}
          </p>
        </div>
        <a className="btn ghost sm" href={`#/course/${id}/edit`}>
          Edit
        </a>
      </header>

      <div className="action-grid">
        <a className="action primary" href={href("/review", { course: id })}>
          <strong>Flashcards</strong>
          <span>{s.due > 0 ? `${s.due} due` : s.fresh > 0 ? `${s.fresh} new` : "Up to date"}</span>
        </a>
        <a className={`action${exercises.length ? "" : " disabled"}`} href={href("/practice", { course: id })}>
          <strong>Practice</strong>
          <span>{plural(exercises.length, "exercise")}</span>
        </a>
        <a className={`action${cards.length >= 4 ? "" : " disabled"}`} href={href("/match", { course: id })}>
          <strong>Match game</strong>
          <span>Pair words fast</span>
        </a>
        <a className="action" href={href("/scan", { course: id })}>
          <strong>Scan pages</strong>
          <span>Add a lesson</span>
        </a>
      </div>

      {cards.length > 0 && (
        <div className="mastery">
          <div className="row between small">
            <span>Mastery</span>
            <span className="muted">
              {mastered} / {cards.length} words remembered for 3+ weeks
            </span>
          </div>
          <Progress value={mastered} max={cards.length} />
        </div>
      )}

      <div className="section-head">
        <h2>Lessons</h2>
      </div>
      {lessons.length === 0 ? (
        <Empty title="No lessons yet" action={<a className="btn primary" href={href("/scan", { course: id })}>Scan pages</a>}>
          Photograph the pages you covered in class: textbook, worksheets or your notebook.
        </Empty>
      ) : (
        <ul className="list">
          {lessons.map((l, i) => {
            const lc = cards.filter((c) => c.lessonId === l.id);
            const ls = summarize(lc, null);
            return (
              <li key={l.id}>
                <a href={`#/lesson/${l.id}`} className="list-item">
                  {l.pages[0] ? <img src={l.pages[0]} alt="" className="thumb" /> : <div className="thumb num">{i + 1}</div>}
                  <div className="grow">
                    <strong>{l.title}</strong>
                    <span className="muted small">
                      {plural(lc.length, "card")}
                      {l.sourceTypes.includes("notes") && " · from notes"}
                      {` · ${new Date(l.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                    </span>
                  </div>
                  {ls.due > 0 && <span className="badge">{ls.due} due</span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
