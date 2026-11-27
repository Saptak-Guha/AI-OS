"""AetherOS Orchestration Engine — Manager Agent controls the AI workforce."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime
from typing import Callable, Awaitable

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.definitions import AGENT_DEFINITIONS
from app.workflows.generator import GeneratedWorkflow, WorkflowNode, generate_workflow
from app.services.llm_service import generate as llm_generate
from app.tools.registry import execute_tool
from app.memory.manager import MemoryManager
from app.models.entities import Task, Workflow, AgentLog, Message, KnowledgeNode, KnowledgeEdge


EventCallback = Callable[[dict], Awaitable[None]]


class Orchestrator:
    def __init__(self, db: AsyncSession, emit: EventCallback | None = None) -> None:
        self.db = db
        self.emit = emit or self._noop_emit
        self.memory = MemoryManager()
        self._context: dict[str, str] = {}

    @staticmethod
    async def _noop_emit(event: dict) -> None:
        pass

    async def _log_event(
        self, task_id: int, agent_name: str, event_type: str,
        message: str, reasoning: str = "", tool_used: str | None = None,
        tool_input: dict | None = None, tool_output: dict | None = None,
        progress: int = 0, duration_ms: int | None = None,
    ) -> None:
        log = AgentLog(
            task_id=task_id,
            agent_name=agent_name,
            event_type=event_type,
            message=message,
            reasoning=reasoning,
            tool_used=tool_used,
            tool_input=tool_input,
            tool_output=tool_output,
            progress=progress,
            duration_ms=duration_ms,
        )
        self.db.add(log)
        await self.db.commit()
        await self.emit({
            "type": "agent_event",
            "task_id": task_id,
            "agent": agent_name,
            "event_type": event_type,
            "message": message,
            "reasoning": reasoning,
            "tool_used": tool_used,
            "progress": progress,
            "timestamp": datetime.utcnow().isoformat(),
        })

    async def _run_agent(self, task: Task, node: WorkflowNode, progress: int) -> str:
        agent_def = AGENT_DEFINITIONS.get(node.agent)
        if not agent_def:
            return f"Unknown agent: {node.agent}"

        role = agent_def.role
        start = time.time()

        await self._log_event(
            task.id, node.agent, "started",
            f"{role} starting: {node.label}",
            reasoning=f"Executing workflow step '{node.label}' for objective: {task.objective[:100]}",
            progress=progress,
        )

        tool_outputs = []
        if agent_def.tools and node.agent in ("research", "tool", "strategy"):
            for tool_name in agent_def.tools[:2]:
                if tool_name == "workflow_control":
                    continue
                tool_input = {"query": task.objective} if tool_name == "web_search" else {"content": task.objective}
                result = execute_tool(tool_name, **tool_input)
                tool_outputs.append(f"[{tool_name}]: {str(result)[:500]}")
                await self._log_event(
                    task.id, node.agent, "tool_used",
                    f"Used tool: {tool_name}",
                    tool_used=tool_name,
                    tool_input=tool_input,
                    tool_output=result,
                    progress=progress,
                )

        context = "\n".join([
            f"Objective: {task.objective}",
            f"Task Type: {task.task_type}",
            *[f"{k}: {v[:300]}" for k, v in self._context.items()],
            *tool_outputs,
        ])

        prompt = f"Task: {node.label}\nObjective: {task.objective}"
        # llm_generate is a *blocking* sync call (anthropic sync client / httpx
        # stream). Awaited directly on the event loop it froze the entire API
        # for the length of the generation — every other request, every socket
        # event, for every user. Offload it to a worker thread.
        output = await asyncio.to_thread(llm_generate, role, prompt, context)
        self._context[node.agent] = output

        self.memory.store_short_term(task.id, node.agent, {"output": output, "label": node.label})

        duration = int((time.time() - start) * 1000)
        await self._log_event(
            task.id, node.agent, "completed",
            f"{role} completed: {node.label}",
            reasoning=output[:500],
            progress=progress,
            duration_ms=duration,
        )

        msg = Message(
            task_id=task.id,
            role="agent",
            content=output,
            agent_name=node.agent,
            metadata_={"label": node.label, "duration_ms": duration},
        )
        self.db.add(msg)
        await self.db.commit()

        return output

    async def _execute_parallel_group(self, task: Task, nodes: list[WorkflowNode], progress: int) -> list[str]:
        # ponytail: run sequentially. asyncio.gather here shared one AsyncSession
        # across agents, which SQLAlchemy rejects (IllegalStateChangeError), and
        # bought nothing anyway since llm_generate is a blocking sync call.
        # For true parallelism: give each agent its own session + an async LLM client.
        return [await self._run_agent(task, node, progress) for node in nodes]

    async def execute_task(self, task: Task, requires_approval: bool = False) -> dict:
        workflow_def = generate_workflow(task.objective, requires_approval)
        task.task_type = workflow_def.task_type
        task.status = "planning"
        task.progress = 5
        task.plan = workflow_def.to_dict()["nodes"]
        await self.db.commit()

        wf = Workflow(
            task_id=task.id,
            name=workflow_def.name,
            nodes=workflow_def.to_dict()["nodes"],
            edges=[],
            status="running",
        )
        self.db.add(wf)
        await self.db.commit()
        task.workflow_id = wf.id

        await self.emit({
            "type": "workflow_started",
            "task_id": task.id,
            "workflow": workflow_def.to_dict(),
            "message": f"Manager Agent initiated: {workflow_def.name}",
        })

        await self._log_event(
            task.id, "manager", "orchestration_start",
            f"Manager Agent orchestrating: {workflow_def.name}",
            reasoning=f"Detected task type '{workflow_def.task_type}' with {len(workflow_def.nodes)} agents",
            progress=5,
        )

        if requires_approval:
            task.status = "awaiting_approval"
            task.approval_status = "pending"
            task.requires_approval = True
            await self.db.commit()
            await self.emit({
                "type": "approval_required",
                "task_id": task.id,
                "plan": task.plan,
                "message": "Plan ready for human approval",
            })
            return {"status": "awaiting_approval", "plan": task.plan}

        return await self._run_workflow(task, workflow_def)

    async def _run_workflow(self, task: Task, workflow_def: GeneratedWorkflow) -> dict:
        task.status = "running"
        await self.db.commit()

        nodes = workflow_def.nodes
        total = len(nodes)
        completed_agents: set[str] = set()
        i = 0

        while i < total:
            node = nodes[i]

            if node.parallel_group is not None:
                parallel_nodes = [node]
                j = i + 1
                while j < total and nodes[j].parallel_group == node.parallel_group:
                    parallel_nodes.append(nodes[j])
                    j += 1

                progress = int(((i + len(parallel_nodes)) / total) * 90) + 5
                await self.emit({
                    "type": "parallel_execution",
                    "task_id": task.id,
                    "agents": [n.agent for n in parallel_nodes],
                    "message": f"Running {len(parallel_nodes)} agents in parallel",
                    "progress": progress,
                })

                await self._execute_parallel_group(task, parallel_nodes, progress)
                for n in parallel_nodes:
                    completed_agents.add(n.agent)
                i = j
            else:
                # Nodes are authored in topological order, so a missing dep means
                # an upstream agent failed — run anyway rather than silently
                # dropping the step (the old `continue` skipped it forever).
                progress = int(((i + 1) / total) * 90) + 5
                task.progress = progress
                await self.db.commit()

                await self._run_agent(task, node, progress)
                completed_agents.add(node.agent)
                i += 1

        final_output = self._context.get("delivery") or self._context.get("writer") or self._context.get("reviewer", "")
        combined = "\n\n---\n\n".join(
            f"### {AGENT_DEFINITIONS.get(k, AGENT_DEFINITIONS['planner']).role}\n{v}"
            for k, v in self._context.items()
        )

        task.output = combined
        task.status = "completed"
        task.progress = 100
        task.completed_at = datetime.utcnow()
        await self.db.commit()

        await self.memory.store_task_memory(
            self.db, task.user_id, task.id,
            f"Completed task: {task.objective[:200]}. Output length: {len(combined)} chars.",
            agent_name="memory",
        )
        await self.memory.store_long_term(
            self.db, task.user_id,
            f"Task completed: {task.title}. Key output: {final_output[:300]}",
            task_id=task.id, agent_name="memory",
            tags=[task.task_type, "completed"],
        )

        await self._build_knowledge_graph(task)

        await self._log_event(
            task.id, "manager", "orchestration_complete",
            "All agents completed successfully",
            progress=100,
        )

        await self.emit({
            "type": "task_completed",
            "task_id": task.id,
            "output": combined,
            "progress": 100,
            "message": "Task completed by AI workforce",
        })

        return {"status": "completed", "output": combined, "plan": task.plan}

    async def approve_and_continue(self, task: Task) -> dict:
        task.approval_status = "approved"
        task.status = "running"
        await self.db.commit()

        workflow_def = generate_workflow(task.objective, False)
        return await self._run_workflow(task, workflow_def)

    async def _build_knowledge_graph(self, task: Task) -> None:
        main_node = KnowledgeNode(
            user_id=task.user_id,
            label=task.title[:200],
            node_type="task",
            content=task.objective,
            source_type="task",
            source_id=task.id,
        )
        self.db.add(main_node)
        await self.db.commit()
        await self.db.refresh(main_node)

        for agent_name, output in self._context.items():
            child = KnowledgeNode(
                user_id=task.user_id,
                label=f"{agent_name}: {task.title[:100]}",
                node_type="agent_output",
                content=output[:1000],
                source_type="agent",
                source_id=task.id,
            )
            self.db.add(child)
            await self.db.commit()
            await self.db.refresh(child)

            edge = KnowledgeEdge(
                user_id=task.user_id,
                source_node_id=main_node.id,
                target_node_id=child.id,
                relationship="produced_by",
                weight=1.0,
            )
            self.db.add(edge)
            await self.db.commit()

            self.memory.vector.add_knowledge(
                f"kn_{child.id}", child.content or "",
                {"user_id": task.user_id, "agent": agent_name, "task_id": task.id},
            )
