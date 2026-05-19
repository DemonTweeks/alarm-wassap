import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    from services.event_bus import event_bus
    queue = event_bus.subscribe()
    try:
        while True:
            message = await queue.get()
            await websocket.send_text(message)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("WebSocket error: %s", e)
    finally:
        event_bus.unsubscribe(queue)
