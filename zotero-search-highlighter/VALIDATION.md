# 构建验证记录

日期：2026-10-22（Asia/Shanghai）

环境：Docker Desktop Linux 容器，项目专用 `web` 配置。依赖安装、TypeScript 检查、自动化测试、打包均在该沙箱执行；未安装到宿主机 Zotero，未连接或修改用户文献库。

## 已通过

- `npm run check`：TypeScript 无错误。
- 0.1.0 的 `npm test`：12 项通过，但未覆盖本机加载器强制要求的更新地址字段。该遗漏已由用户安装反馈发现，0.1.0 不应继续安装。
- 查询：多词、短语、中文、去重、操作符过滤、正则特殊字符、大小写与 Unicode 索引、完整词、数量上限。
- DOM：文本安全、保留原生图标及富文本结构、虚拟行重新渲染、原生方法恢复、视图替换、后续插件包装保护。
- 信息栏：保留输入节点和值、焦点进入后移除显示层、编辑后刷新、清空检索、条目切换、移除节点、观察器不发生自激循环。
- 启动集成：在模拟宿主中执行真实 bootstrap 和打包脚本，验证窗口挂接、摘要列渲染、全窗口开关同步、窗口关闭、禁用清理和再次启用。
- XPI 使用固定文件白名单打包，构建脚本检查 ZIP 完整性和兼容版本字段，并生成 SHA256。

## 尚未验证

Windows Zotero 10 的原生布局与安装、不同缩放与字体下的高亮对齐、长摘要和 RTL 显示、与用户现有插件共存。下面的真实运行结果来自 Linux Zotero 10.0.6，不能替代 Windows 的显示验收。

源码中 `_renderCell` 为内部适配点；Zotero 若改变该方法，插件需要更新。信息栏仅显示高亮层，不调用任何文献写入 API。

## 0.1.1 修复验证

只读检查本机 `C:/Program Files/Zotero/app/application.ini`：Zotero 10.0.6，BuildID 20261007153950，Firefox 140。

本机 `omni.ja!modules/Extension.sys.mjs` 在解析清单时强制检查 `applications.zotero.id`、`update_url`、`strict_max_version`。旧版缺少 `update_url`，确实触发 `applications.zotero.update_url not provided`。版本范围 `10.0`—`10.0.*` 保持不变。

同时确认本机包中没有 `modules/Services.sys.mjs`：启动改为使用宿主已有 `Services`，并显式设置子脚本加载选项，避免安装成功后才暴露启动错误。

新增真实加载器字段检查回归用例，连同其余 12 项测试在 Docker 中运行：13 项通过，0 失败；TypeScript 检查通过。仍不把这些测试表述为已完成真实 Zotero 安装。

## 0.1.2 真实安装验证

0.1.1 的 `data:` 更新地址还被后续安全检查拒绝：本机 `omni.ja!modules/addons/XPIDatabase.sys.mjs` 的 `providesUpdatesSecurely` 只接受空更新地址或 `https:`；`AddonManager.checkUpdateSecurity` 默认开启。0.1.2 使用 HTTPS 占位地址，没有关闭安全检查；此手动分发版本没有自动更新服务器。

在 Docker 内下载官方 Linux Zotero 10.0.6，使用全新 `/tmp/zsh-runtime-*` 配置和数据目录，以真实 AddonManager 分别读取旧包和新包：

- 0.1.1：`isCompatible=true`，`providesUpdatesSecurely=false`，`appDisabled=true`，复现拒绝原因。
- 0.1.2：`isCompatible=true`，`providesUpdatesSecurely=true`，`appDisabled=false`，成功安装并 `isActive=true`。
- 搜索高亮菜单与样式实际加载；禁用插件后菜单移除。
- 在隔离测试库创建合成条目，原生标题与作者单元格均匹配到 `Cell`；信息栏生成 4 处匹配，清空快速搜索后高亮层消失。
- `checkUpdateSecurity=true`，保留原生安全检查。
- `npm test`：14 项通过，0 失败；`npm run check` 通过。

安装测试结果已保存在 [INSTALL-TEST-0.1.2.json](dist/INSTALL-TEST-0.1.2.json)。原始控制台日志留在本地 `test-results/runtime-console.log`，不随仓库发布。测试入口：`tests/runtime/run.py` 与 `tests/runtime/install.cfg`。Autoconfig 仅写入 Docker 内下载的程序副本，不应用于用户的 Zotero 安装或主配置。
