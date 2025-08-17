FROM node:16-alpine

ARG NPM_AUTH_TOKEN

RUN apk --no-cache add git

COPY package*.json ./

COPY .npmrc ./

# install project dependencies
RUN npm install 

COPY . .

ENV NPM_AUTH_TOKEN=${NPM_AUTH_TOKEN}

EXPOSE 9000

CMD npm run dev