# Stage 1 — build Vite app
FROM node:18-alpine AS builder
WORKDIR /app
COPY backrooms/package*.json ./
RUN npm ci --ignore-scripts
COPY backrooms/ .
RUN npm run build

# Stage 2 — serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Use template so nginx substitutes $PORT at startup (set by deployment platforms)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV PORT=8080
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
