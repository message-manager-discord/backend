FROM node:17-buster
# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run generate
RUN npm run build:production 


ARG SENTRY_VERSION
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN



RUN echo '$SENTRY_AUTH_TOKEN'

RUN npx -y @sentry/cli releases new $SENTRY_VERSION --org $SENTRY_ORG --project $SENTRY_PROJECT --auth-token $SENTRY_AUTH_TOKEN
RUN npx -y @sentry/cli releases files $SENTRY_VERSION upload-sourcemaps --ext map --ext js --ext ts ./dist --org $SENTRY_ORG --project $SENTRY_PROJECT --auth-token $SENTRY_AUTH_TOKEN
RUN npx -y @sentry/cli releases set-commits $SENTRY_VERSION --auto --org $SENTRY_ORG --project $SENTRY_PROJECT --auth-token $SENTRY_AUTH_TOKEN
RUN npx -y @sentry/cli releases finalize $SENTRY_VERSION --org $SENTRY_ORG --project $SENTRY_PROJECT --auth-token $SENTRY_AUTH_TOKEN


CMD [ "npm", "run", "start" ]