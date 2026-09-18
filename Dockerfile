# ---- 前端构建 ----
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- 运行镜像(纯 JS,无原生编译,支持 x86_64 / ARM64) ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data PORT=8866
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=web /src/server/static ./static
VOLUME /app/data
EXPOSE 8866
CMD ["node", "src/index.js"]
