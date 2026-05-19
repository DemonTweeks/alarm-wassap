/* ── State ─────────────────────────────────────────────── */
const history = [];
const MAX_HISTORY = 50;
let currentAlarmResult = null;
let alarmFilters = { visible: 'all', maintainstatus: 'all' };

/* ── Utilities ─────────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-MY", { hour12: false }).replace(",", "");
}

function severityBadge(severity) {
  const s = (severity || "").toLowerCase();
  const map = {
    critical: "badge-critical",
    major: "badge-major",
    minor: "badge-minor",
    warning: "badge-warning",
    indeterminate: "badge-indeterminate",
  };
  const cls = map[s] || "badge-warning";
  return `<span class="badge ${cls}">${severity || "?"}</span>`;
}

// ZTE alarmraisedtime is epoch milliseconds
function fmtEpochMs(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-MY", { hour12: false }).replace(",", "");
}

function alarmSeverity(a) { return a.perceivedseverityname || "Unknown"; }
function alarmName(a)     { return a.codename || "—"; }
function alarmNe(a)       { return a._ne_name || a.mename || "—"; }
function alarmTime(a)     { return fmtEpochMs(a.alarmraisedtime); }
function alarmType(a)     { return a.alarmtypename || "—"; }
function alarmLocation(a) { return a.ran_fm_alarm_location?.displayname || "—"; }
function alarmDuration(a) { return a.durationname || "—"; }

/* ── Tab switching ──────────────────────────────────────── */
function showTab(tabId, el) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  el.classList.add("active");
}

/* ── UME Health ─────────────────────────────────────────── */
async function loadHealth() {
  const container = document.getElementById("ume-cards");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (!data.ume_servers || data.ume_servers.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>No UME servers configured</div>`;
      return;
    }
    container.innerHTML = data.ume_servers.map(s => `
      <div class="ume-card">
        <div class="ume-name">${s.id}</div>
        <div class="ume-host">${s.host}:${s.port}</div>
        <div class="ume-status">
          <div class="status-dot ${s.reachable ? "ok" : "err"}"></div>
          <span>${s.reachable ? "Reachable" : "Unreachable"}</span>
        </div>
      </div>
    `).join("");
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div>Failed to load health</div>`;
  }
}

/* ── Topology ────────────────────────────────────────────── */
async function loadTopology() {
  try {
    const res = await fetch("/api/topology/sites");
    const data = await res.json();
    renderTopology(data);
  } catch (e) {
    document.getElementById("topo-body").innerHTML =
      `<tr><td colspan="3" style="padding:24px;text-align:center;color:var(--muted);">Failed to load</td></tr>`;
  }
}

