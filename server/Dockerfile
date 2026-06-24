# Minimal production image for the read-only report proxy (Cloud Run).
# Cloud Run injects PORT (default 8080); the server reads process.env.PORT.
# Auth uses the attached service account via ADC (metadata server) — no key file.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
