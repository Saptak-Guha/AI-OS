import { create } from "zustand";

export type AgentEvent = {
  type: string;
  task_id?: number;
  agent?: string;
  event_type?: string;
  message?: string;
  reasoning?: string;
  tool_used?: string;
  progress?: number;
  timestamp?: string;
  ts: number;
};

export type Task = {
  id: number;
  title: string;
  objective: string;
  task_type: string;
  status: string;
  progress: number;
  plan: Array<{ agent: string; label: string }>;
  output?: string;
  requires_approval: boolean;
  approval_status?: string;
  created_at?: string;
};

type AppState = {
  activeTaskId: number | null;
  tasks: Task[];
  agentEvents: AgentEvent[];
  setActiveTask: (id: number | null) => void;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: number, updates: Partial<Task>) => void;
  addAgentEvent: (e: AgentEvent) => void;
  clearAgentEvents: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  activeTaskId: null,
  tasks: [],
  agentEvents: [],

  setActiveTask: (id) => set({ activeTaskId: id }),
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  addAgentEvent: (e) =>
    set((s) => ({ agentEvents: [e, ...s.agentEvents].slice(0, 200) })),
  clearAgentEvents: () => set({ agentEvents: [] }),
}));
