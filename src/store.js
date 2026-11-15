// In-memory store — replaces db.js (node:sqlite) for serverless (Vercel Edge).
// Same interface as db.js; data lives in process memory (resets on cold start).

import { getRoutes } from './upstream.js';

const _projects = new Map();
const _conversations = new Map();
const _messages = new Map();   // convId -> Msg[]
const _approvals = new Map();
const _daily = new Map();
let _pid = 1, _cid = 1, _mid = 1, _aid = 1;

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ── Projects ──
export function initDb() { /* no-op */ }

export function listProjects() {
  return [..._projects.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function createProject(name, target_url = null) {
  const p = { id: _pid++, name, target_url, created_at: now() };
  _projects.set(p.id, p);
  return p;
}
export function deleteProject(id) {
  _projects.delete(id);
  for (const [cid, c] of _conversations) if (c.project_id === id) c.project_id = null;
}

// ── Conversations ──
export function listConversations(projectId = null) {
  return [..._conversations.values()]
    .filter(c => projectId == null || c.project_id === projectId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export function createConversation(projectId, title) {
  const c = { id: _cid++, project_id: projectId ?? null, title, created_at: now(), updated_at: now() };
  _conversations.set(c.id, c);
  _messages.set(c.id, []);
  return c;
}
export function deleteConversation(id) {
  _conversations.delete(id);
  _messages.delete(id);
}
export function getConversation(id) {
  return _conversations.get(id) || null;
}

// ── Messages ──
export function listMessages(convId) {
  return _messages.get(convId) || [];
}
export function addMessage(convId, role, content, toolCalls = null, toolCallId = null) {
  const m = { id: _mid++, conversation_id: convId, role, content, tool_calls: toolCalls, tool_call_id: toolCallId, created_at: now() };
  const arr = _messages.get(convId);
  if (arr) arr.push(m);
  else _messages.set(convId, [m]);
  const conv = _conversations.get(convId);
  if (conv) conv.updated_at = now();
  return m;
}

// ── Approvals ──
export function listApprovals(convId, decision = 'pending') {
  return [..._approvals.values()].filter(a => a.conversation_id === convId && a.decision === decision);
}
export function addApproval(convId, command) {
  const a = { id: _aid++, conversation_id: convId, command, decision: 'pending', created_at: now() };
  _approvals.set(a.id, a);
  return a;
}
export function updateApproval(id, decision) {
  const a = _approvals.get(id);
  if (a) a.decision = decision;
  return a;
}

// ── Daily usage ──
export function getDailyUsage(day) {
  return _daily.has(day) ? { day, requests: _daily.get(day) } : null;
}
export function setDailyUsage(day, count) {
  _daily.set(day, count);
}

// ── Health ──
export function health() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = getDailyUsage(today);
  return {
    ok: true,
    providers: {
      openrouter: { ok: !!process.env.OPENROUTER_API_KEY },
      venice: { ok: !!process.env.VENICE_API_KEY },
    },
    daily_requests: usage ? usage.requests : 0,
    daily_limit: 1000,
    routes: getRoutes(),
  };
}
