from typing import Any

from agentdojo.task_suite.load_suites import get_suite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agent.dojo import evaluate_dojo_task
from app.security.state import shield_state

router = APIRouter()

AVAILABLE_SUITES = ("workspace", "banking", "slack", "travel")


class DojoSuiteInfo(BaseModel):
    name: str
    user_tasks_count: int
    injection_tasks_count: int
    tools_count: int
    tools: list[str]


class DojoEvaluateRequest(BaseModel):
    suite: str = Field(default="workspace")
    user_task: str = Field(default="user_task_0")
    injection_task: str | None = None
    shield_enabled: bool = True


class DojoEvaluateResponse(BaseModel):
    suite: str
    user_task_id: str
    injection_task_id: str | None
    shield_enabled: bool
    utility_success: bool
    security_blocked: bool
    security_compromised: bool
    status: str


@router.get("/dojo/suites", response_model=list[DojoSuiteInfo])
def get_dojo_suites() -> list[DojoSuiteInfo]:
    """Return available AgentDojo benchmark task suites and their tool capacities."""
    results: list[DojoSuiteInfo] = []
    for name in AVAILABLE_SUITES:
        try:
            suite = get_suite("v1", name)
            results.append(
                DojoSuiteInfo(
                    name=name,
                    user_tasks_count=len(suite.user_tasks),
                    injection_tasks_count=len(suite.injection_tasks),
                    tools_count=len(suite.tools),
                    tools=[t.name for t in suite.tools],
                )
            )
        except Exception:
            continue
    return results


@router.post("/dojo/evaluate", response_model=DojoEvaluateResponse)
def run_dojo_evaluation(payload: DojoEvaluateRequest) -> DojoEvaluateResponse:
    """Evaluate an AgentDojo task using AgentShield's runtime defense pipeline."""
    if payload.suite not in AVAILABLE_SUITES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid suite '{payload.suite}'. Choose from {AVAILABLE_SUITES}",
        )

    try:
        outcome = evaluate_dojo_task(
            suite_name=payload.suite,
            user_task_id=payload.user_task,
            injection_task_id=payload.injection_task,
            shield_enabled=payload.shield_enabled,
        )
        return DojoEvaluateResponse.model_validate(outcome)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Task not found: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}") from exc
