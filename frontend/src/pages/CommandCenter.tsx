import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  actionsApi,
  chatApi,
  documentsApi,
  tasksApi,
  type ChatMessage,
  type ChatSession,
  type DocumentOut,
  type Intent,
} from "../lib/api";
import { socket } from "../lib/socket";
import { VoiceOverlay } from "../components/VoiceOverlay";
import { MediaPanel } from "../components/MediaPanel";
import { WorkforcePanel, type WorkStep } from "../components/WorkforcePanel";
import { findContact } from "../lib/contacts";
import { LANG_NAMES, LOCALES, SpeechStream, say, voiceFor, type Lang } from "../lib/speech";

/** Browser-native speech. No dependency, no API key. Undefined on Firefox.
 *  Looked up per call, not at import: Chrome can define it after our module
 *  evaluates, and a stale undefined would disable voice for the whole session. */
const recognizer = () =>
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

/**
 * How long a pause must last before she decides you've finished talking.
 * The whole point of this screen: she waits, she does not interrupt. Long
 * enough to think mid-sentence, short enough not to feel broken.
 */
const SILENCE_MS = 1100;

/** "AetherOS, open youtube" — strip the name so it isn't part of the command. */
const WAKE = /^\s*(aether(\s*os)?|एथर(ओएस)?|এথার(ওএস)?)\s*[,.]?\s*/i;

const GREETING: Record<Lang, string> = {
  en: "I'm listening.",
  hi: "मैं सुन रही हूँ।",
  bn: "আমি শুনছি।",
};

const DELIVERED: Record<Lang, string> = {
  en: "All done. The result is in the conversation.",
  hi: "हो गया। नतीजा बातचीत में है।",
  bn: "হয়ে গেছে। ফলাফল কথোপকথনে আছে।",
};

const NO_NUMBER: Record<Lang, (who: string) => string> = {
  en: (w) => `I don't have a number for ${w}. Add it in Settings and ask me again.`,
  hi: (w) => `${w} का नंबर मेरे पास नहीं है। सेटिंग्स में जोड़ दीजिए, फिर कहिए।`,
  bn: (w) => `${w}-এর নম্বর আমার কাছে নেই। সেটিংসে যোগ করে আবার বলুন।`,
};

