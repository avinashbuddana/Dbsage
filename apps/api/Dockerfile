FROM node:24.20.0-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @schemaiq/api... build
RUN pnpm --filter @schemaiq/api deploy --prod /prod/api

FROM node:24.20.0-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./

USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
