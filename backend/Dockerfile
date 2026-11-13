FROM node:24-bookworm-slim AS build
WORKDIR /service
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY tests ./tests
RUN npm run build && npm prune --omit=dev
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
WORKDIR /service
COPY --from=build --chown=node:node /service/node_modules ./node_modules
COPY --from=build --chown=node:node /service/dist ./dist
COPY --chown=node:node package*.json ./
COPY --chown=node:node migrations ./migrations
USER node
EXPOSE 4100
CMD ["node","dist/src/main.js"]
