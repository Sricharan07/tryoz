"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  AGENTS_POLICY,
  CURSOR_RULE,
  SKILL_TEXT
} = require("./constants");
const {
  commandExists,
  ensureDir,
  exists,
  homePath,
  readJSON,
  readText,
  removeMarkedBlock,
  upsertMarkedBlock,
  writeJSON,
  writeText
} = require("./fsx");

const BLOCK = "OZ DOCUMENTATION POLICY";

function detectClients() {
  return {
    codex: commandExists("codex") || exists(homePath(".codex")),
    claude: commandExists("claude") || exists(homePath(".claude")),
    cursor: exists(homePath(".cursor")) || commandExists("cursor"),
    vscode: commandExists("code") || exists(vscodeUserDir()),
    windsurf: exists(homePath(".codeium", "windsurf")) || commandExists("windsurf"),
    opencode: commandExists("opencode") || exists(opencodeConfigPath())
  };
}

function setupClients(clients, context) {
  const changes = [];
  setupProjectRules(context, changes);
  for (const client of clients) {
    if (client === "codex") setupCodex(context, changes);
    if (client === "claude") setupClaude(context, changes);
    if (client === "cursor") setupCursor(context, changes);
    if (client === "vscode") setupVSCode(context, changes);
    if (client === "windsurf") setupWindsurf(context, changes);
    if (client === "opencode") setupOpenCode(context, changes);
  }
  return changes;
}

function removeClients(clients, context) {
  const changes = [];
  removeProjectRules(context, changes);
  for (const client of clients) {
    if (client === "codex") removeCodex(context, changes);
    if (client === "claude") removeClaude(context, changes);
    if (client === "cursor") removeJSONServer(cursorConfigPath(), ["mcpServers"], "oz", context, changes, "cursor");
    if (client === "vscode") removeJSONServer(vscodeMCPPath(context.cwd), ["servers"], "oz", context, changes, "vscode");
    if (client === "windsurf") removeJSONServer(windsurfConfigPath(), ["mcpServers"], "oz", context, changes, "windsurf");
    if (client === "opencode") removeJSONServer(opencodeConfigPath(), ["mcp"], "oz", context, changes, "opencode");
  }
  return changes;
}

function setupProjectRules(context, changes) {
  upsertMarkdownPolicy(path.join(context.cwd, "AGENTS.md"), context, changes, "agents");
  upsertMarkdownPolicy(path.join(context.cwd, "CLAUDE.md"), context, changes, "claude-rules");
  upsertCursorRule(path.join(context.cwd, ".cursor", "rules", "oz.mdc"), context, changes);
  upsertPlainMarkedPolicy(path.join(context.cwd, ".windsurfrules"), context, changes, "windsurf-rules");
}

function removeProjectRules(context, changes) {
  removeMarkedPolicy(path.join(context.cwd, "AGENTS.md"), context, changes, "agents");
  removeMarkedPolicy(path.join(context.cwd, "CLAUDE.md"), context, changes, "claude-rules");
  removeFile(path.join(context.cwd, ".cursor", "rules", "oz.mdc"), context, changes, "cursor-rule");
  removeMarkedPolicy(path.join(context.cwd, ".windsurfrules"), context, changes, "windsurf-rules");
}

function setupCodex(context, changes) {
  const configPath = homePath(".codex", "config.toml");
  const nextBlock = [
    "[mcp_servers.oz]",
    `url = ${tomlString(context.endpoint)}`,
    'bearer_token_env_var = "OZ_API_KEY"',
    "enabled = true"
  ].join("\n");
  const original = exists(configPath) ? readText(configPath) : "";
  const next = `${removeTomlTable(original, "mcp_servers.oz").trimEnd()}\n\n${nextBlock}\n`;
  writeMaybe(configPath, next, context, changes, "codex");
  installSkill(homePath(".codex", "skills", "oz", "SKILL.md"), context, changes, "codex-skill");
  upsertShellEnv(context, changes);
}

