# 参与点灯匣 / Contributing

欢迎分享使用感受、报告问题，或一起把点灯匣做得更好。

## 提交问题与想法

在 [Issues](https://github.com/33smeowtastic/Glintile/issues) 中描述你想完成的事情、遇到的现象和预期效果。报告 Bug 时，附上浏览器版本、操作步骤，以及方便复现的示例；截图和示例文件请先移除个人信息。

## 本地开发

需要 Node.js 20+。安装开发工具并运行测试：

```sh
npm ci
node scripts/build.mjs
npm test
npx playwright install chromium
npm run test:e2e
```

也可以设置 `CHROME_PATH`，使用本机已安装的 Chrome。生成文件位于 `dist`，源码修改应放在 `src`、`pwa` 等对应目录。

## 提交改动

发布改动请使用独立分支，并更新版本和变更记录。先验收本机预览，再发布非 main 的 Pages 预览供手机检查，确认后合并 main。详细步骤见 [版本与发布](docs/RELEASE.md)。

Pull Request 请说明解决的问题、主要改动和测试结果。较大的交互或架构调整，可以先开一个 Issue 讨论。

- 编辑器改动重点检查撤销/重做、JSON 导入导出和手机布局。
- PWA 改动重点检查离线启动、更新提示和作品保存。
- 保持图片在本地处理，并尽量延续轻量、无运行依赖的实现。

代码贡献采用 MIT 许可。新增图片或示例作品时，请注明来源和素材许可。

## English

Feedback, bug reports and Pull Requests are welcome. For a bug report, include your browser version, reproduction steps and a small example without personal information.

Use the commands above to install development tools, build the app and run the tests. `CHROME_PATH` can point to an installed Chrome executable. Edit source files rather than generated files in `dist`.

Explain the problem, your changes and the tests you ran in your Pull Request. For larger changes, an Issue is a good place to discuss the approach first. Please preserve local image processing and the lightweight implementation.

Prepare releases on a separate branch and increase the app version. Review the local preview first, then a non-main Pages preview on a phone. Merge into main only after review and acceptance. See the [release guide](docs/RELEASE.md).

Code contributions use the MIT License. New artwork should include its source and a separate statement of its license.
