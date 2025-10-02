"""Загрузка конфигурации проекта."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import yaml


@dataclass
class RetryPolicy:
    attempts: int = 5
    backoff_initial: float = 2.0
    backoff_multiplier: float = 2.0
    backoff_max: float = 60.0


@dataclass
class LoggingConfig:
    level: str = "INFO"
    directory: Path = Path("logs")
    rotation_size_mb: int = 10
    rotation_backups: int = 5


@dataclass
class ProfileConfig:
    name: str = "local"
    storage_path: Path = Path("storage")


@dataclass
class Settings:
    sources: List[str]
    target_channel: str
    moderation_chat: str
    attribution_enabled: bool = False
    profile: ProfileConfig = field(default_factory=ProfileConfig)
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    database_path: Path = Path("storage") / "state.sqlite3"
    media_storage_path: Path = Path("storage") / "media"
    error_alerts_enabled: bool = True
    dedup_ttl_days: int = 30

    @property
    def profile_name(self) -> str:
        return self.profile.name


def _expand_path(path_value: str | os.PathLike[str]) -> Path:
    path = Path(path_value)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    return path


def load_settings(config_path: Path | str) -> Settings:
    path = Path(config_path)
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}

    profile_name = raw.get("PROFILE", "local")
    profile_section = raw.get("profiles", {}).get(profile_name, {})

    sources = profile_section.get("SOURCES") or raw.get("SOURCES")
    if not sources:
        raise ValueError("Не задан список источников (SOURCES)")

    target_channel = profile_section.get("TARGET") or raw.get("TARGET")
    if not target_channel:
        raise ValueError("Не задан целевой канал (TARGET)")

    moderation_chat = profile_section.get("MOD_CHAT") or raw.get("MOD_CHAT")
    if not moderation_chat:
        raise ValueError("Не задан модераторский чат (MOD_CHAT)")

    attribution_enabled = profile_section.get(
        "ATTRIBUTION_ENABLED", raw.get("ATTRIBUTION_ENABLED", False)
    )

    database_path = profile_section.get("DATABASE_PATH") or raw.get("DATABASE_PATH")
    media_storage_path = profile_section.get("MEDIA_STORAGE_PATH") or raw.get(
        "MEDIA_STORAGE_PATH"
    )

    retry_raw = raw.get("RETRY", {})
    retry_policy = RetryPolicy(
        attempts=int(retry_raw.get("ATTEMPTS", 5)),
        backoff_initial=float(retry_raw.get("INITIAL", 2.0)),
        backoff_multiplier=float(retry_raw.get("MULTIPLIER", 2.0)),
        backoff_max=float(retry_raw.get("MAX", 60.0)),
    )

    logging_raw = raw.get("LOGGING", {})
    logging_cfg = LoggingConfig(
        level=logging_raw.get("LEVEL", "INFO"),
        directory=_expand_path(logging_raw.get("DIRECTORY", "logs")),
        rotation_size_mb=int(logging_raw.get("ROTATION_SIZE_MB", 10)),
        rotation_backups=int(logging_raw.get("ROTATION_BACKUPS", 5)),
    )

    if database_path:
        database_path = _expand_path(database_path)
    else:
        database_path = logging_cfg.directory.parent / "storage" / "state.sqlite3"

    if media_storage_path:
        media_storage_path = _expand_path(media_storage_path)
    else:
        media_storage_path = database_path.parent / "media"

    profile = ProfileConfig(name=profile_name, storage_path=database_path.parent)

    return Settings(
        sources=list(map(str, sources)),
        target_channel=str(target_channel),
        moderation_chat=str(moderation_chat),
        attribution_enabled=bool(attribution_enabled),
        profile=profile,
        retry_policy=retry_policy,
        logging=logging_cfg,
        database_path=Path(database_path),
        media_storage_path=Path(media_storage_path),
        error_alerts_enabled=bool(raw.get("ERROR_ALERTS_ENABLED", True)),
        dedup_ttl_days=int(raw.get("DEDUP_TTL_DAYS", 30)),
    )


def load_settings_from_env() -> Settings:
    config_path = os.getenv("VKTG_CONFIG", "config.yaml")
    return load_settings(config_path)
