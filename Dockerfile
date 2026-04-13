# ── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 needs python/make for native binaries
RUN apk add --no-cache python3 make g++

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source
COPY . .

# Create the data directory for the persistent SQLite volume
RUN mkdir -p /data

# Ensure the DB is stored on the volume at runtime
ENV DB_PATH=/data/phantom.db
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
