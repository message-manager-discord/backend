FROM node:17-buster
# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run generate
RUN npm run build

CMD [ "npm", "run", "start" ]