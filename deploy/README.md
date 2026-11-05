# Deployment

The client runs on Firebase Hosting at https://tryrefloor.web.app. The API runs on a VPS, with Caddy providing HTTPS at https://refloor.144-91-113-54.sslip.io.

## Backend

Build the workspace with Node.js 24 and pnpm 12.3.4. The Docker image uses the compiled server and shared packages.

```sh
pnpm install --frozen-lockfile
pnpm build
docker build -f deploy/Dockerfile -t refloor-api:RELEASE .
```

Keep production configuration in `/opt/refloor/shared/server.env`, readable only by the server administrator. Set `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3001`, `TRUST_PROXY=true`, the MongoDB URI, the OpenAI key and the exact client origins. The allowed client origins are `https://tryrefloor.web.app` and `https://tryrefloor.firebaseapp.com`.

The Compose configuration also reads `/opt/refloor/shared/compose.env` for `MONGO_ROOT_PASSWORD` and `MONGO_APP_PASSWORD`. Use separate random passwords. Store the MongoDB replica-set key at `/opt/refloor/shared/mongo-key`, owned by UID 999 with mode 0400. MongoDB persists its database in `/opt/refloor/shared/mongo`.

Create the `refloor-edge` Docker network and attach Caddy to it. Start MongoDB first. Initialize its `refloor-rs` replica set with member `mongo:27017`, then create a `refloor` database user with the `readWrite` role on the `refloor` database. Set the API's MongoDB URI to use that user, `authSource=refloor` and `replicaSet=refloor-rs`.

After initialization, start the API with the matching release tag.

```sh
REFLOOR_RELEASE=RELEASE docker compose --env-file /opt/refloor/shared/compose.env -f deploy/compose.yaml up -d
```

Add the site block from `deploy/Caddyfile` to Caddy's configuration. Validate the configuration before reloading it. Confirm that `/api/health` returns `{"ready":true}` over public HTTPS.

Run one API instance. Live collaboration currently keeps presence and event delivery in that process.

## Client

Build with the public API origin, then deploy Hosting only.

```sh
VITE_REFLOOR_API_URL=https://refloor.144-91-113-54.sslip.io pnpm --filter @refloor/client build
firebase deploy --only hosting --project tryrefloor
```

The browser uses an origin-scoped session token for the separate API, including its live connection. It does not depend on third-party cookies. The OpenAI key stays on the VPS.

Verify a prepared house, generation, a chat edit, reload recovery and collaboration from two browser sessions after deployment.
