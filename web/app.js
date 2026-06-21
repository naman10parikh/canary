/* web/app.js — canary cockpit SPA (G28, PLAN §10). Vanilla JS, zero dependencies, no build.
 *
 * Wires the 5 views to the read-only JSON endpoints in web/server.mjs:
 *   Brain browser → /api/brain-files, /api/brain-file, /api/brain, /api/explain
 *   Run log       → /api/runs
 *   SLO & alerts  → /api/slo
 *   Delivery      → /api/delivery
 *   Ask the emp   → /api/brain + /api/explain (read-only)
 * Read-mostly (Q6): no endpoint here mutates — there is no instrument/audit/page button.
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Minimal HTML-escape — all server text is rendered as text, never injected as markup. */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => ({ error: `bad response (${res.status})` }));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

/* --------------------------------------------------------------------- tabs --- */
function showView(name) {
  $$("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === name)));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  // Lazy-load each data view on first reveal.
  if (name === "runs" && !showView._runs) { showView._runs = true; loadRuns(); }
  if (name === "slo" && !showView._slo) { showView._slo = true; loadSlo(); }
  if (name === "delivery" && !showView._delivery) { showView._delivery = true; loadDelivery(); }
}

/* ------------------------------------------------------------ brain browser --- */
async function loadArtifactList() {
  try {
    const { files } = await getJson("/api/brain-files");
    const list = $("#artifact-list");
    list.innerHTML = "";
    files.forEach((f) => {
      const b = document.createElement("button");
      b.textContent = f.replace(/\.md$/, "");
      b.dataset.file = f;
      b.addEventListener("click", () => openArtifact(f, b));
      list.appendChild(b);
    });
  } catch (err) {
    $("#artifact-list").innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

async function openArtifact(name, btn) {
  $$("#artifact-list button").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
  const reader = $("#brain-reader");
  reader.innerHTML = `<span class="loading">Loading ${esc(name)}…</span>`;
  try {
    const { markdown } = await getJson(`/api/brain-file?name=${encodeURIComponent(name)}`);
    reader.innerHTML = `<pre>${renderMarkdownLite(markdown)}</pre>`;
  } catch (err) {
    reader.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/** Lightest possible markdown: escape, then bold **…** so headings/labels stand out. No HTML injection. */
function renderMarkdownLite(md) {
  return esc(md).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

async function runBrainSearch() {
  const q = $("#brain-q").value.trim();
  if (!q) return;
  const hitsEl = $("#brain-hits");
  hitsEl.innerHTML = `<span class="loading">Searching brain for "${esc(q)}"…</span>`;
  try {
    const { hits } = await getJson(`/api/brain?q=${encodeURIComponent(q)}`);
    if (!hits.length) { hitsEl.innerHTML = `<span class="empty">No hits for "${esc(q)}".</span>`; return; }
    hitsEl.innerHTML = "";
    hits.forEach((h) => {
      const row = document.createElement("div");
      row.className = "hit";
      const id = h.id ? esc(h.id) : "—";
      row.innerHTML =
        `<span class="id">${id}</span>` +
        `<span class="heading">${esc(h.heading || h.file)}</span>` +
        `<span class="score">score ${esc(h.score)}</span>`;
      if (h.id) row.addEventListener("click", () => readById(h.id));
      hitsEl.appendChild(row);
    });
  } catch (err) {
    hitsEl.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

async function readById(id) {
  const reader = $("#brain-reader");
  reader.innerHTML = `<span class="loading">Reading ${esc(id)}…</span>`;
  try {
    const r = await getJson(`/api/explain?id=${encodeURIComponent(id)}`);
    reader.innerHTML = `<pre>${renderMarkdownLite(r.body)}</pre>`;
    reader.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    reader.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/* ----------------------------------------------------------------- run log --- */
async function loadRuns() {
  const wrap = $("#runs-wrap");
  try {
    const { runs } = await getJson("/api/runs?limit=60");
    if (!runs.length) { wrap.innerHTML = `<span class="empty">No runs logged yet — run <code>canary instrument …</code>.</span>`; return; }
    const rows = runs
      .map((r) => {
        const trace = (r["trace.id"] || "").slice(0, 12);
        const dur = typeof r.durationMs === "number" ? r.durationMs.toFixed(2) : "—";
        const okClass = r.outcome === "ok" ? "ok" : "bad";
        return (
          `<tr>` +
          `<td class="mono">${esc((r.ts || "").replace("T", " ").replace(/\..*/, ""))}</td>` +
          `<td class="mono">${esc(r.command || "—")}</td>` +
          `<td class="mono">${esc(r.model || "—")}</td>` +
          `<td class="num">${esc(dur)} ms</td>` +
          `<td class="mono">${esc(trace)}…</td>` +
          `<td class="num">${esc(r.toolCalls ?? "—")}</td>` +
          `<td><span class="badge ${okClass}">${esc(r.outcome || "—")}</span></td>` +
          `</tr>`
        );
      })
      .join("");
    wrap.innerHTML =
      `<table><thead><tr><th>when</th><th>command</th><th>model</th><th>duration</th><th>trace.id</th><th>tools</th><th>outcome</th></tr></thead><tbody>${rows}</tbody></table>`;
  } catch (err) {
    wrap.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/* ----------------------------------------------------------- SLO & alerts --- */
async function loadSlo() {
  const wrap = $("#slo-wrap");
  try {
    const s = await getJson("/api/slo?service=sample&target=99.9");
    const budgetPct = (s.budget * 100).toFixed(2);
    const valid = s.promtoolValid
      ? `<span class="badge ok">promtool ✓</span>`
      : `<span class="badge bad">promtool ✗</span>`;
    const summary =
      `<div class="slo-summary">` +
      `<div class="stat"><div class="label">service</div><div class="value small">${esc(s.service)}</div></div>` +
      `<div class="stat"><div class="label">target</div><div class="value">${esc(s.target)}%</div></div>` +
      `<div class="stat"><div class="label">error budget</div><div class="value small">${esc(budgetPct)}% &nbsp;${valid}</div></div>` +
      `</div>`;
    const meta =
      `<div class="card" style="margin-bottom:16px"><div class="num" style="font-size:12px;color:var(--text-dim)">` +
      `SLI kind: <strong style="color:var(--text)">${esc(s.sliKind)}</strong> · ` +
      `${esc((s.recordingRules || []).length)} recording rules · ` +
      `burn-rate alerts: ${(s.alertRules || []).map((a) => `<code>${esc(a)}</code>`).join(" · ")}` +
      `</div></div>`;
    const yaml = `<div class="rules-yaml"><pre>${esc(s.yaml)}</pre></div>`;
    wrap.innerHTML = summary + meta + yaml;
  } catch (err) {
    wrap.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/* ------------------------------------------------------------ delivery --- */
async function loadDelivery() {
  const wrap = $("#delivery-wrap");
  try {
    const d = await getJson("/api/delivery");
    const overall = d.delivered
      ? `<span class="badge ok">all channels delivered</span>`
      : `<span class="badge bad">${esc(d.dead.length)} dead channel(s)</span>`;
    const synthetic = d.synthetic
      ? `<div class="answer boundary-note">No channels configured — showing a SYNTHETIC heartbeat (mock channels). Configure real channels via <code>CANARY_DELIVERY_CHANNELS</code> or <code>.canary/delivery.json</code>. A firing rule ≠ a delivered page (S5).</div>`
      : "";
    const rows = (d.channels || [])
      .map((c) => {
        const dead = !c.delivered;
        const status = c.delivered
          ? `<span class="badge ok">delivered</span>`
          : `<span class="badge bad">DEAD</span>`;
        return (
          `<div class="channel ${dead ? "dead" : ""}">` +
          `<span class="cname">${esc(c.name)}</span>` +
          `<span class="ctype">${esc(c.type)}</span>` +
          `${status}` +
          `<span class="clat num">${esc(c.latencyMs)} ms</span>` +
          `</div>` +
          (c.error ? `<div class="escalation">↳ ${esc(c.error)}</div>` : "")
        );
      })
      .join("");
    const escalations = (d.escalations || [])
      .map((e) => `<div class="escalation">⚠ dead channel <strong>${esc(e.deadChannel)}</strong> re-reported via <strong>${esc(e.viaChannel)}</strong> (within one cycle)</div>`)
      .join("");
    wrap.innerHTML =
      `<div class="card"><div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">${overall}<span class="num" style="font-size:12px;color:var(--text-faint)">cycle ${esc(d.latencyMs)} ms</span></div>${rows}${escalations}</div>${synthetic}`;
  } catch (err) {
    wrap.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

/* ------------------------------------------------------- ask the employee --- */
async function ask() {
  const q = $("#ask-q").value.trim();
  if (!q) return;
  const out = $("#ask-answer");
  out.innerHTML = `<span class="loading">Asking canary…</span>`;
  const isId = /^(S\d+|§?[0-9][0-9a-z.]*|[A-Da-d]\d+)$/.test(q);
  try {
    if (isId) {
      const r = await getJson(`/api/explain?id=${encodeURIComponent(q)}`);
      out.innerHTML =
        `<div class="card"><div class="mono" style="color:var(--amber);margin-bottom:8px">${esc(r.id)} · ${esc(r.source)}</div><pre style="margin:0;white-space:pre-wrap;font-family:var(--mono);font-size:12.5px;line-height:1.7;color:var(--text-dim)">${renderMarkdownLite(r.body)}</pre></div>` +
        boundaryNote();
    } else {
      const { hits } = await getJson(`/api/brain?q=${encodeURIComponent(q)}`);
      if (!hits.length) { out.innerHTML = `<span class="empty">canary has no opinion on that (no brain hit).</span>` + boundaryNote(); return; }
      const top = hits[0];
      let detail = "";
      if (top.id) {
        try { const r = await getJson(`/api/explain?id=${encodeURIComponent(top.id)}`); detail = `<pre style="margin:10px 0 0;white-space:pre-wrap;font-family:var(--mono);font-size:12.5px;line-height:1.7;color:var(--text-dim)">${renderMarkdownLite(r.body)}</pre>`; } catch { /* fall back to the hit heading */ }
      }
      const others = hits.slice(1).map((h) => `<div class="hit"><span class="id">${esc(h.id || "—")}</span><span class="heading">${esc(h.heading || h.file)}</span></div>`).join("");
      out.innerHTML =
        `<div class="card"><div class="mono" style="color:var(--amber);margin-bottom:6px">${esc(top.id || top.file)}</div><div style="color:var(--text)">${esc(top.heading || "")}</div>${detail}</div>` +
        (others ? `<div style="margin-top:12px">${others}</div>` : "") +
        boundaryNote();
    }
  } catch (err) {
    out.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  }
}

function boundaryNote() {
  return `<div class="boundary-note">Boundary: token cost / spend is <strong>agentmoney's</strong>, not canary's. canary stops at <code>gen_ai.client.operation.duration</code> / <code>.exception</code> and never reads <code>gen_ai.usage.*</code>.</div>`;
}

/* ------------------------------------------------------------------- init --- */
function init() {
  $$("nav.tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#brain-go").addEventListener("click", runBrainSearch);
  $("#brain-q").addEventListener("keydown", (e) => { if (e.key === "Enter") runBrainSearch(); });
  $("#ask-go").addEventListener("click", ask);
  $("#ask-q").addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
  loadArtifactList();
}

document.addEventListener("DOMContentLoaded", init);
