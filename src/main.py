"""Точка входа сервиса."""
from __future__ import annotations

import asyncio
import logging
import os
import signal
from contextlib import suppress
from pathlib import Path

from dotenv import load_dotenv
from telethon import TelegramClient
from telegram import Bot

from .config import load_settings_from_env
from .logging_config import setup_logging
from .moderation_bot import ModerationBot
from .publisher import Publisher
from .source_watcher import SourceWatcher
from .storage import Storage

logger = logging.getLogger(__name__)


async def main() -> None:
    load_dotenv()
    settings = load_settings_from_env()
    setup_logging(settings.logging)

    pid_file = Path("service.pid")
    pid_file.write_text(str(os.getpid()), encoding="utf-8")

    storage = Storage(settings.database_path)
    storage.cleanup_dedup()
    bot_token = os.getenv("BOT_TOKEN")
    api_id = os.getenv("API_ID")
    api_hash = os.getenv("API_HASH")
    session_name = os.getenv("SESSION_NAME", "vktg_session")
    if not bot_token or not api_id or not api_hash:
        raise RuntimeError("Не заданы BOT_TOKEN, API_ID или API_HASH")

    client = TelegramClient(session_name, int(api_id), api_hash)
    watcher = SourceWatcher(settings, storage, client, settings.media_storage_path)

    publisher = Publisher(Bot(bot_token), storage, settings)

    async def on_approve(item):
        logger.info("Элемент %s одобрен", item.id)

    async def on_reject(item):
        logger.info("Элемент %s отклонён", item.id)

    async def on_retry(item):
        logger.info("Повтор публикации для %s", item.id)

    moderation_bot = ModerationBot(
        token=bot_token,
        storage=storage,
        moderation_chat=settings.moderation_chat,
        on_approve=on_approve,
        on_reject=on_reject,
        on_retry=on_retry,
    )

    publisher.set_status_callback(moderation_bot.refresh_queue_item)
    watcher.register_callback(lambda item: moderation_bot.send_queue_item(item))

    await moderation_bot.start()
    publisher.start()
    await watcher.start()

    await _send_pending_to_moderation(moderation_bot, storage)

    stop_event = asyncio.Event()

    def _signal_handler(*_):
        logger.info("Получен сигнал остановки")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, _signal_handler)

    await stop_event.wait()

    await watcher.stop()
    await publisher.stop()
    await moderation_bot.stop()
    storage.close()
    with suppress(FileNotFoundError):
        pid_file.unlink()


async def _send_pending_to_moderation(bot: ModerationBot, storage: Storage) -> None:
    existing = storage.list_queue_items_by_status(["new", "pending", "failed"])
    for item in existing:
        if item.moderation_message_id:
            continue
        await bot.send_queue_item(item)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
