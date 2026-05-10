# Album Extractor — 参考手册

SKILL.md 的操作补充。agent 不需要预先加载此文件，遇到具体问题时按需查阅。

## Credibility Tiers

| Tier | Source | Action |
|------|--------|--------|
| **A** | Artist/label official site, Blu-ray/CD product page | Use directly as evidenceUrl |
| **B** | Spotify, Apple Music, ORICON, Natalie.mu | Use, note "source confidence: high" |
| **C** | Wikipedia (with citations), setlist.fm (multiple confirmers) | Mark "needs verification" |
| **D** | Forums, comments, search snippets | NEVER use for normalization |

Search in the artist's native language. Official title is "hana"? Keep "hana" — don't translate to 花 or Flower.

## Manifest 字段

### Album-level

| Field | Type | Description |
|-------|------|-------------|
| `approved` | boolean | Set to `true` after human review |
| `albumTitle` | string | Official title from research |
| `albumEvidenceUrl` | string | Source URL for album title |
| `artist` | string | Normalized artist name |
| `year` | number | Concert year |
| `notes` | string[] | Research summary, normalization decisions |

### Per-track

| Field | Type | Description |
|-------|------|-------------|
| `rawTitle` | string | Original text from timestamps — **never modify** |
| `normalizedTitle` | string | Official title, verifiable from evidenceUrl |
| `normalizationStatus` | string | `raw` \| `cleaned` \| `verified` \| `needs_review` \| `not_applicable` |
| `trackKind` | string | `song` \| `mc` \| `intro` |
| `evidenceUrl` | string\|null | Source URL for normalized title |
| `start` | string | Start timestamp (HH:MM:SS) |
| `end` | string\|null | End timestamp (null = until next track) |
| `lyricLookupTitle` | string\|null | Search query hint (default null — lyrics off) |
| `notes` | string[] | Correction explanations |

### normalizationStatus 说明

| Status | Meaning | Agent action needed |
|--------|---------|-------------------|
| `raw` | Raw title untouched | Research official title |
| `cleaned` | Local cleaning applied (stripped translations etc.) | Verify against official source |
| `verified` | Official title confirmed via evidenceUrl | None |
| `needs_review` | Uncertain — needs human confirmation | Flag for user attention |
| `not_applicable` | Structural tracks (intro, MC) — no evidence needed | None |

### trackKind 说明

| Kind | Meaning |
|------|---------|
| `song` | Normal music track |
| `mc` | MC / talk / interlude segment |
| `intro` | Introductory track (track 1 ≠ 00:00) |

## Pre-Flight

1. **ASCII-safe file paths.** Rename files with curly quotes, fullwidth chars, or special Unicode.
2. **ffmpeg reachable.** `FFMPEG_HOME` env var, or ffmpeg.exe in `~/Downloads/`.
3. **refalac (for `--use-refalac`).** `qaac` in `~/Downloads/qaac/`, auto-discovers `refalac64.exe`.

## Apple Music Auto-Import

Build 完成后，agent 提示用户：
```
ALAC files ready at: <album-dir>/ALAC/
Drag this folder into Apple Music to auto-import with cover art and metadata.
```

## Error Codes

| Code | Message |
|------|---------|
| `E_MISSING_COVER` | cover.jpg or cover.png not found |
| `E_UNAPPROVED_MANIFEST` | set "approved": true after review |
| `E_MISSING_TIMESTAMPS` | timestamps.md not found |
| `E_MISSING_SOURCE` | audio/video source file not found |
| `E_PARSE_TIMESTAMPS` | failed to parse timestamps.md |
| `E_BUILD_FAILED` | build step failed |
| `E_VERIFY_FAILED` | output verification failed |
| `E_NO_TRACKS` | no tracks found in manifest |
| `E_MISSING_MANIFEST` | manifest.json not found |
| `E_FFMPEG_NOT_FOUND` | ffmpeg binary not found |
| `E_REFALAC_NOT_FOUND` | refalac64.exe not found |

## CLI Reference

### manifest

```bash
# Directory mode (auto-discovers source, cover, timestamps)
node tool.js manifest <album-dir> [--artist <name>]

# Explicit mode
node tool.js manifest \
  --artist <name> --album <title> \
  --source <audio> --timestamps <timestamps.md> --cover <cover> \
  [--output <dir>]
```

### summary

```bash
node tool.js summary --manifest <manifest.json>
```

### build

```bash
node tool.js build --manifest <manifest.json> [--no-flac] [--use-refalac]
```

## 研究阶段最佳实践

1. **先搜索官方 setlist 或产品页**，一次性获取整张曲目表
2. **批量匹配**：将获取到的官方 tracklist 与 manifest 逐首配对
3. **只对无法匹配的曲目逐首搜索**
4. 搜索时使用艺人母语（如日文艺人用日文关键词）
5. 每首 normalizedTitle 必须有 evidenceUrl
