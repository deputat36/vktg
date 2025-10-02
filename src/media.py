"""Работа с медиафайлами."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class MediaItem:
    type: str
    file_path: str
    caption: Optional[str] = None
    parse_mode: str = "HTML"


@dataclass
class QueuePayload:
    type: str
    text: Optional[str]
    entities: Optional[list]
    media: List[MediaItem]
    source_link: Optional[str]

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "text": self.text,
            "entities": self.entities,
            "media": [media.__dict__ for media in self.media],
            "source_link": self.source_link,
        }

    @staticmethod
    def from_dict(data: dict) -> "QueuePayload":
        return QueuePayload(
            type=data.get("type", "text"),
            text=data.get("text"),
            entities=data.get("entities"),
            media=[MediaItem(**m) for m in data.get("media", [])],
            source_link=data.get("source_link"),
        )
