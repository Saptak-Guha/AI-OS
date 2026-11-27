import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../store/useAuthStore";
import {
  LANG_NAMES,
  hasVoiceFor,
  preferredVoiceName,
  setPreferredVoice,
  voiceFor,
  type Lang,
} from "../lib/speech";
import { contacts, saveContacts, type Contact } from "../lib/contacts";
import { healthApi, type LlmHealth } from "../lib/api";

export default function Settings() {
  const { user, logout } = useAuthStore();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState(preferredVoiceName());
  const [book, setBook] = useState<Contact[]>(contacts);
  const [draft, setDraft] = useState<Contact>({ name: "", phone: "" });
  const [installed, setInstalled] = useState<Record<Lang, boolean>>({
    en: true,
    hi: false,
    bn: false,
  });
  const [llm, setLlm] = useState<LlmHealth | null>(null);

  useEffect(() => {
    healthApi
      .get()
      .then(({ data }) => setLlm(data.llm))
      .catch(() => setLlm({ provider: "template", model: null, ok: false }));
  }, []);

  useEffect(() => {
    // Chrome fills the voice list asynchronously.
    const load = () => {
      setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")));
      setInstalled({ en: hasVoiceFor("en"), hi: hasVoiceFor("hi"), bn: hasVoiceFor("bn") });
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const preview = (name: string) => {
    setSelected(name);
    setPreferredVoice(name);
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Hello. I'm AetherOS. I'll be your assistant.");
    const v = voiceFor("en");
    if (v) u.voice = v;
    u.pitch = 1.12;
    window.speechSynthesis.speak(u);
  };

  const addContact = () => {
    const name = draft.name.trim();
    const phone = draft.phone.replace(/\D/g, "");
    if (!name || phone.length < 10) return;
    const next = [...book.filter((c) => c.name.toLowerCase() !== name.toLowerCase()), { name, phone }];
    setBook(next);
    saveContacts(next);
    setDraft({ name: "", phone: "" });
  };

  const removeContact = (name: string) => {
    const next = book.filter((c) => c.name !== name);
    setBook(next);
    saveContacts(next);
  };

  return (
    <div className="glass rounded-xl p-6 space-y-6 max-w-2xl">
      <h2 className="text-xl font-bold gradient-text">Settings</h2>

      <div className="space-y-1 text-sm">
        <p className="text-slate-500">Signed in as</p>
        <p className="text-slate-200">{user?.full_name}</p>
        <p className="text-slate-400">{user?.email}</p>
        <p className="text-xs font-mono text-indigo-400">role: {user?.role}</p>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-2">
        <p className="text-sm text-slate-300 font-semibold">Assistant voice</p>
        <p className="text-xs text-slate-500">Used in voice chat. Selecting one plays a sample.</p>
        <select
          value={selected || voiceFor("en")?.name || ""}
          onChange={(e) => preview(e.target.value)}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-2">
        <p className="text-sm text-slate-300 font-semibold">Languages</p>
        <p className="text-xs text-slate-500">
          Recognition works in all three regardless. Speaking back needs the voice installed in
          Windows (Settings → Time &amp; language → Speech).
        </p>
        <div className="flex gap-2 pt-1">
          {(Object.keys(LANG_NAMES) as Lang[]).map((code) => (
            <span
              key={code}
              className={`px-3 py-1.5 rounded-lg text-xs border ${
                installed[code]
                  ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                  : "border-slate-700 text-slate-500"
              }`}
            >
              {LANG_NAMES[code]} {installed[code] ? "· voice ready" : "· no voice installed"}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-3">
        <p className="text-sm text-slate-300 font-semibold">WhatsApp contacts</p>
        <p className="text-xs text-slate-500">
          So “message Rahul saying I'm late” knows who Rahul is. Stored only in this browser —
          numbers never reach the server. Include the country code (91 for India).
        </p>

        <div className="flex gap-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name"
            className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <input
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addContact()}
            placeholder="919876543210"
            className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={addContact}
            className="px-4 rounded-lg btn-primary text-sm font-semibold"
          >
            Add
          </button>
        </div>

        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {book.map((c) => (
              <motion.li
                key={c.name}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="group flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 text-sm"
              >
                <span className="text-slate-200">{c.name}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-500">+{c.phone}</span>
                  <button
                    onClick={() => removeContact(c.name)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {book.length === 0 && (
          <p className="text-xs text-slate-600">No contacts yet.</p>
        )}
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-2">
        <p className="text-sm text-slate-300 font-semibold">Agent brain</p>
        {llm ? (
          <div
            className={`rounded-lg px-3 py-2.5 text-xs border ${
              llm.provider === "anthropic"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            <p className="font-mono">
              {llm.provider}
              {llm.model ? ` · ${llm.model}` : ""}
            </p>
            {llm.degraded_from && (
              <p className="mt-1 text-amber-300/90">
                Fell back from {llm.degraded_from}: {llm.reason}. The local model is far
                slower — a multi-agent task can take many minutes per step. Fix the key in{" "}
                <code>backend/.env</code> and restart the backend.
              </p>
            )}
            {llm.provider === "template" && (
              <p className="mt-1">
                No LLM reachable — agents return structured template output.
              </p>
            )}
          </div>
        ) : (
          <div className="h-10 rounded-lg shimmer" />
        )}
        <p className="text-xs text-slate-500">API: {import.meta.env.VITE_API_URL}</p>
      </div>

      <button onClick={logout} className="text-sm text-red-400 hover:text-red-300">
        Sign out
      </button>
    </div>
  );
}