function renderTopology(data) {
  const tbody = document.getElementById("topo-body");
  const timeEl = document.getElementById("topo-refresh-time");
  timeEl.textContent = data.last_refresh
    ? `Last refresh: ${fmtTime(data.last_refresh)}`
    : "Not yet refreshed";

  if (!data.sites || data.sites.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="padding:24px;text-align:center;color:var(--muted);">No sites discovered</td></tr>`;
    return;
  }
  tbody.innerHTML = data.sites.map(s => {
    const umes = [...new Set(s.nes.map(n => n.ume_id))].join(", ");
    return `<tr>
      <td><strong>${s.site_code}</strong></td>
      <td>${s.nes.length}</td>
      <td style="color:var(--muted)">${umes}</td>
    </tr>`;
  }).join("");
}

async function refreshTopology() {
  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>`;
  try {
    const res = await fetch("/api/topology/refresh", { method: "POST" });
    const data = await res.json();
    await loadTopology();
    await loadHealth();
  } catch (e) {
    console.error("Topology refresh failed", e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Refresh";
  }
}

/* ── Alarm Query ─────────────────────────────────────────── */
async function submitQuery(e) {
  e.preventDefault();
  const input = document.getElementById("site-input");
  const site = input.value.trim().toUpperCase();
  if (site.length !== 4) {
    document.getElementById("query-status").textContent = "Site code must be 4 letters";
    return;
  }

  const btn = document.getElementById("btn-query");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>`;
  document.getElementById("query-status").textContent = `Querying ${site}...`;

  try {
    const res = await fetch("/api/alarm/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site }),
    });
    const data = await res.json();
    currentAlarmResult = data;
    alarmFilters = { visible: 'all', maintainstatus: 'all' };
    document.getElementById('filter-visible').value = 'all';
    document.getElementById('filter-maintain').value = 'all';
    renderAlarmResults(data);
    showTab("tab-results", document.querySelector(".tab"));
  } catch (err) {
    document.getElementById("alarm-results").innerHTML =
      `<div class="empty-state"><div class="icon">❌</div>Query failed: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Query";
    document.getElementById("query-status").textContent = "";
  }
}

function applyAlarmFilters(alarms) {
  return alarms.filter(a => {
    if (alarmFilters.visible !== 'all' && String(a.visible ?? '') !== alarmFilters.visible)
      return false;
    const ms = String(a.maintainstatus?.value ?? a.maintainstatus ?? '');
    if (alarmFilters.maintainstatus !== 'all' && ms !== alarmFilters.maintainstatus)
      return false;
    return true;
  });
}

function onFilterChange() {
  alarmFilters.visible = document.getElementById('filter-visible').value;
  alarmFilters.maintainstatus = document.getElementById('filter-maintain').value;
  if (currentAlarmResult) renderAlarmResults(currentAlarmResult);
}

function renderAlarmResults(data) {
  const container = document.getElementById("alarm-results");
  const filterBar = document.getElementById("alarm-filter-bar");

  if (!data.found) {
    filterBar.style.display = 'none';
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <div>Site <strong>${data.site}</strong> not found in topology cache</div>
        <div style="margin-top:8px;font-size:12px;">Try refreshing topology first</div>
      </div>`;
    return;
  }

  if (data.alarms.length === 0) {
    filterBar.style.display = 'none';
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">✅</div>
        <div>No active alarms for <strong>${data.site}</strong></div>
        <div style="margin-top:8px;color:var(--muted);font-size:12px;">${data.ne_count} NE(s) queried · ${fmtTime(data.query_time)}</div>
      </div>`;
    return;
  }

  filterBar.style.display = 'flex';

  const filtered = applyAlarmFilters(data.alarms);
  const total = data.alarms.length;
  document.getElementById('filter-count').textContent =
    filtered.length < total ? `Showing ${filtered.length} of ${total}` : `${total} alarm${total !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <div>No alarms match the current filters</div>
      </div>`;
    return;
  }

  const rows = filtered.map(a => `
    <tr>
      <td>${severityBadge(alarmSeverity(a))}</td>
      <td>${alarmName(a)}</td>
      <td style="color:var(--muted);font-size:12px">${alarmNe(a)}</td>
      <td style="color:var(--muted);font-size:12px">${alarmTime(a)}</td>
      <td style="color:var(--muted);font-size:12px">${alarmType(a)}</td>
      <td style="color:var(--muted);font-size:12px">${alarmLocation(a)}</td>
      <td style="color:var(--muted);font-size:12px">${alarmDuration(a)}</td>
      <td style="color:var(--muted);font-size:12px;text-align:center">${a.visible ?? '—'}</td>
      <td style="color:var(--muted);font-size:12px;text-align:center">${a.maintainstatus?.value ?? a.maintainstatus ?? '—'}</td>
    </tr>`).join("");

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div>
        <strong>${data.site}</strong>
        <span style="color:var(--red);font-size:20px;font-weight:700;margin-left:10px;">${filtered.length}</span>
        <span style="color:var(--muted);font-size:12px;"> active alarm${filtered.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="refresh-time">${data.ne_count} NE(s) · ${fmtTime(data.query_time)}</div>
    </div>
    <div style="overflow-x:auto;">
      <table class="alarm-table">
        <thead>
          <tr>
            <th>Severity</th>
            <th>Alarm Name</th>
            <th>NE</th>
            <th>Raised Time</th>
            <th>Type</th>
            <th>Location</th>
            <th>Duration</th>
            <th>Visible</th>
            <th>Maintain</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ── Query History ──────────────────────────────────────── */
function addToHistory(data) {
  history.unshift(data);
  if (history.length > MAX_HISTORY) history.pop();
  renderHistory();
  const countEl = document.getElementById("history-count");
  countEl.textContent = history.length;
}

function renderHistory() {
  const container = document.getElementById("history-list");
  if (history.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📋</div><div>No queries yet</div></div>`;
    return;
  }
  container.innerHTML = history.map(h => {
    const count = h.alarms ? h.alarms.length : 0;
    const hasAlarms = count > 0;
    return `<div class="history-item">
      <div class="site-code">${h.site || "?"}</div>
      <div class="alarm-count ${hasAlarms ? "has-alarms" : "no-alarms"}">${count}</div>
      <div style="font-size:12px;color:var(--muted)">${hasAlarms ? "active alarm" + (count !== 1 ? "s" : "") : "clear"}</div>
      <div class="meta">${fmtTime(h.query_time || h.timestamp)}</div>
    </div>`;
  }).join("");
}

/* ── WebSocket ──────────────────────────────────────────── */
function connectWebSocket() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    document.getElementById("ws-dot").classList.add("connected");
    document.getElementById("ws-label").textContent = "Live";
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "alarm_query") {
        addToHistory(msg.data);
        if (document.getElementById("tab-conversations").classList.contains("active")) {
          loadConversations();
        } else {
          const count = document.getElementById("conv-count");
          count.style.background = "var(--accent)";
          count.style.color = "#fff";
        }
      } else if (msg.type === "topology_refresh") {
        loadTopology();
      } else if (msg.type === "ume_health_change") {
        loadHealth();
      }
    } catch (_) {}
  };

  ws.onclose = () => {
    document.getElementById("ws-dot").classList.remove("connected");
    document.getElementById("ws-label").textContent = "Reconnecting...";
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => ws.close();
}

/* ── Conversations ──────────────────────────────────────── */
let activeSession = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPhone(sessionId) {
  if (sessionId === "dashboard") return "Dashboard";
  return sessionId.replace("@c.us", "").replace("@g.us", " (group)");
}

async function loadConversations() {
  try {
    const res = await fetch("/api/conversations");
    const sessions = await res.json();
    renderSessions(sessions);
    document.getElementById("conv-count").textContent = sessions.length || "";
    if (sessions.length > 0 && !activeSession) {
      await selectSession(sessions[0].session_id);
    } else if (activeSession) {
      await selectSession(activeSession);
    }
  } catch (e) {
    document.getElementById("conv-sessions").innerHTML =
      `<div class="empty-state" style="padding:24px"><div class="icon">❌</div><div>Failed to load</div></div>`;
  }
}

function renderSessions(sessions) {
  const container = document.getElementById("conv-sessions");
  if (!sessions.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px"><div class="icon">💬</div><div>No conversations yet</div></div>`;
    return;
  }
  container.innerHTML = sessions.map(s => {
    const displayName = s.contact_name || formatPhone(s.session_id);
    return `
    <div class="conv-session-item ${s.session_id === activeSession ? "active" : ""}"
         data-sid="${escapeHtml(s.session_id)}"
         onclick="selectSession('${escapeHtml(s.session_id)}')">
      <div class="conv-session-name">${escapeHtml(displayName)}</div>
      <div class="conv-session-meta">
        <span>${s.message_count} msg${s.message_count !== 1 ? "s" : ""}</span>
        <span>${fmtTime(s.last_active)}</span>
      </div>
    </div>`;
  }).join("");
}

async function selectSession(sessionId) {
  activeSession = sessionId;
  document.querySelectorAll(".conv-session-item").forEach(el => {
    el.classList.toggle("active", el.dataset.sid === sessionId);
  });
  const sessionEl = document.querySelector(`.conv-session-item[data-sid="${CSS.escape(sessionId)}"]`);
  const displayName = sessionEl?.querySelector(".conv-session-name")?.textContent || formatPhone(sessionId);
  document.getElementById("conv-header").textContent = displayName;
  const container = document.getElementById("conv-messages");
  container.innerHTML = `<div class="empty-state"><div class="icon">⏳</div><div>Loading...</div></div>`;
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`);
    const messages = await res.json();
    renderMessages(messages.reverse());
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div>Failed to load messages</div></div>`;
  }
}

function renderMessages(messages) {
  const container = document.getElementById("conv-messages");
  if (!messages.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">💬</div><div>No messages</div></div>`;
    return;
  }
  container.innerHTML = messages.map(m => {
    const isOut = m.direction === "outbound";
    let meta = "";
    if (m.metadata) {
      try {
        const md = JSON.parse(m.metadata);
        if (md.alarm_count !== undefined)
          meta = `<div class="msg-meta">${md.alarm_count} alarm${md.alarm_count !== 1 ? "s" : ""} · ${md.site || ""}</div>`;
      } catch (_) {}
    }
    return `<div class="msg-bubble ${isOut ? "msg-out" : "msg-in"}">
      <div class="msg-body">${escapeHtml(m.body || "")}</div>
      ${meta}
      <div class="msg-time">${fmtTime(m.created_at)}</div>
    </div>`;
  }).join("");
  container.scrollTop = container.scrollHeight;
}

/* ── Init ───────────────────────────────────────────────── */
(async () => {
  await Promise.all([loadHealth(), loadTopology(), loadConversations()]);
  connectWebSocket();
})();
