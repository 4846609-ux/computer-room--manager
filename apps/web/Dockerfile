# Build & run the NestJS API in a pnpm monorepo (single-stage: keeps the
# pnpm-linked node_modules so the generated Prisma client resolves at runtime).
FROM node:20-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @crm/database generate \
 && pnpm --filter @crm/shared build \
 && pnpm --filter @crm/database build \
 && pnpm --filter @crm/api build

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @crm/database exec prisma db push --skip-generate --accept-data-loss || true; node dist/main.js"]
