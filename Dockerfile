FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV DEPLOY_TARGET=node
RUN npm run build:node

FROM deps AS prod-deps
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --from=build --chown=node:node /app/.output .output
COPY --from=build --chown=node:node /app/drizzle drizzle
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups
ENV NODE_ENV=production
ENV DEPLOY_TARGET=node
ENV DATABASE_URL=file:./data/prod.db
ENV HOST=0.0.0.0
ENV PORT=3000
VOLUME ["/app/data", "/app/backups"]
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
