import logging
import logging.handlers
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from config.settings import settings
from routers.alarm_router import router as alarm_router
from routers.conversation_router import router as conversation_router
from routers.topology_router import router as topology_router
from routers.ws_router import router as ws_router
from services.conversation import init_db
from services.auth import AuthService
from services.alarms import AlarmService
from services.topology import TopologyService
from services.ume_client import UMEClient

class _MsFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        ct = self.converter(record.created)
        s = time.strftime(datefmt or "%Y-%m-%d %H:%M:%S", ct)
        return f"{s}.{record.msecs:03.0f}"


def _configure_logging():
    formatter = _MsFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    console = logging.StreamHandler()
    console.setFormatter(formatter)

    log_dir = Path(__file__).parent / "logs"
    log_dir.mkdir(exist_ok=True)
    file_handler = logging.handlers.RotatingFileHandler(
        log_dir / "api.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    handlers = [console, file_handler]
    logging.root.setLevel(logging.INFO)
    logging.root.handlers = handlers
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = handlers
        lg.propagate = False


_configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Build UME clients
    clients: dict[str, UMEClient] = {
        s["id"]: UMEClient(s) for s in settings.ume_servers
    }
    auth = AuthService(clients, settings.ume_servers)
    topology = TopologyService(clients, auth)
    alarms = AlarmService(clients, auth, topology)

    app.state.ume_clients = clients
    app.state.auth_service = auth
    app.state.topology_service = topology
    app.state.alarm_service = alarms

    await init_db()

    if settings.ume_servers:
        logger.info("Starting topology discovery on startup...")
        try:
            await topology.discover_all()
        except Exception as e:
            logger.warning("Startup topology discovery failed: %s", e)
    else:
        logger.warning("No UME servers configured — set UME_SERVERS in .env")

    yield

    logger.info("Shutting down — logging out of all UME servers")
    await auth.logout_all()
    for client in clients.values():
        await client.close()


app = FastAPI(title="ZTE UME Alarm API", lifespan=lifespan)

app.include_router(alarm_router)
app.include_router(conversation_router)
app.include_router(topology_router)
app.include_router(ws_router)

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
