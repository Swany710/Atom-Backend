# UPDATED: NestJS Backend Dockerfile for Railway Deployment
# Multi-stage build for optimal image size

# Stage 1: Build stage
FROM node:20-slim AS builder

# Install system dependencies required for building
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy source code
COPY . .

# Build the application, then prune dev dependencies for production
RUN npm run build && npm prune --omit=dev

# Stage 2: Production stage
FROM node:20-slim

# Install runtime dependencies (ffmpeg for audio transcription)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create non-root user for security
RUN useradd -m -u 1001 nestjs && \
    chown -R nestjs:nestjs /app

USER nestjs

# Expose application port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
