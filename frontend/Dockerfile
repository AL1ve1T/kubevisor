# syntax=docker/dockerfile:1

# ---- Build the static SPA ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty base URL → the SPA resolves requests against window.location.origin
# (same-origin), so they hit nginx, which proxies /api to the backend. Override
# only if the UI must call a backend on a different origin.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- Serve with nginx ----
FROM nginx:1.27-alpine AS runtime
# The nginx image entrypoint runs envsubst on /etc/nginx/templates/*.template,
# substituting BACKEND_URL (backend Service URL) and NGINX_LOCAL_RESOLVERS (the
# in-container DNS resolver, derived from /etc/resolv.conf). nginx's own runtime
# $variables are not environment variables, so they are left untouched.
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 tells the entrypoint to populate
# NGINX_LOCAL_RESOLVERS from /etc/resolv.conf.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
# In-cluster default; the Helm chart overrides this with the backend Service URL.
ENV BACKEND_URL=http://kubevisor-backend:8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
