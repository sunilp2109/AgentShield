from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlaceholderRecord(Base):
    """Reserved for future persistence. Tables are not created yet."""

    __tablename__ = "placeholder_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    shield_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class SecurityEvent(Base):
    """Append-only security audit event produced by the Action Firewall."""

    __tablename__ = "security_events"
    __table_args__ = (
        Index("ix_security_events_session_id", "session_id"),
        Index("ix_security_events_request_id", "request_id"),
        Index("ix_security_events_firewall_decision", "firewall_decision"),
        Index("ix_security_events_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    session_id: Mapped[str] = mapped_column(String(128), default="default")
    request_id: Mapped[str] = mapped_column(String(64))
    shield_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    source_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trust_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    user_intent: Mapped[str | None] = mapped_column(String(240), nullable=True)
    tool_name: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))
    target_resource: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_sensitivity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    destination_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    injection_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    injection_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    policy_decision: Mapped[str] = mapped_column(String(32))
    firewall_decision: Mapped[str] = mapped_column(String(32))
    execution_status: Mapped[str] = mapped_column(String(32))
    execution_result_summary: Mapped[str | None] = mapped_column(String(240), nullable=True)
    block_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approval_required: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ApprovalRequest(Base):
    """Human-in-the-loop approval record for APPROVAL_REQUIRED actions."""

    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("ix_approval_requests_status", "status"),
        Index("ix_approval_requests_session_id", "session_id"),
        Index("ix_approval_requests_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(64))
    session_id: Mapped[str] = mapped_column(String(128), default="default")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="PENDING")
    tool_name: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))
    target_resource: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trust_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    data_sensitivity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    destination_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    injection_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    injection_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    policy_decision: Mapped[str] = mapped_column(String(32), default="APPROVAL_REQUIRED")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_arguments: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    context_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_status: Mapped[str] = mapped_column(String(32), default="NOT_EXECUTED")
    execution_result_summary: Mapped[str | None] = mapped_column(String(240), nullable=True)
