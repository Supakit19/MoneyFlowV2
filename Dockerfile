# Build assets once; keep development secrets outside the build context.
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Public JSR registry only: never copy a developer's npm credentials into images.
RUN printf '%s\n' '@jsr:registry=https://npm.jsr.io' > integrations/linejs/.npmrc
# Install the unofficial LINEJS worker separately; it must run under Node 24.
RUN cd integrations/linejs && bun install --frozen-lockfile
RUN bun run build

# Hosted LINEJS requires Node 24 HTTP/2 support, not Bun's runtime.
FROM node:24-bookworm-slim AS node_runtime

# MoneyFlow API (Bun/Elysia) and LINE webhook gateway share this runtime.
FROM oven/bun:1.4 AS api
COPY --from=node_runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
# Explicit allowlist: never COPY a developer's LINEJS .env, sessions or logs.
COPY --from=build /app/integrations/linejs/node_modules ./integrations/linejs/node_modules
COPY --from=build /app/integrations/linejs/worker.ts ./integrations/linejs/worker.ts
COPY --from=build /app/integrations/linejs/bank-message-content.ts ./integrations/linejs/bank-message-content.ts
COPY --from=build /app/integrations/linejs/recent-bank-history.ts ./integrations/linejs/recent-bank-history.ts
COPY --from=build /app/integrations/linejs/encrypted-storage.ts ./integrations/linejs/encrypted-storage.ts
COPY --from=build /app/src/validation.ts ./src/validation.ts
# Run the bank-session manager as an unprivileged OS user.
RUN mkdir -p /var/lib/moneyflow-linejs && chown -R bun:bun /var/lib/moneyflow-linejs && chmod 700 /var/lib/moneyflow-linejs
USER bun
EXPOSE 3011 3061 3012
CMD ["bun","server/index.ts"]

# Static SPA frontend with navigation fallbacks + backend proxy.
FROM nginx:stable-alpine AS web
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
