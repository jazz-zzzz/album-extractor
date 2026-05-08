<p align="center">
  <img src="https://img.shields.io/npm/v/album-extractor" alt="npm">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node">
  <img src="https://img.shields.io/badge/ffmpeg-required-orange" alt="ffmpeg">
  <img src="https://img.shields.io/badge/license-ISC-blue" alt="license">
</p>

# Album Extractor

把演唱会录音变成整洁、规范的 Apple Music 专辑。CLI 切分 + 编码；AI (Claude Code) 研究曲目表、规范化标题、嵌入歌词。

**Split concert recordings into clean, properly-named album tracks — for Apple Music (ALAC) or archival (FLAC).**

## 它解决了什么

你有一场演唱会的完整音频/视频 + 手写的时间戳（曲名可能模糊、格式不统一）。Album Extractor 帮你：

1. 解析时间戳 → 生成可审查的 manifest
2. 在线搜索官方曲目表 → 规范化每一首歌的标题
3. 一键切分 + 编码 → `tracks/*.flac` + `ALAC/*.m4a`（带封面、带歌词）

## 快速开始

```bash
git clone https://github.com/jazz-zzzz/album-extractor.git
cd album-extractor
npm install
```

确保系统已安装 [ffmpeg](https://ffmpeg.org/)。设置 `FFMPEG_HOME` 环境变量或放 `ffmpeg.exe` 到 `~/Downloads/`。

### 准备一张「专辑」

在 `../albums/<专辑名>/` 下放三个文件：

```
albums/My Concert/
├── source.flac          # 完整音频（支持 flac/m4a/mkv/mp4/ts）
├── cover.jpg            # 封面图
└── timestamps.md        # 手写时间戳
```

`timestamps.md` 格式自由，只要每行包含 `HH:MM:SS` 和曲名即可：

```markdown
00:02:34 Ame(B)
00:07:02 陽炎
00:11:49 アイデンティティ
01:56:56 MC
02:19:00 シャンディガフ
```

### 生成 manifest

```bash
node tool.js manifest ../albums/"My Concert" --online
```

`--online` 启用 Genius 辅助搜索。AI agent 会在 manifest 中填入规范化曲名和证据 URL。人工审核后将 `"approved"` 设为 `true`。

### 构建

```bash
node tool.js build --manifest ../albums/"My Concert"/manifest.json
```

10-worker 并行处理，输出：

```
albums/My Concert/
├── tracks/
│   ├── 01_Ame(B).flac
│   ├── 02_陽炎.flac
│   └── ...
└── ALAC/
    ├── 01_Ame(B).m4a    ← attached_pic，Apple Music 即拖即用
    ├── 02_陽炎.m4a
    └── ...
```

## 项目结构

```
├── SKILL.md              # Claude Code skill 定义（AI agent 的契约）
├── tool.js               # CLI：manifest / build
├── src/
│   ├── build-album.js    # 10-worker 并行构建（FLAC + ALAC）
│   ├── discover-album.js # 自动发现专辑目录
│   ├── ffmpeg.js         # ffmpeg 封装
│   ├── manifest.js       # manifest 读写
│   ├── parse-timestamps.js
│   ├── research.js       # Genius 歌词搜索
│   └── verify.js         # 输出校验
├── tests/
```

## 配合 Claude Code 使用

本仓库即是一个 [Claude Code](https://claude.ai/code) skill。安装方式：

```powershell
# 克隆到本地后，创建 junction 链接
cmd /c rmdir "$env:USERPROFILE\.claude\skills\album-extractor"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\album-extractor" -Target ".\album-extractor"
```

之后在任意目录，Claude Code 都能加载此 skill。`git pull` 更新即生效。

## 约束

- 不修改原始文件，所有输出到新目录
- FLAC ↔ ALAC 是无损容器转换，不降质
- 必须提供 timestamps.md，否则无法工作
- 视频源 (.mkv/.mp4/.ts) 支持，但若音频轨为 AAC/Opus 会提示质量受限
- 歌词为静态文本嵌入，不支持 LRC 时间同步

## 许可证

[ISC](LICENSE)
