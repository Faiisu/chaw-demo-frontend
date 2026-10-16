import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../backend/store.mjs";
import { DEFAULT_RULES, demoReports } from "../src/analytics.js";

test("SQLite preserves all reports and shared rules across reopen with cursor pagination", () => {
  const dir = mkdtempSync(join(tmpdir(), "chew-store-"));
  let store;
  try {
    const path = join(dir, "history.sqlite");
    store = openStore(path);
    const payload = demoReports()[0].payload;
    for (let i = 0; i < 505; i++) store.addReport("restaurant/01", payload, i === 0);
    const changedRules = [{ ...DEFAULT_RULES[0], name: "Shared greeting" }];
    store.saveRules(changedRules);
    assert.throws(() => store.saveRules([{ ...changedRules[0], minimum: 0 }]), /Invalid/);
    store.close();
    store = openStore(path);
    assert.equal(store.count(), 505);
    assert.deepEqual(store.rules(), changedRules);
    const latest = store.reports();
    assert.equal(latest.reports.length, 500);
    assert.equal(latest.reports[0].seq, 6);
    assert.equal(latest.hasMore, true);
    const older = store.reports({ before: 6 });
    assert.equal(older.reports.length, 5);
    assert.equal(older.hasMore, false);
    assert.equal(older.reports[0].retained, true);
    assert.deepEqual(older.reports[0].payload, payload);
    assert.deepEqual(store.reports({ after: 502 }).reports.map((report) => report.seq), [503, 504, 505]);
    const firstPage = store.reports({ after: 0 });
    assert.equal(firstPage.hasMore, true);
    assert.equal(firstPage.reports.at(-1).seq, 500);
    store.saveRules([]);
    assert.deepEqual(store.rules(), []);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
