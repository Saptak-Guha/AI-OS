"""Event bus for real-time agent monitoring via Socket.IO."""

from __future__ import annotations

import asyncio
from typing import Any

_subscribers: dict[int, list[asyncio.Queue]] = {}
_sio: Any = None


def set_socketio(sio: Any) -> None:
    global _sio
    _sio = sio


class EventBus:
    async def publish(self, task_id: int, event: dict) -> None:
        event["task_id"] = task_id
        if _sio:
            # One broadcast: the UI filters by task_id. Emitting to the room *and*
            # globally delivered every event twice to clients that had joined.
            await _sio.emit("agent_event", event)

        for queue in _subscribers.get(task_id, []):
            await queue.put(event)

    def subscribe(self, task_id: int) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        _subscribers.setdefault(task_id, []).append(queue)
        return queue

    def unsubscribe(self, task_id: int, queue: asyncio.Queue) -> None:
        subs = _subscribers.get(task_id, [])
        if queue in subs:
            subs.remove(queue)


event_bus = EventBus()
