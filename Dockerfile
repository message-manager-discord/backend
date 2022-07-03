# syntax = docker/dockerfile:1.2
FROM node:17-buster
# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run generate
RUN npm run build:production 

RUN --mount=type=secret,id=sentry_auth_token --mount=type=secret,id=sentry_org --mount=type=secret,id=sentry_project --mount=type=secret,id=sentry_version \
    npx -y @sentry/cli releases new $(cat /run/secrets/sentry_version) --org $(cat /run/secrets/sentry_org) \
    --project $(cat /run/secrets/sentry_project) --auth-token $(cat /run/secrets/sentry_auth_token)
RUN --mount=type=secret,id=sentry_auth_token --mount=type=secret,id=sentry_org --mount=type=secret,id=sentry_project --mount=type=secret,id=sentry_version \
    npx -y @sentry/cli releases files $(cat /run/secrets/sentry_version) upload-sourcemaps --ext map --ext js --ext ts ./dist \
    --org $(cat /run/secrets/sentry_org) \
    --project $(cat /run/secrets/sentry_project) --auth-token $(cat /run/secrets/sentry_auth_token)
RUN  --mount=type=secret,id=sentry_auth_token --mount=type=secret,id=sentry_org --mount=type=secret,id=sentry_project --mount=type=secret,id=sentry_version \
    npx -y @sentry/cli releases set-commits $(cat /run/secrets/sentry_version) --auto --org $(cat /run/secrets/sentry_org) \
    --project $(cat /run/secrets/sentry_project) --auth-token $(cat /run/secrets/sentry_auth_token)
RUN npx -y @sentry/cli releases finalize $(cat /run/secrets/sentry_version) --org $(cat /run/secrets/sentry_org) \
    --project $(cat /run/secrets/sentry_project) --auth-token $(cat /run/secrets/sentry_auth_token)


CMD [ "npm", "run", "start" ]