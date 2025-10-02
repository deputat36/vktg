"""Публикация одобренных элементов в целевой канал."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Awaitable, Callable, List, Optional

from telegram import Bot, InputMediaDocument, InputMediaPhoto, InputMediaVideo
from telegram.constants import ParseMode
from telegram.error import TelegramError
from telegram.helpers import escape_html

from .config import Settings
from .media import QueuePayload
from .storage import QueueItem, Storage

logger = logging.getLogger(__name__)


class Publisher:
    def __init__(
        self,
        bot: Bot,
        storage: Storage,
        settings: Settings,
    ) -> None:
        self.bot = bot
        self.storage = storage
        self.settings = settings
        self.retry_policy = settings.retry_policy
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._status_callback: Optional[Callable[[QueueItem], Awaitable[None]]] = None

    def set_status_callback(self, callback: Callable[[QueueItem], Awaitable[None]]) -> None:
        self._status_callback = callback

    async def _notify_status(self, item_id: int) -> None:
        if not self._status_callback:
            return
        item = self.storage.get_queue_item(item_id)
        if not item:
            return
        result = self._status_callback(item)
        if asyncio.iscoroutine(result):
            await result

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task:
            await self._task
            self._task = None

    async def _worker(self) -> None:
        logger.info("Публикатор запущен")
        while not self._stop_event.is_set():
            items = self.storage.list_queue_items_by_status(["approved", "failed"])
            for item in items:
                if item.status == "failed":
                    if item.retry_count >= self.retry_policy.attempts:
                        continue
                    delay = self._calculate_delay(item.retry_count)
                    if time.time() - item.updated_at < delay:
                        continue
                await self._process_item(item)
            await asyncio.sleep(5)
        logger.info("Публикатор остановлен")

    def _escape_text(self, value: str | None) -> str | None:
        if value is None:
            return None
        return escape_html(value)

    def _calculate_delay(self, retry_count: int) -> float:
        if retry_count <= 0:
            return 0
        policy = self.retry_policy
        delay = policy.backoff_initial * (policy.backoff_multiplier ** max(0, retry_count - 1))
        return min(delay, policy.backoff_max)

    async def _process_item(self, item: QueueItem) -> None:
        payload = QueuePayload.from_dict(item.payload)
        segments: list[str] = []
        base_caption = item.caption_override or payload.text
        escaped_caption = self._escape_text(base_caption)
        if escaped_caption:
            segments.append(escaped_caption)
        if self.settings.attribution_enabled:
            source_reference = payload.source_link or item.source_name
            segments.append(f"Источник: {escape_html(str(source_reference))}")
        text = "\n\n".join(segments) if segments else None

        try:
            target_message_id = await self._publish_payload(payload, text)
        except TelegramError as exc:
            logger.exception("Ошибка публикации", exc_info=exc)
            retry_count = self.storage.increment_retry(item.id)
            self.storage.update_status(item.id, "failed", error=str(exc), retry_count=retry_count)
            await self._notify_status(item.id)
            return

        self.storage.update_status(item.id, "published", error="", target_message_id=target_message_id, retry_count=0)
        await self._notify_status(item.id)
        logger.info("Элемент %s опубликован", item.id)

    async def _publish_payload(self, payload: QueuePayload, text: str | None) -> int:
        if payload.type == "text":
            message = await self.bot.send_message(
                chat_id=self.settings.target_channel,
                text=text or "",
                parse_mode=ParseMode.HTML,
            )
            return message.message_id

        if payload.type == "media" and payload.media:
            message = await self._send_single_media(payload.media[0], text)
            return message.message_id

        if payload.type == "album" and payload.media:
            handles = []
            media_group = []
            try:
                for index, media in enumerate(payload.media):
                    handle = open(media.file_path, "rb")
                    handles.append(handle)
                    caption = text if index == 0 else self._escape_text(media.caption)
                    media_group.append(self._build_input_media(media.type, handle, caption))
                messages = await self.bot.send_media_group(
                    chat_id=self.settings.target_channel,
                    media=media_group,
                )
            finally:
                for handle in handles:
                    handle.close()
            return messages[0].message_id

        raise TelegramError("Неизвестный тип контента")

    async def _send_single_media(self, media, caption: str | None):
        handle = open(media.file_path, "rb")
        try:
            fallback_caption = caption if caption is not None else self._escape_text(media.caption)
            input_media = self._build_input_media(media.type, handle, fallback_caption)
            if isinstance(input_media, InputMediaPhoto):
                message = await self.bot.send_photo(
                    chat_id=self.settings.target_channel,
                    photo=input_media.media,
                    caption=input_media.caption,
                    parse_mode=ParseMode.HTML,
                )
            elif isinstance(input_media, InputMediaVideo):
                message = await self.bot.send_video(
                    chat_id=self.settings.target_channel,
                    video=input_media.media,
                    caption=input_media.caption,
                    parse_mode=ParseMode.HTML,
                )
            else:
                message = await self.bot.send_document(
                    chat_id=self.settings.target_channel,
                    document=input_media.media,
                    caption=input_media.caption,
                    parse_mode=ParseMode.HTML,
                )
            return message
        finally:
            handle.close()

    def _build_input_media(self, media_type: str, handle, caption: str | None):
        if media_type == "photo":
            return InputMediaPhoto(handle, caption=caption, parse_mode=ParseMode.HTML)
        if media_type == "video":
            return InputMediaVideo(handle, caption=caption, parse_mode=ParseMode.HTML)
        return InputMediaDocument(handle, caption=caption, parse_mode=ParseMode.HTML)
