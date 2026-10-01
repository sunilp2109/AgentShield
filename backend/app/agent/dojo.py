"""AgentDojo integration for AgentShield.

Provides an official AgentDojo defense pipeline element (AgentShieldDojoDefense),
a prompt injection detector (AgentShieldPIDetector), pipeline factory,
and evaluation runner.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any
from uuid import uuid4

from agentdojo.agent_pipeline.base_pipeline_element import BasePipelineElement
from agentdojo.agent_pipeline.basic_elements import InitQuery, SystemMessage
from agentdojo.agent_pipeline.pi_detector import PromptInjectionDetector
from agentdojo.agent_pipeline.tool_execution import ToolsExecutionLoop, ToolsExecutor
from agentdojo.agent_pipeline.agent_pipeline import AgentPipeline
from agentdojo.functions_runtime import EmptyEnv, Env, FunctionsRuntime, FunctionCall
from agentdojo.task_suite.load_suites import get_suite
from agentdojo.types import (
    ChatMessage,
    ChatToolResultMessage,
    get_text_content_as_str,
    text_content_block_from_string,
)

from app.security.audit import log_firewall_result
from app.security.detector import Detector
from app.security.policy_engine import evaluate_policy
from app.security.risk_engine import RiskAssessment, assess_risk
from app.security.state import shield_state
from app.security.trust_engine import SourceType, TrustLevel, assess_trust
from app.shield.models import FirewallDecision


class AgentShieldDojoDefense(BasePipelineElement):
    """Runtime security firewall defense element for AgentDojo pipelines.

    Intercepts assistant tool calls, performs trust analysis, prompt injection detection,
    CVSS v3.1 risk assessment, policy enforcement, and audit logging.
    """

    name: str = "agentshield_firewall"

    def __init__(
        self,
        *,
        block_approval_required: bool = True,
        session_id: str | None = None,
    ) -> None:
        super().__init__()
        self.block_approval_required = block_approval_required
        self.session_id = session_id
        self.detector = Detector()

    def query(
        self,
        query: str,
        runtime: FunctionsRuntime,
        env: Env = EmptyEnv(),
        messages: Sequence[ChatMessage] = [],
        extra_args: dict[str, Any] | None = None,
    ) -> tuple[str, FunctionsRuntime, Env, Sequence[ChatMessage], dict[str, Any]]:
        extra_args = extra_args or {}
        if not messages:
            return query, runtime, env, messages, extra_args

        last_message = messages[-1]
        if last_message.get("role") != "assistant":
            return query, runtime, env, messages, extra_args

        tool_calls = last_message.get("tool_calls")
        if not tool_calls:
            return query, runtime, env, messages, extra_args

        # 1. Identify user intent from conversation history
        user_intent = query
        for msg in messages:
            if msg.get("role") == "user" and msg.get("content"):
                user_intent = get_text_content_as_str(msg["content"])
                break

        # 2. Extract tool response context from previous turns
        untrusted_tool_outputs: list[str] = []
        has_injection_in_history = False
        for msg in messages:
            if msg.get("role") == "tool" and msg.get("content"):
                text = get_text_content_as_str(msg["content"])
                untrusted_tool_outputs.append(text)
                if not has_injection_in_history:
                    det = self.detector.detect(text)
                    if det.is_injection:
                        has_injection_in_history = True

        allowed_calls: list[FunctionCall] = []
        blocked_results: list[ChatToolResultMessage] = []
        session_id = self.session_id or str(extra_args.get("session_id") or uuid4().hex)

        for tool_call in tool_calls:
            tool_name = tool_call.function
            args = dict(tool_call.args)

            source_type = SourceType.TOOL_RESPONSE if untrusted_tool_outputs else SourceType.USER
            blob = json.dumps(args, default=str) + " " + " ".join(untrusted_tool_outputs[-2:])
            injection_result = self.detector.detect(blob)

            metadata: dict[str, Any] = {
                "source_type": source_type,
                "user_intent": user_intent,
                "session_id": session_id,
                "request_id": uuid4().hex,
                "untrusted_context": untrusted_tool_outputs[:3],
            }

            if has_injection_in_history or injection_result.is_injection:
                metadata["injection"] = injection_result
                metadata["source_type"] = SourceType.WEBPAGE  # Untrusted external source

            # Run AgentShield security evaluation
            trust = assess_trust(metadata["source_type"], {**args, **metadata})
            risk: RiskAssessment = assess_risk(tool_name, args, metadata)
            policy = evaluate_policy(tool_name, args, metadata, risk=risk, trust=trust, injection=injection_result)

            decision = policy.decision
            is_blocked = False

            if shield_state.shield_enabled:
                if decision == FirewallDecision.BLOCK:
                    is_blocked = True
                elif decision == FirewallDecision.APPROVAL_REQUIRED and self.block_approval_required:
                    is_blocked = True

            # Record audit event
            execution_status = "BLOCKED" if is_blocked else "EXECUTED"
            log_firewall_result(
                tool_name=tool_name,
                arguments=args,
                context=metadata,
                decision=decision.value,
                execution_status=execution_status,
                reason=policy.reason,
                approval_required=policy.requires_human_approval,
                trust=trust,
                injection=injection_result,
                risk=risk,
                policy=policy,
            )

            if is_blocked:
                reason_summary = policy.reason or "Security policy violation"
                error_msg = (
                    f"[AgentShield Security Block] Action '{tool_name}' blocked: {reason_summary} "
                    f"(CVSS {risk.risk_score} - {risk.risk_level.value})"
                )
                blocked_results.append(
                    ChatToolResultMessage(
                        role="tool",
                        content=[
                            text_content_block_from_string(
                                f"[AgentShield] Execution blocked by security firewall: {reason_summary}"
                            )
                        ],
                        tool_call_id=tool_call.id,
                        tool_call=tool_call,
                        error=error_msg,
                    )
                )
            else:
                allowed_calls.append(tool_call)

        if not blocked_results:
            return query, runtime, env, messages, extra_args

        # Update last message tool_calls with only allowed calls (or None if all blocked)
        last_message["tool_calls"] = allowed_calls if allowed_calls else None
        new_messages = [*messages, *blocked_results]
        return query, runtime, env, new_messages, extra_args


class AgentShieldPIDetector(PromptInjectionDetector):
    """AgentDojo PromptInjectionDetector backed by AgentShield's detector engine."""

    name: str = "agentshield_pi_detector"

    def __init__(
        self,
        mode: str = "message",
        raise_on_injection: bool = False,
    ) -> None:
        super().__init__(mode=mode, raise_on_injection=raise_on_injection)  # type: ignore
        self.detector = Detector()

    def detect(self, tool_output: str) -> bool:
        result = self.detector.detect(tool_output)
        return bool(result.is_injection)


