# Glintile · 点灯匣

一颗一颗，点亮小小喜欢。

点灯匣是一款在浏览器里使用的 LED 点阵编辑器。把喜欢的图片变成一颗颗小灯点，调调颜色、补上细节，再保存成自己的作品。也可以从空白画布开始，慢慢画出一个小图案。

[打开点灯匣](https://glintile.game.brothforge.com/) · [English](#english)

## 可以怎么玩

- **图片转点阵**：选择格数、颜色数量和采样方式，调整亮度与饱和度，放大预览后再采用。
- **一颗颗编辑**：上色、擦除、吸色、缩放与移动，支持撤销和重做。
- **照着画，也能自由画**：参考图可以上下对照、左右对照，或叠在画布下描着画。
- **保存作品**：导出透明背景 PNG，或保存 JSON 留到下次继续编辑。
- **随手打开**：支持手机横竖屏和桌面布局；首次联网完成离线准备后，可以离线使用，也可通过浏览器安装到主屏幕。

内置黑猫和骨头两个示例，可以先从它们开始试试。

## 开始创作

1. 打开点灯匣，选择示例、导入图片，或新建空白画布。
2. 转图时调整格数、颜色、亮度和饱和度，点“看看转图”查看效果。
3. 采用后逐颗修改；需要参照原图时，切换对照或描画模式。
4. 保存 PNG 用于展示，保存 JSON 方便以后接着画。

## 图片与保存

图片在浏览器内处理，不会上传。作品会暂存在当前浏览器中；保存一份 JSON，就能在其他设备或网址继续编辑，也能为作品留个备份。JSON 保存点阵和显示设置，参考原图与撤销历史不包含在内。

应用没有账号、广告或分析统计。网页由 Cloudflare Pages 托管，访问服务会产生普通请求数据，详情见[隐私说明](https://glintile.game.brothforge.com/privacy.html)。

## 本地运行

需要 Node.js 20 或更新版本：

```sh
node scripts/build.mjs
node scripts/serve.mjs
```

打开终端显示的本地地址即可使用。

- `dist/web`：适合静态网站托管的 PWA 版本。
- `dist/standalone/index.html`：可以直接用浏览器打开的单文件离线版。

## 参与项目

欢迎通过 [Issues](https://github.com/33smeowtastic/Glintile/issues) 分享问题、使用感受和新想法，也欢迎提交 Pull Request。开发准备和测试命令见[贡献指南](CONTRIBUTING.md)。

想了解实现方式，可以阅读[项目架构](docs/ARCHITECTURE.md)、[测试指南](docs/TESTING.md)和[部署指南](docs/DEPLOYMENT.md)。

## 许可

程序代码采用 [MIT 许可](LICENSE)。

内置的黑猫与骨头素材**仅供本项目演示使用，不允许商用**，不适用代码的 MIT 许可。素材改编、单独再分发及其他用途的许可说明见 [artworks/LICENSE.md](artworks/LICENSE.md)。开发工具许可见[第三方声明](THIRD_PARTY_NOTICES.md)。

Copyright © 2026 骨汤造物所。

---

## English

Light up the little things, one dot at a time.

Glintile is a browser-based LED dot-art editor. Turn a favorite image into dots of light, adjust the colors, and refine it one dot at a time. You can also start with a blank canvas and draw something of your own.

[Open Glintile](https://glintile.game.brothforge.com/)

### What you can do

- **Convert images**: choose grid dimensions, palette size and sampling mode, adjust brightness and saturation, then inspect an enlarged preview.
- **Edit individual dots**: paint, erase, pick colors, zoom and pan, with undo and redo.
- **Draw with a reference**: compare images side by side or vertically, or trace over a reference beneath the canvas.
- **Keep your work**: export a transparent PNG or save editable JSON to continue later.
- **Use it on your phone or desktop**: responsive layouts support portrait and landscape. After the first online visit finishes preparing offline resources, the editor works offline and can be installed through a supported browser.

The bundled black-cat and bone examples are a friendly place to start.

### Make your first piece

1. Open an example, import an image, or start with a blank canvas.
2. Adjust the grid, colors, brightness and saturation, then preview the conversion.
3. Apply it and refine individual dots, using a reference if you like.
4. Export a PNG to show your work, and save JSON to keep editing later.

### Your images and projects

Images are processed in your browser and are not uploaded. Projects are saved locally in the current browser. Export JSON for a backup or to move a project to another device or website. JSON includes the dot artwork and display settings; reference images and undo history are not included.

There are no accounts, ads or analytics. The website is hosted on Cloudflare Pages, which processes ordinary request data to serve the site. See the [privacy notice](https://glintile.game.brothforge.com/privacy.html) for details.

### Run locally

Requires Node.js 20 or later:

```sh
node scripts/build.mjs
node scripts/serve.mjs
```

Open the local address printed in your terminal. `dist/web` contains the static PWA build; `dist/standalone/index.html` is a self-contained offline editor you can open directly in a browser.

### Contribute

Questions, ideas, bug reports and Pull Requests are welcome. Visit [Issues](https://github.com/33smeowtastic/Glintile/issues) or start with the [contributing guide](CONTRIBUTING.md). The [architecture](docs/ARCHITECTURE.md), [testing](docs/TESTING.md) and [deployment](docs/DEPLOYMENT.md) guides describe how the project works.

### License

The program code is available under the [MIT License](LICENSE).

The bundled black-cat and bone artworks are **for demonstration within this project only. Commercial use is not permitted**. They are not covered by the MIT code license. Adaptation, separate redistribution and other uses require additional permission; see the [artwork terms](artworks/LICENSE.md). Development-tool licenses are listed in [third-party notices](THIRD_PARTY_NOTICES.md).

Copyright © 2026 骨汤造物所.
