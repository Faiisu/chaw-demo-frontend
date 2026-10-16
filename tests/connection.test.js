import test from "node:test";
import assert from "node:assert/strict";
import { validateConnection } from "../src/connection.js";
globalThis.location = { protocol: "http:" };
test("accepts TCP, TLS and WebSocket brokers and valid topic filters", () => {
  for (const url of [
    "mqtt://100.115.94.105:1883",
    "mqtts://localhost:8883",
    "ws://localhost:8083/mqtt",
    "wss://localhost/mqtt",
  ]) {
    for (const topic of ["restaurant/01", "restaurant/+", "restaurant/#"])
      assert.ok(validateConnection({ url, topic }));
  }
});
test("rejects malformed topic filters, credentials in URLs and unsupported protocols", () => {
  for (const topic of ["", "restaurant/#/01", "restaurant/a+", "restaurant/##"])
    assert.throws(() => validateConnection({ url: "mqtt://localhost", topic }));
  for (const url of [
    "invalid",
    "https://localhost",
    "mqtt://user:secret@localhost",
  ])
    assert.throws(() => validateConnection({ url, topic: "restaurant/01" }));
});
test("rejects mixed-content WebSocket connections", () => {
  globalThis.location.protocol = "https:";
  assert.throws(() =>
    validateConnection({ url: "ws://localhost/mqtt", topic: "restaurant/01" }),
  );
  globalThis.location.protocol = "http:";
});
