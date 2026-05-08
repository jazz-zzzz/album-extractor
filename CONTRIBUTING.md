# Contributing

欢迎贡献！

## 开发

```bash
git clone https://github.com/jazz-zzzz/album-extractor.git
cd album-extractor
npm install
npm test
```

## 测试

使用 Node.js 原生 test runner：

```bash
npm test              # 运行全部测试
node --test tests/smoke.test.js  # 仅冒烟测试
```

## 提交规范

- 修改 `SKILL.md` 需同步更新 `CLAUDE.md` 和 `AGENTS.md`
- 新功能需要测试覆盖
- CLI 接口变更需在 `SKILL.md` 中更新文档

## PR 流程

1. Fork 仓库
2. 创建 feature 分支
3. 确保 `npm test` 通过
4. 提交 PR，描述改动内容和原因

## 问题反馈

[GitHub Issues](https://github.com/jazz-zzzz/album-extractor/issues)
