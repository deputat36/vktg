# vktg Crossposter

A simple Telegram to VK crossposting bot.

## Setup

1. Install Python dependencies:

```bash
pip install telethon requests
```

2. Edit `bot_config.py` and fill in your Telegram API credentials, bot token, channel IDs, and VK parameters.

3. Run the bot:

```bash
python crosspost.py
```

Windows users can double-click `run.bat`.

## Files

- `crosspost.py` – main bot script that polls Telegram channels, sends new posts for moderation, and on approval forwards to the target channel and VK.
- `bot_config.py` – configuration with tokens and IDs.
- `run.bat` – helper script to start the bot on Windows.
- `logs/` – directory where `bot.log` is written.
