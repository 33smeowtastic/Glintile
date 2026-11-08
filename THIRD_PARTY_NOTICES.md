# 第三方依赖与许可

## 浏览器运行代码

运行时使用原生 JavaScript、Canvas 2D、DOM、Web Storage 和 Service Worker，没有打包第三方 JavaScript 库、远程字体、CDN 或统计SDK。字体由系统提供，不随仓库分发。图标由 scripts/icon.mjs 的几何圆点规则生成，没有使用图标库。

## 开发工具（不随网页分发）

- Playwright 1.58.2：Apache-2.0，用于浏览器回归。
- Prettier 3.6.2：MIT，用于源码格式化。
- Playwright Core 1.58.2：Apache-2.0，Playwright的传递依赖。
- fsevents 2.3.2：MIT，锁文件中的macOS可选开发依赖。

依赖的完整许可和传递依赖记录以安装后的各包 LICENSE / package.json 及 package-lock.json 为准。构建与单元测试仅需 Node.js 内置库；安装这些工具不是运行应用的条件。

## 作品

黑猫和骨头示例的许可独立于程序代码：仅供本项目演示，不允许商用。具体条款见 [artworks/LICENSE.md](artworks/LICENSE.md)。
