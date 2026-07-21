# Hocker

A Claude Code project housing the **Hocker** subagent — a web-scraping and
research assistant.

## Usage

Open Claude Code in this directory (or any project where you copy
`.claude/agents/hocker.md` into `~/.claude/agents/` for global access), then
either:

- Ask Claude naturally, e.g. "scrape https://example.com and pull the pricing
  table", and Claude Code will route to Hocker automatically when it fits, or
- Invoke it directly by name in the Agent tool / `@hocker`.

## Files

- `.claude/agents/hocker.md` — the subagent definition (system prompt, tools,
  model).
