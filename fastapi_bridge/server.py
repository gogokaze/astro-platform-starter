"""FastAPI WebSocket bridge.

Subscribes to /cnc/twin/state (ROS2 → JSON string) and fans out
the latest payload to every connected WebSocket client at 10 Hz.

Run:
    source /opt/ros/humble/setup.bash
    source ~/ros2_ws/install/setup.bash
    uvicorn fastapi_bridge.server:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
import json
import threading
from typing import Any

import rclpy
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy
from std_msgs.msg import String


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
latest_state: dict[str, Any] = {
    "timestamp": 0,
    "machines": {},
}
_connected: set[WebSocket] = set()
_state_lock = threading.Lock()


# ---------------------------------------------------------------------------
# ROS2 subscriber (runs in its own thread)
# ---------------------------------------------------------------------------
class StateSubscriber(Node):

    def __init__(self):
        super().__init__("fastapi_bridge")
        qos = QoSProfile(depth=5, reliability=ReliabilityPolicy.BEST_EFFORT)
        self.create_subscription(String, "/cnc/twin/state", self._cb, qos)

    def _cb(self, msg: String):
        global latest_state
        try:
            data = json.loads(msg.data)
            with _state_lock:
                latest_state = data
        except json.JSONDecodeError:
            pass


def _ros_spin():
    rclpy.init()
    node = StateSubscriber()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


_ros_thread = threading.Thread(target=_ros_spin, daemon=True)
_ros_thread.start()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="CNC Digital Twin Bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/state")
async def get_state():
    with _state_lock:
        return latest_state


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    _connected.add(websocket)
    try:
        while True:
            with _state_lock:
                payload = dict(latest_state)
            await websocket.send_json(payload)
            await asyncio.sleep(0.1)          # 10 Hz push
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        _connected.discard(websocket)
