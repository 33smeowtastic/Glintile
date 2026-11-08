# 架构

## 数据流

本地文件 → 浏览器Image/blob解码 → 取景与采样 → 候选project → 显式采用 → 编辑project → JSON/PNG导出。

core.cjs只处理有界原生project：宽高8–160、最多64色、格点索引及可控settings。没有DOM、网络或存储。editor.js持有界面、撤销历史、参考图与浏览视图。

examples.json集中原生作品、PNG参考和缩略图。构建时作为不可执行JSON脚本注入页面，避免初始化异步竞争；作品路径的许可独立于程序。

## 构建边界

web：外置内容哈希CSS/JS、manifest、192/512图标、maskable图标、apple-touch-icon、PWA管理界面、sw.js、隐私及许可页。
standalone：CSS/JS/作品内联，无运行时请求、manifest、Service Worker或安装界面。

## 保存

新键是glintile:project:加部署路径，避免同origin不同子路径应用碰撞。启动时兼容读取旧bead-playground-v1键，不删除旧键。暂存只含project，不含参考原图、视图或历史。发现待恢复cache时不自动覆盖；用户可导出上次JSON、恢复，或明确确认以当前作品替换。

修改后500ms去抖暂存；pagehide、visibilitychange(hidden)、beforeunload补充刷新。浏览器强杀、存储被清理、写入失败仍可能丢失，因此JSON是用户掌握的备份。

## 离线及升级

缓存名包含部署scope和静态资源内容版本；install通过cache.addAll及reload请求、逐文件SHA-256完整性校验准备完整资源，部署过程中混合版本会安装失败并保留可用旧版。激活版本入口与其哈希脚本一致。新worker等待，界面提示先保存JSON，只有用户确认后才激活并刷新，不后台刷新画布。激活只清理本scope的旧glintile缓存，不清理localStorage或其他应用缓存。

不做上传、遥测或用户文件运行缓存。首次安装/更新请求静态文件；托管方可能有访问日志。

## 站群页脚

仅web构建使用pwa/site-footer.html与site-footer.js。沿用www.brothforge.com的版权、AI说明、服务与隐私、联系四项文字入口及目标；AI不是链接。竖屏缩写并可聚焦查看完整标签。为避免压住编辑按钮，法律页脚独占底部44px，工具底栏向上让位，文档内容预留相应空间。离开前若当前作品尚未导出JSON则提示确认。standalone仅纯Copyright，无站外页脚。
