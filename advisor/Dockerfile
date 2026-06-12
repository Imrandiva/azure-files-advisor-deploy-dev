FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

# App source.
COPY advisor.mjs ui.mjs azusage.mjs server.mjs ./

ENV PORT=8080
EXPOSE 8080

# Lightweight healthcheck against the /healthz endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "server.mjs"]
