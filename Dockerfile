FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_CLINIC_PHONE_TEL
ARG VITE_CLINIC_PHONE_DISPLAY
ENV VITE_CLINIC_PHONE_TEL=$VITE_CLINIC_PHONE_TEL \
    VITE_CLINIC_PHONE_DISPLAY=$VITE_CLINIC_PHONE_DISPLAY

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node migrations ./migrations

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server/index.js"]
