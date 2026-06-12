#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* ssid         = "YOUR_WIFI_SSID";
const char* password     = "YOUR_WIFI_PASSWORD";
const char* mqtt_server  = "192.168.0.10";  // MQTT Broker IP
const int   mqtt_port    = 1883;
const char* device_id    = "swiss_lathe_01";

WiFiClient   espClient;
PubSubClient client(espClient);

unsigned long lastPublish = 0;
const long    publishInterval = 200;  // 5 Hz

void connectWiFi() {
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
}

void reconnectMQTT() {
    while (!client.connected()) {
        Serial.print("MQTT connecting...");
        String clientId = "esp32_" + String(device_id);
        if (client.connect(clientId.c_str())) {
            Serial.println("connected");
        } else {
            Serial.printf(" failed rc=%d, retry in 2s\n", client.state());
            delay(2000);
        }
    }
}

void setup() {
    Serial.begin(115200);
    connectWiFi();
    client.setServer(mqtt_server, mqtt_port);
    client.setBufferSize(512);
}

void loop() {
    if (!client.connected()) reconnectMQTT();
    client.loop();

    unsigned long now = millis();
    if (now - lastPublish >= publishInterval) {
        lastPublish = now;

        // ADC pin 34 = vibration sensor (0–4095)
        int   raw       = analogRead(34);
        float vibration = raw / 4095.0f;

        // Simulated spindle RPM via ADC pin 35
        int   rpmRaw    = analogRead(35);
        int   rpm       = map(rpmRaw, 0, 4095, 0, 6000);

        // Internal temperature (ESP32 built-in)
        float tempC     = (temprature_sens_read() - 32) / 1.8f;

        StaticJsonDocument<256> doc;
        doc["device_id"]  = device_id;
        doc["timestamp"]  = now;
        doc["vibration"]  = vibration;
        doc["rpm"]        = rpm;
        doc["temp_c"]     = tempC;
        doc["status"]     = (vibration > 0.8) ? "WARNING" : "OK";

        char buf[256];
        serializeJson(doc, buf);

        String topic = "cnc/sensor/" + String(device_id);
        client.publish(topic.c_str(), buf);

        Serial.printf("[MQTT] vibration=%.3f rpm=%d temp=%.1f°C\n",
                      vibration, rpm, tempC);
    }
}
