"""Loads Azure OpenAI settings from .env and exposes embedding / chat helpers."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import AzureOpenAI, OpenAIError

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent

load_dotenv(PROJECT_ROOT / ".env")

REQUIRED_ENV_VARS: tuple[str, ...] = (
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_EMBEDDING_DEPLOYMENT",
    "AZURE_OPENAI_DEPLOYMENT_NAME",
)

AZURE_OPENAI_ENDPOINT: str | None = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY: str | None = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_API_VERSION: str | None = os.getenv("AZURE_OPENAI_API_VERSION")
AZURE_OPENAI_EMBEDDING_DEPLOYMENT: str | None = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
AZURE_OPENAI_DEPLOYMENT_NAME: str | None = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")


def _redact(message: str) -> str:
    """Strip the API key from any text before it is printed or raised."""
    if AZURE_OPENAI_API_KEY:
        message = message.replace(AZURE_OPENAI_API_KEY, "***")
    return message


def _check_env() -> None:
    missing = [name for name in REQUIRED_ENV_VARS if not os.getenv(name)]
    if missing:
        raise EnvironmentError(
            "Missing required environment variables: "
            + ", ".join(missing)
            + ". Add them to the .env file in the project root."
        )


@lru_cache(maxsize=1)
def get_client() -> AzureOpenAI:
    """Return a shared AzureOpenAI client, created on first use."""
    _check_env()
    try:
        return AzureOpenAI(
            azure_endpoint=AZURE_OPENAI_ENDPOINT,
            api_key=AZURE_OPENAI_API_KEY,
            api_version=AZURE_OPENAI_API_VERSION,
            max_retries=5,
        )
    except Exception as exc:
        raise RuntimeError(
            f"Failed to initialise Azure OpenAI client: {type(exc).__name__}: {_redact(str(exc))}"
        ) from None


def get_embedding(text: str) -> list[float]:
    """Embed `text` with the AZURE_OPENAI_EMBEDDING_DEPLOYMENT model."""
    if not text or not text.strip():
        raise ValueError("Cannot embed empty text.")
    client = get_client()
    try:
        response = client.embeddings.create(
            model=AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
            input=text,
        )
        return response.data[0].embedding
    except OpenAIError as exc:
        raise RuntimeError(
            f"Azure OpenAI embedding request failed (deployment "
            f"'{AZURE_OPENAI_EMBEDDING_DEPLOYMENT}'): {type(exc).__name__}: {_redact(str(exc))}"
        ) from None


def get_chat_completion(messages: list[dict[str, str]], temperature: float = 0.0) -> str:
    """Run a chat completion with the AZURE_OPENAI_DEPLOYMENT_NAME model."""
    client = get_client()
    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=messages,
            temperature=temperature,
        )
        return response.choices[0].message.content or ""
    except OpenAIError as exc:
        raise RuntimeError(
            f"Azure OpenAI chat completion failed (deployment "
            f"'{AZURE_OPENAI_DEPLOYMENT_NAME}'): {type(exc).__name__}: {_redact(str(exc))}"
        ) from None
