"""LangGraph agent that proposes tool calls but never executes them."""

from __future__ import annotations

from threading import Lock
from uuid import uuid4

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.agent.provider import AgentProvider, get_agent_provider
from app.agent.state import AgentState, AgentTurn, ProposedToolCall
from app.agent.tool_adapter import build_tool_catalog

_graph_lock = Lock()
_compiled_graph = None


def build_agent_graph(provider: AgentProvider | None = None):
    llm = provider or get_agent_provider()
    tools = build_tool_catalog()

    def plan_turn(state: AgentState) -> dict:
        history = list(state.get("messages") or [])
        user_message = state.get("user_message") or ""
        history.append({"role": "user", "content": user_message})
        plan = llm.plan(history, tools)
        history.append(
            {
                "role": "assistant",
                "content": plan.response,
                "tool_calls": [call.model_dump() for call in plan.tool_calls],
            }
        )
        return {
            "messages": history,
            "response": plan.response,
            "tool_calls": [call.model_dump() for call in plan.tool_calls],
            "reasoning_summary": plan.reasoning_summary,
            "sources": plan.sources,
        }

    graph = StateGraph(AgentState)
    graph.add_node("plan", plan_turn)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", END)
    return graph


def get_compiled_graph():
    global _compiled_graph
    with _graph_lock:
        if _compiled_graph is None:
            _compiled_graph = build_agent_graph().compile(checkpointer=MemorySaver())
        return _compiled_graph


def reset_agent_graph() -> None:
    global _compiled_graph
    with _graph_lock:
        _compiled_graph = None


def run_agent(
    message: str,
    session_id: str | None = None,
    *,
    graph=None,
) -> AgentTurn:
    thread_id = session_id or uuid4().hex
    compiled = graph or get_compiled_graph()
    result = compiled.invoke(
        {"user_message": message},
        config={"configurable": {"thread_id": thread_id}},
    )
    tool_calls = [ProposedToolCall.model_validate(item) for item in result.get("tool_calls") or []]
    return AgentTurn(
        response=result.get("response") or "",
        tool_calls=tool_calls,
        reasoning_summary=result.get("reasoning_summary") or "",
        sources=list(result.get("sources") or []),
        session_id=thread_id,
    )