function removeCodex(context, changes) {
  const configPath = homePath(".codex", "config.toml");
  if (exists(configPath)) {
    const next = removeTomlTable(readText(configPath), "mcp_servers.oz");
    writeMaybe(configPath, next, context, changes, "codex");
  }
  removeFile(homePath(".codex", "skills", "oz", "SKILL.md"), context, changes, "codex-skill");
  removeShellEnv(context, changes);
}

function setupClaude(context, changes) {
  if (commandExists("claude") && !context.dryRun) {
    run("claude", ["mcp", "remove", "--scope", "user", "oz"], { allowFailure: true });
    const config = JSON.stringify({
      type: "http",
      url: context.endpoint,
      headers: { Authorization: `Bearer ${context.apiKey}` }
    });
    run("claude", ["mcp", "add-json", "--scope", "user", "oz", config]);
    changes.push(change("claude", "configured Claude Code user MCP via claude mcp add-json"));
  } else {
    changes.push(change("claude", commandExists("claude") ? "would configure Claude Code user MCP" : "Claude Code CLI not found; skipped MCP config"));
  }
  installSkill(homePath(".claude", "skills", "oz", "SKILL.md"), context, changes, "claude-skill");
}

function removeClaude(context, changes) {
  if (commandExists("claude") && !context.dryRun) {
    run("claude", ["mcp", "remove", "--scope", "user", "oz"], { allowFailure: true });
    changes.push(change("claude", "removed Claude Code user MCP"));
  } else {
    changes.push(change("claude", commandExists("claude") ? "would remove Claude Code user MCP" : "Claude Code CLI not found; skipped MCP removal"));
  }
  removeFile(homePath(".claude", "skills", "oz", "SKILL.md"), context, changes, "claude-skill");
}

function setupCursor(context, changes) {
  upsertJSONServer(cursorConfigPath(), ["mcpServers"], "oz", {
    type: "streamableHttp",
    url: context.endpoint,
    headers: { Authorization: `Bearer ${context.apiKey}` }
  }, context, changes, "cursor");
}

function setupVSCode(context, changes) {
  upsertJSONServer(vscodeMCPPath(context.cwd), ["servers"], "oz", {
    type: "http",
    url: context.endpoint,
    headers: { Authorization: `Bearer ${context.apiKey}` }
  }, context, changes, "vscode");
}

function setupWindsurf(context, changes) {
  upsertJSONServer(windsurfConfigPath(), ["mcpServers"], "oz", {
    serverUrl: context.endpoint,
    headers: { Authorization: `Bearer ${context.apiKey}` }
  }, context, changes, "windsurf");
}

function setupOpenCode(context, changes) {
  upsertJSONServer(opencodeConfigPath(), ["mcp"], "oz", {
    type: "remote",
    url: context.endpoint,
    enabled: true,
    headers: { Authorization: `Bearer ${context.apiKey}` }
  }, context, changes, "opencode");
}

