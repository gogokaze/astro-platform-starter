from setuptools import setup

package_name = "digital_twin"

setup(
    name=package_name,
    version="0.1.0",
    packages=[package_name],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="factory",
    maintainer_email="factory@example.com",
    description="ROS2 digital twin node for CNC machines (RViz markers + state bridge)",
    license="MIT",
    entry_points={
        "console_scripts": [
            "twin_node = digital_twin.twin_node:main",
        ],
    },
)
