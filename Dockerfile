FROM node:16.13.0-alpine3.11

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn --ignore-scripts

COPY . .
RUN yarn && \ 
  yarn build

ENTRYPOINT ["yarn", "start"]
