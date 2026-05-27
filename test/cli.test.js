"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs, selectedClients } = require("../lib/cli");
const { internals } = require("../lib/clients");
const { upsertMarkedBlock, removeMarkedBlock } = require("../lib/fsx");

test("parse setup targets and api key", () => {
  const parsed = parseArgs(["setup", "--codex", "--claude", "--api-key", "oz-test", "--no-telemetry"]);
  assert.equal(parsed.command, "setup");
  assert.equal(parsed.codex, true);
  assert.equal(parsed.claude, true);
  assert.equal(parsed.apiKey, "oz-test");
  assert.equal(parsed.noTelemetry, true);
});

test("selects detected clients when no explicit target is passed", () => {
  const selected = selectedClients({}, { codex: true, claude: false, cursor: true, vscode: false, windsurf: false, opencode: false });
  assert.deepEqual(selected, ["codex", "cursor"]);
});

test("marked blocks are idempotent", () => {
  const once = upsertMarkedBlock("# File\n", "OZ DOCUMENTATION POLICY", "Policy");
  const twice = upsertMarkedBlock(once, "OZ DOCUMENTATION POLICY", "Policy");
  assert.equal(twice, once);
  assert.equal(removeMarkedBlock(twice, "OZ DOCUMENTATION POLICY"), "# File\n");
});

test("removeTomlTable removes only the target MCP table", () => {
  const input = [
    'model = "gpt-5"',
    "",
    "[mcp_servers.oz]",
    'url = "https://tryoz.dev/mcp"',
    "",
    "[mcp_servers.other]",
    'command = "node"',
    ""
  ].join("\n");
  const output = internals.removeTomlTable(input, "mcp_servers.oz");
  assert(!output.includes("[mcp_servers.oz]"));
  assert(output.includes("[mcp_servers.other]"));
});

test("shell env block is idempotent", () => {
  const once = internals.upsertShellBlock("", "export OZ_API_KEY='oz-test'");
  const twice = internals.upsertShellBlock(once, "export OZ_API_KEY='oz-test'");
  assert.equal(twice, once);
});
