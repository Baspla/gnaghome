FROM oven/bun:1

WORKDIR /app

# 1. Copy the root workspace config, lockfile and ALL package.jsons first (for caching)
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

# 2. Install all dependencies across the monorepo
RUN bun install --frozen-lockfile

# 3. Copy the actual source code for the backend and shared modules
COPY shared/ ./shared/
COPY backend/ ./backend/

# 4. Set the working directory to backend to run your app
WORKDIR /app/backend

EXPOSE 3000
CMD ["bun", "run", "dev"]