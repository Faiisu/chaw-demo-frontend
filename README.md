# CHEW — Service insights

An English-language React dashboard for FIFO-paired Nara vision and EchoDesk speech reports. Configure service rules, review keyword evidence and transcripts, inspect camera samples, filter reports, and export the current selection as JSON.

## Run locally

Requires Node.js 22.13+ (built-in SQLite).

```sh
npm install
npm run dev
```

Open http://localhost:5180. To use another port, run `PORT=5181 npm run dev`.

```sh
npm test
npm run build
npm start
```

`npm start` serves the production frontend and shared API, and starts continuous MQTT collection. Both production and development bind to `0.0.0.0`. Open `http://<server-ip>:5180` from another machine; allow TCP port 5180 through the host firewall if needed. A static-only host cannot run the collector or SQLite API.

## Shared collection and configuration

The backend subscribes to `mqtt://mqtt:1883`, topic `restaurant/01`, automatically. It continues collecting when no browser is open and reconnects after a broker interruption. **MQTT settings** displays server collection status; browser users do not manage a separate subscription.

For local development outside Docker, point `MQTT_URL` at a broker address reachable from your machine:

```sh
MQTT_URL=mqtt://localhost:1883 npm run dev
```

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `MQTT_URL` | `mqtt://mqtt:1883` | Broker reachable by the backend; MQTT/TLS/WebSocket URLs supported |
| `MQTT_TOPIC` | `restaurant/01` | Subscription topic or filter |
| `MQTT_USERNAME` | empty | Optional broker username |
| `MQTT_PASSWORD` | empty | Optional broker password; never sent to browsers |
| `DB_PATH` | `./data/chew.sqlite` | SQLite database path; Compose sets `/app/data/chew.sqlite` |
| `PORT` | `5180` | HTTP port inside the process |

Set `MQTT_URL` to an empty string when starting Node directly to disable collection for offline development. Compose uses the default broker when this variable is empty. Compose reads overrides from the shell or a local `.env` file. Do not embed credentials in the broker URL.

The browser polls the shared API every two seconds. All dashboards read the same reports and service rules. Rules are saved centrally; the last successful save wins. Previous browser-local rules and reports are not imported automatically.

Initially, the newest 500 reports are loaded. **Load older reports** retrieves earlier pages; filters, statistics, and JSON exports cover the reports currently loaded. No saved reports are deleted when a browser closes or the broker reconnects. SQLite history has no automatic retention limit, so disk usage grows with incoming data.

## Shared API

- `GET /api/state`: collector status, saved report count, shared rules, and latest report page.
- `GET /api/state?after=<seq>`: up to 500 new reports in ascending sequence order.
- `GET /api/state?before=<seq>`: up to 500 older reports; `hasMore` indicates another page.
- `PUT /api/rules`: save a JSON array of rules. Requires an Origin matching the dashboard Host over HTTP or HTTPS.

Report IDs remain stable across restarts. `seq` is the database cursor; optional `limit` is between 1 and 500. API errors return JSON and non-success HTTP status codes.

## Report contract and evaluation

Accepts either `{ "topic": "merged/v1/report", "payload": { "vision_analytics": ..., "speech_analytics": ... } }` or the inner payload directly. The MQTT subscription topic is independent of the optional JSON topic field. Each received message adds one report. Invalid messages are skipped and counted. The two message counts need not match.

The UI, code and demo conversations are English. Received transcripts and keywords remain unchanged and may be in any language. Default rules use English phrases. For Thai reports, edit the rules to the exact Thai keywords from your speech pipeline; multiple alternatives are comma-separated.

Only reports with overlapping vision/speech windows, a customer and employee in the same camera sample, speech evidence, and active rules are evaluated. The headline rate is reports with evidence for every active rule divided by eligible reports. Missing evidence requests review; absent customers and insufficient evidence are separate states.

Each rule takes the greater of exact upstream keyword counts and transcript entries containing any alternative. Sources are not added together. This is a keyword evidence check, not semantic analysis or speaker identification. Camera counts are peaks per frame, never summed as unique customers. Header dates and times use Asia/Bangkok; camera `Time` remains unchanged. The trend gives equal space to each report and is not a continuous elapsed-time scale.

## Persistence and collection boundaries

SQLite stores validated reports and service rules. The default local `data/` directory is ignored by Git and Docker build context. In Docker, the `dashboard-data` named volume preserves the database when the container is recreated or `docker compose down` is run. **Do not run `docker compose down -v` unless you intend to delete saved history and rules.**

Demo data never enters SQLite. Received transcripts may contain personal data; they remain in the database until you remove or archive it. There is no employee identification. Each upstream delivery adds a report, including repeated or retained deliveries; the payload has no unique report ID for reliable deduplication. Automatic reconnect does not guarantee recovery of messages published while the collector is offline. Invalid messages are skipped; the invalid count shown in the UI is since collector startup. Database write errors are surfaced in collection status and server logs.

This dashboard has no login or per-user permissions. Anyone with access can read saved reports and change shared rules. Use it on your trusted network or behind an authenticated proxy. A reverse proxy must preserve the original Host header. MQTT credentials are configured on the server, are not saved in SQLite, and are never returned by the API. TLS certificate verification remains enabled. The legacy same-origin `/mqtt-bridge` endpoint remains available, but dashboard collection no longer uses it.

For a consistent backup, stop the dashboard before copying its data volume, then restart it. Retain a single backend instance per SQLite volume; this version does not support multiple collector replicas.

## Docker

Requires Docker with Docker Compose and an existing external network named `shared-network`.
If the network does not exist, create it once:

```sh
docker network create shared-network
```

Build and start the dashboard:

```sh
docker compose up -d --build
```

Open `http://<docker-host-ip>:5180`. Containers on `shared-network` can reach the service at `http://dashboard:5180`.
The image builds the frontend and runs the Node server as a non-root user. SQLite is stored at `/app/data/chew.sqlite` in the `dashboard-data` volume.

```sh
docker compose logs -f dashboard
docker compose down
```

The external network is not removed by `docker compose down`. Allow TCP port 5180 through the host firewall for remote access.
The MQTT container and dashboard must both join `shared-network`. The default `mqtt://mqtt:1883` is resolved by the dashboard container through Docker DNS; no WebSocket listener is required on Mosquitto. `localhost` as a broker address refers to the dashboard container itself. Collection starts as soon as the dashboard container starts.
