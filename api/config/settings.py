import json
from pydantic_settings import BaseSettings
from pydantic import field_validator


class Settings(BaseSettings):
    ume_servers: list[dict] = []
    api_port: int = 8000
    topology_cache_ttl: int = 3600
    alarm_api_path: str = "/api/fm-active/v1/north/openapi/v1/activealarms"

    @field_validator("ume_servers", mode="before")
    @classmethod
    def parse_ume_servers(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
