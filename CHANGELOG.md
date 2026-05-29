# 更新日志

## v1.1.0

### 文件打开与关联

- 支持"用 Plico 打开"：右键 .txt/.md/.json/.py/.js/.ts/.cpp/.rs/.go 等 60+ 种文本文件，选择 Plico 直接打开并编辑
- Windows 右键菜单集成（NSIS 安装器自动注册）
- macOS Finder "打开方式" 支持
- 冷启动打开文件不再闪旧内容，优先加载目标文件

### 拖拽导入

- 修复拖拽文件功能：使用 Tauri 原生拖拽 API，从文件管理器拖入即可读取

### 语法高亮

- 编辑器内语法高亮：CodeMirror 12 种语言扩展（JavaScript、TypeScript、JSON、Python、Java、C/C++、CSS、HTML、Rust、SQL、XML、Go、PHP）
- Markdown 预览代码块高亮：highlight.js 全量导入，覆盖 190+ 语言
- 30+ 语法 token 颜色定义（关键字、字符串、注释、类型名等）

### 性能

- 移除每次按键的全文字符串比较，大文件输入不再卡顿
- 纯文本模式不再套用 Markdown 解析器，避免不必要的增量解析开销
- Markdown 分栏滚动同步重写，修复编辑区与预览区互相拉扯导致回弹

### 显示修复

- 修复 Windows 启动白屏闪烁（延迟显示窗口 + 背景色预填充）
- 修复行号区域滚动条遮挡内容（强制隐藏 gutter 滚动条）
- 导出文件扩展名适配新语言模式（.py/.json/.rs/.go 等）

## v1.0.0

基于 Tauri 2 重新构建为独立桌面应用。

### 编辑器

- 纯文本 / Markdown 双模式，一键切换
- Markdown 模式左右分栏实时预览，可拖拽分割线调整比例
- 代码块语法高亮，支持 Python、C/C++、Java、JavaScript、TypeScript、Go、Rust、SQL 等 20+ 语言
- 行号显示，高亮当前行
- 撤销 / 重做（Ctrl+Z / Ctrl+Y）

### 文稿管理

- 多文稿管理（新建、切换、删除），侧边抽屉一览
- 输入防抖 300ms 自动保存到本地文件
- 文件拖入窗口自动新建文稿并读取内容
- 一键导出 .txt / .md 到系统下载目录并定位文件

### 显示与排版

- 字号（10–32px）与行距（0.8–3.0）弹窗滑块调节，设置自动持久化
- 自动换行开关
- Markdown 模式编辑区与预览区同步滚动

### 系统

- 跟随系统暗色模式
- 跨平台支持 macOS、Windows、Linux
- Markdown 渲染 XSS 防护（DOMPurify）
