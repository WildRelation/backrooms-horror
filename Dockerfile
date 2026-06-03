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
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
