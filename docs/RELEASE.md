# 版本与发布

首个正式版本为 **1.0.0**。后续发布采用 major.minor.patch：修复递增 patch，兼容的新功能递增 minor，不兼容的变化递增 major。每个待发布分支的版本必须高于 main，版本和改动记录一起提交。

## 1. 在独立分支修改

例如下一次修复可以使用 release/1.0.1 分支。同步更新 package.json、package-lock.json 和 [更新记录](CHANGELOG.md)。构建会把同一个版本写入网页、单文件版和离线缓存标识。

    git switch -c release/1.0.1
    npm version patch --no-git-tag-version
    npm run check:version

版本检查以 origin/main 为基准，要求本地已有该远程分支。GitHub Actions 也会检查预览分支与 Pull Request 的版本。

## 2. 先看本机预览

    npm run build
    npm test
    npm run test:e2e
    npm run check:release
    npm run serve

先在电脑浏览器检查布局、编辑、保存、取消操作和两项内置示例。只有本机效果确认后，再发布 Cloudflare 预览。

## 3. 再做手机预览

将同一版本上传到 Pages 的非 main 分支。使用返回的独立 pages.dev 预览地址在手机检查横竖屏、参考图缩放平移、分享、离线启动和保存。预览不能覆盖 main 的生产部署。命令见 [部署指南](DEPLOYMENT.md)。

## 4. 验收后发布

手机验收和代码审查通过后，才合并 main，并从合并后的 main 构建生产版本。核对网页显示的版本、离线更新、作品保存及正式域名。不要在预览验收前切换正式域名。

## 构建与许可

- dist/web 用于 HTTPS 静态托管，包含 PWA 安装与离线能力。
- dist/standalone/index.html 是单文件离线编辑器。
- 源码包保留 [MIT 代码许可](../LICENSE)与[素材使用说明](../artworks/LICENSE.md)。黑猫和骨头仅供本项目演示，不允许商用，不适用代码的 MIT 许可。

生成目录、开发依赖和本地测试产物由 .gitignore 排除。发布检查会核对项目地址、托管信息和许可文件；使用自己的部署配置时，请同步更新 release.config.json、隐私说明和站点链接。
