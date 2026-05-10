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

### 搜索优先级

按顺序尝试，找到完整 setlist 即停止：

| 优先级 | 来源 | 搜索关键词示例 |
|--------|------|--------------|
| 1 | **艺人官网** `artist.jp` | `<艺人名> <场地> <日期> セットリスト` |
| 2 | **setlist.fm** | `site:setlist.fm <artist> <venue>` |
| 3 | **YouTube 官方频道** | `<artist> <live名称> セットリスト` — 视频描述常含完整曲顺 |
| 4 | **日文音乐媒体** | ナタリー、rockin'on、音楽ナタリー、BARKS、Skream! — ライブレポート常附曲顺 |
| 5 | **电商产品页** | Tower Records、Amazon.co.jp、HMV、楽天ブックス — Blu-ray/DVD 商品页有曲目表 |
| 6 | **粉丝博客/Wiki** | Ameba、note、はてなブログ、w.atwiki.jp — ファン参加型のライブレポ |

### 电商产品页搜索技巧

Blu-ray/DVD 商品页是最可靠的 Tier A 来源：
- **Tower Records**: `site:tower.jp <artist> <live名称>`
- **Amazon.co.jp**: `site:amazon.co.jp <artist> Blu-ray セットリスト`
- **HMV**: `site:hmv.co.jp <artist> <live名称>`

商品页通常包含完整曲目表和官方封面图。

### 兜底策略：录音室专辑交叉验证

当 live 官方 setlist 找不到时（未商业发行、仅流媒体直播等），**不要逐首搜索**。转而：

1. 搜艺人录音室专辑曲目表（维基/Discogs/电商产品页）
2. 用专辑曲目表批量交叉验证用户时间戳中的每首歌
3. 匹配到的 → Tier A 证据，`normalizationStatus: verified`
4. 未匹配到的 → 标记 `needs_review`，单独处理

**示例**：武道馆 live 无官方曲顺 → 搜 `strobo` + `replica` 专辑曲目表 → 19/21 首验证通过，效率远高于逐首搜索。

这比逐首搜索省 80%+ 搜索轮次，且证据等级更高（专辑曲目表是 Tier A）。
