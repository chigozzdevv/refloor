# Deployment

Refloor's client and API deploy separately:

- The client is hosted on Firebase Hosting at `https://tryrefloor.web.app`.
- The API and MongoDB run on a VPS. Caddy provides HTTPS for the API at `https://refloor.144-91-113-54.sslip.io`.

## API on the VPS

### First-time setup

- Store production API settings in `/opt/refloor/shared/server.env`. Set `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3001`, `TRUST_PROXY=true`, the MongoDB URI, and `CLIENT_ORIGINS` to `https://tryrefloor.web.app,https://tryrefloor.firebaseapp.com`.
- Choose one AI provider: OpenAI uses `AI_PROVIDER=openai` and `OPENAI_API_KEY`; Boundless uses `AI_PROVIDER=boundless`, `BOUNDLESS_API_KEY`, and `BOUNDLESS_MODEL=openai/gpt-6-luna`.
- Store `MONGO_ROOT_PASSWORD` and `MONGO_APP_PASSWORD` in `/opt/refloor/shared/compose.env` as separate strong passwords. Keep the environment files readable only by the server administrator.
- Store the MongoDB replica-set key at `/opt/refloor/shared/mongo-key`, owned by UID 999 with mode 0400. MongoDB data persists in `/opt/refloor/shared/mongo`.
- Create the `refloor-edge` Docker network and attach Caddy to it. Initialize MongoDB as replica set `refloor-rs` with member `mongo:27017`, then create a `refloor` database user with `readWrite` access to the `refloor` database. Set `MONGODB_URI` to use that user, `authSource=refloor`, and `replicaSet=refloor-rs`.
- Add the site block from `deploy/Caddyfile` to Caddy's configuration, validate it, then reload Caddy.

### Release the API

Build the workspace with Node.js 24 and pnpm 12.3.4:

```sh
pnpm install --frozen-lockfile
pnpm build
docker build -f deploy/Dockerfile -t refloor-api:RELEASE .
```

Make the image available on the VPS with the same release tag before starting Compose. On the VPS, run:

```sh
REFLOOR_RELEASE=RELEASE docker compose --env-file /opt/refloor/shared/compose.env -f deploy/compose.yaml up -d
```

Keep one API instance; live collaboration keeps presence and event delivery in that process. Check the public health endpoint:

```sh
curl -fsS https://refloor.144-91-113-54.sslip.io/api/health
```

It should return `{"ready":true}`.

## Client on Firebase Hosting

For this Refloor deployment, the Firebase project ID and Hosting site are `tryrefloor`, and the API origin is `https://refloor.144-91-113-54.sslip.io`. When deploying a fork, use your own API origin and Firebase project ID. The `--project` option takes a Firebase project ID; also set `hosting.site` in `firebase.json` to a Hosting site in that project and add the site's origin to the API's `CLIENT_ORIGINS`.

Build with your API origin, then deploy to your Firebase project:

```sh
VITE_REFLOOR_API_URL=https://YOUR_API_ORIGIN pnpm --filter @refloor/client build
firebase deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

## Verify the release

Open the hosted app and check a prepared home, generation, a chat edit, reload recovery, and collaboration from two browser sessions. AI generation and editing use the configured provider account.
