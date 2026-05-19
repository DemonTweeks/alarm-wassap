import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from services.conversation import save_message

logger = logging.getLogger(__name__)
router = APIRouter()


class AlarmQueryRequest(BaseModel):
    site: str
    wa_chat_id: str | None = None
    wa_message_id: str | None = None
    wa_body: str | None = None
    wa_contact_name: str | None = None


@router.post("/api/alarm/query")
async def query_alarm(request: Request, body: AlarmQueryRequest):
    site = body.site.strip().upper()
    if len(site) != 4 or not site.isalnum():
        raise HTTPException(status_code=400, detail="site must be a 4-character alphanumeric code (e.g. STLK, LRD1)")

    alarm_service = request.app.state.alarm_service
    result = await alarm_service.query_by_site(site)

    alarm_count = len(result.get("alarms", []))
    session_id = body.wa_chat_id or "dashboard"
    is_whatsapp = bool(body.wa_chat_id)

    try:
        await save_message(
            session_id=session_id,
            direction="inbound",
            body=body.wa_body or f"alarm {site}",
            wa_message_id=body.wa_message_id,
            contact_name=body.wa_contact_name or None,
            metadata={"site": site},
        )
        if not is_whatsapp:
            out_body = f"{alarm_count} active alarm(s) for {site}" if result.get("found") else f"{site} not found in topology cache"
            await save_message(
                session_id=session_id,
                direction="outbound",
                body=out_body,
                metadata={"site": site, "alarm_count": alarm_count, "found": result.get("found")},
            )
        logger.info("Conversation saved for session %s", session_id)
    except Exception as e:
        logger.error("Failed to save conversation: %s", e)

    return result


@router.get("/api/health")
async def health(request: Request):
    topology = request.app.state.topology_service
    clients = request.app.state.ume_clients

    servers_status = []
    for server_id, client in clients.items():
        auth = request.app.state.auth_service
        reachable = True
        try:
            await auth.ensure_token(server_id)
        except Exception:
            reachable = False
        servers_status.append({
            "id": server_id,
            "host": client.host,
            "port": client.port,
            "reachable": reachable,
        })

    return {
        "status": "ok",
        "ume_servers": servers_status,
        "topology_last_refresh": topology.last_refresh(),
    }
