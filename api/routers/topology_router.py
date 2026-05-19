import logging
from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/topology/refresh")
async def refresh_topology(request: Request):
    topology = request.app.state.topology_service
    site_map = await topology.discover_all()
    return {
        "status": "refreshed",
        "sites": len(site_map),
        "nes": sum(len(v) for v in site_map.values()),
    }


@router.get("/api/topology/sites")
async def list_sites(request: Request):
    topology = request.app.state.topology_service
    site_map = topology.get_all_sites()
    sites = [
        {
            "site_code": code,
            "nes": [{"ne_name": e["ne_name"], "ume_id": e["ume_id"]} for e in entries],
        }
        for code, entries in sorted(site_map.items())
    ]
    return {
        "sites": sites,
        "last_refresh": topology.last_refresh(),
    }
