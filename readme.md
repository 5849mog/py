# PyRunner 🐍

一个运行在浏览器里的完整 Python 3.11 环境，无需安装，无需服务器，打开即用。

基于 [Pyodide](https://pyodide.org/) 构建，单文件部署，支持 PWA 安装到桌面。

---

## 特性

**编辑器**
- 实时语法高亮（PrismJS）
- 行号显示，错误行红色高亮定位
- 自动缩进、括号/引号自动配对
- 多标签页，支持同时编辑多个文件
- 标签页内容持久化（刷新不丢失）
- 字体大小、折行、行号等可配置
- 导入 `.py` 文件 / 导出 `.py` 文件
- 代码格式化（autopep8，首次使用自动安装）

**运行环境**
- Python 3.11，完整标准库
- 快捷键 `Ctrl/Cmd + Enter` 运行
- 支持 `input()` —— 弹出原生输入框，无需 `await`
- 运行历史，可在多次输出之间导航
- 变量检查器，运行后自动展示命名空间
- 自动检测 `import` 语句，未预装的包自动通过 micropip 安装

**可视化输出**
- Matplotlib 图表直接渲染在输出区域
- Plotly 交互式图表（可拖拽/缩放）
- Pandas DataFrame / Series 渲染为 HTML 表格
- PIL Image、NumPy 图像数组自动转图片显示
- 支持图片点击放大

**预装库**

| 类别 | 库 |
|------|----|
| 数值计算 | NumPy, SciPy |
| 数据分析 | Pandas, Statsmodels |
| 可视化 | Matplotlib, Seaborn, Plotly, Pillow |
| 机器学习 | Scikit-learn |
| 符号计算 | SymPy |
| 网络分析 | NetworkX |
| 网络请求 | pyodide-http |

中文字体（Noto Sans SC）随环境一起加载，图表中文无乱码。

**其他**
- 深色 / 浅色主题自动跟随系统
- PWA 支持，可安装到桌面离线使用
- 移动端适配，软键盘弹起自动调整布局
- Service Worker 离线缓存

---

## 快速开始

PyRunner 是纯静态单页应用，部署只需要将以下文件放到任意静态托管服务：

```
index.html
manifest.json
sw.js
favicon.png
icons/
  icon-192.png
  icon-512.png
```

本地预览（需要 HTTPS 或 localhost，Service Worker 限制）：

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

然后访问 `http://localhost:8080` 即可。

---

## 单文件模块化架构（v2）

项目仍然保持 **单文件部署**，但内部 JavaScript 已重构为“模块化分层”：

- `AppCore.state`：集中管理共享状态（运行状态、当前 Tab、Pyodide 实例、延迟保存计时器等）
- `AppCore.constants`：集中管理默认配置等常量
- `AppCore.dom`：统一 DOM 访问入口（减少散落的 `getElementById`）
- `AppCore.modules.settings`：负责设置读取与持久化
- `AppCore.modules.persistence`：负责编辑器状态与 Tab 状态持久化 + 防抖保存
- `AppCore.modules.pwa`：负责 Service Worker 注册与 PWA 安装流程

这种方式仍然是一个 `index.html`，但已经具备“按职责拆分”的模块边界，后续扩展时可以继续在 `AppCore.modules.*` 下增量演进，而不是把所有逻辑堆在全局作用域中。

---

## 使用说明

### input() 的正确用法

PyRunner 的 `input()` 是异步实现的。在代码中直接调用即可，会弹出底部输入框：

```python
name = input("你叫什么名字？")
print(f"你好，{name}！")
```

如果需要在 `async` 函数中使用，加上 `await`：

```python
name = await input("你叫什么名字？")
```

### 安装第三方包

运行时直接 import，环境会自动尝试安装：

```python
import requests   # 自动安装
```

也可以在设置面板的包管理器里手动安装。注意：含 C 扩展的包（如 `lxml`、`opencv-python`）无法在 Pyodide 环境中安装。

### 代码格式化

工具栏中的格式化按钮使用 autopep8，首次点击会自动安装（需要网络），之后离线可用。

---

## 技术栈

| 组件 | 说明 |
|------|------|
| [Pyodide 0.26.1](https://pyodide.org/) | WebAssembly Python 运行时 |
| [PrismJS 1.29](https://prismjs.com/) | 语法高亮 |
| [Plotly.js](https://plotly.com/javascript/) | 交互式图表（按需加载） |
| Sora + JetBrains Mono | UI 字体 |

无框架，无构建工具，原生 HTML / CSS / JS。

---

## 已知限制

- 首次加载需要下载 Pyodide 运行时及预装库（约 30–60 秒，视网络而定），之后 Service Worker 缓存加速
- 不支持多线程（`threading` 模块受 WebAssembly 限制）
- 不支持含 C 扩展的 PyPI 包
- `time.sleep()` 会阻塞主线程，长时间 sleep 会导致页面无响应
- 文件系统为内存文件系统，刷新后清空（代码通过 localStorage 持久化，文件不行）

---

## 彩蛋

环境里藏了一些东西。如果你足够好奇，`os.listdir('/')` 是个不错的起点。

---

## License

MIT
