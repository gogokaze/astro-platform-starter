from setuptools import setup

package_name = "telemetry"

setup(
    name=package_name,
    version="0.1.0",
    packages=[package_name],
    install_requires=["setuptools", "paho-mqtt"],
    zip_safe=True,
    maintainer="factory",
    maintainer_email="factory@example.com",
    description="MQTT → ROS2 telemetry bridge for CNC sensors",
    license="MIT",
    entry_points={
        "console_scripts": [
            "mqtt_bridge = telemetry.mqtt_bridge:main",
        ],
    },
)
