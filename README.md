# tryoz

One-line setup for the Oz MCP server.

```bash
npx tryoz setup --api-key oz-your-key
```

The CLI installs the Oz remote MCP server at:

```txt
https://tryoz.dev/mcp
```

It can configure detected coding agents, install an Oz skill where supported,
patch project rule files, and verify MCP connectivity.

## Commands

```bash
npx tryoz setup --api-key oz-your-key
npx tryoz setup --codex --api-key oz-your-key
npx tryoz setup --claude --api-key oz-your-key
npx tryoz mcp test --api-key oz-your-key
npx tryoz remove
```

Supported setup targets:

```txt
--codex
--claude
--cursor
--vscode
--windsurf
--opencode
```

If no target flag is provided, `tryoz setup` configures detected clients.

## What Setup Changes

- Adds an `oz` MCP server.
- Installs an Oz skill for clients with a skills directory.
- Adds an Oz documentation policy block to `AGENTS.md` and agent rule files.
- Creates timestamped backups before modifying existing files.
- Runs `tools/list` against the Oz MCP endpoint.

## Telemetry

The CLI sends anonymous setup telemetry unless disabled. It sends only:

- command name
- detected/selected clients
- OS/platform
- success/failure
- CLI version

It never sends API keys, prompts, file contents, or absolute paths.

Disable telemetry:

```bash
OZ_TELEMETRY_DISABLED=1 npx tryoz setup --api-key oz-your-key
npx tryoz setup --api-key oz-your-key --no-telemetry
```
