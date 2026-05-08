# AGENTS.md

## Project: Album Extractor

A Claude Code skill that splits concert/live recordings into clean, properly-named album tracks. AI handles research and normalization; CLI handles deterministic execution.

## Architecture

- **This repo** is the canonical source for the `album-extractor` skill
- **Windows junction** at `~/.claude/skills/album-extractor/` points to this directory
- After `git pull`, the skill updates automatically with zero maintenance

## Layout

```
album-extractor/           ← repo root (this directory)
├── SKILL.md               ← skill definition (AI agent contract)
├── tool.js                ← CLI: manifest & build commands
├── src/                   ← core modules (build, discover, ffmpeg, manifest, parse, research, verify)
├── tests/                 ← Node native test suite
```

User data (`albums/`) lives at `../albums/` — outside version control.

## Commands

- `npm test` — run all tests
- `node tool.js manifest <album-dir>` — generate manifest
- `node tool.js build --manifest <path>` — split & encode

## Junction setup

```powershell
cmd /c rmdir "$env:USERPROFILE\.claude\skills\album-extractor"
New-Item -Path "$env:USERPROFILE\.claude\skills\album-extractor" -ItemType Junction -Target "<repo-path>\album-extractor"
```

## Language

All interactions in Simplified Chinese (简体中文).
