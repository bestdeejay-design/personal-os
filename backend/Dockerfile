FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

ENV PORT=8080
ENV DATA_DIR=/data/uploads

VOLUME ["/data"]

EXPOSE 8080

CMD ["npm", "start"]
