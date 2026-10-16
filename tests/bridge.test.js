import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { WebSocket } from "ws";

test("MQTT bridge permits dashboard origins and rejects other websites", { timeout: 10000 }, async (t) => {
  const connections = new Set();
  const broker = net.createServer((socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
    socket.pipe(socket);
  });
  t.after(() => {
    for (const socket of connections) socket.destroy();
    broker.close();
  });
  broker.listen(0, "127.0.0.1");
  await once(broker, "listening");
  const server = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  t.after(async () => {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  });
  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.stdout.on("data", (data) => {
      const match = data.toString().match(/localhost:(\d+)/);
      if (match) resolve(match[1]);
    });
  });
  const brokerUrl = `mqtt://127.0.0.1:${broker.address().port}`;
  const url = `ws://127.0.0.1:${port}/mqtt-bridge?broker=${encodeURIComponent(brokerUrl)}`;
  for (const origin of ["http://192.168.1.20:5180", "https://dashboard.example.com", "http://localhost:5180"]) {
    await t.test(`forwards packets for ${origin}`, async (t) => {
      const ws = new WebSocket(url, {
        origin,
        headers: { Host: new URL(origin).host },
      });
      t.after(() => ws.terminate());
      await once(ws, "open");
      const received = once(ws, "message");
      const packet = Buffer.from([0x20, 0x02, 0x00, 0x00]);
      ws.send(packet);
      assert.deepEqual((await received)[0], packet);
    });
  }
  await t.test("rejects a cross-origin connection", async (t) => {
    const ws = new WebSocket(url, {
      origin: "https://other.example.com",
      headers: { Host: "dashboard.example.com" },
    });
    t.after(() => ws.terminate());
    await assert.rejects(once(ws, "open"), /socket hang up/);
  });
});
