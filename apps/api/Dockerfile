# Multi-stage build for the NestJS API in a pnpm monorepo.
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# --- deps: install with the lockfile for reproducibility ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# --- build: generate Prisma client and compile ---
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @crm/database generate
RUN pnpm --filter @crm/api build
# Prune dev dependencies for a slimmer runtime.
RUN pnpm --filter @crm/api --prod deploy /app

# --- runtime ---
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages/database/prisma ./prisma
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
EXPOSE 4000
CMD ["node", "dist/main.js"]
