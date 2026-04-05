# PyRunner 🐍

一个纯前端的 Python 运行平台（PWA），打开网页即可运行 Python、绘图、查看变量、管理标签页，无需后端服务。

> 当前版本已经从「单文件」重构为「模块化静态架构」：`index.html` 仅保留结构层，样式与行为拆分到独立模块文件。

---

## 最新架构（模块化）

```text
.
├── index.html             # 视图骨架（UI 结构）
├── styles/
│   └── main.css           # 全量样式模块
├── js/
│   ├── app-core.js        # 编辑器 / 运行器 / 输出 / 设置 / 片段等核心逻辑
│   └── pwa.js             # Service Worker 注册 + 安装提示 + 离开页持久化
├── sw.js                  # 离线缓存策略（已纳入新模块资源）
├── manifest.json          # PWA 清单
└── icons/
```

### 模块职责说明

- **结构模块（HTML）**：负责语义结构与组件容器，不再承载大段样式和业务脚本。
- **样式模块（CSS）**：集中管理主题变量、响应式布局、编辑器/输出面板视觉层。
- **运行模块（app-core.js）**：
  - Pyodide 初始化与依赖预加载
  - 代码编辑与语法高亮
  - 运行控制（运行/停止/输入）
  - 输出渲染（文本、图片、图表、DataFrame）
  - 状态持久化（标签页、设置）
  - 代码片段、变量面板、格式化、包管理
- **PWA 模块（pwa.js）**：
  - 页面关闭前强制保存
  - Service Worker 生命周期接入
  - 安装到桌面提示与触发

---

## 功能特性

### 代码编辑
- Python 高亮（PrismJS）
- 多标签页编辑与持久化
- 自动缩进、可选行号、字号调整、自动折行
- 导入 / 导出 `.py`
- 一键格式化（`autopep8`，首次按需安装）

### 运行能力
- 基于 **Pyodide 0.26.1** 的浏览器 Python 运行时
- 支持 `input()` 交互输入
- `Ctrl/Cmd + Enter` 快速运行
- 自动检测 `import` 并尝试安装缺失依赖（`loadPackage` / `micropip`）
- 运行历史回看（最近多次输出快照）
- 变量检查器（运行后查看命名空间）

### 输出可视化
- Matplotlib 图像自动渲染
- Plotly 交互式图表输出
- Pandas DataFrame / Series 表格渲染
- PIL / NumPy 图像对象自动可视化

### PWA 与离线
- 支持安装到桌面（`beforeinstallprompt`）
- Service Worker 离线缓存
- 主题自动跟随系统深浅色

---

## 快速启动

```bash
# Python 静态服务
python -m http.server 8080

# 或 Node 静态服务
npx serve .
```

访问：`http://localhost:8080`

> 注意：Service Worker 仅在 `localhost` 或 HTTPS 下生效。

---

## 缓存策略（sw.js）

- **App Shell（本地资源）**：缓存优先
- **CDN 资源（Pyodide / 字体等）**：网络优先 + 缓存兜底
- **其他 API 请求**：直连网络，不缓存

当前 App Shell 已覆盖模块化资源：
- `./index.html`
- `./styles/main.css`
- `./js/app-core.js`
- `./js/pwa.js`
- `./manifest.json`
- 图标与 favicon

---

## 已知限制

- 首次加载需下载 Pyodide 与相关包，耗时受网络影响
- WebAssembly 环境下对部分 C 扩展包支持有限
- 长时间阻塞代码（如大量同步计算或 `time.sleep`）会影响页面响应

---

## License

MIT
