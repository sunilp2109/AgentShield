from app.llm.base import LLMProvider
from app.llm.providers.mock import MockLLMProvider

PROVIDERS: dict[str, type[LLMProvider]] = {
    "mock": MockLLMProvider,
}


def get_llm_provider(name: str) -> LLMProvider:
    try:
        provider_cls = PROVIDERS[name.lower()]
    except KeyError as exc:
        known = ", ".join(sorted(PROVIDERS))
        raise ValueError(f"Unknown LLM provider '{name}'. Known providers: {known}") from exc
    return provider_cls()
