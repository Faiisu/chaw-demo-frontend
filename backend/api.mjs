export function sameOrigin(req) {
  return Boolean(req.headers.host) &&
    [`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin);
}

export function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

export async function handleApi(req, res, store, collector) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;
  try {
    if (url.pathname === "/api/state" && req.method === "GET") {
      const options = {};
      for (const key of ["after", "before", "limit"]) {
        if (!url.searchParams.has(key)) continue;
        const value = url.searchParams.get(key);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) ||
            (key === "limit" && (Number(value) < 1 || Number(value) > 500))) {
          sendJson(res, 400, { error: "Invalid pagination parameters." });
          return true;
        }
        options[key] = Number(value);
      }
      if (options.after !== undefined && options.before !== undefined) {
        sendJson(res, 400, { error: "Use either after or before." });
      } else {
        sendJson(res, 200, {
          ...store.reports(options), rules: store.rules(),
          total: store.count(), collector: collector.status,
        });
      }
    } else if (url.pathname === "/api/rules" && req.method === "PUT") {
      if (!sameOrigin(req)) {
        sendJson(res, 403, { error: "Rules must be saved from the dashboard's own origin." });
        return true;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64 * 1024) {
          sendJson(res, 413, { error: "Rules exceed 64 KB." });
          return true;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      let rules;
      try { rules = store.saveRules(JSON.parse(body)); }
      catch (error) {
        if (error instanceof SyntaxError || error.message === "Invalid service rules.") {
          sendJson(res, 400, { error: "Invalid service rules." });
          return true;
        }
        throw error;
      }
      sendJson(res, 200, { rules });
    } else {
      sendJson(res, 404, { error: "API endpoint not found." });
    }
  } catch {
    if (!res.headersSent) sendJson(res, 500, { error: "Shared database unavailable." });
  }
  return true;
}
