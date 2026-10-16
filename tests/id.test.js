import test from "node:test";
import assert from "node:assert/strict";
import { createId } from "../src/id.js";

test("creates IDs when randomUUID is unavailable on HTTP", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues },
  });
  try {
    assert.equal(crypto.randomUUID, undefined);
    const ids = Array.from({ length: 100 }, () => createId());
    for (const id of ids) assert.match(id, /^[a-f0-9]{32}$/);
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
