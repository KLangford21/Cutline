# Cutline runs as a single process: the Express API also serves the built PWA,
# so this image builds the web app and then ships it alongside the server.

# ---- stage 1: build the PWA -------------------------------------------------
FROM node:22-alpine AS web

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ---- stage 2: server production dependencies --------------------------------
FROM node:22-alpine AS deps

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---- stage 3: runtime -------------------------------------------------------
# Node 22 to match the engines constraint in server/package.json.
FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server/package*.json ./server/
COPY server/src ./server/src
# Applied by migrate() on boot.
COPY server/migrations ./server/migrations

# index.js looks for the built PWA at ../../web/dist relative to server/src,
# so the two directories have to keep their repo-relative layout.
COPY --from=web /app/web/dist ./web/dist

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
