"""Dynamic Workflow Generation — determines agents, order, and dependencies."""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class WorkflowNode:
    agent: str
    label: str
    parallel_group: int | None = None
    depends_on: list[str] = field(default_factory=list)


@dataclass
class GeneratedWorkflow:
    task_type: str
    name: str
    nodes: list[WorkflowNode]
    requires_approval: bool = False

    def to_dict(self) -> dict:
        return {
            "task_type": self.task_type,
            "name": self.name,
            "requires_approval": self.requires_approval,
            "nodes": [
                {
                    "agent": n.agent,
                    "label": n.label,
                    "parallel_group": n.parallel_group,
                    "depends_on": n.depends_on,
                }
                for n in self.nodes
            ],
        }


TASK_PATTERNS: list[tuple[str, list[str], str]] = [
    (r"\b(blog|article|content|linkedin|newsletter|seo|case study|write)\b", "content", "Content Factory"),
    (r"\b(market|competitor|swot|landscape|industry analysis)\b", "market_research", "Market Research"),
    (r"\b(gtm|go-to-market|business strategy|startup strategy|investor)\b", "strategy", "Business Strategy"),
    (r"\b(app|software|api|architecture|database design|build)\b", "software", "Software Development"),
    (r"\b(research|analyze|investigate|study)\b", "research", "Research Pipeline"),
    (r"\b(summarize|document|pdf|docx|csv|upload)\b", "document", "Document Intelligence"),
]


def classify_task(objective: str) -> str:
    text = objective.lower()
    for pattern, task_type, _ in TASK_PATTERNS:
        if re.search(pattern, text):
            return task_type
    return "general"


def generate_workflow(objective: str, requires_approval: bool = False) -> GeneratedWorkflow:
    task_type = classify_task(objective)

    workflows: dict[str, GeneratedWorkflow] = {
        "content": GeneratedWorkflow(
            task_type="content",
            name="Content Factory Pipeline",
            requires_approval=requires_approval,
            nodes=[
                WorkflowNode("planner", "Plan content structure"),
                WorkflowNode("research", "Research topic & trends", parallel_group=1),
                WorkflowNode("writer", "Draft content", depends_on=["research"]),
                WorkflowNode("reviewer", "Editorial review", depends_on=["writer"]),
                WorkflowNode("qa", "Factual QA check", depends_on=["reviewer"]),
                WorkflowNode("delivery", "Format final deliverable", depends_on=["qa"]),
                WorkflowNode("memory", "Persist knowledge", depends_on=["delivery"]),
            ],
        ),
        "market_research": GeneratedWorkflow(
            task_type="market_research",
            name="Market Research Pipeline",
            requires_approval=requires_approval,
            nodes=[
                WorkflowNode("planner", "Define research scope"),
                WorkflowNode("research", "Market data collection", parallel_group=1),
                WorkflowNode("strategy", "Competitive analysis", parallel_group=1),
                WorkflowNode("writer", "Compile market report", depends_on=["research", "strategy"]),
                WorkflowNode("qa", "Validate findings", depends_on=["writer"]),
                WorkflowNode("delivery", "Deliver investor-grade report", depends_on=["qa"]),
                WorkflowNode("memory", "Store market intelligence", depends_on=["delivery"]),
            ],
        ),
        "strategy": GeneratedWorkflow(
            task_type="strategy",
            name="Business Strategy Pipeline",
            requires_approval=requires_approval,
            nodes=[
                WorkflowNode("planner", "Define strategic objectives"),
                WorkflowNode("research", "Market & competitor research", parallel_group=1),
                WorkflowNode("strategy", "Develop GTM strategy", depends_on=["research"]),
                WorkflowNode("writer", "Create strategy document", depends_on=["strategy"]),
                WorkflowNode("reviewer", "Executive review", depends_on=["writer"]),
                WorkflowNode("delivery", "Format investor report", depends_on=["reviewer"]),
                WorkflowNode("memory", "Archive strategy insights", depends_on=["delivery"]),
            ],
        ),
        "software": GeneratedWorkflow(
            task_type="software",
            name="Software Architecture Pipeline",
            requires_approval=requires_approval,
            nodes=[
                WorkflowNode("planner", "Gather requirements"),
                WorkflowNode("architect", "Design architecture", depends_on=["planner"]),
                WorkflowNode("writer", "API specs & documentation", depends_on=["architect"]),
                WorkflowNode("tool", "Code analysis", depends_on=["architect"]),
                WorkflowNode("reviewer", "Architecture review", depends_on=["writer", "tool"]),
                WorkflowNode("delivery", "Implementation roadmap", depends_on=["reviewer"]),
                WorkflowNode("memory", "Store technical knowledge", depends_on=["delivery"]),
            ],
        ),
        "research": GeneratedWorkflow(
            task_type="research",
            name="Research Pipeline",
            requires_approval=requires_approval,
            nodes=[
                WorkflowNode("planner", "Define research questions"),
                WorkflowNode("research", "Deep research", parallel_group=1),
                WorkflowNode("reviewer", "Validate sources", depends_on=["research"]),
                WorkflowNode("writer", "Synthesize findings", depends_on=["reviewer"]),
                WorkflowNode("delivery", "Final research report", depends_on=["writer"]),
                WorkflowNode("memory", "Index knowledge", depends_on=["delivery"]),
            ],
        ),
        "document": GeneratedWorkflow(
            task_type="document",
            name="Document Intelligence Pipeline",
            requires_approval=False,
            nodes=[
                WorkflowNode("tool", "Parse documents"),
                WorkflowNode("research", "Extract insights", depends_on=["tool"]),
                WorkflowNode("writer", "Generate summary report", depends_on=["research"]),
                WorkflowNode("memory", "Index document knowledge", depends_on=["writer"]),
            ],
        ),
        "general": GeneratedWorkflow(
            task_type="general",
            name="General Autonomous Pipeline",
            requires_approval=requires_approval,
            nodes=[
                WorkflowNode("planner", "Plan execution"),
                WorkflowNode("research", "Gather context", parallel_group=1),
                WorkflowNode("writer", "Execute task", depends_on=["research"]),
                WorkflowNode("reviewer", "Quality review", depends_on=["writer"]),
                WorkflowNode("qa", "Final QA", depends_on=["reviewer"]),
                WorkflowNode("delivery", "Deliver output", depends_on=["qa"]),
                WorkflowNode("memory", "Store learnings", depends_on=["delivery"]),
            ],
        ),
    }

    wf = workflows.get(task_type, workflows["general"])
    wf.requires_approval = requires_approval
    return wf
