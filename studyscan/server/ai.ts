import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { GradeResult, PracticeResult, ScanResult } from "./schema.js";

const MODEL = process.env.STUDYSCAN_MODEL ?? "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const SCAN_EFFORT = (process.env.STUDYSCAN_SCAN_EFFORT as Effort | undefined) ?? "medium";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Resolves ANTHROPIC_API_KEY (or another configured credential) from the environment.
  client ??= new Anthropic();
  return client;
}

export class AIError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export interface PageImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string; // base64, no data: prefix
}

export interface ScanContext {
  targetLanguage: string;
  nativeLanguage: string;
  courseName: string;
  sourceType: "textbook" | "notes" | "auto";
  level: string | null;
  /** Existing lesson being extended with more pages. */
  appendTo: { title: string; knownTerms: string[]; grammarTitles: string[] } | null;
  /** Other lessons in this course, so the AI can avoid re-teaching them. */
  otherLessonTitles: string[];
}

const TUTOR_SYSTEM = `You are the content engine of a study app for language students. Students photograph pages from the textbook they use in class, or pages of their own handwritten class notes. You turn those pages into accurate study material: vocabulary flashcards, grammar explanations and practice exercises.

Accuracy matters more than volume:
- Only extract vocabulary and grammar that actually appears on the pages. Do not pad with unrelated words.
- Preserve spelling, accents, diacritics, articles, and script exactly as the language requires. When handwriting contains an obvious student spelling mistake, record the correct form and mention the fix in the vocabulary note.
- Skip page furniture: page numbers, headers, copyright lines, instructions like "listen and repeat".
- If something is illegible, leave it out rather than guessing, and mention it in detected.warning.
- Textbook exercises printed on the page are good source material; turn them into self-checking exercises with known answers.

Writing exercises:
- Mix kinds: fill_blank for grammar forms, multiple_choice for meaning and usage, translate_to_target and translate_to_native for whole short sentences.
- Every exercise must have one unambiguous correct answer; list legitimate alternatives in acceptableAnswers.
- Use only vocabulary and structures from this lesson or clearly simpler ones, so the student can actually succeed.
- Aim for roughly 2 exercises per grammar point plus about 1 per 3 vocabulary items, at least 6 and at most 30 total.

All explanations, translations, hints and feedback are written in the student's native language.`;

function contextText(ctx: ScanContext, pageCount: number): string {
  const lines = [
    `Course: ${ctx.courseName}`,
    `Target language (being learned): ${ctx.targetLanguage}`,
    `Student's native language (for translations and explanations): ${ctx.nativeLanguage}`,
  ];
  if (ctx.level) lines.push(`Student level: ${ctx.level}`);
  lines.push(
    ctx.sourceType === "textbook"
      ? `The ${pageCount} image(s) above are pages from the class textbook.`
      : ctx.sourceType === "notes"
        ? `The ${pageCount} image(s) above are the student's handwritten class notes. Read the handwriting carefully; notes may be abbreviated, use arrows, or mix languages.`
        : `The ${pageCount} image(s) above are textbook pages and/or handwritten class notes.`,
  );
  if (ctx.appendTo) {
    lines.push(
      `These pages continue the existing lesson "${ctx.appendTo.title}". Do NOT repeat vocabulary already in it: ${ctx.appendTo.knownTerms.join(", ") || "(none)"}. Existing grammar points: ${ctx.appendTo.grammarTitles.join("; ") || "(none)"} - only add a grammar point if it is new or adds substantially. Keep lessonTitle as "${ctx.appendTo.title}".`,
    );
  }
  if (ctx.otherLessonTitles.length) {
    lines.push(`Other lessons the student already has in this course: ${ctx.otherLessonTitles.join("; ")}.`);
  }
  lines.push("Extract the study material from these pages.");
  return lines.join("\n");
}

