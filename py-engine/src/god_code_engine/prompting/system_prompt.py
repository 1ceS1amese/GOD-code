from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import os
from pathlib import Path

from god_code_engine.api.god_code_api_models import ToolCatalogEntry


DEFAULT_SYSTEM_PROMPT = """You are driving a coding-agent turn through explicit tool calls.
Host file and shell side effects happen only through tools mediated by the host tool registry and permissions.
Available tools are described separately by the provider request tool schema.
Base final answers on observed tool results and keep them concise."""

MAX_SYSTEM_PROMPT_FILE_BYTES = 64 * 1024


@dataclass(frozen=True, slots=True)
class SystemPromptConfig:
    enabled: bool = True
    template: str | None = None
    extra: str | None = None


class SystemPromptBuilder:
    def __init__(self, config: SystemPromptConfig | None = None) -> None:
        self._config = config or SystemPromptConfig()

    def build(self, *, tools: list[ToolCatalogEntry]) -> str | None:
        del tools
        if not self._config.enabled:
            return None
        base = self._config.template or DEFAULT_SYSTEM_PROMPT
        if self._config.extra is None:
            return base
        return f"{base}\n\nAdditional local instructions:\n{self._config.extra}"


def load_system_prompt_builder_from_env(
    environ: Mapping[str, str] | None = None,
) -> SystemPromptBuilder:
    source = environ if environ is not None else os.environ
    enabled = _read_bool(source, "GOD_CODE_SYSTEM_PROMPT_ENABLED", default=True)
    template = _read_template(source) if enabled else None
    extra = _read_optional_prompt(source, "GOD_CODE_SYSTEM_PROMPT_EXTRA") if enabled else None
    return SystemPromptBuilder(
        SystemPromptConfig(
            enabled=enabled,
            template=template,
            extra=extra,
        )
    )


def _read_template(source: Mapping[str, str]) -> str | None:
    inline = _read_optional_prompt(source, "GOD_CODE_SYSTEM_PROMPT")
    file_path = _read_optional(source, "GOD_CODE_SYSTEM_PROMPT_FILE")
    if inline is not None and file_path is not None:
        raise ValueError(
            "GOD_CODE_SYSTEM_PROMPT and GOD_CODE_SYSTEM_PROMPT_FILE are mutually exclusive."
        )
    if file_path is None:
        return inline
    return _read_prompt_file(file_path)


def _read_prompt_file(file_path: str) -> str:
    path = Path(file_path)
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ValueError(f"GOD_CODE_SYSTEM_PROMPT_FILE could not be read: {file_path}") from exc
    if len(raw) > MAX_SYSTEM_PROMPT_FILE_BYTES:
        raise ValueError(
            "GOD_CODE_SYSTEM_PROMPT_FILE must be at most "
            f"{MAX_SYSTEM_PROMPT_FILE_BYTES} bytes."
        )
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("GOD_CODE_SYSTEM_PROMPT_FILE must be UTF-8.") from exc
    stripped = text.strip()
    if stripped == "":
        raise ValueError("GOD_CODE_SYSTEM_PROMPT_FILE must not be empty.")
    return stripped


def _read_optional_prompt(source: Mapping[str, str], key: str) -> str | None:
    value = _read_optional(source, key)
    if value is None:
        return None
    if value.strip() == "":
        raise ValueError(f"{key} must not be empty.")
    return value.strip()


def _read_optional(source: Mapping[str, str], key: str) -> str | None:
    value = source.get(key)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _read_bool(source: Mapping[str, str], key: str, *, default: bool) -> bool:
    raw = _read_optional(source, key)
    if raw is None:
        return default
    normalized = raw.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{key} must be a boolean.")
