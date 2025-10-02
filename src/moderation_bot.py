"""Бот модерации на python-telegram-bot."""
from __future__ import annotations

import asyncio
import html
import logging
from contextlib import suppress
from typing import Callable, Optional

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.error import BadRequest
from telegram.ext import (
    AIORateLimiter,
    Application,
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from .media import QueuePayload
from .storage import QueueItem, Storage

logger = logging.getLogger(__name__)

EDIT_CAPTION = 1


class ModerationBot:
    def __init__(
        self,
        token: str,
        storage: Storage,
        moderation_chat: str,
        on_approve: Callable[[QueueItem], asyncio.Future | None],
        on_reject: Callable[[QueueItem], asyncio.Future | None],
        on_retry: Callable[[QueueItem], asyncio.Future | None],
    ) -> None:
        self.token = token
        self.storage = storage
        self.moderation_chat = moderation_chat
        self.application: Application = (
            ApplicationBuilder()
            .token(token)
            .rate_limiter(AIORateLimiter())
            .concurrent_updates(True)
            .build()
        )
        self.on_approve = on_approve
        self.on_reject = on_reject
        self.on_retry = on_retry
        self._register_handlers()

    def _register_handlers(self) -> None:
        self.application.add_handler(CommandHandler("ping", self.handle_ping))
        self.application.add_handler(CommandHandler("status", self.handle_status))
        self.application.add_handler(CallbackQueryHandler(self.handle_callback, pattern="^(approve|reject|retry):"))

        edit_conv = ConversationHandler(
            entry_points=[CallbackQueryHandler(self.start_edit_caption, pattern="^edit:\d+$")],
            states={
                EDIT_CAPTION: [MessageHandler(filters.TEXT & ~filters.COMMAND, self.finish_edit_caption)],
            },
            fallbacks=[CommandHandler("cancel", self.cancel_edit_caption)],
            allow_reentry=True,
        )
        self.application.add_handler(edit_conv)

    async def start(self) -> None:
        await self.application.initialize()
        await self.application.start()
        logger.info("Бот модерации запущен")

    async def stop(self) -> None:
        await self.application.stop()
        await self.application.shutdown()
        logger.info("Бот модерации остановлен")

    async def refresh_queue_item(self, item: QueueItem | int) -> None:
        if isinstance(item, int):
            queue_item = self.storage.get_queue_item(item)
        else:
            queue_item = item
        if not queue_item or not queue_item.moderation_message_id:
            return
        payload = QueuePayload.from_dict(queue_item.payload)
        text = self._format_preview(queue_item, payload)
        keyboard = self._build_keyboard(queue_item)
        try:
            await self.application.bot.edit_message_text(
                chat_id=queue_item.moderation_chat_id,
                message_id=queue_item.moderation_message_id,
                text=text,
                parse_mode=ParseMode.HTML,
                reply_markup=keyboard,
                disable_web_page_preview=True,
            )
        except BadRequest as exc:
            if "message is not modified" in str(exc).lower():
                return
            logger.warning("Не удалось обновить карточку модерации: %s", exc)

    async def send_queue_item(self, item: QueueItem) -> None:
        payload = QueuePayload.from_dict(item.payload)
        text = self._format_preview(item, payload)
        keyboard = self._build_keyboard(item)
        message = await self.application.bot.send_message(
            chat_id=self.moderation_chat,
            text=text,
            parse_mode=ParseMode.HTML,
            reply_markup=keyboard,
            disable_web_page_preview=True,
        )
        self.storage.update_status(
            item.id,
            status="pending",
            moderation_message_id=message.message_id,
            moderation_chat_id=message.chat_id,
        )

    def _build_keyboard(self, item: QueueItem) -> InlineKeyboardMarkup:
        buttons = [
            [
                InlineKeyboardButton("✅ Одобрить", callback_data=f"approve:{item.id}"),
                InlineKeyboardButton("⛔ Отклонить", callback_data=f"reject:{item.id}"),
            ],
        ]
        actions = [InlineKeyboardButton("✏️ Правка текста", callback_data=f"edit:{item.id}")]
        if item.status == "failed" or item.error:
            actions.append(InlineKeyboardButton("🔁 Повтор", callback_data=f"retry:{item.id}"))
        buttons.append(actions)
        payload = QueuePayload.from_dict(item.payload)
        if payload.source_link:
            buttons.append([InlineKeyboardButton("🔗 Открыть источник", url=payload.source_link)])
        return InlineKeyboardMarkup(buttons)

    def _format_preview(self, item: QueueItem, payload: QueuePayload) -> str:
        lines = [
            f"<b>Источник:</b> {html.escape(item.source_name)}",
            f"<b>ID исходного сообщения:</b> {item.source_message_id}",
            f"<b>Тип:</b> {payload.type}",
            f"<b>Статус:</b> {item.status}",
        ]
        if payload.media:
            lines.append(f"<b>Медиа:</b> {len(payload.media)} файл(ов)")
        if payload.text:
            preview = payload.text.strip()
            if len(preview) > 500:
                preview = preview[:500] + "…"
            lines.append("<b>Текст:</b>")
            lines.append(html.escape(preview))
        elif payload.media and payload.media[0].caption:
            caption = payload.media[0].caption or ""
            if len(caption) > 500:
                caption = caption[:500] + "…"
            lines.append("<b>Подпись:</b>")
            lines.append(html.escape(caption))
        if item.caption_override:
            lines.append("<b>Правка модератора:</b>")
            lines.append(html.escape(item.caption_override))
        if item.error:
            lines.append(f"<b>Ошибка публикации:</b> {html.escape(item.error)}")
        return "\n".join(lines)

    async def handle_ping(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await update.message.reply_text("Я на связи ✅")

    async def handle_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        pending = self.storage.list_queue_items_by_status(["pending", "approved"])
        failed = self.storage.list_queue_items_by_status(["failed"])
        published = self.storage.list_queue_items_by_status(["published"])
        await update.message.reply_text(
            "\n".join(
                [
                    f"В ожидании: {len(pending)}",
                    f"С ошибкой: {len(failed)}",
                    f"Опубликовано: {len(published)}",
                ]
            )
        )

    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not update.callback_query:
            return
        query = update.callback_query
        await query.answer()
        data = query.data or ""
        if data.startswith("approve:"):
            await self._approve_item(int(data.split(":")[1]), query)
        elif data.startswith("reject:"):
            await self._reject_item(int(data.split(":")[1]), query)
        elif data.startswith("retry:"):
            await self._retry_item(int(data.split(":")[1]), query)

    async def _approve_item(self, item_id: int, query) -> None:
        item = self.storage.get_queue_item(item_id)
        if not item:
            await query.edit_message_text("Элемент не найден")
            return
        self.storage.update_status(item_id, "approved", retry_count=0)
        updated_item = self.storage.get_queue_item(item_id)
        await self.refresh_queue_item(updated_item)
        callback_result = self.on_approve(updated_item or item)
        if asyncio.iscoroutine(callback_result):
            await callback_result
        await query.message.reply_text("Одобрено. Публикация запущена.")

    async def _reject_item(self, item_id: int, query) -> None:
        item = self.storage.get_queue_item(item_id)
        if not item:
            await query.edit_message_text("Элемент не найден")
            return
        self.storage.update_status(item_id, "rejected", retry_count=0)
        updated_item = self.storage.get_queue_item(item_id)
        await self.refresh_queue_item(updated_item)
        callback_result = self.on_reject(updated_item or item)
        if asyncio.iscoroutine(callback_result):
            await callback_result
        await query.message.reply_text("Отклонено. В очередь не вернётся.")

    async def _retry_item(self, item_id: int, query) -> None:
        item = self.storage.get_queue_item(item_id)
        if not item:
            await query.edit_message_text("Элемент не найден")
            return
        self.storage.update_status(item_id, "approved", error="", retry_count=0)
        updated_item = self.storage.get_queue_item(item_id)
        await self.refresh_queue_item(updated_item)
        callback_result = self.on_retry(updated_item or item)
        if asyncio.iscoroutine(callback_result):
            await callback_result
        await query.message.reply_text("Задача на публикацию перезапущена.")

    async def start_edit_caption(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        if not query:
            return ConversationHandler.END
        await query.answer()
        item_id = int(query.data.split(":")[1])
        context.user_data["edit_item_id"] = item_id
        await query.message.reply_text("Отправьте новый текст для публикации. /cancel — отмена")
        return EDIT_CAPTION

    async def finish_edit_caption(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        item_id = context.user_data.get("edit_item_id")
        if not item_id:
            await update.message.reply_text("Не удалось определить элемент очереди")
            return ConversationHandler.END
        text = update.message.text
        self.storage.update_status(item_id, status="pending", caption_override=text)
        await self.refresh_queue_item(item_id)
        await update.message.reply_text("Текст сохранён. Используется при публикации.")
        return ConversationHandler.END

    async def cancel_edit_caption(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        with suppress(KeyError):
            context.user_data.pop("edit_item_id")
        await update.message.reply_text("Отменено")
        return ConversationHandler.END
