const LANG_CODES: Record<string, string> = {
  spanish: "es-ES", español: "es-ES", french: "fr-FR", français: "fr-FR", german: "de-DE", deutsch: "de-DE",
  italian: "it-IT", portuguese: "pt-PT", "brazilian portuguese": "pt-BR", japanese: "ja-JP", chinese: "zh-CN",
  mandarin: "zh-CN", cantonese: "zh-HK", korean: "ko-KR", russian: "ru-RU", serbian: "sr-RS", croatian: "hr-HR",
  bosnian: "bs-BA", slovenian: "sl-SI", macedonian: "mk-MK", bulgarian: "bg-BG", ukrainian: "uk-UA", polish: "pl-PL",
  czech: "cs-CZ", slovak: "sk-SK", arabic: "ar-SA", hebrew: "he-IL", hindi: "hi-IN", turkish: "tr-TR", greek: "el-GR",
  dutch: "nl-NL", swedish: "sv-SE", norwegian: "nb-NO", danish: "da-DK", finnish: "fi-FI", hungarian: "hu-HU",
  romanian: "ro-RO", vietnamese: "vi-VN", thai: "th-TH", indonesian: "id-ID", english: "en-US", latin: "it-IT",
};

export function langCode(language: string): string | null {
  return LANG_CODES[language.trim().toLowerCase()] ?? null;
}

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text: string, language: string): void {
  if (!canSpeak) return;
  const code = langCode(language);
  const u = new SpeechSynthesisUtterance(text);
  if (code) {
    u.lang = code;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith(code.slice(0, 2)));
    if (voice) u.voice = voice;
  }
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
