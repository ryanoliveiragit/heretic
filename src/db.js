import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getRoutes } from './upstream.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'heretic.db');

let db;
let stmts;

export function initDb() {
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      target_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY,
      conversation_id INTEGER NOT NULL,
      command TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('pending','approved','denied')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS daily_usage (
      day TEXT PRIMARY KEY,
      requests INTEGER NOT NULL DEFAULT 0
    );
  `);

  stmts = {
    listProjects: db.prepare('SELECT * FROM projects ORDER BY created_at DESC'),
    createProject: db.prepare('INSERT INTO projects (name, target_url) VALUES (?, ?) RETURNING *'),
    deleteProject: db.prepare('DELETE FROM projects WHERE id = ?'),
    listConvs: db.prepare('SELECT * FROM conversations WHERE project_id IS ? OR project_id = ? ORDER BY updated_at DESC'),
    createConv: db.prepare('INSERT INTO conversations (project_id, title) VALUES (?, ?) RETURNING *'),
    deleteConv: db.prepare('DELETE FROM conversations WHERE id = ?'),
    getConv: db.prepare('SELECT * FROM conversations WHERE id = ?'),
    listMsgs: db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'),
    addMsg: db.prepare('INSERT INTO messages (conversation_id, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?) RETURNING *'),
    listApprovals: db.prepare('SELECT * FROM approvals WHERE conversation_id = ? AND decision = ?'),
    addApproval: db.prepare('INSERT INTO approvals (conversation_id, command, decision) VALUES (?, ?, ?) RETURNING *'),
    updateApproval: db.prepare('UPDATE approvals SET decision = ? WHERE id = ? RETURNING *'),
    getApproval: db.prepare('SELECT * FROM approvals WHERE id = ?'),
    getDaily: db.prepare('SELECT * FROM daily_usage WHERE day = ?'),
    upsertDaily: db.prepare('INSERT INTO daily_usage (day, requests) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET requests = excluded.requests'),
  };
  return db;
}

// Projects
export function listProjects() {
  return stmts.listProjects.all();
}
export function createProject(name, target_url = null) {
  return stmts.createProject.get(name, target_url);
}
export function deleteProject(id) {
  stmts.deleteProject.run(id);
}

// Conversations
export function listConversations(projectId = null) {
  return stmts.listConvs.all(projectId, projectId);
}
export function createConversation(projectId, title) {
  return stmts.createConv.get(projectId, title);
}
export function deleteConversation(id) {
  stmts.deleteConv.run(id);
}
export function getConversation(id) {
  return stmts.getConv.get(id);
}

// Messages
export function listMessages(convId) {
  return stmts.listMsgs.all(convId);
}
export function addMessage(convId, role, content, toolCalls = null, toolCallId = null) {
  return stmts.addMsg.get(convId, role, content, toolCalls, toolCallId);
}

// Approvals
export function listApprovals(convId, decision = 'pending') {
  return stmts.listApprovals.all(convId, decision);
}
export function addApproval(convId, command) {
  return stmts.addApproval.get(convId, command, 'pending');
}
export function updateApproval(id, decision) {
  return stmts.updateApproval.get(decision, id);
}

// Usage
export function getDailyUsage(day) {
  return stmts.getDaily.get(day);
}
export function setDailyUsage(day, count) {
  stmts.upsertDaily.run(day, count);
}

export function health() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = getDailyUsage(today);
  return {
    ok: true,
    providers: {
      openrouter: { ok: true },
      venice: { ok: true }
    },
    daily_requests: usage ? usage.requests : 0,
    daily_limit: 1000,
    routes: getRoutes()
  };
}
