# syntax=docker/dockerfile:1.7
# Build context: repository root. One image serves three roles: api, worker, migrate.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @nook/api...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @nook/contracts build && pnpm --filter @nook/api build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm --filter @nook/api deploy --legacy --prod /out \
 && cp -r apps/api/dist apps/api/prisma apps/api/prisma.config.ts /out/ \
 # Legacy deploy symlinks workspace packages back into /repo; vendor the built package instead.
 && rm /out/node_modules/@nook/contracts \
 && mkdir -p /out/node_modules/@nook/contracts \
 && cp -r packages/contracts/package.json packages/contracts/dist /out/node_modules/@nook/contracts/

# Migrations and the demo seed need dev dependencies (Prisma CLI, tsx), so they run from the build stage.
# The seed is idempotent, so it runs on every start.
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/tsx prisma/seed.ts"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