function upsertJSONServer(filePath, objectPath, key, value, context, changes, label) {
  const doc = readJSON(filePath, {});
  let cursor = doc;
  for (const part of objectPath) {
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[key] = value;
  writeMaybeJSON(filePath, doc, context, changes, label);
}

function removeJSONServer(filePath, objectPath, key, context, changes, label) {
  if (!exists(filePath)) return;
  const doc = readJSON(filePath, {});
  let cursor = doc;
  for (const part of objectPath) {
    if (!cursor[part] || typeof cursor[part] !== "object") return;
    cursor = cursor[part];
  }
  delete cursor[key];
  writeMaybeJSON(filePath, doc, context, changes, label);
}

function upsertMarkdownPolicy(filePath, context, changes, label) {
  const original = exists(filePath) ? readText(filePath) : "";
  writeMaybe(filePath, upsertMarkedBlock(original, BLOCK, AGENTS_POLICY), context, changes, label);
}

function upsertPlainMarkedPolicy(filePath, context, changes, label) {
  const original = exists(filePath) ? readText(filePath) : "";
  writeMaybe(filePath, upsertMarkedBlock(original, BLOCK, AGENTS_POLICY), context, changes, label);
}

function removeMarkedPolicy(filePath, context, changes, label) {
  if (!exists(filePath)) return;
  writeMaybe(filePath, removeMarkedBlock(readText(filePath), BLOCK), context, changes, label);
}

function upsertCursorRule(filePath, context, changes) {
  writeMaybe(filePath, CURSOR_RULE, context, changes, "cursor-rule");
}

function installSkill(filePath, context, changes, label) {
  writeMaybe(filePath, SKILL_TEXT, context, changes, label);
}

function removeFile(filePath, context, changes, label) {
  if (!exists(filePath)) return;
  if (!context.dryRun) {
    fs.rmSync(filePath, { force: true });
  }
  changes.push(change(label, `${context.dryRun ? "would remove" : "removed"} ${displayPath(filePath)}`));
}

function upsertShellEnv(context, changes) {
  const shell = path.basename(process.env.SHELL || "");
  const filePath = shell.includes("zsh") ? homePath(".zshrc") : homePath(".bashrc");
  const block = `export OZ_API_KEY=${shellQuote(context.apiKey)}`;
  const original = exists(filePath) ? readText(filePath) : "";
  writeMaybe(filePath, upsertShellBlock(original, block), context, changes, "shell-env");
}

function removeShellEnv(context, changes) {
  const candidates = [homePath(".zshrc"), homePath(".bashrc")];
  for (const filePath of candidates) {
    if (!exists(filePath)) continue;
    writeMaybe(filePath, removeShellBlock(readText(filePath)), context, changes, "shell-env");
  }
}

function upsertShellBlock(content, block) {
  const begin = "# BEGIN OZ API KEY";
  const end = "# END OZ API KEY";
  const next = `${begin}\n${block}\n${end}`;
  const pattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`, "m");
  if (pattern.test(content)) return content.replace(pattern, next);
  return `${content.trimEnd()}\n\n${next}\n`;
}

function removeShellBlock(content) {
  const begin = "# BEGIN OZ API KEY";
  const end = "# END OZ API KEY";
  const pattern = new RegExp(`\\n?${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
  return content.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function writeMaybeJSON(filePath, value, context, changes, label) {
  if (!context.dryRun) {
    writeJSON(filePath, value, { backup: true });
  }
  changes.push(change(label, `${context.dryRun ? "would update" : "updated"} ${displayPath(filePath)}`));
}

function writeMaybe(filePath, content, context, changes, label) {
  if (!context.dryRun) {
    writeText(filePath, content, { backup: true });
  }
  changes.push(change(label, `${context.dryRun ? "would update" : "updated"} ${displayPath(filePath)}`));
}

function removeTomlTable(content, tableName) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let skipping = false;
  const header = `[${tableName}]`;
  for (const line of lines) {
    if (line.trim() === header) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s*\[[^\]]+\]\s*$/.test(line)) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function cursorConfigPath() {
  return homePath(".cursor", "mcp.json");
}

function vscodeUserDir() {
  if (process.platform === "darwin") return homePath("Library", "Application Support", "Code", "User");
  if (process.platform === "win32") return path.join(process.env.APPDATA || homePath("AppData", "Roaming"), "Code", "User");
  return homePath(".config", "Code", "User");
}

function vscodeMCPPath(cwd) {
  return path.join(cwd, ".vscode", "mcp.json");
}

function windsurfConfigPath() {
  return homePath(".codeium", "windsurf", "mcp_config.json");
}

function opencodeConfigPath() {
  if (process.platform === "darwin") return homePath("Library", "Application Support", "opencode", "opencode.json");
  if (process.platform === "win32") return path.join(process.env.APPDATA || homePath("AppData", "Roaming"), "opencode", "opencode.json");
  return homePath(".config", "opencode", "opencode.json");
}

function displayPath(filePath) {
  return filePath.replace(os.homedir(), "~");
}

function tomlString(value) {
  return JSON.stringify(value);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function change(client, message) {
  return { client, message };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  detectClients,
  removeClients,
  setupClients,
  paths: {
    cursorConfigPath,
    opencodeConfigPath,
    vscodeMCPPath,
    windsurfConfigPath
  },
  internals: {
    removeTomlTable,
    upsertShellBlock
  }
};
