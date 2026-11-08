# 部署指南

Glintile 可以部署到支持 HTTPS 的静态网站托管服务，无需后端、数据库或运行时密钥。

## 构建

```sh
node scripts/build.mjs
npm test
npm run test:e2e
```

上传 `dist/web`。这个目录包含编辑器、图标、安装清单、Service Worker、隐私说明和许可页。

## Cloudflare Pages

项目的在线入口是 https://glintile.game.brothforge.com/，Pages 项目名为 glintile。先完成 [本机预览](RELEASE.md)，再把待验收分支上传为独立预览，例如：

    npx wrangler pages deploy dist/web --project-name glintile --branch release/1.0.0-preview

使用命令返回的 pages.dev 预览地址进行手机验收。**预览分支不能使用 main**，也不修改正式域名的 DNS。

手机验收与代码审查通过、改动合并 main 后，才从 main 构建并发布生产：

    npx wrangler pages deploy dist/web --project-name glintile --branch main

GitHub Actions 负责版本检查与测试，不自动发布或合并。正式域名继续指向该 Pages 项目的生产入口，无需为每次版本更新更改 DNS。

如需绑定自己的域名，先在 Pages 项目的 Custom domains 中添加域名，再按控制台提示配置 DNS。外部 DNS 服务通常需要将对应子域的 CNAME 指向 Pages 提供的地址。

## 缓存与响应头

- 使用 HTTPS，以支持 Service Worker 和浏览器安装。
- 保留构建输出的文件内容。离线资源按 SHA-256 校验，托管平台的 HTML/JS/CSS 改写会改变校验结果。
- `sw.js`、`index.html` 和安装清单使用 `no-cache`；带内容哈希的静态资源可长期缓存。
- `public/headers.txt` 提供 Cloudflare Pages 响应头配置。其他平台可设置等效响应头。

## 发布后检查

打开线上地址，确认编辑器、安装清单和图标正常。首次完成离线准备后，断网刷新并编辑、导出作品；有新版本时，再检查取消更新和确认更新两条路径。

## 回滚

切换到需要恢复的源码版本，重新构建并部署。用户会通过应用内更新提示切换版本，已有本地作品保留。排查保存问题时，先导出 JSON 备份。
