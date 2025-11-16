
FROM node:lts-alpine AS base

FROM base AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/redis-client/package.json ./packages/redis-client/
COPY packages/types/package.json ./packages/types/
COPY services/api-gateway/package.json ./services/api-gateway/
COPY services/data-aggregator/package.json ./services/data-aggregator/
COPY services/websocket-server/package.json ./services/websocket-server/

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --production


FROM base AS api-gateway
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/services/api-gateway/ ./services/api-gateway/

EXPOSE 3000
CMD ["node", "services/api-gateway/dist/index.js"]

FROM base AS aggregator-producer
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/services/data-aggregator/ ./services/data-aggregator/

CMD ["node", "services/data-aggregator/dist/producer.js"]


FROM base AS aggregator-worker
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/services/data-aggregator/ ./services/data-aggregator/

CMD ["node", "services/data-aggregator/dist/worker.js"]

FROM base AS websocket-server
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/services/websocket-server/ ./services/websocket-server/

EXPOSE 8080
CMD ["node", "services/websocket-server/dist/index.js"]