import time
from threading import Lock


class TTLCache:
    def __init__(self):
        self._store: dict = {}
        self._lock = Lock()

    def set(self, key: str, value, ttl_seconds: int):
        with self._lock:
            self._store[key] = {"value": value, "expires_at": time.time() + ttl_seconds}

    def get(self, key: str):
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if time.time() > entry["expires_at"]:
                del self._store[key]
                return None
            return entry["value"]

    def delete(self, key: str):
        with self._lock:
            self._store.pop(key, None)

    def ttl(self, key: str) -> float:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return 0.0
            remaining = entry["expires_at"] - time.time()
            return max(0.0, remaining)


cache = TTLCache()
