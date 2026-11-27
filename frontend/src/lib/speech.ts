/** Browser speech synthesis: per-language female voice + sentence-queued speaking. */

export type Lang = "en" | "hi" | "bn";

/** Recognition/synthesis locales. Indian English is the default — it handles
 *  Indian names and place names far better than en-US. */
export const LOCALES: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
};

export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  hi: "हिन्दी",
  bn: "বাংলা",
};

/** Best-sounding first — the list order is the preference order, not the
 *  browser's. Google's network voices are warmer than the local SAPI ones. */
const FEMALE_HINTS: Record<Lang, string[]> = {
  en: [
    "google uk english female", "google us english", "samantha", "aria", "jenny",
    "libby", "sonia", "natasha", "heera", "zira", "victoria", "karen", "moira",
    "tessa", "fiona", "serena", "female", "woman",
  ],
  hi: ["google हिन्दी", "google hindi", "swara", "kalpana", "hemant", "madhur", "female"],
  bn: ["google বাংলা", "google bangla", "google bengali", "tanishaa", "bashkar", "female"],
};

const PREF_KEY = "aether_voice";

/** Overrides the automatic pick for English; set from Settings. */
export function setPreferredVoice(name: string) {
  localStorage.setItem(PREF_KEY, name);
  cache.clear();
}

export function preferredVoiceName(): string {
  return localStorage.getItem(PREF_KEY) || "";
}

const cache = new Map<Lang, SpeechSynthesisVoice | null>();

export function voiceFor(lang: Lang = "en"): SpeechSynthesisVoice | null {
  const hit = cache.get(lang);
  if (hit) return hit;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null; // list loads async; caller retries next turn

  const chosen = voices.find((v) => v.name === preferredVoiceName());
  if (chosen && lang === "en") {
    cache.set(lang, chosen);
    return chosen;
  }

  // Prefer a voice that actually speaks the language; only then fall back.
  const prefix = LOCALES[lang].slice(0, 2);
  const native = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const pool = native.length ? native : voices;
  for (const hint of FEMALE_HINTS[lang]) {
    const match = pool.find((v) => v.name.toLowerCase().includes(hint.toLowerCase()));
    if (match) {
      cache.set(lang, match);
      return match;
    }
  }
  const fallback = pool[0] ?? null;
  cache.set(lang, fallback);
  return fallback;
}

/** True when the browser actually has a voice for this language installed. */
export function hasVoiceFor(lang: Lang): boolean {
  const prefix = LOCALES[lang].slice(0, 2);
  return (window.speechSynthesis?.getVoices() ?? []).some((v) =>
    v.lang.toLowerCase().startsWith(prefix),
  );
}

/** Script detection — matches the backend's rule so both agree on a reply. */
export function detectLang(text: string): Lang {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (/[ঀ-৿]/.test(text)) return "bn";
  return "en";
}

// Voice list is populated asynchronously in Chrome.
window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
  cache.clear();
  voiceFor("en");
});

/**
 * Speaks text as it streams in. Feed it partial text repeatedly; it only
 * speaks newly-completed sentences, so she starts talking before the model
 * has finished writing.
 */
export class SpeechStream {
  private spoken = 0;
  private onDone?: () => void;
  private pending = 0;
  private lang: Lang;

  constructor(onDone?: () => void, lang: Lang = "en") {
    this.onDone = onDone;
    this.lang = lang;
  }

  /** `full` is the whole reply so far. */
  push(full: string, flush = false) {
    const tail = full.slice(this.spoken);
    // Speak up to the last sentence boundary; on flush, speak whatever is left.
    const cut = flush ? tail.length : lastBoundary(tail);
    if (cut <= 0) return;
    const chunk = tail.slice(0, cut);
    this.spoken += cut;
    const clean = speakable(chunk);
    if (clean) this.say(clean);
    else if (flush) this.maybeDone();
  }

  private say(text: string) {
    const u = new SpeechSynthesisUtterance(text);
    // Follow the script of this chunk, not the session — she can answer a
    // Hindi question in Hindi mid-conversation without switching modes.
    const lang = detectLang(text) === "en" ? this.lang : detectLang(text);
    const v = voiceFor(lang);
    if (v) u.voice = v;
    u.lang = v?.lang || LOCALES[lang];
    u.rate = 1.02;
    u.pitch = 1.12; // slightly brighter — reads as warmer
    this.pending++;
    u.onend = u.onerror = () => {
      this.pending--;
      this.maybeDone();
    };
    window.speechSynthesis.speak(u);
  }

  private maybeDone() {
    if (this.pending === 0) this.onDone?.();
  }

  cancel() {
    this.pending = 0;
    window.speechSynthesis.cancel();
  }
}

/** One-shot line ("Opening YouTube."). Returns the stream so it can be cancelled. */
export function say(text: string, onDone?: () => void, lang: Lang = "en"): SpeechStream {
  const s = new SpeechStream(onDone, lang);
  s.push(text, true);
  return s;
}

/** Sentence end for all three scripts — Devanagari/Bengali use danda (।). */
function lastBoundary(s: string): number {
  const m = s.match(/^[\s\S]*[.!?…।॥](\s|$)/);
  return m ? m[0].length : 0;
}

/** Markdown reads terribly out loud — strip it to spoken words. */
function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " code block. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/[*_>#|]/g, "")
    .replace(/^\s*[-–]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
