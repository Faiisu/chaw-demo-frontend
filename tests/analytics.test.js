import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  DEFAULT_RULES,
  demoReports,
  evidence,
  parseReport,
  time,
} from "../src/analytics.js";
const sample = () => structuredClone(demoReports()[0].payload);
test("accepts envelope and bare payload with unequal counts", () => {
  const p = sample();
  p.vision_analytics.count = 8;
  assert.deepEqual(
    parseReport(JSON.stringify({ topic: "merged/v1/report", payload: p })),
    p,
  );
  assert.equal(parseReport(p).speech_analytics.count, 3);
});
test("rejects malformed dates, count, transcript and camera values", () => {
  for (const mutate of [
    (p) => (p.speech_analytics.count = -1),
    (p) => (p.vision_analytics.data[0]["Customer Detected"] = "2"),
    (p) => (p.speech_analytics.transcript = [null]),
    (p) => (p.vision_analytics.endTime = "no"),
    (p) => (p.speech_analytics.startTime = "2026-10-15T03:00:00"),
    (p) => (p.vision_analytics.endTime = "2025-01-01T00:00:00Z"),
  ]) {
    const p = sample();
    mutate(p);
    assert.throws(() => parseReport(p));
  }
});
test("full evidence passes, missing evidence requests review", () => {
  const p = sample();
  assert.equal(analyze(p, DEFAULT_RULES).status, "pass");
  p.speech_analytics.transcript.pop();
  p.speech_analytics.matches.pop();
  assert.equal(analyze(p, DEFAULT_RULES).status, "review");
});
test("unmatched time windows cannot be evaluated", () => {
  const p = sample();
  p.speech_analytics.startTime = p.vision_analytics.endTime;
  p.speech_analytics.endTime = "2026-10-15T03:10:00Z";
  assert.equal(analyze(p, DEFAULT_RULES).status, "unknown");
});
test("empty speech, absent employees, disabled rules are unknown; no customers is idle", () => {
  const p = sample();
  p.speech_analytics.count = 0;
  assert.equal(analyze(p, DEFAULT_RULES).status, "unknown");
  const q = sample();
  q.vision_analytics.data.forEach((row) => (row["Employee Detected"] = 0));
  assert.equal(analyze(q, DEFAULT_RULES).status, "unknown");
  assert.equal(analyze(sample(), []).status, "unknown");
  q.vision_analytics.data.forEach((row) => (row["Customer Detected"] = 0));
  assert.equal(analyze(q, DEFAULT_RULES).status, "idle");
});
test("keyword sources and overlapping alternatives are not added twice", () => {
  const rule = { keywords: "can I help, can I help you", minimum: 2 };
  assert.equal(
    evidence(
      {
        transcript: ["Can I help you?"],
        matches: [{ keyword: "can I help", count: 1 }],
      },
      rule,
    ).count,
    1,
  );
  assert.equal(
    evidence(
      {
        transcript: ["Can I help you?"],
        matches: [{ keyword: "can I help", count: 1 }],
      },
      rule,
    ).found,
    false,
  );
});
test("camera maximum is not sum and UTC displays in Bangkok", () => {
  assert.equal(analyze(sample(), DEFAULT_RULES).customers, 4);
  assert.equal(time("2026-10-15T03:00:00Z"), "10:00");
});
