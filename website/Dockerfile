FROM node:24-bookworm-slim AS build
WORKDIR /service
COPY package*.json ./
RUN npm ci
COPY . .
ARG API_URL=http://api:4100
ARG NEXT_PUBLIC_SOCKET_URL
ARG SITE_URL
ENV API_URL=$API_URL NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL SITE_URL=$SITE_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:24-bookworm-slim
WORKDIR /service
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3100
COPY --from=build --chown=node:node /service/.next/standalone ./
COPY --from=build --chown=node:node /service/.next/static ./.next/static
USER node
EXPOSE 3100
CMD ["node","server.js"]
