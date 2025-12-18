# N8N Dockerfile for Railway Deployment
FROM n8nio/n8n:latest

# Set working directory
WORKDIR /home/node

# Install additional dependencies if needed
USER root

# Install curl for health checks
RUN apk add --no-cache curl

# Create necessary directories with proper permissions
RUN mkdir -p /home/node/.n8n && \
    chown -R node:node /home/node

# Switch back to node user for security
USER node

# Set environment variables
ENV N8N_PORT=5678
ENV N8N_PROTOCOL=https
ENV WEBHOOK_URL=${N8N_WEBHOOK_URL}
ENV N8N_HOST=${RAILWAY_PUBLIC_DOMAIN}
ENV GENERIC_TIMEZONE=America/Chicago

# Expose port
EXPOSE 5678

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5678/healthz || exit 1

# Use ENTRYPOINT instead of CMD so Railway cannot override it
ENTRYPOINT ["n8n"]