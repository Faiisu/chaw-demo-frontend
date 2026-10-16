import mqtt from "mqtt";
import { parseReport } from "../src/analytics.js";

export function startCollector(store, env = process.env) {
  const brokerUrl = env.MQTT_URL ?? "mqtt://mqtt:1883";
  const topic = env.MQTT_TOPIC ?? "restaurant/01";
  const status = { connection: "offline", message: "Collection disabled", url: "", topic, invalid: 0, storageError: null };
  if (!brokerUrl) return { status, close: () => Promise.resolve() };
  const url = new URL(brokerUrl);
  if (!["mqtt:", "mqtts:", "ws:", "wss:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("MQTT_URL must be an MQTT URL without embedded credentials. Use MQTT_USERNAME and MQTT_PASSWORD.");
  }
  if (!topic || topic.includes("\0") || Buffer.byteLength(topic) > 65535 || topic.split("/").some((part, i, all) =>
    (part.includes("#") && (part !== "#" || i !== all.length - 1)) || (part.includes("+") && part !== "+")
  )) throw new Error("Invalid MQTT_TOPIC.");
  status.url = url.href;
  status.connection = "connecting";
  status.message = "Connecting to the shared MQTT broker…";
  const client = mqtt.connect(url.href, {
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
    resubscribe: false,
  });
  let subscriptionRetry;
  client.on("connect", () => {
    client.subscribe(topic, { qos: 1 }, (error, granted) => {
      if (error || !granted?.length || granted.some((item) => item.qos >= 128)) {
        status.connection = "error";
        status.message = "Broker denied the subscription. Retrying…";
        clearTimeout(subscriptionRetry);
        subscriptionRetry = setTimeout(() => client.reconnect(), 2000);
        return;
      }
      status.connection = "connected";
      status.message = `Collecting ${topic} in the shared database`;
    });
  });
  client.on("message", (source, message, packet) => {
    let payload;
    try {
      if (message.length > 1024 * 1024) throw new Error("Message exceeds 1 MB.");
      payload = parseReport(message.toString());
    } catch {
      status.invalid += 1;
      return;
    }
    try {
      store.addReport(source, payload, packet.retain);
      status.storageError = null;
    } catch {
      status.storageError = "Cannot save reports to SQLite. Check disk space and database permissions.";
      console.error(status.storageError);
    }
  });
  client.on("error", () => {
    status.connection = "error";
    status.message = "Cannot connect to the MQTT broker. Retrying…";
  });
  client.on("close", () => {
    if (status.connection !== "error") status.connection = "connecting";
    status.message = "MQTT disconnected. Retrying…";
  });
  client.on("reconnect", () => { status.connection = "connecting"; });
  return { status, close: () => {
    clearTimeout(subscriptionRetry);
    return new Promise((resolve) => client.end(true, {}, resolve));
  } };
}
