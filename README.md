# Plico / 轻笔

即开即写的轻量桌面文本编辑器，支持纯文本和 Markdown 双模式，自动保存、多文稿管理、一键导出。基于 Tauri 2 + React + CodeMirror 6 构建，跨平台支持 macOS、Windows、Linux。

## 功能

### 编辑器核心

- **纯文本 / Markdown 双模式** — 一键切换，Markdown 模式下左右分栏实时预览
- **可拖拽分割线** — Markdown 模式下自由调整编辑区与预览区比例（20%–80%）
- **代码高亮** — Markdown 代码块支持 Python、C/C++、Java、JavaScript、TypeScript、C#、Go、SQL、Rust、Ruby、Swift、Kotlin、PHP、Perl、Lua、Scala、R、Dart、Bash/Shell、JSON、YAML、XML/HTML、CSS 等 20+ 语言语法高亮
- **行号显示** — 自动行号，高亮当前行
- **撤销 / 重做** — 支持 Ctrl+Z / Ctrl+Y

### 文稿管理

- **多文稿管理** — 新建、切换、删除，侧边抽屉一览
- **自动保存** — 输入防抖 300ms 自动保存到本地文件，无需手动操作
- **文件拖入** — 将文本文件直接拖入窗口，自动新建文稿并读取内容，支持 .txt、.md、.json、.yaml、.py、.js、.ts 等常见格式，.md 文件自动切换为 Markdown 模式

### 显示与排版

- **字号与行距调节** — 弹窗滑块自由调整字号（10–32px）和行距（0.8–3.0），设置自动持久化
- **自动换行** — 一键开关自动换行，长文本不再水平滚动
- **同步滚动** — Markdown 模式下编辑区与预览区按比例同步滚动

### 导出

- **一键导出** — 点击按钮或 Ctrl+S，导出 .txt 或 .md 到系统下载目录并自动定位文件

### 系统集成

- **暗色模式** — 跟随系统偏好自动切换
- **本地文件存储** — 文稿保存为独立文件，可用其他工具直接访问
- **轻量体积** — 安装包约 3MB，无 Electron 依赖

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | [Tauri 2](https://v2.tauri.app/)（Rust + 系统 WebView） |
| 前端 | React 19 + TypeScript |
| 编辑器 | [CodeMirror 6](https://codemirror.net/) |
| Markdown 渲染 | [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify)（XSS 防护） |
| 代码高亮 | [highlight.js](https://highlightjs.org/) |
| 构建工具 | Vite 6 + Bun |
| 后端 | Rust（文件 I/O、系统 API） |

## 项目结构

```
src/                     ← React 前端
├── main.tsx             ← 入口
├── App.tsx              ← 根组件
├── Editor/
│   ├── index.tsx        ← 编辑器主组件
│   └── index.css        ← 编辑器样式
└── stores/
    └── notes.ts         ← 文稿数据层（调用 Rust 后端）

src-tauri/               ← Rust 后端
├── Cargo.toml
├── tauri.conf.json      ← Tauri 配置
├── capabilities/
│   └── default.json     ← 权限声明
├── icons/               ← 应用图标
└── src/
    ├── main.rs          ← Rust 入口
    └── lib.rs           ← Tauri Commands（文件读写、导出、设置）
```

## 开发

### 环境要求

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install)（含 cargo）
- macOS: Xcode Command Line Tools
- Windows: Microsoft Visual Studio C++ Build Tools
- Linux: `libwebkit2gtk-4.1-dev` 等依赖（参考 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)）

### 启动开发模式

```bash
bun install
bun run tauri dev
```

启动后自动打开编辑器窗口，前端修改热更新。

### 构建安装包

```bash
bun run tauri build
```

产出位置：

| 平台 | 路径 |
|------|------|
| macOS | `src-tauri/target/release/bundle/dmg/Plico_*_aarch64.dmg` |
| Windows | `src-tauri/target/release/bundle/nsis/Plico_*_x64-setup.exe` |
| Linux | `src-tauri/target/release/bundle/appimage/Plico_*_amd64.AppImage` |

## 数据存储

| 数据 | 位置 |
|------|------|
| 文稿文件 | `{app_data_dir}/notes/{id}.txt` 或 `{id}.md` |
| 编辑器设置 | `{app_data_dir}/settings.json` |

`app_data_dir` 路径：

- macOS: `~/Library/Application Support/com.plico.editor/`
- Windows: `%APPDATA%\com.plico.editor\`
- Linux: `~/.local/share/com.plico.editor/`

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` / `Cmd+S` | 导出文件 |
| `Ctrl+Z` / `Cmd+Z` | 撤销 |
| `Ctrl+Y` / `Cmd+Y` | 重做 |

## 开源协议

Apache License 2.0