export default function CommandCenter() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  // Documents attached to the next turn. Cleared once sent — an attachment is
  // scoped to the question you asked it about, not to the whole session.
  const [attached, setAttached] = useState<DocumentOut[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // --- voice conversation ---
  // voiceMode stays on across turns: she listens, answers aloud, then listens
  // again, until you close the overlay.
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [settling, setSettling] = useState(false); // in the pause before she acts
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("aether_lang") as Lang) || "en",
  );
  const voiceModeRef = useRef(false);
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;
  const speechRef = useRef<SpeechStream | null>(null);

  // --- desktop control ---
  const [acting, setActing] = useState("");
  const [pending, setPending] = useState<Intent | null>(null);
  const [media, setMedia] = useState<{ embed: string; title: string } | null>(null);
  const pendingRef = useRef<Intent | null>(null);
  pendingRef.current = pending;

  // --- delegated work ---
  const [work, setWork] = useState<{
    taskId: number;
    objective: string;
    steps: WorkStep[];
    progress: number;
    done: boolean;
  } | null>(null);
  const workIdRef = useRef<number | null>(null);

  const loadSessions = async () => {
    const { data } = await chatApi.sessions();
    setSessions(data);
    return data;
  };

  // Ref guard: StrictMode runs mount effects twice in dev, which would
  // otherwise create two empty sessions.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    loadSessions()
      .then((data) => (data.length ? setActiveId(data[0].id) : newSession()))
      .catch(() => setError("Sign in to use the Command Center."));
  }, []);

  useEffect(() => {
    if (activeId == null) return;
    chatApi.messages(activeId).then(({ data }) => setMessages(data));
  }, [activeId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    localStorage.setItem("aether_lang", lang);
  }, [lang]);

  /**
   * Live feed from the agent workforce. The bus broadcasts every task's events
   * to everyone, so filter to the one we started — otherwise a task running in
   * another tab would narrate itself into this conversation.
   */
  useEffect(() => {
    const onEvent = (e: any) => {
      if (workIdRef.current == null || e?.task_id !== workIdRef.current) return;

      setWork((w) => {
        if (!w) return w;
        const step = e.agent && e.message ? [{ agent: e.agent, message: e.message }] : [];
        return {
          ...w,
          steps: [...w.steps, ...step],
          progress: typeof e.progress === "number" ? e.progress : w.progress,
        };
      });

      if (e.type === "task_completed") {
        workIdRef.current = null;
        setWork((w) => (w ? { ...w, progress: 100, done: true } : w));
        // The deliverable belongs in the transcript, not in a panel that scrolls away.
        setMessages((m) => [
          ...m,
          { id: -Date.now(), role: "assistant", content: e.output || "Done." },
        ]);
        reply(DELIVERED[langRef.current], voiceModeRef.current);
      }
    };

    socket.on("agent_event", onEvent);
    return () => {
      socket.off("agent_event", onEvent);
    };
  }, []);

  // The whole app brightens while she has the mic open — see index.css.
  useEffect(() => {
    document.body.classList.toggle("listening", voiceMode);
    return () => document.body.classList.remove("listening");
  }, [voiceMode]);

  const newSession = async () => {
    const { data } = await chatApi.createSession();
    setSessions((s) => [data, ...s]);
    setActiveId(data.id);
    setMessages([]);
  };

  const removeSession = async (id: number) => {
    await chatApi.deleteSession(id);
    const rest = sessions.filter((s) => s.id !== id);
    setSessions(rest);
    if (activeId === id) setActiveId(rest[0]?.id ?? null);
  };

  // ---------------------------------------------------------------- commands

  /** Transcript-only turn: shown in the thread, never sent to the model. */
  const localTurn = (user: string, assistant: string) =>
    setMessages((m) => [
      ...m,
      { id: -Date.now(), role: "user", content: user },
      { id: -Date.now() - 1, role: "assistant", content: assistant },
    ]);

  /** Speak a line, then hand the turn back to the user in voice mode.
   *  The mode is the switch: mic open means she talks, mic closed means she
   *  writes. There is no separate toggle to get out of sync with. */
  const reply = (line: string, spoken: boolean) => {
    if (!line || !spoken) return;
    setSpeaking(true);
    speechRef.current = say(
      line,
      () => {
        setSpeaking(false);
        if (voiceModeRef.current) startListening();
      },
      langRef.current,
    );
  };

  const execute = async (cmd: Intent, spoken: boolean, said: string) => {
    // WhatsApp needs a number, and the book that has it lives in this browser.
    let phone = "";
    if (cmd.intent === "whatsapp") {
      const contact = findContact(cmd.who || "");
      if (!contact) {
        const line = NO_NUMBER[cmd.lang || "en"](cmd.who || "them");
        localTurn(said, line);
        reply(line, spoken);
        return;
      }
      phone = contact.phone;
    }

    setActing(cmd.speak || cmd.intent || "Working");
    localTurn(said, cmd.speak || "");
    reply(cmd.speak || "", spoken);

    try {
      const { data } = await actionsApi.run({
        intent: cmd.intent!,
        query: cmd.query || "",
        confirmed: true,
        lang: cmd.lang || "en",
        phone,
        message: cmd.message || "",
      });
      // Video plays inside the app; everything else has already happened.
      if (data.embed) setMedia({ embed: data.embed, title: cmd.query || "Now playing" });
      if (!data.ok && data.error) setError(data.error);
    } catch {
      setError("That action failed on this machine.");
    } finally {
      // Long enough to read the badge; the action itself already fired.
      setTimeout(() => setActing(""), 1600);
    }
  };

  /**
   * Desktop commands short-circuit the model: "open youtube", "shut down my
   * laptop", "I'm bored". Returns true when the sentence was a command.
   */
  const runCommand = async (text: string, spoken: boolean): Promise<boolean> => {
    // Clear here, not per-branch: every command path returns before send()
    // reaches its own reset, and a leftover box concatenates the next turn.
    setInput("");

    if (/^\s*(stop|शांत|থাম|chup|quiet)\s*$/i.test(text)) {
      speechRef.current?.cancel();
      setSpeaking(false);
      setMedia(null);
      return true;
    }

    const waiting = pendingRef.current;
    if (waiting) {
      setPending(null);
      if (/\b(yes|yeah|yep|sure|do it|confirm|go ahead|ok|okay|हाँ|हां|कर दो|জি|হ্যাঁ|করো)\b/i.test(text)) {
        await execute(waiting, spoken, text);
      } else {
        const line = { en: "Okay, cancelled.", hi: "ठीक है, रहने देती हूँ।", bn: "ঠিক আছে, বাদ দিলাম।" }[
          waiting.lang || "en"
        ];
        localTurn(text, line);
        reply(line, spoken);
      }
      return true;
    }

    let cmd: Intent;
    try {
      cmd = (await actionsApi.parse(text)).data;
    } catch {
      return false; // parser unreachable — let the model answer instead
    }
    if (!cmd.intent) return false;

    if (cmd.intent === "media_stop") {
      setMedia(null);
      localTurn(text, cmd.speak || "");
      reply(cmd.speak || "", spoken);
      return true;
    }
    if (cmd.intent === "time") {
      localTurn(text, cmd.speak || "");
      reply(cmd.speak || "", spoken);
      return true;
    }

    if (cmd.intent === "delegate") {
      // Real work: hand it to the agent workforce and narrate as they go,
      // instead of answering it in one breath.
      localTurn(text, cmd.speak || "");
      reply(cmd.speak || "", spoken);
      try {
        const { data } = await tasksApi.create({ objective: cmd.query || text });
        workIdRef.current = data.id;
        setWork({ taskId: data.id, objective: cmd.query || text, steps: [], progress: 0, done: false });
      } catch {
        setError("Couldn't reach the workforce. Is the backend running?");
      }
      return true;
    }

    if (cmd.tier === "confirm") {
      // Never power off — or message another human — on one spoken sentence.
      setPending(cmd);
      localTurn(text, cmd.speak || "");
      reply(cmd.speak || "", spoken);
      return true;
    }
    await execute(cmd, spoken, text);
    return true;
  };

  // ------------------------------------------------------------------- chat

  const send = async (raw: string, spoken = false) => {
    const text = raw.replace(WAKE, "").trim();
    if (!text || activeId == null || busy) return;
    if (await runCommand(text, spoken)) return;

    setBusy(true);
    setError("");
    setInput("");
    setMessages((m) => [...m, { id: -Date.now(), role: "user", content: text }]);

    // Speak while the answer streams: each finished sentence goes out
    // immediately, so there is no wait for the full reply.
    let voice: SpeechStream | null = null;
    if (spoken) {
      setSpeaking(true);
      voice = new SpeechStream(() => {
        setSpeaking(false);
        // Hand the turn back to the user once she stops talking.
        if (voiceModeRef.current) startListening();
      }, langRef.current);
      speechRef.current = voice;
    }

    let answer = "";
    try {
      await chatApi.stream(
        activeId,
        text,
        (delta) => {
          answer += delta;
          setStreaming(answer);
          voice?.push(answer);
        },
        spoken,
        attached.map((d) => d.id),
      );
      setAttached([]);
      voice?.push(answer, true); // flush the last partial sentence
    } catch {
      setError("The assistant is unreachable. Is the backend running?");
      voice?.cancel();
      setSpeaking(false);
      if (voiceModeRef.current) startListening();
    } finally {
      setStreaming("");
      setBusy(false);
      // Re-read from the server so message ids are real (needed to pin memories).
      await chatApi.messages(activeId).then(({ data }) => setMessages(data));
      loadSessions().catch(() => {});
    }
  };

  // -------------------------------------------------------- patient listening

  const recognition = useRef<any>(null);
  const finalText = useRef(""); // completed segments of the current turn
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilence = () => {
    if (silence.current) clearTimeout(silence.current);
    silence.current = null;
  };

  /**
   * She never cuts in. Every scrap of speech pushes the deadline back, and
   * only a real pause — SILENCE_MS of it — ends the turn. Talk for a minute
   * with three thinking pauses and it still arrives as one sentence.
   */
  const armDispatch = () => {
    clearSilence();
    setSettling(true);
    silence.current = setTimeout(() => {
      setSettling(false);
      const text = finalText.current.trim();
      finalText.current = "";
      if (!text) return;
      recognition.current?.stop(); // don't hear herself answer
      send(text, voiceModeRef.current);
    }, SILENCE_MS);
  };

  const startListening = () => {
    const Recognition = recognizer();
    if (!Recognition) {
      setError("This browser has no speech recognition. Try Chrome or Edge.");
      exitVoiceMode();
      return;
    }
    recognition.current?.abort();
    finalText.current = "";
    const rec = new Recognition();
    recognition.current = rec;
    rec.lang = LOCALES[langRef.current];
    rec.interimResults = true;
    rec.continuous = true; // required: without it Chrome ends the turn for us

    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = e.results[i];
        if (seg.isFinal) finalText.current += seg[0].transcript;
        else interim += seg[0].transcript;
      }
      setInput((finalText.current + interim).trim());
      armDispatch();
    };

    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed") {
        setError("Microphone blocked. Allow it in the address bar.");
        exitVoiceMode();
      }
      // "no-speech" / "aborted" just mean silence — keep the conversation open.
      else if (voiceModeRef.current && !silence.current) {
        setTimeout(() => voiceModeRef.current && !speaking && startListening(), 400);
      }
    };

    // Chrome ends continuous recognition on its own after a while. If she is
    // still supposed to be listening and nothing is queued, start again.
    rec.onend = () => {
      if (voiceModeRef.current && !silence.current && !speaking && !busy) {
        setTimeout(() => voiceModeRef.current && startListening(), 250);
      }
    };

    try {
      rec.start();
    } catch {
      /* already started — the existing session keeps running */
    }
  };

  const enterVoiceMode = () => {
    voiceFor(lang); // warm the voice list before the first utterance
    setVoiceMode(true);
    voiceModeRef.current = true;
    reply(GREETING[lang], true); // greeting ends -> startListening()
  };

  const exitVoiceMode = () => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setSpeaking(false);
    setSettling(false);
    setActing("");
    setPending(null); // a pending shutdown must not survive the overlay closing
    clearSilence();
    finalText.current = "";
    recognition.current?.abort();
    speechRef.current?.cancel();
    setInput("");
  };

  // Never leave her talking, or listening, after you navigate away.
  useEffect(() => () => exitVoiceMode(), []);

  const state = acting ? "acting" : speaking ? "speaking" : busy ? "thinking" : "listening";

  return (
    <div className="grid lg:grid-cols-4 gap-4 h-[calc(100vh-2rem)]">
      <AnimatePresence>
        {voiceMode && (
          <VoiceOverlay
            transcript={input}
            reply={streaming}
            state={state}
            action={acting}
            settling={settling}
            lang={lang}
            onCancel={exitVoiceMode}
          />
        )}
      </AnimatePresence>

      <aside className="glass rounded-xl p-4 flex flex-col overflow-hidden">
        <button
          onClick={newSession}
          className="sheen w-full px-3 py-2 rounded-lg btn-primary text-sm font-semibold mb-3"
        >
          + New session
        </button>
        <ul className="space-y-1 overflow-auto flex-1">
          {sessions.map((s) => (
            <li key={s.id} className="group flex items-center gap-1">
              <button
                onClick={() => setActiveId(s.id)}
                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm truncate hover:bg-white/5 ${
                  s.id === activeId ? "bg-indigo-500/10 text-indigo-300" : "text-slate-300"
                }`}
              >
                {s.title}
                <span className="block text-xs text-slate-500">{s.message_count} messages</span>
              </button>
              <button
                onClick={() => removeSession(s.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 px-2"
                title="Delete session"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* live-edge only while she's engaged — a permanent one is decoration,
          a conditional one tells you the system is awake. */}
      <section
        className={`lg:col-span-3 glass rounded-xl flex flex-col overflow-hidden ${
          voiceMode || busy || work?.done === false ? "live-edge" : ""
        }`}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
          <h2 className="font-semibold gradient-text">AetherOS</h2>
          <div className="flex items-center gap-4">
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
              {(Object.keys(LANG_NAMES) as Lang[]).map((code) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={`px-2.5 py-1 transition-colors ${
                    lang === code
                      ? "bg-indigo-600/40 text-indigo-200"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {LANG_NAMES[code]}
                </button>
              ))}
            </div>
            {/* Replaces the old "Speak replies" checkbox: the mode already
                says whether she talks, so state it rather than ask again. */}
            <motion.span
              key={voiceMode ? "voice" : "text"}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-xs flex items-center gap-2 ${
                voiceMode ? "text-cyan-300" : "text-slate-500"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${voiceMode ? "bg-cyan-400 breathe" : "bg-slate-600"}`} />
              {voiceMode ? "Replying aloud" : "Replying in text"}
            </motion.span>
          </div>
        </header>

        {/* Outside the scroll area on purpose: what's playing stays on screen
            while the conversation keeps moving underneath it, and the width is
            capped so a 16:9 player can't swallow the chat. */}
        <AnimatePresence>
          {media && (
            <div className="px-5 pt-4 max-w-2xl w-full mx-auto">
              <MediaPanel
                embed={media.embed}
                title={media.title}
                onClose={() => setMedia(null)}
              />
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {work && (
            <div className="px-5 pt-4">
              <WorkforcePanel
                objective={work.objective}
                steps={work.steps}
                progress={work.progress}
                done={work.done}
              />
            </div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {messages.length === 0 && !streaming && !media && (
            <p className="text-sm text-slate-500">
              Say “AetherOS, open YouTube”, “कोई गाना बजाओ”, or just talk — I wait until
              you're finished before I answer.
            </p>
          )}
          {messages.map((m, i) => (
            <motion.div
              key={m.id}
              // Each bubble arrives from its own side, with a spring rather than
              // a fade — it reads as placed rather than drawn.
              initial={{ opacity: 0, y: 10, scale: 0.97, x: m.role === "user" ? 18 : -18 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className={m.role === "user" ? "text-right" : ""}
            >
              <div
                className={`inline-block max-w-[85%] text-left rounded-xl px-4 py-3 text-sm transition-shadow duration-700 ${
                  m.role === "user" ? "bg-indigo-600/25 border border-indigo-500/30" : "bg-white/5"
                } ${i === messages.length - 1 ? "shadow-glow" : ""}`}
              >
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
                {m.role === "assistant" && m.id > 0 && (
                  <button
                    onClick={() => chatApi.remember(m.id)}
                    className="mt-2 text-xs text-slate-500 hover:text-indigo-300"
                  >
                    Pin to memory
                  </button>
                )}
              </div>
            </motion.div>
          ))}

          {streaming && (
            <div className="inline-block max-w-[85%] rounded-xl px-4 py-3 text-sm bg-white/5">
              <div className="prose prose-invert prose-sm max-w-none streaming-caret">
                <ReactMarkdown>{streaming}</ReactMarkdown>
              </div>
            </div>
          )}
          {busy && !streaming && (
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-2 h-2 rounded-full bg-indigo-400"
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
              <span className="text-xs text-indigo-300/70 ml-2">Thinking</span>
            </div>
          )}
          <div ref={bottom} />
        </div>

        {error && <p className="px-5 pb-2 text-xs text-red-400">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="p-4 border-t border-slate-700/50"
        >
          {attached.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attached.map((d) => (
                <span
                  key={d.id}
                  className="flex items-center gap-1.5 text-xs rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1 text-indigo-200"
                >
                  <span className="truncate max-w-[180px]">{d.filename}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${d.filename}`}
                    onClick={() => setAttached((a) => a.filter((x) => x.id !== d.id))}
                    className="text-indigo-300/70 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            title="Attach a document"
            disabled={uploading}
            className="px-3 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-sm disabled:opacity-50"
          >
            {uploading ? "…" : "📎"}
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // let the same file be picked again
              if (!file) return;
              setUploading(true);
              try {
                const { data } = await documentsApi.upload(file);
                setAttached((a) => [...a, data].slice(-3)); // backend reads 3
              } catch {
                setError("Upload failed.");
              } finally {
                setUploading(false);
              }
            }}
          />
          <button
            type="button"
            onClick={voiceMode ? exitVoiceMode : enterVoiceMode}
            title="Talk to AetherOS"
            className={`px-3 rounded-lg border text-sm transition-colors ${
              voiceMode
                ? "border-cyan-400 text-cyan-300 agent-pulse"
                : "border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            🎙
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell AetherOS what you need…"
            className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="sheen px-5 rounded-lg btn-primary text-sm font-semibold"
          >
            Send
          </button>
          </div>
        </form>
      </section>
    </div>
  );
}
