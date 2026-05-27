"use strict";

const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { CLIENTS, DEFAULT_ENDPOINT } = require("./constants");
const { detectClients, removeClients, setupClients } = require("./clients");
const { testMCP } = require("./mcp");
const { sendTelemetry } = require("./telemetry");
const pkg = require("../package.json");

async function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help || !parsed.command) {
    printHelp();
    return;
  }
  if (parsed.command === "version") {
    console.log(pkg.version);
    return;
  }
  if (parsed.command === "detect") {
    printDetected(detectClients());
    return;
  }
  if (parsed.command === "setup") {
    await runSetup(parsed);
    return;
  }
  if (parsed.command === "remove") {
    await runRemove(parsed);
    return;
  }
  if (parsed.command === "mcp" && parsed.subcommand === "test") {
    await runMCPTest(parsed);
    return;
  }
  throw new Error(`Unknown command: ${[parsed.command, parsed.subcommand].filter(Boolean).join(" ")}`);
}

async function runSetup(options) {
  const detected = detectClients();
  const clients = selectedClients(options, detected);
  if (clients.length === 0) {
    throw new Error("No supported coding agents detected. Pass a target flag such as --codex or --claude.");
  }
  const apiKey = await resolveAPIKey(options, true);
  const context = {
    apiKey,
    cwd: process.cwd(),
    dryRun: Boolean(options.dryRun),
    endpoint: options.endpoint || DEFAULT_ENDPOINT
  };
  let success = false;
  try {
    const changes = setupClients(clients, context);
    printChanges("Setup complete", changes);
    if (context.dryRun) {
      console.log("MCP tools/list skipped for dry run.");
    } else {
      const tools = await testMCP(context.endpoint, apiKey);
      console.log(`MCP tools/list OK: ${tools.join(", ")}`);
    }
    success = true;
  } finally {
    await sendTelemetry("setup", clients, success, options);
  }
}

async function runRemove(options) {
  const detected = detectClients();
  const clients = selectedClients(options, detected, { defaultAll: true });
  const context = {
    cwd: process.cwd(),
    dryRun: Boolean(options.dryRun),
    endpoint: options.endpoint || DEFAULT_ENDPOINT
  };
  let success = false;
  try {
    const changes = removeClients(clients, context);
    printChanges("Remove complete", changes);
    success = true;
  } finally {
    await sendTelemetry("remove", clients, success, options);
  }
}

async function runMCPTest(options) {
  const apiKey = await resolveAPIKey(options, true);
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  let success = false;
  try {
    const tools = await testMCP(endpoint, apiKey);
    console.log(`MCP tools/list OK: ${tools.join(", ")}`);
    success = true;
  } finally {
    await sendTelemetry("mcp test", [], success, options);
  }
}

function selectedClients(options, detected, opts = {}) {
  const explicit = CLIENTS.filter((client) => options[client]);
  if (options.all) return CLIENTS;
  if (explicit.length > 0) return explicit;
  if (opts.defaultAll) return CLIENTS;
  return CLIENTS.filter((client) => detected[client]);
}

async function resolveAPIKey(options, required) {
  const apiKey = options.apiKey || process.env.OZ_API_KEY || process.env.TRYOZ_API_KEY || "";
  if (apiKey) return apiKey.trim();
  if (!required) return "";
  if (!process.stdin.isTTY) {
    throw new Error("Missing Oz API key. Pass --api-key oz-... or set OZ_API_KEY.");
  }
  const rl = readline.createInterface({ input, output });
  try {
    const value = await rl.question("Oz API key: ");
    if (!value.trim()) throw new Error("Missing Oz API key.");
    return value.trim();
  } finally {
    rl.close();
  }
}

function parseArgs(argv) {
  const out = { command: "", subcommand: "" };
  const rest = [...argv];
  out.command = rest.shift() || "";
  if (out.command === "--version" || out.command === "-v") out.command = "version";
  if (out.command === "--help" || out.command === "-h") out.help = true;
  if (out.command === "mcp" && rest[0] && !rest[0].startsWith("-")) {
    out.subcommand = rest.shift();
  }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--all") out.all = true;
    else if (arg === "--no-telemetry") out.noTelemetry = true;
    else if (CLIENTS.map((client) => `--${client}`).includes(arg)) out[arg.slice(2)] = true;
    else if (arg === "--api-key") out.apiKey = rest[++i] || "";
    else if (arg.startsWith("--api-key=")) out.apiKey = arg.slice("--api-key=".length);
    else if (arg === "--endpoint") out.endpoint = rest[++i] || "";
    else if (arg.startsWith("--endpoint=")) out.endpoint = arg.slice("--endpoint=".length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return out;
}

function printDetected(detected) {
  for (const client of CLIENTS) {
    console.log(`${client}: ${detected[client] ? "detected" : "not detected"}`);
  }
}

function printChanges(title, changes) {
  console.log(title);
  if (changes.length === 0) {
    console.log("- no changes");
    return;
  }
  for (const item of changes) {
    console.log(`- ${item.client}: ${item.message}`);
  }
}

function printHelp() {
  console.log(`tryoz ${pkg.version}

Usage:
  npx tryoz setup --api-key oz-...
  npx tryoz setup --codex --api-key oz-...
  npx tryoz remove
  npx tryoz mcp test --api-key oz-...
  npx tryoz detect

Options:
  --codex        Configure Codex
  --claude       Configure Claude Code
  --cursor       Configure Cursor
  --vscode       Configure VS Code workspace MCP
  --windsurf     Configure Windsurf
  --opencode     Configure OpenCode
  --all          Configure all supported clients
  --api-key      Oz API key
  --endpoint     Oz MCP endpoint, defaults to ${DEFAULT_ENDPOINT}
  --dry-run      Show intended changes without writing files
  --no-telemetry Disable anonymous CLI telemetry
`);
}

module.exports = {
  main,
  parseArgs,
  selectedClients
};
