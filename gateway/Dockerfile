FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
RUN mkdir -p /var/lib/ternak-review && chown -R node:node /app /var/lib/ternak-review
ENV NODE_ENV=production
ENV WHATSAPP_GATEWAY_DB=/var/lib/ternak-review/whatsapp.db
USER node
VOLUME ["/var/lib/ternak-review"]
CMD ["npm", "start"]
