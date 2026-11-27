from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_tasks: int
    completed_tasks: int
    active_tasks: int
    total_agents: int
    memory_nodes: int
    avg_completion_rate: float
    knowledge_nodes: int
    documents_processed: int


class AgentPerformance(BaseModel):
    agent_name: str
    tasks_completed: int
    avg_duration_ms: float
    tools_used: int
