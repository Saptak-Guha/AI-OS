import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aether_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

export const authApi = {
  register: (data: { email: string; full_name: string; password: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) => api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
};

export const tasksApi = {
  create: (data: { objective: string; title?: string; requires_approval?: boolean }) =>
    api.post("/tasks", data),
  list: () => api.get("/tasks"),
  get: (id: number) => api.get(`/tasks/${id}`),
  logs: (id: number) => api.get(`/tasks/${id}/logs`),
  approve: (id: number, approved: boolean) => api.post(`/tasks/${id}/approve`, { approved }),
};

export type ChatSession = { id: number; title: string; message_count: number; updated_at: string };
export type ChatMessage = { id: number; role: "user" | "assistant"; content: string };

export const chatApi = {
  sessions: () => api.get<ChatSession[]>("/chat/sessions"),
  createSession: () => api.post<ChatSession>("/chat/sessions"),
  deleteSession: (id: number) => api.delete(`/chat/sessions/${id}`),
  messages: (id: number) => api.get<ChatMessage[]>(`/chat/sessions/${id}/messages`),
  remember: (messageId: number) => api.post(`/chat/messages/${messageId}/remember`),

  /** SSE stream; calls onDelta per chunk. Axios can't read streams, so fetch. */
  stream: async (
    sessionId: number,
    message: string,
    onDelta: (t: string) => void,
    voice = false,
    documentIds: number[] = [],
  ) => {
    const res = await fetch(`${api.defaults.baseURL}/chat/sessions/${sessionId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("aether_token") || ""}`,
      },
      body: JSON.stringify({ message, voice, document_ids: documentIds }),
    });
    if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const payload = JSON.parse(frame.slice(6));
        if (payload.delta) onDelta(payload.delta);
      }
    }
  },
};

export const agentsApi = {
  list: () => api.get("/agents"),
};

export const memoryApi = {
  list: () => api.get("/memory"),
  create: (data: { content: string; tags?: string[] }) => api.post("/memory", data),
  search: (q: string) => api.get(`/memory/search?q=${encodeURIComponent(q)}`),
  remove: (id: number) => api.delete(`/memory/${id}`),
};

export type DocumentOut = {
  id: number;
  filename: string;
  file_type?: string | null;
  file_size?: number | null;
  summary?: string | null;
  insights: string[];
  status: string;
};

export const documentsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/documents/upload", form);
  },
  list: () => api.get<DocumentOut[]>("/documents"),
  query: (id: number, question: string) => api.post(`/documents/${id}/query`, { question }),
};

export const knowledgeApi = {
  graph: () => api.get("/knowledge/graph"),
  search: (q: string) => api.get(`/knowledge/search?q=${encodeURIComponent(q)}`),
};

export const analyticsApi = {
  dashboard: () => api.get("/analytics/dashboard"),
  agents: () => api.get("/analytics/agents"),
};

/** `intent: null` means the sentence was conversation, not a command. */
export type Intent = {
  intent: string | null;
  tier?: "safe" | "confirm";
  query?: string;
  speak?: string;
  lang?: "en" | "hi" | "bn";
  /** whatsapp only */
  who?: string;
  message?: string;
};

export type ActionResult = {
  ok: boolean;
  error?: string;
  /** Set when the result plays inside the app instead of opening a tab. */
  embed?: string;
  note?: string;
};

export const actionsApi = {
  parse: (text: string) => api.post<Intent>("/actions/parse", { text }),
  run: (body: {
    intent: string;
    query?: string;
    confirmed?: boolean;
    lang?: string;
    phone?: string;
    message?: string;
  }) => api.post<ActionResult>("/actions/run", body),
};

export type LlmHealth = {
  provider: "anthropic" | "ollama" | "template";
  model: string | null;
  ok: boolean;
  degraded_from?: string;
  reason?: string;
};

/** Health lives outside /api/v1, so strip the prefix off the configured base. */
export const healthApi = {
  get: () =>
    api.get<{ llm: LlmHealth }>(
      `${(api.defaults.baseURL || "").replace(/\/api\/v1\/?$/, "")}/health`,
    ),
};

export const workflowsApi = {
  preview: (objective: string) => api.post("/workflows/preview", { objective }),
};
