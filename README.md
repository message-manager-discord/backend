# Message Manager Backend

Backend service for [message.anothercat.me](https://message.anothercat.me)

## Development

### Prerequisites

Node 17.5 (see .nvmrc)
Postgresql 13 with user with write permissions
Redis with REJSON

### Setup

Run `npm ci` to install directly from `package-lock.json` - if you use `npm install` or `npm i` instead it cannot be guaranteed that the dependencies work.

Set up a `.env` file with the variables from `.env.example` and fill in the values.

For PRISMA_FIELD_ENCRYPTION_KEY see: https://github.com/47ng/prisma-field-encryption#2-setup-your-encryption-key

### Running

Run `npm run dev` to start the development server.

You will need to setup a tunnel or some kind of way to expose the server to discord. I use cloudflare tunnels. The endpoint for the discord interactions is `/interactions`

You will need to have a gateway cache instance also running
[see message-manager-discord/gateway](https://github.com/message-manager-discord/gateway) and [message-manager-discord/redis-discord-cache](https://github.com/message-manager-discord/redis-discord-cache)

### Migrations

Prisma is used for migrations - run `npm run migrate` to migrate the database.

### General overview of important files

.github/workflows - contains github actions for CI config  
prisma - contains prisma schema and migrations  
src - contains the source code  
.env - contains environment variables (do not use .env on production use docker env variables instead)  
.env.example - contains example environment variables  
.eslintrc.js - contains eslint config  
.prettierrc.json - contains prettier config  
.wakatime-project - contains wakatime config  
Dockerfile - contains docker config  
