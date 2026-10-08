# One image, two roles (doctrine ARCHITECTURE_APP §9): the web process (the default command,
# migrations first) and the worker (`pnpm worker`). The @kete/* packages come from GitHub Packages:
# the build receives NODE_AUTH_TOKEN as a secret, never as a layer.

FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=node_auth_token,env=NODE_AUTH_TOKEN \
  pnpm config set "//npm.pkg.github.com/:_authToken" "$NODE_AUTH_TOKEN" \
  && pnpm install --frozen-lockfile \
  && pnpm config delete "//npm.pkg.github.com/:_authToken"
COPY . .
RUN pnpm build

FROM node:22.14.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@11.25.0 && groupadd --system kete && useradd --system --gid kete --home-dir /app kete
COPY --from=build --chown=kete:kete /app ./
USER kete
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
