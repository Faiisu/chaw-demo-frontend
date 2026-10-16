import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_RULES } from "../src/analytics.js";

export function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length > 100 || rules.some((rule) =>
    !rule || typeof rule.id !== "string" || !rule.id || rule.id.length > 100 ||
    typeof rule.name !== "string" || !rule.name.trim() || rule.name.length > 200 ||
    typeof rule.keywords !== "string" || rule.keywords.length > 4000 ||
    !rule.keywords.split(",").some((word) => word.trim()) ||
    !Number.isSafeInteger(rule.minimum) || rule.minimum < 1 ||
    typeof rule.enabled !== "boolean"
  ) || new Set(rules.map((rule) => rule.id)).size !== rules.length) {
    throw new Error("Invalid service rules.");
  }
  return rules.map(({ id, name, keywords, minimum, enabled }) =>
    ({ id, name, keywords, minimum, enabled }));
}

export function openStore(path) {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      received_at TEXT NOT NULL,
      retained INTEGER NOT NULL CHECK (retained IN (0, 1)),
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version = 1;
  `);
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('rules', ?)")
    .run(JSON.stringify(DEFAULT_RULES));
  const insert = db.prepare("INSERT INTO reports (source, received_at, retained, payload) VALUES (?, ?, ?, ?)");
  const decode = (row) => ({
    id: String(row.id), seq: row.id, source: row.source,
    receivedAt: row.received_at, retained: Boolean(row.retained),
    payload: JSON.parse(row.payload),
  });
  return {
    addReport(source, payload, retained = false) {
      return insert.run(source, new Date().toISOString(), retained ? 1 : 0, JSON.stringify(payload));
    },
    reports({ after, before, limit = 500 } = {}) {
      let rows;
      if (after !== undefined) {
        rows = db.prepare("SELECT * FROM reports WHERE id > ? ORDER BY id ASC LIMIT ?").all(after, limit + 1);
      } else {
        rows = before === undefined
          ? db.prepare("SELECT * FROM reports ORDER BY id DESC LIMIT ?").all(limit + 1)
          : db.prepare("SELECT * FROM reports WHERE id < ? ORDER BY id DESC LIMIT ?").all(before, limit + 1);
      }
      const hasMore = rows.length > limit;
      rows = rows.slice(0, limit);
      if (after === undefined) rows.reverse();
      return { reports: rows.map(decode), hasMore };
    },
    count: () => db.prepare("SELECT COUNT(*) AS count FROM reports").get().count,
    rules: () => JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'rules'").get().value),
    saveRules(rules) {
      const valid = validateRules(rules);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'rules'").run(JSON.stringify(valid));
      return valid;
    },
    close: () => db.close(),
  };
}
