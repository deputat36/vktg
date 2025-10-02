"""Настройка логирования с ротацией файлов."""
from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .config import LoggingConfig


def setup_logging(cfg: LoggingConfig) -> None:
    cfg.directory.mkdir(parents=True, exist_ok=True)
    log_file = cfg.directory / "service.log"

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = RotatingFileHandler(
        log_file,
        maxBytes=cfg.rotation_size_mb * 1024 * 1024,
        backupCount=cfg.rotation_backups,
        encoding="utf-8",
    )
    handler.setFormatter(formatter)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, cfg.level.upper(), logging.INFO))
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.addHandler(console_handler)
