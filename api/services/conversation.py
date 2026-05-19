import json
import logging
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "conversations.db"


async def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id    TEXT    NOT NULL,
                direction     TEXT    NOT NULL,
                message_type  TEXT    NOT NULL DEFAULT 'text',
                body          TEXT,
                file_path     TEXT,
                mime_type     TEXT,
                metadata      TEXT,
                wa_message_id TEXT,
                contact_name  TEXT,
                created_at    TEXT    NOT NULL
                              DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_session
            ON messages(session_id, created_at DESC)
        """)
        # Migration: add contact_name if upgrading from older schema
        try:
            await db.execute("ALTER TABLE messages ADD COLUMN contact_name TEXT")
        except Exception:
            pass
        await db.commit()
    logger.info("Conversation DB ready at %s", DB_PATH)


async def save_message(
    session_id: str,
    direction: str,
    body: str,
    message_type: str = "text",
    file_path: str | None = None,
    mime_type: str | None = None,
    metadata: dict | None = None,
    wa_message_id: str | None = None,
    contact_name: str | None = None,
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO messages
               (session_id, direction, message_type, body,
                file_path, mime_type, metadata, wa_message_id, contact_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                direction,
                message_type,
                body,
                file_path,
                mime_type,
                json.dumps(metadata) if metadata else None,
                wa_message_id,
                contact_name,
            ),
        )
        await db.commit()


async def get_messages(session_id: str | None = None, limit: int = 100) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if session_id:
            cursor = await db.execute(
                """SELECT * FROM messages WHERE session_id = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (session_id, limit),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM messages ORDER BY created_at DESC LIMIT ?",
                (limit,),
            )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_sessions(limit: int = 50) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT session_id,
                      COUNT(*) AS message_count,
                      MAX(created_at) AS last_active,
                      MAX(contact_name) AS contact_name
               FROM messages
               GROUP BY session_id
               ORDER BY last_active DESC
               LIMIT ?""",
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
