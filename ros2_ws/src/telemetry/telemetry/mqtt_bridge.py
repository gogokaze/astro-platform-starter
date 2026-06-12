"""MQTT → ROS2 bridge node.

Subscribes to cnc/sensor/+ MQTT topics and republishes each field
as typed ROS2 messages on /cnc/<device_id>/* topics.
"""

import json
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy
from std_msgs.msg import Float32, Int32, String
import paho.mqtt.client as mqtt


MQTT_HOST = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "cnc/sensor/+"


class MQTTBridge(Node):

    def __init__(self):
        super().__init__("mqtt_bridge")

        self.declare_parameter("mqtt_host", MQTT_HOST)
        self.declare_parameter("mqtt_port", MQTT_PORT)

        host = self.get_parameter("mqtt_host").get_parameter_value().string_value
        port = self.get_parameter("mqtt_port").get_parameter_value().integer_value

        qos = QoSProfile(depth=10, reliability=ReliabilityPolicy.BEST_EFFORT)

        # Publishers keyed by (device_id, field)
        self._pubs: dict[tuple[str, str], rclpy.publisher.Publisher] = {}

        self._mqtt = mqtt.Client(client_id="ros2_bridge")
        self._mqtt.on_connect = self._on_connect
        self._mqtt.on_message = self._on_message
        self._mqtt.connect(host, port, keepalive=60)
        self._mqtt.loop_start()

        self._qos = qos
        self.get_logger().info(f"MQTT bridge started → {host}:{port}")

    # ------------------------------------------------------------------
    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            client.subscribe(MQTT_TOPIC)
            self.get_logger().info(f"MQTT subscribed to {MQTT_TOPIC}")
        else:
            self.get_logger().error(f"MQTT connect failed rc={rc}")

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
        except json.JSONDecodeError as e:
            self.get_logger().warn(f"Bad JSON: {e}")
            return

        device_id = payload.get("device_id", msg.topic.split("/")[-1])
        base = f"/cnc/{device_id}"

        self._publish(base, "vibration", Float32, payload.get("vibration", 0.0), device_id)
        self._publish(base, "rpm",       Int32,  payload.get("rpm", 0),          device_id)
        self._publish(base, "temp_c",    Float32, payload.get("temp_c", 0.0),    device_id)
        self._publish(base, "status",    String, payload.get("status", "OK"),    device_id)

        self.get_logger().debug(
            f"[{device_id}] vib={payload.get('vibration'):.3f} "
            f"rpm={payload.get('rpm')} temp={payload.get('temp_c'):.1f}°C "
            f"status={payload.get('status')}"
        )

    def _publish(self, base: str, field: str, msg_type, value, device_id: str):
        key = (device_id, field)
        if key not in self._pubs:
            self._pubs[key] = self.create_publisher(msg_type, f"{base}/{field}", self._qos)

        ros_msg = msg_type()
        if msg_type is String:
            ros_msg.data = str(value)
        elif msg_type is Int32:
            ros_msg.data = int(value)
        else:
            ros_msg.data = float(value)

        self._pubs[key].publish(ros_msg)

    def destroy_node(self):
        self._mqtt.loop_stop()
        self._mqtt.disconnect()
        super().destroy_node()


def main():
    rclpy.init()
    node = MQTTBridge()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
