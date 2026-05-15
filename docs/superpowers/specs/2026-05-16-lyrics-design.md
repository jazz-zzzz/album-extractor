# 歌词获取方案 — 设计规格

## 目标

为 Album Extractor 添加歌词获取能力：给定已确认的歌名，从网络获取纯文本歌词，存储到专辑目录，记录来源元数据。

## 范围与约束

- 仅处理 Live/演唱会专辑（与 Album Extractor 定位一致）
- 纯文本歌词，不使用 LRC 同步格式（Live 版每场 tempo/MC 时长不同，无法对轴）
- 独立步骤，在 RESEARCH + REVIEW + BUILD 全部完成之后按需执行
- 不嵌入音频文件元数据（本期不做）

## 数据模型

### manifest.json — track 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `lyricSource` | `string \| null` | 来源标识：`netease` / `genius` / `not_found` |
| `lyricPath` | `string \| null` | 相对路径，指向 `lyrics/` 下的歌词文件 |

### 歌词文件

- 目录：`<专辑>/lyrics/`
- 命名：`{track编号前缀}-{normalizedTitle}.txt`（如 `03-マッチとピーナッツ.txt`）
- 内容：纯文本歌词，UTF-8 编码（从 LRC 去除时间戳得到）

### 专辑级开关

manifest 根级字段 `wantsLyrics: boolean`，用户显式设置为 `true` 后才触发歌词获取。默认 `false`。

## 搜索策略（按优先级）

### 1. 网易云音乐（主来源）

- 搜索 API：`music.163.com/api/search/get?s={artist}+{title}&type=1`
- 歌词 API：`music.163.com/api/song/lyric?os=pc&id={songId}&lv=-1&tv=-1`
- 从搜索结果中匹配最佳 songId（标题包含匹配优先）
- 歌词为 LRC 格式，可同时获取翻译（tlyric）
- 无需代理，国内直连

### 2. Genius（fallback）

- 需要代理访问
- URL 模式：`genius.com/{artist-romanized}-{title-english}-lyrics`
- HTML 抓取 `data-lyrics-container="true"` div

### 3. 未命中

全部失败 → `lyricSource: "not_found"`, `lyricPath: null`

## 探索结果（SAKANAQUARIUM 光 ONLINE 前 5 首）

| # | 曲目 | 网易云 | Genius |
|---|------|--------|--------|
| 02 | グッドバイ | ✅ 33行 | ✅ 18行 |
| 03 | マッチとピーナッツ | ✅ 45行 | ✅ 19行 |
| 04 | 聴きたかったダンスミュージック〜 | ✅ 45行 | ❌ |
| 05 | ユリイカ | ✅ 58行（完整） | ⚠️ 16行（缺前两段） |
| 06 | ネイティブダンサー | ✅ 34行 | ✅ 15行 |

**结论**：网易云命中率 5/5、歌词更完整、无需代理。作为主来源，Genius 备用。

## CLI 接口设计（草案）

```
node tool.js lyrics --manifest <path> [--source netease|genius]
```

流程：
1. 读取 manifest，筛选 `trackKind === 'song'` 且 `lyricPath === null` 的曲目
2. 逐首搜索网易云 → 获取歌词 → 转纯文本 → 写入 `lyrics/` 目录
3. 更新 manifest 中每轨的 `lyricSource` 和 `lyricPath`
4. 输出汇总：成功/未找到/错误

## 固化条件

- [x] 搜索优先级已验证（1 个专辑）
- [ ] 搜索优先级经过 ≥2 个专辑验证
- [ ] 边界情况（not_found、歌词质量低、网络错误）有明确的处理规则
- [ ] CLI `lyrics` 命令实现并通过测试
