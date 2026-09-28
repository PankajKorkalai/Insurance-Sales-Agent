"""Azure OpenAI client, used only by the add-on advisor - never by the premium calculator."""

from __future__ import annotations

import os
from functools import lru_cache

from openai import AzureOpenAI, OpenAIError

import database  # noqa: F401  (loads .env)

REQUIRED_ENV_VARS: tuple[str, ...] = (
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_DEPLOYMENT_NAME",
)


class LLMUnavailableError(RuntimeError):
    """Azure OpenAI is not configured or the request failed."""


def _redact(message: str) -> str:
    key = os.getenv("AZURE_OPENAI_API_KEY")
    return message.replace(key, "***") if key else message


def deployment_name() -> str | None:
    return os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")


@lru_cache(maxsize=1)
def _client() -> AzureOpenAI:
    missing = [name for name in REQUIRED_ENV_VARS if not os.getenv(name)]
    if missing:
        raise LLMUnavailableError(
            f"AI advisor is not configured. Missing environment variables: {', '.join(missing)}."
        )
    return AzureOpenAI(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        api_version=os.environ["AZURE_OPENAI_API_VERSION"],
        max_retries=3,
        timeout=60,
    )


def get_chat_completion(messages: list[dict[str, str]], json_mode: bool = True) -> str:
    """Deterministic-as-possible chat completion (temperature 0), optionally JSON-only."""
    client = _client()
    kwargs: dict = {"response_format": {"type": "json_object"}} if json_mode else {}
    try:
        response = client.chat.completions.create(
            model=deployment_name(),
            messages=messages,
            temperature=0,
            **kwargs,
        )
    except OpenAIError as exc:
        raise LLMUnavailableError(
            f"Azure OpenAI request failed: {type(exc).__name__}: {_redact(str(exc))}"
        ) from None
    return response.choices[0].message.content or ""
