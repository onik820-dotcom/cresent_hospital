"""Environment-driven settings. Secrets come from the environment only, never from the repo."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase Edge Function API (agent-tools)
    agent_api_base: str = ""  # https://<ref>.supabase.co/functions/v1
    agent_api_key: str = ""

    # Gemini (paid tier only for real calls)
    google_api_key: str = ""
    gemini_model: str = "gemini-3.8-live"
    gemini_language: str = ""  # native-audio models auto-detect; set e.g. bn-BD only if you need to force it
    summary_model: str = "gemini-3.5-flash-lite"

    # Worker
    agent_name: str = "receptionist"  # explicit-dispatch name used by SIP dispatch rule + dashboard
    fallback_transfer_number: str = ""  # used when the dialled number has no live tenant
    http_timeout_s: float = 3.0
    config_timeout_s: float = 2.0
    summary_timeout_s: float = 6.0
    temperature: float = 0.6
    log_level: str = "INFO"

    # Call guards
    silence_prompt_s: float = 8.0
    silence_hangup_s: float = 20.0
    max_call_s: int = 600

    # Cost model, USD per 1M tokens. PLACEHOLDERS derived from the build plan's per-minute
    # figures (25 audio tokens/s): set them from the current Gemini pricing page.
    cost_in_audio_per_mtok: float = 3.33
    cost_out_audio_per_mtok: float = 12.0
    cost_in_text_per_mtok: float = 0.75
    cost_out_text_per_mtok: float = 4.5

    def missing(self) -> list[str]:
        """Names of required settings that are empty (checked at worker start)."""
        need = {
            "AGENT_API_BASE": self.agent_api_base,
            "AGENT_API_KEY": self.agent_api_key,
            "GOOGLE_API_KEY": self.google_api_key,
        }
        return [k for k, v in need.items() if not v]


def get_settings() -> Settings:
    return Settings()
