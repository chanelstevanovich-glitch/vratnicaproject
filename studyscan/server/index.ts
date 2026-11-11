import "./env.js";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AIError, gradeAnswer, generatePractice, scanPages } from "./ai.js";
import { demoGrade, demoPractice, demoScan } from "./demo.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);

// Demo mode: explicit opt-in, or automatic when no credentials are present.
const DEMO =
  process.env.STUDYSCAN_DEMO === "1" ||
  (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE);

const app = express();
app.use(express.json({ limit: "40mb" }));

const ScanBody = z.object({
  images: z
    .array(
      z.object({
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
        data: z.string().min(100),
      }),
    )
    .min(1)
    .max(12),
  context: z.object({
    targetLanguage: z.string().min(1),
    nativeLanguage: z.string().min(1),
    courseName: z.string().min(1),
    sourceType: z.enum(["textbook", "notes", "auto"]),
    level: z.string().nullable(),
    appendTo: z
      .object({ title: z.string(), knownTerms: z.array(z.string()), grammarTitles: z.array(z.string()) })
      .nullable(),
    otherLessonTitles: z.array(z.string()),
  }),
});

const PracticeBody = z.object({
  targetLanguage: z.string(),
  nativeLanguage: z.string(),
  lessonTitle: z.string(),
  vocabulary: z.array(z.object({ term: z.string(), translation: z.string() })).max(300),
  grammar: z.array(z.object({ title: z.string(), explanation: z.string() })).max(50),
  weakSpots: z.array(z.string()).max(40),
  existingPrompts: z.array(z.string()).max(200),
  count: z.number().int().min(3).max(25),
});

const GradeBody = z.object({
  targetLanguage: z.string(),
  nativeLanguage: z.string(),
  prompt: z.string().max(2000),
  expected: z.array(z.string()).min(1),
  given: z.string().max(2000),
});

type Handler = (req: Request, res: Response) => Promise<void>;
const route =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, demo: DEMO });
});

app.post(
  "/api/scan",
  route(async (req, res) => {
    const body = ScanBody.parse(req.body);
    const result = DEMO ? demoScan() : await scanPages(body.images, body.context);
    res.json(result);
  }),
);

app.post(
  "/api/practice",
  route(async (req, res) => {
    const body = PracticeBody.parse(req.body);
    res.json(DEMO ? demoPractice() : await generatePractice(body));
  }),
);

app.post(
  "/api/grade",
  route(async (req, res) => {
    const body = GradeBody.parse(req.body);
    res.json(DEMO ? demoGrade(body.given, body.expected) : await gradeAnswer(body));
  }),
);

// Serve the built web app in production.
const dist = path.resolve(here, "../dist");
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(dist, "index.html"));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.issues });
    return;
  }
  if (err instanceof AIError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err && typeof err === "object" && "type" in err && err.type === "entity.too.large") {
    res.status(413).json({ error: "Those photos are too large. Try fewer pages at once." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`StudyScan server on http://localhost:${PORT}${DEMO ? "  (DEMO mode - no API key set)" : ""}`);
});
