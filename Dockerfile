# Build assets once; keep development secrets outside the build context.
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# MoneyFlow API (Bun/Elysia) and LINE webhook gateway share this runtime.
FROM oven/bun:1.3 AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/src/validation.ts ./src/validation.ts
EXPOSE 3011 3061 3012
CMD ["bun","server/index.ts"]

# Static SPA frontend with navigation fallbacks + backend proxy.
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
