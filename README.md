# Album Extractor

A [Claude Code](https://claude.ai/code) skill that splits concert recordings into album tracks. Say "process this album" and it researches the official setlist, normalizes track titles, splits audio, and embeds cover art — outputting ALAC for Apple Music or FLAC for archival.

---

## Install

```bash
git clone https://github.com/jazz-zzzz/album-extractor.git
cd album-extractor
npm install
```

**Prerequisites:** [Node.js](https://nodejs.org/) ≥ 18, [ffmpeg](https://ffmpeg.org/) (set `FFMPEG_HOME` or place in `~/Downloads/`).

Junction into Claude Code:

```powershell
cmd /c rmdir "$env:USERPROFILE\.claude\skills\album-extractor"
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.claude\skills\album-extractor" `
  -Target "<your-clone-path>\album-extractor"
```

`git pull` updates the skill automatically. Verify with `npm test`.

## Usage

### Prepare materials

In `../albums/<album-name>/` put three files:

```
albums/SAKANAQUARIUM 2024 turn/
├── source.flac          # Full audio (flac / m4a / mkv / mp4 / ts)
├── cover.jpg            # Cover art (jpg or png)
└── timestamps.md        # Handwritten: HH:MM:SS + title per line
```

### Talk to Claude Code

> Process albums/SAKANAQUARIUM\ 2024\ turn

Claude Code runs four steps:

```
1. COLLECT  → Discover artist, album name, source, timestamps, cover.
2. RESEARCH → Web-search official setlist, normalize album + track titles.
3. REVIEW   → Present manifest. You confirm or edit. Set "approved": true.
4. BUILD    → 10-worker parallel split + encode. ALAC output ready.
```

### What you get

```
albums/SAKANAQUARIUM 2024 turn/
├── manifest.json        ← Full track list (raw + normalized)
├── tracks/              ← FLAC archive
└── ALAC/                ← M4A with embedded cover, drag into Apple Music
```

## How it works

Two CLI commands, invoked by Claude Code on your behalf:

| Command | Purpose |
|---------|---------|
| `node tool.js manifest <album-dir> [--artist <name>]` | Parse timestamps, generate draft manifest |
| `node tool.js build --manifest <path> [--no-flac] [--use-refalac]` | Split + encode approved manifest |

**The manifest is the contract.** The AI fills in normalized titles and evidence URLs. You review and set `"approved": true`. The build will not run without it.

### Flags

| Flag | Effect |
|------|--------|
| `--no-flac` | Skip FLAC output, only build ALAC |
| `--use-refalac` | Use Apple reference ALAC encoder instead of ffmpeg native. Required for 96kHz or chapter-heavy sources that trigger ffmpeg compatibility issues |

## Project structure

```
├── SKILL.md          ← Skill definition — the AI agent's behavioral contract
├── tool.js           ← CLI entry point
├── src/
│   ├── build-album.js    ← 10-worker parallel build (ffmpeg + refalac)
│   ├── discover-album.js ← Auto-discover album directory structure
│   ├── ffmpeg.js         ← ffmpeg/refalac command builder
│   ├── manifest.js       ← Manifest read/write
│   ├── normalize.js      ← Title cleaning (strip translations, detect MC)
│   ├── parse-timestamps.js ← Timestamp markdown parser
│   └── verify.js         ← Output verification
├── tests/            ← Node native test runner (43 tests)
├── CLAUDE.md
└── AGENTS.md
```

## Limits

- Source files must be user-provided. The tool never downloads.
- AAC source → ALAC is transparent repackaging, not quality improvement.
- Output goes to new directories. Original files untouched.
- Video sources (.mkv, .mp4) supported — audio stream extracted via `-map 0:a`.
- Requires `timestamps.md`. No timestamps = nothing to split.

## License

[ISC](LICENSE)
