# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
RUN npm i -g turbo@2
COPY . .
RUN turbo prune @greenroom/api --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
COPY turbo.json tsconfig.base.json ./
RUN pnpm exec turbo run build --filter=@greenroom/api

FROM base AS deps
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=deps /repo/ .
COPY --from=builder /repo/apps/api/dist apps/api/dist
COPY --from=builder /repo/packages/db/dist packages/db/dist
COPY --from=builder /repo/packages/db/migrations packages/db/migrations
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
