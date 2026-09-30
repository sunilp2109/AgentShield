from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    shield_enabled: bool = True
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    # Provider name is resolved by app.llm.factory. Keep SDKs out of core deps.
    llm_provider: str = "mock"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""

    database_url: str = "sqlite:///./data/agentshield.db"
    sandbox_fs_root: str = "./mock_data/files"
    approval_ttl_minutes: int = 15

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
