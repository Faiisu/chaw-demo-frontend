import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { demoReports } from "../src/analytics.js";

// Minimal test broker: CONNECT, SUBSCRIBE and PING; real MQTT.js handles collection.
async function testBroker() {
  const subscribers = new Set(), sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => { sockets.delete(socket); subscribers.delete(socket); });
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 2) {
        let length = 0, multiplier = 1, offset = 1, digit;
        do {
          if (offset >= pending.length) return;
          digit = pending[offset++];
          length += (digit & 127) * multiplier;
          multiplier *= 128;
        } while (digit & 128);
        if (pending.length < offset + length) return;
        const command = pending[0] >> 4, body = pending.subarray(offset, offset + length);
        pending = pending.subarray(offset + length);
        if (command === 1) socket.write(Buffer.from([0x20, 2, 0, 0]));
        if (command === 8) {
          socket.write(Buffer.from([0x90, 3, body[0], body[1], 0]));
          subscribers.add(socket);
        }
        if (command === 12) socket.write(Buffer.from([0xd0, 0]));
        if (command === 14) socket.end();
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `mqtt://127.0.0.1:${server.address().port}`,
    drop() { for (const socket of sockets) socket.destroy(); },
    publish(message) {
      const topic = Buffer.from("restaurant/01"), size = Buffer.alloc(2);
      size.writeUInt16BE(topic.length);
      const body = Buffer.concat([size, topic, Buffer.from(message)]);
      let remaining = body.length;
      const header = [0x30];
      do { let digit = remaining % 128; remaining = Math.floor(remaining / 128); if (remaining) digit |= 128; header.push(digit); } while (remaining);
      for (const socket of subscribers) socket.write(Buffer.concat([Buffer.from(header), body]));
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function startServer(database, broker) {
  const child = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, PORT: "0", DB_PATH: database, MQTT_URL: broker, MQTT_TOPIC: "restaurant/01", MQTT_USERNAME: "", MQTT_PASSWORD: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Server startup timeout")); }, 5000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.stdout.on("data", (data) => {
      const match = data.toString().match(/localhost:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return { url, async close() { const stopped = once(child, "exit"); child.kill(); await stopped; } };
}

async function waitFor(url, check) {
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`${url}/api/state`);
    assert.equal(response.status, 200);
    const state = await response.json();
    if (check(state)) return state;
    await delay(50);
  }
  throw new Error("Shared state did not reach expected value");
}

test("collects without viewers, shares reports and rules, reconnects, and survives server restart", { timeout: 20000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "chew-api-"));
  const broker = await testBroker();
  let server;
  t.after(async () => { await server?.close(); await broker.close(); await rm(dir, { recursive: true, force: true }); });
  server = await startServer(join(dir, "history.sqlite"), broker.url);
  await waitFor(server.url, (state) => state.collector.connection === "connected");
  // No browser is connected when MQTT data arrives.
  broker.publish(JSON.stringify(demoReports()[0].payload));
  const first = await waitFor(server.url, (state) => state.total === 1);
  const second = await (await fetch(`${server.url}/api/state`)).json();
  assert.deepEqual(first.reports, second.reports);
  assert.equal(first.reports[0].source, "restaurant/01");
  const changedRules = [{ ...first.rules[0], name: "Shared rule" }];
  const save = (origin, rules) => fetch(`${server.url}/api/rules`, {
    method: "PUT", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(rules),
  });
  assert.equal((await save("https://untrusted.example", changedRules)).status, 403);
  assert.equal((await save(server.url, [{ ...changedRules[0], minimum: -1 }])).status, 400);
  assert.equal((await save(server.url, changedRules)).status, 200);
  assert.deepEqual((await (await fetch(`${server.url}/api/state`)).json()).rules, changedRules);
  for (const query of ["after=no", "limit=501", "before=1&after=2"]) {
    assert.equal((await fetch(`${server.url}/api/state?${query}`)).status, 400);
  }
  broker.publish("invalid JSON");
  const invalid = await waitFor(server.url, (state) => state.collector.invalid === 1);
  assert.equal(invalid.total, 1);
  broker.drop();
  await waitFor(server.url, (state) => state.collector.connection !== "connected");
  await waitFor(server.url, (state) => state.collector.connection === "connected");
  broker.publish(JSON.stringify(demoReports()[1].payload));
  await waitFor(server.url, (state) => state.total === 2);
  await server.close();
  server = null;
  server = await startServer(join(dir, "history.sqlite"), broker.url);
  const restored = await waitFor(server.url, (state) => state.collector.connection === "connected");
  assert.equal(restored.total, 2);
  assert.equal(restored.reports[0].id, first.reports[0].id);
  assert.deepEqual(restored.rules, changedRules);
  broker.publish(JSON.stringify(demoReports()[2].payload));
  const latest = await waitFor(server.url, (state) => state.total === 3);
  const incremental = await (await fetch(`${server.url}/api/state?after=2`)).json();
  assert.equal(incremental.reports.length, 1);
  assert.deepEqual(incremental.reports[0], latest.reports.at(-1));
});
