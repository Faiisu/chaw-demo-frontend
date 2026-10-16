# CHEW — Service insights

An English-language React dashboard for FIFO-paired Nara vision and EchoDesk speech reports. Configure service rules, review keyword evidence and transcripts, inspect camera samples, filter reports, and export the current selection as JSON.

## Run locally

Requires Node.js 22.12+.

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

`npm start` serves the production build and the MQTT bridge. A static-only server cannot provide TCP MQTT connections. The application binds to `0.0.0.0` so other machines can view the dashboard at `http://<server-ip>:5180`. Allow the selected port through the host firewall if needed. This applies to both `npm start` and `npm run dev`. The TCP MQTT bridge accepts connections from the dashboard’s own host over HTTP or HTTPS. Reports are per-browser sessions, so remote viewers do not automatically see another browser’s live reports.

## Connect to your broker

Open **MQTT settings**. The defaults are `mqtt://100.115.94.105:1883` and `restaurant/01`, with no authentication. **Test connection** verifies both MQTT CONNECT and SUBACK, then closes the test client. **Connect & subscribe** starts a live session. A new connection clears the previous session; exporting first preserves the reports you need.

MQTT.js connects over WebSocket in the browser. For `mqtt://` and `mqtts://`, the local Node server forwards MQTT packets to the selected TCP/TLS broker. For `ws://` and `wss://`, the browser connects directly. The supplied broker must be reachable from the machine running the local server, including any required VPN. See [MQTT.js documentation](https://github.com/mqttjs/MQTT.js).

## Report contract and evaluation

Accepts either `{ "topic": "merged/v1/report", "payload": { "vision_analytics": ..., "speech_analytics": ... } }` or the inner payload directly. The MQTT subscription topic is independent of the optional JSON topic field. Each received message adds one report. Invalid messages are skipped and counted. The two message counts need not match.

The UI, code and demo conversations are English. Received transcripts and keywords remain unchanged and may be in any language. Default rules use English phrases. For Thai reports, edit the rules to the exact Thai keywords from your speech pipeline; multiple alternatives are comma-separated.

Only reports with overlapping vision/speech windows, a customer and employee in the same camera sample, speech evidence, and active rules are evaluated. The headline rate is reports with evidence for every active rule divided by eligible reports. Missing evidence requests review; absent customers and insufficient evidence are separate states.

Each rule takes the greater of exact upstream keyword counts and transcript entries containing any alternative. Sources are not added together. This is a keyword evidence check, not semantic analysis or speaker identification. Camera counts are peaks per frame, never summed as unique customers. Header dates and times use Asia/Bangkok; camera `Time` remains unchanged. The trend gives equal space to each report and is not a continuous elapsed-time scale.

## Session boundaries

Reports and credentials are in memory only. At most 500 live reports are retained; refreshing loses them. Rules persist in local browser storage. Demo data never mixes with live data. There is no background collection, database, automatic reconnect, or employee identification. Retained messages may be historical. The upstream payload has no unique report ID, so repeated deliveries cannot reliably be deduplicated.

This demo has no login or access control. The bridge accepts browser origins matching the dashboard host over HTTP or HTTPS; a reverse proxy must preserve the original Host header. Anyone with access to the dashboard can use the bridge to connect to broker addresses reachable by the server. Credentials are not stored or logged by the application. TLS certificate verification remains enabled.

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
The image builds the frontend and runs the Node server as a non-root user.

```sh
docker compose logs -f dashboard
docker compose down
```

The external network is not removed by `docker compose down`. Allow TCP port 5180 through the host firewall for remote access.
For a broker with service name `mqtt` on the same `shared-network`, enter `mqtt://mqtt:1883` in MQTT settings. The browser connects to the dashboard’s bridge, and the dashboard container resolves `mqtt` through Docker DNS. No WebSocket listener is required on Mosquitto. The broker must be reachable from inside the container, including any required VPN routing. `localhost` as a broker address refers to the container itself.
