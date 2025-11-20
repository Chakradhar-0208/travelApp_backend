FROM node:25

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ENV PORT=5000

EXPOSE 5000

CMD [ "node", "." ]