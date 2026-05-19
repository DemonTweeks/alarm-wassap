import asyncio
import logging

from services.cache import cache
from services.ume_client import UMEClient

logger = logging.getLogger(__name__)

TOKEN_REFRESH_THRESHOLD = 300  # refresh if < 5 minutes remaining


class AuthService:
    def __init__(self, clients: dict[str, UMEClient], servers: list[dict]):
        self._clients = clients
        self._servers = {s["id"]: s for s in servers}
        # Last known token per server — persists in memory regardless of cache TTL
        # Used to guarantee logout on shutdown even after cache expiry
        self._last_token: dict[str, str] = {}

    async def ensure_token(self, server_id: str) -> str:
        ttl = cache.ttl(f"token:{server_id}")
        if ttl > TOKEN_REFRESH_THRESHOLD:
            return cache.get(f"token:{server_id}")

        if ttl > 0:
            logger.info("Refreshing token for %s", server_id)
            return await self._refresh_token(server_id)

        logger.info("Acquiring new token for %s", server_id)
        return await self._get_token(server_id)

    async def _get_token(self, server_id: str) -> str:
        server = self._servers[server_id]
        client = self._clients[server_id]
        resp = await client.post(
            "/api/oauth2/v1/oauth/token",
            json={
                "userName": server["username"],
                "value": server["password"],
                "grantType": "password",
            },
        )
        resp.raise_for_status()
        data = resp.json()

        if str(data.get("code", "0")) != "0":
            raise RuntimeError(
                f"UME {server_id} auth error code={data.get('code')}: {data.get('message')}"
            )

        token = data["accessToken"]
        expires_in = data.get("expires", 1800)
        cache.set(f"token:{server_id}", token, ttl_seconds=expires_in)
        self._last_token[server_id] = token
        logger.info("Token acquired for %s (expires in %ds)", server_id, expires_in)
        return token

    async def _refresh_token(self, server_id: str) -> str:
        token = cache.get(f"token:{server_id}")
        client = self._clients[server_id]
        try:
            resp = await client.get("/api/oauth2/v1/oauth/handshake", token=token)
            resp.raise_for_status()
            data = resp.json()
            new_token = data.get("accessToken", token)
            expires_in = data.get("expires", 1800)
            cache.set(f"token:{server_id}", new_token, ttl_seconds=expires_in)
            self._last_token[server_id] = new_token
            return new_token
        except Exception:
            logger.warning("Token refresh failed for %s, re-authenticating", server_id)
            return await self._get_token(server_id)

    async def logout(self, server_id: str):
        token = cache.get(f"token:{server_id}") or self._last_token.get(server_id)
        if not token:
            logger.warning("No token for %s — skipping logout", server_id)
            return
        client = self._clients[server_id]
        try:
            await client.delete("/api/oauth2/v1/logout", token=token, timeout=5.0)
            logger.info("Logged out of %s", server_id)
        except Exception as e:
            logger.warning("Logout failed for %s: %s", server_id, e)
        finally:
            cache.delete(f"token:{server_id}")
            self._last_token.pop(server_id, None)

    async def logout_all(self):
        try:
            await asyncio.wait_for(
                asyncio.gather(*[self.logout(sid) for sid in self._clients],
                               return_exceptions=True),
                timeout=10.0,
            )
        except asyncio.TimeoutError:
            logger.warning("Logout timed out — sessions may remain on UME")
