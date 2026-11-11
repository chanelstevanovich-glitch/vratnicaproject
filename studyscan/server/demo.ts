import type { GradeResult, PracticeResult, ScanResult } from "./schema.js";

/**
 * Canned responses used when no Anthropic credentials are configured
 * (DEMO mode), so the whole app can be tried end to end offline.
 */
export function demoScan(): ScanResult {
  return {
    detected: {
      contentType: "textbook",
      language: "Spanish",
      legible: true,
      warning: "Demo mode: no API key is configured, so this is sample content rather than your page.",
    },
    lessonTitle: "Unidad 2 · En el mercado",
    unit: "2",
    summary:
      "Shopping for food at a market: names of common foods, asking how much something costs, and the present tense of regular -ar verbs.",
    vocabulary: [
      { term: "la manzana", translation: "apple", partOfSpeech: "noun", gender: "f", example: "Quiero dos manzanas.", exampleTranslation: "I want two apples.", note: null },
      { term: "el pan", translation: "bread", partOfSpeech: "noun", gender: "m", example: "Compro pan todos los días.", exampleTranslation: "I buy bread every day.", note: null },
      { term: "la leche", translation: "milk", partOfSpeech: "noun", gender: "f", example: null, exampleTranslation: null, note: null },
      { term: "el queso", translation: "cheese", partOfSpeech: "noun", gender: "m", example: "El queso es delicioso.", exampleTranslation: "The cheese is delicious.", note: null },
      { term: "comprar", translation: "to buy", partOfSpeech: "verb", gender: null, example: "¿Qué compras?", exampleTranslation: "What are you buying?", note: "Regular -ar verb" },
      { term: "pagar", translation: "to pay", partOfSpeech: "verb", gender: null, example: "Pago con tarjeta.", exampleTranslation: "I pay by card.", note: "Regular -ar verb (pagué in the preterite)" },
      { term: "¿Cuánto cuesta?", translation: "How much does it cost?", partOfSpeech: "phrase", gender: null, example: "¿Cuánto cuesta el queso?", exampleTranslation: "How much is the cheese?", note: "Plural: ¿Cuánto cuestan?" },
      { term: "barato", translation: "cheap", partOfSpeech: "adjective", gender: null, example: null, exampleTranslation: null, note: "barata / baratos / baratas" },
      { term: "caro", translation: "expensive", partOfSpeech: "adjective", gender: null, example: "Es muy caro.", exampleTranslation: "It's very expensive.", note: "cara / caros / caras" },
    ],
    grammar: [
      {
        title: "Present tense of regular -ar verbs",
        explanation:
          "Drop -ar and add the ending for the person:\n\n| yo | tú | él/ella/usted | nosotros | vosotros | ellos/ustedes |\n|---|---|---|---|---|---|\n| -o | -as | -a | -amos | -áis | -an |\n\nSubject pronouns are often left out because the ending already shows who is doing the action.",
        examples: [
          { target: "Yo compro fruta.", translation: "I buy fruit." },
          { target: "Nosotros pagamos en efectivo.", translation: "We pay in cash." },
        ],
      },
    ],
    exercises: [
      { kind: "fill_blank", grammarTitle: "Present tense of regular -ar verbs", prompt: "Yo ___ (comprar) pan.", answer: "compro", acceptableAnswers: [], options: [], hint: "yo → -o", explanation: "compr- + -o = compro" },
      { kind: "fill_blank", grammarTitle: "Present tense of regular -ar verbs", prompt: "Nosotros ___ (pagar) con tarjeta.", answer: "pagamos", acceptableAnswers: [], options: [], hint: "nosotros → -amos", explanation: "pag- + -amos = pagamos" },
      { kind: "multiple_choice", grammarTitle: null, prompt: "What does “caro” mean?", answer: "expensive", acceptableAnswers: [], options: ["cheap", "expensive", "bread", "to pay"], hint: null, explanation: null },
      { kind: "multiple_choice", grammarTitle: "Present tense of regular -ar verbs", prompt: "Ellos ___ queso.", answer: "compran", acceptableAnswers: [], options: ["compro", "compras", "compran", "compramos"], hint: null, explanation: "ellos → -an" },
      { kind: "translate_to_target", grammarTitle: null, prompt: "How much does the cheese cost?", answer: "¿Cuánto cuesta el queso?", acceptableAnswers: ["Cuánto cuesta el queso"], options: [], hint: "¿Cuánto…?", explanation: null },
      { kind: "translate_to_native", grammarTitle: null, prompt: "Quiero dos manzanas.", answer: "I want two apples.", acceptableAnswers: ["I'd like two apples."], options: [], hint: null, explanation: null },
    ],
  };
}

export function demoPractice(): PracticeResult {
  return {
    exercises: [
      { kind: "fill_blank", grammarTitle: "Present tense of regular -ar verbs", prompt: "Tú ___ (comprar) leche.", answer: "compras", acceptableAnswers: [], options: [], hint: "tú → -as", explanation: null },
      { kind: "multiple_choice", grammarTitle: null, prompt: "Which word means “cheap”?", answer: "barato", acceptableAnswers: [], options: ["caro", "barato", "pan", "leche"], hint: null, explanation: null },
      { kind: "translate_to_target", grammarTitle: "Present tense of regular -ar verbs", prompt: "She pays in cash.", answer: "Ella paga en efectivo.", acceptableAnswers: ["Paga en efectivo."], options: [], hint: null, explanation: null },
    ],
  };
}

export function demoGrade(given: string, expected: string[]): GradeResult {
  const ok = expected.some((e) => e.trim().toLowerCase() === given.trim().toLowerCase());
  return {
    verdict: ok ? "correct" : "incorrect",
    feedback: ok ? "Nice work!" : "Demo mode can only check exact matches - compare with the answer below.",
    correctedAnswer: ok ? null : expected[0] ?? null,
  };
}
