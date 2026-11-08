# 项目工作约定

- 共享编辑器在src，PWA能力仅放pwa；不把Service Worker或安装逻辑塞进共享核心。
- 保留内置作品原生数据。修改图像或作品前核对用户确认版本，不重新量化原生示例。
- 运行 node scripts/build.mjs、node --test tests/\*.test.mjs；浏览器相关改动还运行 tests/browser.cjs。
- 不直接编辑dist；不引入外网运行依赖、上传、统计或账号功能，除非需求明确改变。
- 不覆盖尚待恢复的旧草稿；新存储改动需测试旧数据恢复和取消操作。
- 代码采用MIT；素材仅供演示、禁止商用，不从MIT推定改编/再分发或标识权利。
- 不提交密钥、用户导入图片、私人路径、内部报告或测试产物。
- 发布前核对release.config.json及docs/DEPLOYMENT.md，不把本地预览写成已上线。
- 项目架构见docs/ARCHITECTURE.md；测试范围见docs/TESTING.md；公开检查见docs/RELEASE.md。

## 版本与发布

- 首个正式版本为 1.0.0。每次发布都更新 package.json、package-lock.json 和变更记录；构建中的版本信息由 package.json 生成。
- 在独立 release 分支修改，先启动本机预览。维护者确认电脑效果后，才部署 Cloudflare Pages 的非 main 分支预览，供手机验收。
- 手机验收和审查通过后才能合并 main、部署生产。不得把开发预览上传为 main，也不得在验收前切换正式域名。
- 提交前核查作者与提交者使用当前 GitHub 账号的 noreply 邮箱。不要提交私人文件、截图、凭据或测试产物；不擅自改写历史。
