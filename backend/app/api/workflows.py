from fastapi import APIRouter
from app.schemas.workflow import WorkflowRequest, WorkflowResult
from app.workflows.generator import generate_workflow, classify_task

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("/preview")
async def preview_workflow(payload: WorkflowRequest):
    wf = generate_workflow(payload.objective, payload.requires_approval)
    return wf.to_dict()


@router.post("/classify")
async def classify(payload: WorkflowRequest):
    return {"task_type": classify_task(payload.objective), "objective": payload.objective}


@router.post("/run", response_model=WorkflowResult)
async def run_workflow(payload: WorkflowRequest):
    wf = generate_workflow(payload.objective)
    return WorkflowResult(
        objective=payload.objective,
        status="preview",
        plan=[n.agent for n in wf.nodes],
        output=f"Workflow '{wf.name}' with {len(wf.nodes)} agents. Submit via POST /api/v1/tasks for execution.",
    )
