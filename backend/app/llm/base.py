from typing import Protocol


class LLMProvider(Protocol):
    name: str

    async def complete(self, prompt: str) -> str:
        """Return a model completion. Implementations must not assume a vendor SDK."""
        ...
