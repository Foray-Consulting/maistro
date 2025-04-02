# Build stage
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./

# Install dependencies (including Goose)
RUN npm ci

# Copy all files
COPY . .

# Production stage
FROM --platform=$TARGETPLATFORM node:20-alpine
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

# Copy application files
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public

# Create data directory
RUN mkdir -p /app/data/prompts

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set PATH to include node_modules/.bin
ENV PATH="/app/node_modules/.bin:${PATH}"

# Expose port
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]
