import { Router, type Request, type Response } from 'express';
import { listRuns, getRunDetail } from '../services/gcsService.js';

export const dashboardRouter = Router();

// API endpoints
dashboardRouter.get('/api/runs', async (_req: Request, res: Response) => {
  try {
    const runs = await listRuns(50);
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

dashboardRouter.get('/api/runs/:filename', async (req: Request, res: Response) => {
  try {
    const data = await getRunDetail(req.params.filename);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Dashboard HTML
dashboardRouter.get('/dashboard', (_req: Request, res: Response) => {
  res.type('html').send(DASHBOARD_HTML);
});

// Replay view — chat-style replay of the latest run
dashboardRouter.get('/replay', (_req: Request, res: Response) => {
  res.type('html').send(REPLAY_HTML);
});

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Accounting Agent — Live Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 14px; }
  a { color: #58a6ff; text-decoration: none; }

  .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .live-dot { width: 8px; height: 8px; background: #3fb950; border-radius: 50%; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  .header-right { margin-left: auto; color: #8b949e; font-size: 12px; }

  .stats { display: flex; gap: 16px; padding: 16px 24px; background: #161b22; border-bottom: 1px solid #30363d; }
  .stat { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; min-width: 140px; }
  .stat-label { color: #8b949e; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-value { font-size: 24px; font-weight: 600; margin-top: 4px; }
  .stat-value.green { color: #3fb950; }
  .stat-value.red { color: #f85149; }
  .stat-value.blue { color: #58a6ff; }

  .container { max-width: 1400px; margin: 0 auto; padding: 24px; }

  .run-list { display: flex; flex-direction: column; gap: 8px; }

  .run-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; cursor: pointer; transition: border-color 0.2s; }
  .run-card:hover { border-color: #58a6ff; }
  .run-card.expanded { border-color: #58a6ff; }

  .run-summary { display: grid; grid-template-columns: 180px 1fr 80px 80px 90px 90px; align-items: center; padding: 12px 16px; gap: 12px; }
  .run-time { color: #8b949e; font-size: 12px; font-family: monospace; }
  .run-prompt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .run-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; text-align: center; }
  .badge-tools { background: #1f2937; color: #93c5fd; }
  .badge-errors { background: #f8514922; color: #f85149; }
  .badge-errors.zero { background: #3fb95022; color: #3fb950; }
  .badge-time { background: #1f2937; color: #d1d5db; font-family: monospace; }
  .badge-verified { background: #3fb95022; color: #3fb950; }
  .badge-unverified { background: #f8514922; color: #f85149; }
  .badge-na { background: #30363d; color: #8b949e; }

  .run-detail { display: none; padding: 16px; border-top: 1px solid #30363d; }
  .run-card.expanded .run-detail { display: block; }

  .detail-section { margin-bottom: 16px; }
  .detail-section h3 { font-size: 13px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }

  .prompt-full { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 12px; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.5; }

  .timeline { display: flex; flex-direction: column; gap: 4px; }
  .tl-item { display: flex; gap: 8px; padding: 6px 10px; border-radius: 4px; font-family: monospace; font-size: 12px; align-items: flex-start; }
  .tl-tool { background: #0d2137; border-left: 3px solid #58a6ff; }
  .tl-result { background: #0d1117; border-left: 3px solid #3fb950; color: #8b949e; }
  .tl-error { background: #1a0d0d; border-left: 3px solid #f85149; color: #f85149; }
  .tl-search { background: #0d1117; border-left: 3px solid #8b949e; color: #8b949e; font-style: italic; }
  .tl-text { background: #0d1117; border-left: 3px solid #d2a8ff; }
  .tl-label { font-weight: 600; min-width: 100px; flex-shrink: 0; }
  .tl-content { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 900px; }
  .tl-content.expanded { white-space: pre-wrap; word-break: break-all; }
  .tl-item:hover .tl-content { white-space: pre-wrap; word-break: break-all; }

  .model-tag { display: inline-block; background: #1f2937; border: 1px solid #30363d; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #d2a8ff; margin-left: 8px; }

  .empty { text-align: center; color: #8b949e; padding: 60px 20px; }
  .loading { text-align: center; color: #8b949e; padding: 40px; }
</style>
</head>
<body>

<div class="header">
  <div class="live-dot"></div>
  <h1>AI Accounting Agent</h1>
  <div class="header-right">Auto-refresh: 10s</div>
</div>

<div class="stats" id="stats">
  <div class="stat"><div class="stat-label">Total Runs</div><div class="stat-value blue" id="s-total">-</div></div>
  <div class="stat"><div class="stat-label">Avg Tool Calls</div><div class="stat-value" id="s-tools">-</div></div>
  <div class="stat"><div class="stat-label">Avg Errors</div><div class="stat-value" id="s-errors">-</div></div>
  <div class="stat"><div class="stat-label">Avg Time</div><div class="stat-value" id="s-time">-</div></div>
  <div class="stat"><div class="stat-label">Verified</div><div class="stat-value green" id="s-verified">-</div></div>
</div>

<div class="container">
  <div class="run-list" id="runs"><div class="loading">Loading runs...</div></div>
</div>

<script>
let runs = [];
let expanded = new Set();
let detailCache = {};

async function fetchRuns() {
  try {
    const res = await fetch('/api/runs');
    runs = await res.json();
    updateStats();
    renderRuns();
  } catch (e) {
    console.error('Failed to fetch runs:', e);
  }
}

function updateStats() {
  document.getElementById('s-total').textContent = runs.length;
  if (runs.length === 0) return;
  const avgTools = (runs.reduce((s, r) => s + r.toolCallCount, 0) / runs.length).toFixed(1);
  const avgErrors = (runs.reduce((s, r) => s + r.errorCount, 0) / runs.length).toFixed(1);
  const avgTime = (runs.reduce((s, r) => s + r.elapsedMs, 0) / runs.length / 1000).toFixed(1);
  const verified = runs.filter(r => r.verified === true).length;
  document.getElementById('s-tools').textContent = avgTools;
  document.getElementById('s-errors').textContent = avgErrors;
  document.getElementById('s-errors').className = 'stat-value ' + (parseFloat(avgErrors) > 1 ? 'red' : 'green');
  document.getElementById('s-time').textContent = avgTime + 's';
  document.getElementById('s-verified').textContent = verified + '/' + runs.length;
}

function renderRuns() {
  const el = document.getElementById('runs');
  if (runs.length === 0) { el.innerHTML = '<div class="empty">No runs yet. Submit tasks to see results here.</div>'; return; }

  el.innerHTML = runs.map(r => {
    const time = formatTimestamp(r.filename);
    const errClass = r.errorCount === 0 ? 'zero' : '';
    const vBadge = r.verified === true ? 'badge-verified' : r.verified === false ? 'badge-unverified' : 'badge-na';
    const vText = r.verified === true ? 'YES' : r.verified === false ? 'NO' : 'n/a';
    const isExp = expanded.has(r.filename);

    return '<div class="run-card ' + (isExp ? 'expanded' : '') + '" data-file="' + r.filename + '">'
      + '<div class="run-summary" onclick="toggle(\\'' + r.filename + '\\')">'
      + '<div class="run-time">' + time + '</div>'
      + '<div class="run-prompt">' + esc(r.prompt.slice(0, 100)) + '</div>'
      + '<div><span class="run-badge badge-tools">' + r.toolCallCount + ' calls</span></div>'
      + '<div><span class="run-badge badge-errors ' + errClass + '">' + r.errorCount + ' err</span></div>'
      + '<div><span class="run-badge badge-time">' + (r.elapsedMs / 1000).toFixed(1) + 's</span></div>'
      + '<div><span class="run-badge ' + vBadge + '">' + vText + '</span></div>'
      + '</div>'
      + '<div class="run-detail" id="detail-' + r.filename + '">' + (isExp ? renderDetail(detailCache[r.filename]) : '') + '</div>'
      + '</div>';
  }).join('');
}

async function toggle(filename) {
  if (expanded.has(filename)) {
    expanded.delete(filename);
    renderRuns();
    return;
  }

  expanded.clear();
  expanded.add(filename);

  if (!detailCache[filename]) {
    const el = document.getElementById('detail-' + filename);
    if (el) el.innerHTML = '<div class="loading">Loading details...</div>';
    try {
      const res = await fetch('/api/runs/' + filename);
      detailCache[filename] = await res.json();
    } catch (e) {
      detailCache[filename] = { error: String(e) };
    }
  }
  renderRuns();
}

function renderDetail(data) {
  if (!data) return '<div class="loading">Loading...</div>';
  if (data.error) return '<div style="color:#f85149">' + esc(data.error) + '</div>';

  let html = '';

  // Prompt
  html += '<div class="detail-section"><h3>Prompt</h3><div class="prompt-full">' + esc(data.prompt || '') + '</div></div>';

  // Model + system prompt info
  const sysModules = (data.systemPrompt || []).length;
  html += '<div class="detail-section"><h3>Config</h3>'
    + '<span class="model-tag">' + esc(data.model || 'unknown') + '</span>'
    + '<span class="model-tag">' + sysModules + ' prompt blocks</span>'
    + '<span class="model-tag">' + (data.elapsedMs / 1000).toFixed(1) + 's elapsed</span>'
    + '</div>';

  // Tool call timeline
  const timeline = extractTimeline(data.messages || []);
  if (timeline.length > 0) {
    html += '<div class="detail-section"><h3>Tool Timeline (' + timeline.length + ' events)</h3><div class="timeline">';
    for (const ev of timeline) {
      html += '<div class="tl-item ' + ev.cls + '">'
        + '<span class="tl-label">' + esc(ev.label) + '</span>'
        + '<span class="tl-content">' + esc(ev.content) + '</span>'
        + '</div>';
    }
    html += '</div></div>';
  }

  // Verification
  if (data.verification) {
    const v = data.verification;
    const color = v.verified ? '#3fb950' : '#f85149';
    html += '<div class="detail-section"><h3>Verification</h3>'
      + '<div style="color:' + color + ';font-weight:600">' + (v.verified ? 'VERIFIED' : 'NOT VERIFIED') + '</div>'
      + '<div style="margin-top:4px;color:#8b949e">' + esc(v.summary || '') + '</div>'
      + '</div>';
  }

  return html;
}

function extractTimeline(messages) {
  const events = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === 'mcp_tool_use') {
        events.push({ cls: 'tl-tool', label: block.name, content: JSON.stringify(block.input || {}) });
      } else if (block.type === 'mcp_tool_result') {
        const preview = JSON.stringify(block.content || '').slice(0, 200);
        events.push({ cls: block.is_error ? 'tl-error' : 'tl-result', label: block.is_error ? 'ERROR' : 'RESULT', content: preview });
      } else if (block.type === 'server_tool_use') {
        events.push({ cls: 'tl-search', label: 'SEARCH', content: JSON.stringify(block.input || {}) });
      } else if (block.type === 'text' && block.text) {
        events.push({ cls: 'tl-text', label: 'CLAUDE', content: block.text.slice(0, 300) });
      }
    }
  }
  return events;
}

function formatTimestamp(filename) {
  // result-2026-03-20T18-15-52-051Z.json -> 2026-03-20 18:15:52
  return filename.replace('result-', '').replace('.json', '')
    .replace('T', ' ').replace(/-/g, (m, offset, str) => {
      // First 10 chars are date (keep dashes), rest convert to colons
      return offset > 9 && offset < 19 ? ':' : m;
    }).slice(0, 19);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Init
fetchRuns();
setInterval(fetchRuns, 10000);
</script>
</body>
</html>`;

const REPLAY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Replay</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

  .topbar { background: #161b22; border-bottom: 1px solid #30363d; padding: 10px 20px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .topbar h1 { font-size: 15px; font-weight: 600; }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; animation: pulse 2s infinite; }
  .live-dot.playing { background: #3fb950; }
  .live-dot.paused { background: #d29922; animation: none; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  .topbar-meta { margin-left: auto; display: flex; gap: 12px; align-items: center; }
  .tag { background: #1f2937; border: 1px solid #30363d; padding: 2px 10px; border-radius: 4px; font-size: 11px; }
  .tag.model { color: #d2a8ff; }
  .tag.time { color: #93c5fd; font-family: monospace; }
  .tag.tools { color: #58a6ff; }
  .tag.errors { color: #f85149; }
  .tag.errors.zero { color: #3fb950; }
  .progress-bar { width: 120px; height: 4px; background: #30363d; border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; background: #58a6ff; transition: width 0.3s; }

  .chat { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 8px; scroll-behavior: smooth; }

  .msg { max-width: 90%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; animation: fadeIn 0.3s ease; opacity: 0; animation-fill-mode: forwards; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

  .msg-user { align-self: flex-end; background: #1a3a5c; border: 1px solid #264b73; border-bottom-right-radius: 4px; }
  .msg-user .label { color: #58a6ff; font-weight: 600; font-size: 11px; margin-bottom: 4px; }

  .msg-assistant { align-self: flex-start; background: #1c1c2e; border: 1px solid #2d2d44; border-bottom-left-radius: 4px; }
  .msg-assistant .label { color: #d2a8ff; font-weight: 600; font-size: 11px; margin-bottom: 4px; }

  .msg-tool { align-self: flex-start; background: #0d2137; border: 1px solid #1a3a5c; border-left: 3px solid #58a6ff; border-radius: 6px; font-family: monospace; font-size: 12px; max-width: 95%; }
  .msg-tool .label { color: #58a6ff; font-weight: 700; font-size: 11px; margin-bottom: 2px; }
  .msg-tool .tool-input { color: #8b949e; word-break: break-all; }

  .msg-result { align-self: flex-start; background: #0d1a0d; border: 1px solid #1a3a1a; border-left: 3px solid #3fb950; border-radius: 6px; font-family: monospace; font-size: 11px; max-width: 95%; color: #8b949e; }
  .msg-result .label { color: #3fb950; font-weight: 700; font-size: 11px; margin-bottom: 2px; }

  .msg-error { align-self: flex-start; background: #1a0d0d; border: 1px solid #3a1a1a; border-left: 3px solid #f85149; border-radius: 6px; font-family: monospace; font-size: 11px; max-width: 95%; color: #f85149; }
  .msg-error .label { color: #f85149; font-weight: 700; font-size: 11px; margin-bottom: 2px; }

  .msg-search { align-self: flex-start; background: #161b22; border: 1px solid #30363d; border-left: 3px solid #8b949e; border-radius: 6px; font-family: monospace; font-size: 11px; color: #8b949e; font-style: italic; padding: 6px 12px; }

  .msg-system { align-self: center; background: #161b22; border: 1px solid #30363d; border-radius: 20px; font-size: 12px; color: #8b949e; padding: 6px 16px; text-align: center; }

  .msg-verify { align-self: center; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; text-align: center; }
  .msg-verify.pass { background: #0d2a0d; border: 2px solid #3fb950; color: #3fb950; }
  .msg-verify.fail { background: #2a0d0d; border: 2px solid #f85149; color: #f85149; }

  .content { white-space: pre-wrap; word-break: break-word; }
  .truncated { max-height: 120px; overflow: hidden; position: relative; }
  .truncated::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 30px; background: linear-gradient(transparent, #0d2137); }

  .waiting { align-self: center; color: #8b949e; font-size: 12px; padding: 20px; }
  .waiting .dots::after { content: ''; animation: dots 1.5s infinite; }
  @keyframes dots { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }

  .restart-notice { align-self: center; color: #8b949e; font-size: 12px; padding: 16px; border-top: 1px solid #30363d; margin-top: 8px; }
</style>
</head>
<body>

<div class="topbar">
  <div class="live-dot playing" id="status-dot"></div>
  <h1 id="title">Agent Replay</h1>
  <span class="tag" style="color:#8b949e;" id="m-run">—</span>
  <span class="tag" style="color:#e6edf3;font-family:monospace;" id="m-date">—</span>
  <div class="topbar-meta">
    <span class="tag model" id="m-model">—</span>
    <span class="tag tools" id="m-tools">— calls</span>
    <span class="tag errors zero" id="m-errors">— errors</span>
    <span class="tag time" id="m-time">—s</span>
    <div class="progress-bar"><div class="progress-fill" id="progress"></div></div>
  </div>
</div>

<div class="chat" id="chat">
  <div class="waiting">Loading latest run<span class="dots"></span></div>
</div>

<script>
const STEP_DELAY = 1500;
const PAUSE_AFTER = 6000;
let playingRun = null;
let abortReplay = false;
let allRuns = []; // sorted by filename descending (newest first)
let totalRunCount = 0;

// Fetch all runs, sorted newest first
async function fetchRuns() {
  try {
    const res = await fetch('/api/runs?t=' + Date.now());
    const runs = await res.json();
    // Sort by filename descending to ensure newest first
    runs.sort((a, b) => b.filename.localeCompare(a.filename));
    allRuns = runs;
    totalRunCount = runs.length;
    return runs;
  } catch { return allRuns; }
}

// Get the latest filename
async function fetchLatestFilename() {
  const runs = await fetchRuns();
  return runs.length > 0 ? runs[0].filename : null;
}

// Fetch full run detail
async function fetchRunDetail(filename) {
  const res = await fetch('/api/runs/' + filename + '?t=' + Date.now());
  const data = await res.json();
  const summary = allRuns.find(r => r.filename === filename);
  return { summary, detail: data };
}

// Format filename to readable date
function formatDate(filename) {
  // result-2026-03-20T19-53-10-319Z.json -> 2026-03-20 19:53:10
  const ts = filename.replace('result-', '').replace('.json', '');
  const parts = ts.match(/(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2})-(\\d{2})-(\\d{2})/);
  if (!parts) return ts;
  return parts[1] + '-' + parts[2] + '-' + parts[3] + ' ' + parts[4] + ':' + parts[5] + ':' + parts[6];
}

// Get the run number (1 = oldest, N = newest)
function getRunNumber(filename) {
  const idx = allRuns.findIndex(r => r.filename === filename);
  if (idx < 0) return '?';
  return totalRunCount - idx;
}

// Background poller: always check for newer runs and interrupt if found
setInterval(async () => {
  const latest = await fetchLatestFilename();
  if (latest && latest !== playingRun) {
    abortReplay = true;
  }
}, 8000);

function parseEvents(data) {
  const evts = [];
  const messages = data.messages || [];

  // User message first
  for (const msg of messages) {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const text = msg.content.find(b => b.type === 'text');
      if (text) evts.push({ type: 'user', content: text.text });
      const docs = msg.content.filter(b => b.type === 'document' || b.type === 'image');
      if (docs.length > 0) evts.push({ type: 'system', content: docs.length + ' file(s) attached' });
      break;
    }
  }

  // Assistant turns
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === 'mcp_tool_use') {
        evts.push({ type: 'tool', name: block.name, input: JSON.stringify(block.input || {}, null, 2) });
      } else if (block.type === 'mcp_tool_result') {
        const preview = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
        if (block.is_error) {
          evts.push({ type: 'error', content: preview.slice(0, 300) });
        } else {
          evts.push({ type: 'result', content: preview.slice(0, 250) });
        }
      } else if (block.type === 'server_tool_use') {
        evts.push({ type: 'search', content: JSON.stringify(block.input || {}) });
      } else if (block.type === 'text' && block.text && block.text.length > 5) {
        evts.push({ type: 'assistant', content: block.text });
      }
    }
  }

  // Verification
  if (data.verification) {
    evts.push({ type: 'verify', verified: data.verification.verified, summary: data.verification.summary || '' });
  }

  return evts;
}

function renderEvent(ev) {
  switch (ev.type) {
    case 'user':
      return '<div class="msg msg-user"><div class="label">TASK</div><div class="content">' + esc(ev.content) + '</div></div>';
    case 'assistant':
      return '<div class="msg msg-assistant"><div class="label">CLAUDE</div><div class="content">' + esc(ev.content.slice(0, 500)) + '</div></div>';
    case 'tool':
      return '<div class="msg msg-tool"><div class="label">TOOL ' + esc(ev.name) + '</div><div class="tool-input truncated">' + esc(ev.input) + '</div></div>';
    case 'result':
      return '<div class="msg msg-result"><div class="label">RESULT</div><div class="content truncated">' + esc(ev.content) + '</div></div>';
    case 'error':
      return '<div class="msg msg-error"><div class="label">ERROR</div><div class="content">' + esc(ev.content) + '</div></div>';
    case 'search':
      return '<div class="msg msg-search">tool_search ' + esc(ev.content) + '</div>';
    case 'system':
      return '<div class="msg msg-system">' + esc(ev.content) + '</div>';
    case 'verify':
      const cls = ev.verified ? 'pass' : 'fail';
      const icon = ev.verified ? 'VERIFIED' : 'NOT VERIFIED';
      return '<div class="msg msg-verify ' + cls + '">' + icon + '<br><span style="font-weight:400;font-size:12px">' + esc(ev.summary) + '</span></div>';
    default:
      return '';
  }
}

async function playReplay() {
  // Always fetch the latest run
  const latest = await fetchLatestFilename();
  if (!latest) {
    document.getElementById('chat').innerHTML = '<div class="waiting">No runs yet. Submit a task to see the replay.<span class="dots"></span></div>';
    setTimeout(playReplay, 5000);
    return;
  }

  // Load it (even if same as before — we replay in a loop)
  let run;
  try {
    run = await fetchRunDetail(latest);
  } catch (e) {
    setTimeout(playReplay, 5000);
    return;
  }

  playingRun = latest;
  abortReplay = false;

  const events = parseEvents(run.detail);

  // Update topbar
  document.getElementById('m-run').textContent = 'Run #' + getRunNumber(latest) + ' of ' + totalRunCount;
  document.getElementById('m-date').textContent = formatDate(latest);
  document.getElementById('m-model').textContent = run.detail.model || '?';
  document.getElementById('m-tools').textContent = (run.summary?.toolCallCount || 0) + ' calls';
  const errEl = document.getElementById('m-errors');
  const errCount = run.summary?.errorCount || 0;
  errEl.textContent = errCount + ' errors';
  errEl.className = 'tag errors' + (errCount === 0 ? ' zero' : '');
  document.getElementById('m-time').textContent = ((run.summary?.elapsedMs || 0) / 1000).toFixed(1) + 's';
  document.getElementById('status-dot').className = 'live-dot playing';

  const chat = document.getElementById('chat');
  chat.innerHTML = '';

  // Play events one by one
  for (let i = 0; i < events.length; i++) {
    if (abortReplay) break; // new run arrived — stop immediately

    const ev = events[i];
    const html = renderEvent(ev);
    if (!html) continue;

    chat.insertAdjacentHTML('beforeend', html);
    chat.scrollTop = chat.scrollHeight;

    document.getElementById('progress').style.width = ((i + 1) / events.length * 100) + '%';

    let delay = STEP_DELAY;
    if (ev.type === 'search') delay = 500;
    else if (ev.type === 'result') delay = 1200;
    else if (ev.type === 'tool') delay = 1800;
    else if (ev.type === 'error') delay = 2500;
    else if (ev.type === 'assistant') delay = 3000;
    else if (ev.type === 'user') delay = 3500;
    else if (ev.type === 'verify') delay = 4000;
    else if (ev.type === 'system') delay = 1500;

    await sleep(delay);
  }

  if (!abortReplay) {
    // Finished normally — pause then restart
    document.getElementById('status-dot').className = 'live-dot paused';
    chat.insertAdjacentHTML('beforeend', '<div class="restart-notice">Replay complete — restarting...</div>');
    chat.scrollTop = chat.scrollHeight;
    await sleep(PAUSE_AFTER);
  }

  // Reset and go again (will pick up new run if available)
  playingRun = null;
  abortReplay = false;
  playReplay();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

playReplay();
</script>
</body>
</html>`;

