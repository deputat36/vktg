"""Хранилище состояния на базе SQLite."""
from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, List, Optional


@dataclass
class QueueItem:
    id: int
    dedup_key: str
    source_id: str
    source_name: str
    source_message_id: int
    media_group_id: str | None
    payload: dict
    status: str
    created_at: float
    updated_at: float
    moderation_message_id: int | None
    moderation_chat_id: int | None
    error: str | None
    target_message_id: int | None
    caption_override: str | None
    retry_count: int = 0


class Storage:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        cur = self._conn.cursor()
        cur.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dedup_key TEXT UNIQUE NOT NULL,
                source_id TEXT NOT NULL,
                source_name TEXT NOT NULL,
                source_message_id INTEGER NOT NULL,
                media_group_id TEXT,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                moderation_message_id INTEGER,
                moderation_chat_id INTEGER,
                error TEXT,
                target_message_id INTEGER,
                caption_override TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
            CREATE INDEX IF NOT EXISTS idx_queue_source ON queue(source_id);

            CREATE TABLE IF NOT EXISTS dedup (
                dedup_key TEXT PRIMARY KEY,
                expires_at REAL NOT NULL
            );
            """
        )
        self._conn.commit()
        self._ensure_columns()

    def _ensure_columns(self) -> None:
        cur = self._conn.execute('PRAGMA table_info(queue)')
        columns = {row['name'] for row in cur.fetchall()}
        if 'retry_count' not in columns:
            with self._conn:
                self._conn.execute("ALTER TABLE queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0")

    def close(self) -> None:
        self._conn.close()

    def add_dedup_key(self, dedup_key: str, ttl_seconds: int) -> None:
        expires_at = time.time() + ttl_seconds
        with self._conn:
            self._conn.execute(
                "REPLACE INTO dedup(dedup_key, expires_at) VALUES(?, ?)",
                (dedup_key, expires_at),
            )

    def has_dedup_key(self, dedup_key: str) -> bool:
        cur = self._conn.execute(
            "SELECT 1 FROM dedup WHERE dedup_key=? AND expires_at > ?",
            (dedup_key, time.time()),
        )
        return cur.fetchone() is not None

    def cleanup_dedup(self) -> None:
        with self._conn:
            self._conn.execute("DELETE FROM dedup WHERE expires_at <= ?", (time.time(),))

    def create_queue_item(
        self,
        dedup_key: str,
        source_id: str,
        source_name: str,
        source_message_id: int,
        media_group_id: str | None,
        payload: dict,
        ttl_seconds: int,
    ) -> QueueItem | None:
        if self.has_dedup_key(dedup_key):
            return None

        now = time.time()
        with self._conn:
            cur = self._conn.execute(
                """
                INSERT INTO queue(
                    dedup_key, source_id, source_name, source_message_id,
                    media_group_id, payload, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)
                """,
                (
                    dedup_key,
                    source_id,
                    source_name,
                    source_message_id,
                    media_group_id,
                    json.dumps(payload, ensure_ascii=False),
                    now,
                    now,
                ),
            )
        self.add_dedup_key(dedup_key, ttl_seconds)
        return self.get_queue_item(cur.lastrowid)

    def get_queue_item(self, item_id: int) -> QueueItem | None:
        cur = self._conn.execute("SELECT * FROM queue WHERE id=?", (item_id,))
        row = cur.fetchone()
        return self._row_to_queue_item(row) if row else None

    def get_queue_item_by_moderation(self, chat_id: int, message_id: int) -> QueueItem | None:
        cur = self._conn.execute(
            "SELECT * FROM queue WHERE moderation_chat_id=? AND moderation_message_id=?",
            (chat_id, message_id),
        )
        row = cur.fetchone()
        return self._row_to_queue_item(row) if row else None

    def list_queue_items_by_status(self, statuses: Iterable[str]) -> List[QueueItem]:
        placeholders = ",".join("?" for _ in statuses)
        cur = self._conn.execute(
            f"SELECT * FROM queue WHERE status IN ({placeholders}) ORDER BY created_at",
            tuple(statuses),
        )
        return [self._row_to_queue_item(row) for row in cur.fetchall()]

    def update_status(
        self,
        item_id: int,
        status: str,
        *,
        moderation_message_id: int | None = None,
        moderation_chat_id: int | None = None,
        error: str | None = None,
        target_message_id: int | None = None,
        caption_override: str | None = None,
        retry_count: int | None = None,
    ) -> None:
        now = time.time()
        updates: dict[str, Any] = {
            "status": status,
            "updated_at": now,
        }
        if moderation_message_id is not None:
            updates["moderation_message_id"] = moderation_message_id
        if moderation_chat_id is not None:
            updates["moderation_chat_id"] = moderation_chat_id
        if error is not None:
            updates["error"] = error
        if target_message_id is not None:
            updates["target_message_id"] = target_message_id
        if caption_override is not None:
            updates["caption_override"] = caption_override
        if retry_count is not None:
            updates["retry_count"] = retry_count

        assignments = ",".join(f"{k}=?" for k in updates.keys())
        values = list(updates.values()) + [item_id]

        with self._conn:
            self._conn.execute(
                f"UPDATE queue SET {assignments} WHERE id=?",
                values,
            )

    def increment_retry(self, item_id: int) -> int:
        cur = self._conn.execute('SELECT retry_count FROM queue WHERE id=?', (item_id,))
        row = cur.fetchone()
        if not row:
            return 0
        retry_count = row['retry_count'] + 1
        with self._conn:
            self._conn.execute('UPDATE queue SET retry_count=?, updated_at=? WHERE id=?', (retry_count, time.time(), item_id))
        return retry_count

    def _row_to_queue_item(self, row: sqlite3.Row) -> QueueItem:
        return QueueItem(
            id=row["id"],
            dedup_key=row["dedup_key"],
            source_id=row["source_id"],
            source_name=row["source_name"],
            source_message_id=row["source_message_id"],
            media_group_id=row["media_group_id"],
            payload=json.loads(row["payload"]),
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            moderation_message_id=row["moderation_message_id"],
            moderation_chat_id=row["moderation_chat_id"],
            error=row["error"],
            target_message_id=row["target_message_id"],
            caption_override=row["caption_override"],
            retry_count=row["retry_count"] if "retry_count" in row.keys() else 0,
        )
