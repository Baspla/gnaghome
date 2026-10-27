# === STAGE 1: Build Stage ===
FROM oven/bun:1 AS builder

WORKDIR /app

# 1. Copy root, lockfile and ALL workspace configurations
COPY package.json bun.lock ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json frontend/svelte.config.js frontend/vite.config.ts ./frontend/

# 2. Run bun install from the ROOT so workspace mapping works
RUN bun install --frozen-lockfile

# 3. Copy source files
COPY shared/ ./shared/
COPY frontend/ ./frontend/

# 4. Build the frontend app
WORKDIR /app/frontend
ENV NODE_ENV=production
RUN bun run build


# === STAGE 2: Production Runner Stage ===
FROM oven/bun:1-slim AS runner

WORKDIR /app

# 1. Copy ALL workspace configurations and lockfile so Bun knows the monorepo map
COPY package.json bun.lock ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# 2. Copy the actual built code and shared source into their proper workspace locations
COPY --from=builder /app/frontend/build ./frontend/build
COPY --from=builder /app/shared/ ./shared/

# 3. Install only production dependencies for the frontend workspace
RUN bun install --production --frozen-lockfile --ignore-scripts --filter @gnaghome/frontend

# 4. Set the execution directory directly to the frontend workspace
WORKDIR /app/frontend

ENV HOST=0.0.0.0
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Run the bundle from within the workspace folder
CMD ["bun", "./build/index.js"]