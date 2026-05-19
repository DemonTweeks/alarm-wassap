from fastapi import APIRouter, Query
from pydantic import BaseModel
from services.conversation import get_messages, get_sessions, save_message

router = APIRouter()


class LogMessageRequest(BaseModel):
    session_id: str
    direction: str
    body: str
    metadata: dict | None = None


@router.get("/api/conversations")
async def list_sessions(limit: int = Query(50, ge=1, le=200)):
    return await get_sessions(limit=limit)


@router.get("/api/conversations/{session_id}")
async def list_messages(session_id: str, limit: int = Query(100, ge=1, le=500)):
    return await get_messages(session_id=session_id, limit=limit)


@router.post("/api/conversations/messages")
async def log_message(body: LogMessageRequest):
    await save_message(
        session_id=body.session_id,
        direction=body.direction,
        body=body.body,
        metadata=body.metadata,
    )
    return {"ok": True}
