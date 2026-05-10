---
name: album-extractor
description: Use when the user has a concert/live audio or video file with fuzzy timestamps and wants to split it into a clean, normalized album with cover art — for Apple Music (ALAC) or personal archive (FLAC). Triggers on requests like "split this concert", "extract tracks from this live", "make an album from this recording", or when the user provides timestamps.md alongside a concert source file.
---

# Album Extractor

Split concert/live recordings into album tracks. AI handles research and normalization; CLI handles deterministic split/encode. The manifest is the contract.

**CRITICAL: The CLI is the contract.** Do NOT read source code before invoking commands. Run `node tool.js <command>` directly.

## When to Use

- Concert/live audio or video + timestamps.md + cover image
- User wants split tracks with metadata, cover art, normalized titles
- User mentions Apple Music, ALAC, FLAC, or "like an official album"

**Not for:** Studio albums, single-track extraction, recordings without timestamps.

## Workflow

```
1. COLLECT  → Discover artist, album name, source, timestamps, cover from directory.
              Run `node tool.js manifest <album-dir>` to generate draft manifest.
2. RESEARCH → Web-search official setlist and album title. Normalize using credibility tiers.
              Edit normalizedTitle, evidenceUrl, albumTitle, year in manifest.
3. REVIEW   → Present manifest to user. Confirm or edit. Set "approved": true.
4. BUILD    → `node tool.js build --manifest <path> --no-flac`
              Add `--use-refalac` for 96kHz or chapter-heavy sources.
              After build: offer to move ALAC to Apple Music auto-import.
```

## Credibility Tiers

| Tier | Source | Action |
|------|--------|--------|
| **A** | Artist/label official site, Blu-ray/CD product page | Use directly as evidenceUrl |
| **B** | Spotify, Apple Music, ORICON, Natalie.mu | Use, note "source confidence: high" |
| **C** | Wikipedia (with citations), setlist.fm (multiple confirmers) | Mark "needs verification" |
| **D** | Forums, comments, search snippets | NEVER use for normalization |

Search in the artist's native language. Official title is "hana"? Keep "hana" — don't translate to 花 or Flower.

## Core Principles

1. **Do not add information.** Every `normalizedTitle` and `albumTitle` must link to an evidence URL.
2. **Every correction gets a note.** When normalized ≠ raw, explain why.
3. **When uncertain, preserve the raw value.** Flag "needs review" — never guess.
4. **Preserve the intro.** If Track 1 ≠ 00:00, prepend an Intro track in the manifest.

## Pre-Flight

1. **ASCII-safe file paths.** Rename files with curly quotes, fullwidth chars, or special Unicode.
2. **ffmpeg reachable.** `FFMPEG_HOME` env var, or ffmpeg.exe in `~/Downloads/`.
3. **refalac (for `--use-refalac`).** `qaac` in `~/Downloads/qaac/`, auto-discovers `refalac64.exe`.

## CLI Reference

### manifest — generate draft track list

```bash
# Directory mode (auto-discovers source, cover, timestamps)
node tool.js manifest <album-dir> [--artist <name>]

# Explicit mode
node tool.js manifest \
  --artist <name> --album <title> \
  --source <audio> --timestamps <timestamps.md> --cover <cover> \
  [--output <dir>]
```

Applies local title cleaning (strips translations, marks MC/talk). The AI agent must then research and edit the manifest.

### build — split and encode

```bash
node tool.js build --manifest <manifest.json> [--no-flac] [--use-refalac]
```

Requires `"approved": true`. Overwrites output. Produces `ALAC/*.m4a` (always) and `tracks/*.flac` (unless `--no-flac`).

## Manifest Fields

### Album-level

| Field | Description |
|-------|-------------|
| `approved` | Set to `true` after human review |
| `albumTitle` | Official title from research |
| `albumEvidenceUrl` | Source URL for album title |
| `artist` | Normalized artist name |
| `year` | Concert year |
| `notes` | Research summary, normalization decisions |

### Per-track

| Field | Description |
|-------|-------------|
| `rawTitle` | Original text from timestamps — **never modify** |
| `normalizedTitle` | Official title, verifiable from evidenceUrl |
| `evidenceUrl` | Source URL for normalized title |
| `start` | Start timestamp (HH:MM:SS) |
| `end` | End timestamp (HH:MM:SS, null = until next track) |
| `lyricLookupTitle` | Search query hint (can be null) |
| `notes` | Correction explanations |

## Limits

- Source files and timestamps must be user-provided. The tool never downloads.
- No lossy-to-lossless upscaling. AAC source → ALAC container is transparent repackaging, not quality improvement.
- Output always goes to new directories. Original files untouched.
- Video sources (.mkv, .mp4) supported via `-map 0:a`. Warn if audio track is lossy.
