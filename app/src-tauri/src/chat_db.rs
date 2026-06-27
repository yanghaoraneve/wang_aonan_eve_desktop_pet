use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: i64,
    pub title: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: i64,
    pub session_id: i64,
    pub role: String,
    pub content: String,
    pub ts: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: i64,
    pub content: String,
    pub category: String,
    pub importance: i64,
    pub source_session_id: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_used_at: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub due_at: i64,
    pub completed: bool,
    pub reminded_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct ChatDb {
    conn: Connection,
}

impl ChatDb {
    pub fn open(data_dir: &Path) -> Result<Self, rusqlite::Error> {
        std::fs::create_dir_all(data_dir).ok();
        let db_path = data_dir.join("chat.db");
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                ts INTEGER NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL UNIQUE,
                category TEXT NOT NULL DEFAULT 'fact',
                importance INTEGER NOT NULL DEFAULT 3,
                source_session_id INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_used_at INTEGER,
                FOREIGN KEY(source_session_id) REFERENCES sessions(id) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                notes TEXT,
                due_at INTEGER NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                reminded_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )?;
        ensure_memory_schema(&conn)?;
        Ok(Self { conn })
    }

    pub fn list_sessions(&self) -> Result<Vec<Session>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, title, created_at FROM sessions ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn create_session(&self, title: &str) -> Result<i64, String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        self.conn
            .execute(
                "INSERT INTO sessions (title, created_at) VALUES (?1, ?2)",
                params![title, now],
            )
            .map_err(|e| e.to_string())?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_messages(&self, session_id: i64) -> Result<Vec<Message>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, session_id, role, content, ts FROM messages
                 WHERE session_id = ?1 ORDER BY ts ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![session_id], |row| {
                Ok(Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    ts: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_recent_messages(&self, session_id: i64, limit: i64) -> Result<Vec<Message>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, session_id, role, content, ts FROM messages
                 WHERE session_id = ?1 ORDER BY ts DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![session_id, limit], |row| {
                Ok(Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    ts: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut messages: Vec<Message> =
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        messages.reverse();
        Ok(messages)
    }

    pub fn add_message(&self, session_id: i64, role: &str, content: &str) -> Result<i64, String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        self.conn
            .execute(
                "INSERT INTO messages (session_id, role, content, ts) VALUES (?1, ?2, ?3, ?4)",
                params![session_id, role, content, now],
            )
            .map_err(|e| e.to_string())?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn delete_session(&self, session_id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM messages WHERE session_id = ?1", params![session_id])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM sessions WHERE id = ?1", params![session_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_session_title(&self, session_id: i64, title: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE sessions SET title = ?1 WHERE id = ?2",
                params![title, session_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_memories(&self, limit: i64) -> Result<Vec<Memory>, String> {
        let limit = if limit <= 0 { 50 } else { limit };
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, content, category, importance, source_session_id, created_at, updated_at, last_used_at FROM memories
                 ORDER BY updated_at DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], row_to_memory)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn search_memories(&self, query: &str, limit: i64) -> Result<Vec<Memory>, String> {
        let limit = if limit <= 0 { 12 } else { limit as usize };
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, content, category, importance, source_session_id, created_at, updated_at, last_used_at
                 FROM memories ORDER BY updated_at DESC LIMIT 200",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], row_to_memory)
            .map_err(|e| e.to_string())?;
        let mut scored = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|memory| {
                let score = memory_score(&memory, query);
                (score, memory)
            })
            .filter(|(score, _)| *score > 0)
            .collect::<Vec<_>>();

        scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.updated_at.cmp(&a.1.updated_at)));
        let memories = scored
            .into_iter()
            .take(limit)
            .map(|(_, memory)| memory)
            .collect::<Vec<_>>();
        let now = current_time_ms();
        for memory in &memories {
            let _ = self.conn.execute(
                "UPDATE memories SET last_used_at = ?1 WHERE id = ?2",
                params![now, memory.id],
            );
        }
        Ok(memories)
    }

    pub fn add_memory(
        &self,
        content: &str,
        category: Option<String>,
        importance: Option<i64>,
        source_session_id: Option<i64>,
    ) -> Result<i64, String> {
        let content = content.trim();
        if content.is_empty() {
            return Err("memory content is empty".to_string());
        }
        let category = normalize_memory_category(category.as_deref());
        let importance = importance.unwrap_or(3).clamp(1, 5);
        let now = current_time_ms();

        self.conn
            .execute(
                "INSERT INTO memories (content, category, importance, source_session_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)
                 ON CONFLICT(content) DO UPDATE SET
                    category = excluded.category,
                    importance = MAX(memories.importance, excluded.importance),
                    updated_at = excluded.updated_at,
                    source_session_id = COALESCE(excluded.source_session_id, memories.source_session_id)",
                params![content, category, importance, source_session_id, now],
            )
            .map_err(|e| e.to_string())?;

        let id = self
            .conn
            .query_row(
                "SELECT id FROM memories WHERE content = ?1",
                params![content],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn delete_memory(&self, memory_id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM memories WHERE id = ?1", params![memory_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn clear_memories(&self) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM memories", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn create_reminder(
        &self,
        title: &str,
        due_at: i64,
        notes: Option<String>,
    ) -> Result<Reminder, String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("reminder title is empty".to_string());
        }
        let notes = notes.and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });
        let now = current_time_ms();
        self.conn
            .execute(
                "INSERT INTO reminders (title, notes, due_at, completed, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 0, ?4, ?4)",
                params![title, notes, due_at, now],
            )
            .map_err(|e| e.to_string())?;
        self.get_reminder(self.conn.last_insert_rowid())
    }

    pub fn list_reminders(
        &self,
        include_completed: bool,
        limit: i64,
    ) -> Result<Vec<Reminder>, String> {
        let limit = if limit <= 0 { 50 } else { limit };
        let sql = if include_completed {
            "SELECT id, title, notes, due_at, completed, reminded_at, created_at, updated_at
             FROM reminders ORDER BY completed ASC, due_at ASC LIMIT ?1"
        } else {
            "SELECT id, title, notes, due_at, completed, reminded_at, created_at, updated_at
             FROM reminders WHERE completed = 0 ORDER BY due_at ASC LIMIT ?1"
        };
        let mut stmt = self.conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], row_to_reminder)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn complete_reminder(&self, reminder_id: i64) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE reminders SET completed = 1, updated_at = ?1 WHERE id = ?2",
                params![current_time_ms(), reminder_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_reminder(&self, reminder_id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM reminders WHERE id = ?1", params![reminder_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn due_reminders(&self, now: i64, limit: i64) -> Result<Vec<Reminder>, String> {
        let limit = if limit <= 0 { 10 } else { limit };
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, title, notes, due_at, completed, reminded_at, created_at, updated_at
                 FROM reminders
                 WHERE completed = 0 AND reminded_at IS NULL AND due_at <= ?1
                 ORDER BY due_at ASC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![now, limit], row_to_reminder)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn mark_reminded(&self, reminder_id: i64) -> Result<(), String> {
        let now = current_time_ms();
        self.conn
            .execute(
                "UPDATE reminders SET reminded_at = ?1, updated_at = ?1 WHERE id = ?2",
                params![now, reminder_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn get_reminder(&self, reminder_id: i64) -> Result<Reminder, String> {
        self.conn
            .query_row(
                "SELECT id, title, notes, due_at, completed, reminded_at, created_at, updated_at
                 FROM reminders WHERE id = ?1",
                params![reminder_id],
                row_to_reminder,
            )
            .map_err(|e| e.to_string())
    }
}

fn current_time_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn ensure_memory_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    if !has_column(conn, "memories", "category")? {
        conn.execute(
            "ALTER TABLE memories ADD COLUMN category TEXT NOT NULL DEFAULT 'fact'",
            [],
        )?;
    }
    if !has_column(conn, "memories", "importance")? {
        conn.execute(
            "ALTER TABLE memories ADD COLUMN importance INTEGER NOT NULL DEFAULT 3",
            [],
        )?;
    }
    if !has_column(conn, "memories", "last_used_at")? {
        conn.execute("ALTER TABLE memories ADD COLUMN last_used_at INTEGER", [])?;
    }
    Ok(())
}

fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool, rusqlite::Error> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for name in rows {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn row_to_memory(row: &rusqlite::Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: row.get(0)?,
        content: row.get(1)?,
        category: row.get(2)?,
        importance: row.get(3)?,
        source_session_id: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        last_used_at: row.get(7)?,
    })
}

fn memory_score(memory: &Memory, query: &str) -> i64 {
    let mut score = 0;
    let content = memory.content.to_lowercase();
    let query = query.to_lowercase();

    if !query.trim().is_empty() && content.contains(query.trim()) {
        score += 20;
    }

    for token in query_tokens(&query) {
        if token.chars().count() < 2 {
            continue;
        }
        if content.contains(&token) {
            score += 5;
        }
    }

    for token in cjk_bigrams(&query) {
        if content.contains(&token) {
            score += 3;
        }
    }

    if memory.category == "profile" {
        score += memory.importance * 2;
    }
    if memory.category == "preference" {
        score += memory.importance;
    }
    if score > 0 {
        score += memory.importance * 2;
    }

    score
}

fn query_tokens(query: &str) -> Vec<String> {
    query
        .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn cjk_bigrams(query: &str) -> Vec<String> {
    let chars = query
        .chars()
        .filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation())
        .collect::<Vec<_>>();
    chars
        .windows(2)
        .map(|pair| pair.iter().collect::<String>())
        .collect()
}

fn normalize_memory_category(category: Option<&str>) -> String {
    match category.unwrap_or("fact").trim() {
        "profile" | "preference" | "project" | "relationship" | "workflow" | "fact" => {
            category.unwrap_or("fact").trim().to_string()
        }
        _ => "fact".to_string(),
    }
}

fn row_to_reminder(row: &rusqlite::Row<'_>) -> rusqlite::Result<Reminder> {
    let completed: i64 = row.get(4)?;
    Ok(Reminder {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        due_at: row.get(3)?,
        completed: completed != 0,
        reminded_at: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}
