# Message Manager Gateway

A dockerized implementation of https://github.com/message-manager-discord/redis-discord-cache

## Environment Variables

- `REDIS_PORT`: Port REJSON instance is on.
- `REDIS_HOST`: Host REJSON instance is on.
- `DISCORD_TOKEN`: Discord bot token.
- `LOGGING_LEVEL`: Logging level, one of the npm levels found [here](https://github.com/winstonjs/winston#logging-levels). Defaults to `info`.
