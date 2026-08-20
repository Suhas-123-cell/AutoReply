FROM node:22-alpine

WORKDIR /app

# Full install (not --omit=dev): `npm run worker` runs via tsx, a dev
# dependency, so it has to be present at runtime — this mirrors how the
# worker already runs locally, just containerized.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# No HTTP port: this is a long-running BullMQ consumer, not a web server.
CMD ["npm", "run", "worker"]