def create_agentshield_pipeline(
    llm: BasePipelineElement,
    *,
    system_message: str = "You are a helpful AI assistant with tool access.",
    enable_firewall: bool = True,
    enable_pi_detector: bool = True,
    block_approval_required: bool = True,
    tool_output_format: str = "yaml",
) -> AgentPipeline:
    """Build an AgentDojo pipeline guarded by AgentShield runtime security."""
    sys_comp = SystemMessage(system_message)
    init_query = InitQuery()
    tools_executor = ToolsExecutor()

    loop_elements: list[BasePipelineElement] = []
    if enable_firewall:
        loop_elements.append(
            AgentShieldDojoDefense(block_approval_required=block_approval_required)
        )
    loop_elements.append(tools_executor)
    if enable_pi_detector:
        loop_elements.append(AgentShieldPIDetector(mode="message"))
    loop_elements.append(llm)

    tools_loop = ToolsExecutionLoop(loop_elements)
    pipeline = AgentPipeline([sys_comp, init_query, llm, tools_loop])
    pipeline.name = f"{getattr(llm, 'name', 'agent')}-agentshield"
    return pipeline


def evaluate_dojo_task(
    suite_name: str = "workspace",
    user_task_id: str = "user_task_0",
    injection_task_id: str | None = None,
    *,
    pipeline: BasePipelineElement | None = None,
    shield_enabled: bool = True,
) -> dict[str, Any]:
    """Run an AgentDojo task with AgentShield defense and return benchmark outcome."""
    original_shield_state = shield_state.shield_enabled
    try:
        shield_state.set_enabled(shield_enabled)
        suite = get_suite("v1", suite_name)
        user_task = suite.user_tasks[user_task_id]
        injection_task = (
            suite.injection_tasks.get(injection_task_id) if injection_task_id else None
        )

        injections = suite.get_injection_vector_defaults()
        if pipeline is None:
            from agentdojo.agent_pipeline import GroundTruthPipeline

            pipeline = GroundTruthPipeline(user_task)

        # Wrap in AgentShield defense if not already present
        guarded_pipeline = (
            pipeline
            if isinstance(pipeline, (AgentShieldDojoDefense, AgentPipeline))
            else AgentPipeline([AgentShieldDojoDefense(), pipeline])
        )

        utility, security = suite.run_task_with_pipeline(
            guarded_pipeline,
            user_task=user_task,
            injection_task=injection_task,
            injections=injections,
        )

        return {
            "suite": suite_name,
            "user_task_id": user_task_id,
            "injection_task_id": injection_task_id,
            "shield_enabled": shield_enabled,
            "utility_success": bool(utility),
            "security_blocked": not bool(security) if injection_task else True,
            "security_compromised": bool(security) if injection_task else False,
            "status": "COMPLETED",
        }
    finally:
        shield_state.set_enabled(original_shield_state)
