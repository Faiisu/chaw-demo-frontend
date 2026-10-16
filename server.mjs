import { openStore } from "./backend/store.mjs";
import { startCollector } from "./backend/collector.mjs";
import { handleApi, sameOrigin } from "./backend/api.mjs";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
const store = openStore(process.env.DB_PATH || "./data/chew.sqlite");
const collector = startCollector(store);
const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 5180);
const vite = dev
  ? await (
      await import("vite")
    ).createServer({ server: { middlewareMode: true }, appType: "spa" })
  : null;
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = http.createServer(async (req, res) => {
  if (await handleApi(req, res, store, collector)) return;
  if (vite) return vite.middlewares(req, res);
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    let content;
    try {
      content = await readFile(file);
    } catch {
      if (extname(pathname)) throw new Error("Not found");
      file = resolve(root, "index.html");
      content = await readFile(file);
    }
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const sockets = new WebSocketServer({
  noServer: true,
  maxPayload: 1024 * 1024,
});
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/mqtt-bridge") {
    if (!dev) socket.destroy();
    return;
  }
  if (!sameOrigin(req)) {
    socket.destroy();
    return;
  }
  let broker;
  try {
    broker = new URL(url.searchParams.get("broker"));
  } catch {
    socket.destroy();
    return;
  }
  if (
    !["mqtt:", "mqtts:"].includes(broker.protocol) ||
    broker.username ||
    broker.password ||
    broker.pathname.replaceAll("/", "") ||
    broker.search ||
    broker.hash
  ) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(req, socket, head, (ws) => {
    const secure = broker.protocol === "mqtts:";
    const options = {
      host: broker.hostname,
      port: Number(broker.port || (secure ? 8883 : 1883)),
    };
    const tcp = secure
      ? tls.connect({ ...options, servername: broker.hostname })
      : net.connect(options);
    tcp.setTimeout(15000, () => {
      ws.close(1011, "Broker timeout");
      tcp.destroy();
    });
    tcp.on(secure ? "secureConnect" : "connect", () => tcp.setTimeout(0));
    ws.on("message", (data) => {
      if (!tcp.destroyed) {
        if (!tcp.write(data)) ws.pause();
      }
    });
    tcp.on("drain", () => ws.resume());
    tcp.on("data", (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        tcp.pause();
        ws.send(data, () => {
          if (!tcp.destroyed) tcp.resume();
        });
      }
    });
    tcp.on("error", () => ws.close(1011, "Cannot reach MQTT broker"));
    tcp.on("close", () => ws.close());
    ws.on("close", () => tcp.destroy());
    ws.on("error", () => tcp.destroy());
  });
});
server.listen(port, "0.0.0.0", () =>
  console.log(`CHEW running at http://localhost:${server.address().port}`),
);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const forceExit = setTimeout(() => process.exit(1), 5000);
  forceExit.unref();
  for (const ws of sockets.clients) ws.terminate();
  await collector.close();
  await new Promise((resolve) => server.close(resolve));
  if (vite) await vite.close();
  store.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
