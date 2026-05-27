"use strict";

const os = require("node:os");
const { TELEMETRY_ENDPOINT } = require("./constants");
const pkg = require("../package.json");

function telemetryDisabled(options = {}) {
  return Boolean(options.noTelemetry) || process.env.OZ_TELEMETRY_DISABLED === "1" || process.env.TRYOZ_TELEMETRY_DISABLED === "1";
}

async function sendTelemetry(command, clients, success, options = {}) {
  if (telemetryDisabled(options)) return;
  const payload = {
    command,
    clients: Array.isArray(clients) ? clients : [],
    platform: os.platform(),
    arch: os.arch(),
    success: Boolean(success),
    version: pkg.version
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);
  } catch {
    // Telemetry must never affect setup.
  }
}

module.exports = { sendTelemetry, telemetryDisabled };
