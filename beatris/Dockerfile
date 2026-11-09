# spec 0057: the production image for Fly.io. The app has no runtime dependencies; the image runs `npm start` on Node 22,
# with its data on the volume Fly mounts at /data (fly.toml).
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
# the commit this image was built from, reported by /api/health
ARG BEATRIS_BUILD=""
ENV BEATRIS_BUILD=$BEATRIS_BUILD NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
