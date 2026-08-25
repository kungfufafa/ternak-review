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

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.output .output
COPY --from=build /app/drizzle drizzle
ENV NODE_ENV=production
ENV DEPLOY_TARGET=node
ENV DATABASE_URL=file:./data/prod.db
ENV HOST=0.0.0.0
ENV PORT=3000
VOLUME ["/app/data", "/app/backups"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
