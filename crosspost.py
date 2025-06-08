# -*- coding: utf-8 -*-
"""Небольшой бот для перекрёстной публикации сообщений из Telegram в VK.

Схема работы:
1. Бот следит за указанными исходными каналами.
2. Каждое новое сообщение отправляется в чат модерации с кнопками
   "✅" (разрешить) и "❌" (отклонить).
3. При одобрении сообщение пересылается в целевой канал и публикуется в группе VK.
4. Все действия и ошибки записываются в файл ``logs/bot.log``.

Комментарии постарались сделать на простом русском языке для тех, кто
только начинает знакомиться с программированием.
"""

import logging
import os
from typing import Dict

import requests
from telethon import TelegramClient, events, Button

import bot_config as config

# Убеждаемся, что папка для логов существует
os.makedirs('logs', exist_ok=True)
# Настраиваем запись логов: в файл и на экран
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('logs/bot.log'),
        logging.StreamHandler()
    ]
)

# Создаём клиента Telegram. Он подключается с учётными данными бота
client = TelegramClient('crosspost', config.API_ID, config.API_HASH).start(bot_token=config.BOT_TOKEN)

# Здесь будем хранить сообщения, ожидающие модерации
pending_messages: Dict[int, events.NewMessage.Event] = {}


def post_to_vk(message: str) -> None:
    """Простая отправка текста в группу VK."""
    try:
        resp = requests.post(
            'https://api.vk.com/method/wall.post',
            params={
                'owner_id': f"-{config.VK_GROUP_ID}",
                'from_group': 1,
                'message': message,
                'access_token': config.VK_TOKEN,
                'v': config.VK_API_VERSION,
            },
            timeout=10,
        )
        data = resp.json()
        if 'error' in data:
            logging.error('Ошибка VK: %s', data)
        else:
            logging.info('Опубликовано в VK: %s', data)
    except Exception as exc:
        logging.exception('Не удалось отправить в VK: %s', exc)


@client.on(events.NewMessage(chats=config.SOURCE_CHANNELS))
async def handler(event: events.NewMessage.Event) -> None:
    """Отправляем новые сообщения на модерацию."""
    pending_messages[event.message.id] = event.message
    buttons = [
        [
            Button.inline('✅', f'approve_{event.message.id}'.encode()),
            Button.inline('❌', f'reject_{event.message.id}'.encode()),
        ]
    ]
    # Отправляем текст в чат модераторов с кнопками
    await client.send_message(
        config.MODERATION_CHAT,
        event.message.message or 'Прикреплённый файл',
        buttons=buttons
    )
    logging.info('Сообщение %s отправлено на модерацию', event.message.id)


@client.on(events.CallbackQuery)
async def callbacks(event: events.CallbackQuery.Event) -> None:
    """Обрабатываем нажатия на кнопки "✅" и "❌"."""
    data = event.data.decode('utf-8')
    if data.startswith('approve_'):
        msg_id = int(data.split('_')[1])
        message = pending_messages.pop(msg_id, None)
        if message:
            # Пересылаем одобренное сообщение в целевой канал
            await client.forward_messages(config.TARGET_CHANNEL, message)
            # И дублируем его в VK
            post_to_vk(message.message or '')
            await event.respond('Одобрено ✅')
            logging.info('Сообщение %s одобрено', msg_id)
        else:
            await event.respond('Сообщение не найдено')
    elif data.startswith('reject_'):
        msg_id = int(data.split('_')[1])
        pending_messages.pop(msg_id, None)
        await event.respond('Отклонено ❌')
        logging.info('Сообщение %s отклонено', msg_id)


def main() -> None:
    """Запускаем клиента и ждём событий."""
    logging.info('Бот запущен')
    client.run_until_disconnected()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        logging.info('Бот остановлен пользователем')
