import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { contacts } from "../lib/contacts";

/** Opens WhatsApp with the chat and the message already typed.
 *
 *  The link is built here rather than through /actions/run: the backend's
 *  whatsapp intent calls webbrowser.open, which opens a tab on whichever
 *  machine runs the server — right only while that's this laptop. A wa.me
 *  deep link is the platform's own answer and works from any browser.
 *
 *  Like the voice path, it stops one keypress short of sending. Pressing Send
 *  is the user's to do; nothing leaves the machine on a mistyped name. */
export function WhatsAppPanel() {
  const book = contacts();
  const [phone, setPhone] = useState(book[0]?.phone ?? "");
  const [message, setMessage] = useState("");

  const digits = phone.replace(/\D/g, "");
  const ready = digits.length >= 10 && message.trim().length > 0;

  const send = () => {
    if (!ready) return;
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`,
      "_blank",
      "noopener",
    );
    setMessage("");
  };

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-400">Message on WhatsApp</h3>
        <Link to="/settings" className="text-xs text-indigo-400 hover:text-indigo-300">
          Contacts
        </Link>
      </div>

      {book.length === 0 ? (
        <p className="text-sm text-slate-500">
          No contacts yet —{" "}
          <Link to="/settings" className="text-indigo-400">
            add one in Settings
          </Link>
          .
        </p>
      ) : (
        <>
          <select
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            {book.map((c) => (
              <option key={c.phone} value={c.phone}>
                {c.name}
              </option>
            ))}
          </select>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line — the habit every
              // chat box has trained.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="Type a message…"
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm resize-none"
          />

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">Opens the chat — you press Send.</p>
            <motion.button
              whileHover={ready ? { scale: 1.03 } : undefined}
              whileTap={ready ? { scale: 0.97 } : undefined}
              onClick={send}
              disabled={!ready}
              className="btn-primary px-4 py-2 rounded-lg text-sm"
            >
              Open chat
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
}
