# -*- coding: utf-8 -*-
"""Настройки бота.

Здесь нужно указать ключи от Telegram и VK, а также ID каналов,
с которыми бот будет работать. Все значения примерные, замените их
своими.
"""

# Данные Telegram API. Их можно получить на https://my.telegram.org
API_ID = 25480516  # ваш API ID
API_HASH = '28efe5dbaed02df8764062c257f8e84f'  # ваш API HASH
BOT_TOKEN = '5261484953:AAEXMEWSxIy1s-gtGZnq7TDwa1K33y6pHaM'  # токен бота

# Каналы и чаты Telegram
SOURCE_CHANNELS = ['@source_channel']  # откуда берём посты
MODERATION_CHAT = '@moderation_chat'  # чат для проверки постов
TARGET_CHANNEL = '@target_channel'  # куда отправляем одобренные посты

# Параметры для работы с VK
VK_TOKEN = 'your_vk_token'  # токен доступа
VK_GROUP_ID = 123456789  # ID группы без знака «-»
VK_API_VERSION = '5.131'  # версия API VK
