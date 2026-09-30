from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.attack_lab.scenarios import AttackScenarioPublic, list_public_scenarios
from app.attack_lab.service import AttackRunResult, run_scenario

router = APIRouter()


class AttackRunRequest(BaseModel):
    scenario_id: str = Field(min_length=1, max_length=64)


@router.get("/attack-lab/scenarios", response_model=list[AttackScenarioPublic])
def attack_lab_scenarios() -> list[AttackScenarioPublic]:
    return list_public_scenarios()


@router.post("/attack-lab/run", response_model=AttackRunResult)
def attack_lab_run(payload: AttackRunRequest) -> AttackRunResult:
    result = run_scenario(payload.scenario_id.strip())
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown Attack Lab scenario.")
    return result
