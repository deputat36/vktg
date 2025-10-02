"""Отслеживание источников Telegram через Telethon."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List

from telethon import TelegramClient, events, utils
from telethon.tl.custom.message import Message
from telethon.tl.types import PeerChannel

from .config import Settings
from .media import MediaItem, QueuePayload
from .storage import Storage

logger = logging.getLogger(__name__)


@dataclass
class WatcherCallbacks:
    on_new_item: Callable[[object], asyncio.Future | None]


class SourceWatcher:
    """Подписка на каналы-источники."""

    def __init__(
        self,
        settings: Settings,
        storage: Storage,
        client: TelegramClient,
        media_dir: Path,
    ):
        self.settings = settings
        self.storage = storage
        self.client = client
        self.media_dir = media_dir
        self.callbacks: List[WatcherCallbacks] = []
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self._runner_task: asyncio.Task | None = None

    def register_callback(self, callback: Callable[[object], asyncio.Future | None]) -> None:
        self.callbacks.append(WatcherCallbacks(on_new_item=callback))

    async def start(self) -> None:
        logger.info("Запускаем слежение за источниками: %s", ", ".join(self.settings.sources))
        self.client.add_event_handler(
            self._handle_new_message,
            events.NewMessage(chats=self.settings.sources),
        )
        self.client.add_event_handler(
            self._handle_album,
            events.Album(chats=self.settings.sources),
        )
        await self.client.start()
        loop = asyncio.get_running_loop()
        self._runner_task = loop.create_task(self.client.run_until_disconnected())

    async def stop(self) -> None:
        await self.client.disconnect()
        if self._runner_task:
            await self._runner_task

    async def _handle_new_message(self, event: events.NewMessage.Event) -> None:
        if event.message.grouped_id:
            return
        await self._process_message(event.message)

    async def _handle_album(self, event: events.Album.Event) -> None:
        messages = event.messages
        if not messages:
            return
        await self._process_album(messages)

    async def _process_message(self, message: Message) -> None:
        if message.out or message.action:
            return
        payload = await self._build_payload([message])
        dedup_key = f"{message.chat_id}:{message.id}"
        queue_item = self.storage.create_queue_item(
            dedup_key=dedup_key,
            source_id=str(message.chat_id),
            source_name=message.chat.title if message.chat else str(message.chat_id),
            source_message_id=message.id,
            media_group_id=None,
            payload=payload.to_dict(),
            ttl_seconds=int(self.settings.dedup_ttl_days * 24 * 3600),
        )
        if not queue_item:
            logger.debug("Сообщение %s уже присутствует в очереди", dedup_key)
            return
        await self._notify(queue_item)

    async def _process_album(self, messages: List[Message]) -> None:
        first = messages[0]
        if first.out or first.action:
            return
        grouped_id = first.grouped_id or first.id
        payload = await self._build_payload(messages)
        dedup_key = f"{first.chat_id}:album:{grouped_id}"
        queue_item = self.storage.create_queue_item(
            dedup_key=dedup_key,
            source_id=str(first.chat_id),
            source_name=first.chat.title if first.chat else str(first.chat_id),
            source_message_id=first.id,
            media_group_id=str(grouped_id),
            payload=payload.to_dict(),
            ttl_seconds=int(self.settings.dedup_ttl_days * 24 * 3600),
        )
        if not queue_item:
            logger.debug("Альбом %s уже присутствует в очереди", dedup_key)
            return
        await self._notify(queue_item)

    async def _notify(self, queue_item) -> None:
        for cb in self.callbacks:
            try:
                result = cb.on_new_item(queue_item)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                logger.exception("Ошибка при обработке нового элемента очереди")

    async def _build_payload(self, messages: List[Message]) -> QueuePayload:
        text_parts: List[str] = []
        media_items: List[MediaItem] = []
        source_link = None

        for index, message in enumerate(messages):
            if message.message:
                text_parts.append(message.message)
            if message.media:
                file_dir = self.media_dir / str(message.chat_id)
                file_dir.mkdir(parents=True, exist_ok=True)
                file_path = await self.client.download_media(message, file=file_dir)
                if not file_path:
                    continue
                media_type = self._detect_media_type(message)
                caption = message.message if message.message and not text_parts[:-1] else message.caption
                media_items.append(
                    MediaItem(
                        type=media_type,
                        file_path=str(file_path),
                        caption=caption,
                    )
                )

            if not source_link and isinstance(message.peer_id, PeerChannel):
                username = getattr(message.chat, "username", None)
                if username:
                    source_link = f"https://t.me/{username}/{message.id}"
            if not source_link:
                try:
                    source_link = utils.get_message_link(message, resolve_username=False)
                except Exception:
                    source_link = None

        text = "\n\n".join(filter(None, text_parts)) if text_parts else None
        payload_type = "album" if len(media_items) > 1 else ("media" if media_items else "text")
        return QueuePayload(
            type=payload_type,
            text=text,
            entities=None,
            media=media_items,
            source_link=source_link,
        )

    def _detect_media_type(self, message: Message) -> str:
        if message.photo:
            return "photo"
        if message.video:
            return "video"
        return "document"
