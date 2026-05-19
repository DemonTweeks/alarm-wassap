import logging
from datetime import datetime, timezone

from services.auth import AuthService
from services.cache import cache
from services.event_bus import event_bus
from services.ume_client import UMEClient
from config.settings import settings

logger = logging.getLogger(__name__)

SITE_MAP_CACHE_KEY = "topology:site_map"
LAST_REFRESH_CACHE_KEY = "topology:last_refresh"


class TopologyService:
    def __init__(self, clients: dict[str, UMEClient], auth: AuthService):
        self._clients = clients
        self._auth = auth

    async def discover_all(self) -> dict:
        logger.info("Starting topology discovery across all UME servers")
        site_map: dict[str, list[dict]] = {}

        for server_id, client in self._clients.items():
            try:
                token = await self._auth.ensure_token(server_id)
                nes = await self._get_all_nes(server_id, client, token)
                logger.info("UME %s: fetched %d NEs", server_id, len(nes))

                ne_count = 0
                for ne in nes:
                    display_name: str = ne.get("displayName", "")
                    site_code = display_name[:4].upper()
                    if not site_code or len(site_code) < 4 or not site_code.isalnum():
                        continue
                    entry = {
                        "ume_id": server_id,
                        "ne_nbiId": str(ne.get("nbiId") or ne.get("id") or ""),
                        "ne_name": display_name,
                        "subnetwork_id": str(ne.get("subnetwork_nbiId") or ""),
                    }
                    site_map.setdefault(site_code, []).append(entry)
                    ne_count += 1

                logger.info("UME %s: mapped %d NEs", server_id, ne_count)

            except Exception as e:
                logger.error("Topology discovery failed for UME %s: %s", server_id, e)

        cache.set(SITE_MAP_CACHE_KEY, site_map, ttl_seconds=settings.topology_cache_ttl)
        now = datetime.now(timezone.utc).isoformat()
        cache.set(LAST_REFRESH_CACHE_KEY, now, ttl_seconds=settings.topology_cache_ttl)

        total_sites = len(site_map)
        total_nes = sum(len(v) for v in site_map.values())
        logger.info("Topology discovery complete: %d sites, %d NEs", total_sites, total_nes)

        await event_bus.publish("topology_refresh", {
            "sites": total_sites,
            "nes": total_nes,
            "refreshed_at": now,
        })
        return site_map

    async def _get_all_nes(self, server_id: str, client: UMEClient, token: str) -> list:
        resp = await client.get(
            "/api/rantopo/v1/ranmes",
            token=token,
            params={"moc": "SDR,ITBBU"},
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("data", data.get("ranmes", []))

    def is_cache_valid(self) -> bool:
        return cache.get(SITE_MAP_CACHE_KEY) is not None

    def resolve_site(self, site_code: str) -> list[dict]:
        site_map = cache.get(SITE_MAP_CACHE_KEY) or {}
        return site_map.get(site_code.upper(), [])

    def get_all_sites(self) -> dict:
        return cache.get(SITE_MAP_CACHE_KEY) or {}

    def last_refresh(self) -> str | None:
        return cache.get(LAST_REFRESH_CACHE_KEY)
