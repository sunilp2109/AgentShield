from pydantic import BaseModel

from fastapi import APIRouter, HTTPException, Query

from app.security.approval import (
    APPROVAL_STATUSES,
    ApprovalError,
    ApprovalRequestOut,
    approval_service,
)

router = APIRouter()


class ReviewerPayload(BaseModel):
    decided_by: str | None = None
    reason: str | None = None


@router.get("/approvals", response_model=list[ApprovalRequestOut])
def list_approvals(
    status: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
) -> list[ApprovalRequestOut]:
    if status is not None:
        status = status.upper()
        if status not in APPROVAL_STATUSES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid status filter. Expected one of: {', '.join(sorted(APPROVAL_STATUSES))}.",
            )
    try:
        return approval_service.get_requests(status=status, session_id=session_id)
    except Exception:
        raise HTTPException(status_code=503, detail="Approval queue is temporarily unavailable.") from None


@router.get("/approvals/{approval_id}", response_model=ApprovalRequestOut)
def get_approval_request(approval_id: str) -> ApprovalRequestOut:
    item = approval_service.get_request(approval_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Approval request not found.")
    return item


@router.post("/approvals/{approval_id}/approve", response_model=ApprovalRequestOut)
def approve_approval_request(
    approval_id: str,
    payload: ReviewerPayload | None = None,
) -> ApprovalRequestOut:
    payload = payload or ReviewerPayload()
    try:
        return approval_service.approve_request(approval_id, decided_by=payload.decided_by)
    except ApprovalError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None


@router.post("/approvals/{approval_id}/reject", response_model=ApprovalRequestOut)
def reject_approval_request(
    approval_id: str,
    payload: ReviewerPayload | None = None,
) -> ApprovalRequestOut:
    payload = payload or ReviewerPayload()
    try:
        return approval_service.reject_request(
            approval_id,
            reason=payload.reason,
            decided_by=payload.decided_by,
        )
    except ApprovalError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
