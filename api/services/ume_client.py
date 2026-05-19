import httpx


class UMEClient:
    def __init__(self, server: dict):
        self.server_id: str = server["id"]
        self.host: str = server["host"]
        self.port: int = server["port"]
        self.base_url: str = f"https://{self.host}:{self.port}"
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            verify=False,  # ZTE UME uses self-signed certificates
            timeout=30.0,
        )

    async def get(self, path: str, token: str, **kwargs) -> httpx.Response:
        headers = {"Authorization": f"Bearer {token}"}
        return await self._client.get(path, headers=headers, **kwargs)

    async def post(self, path: str, token: str | None = None, **kwargs) -> httpx.Response:
        headers = {"Content-Type": "application/json;charset=UTF-8"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        # Merge any caller-supplied headers without overwriting auth/content-type
        extra = kwargs.pop("headers", {})
        headers.update(extra)
        return await self._client.post(path, headers=headers, **kwargs)

    async def delete(self, path: str, token: str, **kwargs) -> httpx.Response:
        headers = {"Authorization": f"Bearer {token}"}
        return await self._client.delete(path, headers=headers, **kwargs)

    async def close(self):
        await self._client.aclose()
