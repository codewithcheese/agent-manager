# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./

# Copy database schema and config for migrations
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/lib/server/db ./src/lib/server/db

# Copy node_modules from builder (includes all deps including drizzle-kit)
COPY --from=builder /app/node_modules ./node_modules

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose the port
EXPOSE 3000

# Start with entrypoint that runs migrations then starts app
CMD ["./docker-entrypoint.sh"]
