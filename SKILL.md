---
name: album-extractor
description: Use when the user has a concert/live audio or video file with fuzzy timestamps and wants to split it into a clean, normalized album with cover art — for Apple Music (ALAC) or personal archive (FLAC). Triggers on requests like "split this concert", "extract tracks from this live", "make an album from this recording", or when the user provides timestamps.md alongside a concert source file.
---

# Album Extractor

## Overview

Split concert/live recordings into clean, properly-named album tracks. The AI agent handles research and normalization; CLI scripts handle deterministic execution. The manifest is the contract between them.

**CRITICAL: The CLI is the contract. Do NOT read source code before invoking commands.** Run `node tool.js <command>` directly. Only read source files if a command fails with an unexpected error or you need to understand a specific behavior not documented here.

## When to Use

- User has a concert audio/video + timestamps (handwritten, possibly noisy)
- User wants split tracks with metadata, cover art, and normalized titles
- User mentions Apple Music, ALAC, FLAC, or "like an official album"
- User provides a directory containing source audio, cover image, and timestamps.md

**Not for:** Studio albums that don't need splitting, single-track extraction, or recordings without any timestamp reference.

## Workflow

```
1. COLLECT  → Extract/ask: artist, album name, source file, timestamps, cover.
              Always ask: "Do you want lyrics embedded?" (see Lyrics Strategy below)
2. RESEARCH → Web-search the official setlist AND album title using credibility tiers.
              Normalize albumTitle (e.g. directory "turn 2024" → official "SAKANAQUARIUM 2024 turn").
              Match raw track titles to official names. Normalize only from A/B/C sources.
3. REVIEW   → Present manifest (with normalized album + track titles). User confirms or edits.
              Set "approved": true when ready.
4. BUILD    → Run `node tool.js build --manifest <path> --no-flac`.
              10-worker pool processes tracks in parallel.
              Only ALAC is built by default (save space). FLAC skipped.
              Always overwrites — re-run produces fresh output.
              After build, ask: "ALAC output is ready. Move to Apple Music auto-import folder?"
              If yes: `mv <ALAC_dir>/*.m4a "$HOME/Music/Apple Music/Media/Automatically Add to Apple Music/"`
```

## Credibility Tiers

| Tier | Source | Action |
|------|--------|--------|
| **A** | Artist/label official site, official Blu-ray/CD product page | Use directly as evidenceUrl |
| **B** | Spotify, Apple Music, ORICON, Natalie.mu | Use, note "source confidence: high" |
| **C** | Wikipedia (with citations), setlist.fm (multiple confirmers) | Use only if A/B unavailable, mark "needs verification" |
| **D** | Forums, comments, search result snippets | NEVER use for normalization. Use only as discovery hints. |

**Search strategy:** Use the artist's native language first (Japanese artists → search in Japanese, `.jp` domains). This does NOT mean translating titles — if the official title is "hana", keep "hana".

## Core Principles

1. **Do not add information.** `normalizedTitle` and `albumTitle` must be verifiable from an evidence URL. No romanizations, translations, or unsourced annotations.
2. **Do not rewrite titles.** Official title is "hana"? Keep "hana". Do not convert to 花 or Flower. Same for album titles.
3. **Album title gets the same normalization.** The directory name or user-provided album name is a hint — the official album title comes from research (Blu-ray product page, official site, etc.).
4. **Every correction gets a note.** When a normalized field differs from the raw input, explain why in `notes`.
5. **Code is deterministic, AI is fuzzy.** Scripts parse, split, and encode. AI searches, matches, and normalizes.
6. **When uncertain, preserve the raw value.** Flag it "needs review" rather than guessing.
7. **Preserve the intro.** If Track 1's start time is not 00:00, automatically prepend an "Intro" track from 00:00 to the first timestamp. The intro is part of the complete album experience — opening ambiance, crowd noise, overture, etc. Do NOT ask the user whether to include it; just do it.

## Pre-Flight Checks (before any command)

1. **File paths must be ASCII-safe.** Rename files with curly quotes `""`, fullwidth chars, or special Unicode before processing. Use `node -e "fs.renameSync(...)"` if needed. ffmpeg and shell will choke on these.
2. **ffmpeg must be reachable.** Set `FFMPEG_HOME` env var pointing to the ffmpeg directory, or place ffmpeg.exe in `~/Downloads/`. The tool auto-resolves from these locations, then falls back to PATH.
3. **Cover must be a real image file** (jpg/png). The ffmpeg command uses a second input stream for cover art attachment.
4. **refalac (if using `--use-refalac`).** Download `qaac` from [github.com/nu774/qaac](https://github.com/nu774/qaac) and extract to `~/Downloads/qaac/`. The tool auto-discovers `refalac64.exe` from there. Only needed for sources that trigger ffmpeg ALAC compatibility issues (96kHz sample rate, embedded chapters in source).

## CLI Reference

### Manifest (generate reviewable track list)

```bash
# Directory mode — auto-discovers source, cover, timestamps in album dir
node tool.js manifest <album-dir> [--artist <name>] [--online]

# Explicit mode — all paths specified
node tool.js manifest \
  --artist <name> --album <title> \
  --source <audio.flac> --timestamps <timestamps.md> --cover <cover.jpg> \
  [--output <dir>] [--online]
```

`--online` enables Genius-assisted title search as a first pass. Without it (default), only local cleaning is applied — the AI agent must do the full research.

### Build (split and encode)

```bash
node tool.js build --manifest <manifest.json> [--no-flac] [--use-refalac]
```

Requires `"approved": true` in manifest. Always overwrites existing output files. Produces `<output>/ALAC/*.m4a`, and `<output>/tracks/*.flac` unless `--no-flac` is set.

`--use-refalac` switches the ALAC encoder from ffmpeg native (`alac`) to Apple's reference implementation (`refalac`). Use this when the source has high sample rate (96kHz) or embedded chapters that cause ffmpeg ALAC output to be rejected by Apple Music. refalac must be installed — download from [github.com/nu774/qaac](https://github.com/nu774/qaac), extract, and the tool auto-discovers `refalac64.exe` under `~/Downloads/qaac/`.

## Output Structure

```
<output-dir>/          ← default: <source-dir>/<source-name>/
  manifest.json
  tracks/
    01_Title.flac
    02_Title.flac
    ...
  ALAC/
    01_Title.m4a       ← with attached_pic disposition for Apple Music
    02_Title.m4a
    ...
```

## Manifest Key Fields

| Field | Description |
|-------|-------------|
| `approved` | Set to `true` by AI after human review |
| `albumTitle` | Official album title from research (not the raw directory name) |
| `albumEvidenceUrl` | Source URL for the official album title |
| `artist` | Normalized artist name |
| `year` | Concert year (AI fills from research) |
| `wantsLyrics` | Whether lyrics should be embedded |
| `notes` | Album-level notes (research summary, normalization decisions) |
| `tracks[].rawTitle` | Original text from timestamps — never modified |
| `tracks[].normalizedTitle` | Official title, verifiable from evidenceUrl |
| `tracks[].evidenceUrl` | Source URL for the normalized title |
| `tracks[].lyricText` | Static lyrics text (null if not requested/unavailable) |
| `tracks[].notes` | Correction explanations, flags like "needs review" |

## Lyrics Strategy

Lyrics are optional and expensive to fetch. No bulk API works reliably across network environments.

**Tiered approach (in order of preference):**

1. **User provides lyrics file.** If the user already has `.lrc` or `.txt` files, parse and embed them directly.
2. **AI WebSearch per song.** Search `"<title> <artist> 歌詞 全文"`. The search summary often returns full lyrics. Slow but accurate. Only for small batches (≤5 songs at a time).
3. **AI knowledge.** For very famous songs, the AI may know the lyrics. MUST be flagged `"source confidence: AI knowledge, needs verification"`.
4. **Skip.** If none of the above works, leave `lyricText: null` and note the reason.

**Never:** make up lyrics, scrape blocked sites repeatedly, or promise lyrics that can't be verified.

## Boundaries

- Does NOT download source files. User provides them.
- Does NOT do lossy transcoding. FLAC ↔ ALAC is lossless container conversion.
- Does NOT work without timestamps. A timestamps.md (or equivalent) is required.
- Does NOT modify original files. All output goes to new directories.
- Lyrics are static text only (no LRC time-sync). User is asked before fetching.
- Video sources (.mkv, .mp4, .mov, .ts, .m2ts) are supported. Audio stream is extracted directly via `-map 0:a`. If the audio track is lossy (AAC/Opus), warn the user that the source quality is inherently limited.
