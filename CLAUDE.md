# CLAUDE.md

## 项目定位

本仓库是 `album-extractor` Claude Code skill 的规范源。代码通过 Windows junction 链接到 `~/.claude/skills/album-extractor/`，git 更新即 skill 自动同步。

## 目录结构

```
album-extractor/           ← git 仓库根（即本目录）
├── SKILL.md               ← skill 定义，AI agent 的行为契约
├── tool.js                ← CLI 入口（manifest / build 两个命令）
├── src/                   ← 核心模块
│   ├── build-album.js     # 并行构建（10-worker pool，FLAC + ALAC）
│   ├── discover-album.js  # 自动发现专辑目录结构
│   ├── ffmpeg.js          # ffmpeg 调用封装
│   ├── manifest.js        # manifest 读写
│   ├── parse-timestamps.js# 时间戳 markdown 解析
│   ├── research.js        # Genius 歌词搜索
│   └── verify.js          # 输出验证
├── tests/                 ← Node 原生 test runner
```

本仓库 **不包含** `albums/`。albums 是用户数据，位于仓库外部的同级目录 `../albums/`。

## Junction 架构

```
~/.claude/skills/album-extractor/  → (junction)  →  <repo>/album-extractor/
```

删除旧 junction 并重建：
```powershell
cmd /c rmdir "$env:USERPROFILE\.claude\skills\album-extractor"
New-Item -Path "$env:USERPROFILE\.claude\skills\album-extractor" -ItemType Junction -Target "<repo>\album-extractor"
```

## 关键约定

- CLI 是确定性契约。AI agent 通过 `node tool.js <command>` 执行操作，不直接读取源码
- 音频源文件 (.flac/.m4a/.mkv) 由 .gitignore 排除，不纳入版本控制
- 输出目录 (tracks/, ALAC/) 由 .gitignore 排除
- 测试：`npm test` 或 `node --test tests/`
- ffmpeg 路径通过 `FFMPEG_HOME` 环境变量配置，或放在 `~/Downloads/ffmpeg.exe`

## 语言偏好

所有交互使用简体中文。
