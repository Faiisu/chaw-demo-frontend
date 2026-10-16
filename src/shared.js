import { useEffect, useRef, useState } from "react";
import { DEFAULT_RULES } from "./analytics.js";

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000), cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Shared server unavailable.");
  return body;
}

export function useSharedReports() {
  const [reports, setReports] = useState([]);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [collector, setCollector] = useState({ connection: "connecting", message: "Loading shared data…", url: "", topic: "", invalid: 0 });
  const [total, setTotal] = useState(0);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [ready, setReady] = useState(false);
  const latest = useRef(0);
  const oldest = useRef(null);
  const olderPending = useRef(false);
  function merge(incoming) {
    if (!incoming.length) return;
    latest.current = Math.max(latest.current, incoming.at(-1).seq);
    oldest.current = Math.min(oldest.current ?? Infinity, incoming[0].seq);
    setReports((previous) => [...new Map([...previous, ...incoming].map((report) => [report.id, report])).values()]
      .sort((a, b) => a.seq - b.seq));
  }
  useEffect(() => {
    let disposed = false, timer, initialized = false;
    async function poll() {
      let delay = 2000;
      try {
        const state = await request(`/api/state${initialized ? `?after=${latest.current}` : ""}`);
        if (disposed) return;
        merge(state.reports);
        setRules(state.rules);
        setCollector(state.collector);
        setTotal(state.total);
        setSyncError("");
        setReady(true);
        if (!initialized) setHasOlder(state.hasMore);
        else if (state.hasMore) delay = 0;
        initialized = true;
      } catch {
        if (!disposed) setSyncError("Cannot reach the shared server. Displayed data may be out of date. Retrying…");
      }
      if (!disposed) timer = setTimeout(poll, delay);
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  async function loadOlder() {
    if (olderPending.current || oldest.current === null) return;
    olderPending.current = true;
    setLoadingOlder(true);
    try {
      const state = await request(`/api/state?before=${oldest.current}`);
      merge(state.reports);
      setHasOlder(state.hasMore);
    } finally {
      olderPending.current = false;
      setLoadingOlder(false);
    }
  }
  async function saveRules(value) {
    const result = await request("/api/rules", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
    });
    setRules(result.rules);
  }
  return { reports, rules, collector, total, hasOlder, loadingOlder, syncError, ready, loadOlder, saveRules };
}
