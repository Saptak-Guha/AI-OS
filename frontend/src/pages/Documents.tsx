import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { documentsApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Reveal } from "../components/Reveal";

type Doc = {
  id: number;
  filename: string;
  file_type?: string | null;
  file_size?: number | null;
  summary?: string | null;
  insights: string[];
  status: string;
};

export default function Documents() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => documentsApi.list().then(({ data }) => setDocs(data)).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await documentsApi.upload(file);
      load();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !question.trim()) return;
    const { data } = await documentsApi.query(selected, question);
    setAnswer(data.answer);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Document Intelligence"
        subtitle="Upload a file — it gets summarised, indexed and made answerable"
        accent={[52, 211, 153]}
      />

      <div className="glass rounded-xl p-5">
        <input ref={fileRef} type="file" onChange={upload} disabled={busy} className="text-sm" />
        {busy && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-indigo-400 flex items-center gap-2">
              <motion.span
                className="w-2 h-2 rounded-full bg-indigo-400"
                animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              Extracting, summarising and indexing…
            </p>
            {[0, 1].map((n) => (
              <div key={n} className="h-3 rounded shimmer" style={{ width: `${80 - n * 25}%` }} />
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4 space-y-3">
          {docs.length === 0 && <p className="text-sm text-slate-500">No documents uploaded.</p>}
          {docs.map((d, i) => (
            <Reveal key={d.id} i={i}>
              <button
                onClick={() => setSelected(d.id)}
                className={`w-full text-left border-b border-slate-800 pb-2 last:border-0 rounded px-2 -mx-2 transition-colors hover:bg-white/5 ${
                  selected === d.id ? "text-indigo-300 bg-indigo-500/10" : "text-slate-300"
                }`}
              >
                <p className="text-sm font-medium truncate">{d.filename}</p>
                <p className="text-xs text-slate-500">
                  {d.file_type} · {d.status}
                </p>
                {d.summary && <p className="text-xs text-slate-400 mt-1 line-clamp-3">{d.summary}</p>}
              </button>
            </Reveal>
          ))}
        </div>

        <div className="glass rounded-xl p-4">
          <form onSubmit={ask} className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={selected ? "Ask about this document..." : "Select a document first"}
              disabled={!selected}
              className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
            <button className="px-4 py-2 rounded-lg btn-primary text-sm font-semibold">Ask</button>
          </form>
          {answer && (
            <motion.p
              key={answer}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-slate-300 mt-4 whitespace-pre-wrap"
            >
              {answer}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}
