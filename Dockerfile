FROM node:22-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Full install (not --omit=dev): the worker runs via tsx, a dev dependency,
# and this one image serves the api, worker and migrate services.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Keep the worker's tsx runtime and Prisma CLI available while dropping root
# privileges for the API, worker, and migration containers.
COPY --from=builder --chown=node:node /app /app

USER node
EXPOSE 3000
CMD ["npm", "start"]
