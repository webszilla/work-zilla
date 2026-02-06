import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";

let db = null;

export function getDb() {
  if (db) {
    return db;
  }
  const dbPath = path.join(app.getPath("userData"), "sync.sqlite");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      event TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      size INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      retries INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS folder_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_path TEXT NOT NULL UNIQUE,
      remote_id TEXT NOT NULL
    );
  `);
  return db;
}

export function enqueueFile(filePath, event, size = 0) {
  const database = getDb();
  database.prepare(
    "INSERT INTO queue (path, event, status, size, updated_at) VALUES (?, ?, 'queued', ?, ?)"
  ).run(filePath, event, size, new Date().toISOString());
}

export function updateQueueStatus(id, status) {
  const database = getDb();
  database.prepare("UPDATE queue SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
}

export function incrementRetry(id) {
  const database = getDb();
  database.prepare("UPDATE queue SET retries = retries + 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

export function dequeueNext() {
  const database = getDb();
  return database.prepare("SELECT * FROM queue WHERE status = 'queued' ORDER BY id ASC LIMIT 1").get();
}

export function listQueue(limit = 100) {
  const database = getDb();
  return database.prepare("SELECT * FROM queue ORDER BY updated_at DESC LIMIT ?").all(limit);
}

export function addActivity(title, subtitle, status) {
  const database = getDb();
  database.prepare(
    "INSERT INTO activity (title, subtitle, status, created_at) VALUES (?, ?, ?, ?)"
  ).run(title, subtitle || "", status || "info", new Date().toISOString());
}

export function listActivity(limit = 100) {
  const database = getDb();
  return database.prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function addError(title, details) {
  const database = getDb();
  database.prepare("INSERT INTO errors (title, details, created_at) VALUES (?, ?, ?)").run(
    title,
    details || "",
    new Date().toISOString()
  );
}

export function listErrors(limit = 100) {
  const database = getDb();
  return database.prepare("SELECT * FROM errors ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function setFolderMap(localPath, remoteId) {
  const database = getDb();
  database.prepare(
    "INSERT INTO folder_map (local_path, remote_id) VALUES (?, ?) ON CONFLICT(local_path) DO UPDATE SET remote_id = excluded.remote_id"
  ).run(localPath, remoteId);
}

export function getFolderMap(localPath) {
  const database = getDb();
  return database.prepare("SELECT remote_id FROM folder_map WHERE local_path = ?").get(localPath);
}

export function clearQueue() {
  const database = getDb();
  database.prepare("DELETE FROM queue").run();
}
