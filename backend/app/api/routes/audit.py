from fastapi import APIRouter, HTTPException, Query

from app.security.audit import (
    DECISIONS,
    MAX_EVENT_LIMIT,
    RISK_LEVELS,
    SOURCE_TYPE_ALIASES,
    AuditStats,
    SecurityEventOut,
    get_event_by_id,
    get_event_stats,
    get_events,
)

router = APIRouter()


@router.get("/audit/events", response_model=list[SecurityEventOut])
def list_audit_events(
    decision: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    injection_detected: bool | None = Query(default=None),
    shield_enabled: bool | None = Query(default=None),
    session_id: str | None = Query(default=None),
    source_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=MAX_EVENT_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[SecurityEventOut]:
    if decision is not None:
        decision = decision.upper()
        if decision not in DECISIONS:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid decision filter. Expected one of: {', '.join(sorted(DECISIONS))}.",
            )
    if risk_level is not None:
        risk_level = risk_level.upper()
        if risk_level not in RISK_LEVELS:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid risk_level filter. Expected one of: {', '.join(sorted(RISK_LEVELS))}.",
            )
    if source_type is not None:
        source_type = source_type.upper()
        if source_type not in SOURCE_TYPE_ALIASES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid source_type filter. Expected one of: {', '.join(sorted(SOURCE_TYPE_ALIASES))}.",
            )
    try:
        return get_events(
            decision=decision,
            risk_level=risk_level,
            injection_detected=injection_detected,
            shield_enabled=shield_enabled,
            session_id=session_id,
            source_type=source_type,
            limit=limit,
            offset=offset,
        )
    except Exception:
        raise HTTPException(status_code=503, detail="Audit log is temporarily unavailable.") from None


@router.get("/audit/events/{event_id}", response_model=SecurityEventOut)
def get_audit_event(event_id: str) -> SecurityEventOut:
    event = get_event_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Security event not found.")
    return event


@router.get("/audit/stats", response_model=AuditStats)
def audit_stats() -> AuditStats:
    try:
        return get_event_stats()
    except Exception:
        raise HTTPException(status_code=503, detail="Audit log is temporarily unavailable.") from None
