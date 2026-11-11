import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { streak, summarize } from "../queries";
import { useSettings } from "../settings";
import { Empty, Loading } from "../components/ui";
import { href } from "../router";
import { plural, todayKey } from "../util";

export function Home() {
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    const [courses, lessons, cards, today, s] = await Promise.all([
      db.courses.orderBy("createdAt").toArray(),
      db.lessons.orderBy("createdAt").reverse().toArray(),
      db.cards.toArray(),
      db.activity.get(todayKey()),
      streak(),
    ]);
    return { courses, lessons, cards, today, streak: s };
  }, []);

  if (!data) return <Loading />;
  const { courses, lessons, cards, today } = data;
  const newLeft = Math.max(0, settings.newCardsPerDay - (today?.newCards ?? 0));
  const all = summarize(cards, newLeft);
  const toStudy = all.due + all.fresh;

  if (courses.length === 0) {
    return (
      <div className="page">
        <section className="hero">
          <h1>Remember what you learn in class.</h1>
          <p>
            Snap a photo of your textbook or your handwritten notes. StudyScan reads the page and builds flashcards, grammar
            explanations and practice exercises from exactly what you're studying.
          </p>
          <ol className="steps">
            <li>
              <b>Add a course</b> for each language or textbook you're using.
            </li>
            <li>
              <b>Scan pages</b> after each class: textbook pages, worksheets or your notebook.
            </li>
            <li>
              <b>Review a few minutes a day.</b> Spaced repetition brings words back just before you'd forget them.
            </li>
          </ol>
          <a className="btn primary lg" href="#/courses/new">
            Add your first course
          </a>
        </section>
      </div>
    );
  }

  const recent = lessons.slice(0, 5);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  return (
    <div className="page">
      <section className="today card-surface">
        <div>
          <p className="eyebrow">Today</p>
          {toStudy > 0 ? (
            <h1>{plural(toStudy, "card")} ready to study</h1>
          ) : (
            <h1>You're all caught up 🎉</h1>
          )}
          <p className="muted">
            {all.due > 0 && `${all.due} due for review`}
            {all.due > 0 && all.fresh > 0 && " · "}
            {all.fresh > 0 && `${all.fresh} new`}
            {toStudy === 0 && "Scan today's class pages, or practise grammar to stay sharp."}
          </p>
          <div className="row gap">
            {toStudy > 0 && (
              <a className="btn primary lg" href="#/review">
                Start review
              </a>
            )}
            <a className={`btn lg ${toStudy > 0 ? "" : "primary"}`} href="#/scan">
              Scan pages
            </a>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="num">{data.streak}</span>
            <span className="lbl">day streak</span>
          </div>
          <div className="stat">
            <span className="num">{today?.reviews ?? 0}</span>
            <span className="lbl">reviewed today</span>
          </div>
          <div className="stat">
            <span className="num">{cards.filter((c) => c.interval >= 21).length}</span>
            <span className="lbl">words mastered</span>
          </div>
        </div>
      </section>

      <div className="section-head">
        <h2>Your courses</h2>
        <a className="btn ghost" href="#/courses/new">
          + New course
        </a>
      </div>
      <div className="grid courses">
        {courses.map((c) => {
          const cc = cards.filter((k) => k.courseId === c.id);
          const s = summarize(cc, null);
          const lessonCount = lessons.filter((l) => l.courseId === c.id).length;
          return (
            <article key={c.id} className="course-card" style={{ "--accent": c.color } as React.CSSProperties}>
              <a className="course-main" href={`#/course/${c.id}`}>
                <span className="lang-pill">{c.targetLanguage}</span>
                <h3>{c.name}</h3>
                <p className="muted small">
                  {plural(lessonCount, "lesson")} · {plural(s.total, "card")}
                </p>
              </a>
              <div className="course-actions">
                <a className="btn sm" href={href("/review", { course: c.id })}>
                  Review{s.due > 0 && <span className="badge">{s.due}</span>}
                </a>
                <a className="btn sm ghost" href={href("/scan", { course: c.id })}>
                  Scan
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-head">
            <h2>Recent lessons</h2>
          </div>
          <ul className="list">
            {recent.map((l) => {
              const c = courseById.get(l.courseId);
              return (
                <li key={l.id}>
                  <a href={`#/lesson/${l.id}`} className="list-item">
                    {l.pages[0] ? <img src={l.pages[0]} alt="" className="thumb" /> : <div className="thumb" />}
                    <div>
                      <strong>{l.title}</strong>
                      <span className="muted small">{c?.name}</span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {lessons.length === 0 && (
        <Empty title="No lessons yet" action={<a className="btn primary" href="#/scan">Scan your first pages</a>}>
          Scan a textbook page or your class notes to create your first lesson.
        </Empty>
      )}
    </div>
  );
}
