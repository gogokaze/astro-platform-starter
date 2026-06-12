"""Digital twin node.

Subscribes to /cnc/<device_id>/vibration and publishes a RViz Marker
whose Z-scale reflects the live vibration level. Also publishes a
/cnc/twin/state JSON string consumed by the FastAPI bridge.
"""

import json
import time
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy
from std_msgs.msg import Float32, String
from visualization_msgs.msg import Marker
from geometry_msgs.msg import Point
from builtin_interfaces.msg import Duration
import std_msgs.msg


DEVICE_IDS = ["swiss_lathe_01"]   # extend for multi-machine


class TwinNode(Node):

    def __init__(self):
        super().__init__("twin_node")

        self.declare_parameter("device_ids", DEVICE_IDS)
        devices = (
            self.get_parameter("device_ids")
            .get_parameter_value()
            .string_array_value
        ) or DEVICE_IDS

        qos = QoSProfile(depth=10, reliability=ReliabilityPolicy.BEST_EFFORT)

        self._marker_pub = self.create_publisher(Marker, "/cnc/twin_marker", qos)
        self._state_pub  = self.create_publisher(String, "/cnc/twin/state", qos)

        self._state: dict[str, dict] = {}

        for dev in devices:
            self._state[dev] = {"vibration": 0.0, "rpm": 0, "status": "OK"}
            self.create_subscription(
                Float32,
                f"/cnc/{dev}/vibration",
                lambda msg, d=dev: self._on_vibration(msg, d),
                qos,
            )
            self.create_subscription(
                std_msgs.msg.Int32,
                f"/cnc/{dev}/rpm",
                lambda msg, d=dev: self._on_rpm(msg, d),
                qos,
            )
            self.create_subscription(
                String,
                f"/cnc/{dev}/status",
                lambda msg, d=dev: self._on_status(msg, d),
                qos,
            )

        self.create_timer(0.5, self._publish_state)
        self.get_logger().info(f"Twin node watching: {devices}")

    # ------------------------------------------------------------------
    def _on_vibration(self, msg: Float32, device_id: str):
        self._state[device_id]["vibration"] = msg.data
        self._publish_marker(device_id, msg.data)

    def _on_rpm(self, msg, device_id: str):
        self._state[device_id]["rpm"] = msg.data

    def _on_status(self, msg: String, device_id: str):
        self._state[device_id]["status"] = msg.data

    def _publish_marker(self, device_id: str, vibration: float):
        marker = Marker()
        marker.header.frame_id = "map"
        marker.header.stamp = self.get_clock().now().to_msg()
        marker.ns = "cnc_twin"
        marker.id = abs(hash(device_id)) % (2**31)
        marker.type = Marker.CUBE
        marker.action = Marker.ADD

        # Size: vibration drives Z height (0 → 0.1 m, 1.0 → 5 m)
        marker.scale.x = 1.0
        marker.scale.y = 1.0
        marker.scale.z = max(0.1, vibration * 5.0)

        # Color: green → yellow → red based on vibration
        marker.color.a = 0.85
        marker.color.r = min(1.0, vibration * 2)
        marker.color.g = max(0.0, 1.0 - vibration)
        marker.color.b = 0.1

        # Lifetime: refresh every second
        marker.lifetime = Duration(sec=2)

        self._marker_pub.publish(marker)

    def _publish_state(self):
        payload = {
            "timestamp": time.time(),
            "machines": self._state,
        }
        msg = String()
        msg.data = json.dumps(payload)
        self._state_pub.publish(msg)


def main():
    rclpy.init()
    node = TwinNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
