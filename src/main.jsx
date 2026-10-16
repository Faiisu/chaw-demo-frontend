import { createId } from "./id.js";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  analyze,
  dateKey,
  demoReports,
  STATUS,
  time,
} from "./analytics";
import { useSharedReports } from "./shared.js";
import "./styles.css";
const icons = {
  greeting: MessageSquareText,
  offer: AudioLines,
  thanks: ShieldCheck,
};
function Badge({ status }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {STATUS[status].label}
    </span>
  );
}
function Modal({ title, subtitle, onClose, children, wide = false }) {
  const ref = useRef();
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [page, setPage] = useState("overview");
  const [mode, setMode] = useState("live");
  const shared = useSharedReports();
  const live = shared.reports;
  const rules = shared.rules;
  const config = shared.collector;
  const connection = shared.syncError ? "error" : config.connection;
  const connectionMessage = shared.syncError || config.storageError || config.message;
  const invalid = config.invalid;
  const demo = useMemo(demoReports, []);
  const [ruleDraft, setRuleDraft] = useState(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [ruleError, setRuleError] = useState("");
  const [savingRules, setSavingRules] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const reports = mode === "demo" ? demo : live;
  const dated = useMemo(
    () =>
      reports
        .filter(
          (r) =>
            !date || dateKey(r.payload.vision_analytics.startTime) === date,
        )
        .map((r) => ({ ...r, analysis: analyze(r.payload, rules) }))
        .sort(
          (a, b) =>
            Date.parse(a.payload.vision_analytics.startTime) -
            Date.parse(b.payload.vision_analytics.startTime),
        ),
    [reports, date, rules],
  );
  const eligible = dated.filter((r) =>
    ["pass", "review"].includes(r.analysis.status),
  );
  const passed = eligible.filter((r) => r.analysis.status === "pass").length;
  const reviews = dated.filter((r) => r.analysis.status === "review").length;
  const score = eligible.length
    ? Math.round((passed / eligible.length) * 100)
    : null;
  const filtered = dated
    .filter(
      (r) =>
        (statusFilter === "all" || r.analysis.status === statusFilter) &&
        (!search ||
          [
            ...r.payload.speech_analytics.transcript,
            ...r.payload.speech_analytics.matches.map((m) => m.keyword),
            time(r.payload.vision_analytics.startTime),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .reverse();
  const activeRules = rules.filter((r) => r.enabled);
  const selected = detail
    ? { ...detail, analysis: analyze(detail.payload, rules) }
    : null;
  function changeMode(value) {
    setMode(value);
    setDate("");
    setStatusFilter("all");
    setSearch("");
  }
  async function saveRules() {
    if (!shared.ready) return setRuleError("Wait for the shared server before saving rules.");
    if (
      ruleDraft.some(
        (r) =>
          !r.name.trim() ||
          !r.keywords.split(",").some((k) => k.trim()) ||
          !Number.isInteger(r.minimum) ||
          r.minimum < 1,
      )
    )
      return setRuleError(
        "Enter a rule name, at least one keyword, and a minimum count of 1 or more.",
      );
    if (savingRules) return;
    setSavingRules(true);
    setRuleError("");
    try {
      await shared.saveRules(ruleDraft);
      setRuleDraft(null);
      setNotice("Shared rules saved. All dashboards will use these rules.");
    } catch (error) {
      setRuleError(error.message);
    } finally {
      setSavingRules(false);
    }
  }
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            mode,
            rules,
            note: "Window-level keyword evidence, not individual employee compliance",
            reports: filtered,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `chew-${mode}-reports.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function editRules() {
    setRuleError("");
    setRuleDraft(rules.map((r) => ({ ...r })));
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
        >
          <span className="brand-mark">
            <AudioLines size={25} />
          </span>
          chew<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <div className="store-icon">
            <Store size={19} />
          </div>
          <div>
            <strong>Restaurant 01</strong>
            <span>Service intelligence</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          <button
            className={page === "overview" ? "active" : ""}
            onClick={() => setPage("overview")}
          >
            <LayoutDashboard size={19} />
            Service overview
          </button>
          <button
            className={page === "reports" ? "active" : ""}
            onClick={() => setPage("reports")}
          >
            <FileText size={19} />
            All reports<span className="nav-count">{reports.length}</span>
          </button>
          <button onClick={editRules}>
            <ShieldCheck size={19} />
            Service rules
            <span className="small-dot" />
          </button>
          <button onClick={() => setConnectionOpen(true)}>
            <Radio size={19} />
            MQTT connection
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <div>
              <span className={`signal ${connection}`} />
              <strong>
                {connection === "connected"
                  ? "MQTT connected"
                  : connection === "connecting"
                    ? "Connecting…"
                    : "MQTT offline"}
              </strong>
            </div>
            <p>
              {connection === "connected"
                ? config.topic
                : "Server collects automatically"}
            </p>
            <button onClick={() => setConnectionOpen(true)}>
              Collection status <ArrowRight size={14} />
            </button>
          </div>
          <button className="help-button" onClick={() => setPage("guide")}>
            <CircleHelp size={18} />
            Understanding the data
          </button>
          <div className="profile">
            <span className="avatar">R</span>
            <div>
              <strong>Restaurant workspace</strong>
              <span>Shared dashboard</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>
              {page === "reports"
                ? "All reports"
                : page === "guide"
                  ? "Understanding the data"
                  : "Service overview"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="timezone">
              <Clock3 size={14} />
              Bangkok · UTC+7
            </span>
            <span className="top-separator" />
            <span className="avatar small">R</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">SERVICE INSIGHTS</div>
              <h1>
                {page === "reports"
                  ? "Every report tells a story."
                  : page === "guide"
                    ? "Understand your data."
                    : "Good service starts with a conversation."}
              </h1>
              <p>A clearer view of your service, one conversation at a time.</p>
            </div>
            <button
              className="button"
              disabled={!filtered.length}
              onClick={exportData}
            >
              <ArrowDownToLine size={16} />
              Export reports
            </button>
          </div>
          <div className="toolbar">
            <div className="source-toggle">
              <button
                className={mode === "demo" ? "selected" : ""}
                onClick={() => changeMode("demo")}
              >
                <Database size={15} />
                Demo data
              </button>
              <button
                className={mode === "live" ? "selected" : ""}
                onClick={() => changeMode("live")}
              >
                <span className={`signal ${connection}`} />
                Live data
              </button>
            </div>
            <div className="toolbar-end">
              <span className="muted">Time window</span>
              <input
                aria-label="Filter by date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              {date && (
                <button
                  className="icon-button"
                  aria-label="Clear date"
                  onClick={() => setDate("")}
                >
                  <X size={15} />
                </button>
              )}
              <button
                className="button compact"
                onClick={() => setConnectionOpen(true)}
              >
                <SlidersHorizontal size={15} />
                Collection status
              </button>
            </div>
          </div>
          <div
            className={`mode-banner ${mode === "live" ? "live-banner" : ""}`}
          >
            <div>
              {mode === "demo" ? <Database size={16} /> : <Radio size={16} />}
              <span>
                {mode === "demo" ? (
                  <>
                    <strong>You are viewing demo data</strong> Explore reports
                    and adjust rules before going live.
                  </>
                ) : (
                  <>
                    <strong>{connectionMessage}</strong> {live.length} of {shared.total} saved reports loaded.
                    Updates sync across dashboards every 2 seconds.
                    {invalid > 0 && ` • ${invalid} invalid messages skipped`}
                  </>
                )}
              </span>
            </div>
            <button onClick={() => mode === "demo" ? changeMode("live") : setConnectionOpen(true)}>
              {mode === "demo" ? "View shared data" : "Collection status"}
              <ArrowRight size={14} />
            </button>
          </div>
          {page === "guide" ? (
            <section className="panel guide">
              <h2>What can this data tell you?</h2>
              <h3>Evaluate evidence per report, not per employee</h3>
              <p>
                Each message contains one FIFO-matched pair. Arrival order does
                not guarantee matching time windows, so both windows are checked
                before evaluation. Even overlapping windows cannot identify
                which employee or customer spoke.
              </p>
              <h3>How “All rules found” is calculated</h3>
              <p>
                Eligible reports have a customer and an employee in the same
                camera sample, overlapping vision and speech windows, speech
                evidence, and at least one active rule. Keywords are checked
                against matches and transcripts. The rate is reports with
                evidence for all rules divided by eligible reports.
              </p>
              <h3>Counting evidence and people</h3>
              <p>
                Each rule accepts comma-separated alternatives in any language.
                Evidence is the greater of exact keyword match counts or the
                number of transcript entries containing an alternative. The two
                sources are never added together. This is not an exact utterance
                count. Customer and employee counts are peaks per frame, not
                unique visitor totals.
              </p>
              <h3>Time and data boundaries</h3>
              <p>
                startTime and endTime are displayed in Bangkok time (UTC+7).
                Camera Time values remain unchanged. Vision and speech counts
                are shown separately; they are message counts, not customer
                counts, and do not need to match.
              </p>
              <h3>Where your data lives</h3>
              <p>
                The server collects MQTT reports even when no dashboard is open.
                Reports and service rules are saved in a shared SQLite database.
                Refreshing or restarting the container preserves saved data when
                its data volume is retained. Each dashboard loads the latest 500
                reports first; load older reports to include them in filters,
                statistics, and exports. Demo data is separate. Retained messages
                may be old, and repeated upstream messages may be counted again
                because the payload has no report ID.
              </p>
              <button
                className="button primary"
                onClick={() => setPage("overview")}
              >
                Back to overview
                <ArrowRight size={16} />
              </button>
            </section>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <section className="stats-grid">
                    <div className="stat-card featured">
                      <div className="stat-label">
                        All rules evidenced
                        <ShieldCheck size={19} />
                      </div>
                      <div className="stat-number">
                        {score ?? "—"}
                        {score !== null && <span>%</span>}
                        <span className="stat-tag">Per time window</span>
                      </div>
                      <div className="stat-foot">
                        {passed} of {eligible.length} eligible reports
                      </div>
                      <div className="mini-progress">
                        <div style={{ width: `${score || 0}%` }} />
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">
                        Matched reports
                        <FileText size={19} />
                      </div>
                      <div className="stat-number">
                        {dated.length}
                        <span>reports</span>
                      </div>
                      <div className="stat-foot">
                        <span className="tiny-blue" />
                        One vision + speech pair per report
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">
                        Windows to review
                        <MessageSquareText size={19} />
                      </div>
                      <div className="stat-number amber-text">
                        {reviews}
                        <span>windows</span>
                      </div>
                      <button
                        className="stat-link"
                        onClick={() => {
                          setStatusFilter("review");
                          document
                            .getElementById("reports")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        Review conversations
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">
                        Peak customers
                        <Users size={19} />
                      </div>
                      <div className="stat-number">
                        {dated.length
                          ? Math.max(...dated.map((r) => r.analysis.customers))
                          : "—"}
                        <span>people / frame</span>
                      </div>
                      <div className="stat-foot">
                        Not a unique customer total
                      </div>
                    </div>
                  </section>
                  <div className="analysis-grid">
                    <section className="panel trend-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            The rhythm of your service{" "}
                            <span className="subtle-tag">By time window</span>
                          </h2>
                          <p>Rule evidence alongside peak customer presence.</p>
                        </div>
                        <Activity size={19} className="muted" />
                      </div>
                      <div className="chart-legend">
                        <span>
                          <i className="legend-line" />
                          Customers / frame
                        </span>
                        <span>
                          <i className="legend-square green" />
                          All found
                        </span>
                        <span>
                          <i className="legend-square amber" />
                          Needs review
                        </span>
                        <span>
                          <i className="legend-square gray" />
                          Not evaluated
                        </span>
                      </div>
                      <Trend reports={dated.slice(-24)} onSelect={setDetail} />
                      <div className="chart-note">
                        <CircleHelp size={13} />
                        Latest 24 windows · Select a window to explore the
                        evidence
                      </div>
                    </section>
                    <section className="panel rule-summary">
                      <div className="panel-heading">
                        <div>
                          <h2>Service rules</h2>
                          <p>
                            Evidence across {eligible.length} eligible reports
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          onClick={editRules}
                          aria-label="Edit rules"
                        >
                          <Settings2 size={18} />
                        </button>
                      </div>
                      <div className="rule-summary-list">
                        {activeRules.length ? (
                          activeRules.map((rule, i) => {
                            const found = eligible.filter(
                              (r) =>
                                r.analysis.results.find((x) => x.id === rule.id)
                                  ?.found,
                            ).length;
                            const percent = eligible.length
                              ? Math.round((found / eligible.length) * 100)
                              : 0;
                            const Icon = icons[rule.id] || ShieldCheck;
                            return (
                              <div className="rule-summary-item" key={rule.id}>
                                <div className={`rule-symbol symbol-${i % 3}`}>
                                  <Icon size={18} />
                                </div>
                                <div className="rule-summary-content">
                                  <div>
                                    <strong>{rule.name}</strong>
                                    <span>
                                      {eligible.length ? `${percent}%` : "—"}
                                    </span>
                                  </div>
                                  <p>
                                    {rule.keywords
                                      .split(",")
                                      .map((k) => k.trim())
                                      .join(" / ")}
                                  </p>
                                  <div className="rule-progress">
                                    <div style={{ width: `${percent}%` }} />
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="muted">No active rules</p>
                        )}
                      </div>
                      <button className="rule-edit" onClick={editRules}>
                        Manage service rules
                        <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              <section className="panel reports-panel" id="reports">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Service reports{" "}
                      <span className="number-pill">{dated.length}</span>
                    </h2>
                    <p>
                      Matched reports, with the evidence behind each result.
                    </p>
                  </div>
                  <span className="report-source">
                    <span
                      className={`signal ${mode === "live" ? connection : "demo"}`}
                    />
                    {mode === "demo" ? "DEMO DATA" : "LIVE SESSION"}
                  </span>
                </div>
                <div className="report-controls">
                  <div className="filter-tabs">
                    {[
                      ["all", "All reports", dated.length],
                      ["review", "Needs review", reviews],
                      ["pass", "All rules found", passed],
                      [
                        "unknown",
                        "Insufficient data",
                        dated.filter((r) => r.analysis.status === "unknown")
                          .length,
                      ],
                    ].map(([id, label, count]) => (
                      <button
                        key={id}
                        className={statusFilter === id ? "selected" : ""}
                        onClick={() => setStatusFilter(id)}
                      >
                        {label}
                        <span>{count}</span>
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search conversations or time"
                      aria-label="Search reports"
                    />
                  </label>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          Time window <span>UTC+7</span>
                        </th>
                        <th>
                          Customers / Staff <span>peak</span>
                        </th>
                        <th>Rule evidence</th>
                        <th>Result</th>
                        <th>
                          Messages <span>vision / speech</span>
                        </th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((report) => (
                        <tr key={report.id} onClick={() => setDetail(report)}>
                          <td>
                            <strong>
                              {time(report.payload.vision_analytics.startTime)}{" "}
                              – {time(report.payload.vision_analytics.endTime)}
                            </strong>
                            <small>
                              {dateKey(
                                report.payload.vision_analytics.startTime,
                              )}
                              {report.retained ? " · retained" : ""}
                            </small>
                          </td>
                          <td>
                            <div className="people-cell">
                              <span>
                                <Users size={15} />
                                {report.analysis.customers}
                              </span>
                              <span className="muted">/</span>
                              <span>{report.analysis.employees}</span>
                            </div>
                          </td>
                          <td>
                            <div className="rule-dots">
                              {report.analysis.results.map((r) => (
                                <span
                                  key={r.id}
                                  className={r.found ? "found" : "missing"}
                                  title={`${r.name}: ${r.count} / ${r.minimum}`}
                                >
                                  {r.found ? (
                                    <Check size={12} />
                                  ) : (
                                    <span>–</span>
                                  )}
                                </span>
                              ))}
                              <span className="muted">
                                {
                                  report.analysis.results.filter((r) => r.found)
                                    .length
                                }
                                /{activeRules.length}
                              </span>
                            </div>
                          </td>
                          <td>
                            <Badge status={report.analysis.status} />
                          </td>
                          <td className="message-count">
                            {report.payload.vision_analytics.count}
                            <span>/</span>
                            {report.payload.speech_analytics.count}
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`View report ${time(report.payload.vision_analytics.startTime)}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetail(report);
                              }}
                            >
                              <ChevronRight size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <div className="empty">
                    <Radio size={30} />
                    <h3>
                      {reports.length
                        ? "No reports match your filters"
                        : "Ready to hear from your restaurant"}
                    </h3>
                    <p>
                      {reports.length
                        ? "Try a different date, status, or search term."
                        : connection === "connected"
                          ? "Connected. Waiting for the first paired report from the FIFO matcher."
                          : "The server is reconnecting to MQTT. Saved reports remain available."}
                    </p>
                    {!reports.length && connection !== "connected" && (
                      <button
                        className="button primary"
                        onClick={() => setConnectionOpen(true)}
                      >
                        Collection status
                      </button>
                    )}
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    Showing {filtered.length} of {dated.length} reports
                  </span>
                  {mode === "live" && shared.hasOlder && (
                    <button className="button compact" disabled={shared.loadingOlder}
                      onClick={() => shared.loadOlder().catch((error) => setNotice(error.message))}>
                      {shared.loadingOlder ? "Loading…" : "Load older reports"}
                    </button>
                  )}
                  <span>
                    <Clock3 size={13} />
                    Report times follow the vision window
                  </span>
                </div>
              </section>
              <div className="insight-note">
                <ShieldCheck size={18} />
                <p>
                  <strong>A signal to explore, not a verdict.</strong> A keyword
                  does not identify the speaker. Missing evidence does not prove
                  a missed interaction. Always review the context.
                </p>
                <button onClick={() => setPage("guide")}>
                  How to read this
                  <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}
          <footer>
            <span className="footer-brand">chew.</span>
            <span>Better conversations. Better service.</span>
            <span>
              Vision by Nara <i /> Speech by EchoDesk
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CircleHelp size={18} />
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {connectionOpen && (
        <Modal title="Shared MQTT collection" subtitle="The server collects reports for every dashboard."
          onClose={() => setConnectionOpen(false)}>
          <div className="modal-body">
            <div className="connection-status">
              <Radio size={20} />
              <div><strong>Connection status</strong><p role="status">{connectionMessage}</p></div>
            </div>
            <label className="field">Broker URL<input readOnly value={config.url} /></label>
            <label className="field">Subscription topic<input readOnly value={config.topic} /></label>
            <p className="field-hint">
              Collection runs continuously and reconnects automatically. Closing this
              page does not stop collection. Broker settings are managed on the server.
            </p>
            <p>{shared.total} reports saved in SQLite. Service rules are shared across dashboards.</p>
            <div className="modal-actions">
              <button className="button primary" onClick={() => { changeMode("live"); setConnectionOpen(false); }}>
                View shared reports
              </button>
            </div>
          </div>
        </Modal>
      )}
      {ruleDraft && (
        <Modal
          title="Service rules"
          subtitle="Shared rules apply to every dashboard and saved report."
          onClose={() => setRuleDraft(null)}
          wide
        >
          <div className="modal-body">
            <div className="feedback info">
              <CircleHelp size={18} />
              <span>
                Separate alternatives with commas, e.g. hello, welcome. Any
                alternative counts as evidence. Keywords can be in any language.
              </span>
            </div>
            {ruleDraft.map((r, i) => (
              <div className="rule-editor" key={r.id}>
                <div className="rule-editor-top">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) =>
                        setRuleDraft((rows) =>
                          rows.map((row, index) =>
                            index === i
                              ? { ...row, enabled: e.target.checked }
                              : row,
                          ),
                        )
                      }
                    />
                    Enable rule
                  </label>
                  <button
                    className="text-button danger-text"
                    onClick={() =>
                      setRuleDraft((rows) =>
                        rows.filter((_, index) => index !== i),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="rule-editor-fields">
                  {[
                    ["name", "Rule name"],
                    ["keywords", "Keywords to find"],
                    ["minimum", "Min. / report"],
                  ].map(([key, label]) => (
                    <label className="field" key={key}>
                      {label}
                      <input
                        type={key === "minimum" ? "number" : "text"}
                        min={key === "minimum" ? 1 : undefined}
                        value={r[key]}
                        onChange={(e) =>
                          setRuleDraft((rows) =>
                            rows.map((row, index) =>
                              index === i
                                ? {
                                    ...row,
                                    [key]:
                                      key === "minimum"
                                        ? Number(e.target.value)
                                        : e.target.value,
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              className="button"
              onClick={() =>
                setRuleDraft((rows) => [
                  ...rows,
                  {
                    id: createId(),
                    name: "",
                    keywords: "",
                    minimum: 1,
                    enabled: true,
                  },
                ])
              }
            >
              <Plus size={16} />
              Add rule
            </button>
            {ruleError && (
              <p className="danger-text" role="alert">
                {ruleError}
              </p>
            )}
            <div className="modal-actions">
              <button className="button" onClick={() => setRuleDraft(null)}>
                Cancel
              </button>
              <button className="button primary" disabled={savingRules || !shared.ready} onClick={saveRules}>
                <Check size={16} />
                {savingRules ? "Saving…" : "Save shared rules"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {selected && (
        <Modal
          title={`Report ${time(selected.payload.vision_analytics.startTime)} – ${time(selected.payload.vision_analytics.endTime)}`}
          subtitle={`${dateKey(selected.payload.vision_analytics.startTime)} · Bangkok time · UTC+7 · ${selected.source === "demo" ? "Demo data" : selected.source}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="modal-body">
            <div className="detail-status">
              <Badge status={selected.analysis.status} />
              <p>{selected.analysis.reason}</p>
            </div>
            <div className="detail-times">
              <div>
                <Video size={17} />
                <strong>Nara · Vision</strong>
                <span>
                  {dateKey(selected.payload.vision_analytics.startTime)}{" "}
                  {time(selected.payload.vision_analytics.startTime)} →{" "}
                  {dateKey(selected.payload.vision_analytics.endTime)}{" "}
                  {time(selected.payload.vision_analytics.endTime)}
                </span>
                <small>
                  {selected.payload.vision_analytics.count} messages
                </small>
              </div>
              <div>
                <AudioLines size={17} />
                <strong>EchoDesk · Speech</strong>
                <span>
                  {dateKey(selected.payload.speech_analytics.startTime)}{" "}
                  {time(selected.payload.speech_analytics.startTime)} →{" "}
                  {dateKey(selected.payload.speech_analytics.endTime)}{" "}
                  {time(selected.payload.speech_analytics.endTime)}
                </span>
                <small>
                  {selected.payload.speech_analytics.count} messages
                </small>
              </div>
            </div>
            <h3>Rule evidence</h3>
            <div className="evidence-list">
              {selected.analysis.results.map((r) => (
                <div key={r.id}>
                  <span
                    className={
                      r.found ? "evidence-icon found" : "evidence-icon missing"
                    }
                  >
                    {r.found ? <Check size={15} /> : "–"}
                  </span>
                  <strong>{r.name}</strong>
                  <span>
                    {r.count} / {r.minimum}
                  </span>
                  <small>
                    matches {r.matchCount} · transcript {r.transcriptCount}
                  </small>
                </div>
              ))}
            </div>
            <h3>
              Conversation transcript{" "}
              <span className="muted">
                {selected.payload.speech_analytics.transcript.length} messages
              </span>
            </h3>
            <div className="transcripts">
              {selected.payload.speech_analytics.transcript.length ? (
                selected.payload.speech_analytics.transcript.map((t, i) => (
                  <div key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <p>{t || "(empty message)"}</p>
                  </div>
                ))
              ) : (
                <p className="muted">No transcript in this report.</p>
              )}
            </div>
            <p className="field-hint">
              Speaker identity and sentence timestamps are not provided. These
              lines cannot be attributed to an employee.
            </p>
            <h3>Keywords from EchoDesk</h3>
            <div className="keywords">
              {selected.payload.speech_analytics.matches.length ? (
                selected.payload.speech_analytics.matches.map((m, i) => (
                  <span key={i}>
                    {m.keyword}
                    <b>{m.count}</b>
                  </span>
                ))
              ) : (
                <p className="muted">No keyword matches.</p>
              )}
            </div>
            <h3>
              Camera samples{" "}
              <span className="muted">
                Time values are preserved from the source
              </span>
            </h3>
            <div className="table-wrap">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Customers</th>
                    <th>Employees</th>
                    <th>Caps</th>
                    <th>Headbands</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.payload.vision_analytics.data.map((row, i) => (
                    <tr key={i}>
                      <td>{row.Time}</td>
                      {[
                        "Customer Detected",
                        "Employee Detected",
                        "Cap Detected",
                        "Headband Detected",
                      ].map((key) => (
                        <td key={key}>{row[key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="raw-data">
              <summary>View original JSON</summary>
              <pre>{JSON.stringify(selected.payload, null, 2)}</pre>
            </details>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Trend({ reports, onSelect }) {
  if (!reports.length)
    return (
      <div className="chart-empty">
        Your service trend will appear when reports arrive.
      </div>
    );
  const max = Math.max(4, ...reports.map((r) => r.analysis.customers));
  const width = 700,
    height = 172,
    left = 28,
    right = 18,
    top = 16,
    bottom = 24;
  const x = (i) => left + ((i + 0.5) * (width - left - right)) / reports.length;
  const y = (value) =>
    height - bottom - (value / max) * (height - top - bottom);
  const points = reports
    .map((r, i) => `${x(i)},${y(r.analysis.customers)}`)
    .join(" ");
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Peak customers per frame across report windows"
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7696da" stopOpacity=".19" />
            <stop offset="100%" stopColor="#7696da" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={left}
              x2={width - right}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#e8edf1"
              strokeDasharray="4 4"
            />
            <text x="0" y={y(max * f) + 4} fill="#9aa6b5" fontSize="10">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        <polygon
          points={`${x(0)},${y(0)} ${points} ${x(reports.length - 1)},${y(0)}`}
          fill="url(#area)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#6287cb"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {reports.map((r, i) => (
          <g key={r.id}>
            <circle
              cx={x(i)}
              cy={y(r.analysis.customers)}
              r="3.5"
              fill="white"
              stroke="#6287cb"
              strokeWidth="2"
            />
            <text
              x={x(i)}
              y={height - 5}
              textAnchor="middle"
              fontSize="10"
              fill="#94a0ae"
            >
              {reports.length <= 12 || i % 2 === 0
                ? time(r.payload.vision_analytics.startTime)
                : ""}
            </text>
          </g>
        ))}
      </svg>
      <div
        className="window-strip"
        style={{ gridTemplateColumns: `repeat(${reports.length}, 1fr)` }}
      >
        {reports.map((r) => (
          <button
            className={`window-cell ${r.analysis.status}`}
            key={r.id}
            onClick={() => onSelect(r)}
            title={`${time(r.payload.vision_analytics.startTime)} · ${STATUS[r.analysis.status].label}`}
            aria-label={`${time(r.payload.vision_analytics.startTime)} ${STATUS[r.analysis.status].label}`}
          >
            {r.analysis.status === "pass" ? (
              <Check size={12} />
            ) : r.analysis.status === "review" ? (
              "!"
            ) : (
              "–"
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
