# StudyScan

A study aid for language classes. Photograph pages from your textbook or your handwritten class notes. StudyScan reads them with Claude and builds:

- **Flashcards** with spaced repetition (Again / Hard / Good / Easy), so words come back just before you'd forget them
- **Grammar notes** in plain language, with example sentences
- **Practice exercises**: fill-in-the-blank, multiple choice, and translation both ways. Translations that don't match the expected answer exactly are graded by the AI, so a correct answer worded differently still counts.
- **A match game** for fast vocabulary drills
- **Read-aloud** pronunciation through the browser's built-in speech

You can run several courses at once (e.g. Spanish 2 and Japanese 1, or two textbooks for the same language). Each course keeps its own lessons and review schedule, and the home screen shows what's due across all of them.

## How it works

```
Phone/browser (React)                    Server (Node + Express)            Claude
──────────────────────                   ───────────────────────            ──────
1. take/choose photos
2. shrink to ~1600px JPEG ───────────▶   POST /api/scan  ─────────────────▶  reads pages, returns JSON:
                                                                              vocab, grammar, exercises
3. you review & fix the results  ◀──────────────────────────────────────────
4. saved on the device (IndexedDB)
5. flashcards / practice / match run on the device
   · wrong translation? ─────────────▶   POST /api/grade ─────────────────▶  lenient grading
   · "Generate more practice" ───────▶   POST /api/practice ──────────────▶  new exercises aimed at weak spots
```

- Your API key stays on the server. The browser never sees it.
- Lessons, cards and progress are stored in the browser on your device. Use **Settings → Download backup** to move them to another device.
- **Add pages** on a lesson scans more pages into the same lesson without duplicating vocabulary.
- Words you miss in practice go back into your flashcard queue.

## Run it

Requires Node 20 or newer.

```bash
cd studyscan
npm install
cp .env.example .env        # then put your key in ANTHROPIC_API_KEY
npm run dev                 # web app on http://localhost:5173, API on :8787
```

Open the printed URL on your phone (same Wi-Fi) to use the camera. Without an API key the server runs in **demo mode**: every scan returns the same sample Spanish lesson, so you can try the whole app first.

Production:

```bash
npm run build
npm start                   # serves the app and API on http://localhost:8787
```

To install it on a phone, deploy it somewhere with HTTPS, open it in the browser, and use **Add to Home Screen**. Phone cameras only work in the browser over HTTPS or on localhost.

### Settings (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Required for real scanning |
| `STUDYSCAN_MODEL` | `claude-opus-5-5` | Model used for scanning, practice and grading |
| `STUDYSCAN_SCAN_EFFORT` | `medium` | `low` is faster and cheaper; `high` reads messy handwriting more carefully |
| `STUDYSCAN_DEMO` | (unset) | Set to `1` to force demo mode |
| `PORT` | `8787` | Server port |

If a request is declined by a safety check, it is retried automatically on a fallback model (`fallbacks: "default"`).

## Project layout

```
server/
  index.ts     Express API and static hosting
  ai.ts        Claude calls (page reading, more practice, grading) with structured JSON output
  schema.ts    Zod schemas for what the AI returns
  demo.ts      Sample responses for demo mode
src/
  pages/       Home, Course, Scan, Lesson, Review (flashcards), Practice, Match, Settings
  db.ts        IndexedDB storage (Dexie)
  srs.ts       Spaced repetition scheduler
  answer.ts    Local answer checking (accents, typos)
  image.ts     In-browser photo resizing
```

## Ideas for later

- Accounts and cloud sync (e.g. Firebase, which the Vratnica site already uses) so progress follows you across devices
- A teacher mode that shares a scanned lesson with a whole class
- Listening and speaking drills
- Export to Anki
