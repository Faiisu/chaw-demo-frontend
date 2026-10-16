export const DEFAULT_RULES = [
  {
    id: "greeting",
    name: "Welcome the customer",
    keywords: "hello, welcome",
    minimum: 1,
    enabled: true,
  },
  {
    id: "offer",
    name: "Offer assistance",
    keywords: "what would you like, can I help, anything else",
    minimum: 1,
    enabled: true,
  },
  {
    id: "thanks",
    name: "Say thank you",
    keywords: "thank you",
    minimum: 1,
    enabled: true,
  },
];
const number = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0;
const fail = (message) => {
  throw new Error(message);
};
export function parseReport(input) {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  const payload = raw?.payload ?? raw;
  if (!payload || !payload.vision_analytics || !payload.speech_analytics)
    fail("Missing vision_analytics or speech_analytics.");
  const v = payload.vision_analytics,
    s = payload.speech_analytics;
  for (const side of [v, s]) {
    for (const key of ["startTime", "endTime"])
      if (
        typeof side[key] !== "string" ||
        !/(Z|[+-]\d{2}:\d{2})$/.test(side[key]) ||
        !Number.isFinite(Date.parse(side[key]))
      )
        fail(`Invalid ${key} or missing timezone.`);
    if (Date.parse(side.endTime) < Date.parse(side.startTime))
      fail("endTime must not precede startTime.");
    if (!number(side.count)) fail("count must be a non-negative integer.");
  }
  if (
    !Array.isArray(v.data) ||
    !Array.isArray(s.transcript) ||
    !Array.isArray(s.matches)
  )
    fail("data, transcript, and matches must be arrays.");
  if (
    v.data.some(
      (row) =>
        !row ||
        typeof row.Time !== "string" ||
        [
          "Customer Detected",
          "Employee Detected",
          "Cap Detected",
          "Headband Detected",
        ].some((key) => !number(row[key])),
    )
  )
    fail("Invalid camera data format.");
  if (
    s.transcript.some((t) => typeof t !== "string") ||
    s.matches.some(
      (m) => !m || typeof m.keyword !== "string" || !number(m.count),
    )
  )
    fail("Invalid speech data format.");
  return payload;
}
const normalize = (value) => value.normalize("NFC").toLocaleLowerCase().trim();
export function evidence(speech, rule) {
  const keywords = [
    ...new Set(rule.keywords.split(",").map(normalize).filter(Boolean)),
  ];
  const matches = speech.matches.filter((m) =>
    keywords.includes(normalize(m.keyword)),
  );
  const matchCount = matches.reduce((sum, m) => sum + m.count, 0);
  // One transcript entry counts once per rule; never add transcript and upstream matches together.
  const transcriptCount = speech.transcript.filter((t) =>
    keywords.some((k) => normalize(t).includes(k)),
  ).length;
  return {
    count: Math.max(matchCount, transcriptCount),
    matchCount,
    transcriptCount,
    found: Math.max(matchCount, transcriptCount) >= rule.minimum,
  };
}
export function analyze(payload, rules) {
  const v = payload.vision_analytics,
    s = payload.speech_analytics;
  const active = rules.filter((r) => r.enabled);
  const results = active.map((rule) => ({ ...rule, ...evidence(s, rule) }));
  const customers = Math.max(
    0,
    ...v.data.map((row) => row["Customer Detected"]),
  );
  const employees = Math.max(
    0,
    ...v.data.map((row) => row["Employee Detected"]),
  );
  const overlap =
    Math.min(Date.parse(v.endTime), Date.parse(s.endTime)) >
    Math.max(Date.parse(v.startTime), Date.parse(s.startTime));
  let status, reason;
  if (!active.length) {
    status = "unknown";
    reason = "No active rules";
  } else if (!v.count || !v.data.length) {
    status = "unknown";
    reason = "Insufficient camera data";
  } else if (!customers) {
    status = "idle";
    reason = "No customers detected in camera samples";
  } else if (!overlap) {
    status = "unknown";
    reason = "Vision and speech time windows do not overlap";
  } else if (
    !v.data.some(
      (row) => row["Customer Detected"] > 0 && row["Employee Detected"] > 0,
    )
  ) {
    status = "unknown";
    reason = "No camera sample contains both a customer and an employee";
  } else if (
    !s.count ||
    (!s.transcript.some((t) => t.trim()) && !s.matches.some((m) => m.count > 0))
  ) {
    status = "unknown";
    reason = "Insufficient speech evidence";
  } else {
    status = results.every((r) => r.found) ? "pass" : "review";
    reason =
      status === "pass"
        ? "Evidence found for every active rule"
        : "Some required phrases were not found. Review the conversation.";
  }
  return { status, reason, results, customers, employees, overlap };
}
export const STATUS = {
  pass: { label: "All rules found", short: "All found" },
  review: { label: "Needs review", short: "Review" },
  unknown: { label: "Insufficient data", short: "Insufficient data" },
  idle: { label: "No customers", short: "No customers" },
};
export function time(value) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
export function dateKey(value) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
export function demoReports() {
  return Array.from({ length: 12 }, (_, i) => {
    const start = new Date(`2026-10-15T03:00:00Z`);
    start.setMinutes(start.getMinutes() + i * 5);
    const end = new Date(+start + 300000);
    const transcript =
      i === 8
        ? []
        : i % 4 === 1
          ? ["Hello! What would you like to order?", "One coffee, please."]
          : [
              "Hello! What would you like to order?",
              "One coffee, please.",
              "Thank you! Your order will be ready shortly.",
            ];
    const idle = i === 3;
    return {
      id: `demo-${i}`,
      source: "demo",
      receivedAt: end.toISOString(),
      payload: {
        vision_analytics: {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          count: 2,
          data: [0, 1].map((_, j) => ({
            "Customer Detected": idle
              ? 0
              : [3, 5, 4, 2, 6, 3, 7, 5, 4, 6, 3, 4][i] + j,
            "Employee Detected": 2,
            "Cap Detected": 1,
            "Headband Detected": 1,
            Time: `${time(new Date(+start + (j + 1) * 60000))}:00`,
          })),
        },
        speech_analytics: {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          count: transcript.length,
          transcript,
          matches: transcript.length
            ? [
                { keyword: "hello", count: 1 },
                { keyword: "coffee", count: 1 },
                ...(transcript.length === 3
                  ? [{ keyword: "thank you", count: 1 }]
                  : []),
              ]
            : [],
        },
      },
    };
  });
}
