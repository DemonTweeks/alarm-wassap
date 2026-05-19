import logging
from datetime import datetime, timezone

from services.auth import AuthService
from services.event_bus import event_bus
from services.topology import TopologyService
from services.ume_client import UMEClient
from config.settings import settings

logger = logging.getLogger(__name__)

_PAGE_SIZE = 100


class AlarmService:
    def __init__(
        self,
        clients: dict[str, UMEClient],
        auth: AuthService,
        topology: TopologyService,
    ):
        self._clients = clients
        self._auth = auth
        self._topology = topology

    async def query_by_site(self, site_code: str) -> dict:
        site_code = site_code.upper()
        ne_entries = self._topology.resolve_site(site_code)

        if not ne_entries and not self._topology.is_cache_valid():
            logger.info("Topology cache expired — auto-rediscovering for site %s", site_code)
            await self._topology.discover_all()
            ne_entries = self._topology.resolve_site(site_code)

        if not ne_entries:
            logger.warning("Site %s not found in topology cache", site_code)
            result = {
                "site": site_code,
                "found": False,
                "alarms": [],
                "ne_count": 0,
                "query_time": datetime.now(timezone.utc).isoformat(),
            }
            await event_bus.publish("alarm_query", result)
            return result

        # Group NEs by UME server
        nes_by_ume: dict[str, list[dict]] = {}
        for entry in ne_entries:
            nes_by_ume.setdefault(entry["ume_id"], []).append(entry)

        all_alarms = []
        ne_name_map = {e["ne_nbiId"]: e["ne_name"] for e in ne_entries}

        for ume_id, nes in nes_by_ume.items():
            try:
                token = await self._auth.ensure_token(ume_id)
                client = self._clients[ume_id]
                mes = [f"{ne['subnetwork_id']},{ne['ne_nbiId']}" for ne in nes]
                alarms = await self._fetch_alarms(client, token, mes)
                for alarm in alarms:
                    alarm["_ne_name"] = alarm.get("mename", ne_name_map.get(str(alarm.get("nbiid", "")), ""))
                    alarm["_ume_id"] = ume_id
                all_alarms.extend(alarms)
            except Exception as e:
                logger.error("Alarm query failed for UME %s site %s: %s", ume_id, site_code, e)

        result = {
            "site": site_code,
            "found": True,
            "alarms": all_alarms,
            "ne_count": len(ne_entries),
            "query_time": datetime.now(timezone.utc).isoformat(),
        }
        await event_bus.publish("alarm_query", result)
        return result

    async def _fetch_alarms(self, client: UMEClient, token: str, mes: list[str]) -> list:
        all_alarms: list = []
        page = 1

        while True:
            resp = await client.post(
                settings.alarm_api_path,
                token=token,
                json={
                    "condition": {"mes": mes},
                    "pagesize": _PAGE_SIZE,
                    "page": page,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            if isinstance(data, list):
                all_alarms.extend(data)
                break

            alarms = data.get("alarms", data.get("data", []))
            all_alarms.extend(alarms)

            # Stop when we get fewer results than requested (last page)
            if len(alarms) < _PAGE_SIZE:
                break
            page += 1

        return all_alarms