async function runStructured<T extends z.ZodType>(
  schema: T,
  params: {
    system: string;
    content: Anthropic.Beta.BetaContentBlockParam[];
    effort: Effort;
    maxTokens: number;
  },
): Promise<z.infer<T>> {
  try {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: params.maxTokens,
      // If a safety classifier declines, the API retries on a suitable fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: params.system,
      output_config: { effort: params.effort, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content: params.content }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new AIError("The AI couldn't process these pages. Try a clearer photo of just the lesson content.", 422);
    }
    if (message.stop_reason === "max_tokens") {
      throw new AIError("These pages had too much content to process at once. Try scanning fewer pages at a time.", 422);
    }
    if (message.parsed_output == null) {
      throw new AIError("The AI response could not be read. Please try again.");
    }
    return message.parsed_output as z.infer<T>;
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AIError("The server's Anthropic API key is missing or invalid.", 500);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AIError("The AI is busy right now. Wait a minute and try again.", 429);
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new AIError(`The AI rejected the request: ${err.message}`, 400);
    }
    if (err instanceof Anthropic.APIError) {
      throw new AIError(`AI service error (${err.status ?? "network"}). Please try again.`);
    }
    throw err;
  }
}

export async function scanPages(images: PageImage[], ctx: ScanContext): Promise<ScanResult> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `Page ${i + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  });
  content.push({ type: "text", text: contextText(ctx, images.length) });

  return runStructured(ScanResult, {
    system: TUTOR_SYSTEM,
    content,
    effort: SCAN_EFFORT,
    maxTokens: 64000,
  });
}

export interface PracticeContext {
  targetLanguage: string;
  nativeLanguage: string;
  lessonTitle: string;
  vocabulary: { term: string; translation: string }[];
  grammar: { title: string; explanation: string }[];
  weakSpots: string[];
  existingPrompts: string[];
  count: number;
}

export async function generatePractice(ctx: PracticeContext): Promise<PracticeResult> {
  const text = [
    `Target language: ${ctx.targetLanguage}. Native language: ${ctx.nativeLanguage}.`,
    `Lesson: ${ctx.lessonTitle}`,
    `Vocabulary:\n${ctx.vocabulary.map((v) => `- ${v.term} = ${v.translation}`).join("\n") || "(none)"}`,
    `Grammar points:\n${ctx.grammar.map((g) => `- ${g.title}: ${g.explanation}`).join("\n") || "(none)"}`,
    ctx.weakSpots.length
      ? `The student keeps getting these wrong; weight new exercises toward them:\n${ctx.weakSpots.map((w) => `- ${w}`).join("\n")}`
      : "",
    ctx.existingPrompts.length
      ? `Do not repeat these existing prompts:\n${ctx.existingPrompts.map((p) => `- ${p}`).join("\n")}`
      : "",
    `Write ${ctx.count} fresh exercises for this lesson. grammarTitle must exactly match one of the grammar point titles above, or be null.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return runStructured(PracticeResult, {
    system: TUTOR_SYSTEM,
    content: [{ type: "text", text }],
    effort: "low",
    maxTokens: 32000,
  });
}

export interface GradeContext {
  targetLanguage: string;
  nativeLanguage: string;
  prompt: string;
  expected: string[];
  given: string;
}

export async function gradeAnswer(ctx: GradeContext): Promise<GradeResult> {
  const text = `A ${ctx.targetLanguage} student (native language: ${ctx.nativeLanguage}) answered a practice question.

Question: ${ctx.prompt}
Reference answer(s): ${ctx.expected.join(" | ")}
Student's answer: ${ctx.given}

Grade it. "correct" means it is a fully correct answer to the question even if worded differently from the reference. "almost" means the meaning is right but there is a small slip (accent, one letter, article, agreement). "incorrect" otherwise. Feedback should be encouraging, specific and brief, in ${ctx.nativeLanguage}. Give correctedAnswer as the student's answer with the fixes applied, or null if it was correct.`;

  return runStructured(GradeResult, {
    system: "You grade short answers for a language-learning app. Be fair: accept any genuinely correct answer.",
    content: [{ type: "text", text }],
    effort: "low",
    maxTokens: 4000,
  });
}
