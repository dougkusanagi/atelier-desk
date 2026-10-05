FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.30.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile && pnpm build

FROM build AS api
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN pnpm exec playwright install --with-deps chromium && chown -R node:node /opt/browsers
RUN mkdir -p /data && chown node:node /data
WORKDIR /app/apps/api
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]

FROM nginx:1.28-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
