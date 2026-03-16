# ── Stage 1: build ────────────────────────────────────────────────────────────
# Install all dependencies (including devDependencies) and compile TypeScript.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────────
# Copy only the compiled output and production dependencies.
# Result is a lean image with no TypeScript compiler, Jest, ESLint, etc.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Create uploads directory so multer has somewhere to write without touching
# the image layer (mount a volume here in production).
RUN mkdir -p uploads

CMD ["node", "dist/main.js"]
