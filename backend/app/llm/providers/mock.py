class MockLLMProvider:
    name = "mock"

    async def complete(self, prompt: str) -> str:
        return "Mock LLM provider is configured. Register a real provider in app/llm/factory.py."
