import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "../store/useAuthStore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-2xl p-8 w-full max-w-md shadow-glow-lg"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-dashed border-cyan-400/40 flex items-center justify-center"
        >
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-cyan-400 shadow-glow" />
        </motion.div>
        <h1 className="text-3xl font-bold gradient-text text-center">AetherOS</h1>
        <p className="text-center text-slate-500 text-sm mt-2 mb-8">
          Autonomous Multi-Agent Intelligence Platform
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary text-white font-semibold py-3 rounded-lg"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          No account?{" "}
          <Link to="/register" className="text-indigo-400 hover:text-indigo-300">
            Create one
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
