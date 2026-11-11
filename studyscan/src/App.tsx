import { useEffect, useState } from "react";
import { getStatus, type ServerStatus } from "./api";
import { useRoute } from "./router";
import { Home } from "./pages/Home";
import { CourseForm } from "./pages/CourseForm";
import { CoursePage } from "./pages/Course";
import { ScanPage } from "./pages/Scan";
import { LessonPage } from "./pages/Lesson";
import { ReviewPage } from "./pages/Review";
import { PracticePage } from "./pages/Practice";
import { MatchPage } from "./pages/Match";
import { SettingsPage } from "./pages/Settings";

const NAV = [
  { key: "", label: "Home", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { key: "scan", label: "Scan", icon: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8" },
  { key: "review", label: "Review", icon: "M6 4h9a3 3 0 0 1 3 3v13H9a3 3 0 0 1-3-3zM9 9h6M9 13h4" },
  { key: "settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4 7 17M17 17l1.4 1.4M5.6 5.6 7 7" },
];

export function App() {
  const route = useRoute();
  const [status, setStatus] = useState<ServerStatus | null | undefined>(undefined);
  useEffect(() => {
    void getStatus().then(setStatus);
  }, []);

  const [first, second, third] = route.path;
  let page;
  switch (first) {
    case undefined:
      page = <Home />;
      break;
    case "courses":
      page = <CourseForm />;
      break;
    case "course":
      page = third === "edit" ? <CourseForm courseId={second} /> : <CoursePage id={second} />;
      break;
    case "scan":
      page = <ScanPage query={route.query} status={status} />;
      break;
    case "lesson":
      page = <LessonPage id={second} status={status} />;
      break;
    case "review":
      page = <ReviewPage query={route.query} />;
      break;
    case "practice":
      page = <PracticePage query={route.query} status={status} />;
      break;
    case "match":
      page = <MatchPage query={route.query} />;
      break;
    case "settings":
      page = <SettingsPage status={status} />;
      break;
    default:
      page = <Home />;
  }

  const active = first ?? "";
  const focusMode = first === "review" || first === "practice" || first === "match";

  return (
    <div className={`shell${focusMode ? " focus" : ""}`}>
      <header className="topbar">
        <a href="#/" className="brand">
          <img src="/icon.svg" alt="" width="28" height="28" />
          <span>StudyScan</span>
        </a>
        <nav className="topnav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.key} href={`#/${n.key}`} className={active === n.key ? "active" : ""}>
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      {status?.demo && (
        <div className="demo-banner">
          Demo mode: the server has no Anthropic API key, so scans return sample content. Add <code>ANTHROPIC_API_KEY</code> to
          enable real page reading.
        </div>
      )}
      {status === null && <div className="demo-banner warn">Offline: you can review saved cards, but scanning needs the server.</div>}
      <main className="main">{page}</main>
      <nav className="bottomnav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.key} href={`#/${n.key}`} className={active === n.key ? "active" : ""}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={n.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
