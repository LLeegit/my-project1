# Zotero Search Highlighter 搜索高亮

EndNote 风格的搜索关键词显示插件，目标为 Windows 上的 **Zotero 10.0.x**。插件读取原生快速搜索框，在标题、作者、右侧信息与摘要中标记匹配文字。高亮不会修改文献数据，也不会改变 Zotero 的检索结果。

## 安装和使用

1. [下载 0.1.2 安装包](dist/zotero-search-highlighter-0.1.2.xpi?raw=1)。旧版 0.1.0 和 0.1.1 有安装问题，请使用 0.1.2。
2. Zotero → 工具 → 插件，点击齿轮 → 从文件安装插件，选择该 XPI。
3. 在原生搜索框输入 `organoid segmentation`，两个词按不同颜色显示；清空搜索框即清除高亮。
4. 双引号短语如 `"cell segmentation"` 作为一个匹配项。不区分大小写，默认匹配子串。
5. 工具 → 搜索高亮 / Search Highlighter 可切换启用状态、完整词匹配和两套配色。
6. 右击文献列表表头，在列选择器中勾选「摘要（搜索高亮）」可显示可选摘要列。

信息栏在未编辑时显示高亮；点击或通过 Tab 进入字段后恢复原生输入显示，退出编辑后重新高亮。高亮层不接收鼠标事件，原有文本选择、复制和编辑由原生控件完成。

## 范围和限制

- 只读取当前主窗口的快速搜索文本，不解析高级检索或保存的检索条件。忽略单独出现的 AND/OR/NOT 与 `-word`，其他字段限定语法按普通文字处理；这不是 Zotero 查询解释器。
- 每次最多 32 个关键词，输入最多处理 4096 个字符；6 色循环，按查询顺序分色，同一起点的重叠匹配优先较长短语。
- 完整词以 Unicode 字母、数字和下划线划界；中文连续文本建议保留默认子串模式。
- 列表渲染适配依赖 Zotero 的内部 `_renderCell` 方法；右侧适配依赖 `editable-text` 的普通输入结构。Zotero 后续界面变动可能需要更新。
- 不高亮 PDF 正文、笔记编辑器和 RSS 内嵌网页。富文本被标签分隔时，跨标签的短语不会作为整体匹配。
- 已在 Docker 中使用官方 Linux Zotero 10.0.6 验证真实安装、启用、标题与作者高亮、信息栏高亮与清空、禁用清理；Windows 的字体缩放、RTL、长摘要换行和与其他插件共存仍需实机检查。

## 沙箱构建

安装并启动 Docker Desktop 后，在本项目目录执行（Windows PowerShell）：

```powershell
docker build -f Dockerfile.build -t zsh-build .
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/workspace" zsh-build sh scripts/verify.sh
```

依赖安装与构建在 Docker 内执行，输出位于本项目 `dist/`。Node 版本为 24，开发依赖由 `package-lock.json` 固定。该镜像用于编译和 14 项自动化测试；真实 Zotero 运行测试还需在容器中准备官方 10.0.6 程序及 GTK/Xvfb 库，入口见 `tests/runtime/run.py`。

XPI 仅含 manifest、bootstrap 和打包后的脚本，没有运行时第三方依赖。SHA256 见 [校验文件](dist/SHA256SUMS.txt)。当前采用手动 XPI 更新，清单的 HTTPS 地址使用保留的 `.invalid` 域名占位，没有上线自动更新服务器。

## Windows 验收建议

在独立测试配置中检查：单词、多词、短语、中文；滚动后的新行；切换条目；清空查询；输入、保存、复制元数据；切换配色与禁用开关；关闭再打开主窗口；禁用或卸载后的高亮和摘要列清理。不要把 DOM 模拟测试当作实机通过记录。

## 实现依据

- [Zotero 10 开发变更](https://www.zotero.org/support/dev/zotero_10_for_developers)
- [插件启动与窗口生命周期](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [原生文献列表](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/itemTree.jsx)
- [官方自定义列接口](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/pluginAPI/itemTreeManager.js)
- [原生信息输入控件](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/elements/editableText.js)

插件运行时代码独立实现；测试夹具包含一小段本机 Zotero 加载器的必填字段检查。

## 0.1.2 安装修复

依据本机 Zotero 10.0.6（BuildID 20261007153950）的完整安装链路，清单既需要 `applications.zotero.update_url`，又需要该地址采用 HTTPS。0.1.1 使用的内嵌 `data:` URL 未通过后一项检查。0.1.2 已修正，保持 Zotero 默认的更新安全检查开启。

启动阶段使用 Zotero 提供的 `Services` 全局对象，移除本机不存在的 `Services.sys.mjs` 导入；子脚本通过 `loadSubScriptWithOptions` 加载并显式允许插件自身的 `jar:file:` 地址。

测试夹具保留本机加载器的必填字段检查片段，用于复现旧包拒绝原因与验证修复。该夹具是 Zotero 的小段测试依据，不属于插件运行时代码。
