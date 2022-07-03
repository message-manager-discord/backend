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

RUN --mount=type=secret,id=sentry_auth_token \
  cat /run/secrets/sentry_auth_token



ARG SENTRY_VERSION
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN

RUN echo $SENTRY_AUTH_TOKEN
RUN echo $SENTRY_ORG
RUN echo $SENTRY_PROJECT
RUN echo $SENTRY_VERSION

RUN --mount=type=secret,id=sentry_auth_token --mount=type=secret,id=sentry_org --mount=type=secret,id=sentry_project --mount=type=secret,id=sentry_version npx -y @sentry/cli releases new $(cat /run/secrets/sentry_version) --org $(cat /run/secrets/sentry_org) --project $(cat /run/secrets/sentry_project) --auth-token $(cat /run/secrets/sentry_auth_token)
RUN npx -y @sentry/cli releases files $SENTRY_VERSION upload-sourcemaps --ext map --ext js --ext ts ./dist --org $SENTRY_ORG --project $SENTRY_PROJECT --auth-token $SENTRY_AUTH_TOKEN
RUN npx -y @sentry/cli releases set-commits $SENTRY_VERSION --auto --org $SENTRY_ORG --project $SENTRY_PROJECT --auth-token $SENTRY_AUTH_TOKEN
RUN npx -y @sentry/cli releases finalize $SENTRY_VERSION --org $SENTRY_ORG --project $SENTRY_PROJECT --auth-token $SENTRY_AUTH_TOKEN


CMD [ "npm", "run", "start" ]