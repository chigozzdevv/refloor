FROM node:24-bookworm-slim

RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/scene/package.json packages/scene/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/catalogue/package.json packages/catalogue/package.json
COPY server/package.json server/package.json
RUN pnpm install --prod --frozen-lockfile --filter @refloor/server... --ignore-scripts

COPY packages/scene/dist packages/scene/dist
COPY packages/engine/dist packages/engine/dist
COPY packages/catalogue/dist packages/catalogue/dist
COPY server/dist server/dist

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
USER node
EXPOSE 3001
CMD ["node", "server/dist/server.js"]
