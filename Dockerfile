FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html server.mjs ./
COPY src ./src
COPY backend ./backend
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5180
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./
COPY --from=build /app/backend ./backend
COPY --from=build /app/src/analytics.js ./src/analytics.js
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 5180
CMD ["node", "server.mjs"]
