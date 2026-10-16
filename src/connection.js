import { createId } from "./id.js";
import mqtt from "mqtt";
export function validateConnection(config) {
  let url;
  try {
    url = new URL(config.url);
  } catch {
    throw new Error("Enter a valid MQTT server URL.");
  }
  if (!["mqtt:", "mqtts:", "ws:", "wss:"].includes(url.protocol))
    throw new Error("Use mqtt://, mqtts://, ws://, or wss://.");
  if (url.username || url.password)
    throw new Error(
      "Enter credentials in the separate username and password fields.",
    );
  if (
    !config.topic.trim() ||
    config.topic.includes("\0") ||
    new TextEncoder().encode(config.topic).length > 65535 ||
    config.topic
      .split("/")
      .some(
        (part, i, all) =>
          (part.includes("#") && (part !== "#" || i !== all.length - 1)) ||
          (part.includes("+") && part !== "+"),
      )
  )
    throw new Error(
      "Invalid topic: + must occupy a whole level; # must be the final level.",
    );
  if (location.protocol === "https:" && url.protocol === "ws:")
    throw new Error("An HTTPS page requires wss://.");
  return url;
}
export function connectBroker(config, handlers = {}, test = false) {
  const broker = validateConnection(config);
  const url = ["mqtt:", "mqtts:"].includes(broker.protocol)
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/mqtt-bridge?broker=${encodeURIComponent(broker.href)}`
    : broker.href;
  const client = mqtt.connect(url, {
    clientId: `chew_${test ? "test" : "live"}_${createId().slice(0, 8)}`,
    username: config.username || undefined,
    password: config.password || undefined,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 0,
  });
  let finished = false,
    ready = false;
  const timeout = setTimeout(
    () =>
      finish(
        new Error(
          "Connection or subscription timed out after 10 seconds. Check your network and broker.",
        ),
      ),
    10000,
  );
  function finish(error) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    client.end(true);
    if (error) handlers.onError?.(error);
    else handlers.onSuccess?.();
  }
  client.on("connect", () =>
    client.subscribe(config.topic.trim(), { qos: 0 }, (error, granted) => {
      if (finished) return;
      if (error || !granted?.length || granted.some((g) => g.qos >= 128))
        return finish(
          error ||
            new Error(
              "The broker denied permission to subscribe to this topic.",
            ),
        );
      ready = true;
      clearTimeout(timeout);
      if (test) finish();
      else handlers.onSuccess?.();
    }),
  );
  client.on("message", (topic, message, packet) => {
    if (!test && !finished)
      handlers.onMessage?.(topic, message.toString(), packet);
  });
  client.on("error", finish);
  client.on("close", () => {
    if (!finished && ready)
      finish(new Error("Connection lost. Please reconnect."));
  });
  return () => {
    finished = true;
    clearTimeout(timeout);
    client.end(true);
  };
}
