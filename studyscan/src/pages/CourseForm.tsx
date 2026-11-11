import { useEffect, useState, type FormEvent } from "react";
import { db, deleteCourse, uid } from "../db";
import { navigate } from "../router";
import { useSettings } from "../settings";
import { BackLink } from "../components/ui";
import { COURSE_COLORS } from "../util";

const LANGUAGES = [
  "Spanish", "French", "German", "Italian", "Portuguese", "Japanese", "Chinese", "Korean", "Russian", "Serbian",
  "Croatian", "Arabic", "Hebrew", "Hindi", "Turkish", "Greek", "Dutch", "Swedish", "Polish", "Latin", "English",
];
const LEVELS = ["Beginner (A1)", "Elementary (A2)", "Intermediate (B1)", "Upper intermediate (B2)", "Advanced (C1+)"];

export function CourseForm({ courseId }: { courseId?: string }) {
  const settings = useSettings();
  const [name, setName] = useState("");
  const [targetLanguage, setTarget] = useState("");
  const [nativeLanguage, setNative] = useState(settings.nativeLanguage);
  const [level, setLevel] = useState("");
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [loaded, setLoaded] = useState(!courseId);

  useEffect(() => {
    if (!courseId) {
      void db.courses.count().then((n) => setColor(COURSE_COLORS[n % COURSE_COLORS.length]));
      return;
    }
    void db.courses.get(courseId).then((c) => {
      if (!c) return;
      setName(c.name);
      setTarget(c.targetLanguage);
      setNative(c.nativeLanguage);
      setLevel(c.level ?? "");
      setColor(c.color);
      setLoaded(true);
    });
  }, [courseId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const course = {
      name: name.trim() || `${targetLanguage.trim()} course`,
      targetLanguage: targetLanguage.trim(),
      nativeLanguage: nativeLanguage.trim() || "English",
      level: level || null,
      color,
    };
    if (courseId) {
      await db.courses.update(courseId, course);
      navigate(`/course/${courseId}`);
    } else {
      const id = uid();
      await db.courses.add({ id, ...course, createdAt: Date.now() });
      navigate(`/course/${id}`);
    }
  }

  async function remove() {
    if (!courseId) return;
    if (!confirm("Delete this course and all of its lessons, cards and progress? This can't be undone.")) return;
    await deleteCourse(courseId);
    navigate("/");
  }

  if (!loaded) return null;

  return (
    <div className="page narrow">
      <BackLink to={courseId ? `#/course/${courseId}` : "#/"} label="Back" />
      <h1>{courseId ? "Edit course" : "New course"}</h1>
      <p className="muted">
        Create one course per class or textbook. You can study several at the same time; each keeps its own lessons and
        review schedule.
      </p>
      <form className="form" onSubmit={submit}>
        <label>
          Language you're learning
          <input
            list="langs"
            required
            value={targetLanguage}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. Spanish"
            autoFocus={!courseId}
          />
          <datalist id="langs">
            {LANGUAGES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <label>
          Course or textbook name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spanish 2 · ¡Avancemos! 2" />
        </label>
        <div className="two">
          <label>
            Explain things in
            <input list="langs" value={nativeLanguage} onChange={(e) => setNative(e.target.value)} />
          </label>
          <label>
            Level
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Not sure</option>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Colour</legend>
          <div className="swatches">
            {COURSE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${c === color ? " on" : ""}`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>
        <div className="row gap">
          <button className="btn primary lg" type="submit">
            {courseId ? "Save changes" : "Create course"}
          </button>
          {courseId && (
            <button className="btn danger" type="button" onClick={remove}>
              Delete course
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
