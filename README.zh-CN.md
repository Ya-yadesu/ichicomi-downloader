# ichicomi-downloader 🗂️

[English](README.md) | 简体中文

本文件夹用于管理与一迅社漫画下载和还原相关的脚本和项目。

随着技术方案的演进，我们目前主要采用**油猴脚本（Tampermonkey Userscript）**作为一体化解决方案，它完全替代了早期的控制台命令行方案。

---

## 🌟 核心推荐方案

### ⚡ [一迅社图片下载油猴脚本](一迅社图片下载油猴脚本.user.js) (Tampermonkey Userscript)

[![Install Userscript](https://img.shields.io/badge/install-Userscript-green.svg?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/Ya-yadesu/ichicomi-downloader/main/%E4%B8%80%E8%BF%85%E7%A4%BE%E5%9B%BE%E7%89%87%E4%B8%8B%E8%BD%BD%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC.user.js)

*   **直装链接**：👉 [点击此处直接安装脚本](https://raw.githubusercontent.com/Ya-yadesu/ichicomi-downloader/main/%E4%B8%80%E8%BF%85%E7%A4%BE%E5%9B%BE%E7%89%87%E4%B8%8B%E8%BD%BD%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC.user.js) 👈 *(请确保浏览器已安装 Tampermonkey 或 Violentmonkey 插件)*
*   **路径**：[一迅社图片下载油猴脚本.user.js](一迅社图片下载油猴脚本.user.js)
*   **功能**：直接在浏览器中运行，提供“一键下载整话”的悬浮按钮。支持自动打包成 ZIP 文件下载，或切换为单张依次下载。
*   **优势**：
    1.  **无视网络与反爬限制**：直接复用浏览器已登录的会话，无需配置 User-Agent 和 Cookie。
    2.  **支持 Blob 资源**：在内存中截获并解析图片数据，解决传统网络下载器无法抓取 `blob:` 临时协议图片的问题。
    3.  **即时解密复原**：利用 Canvas 在浏览器端执行 4x4 的 GigaViewer 图像切片转置算法，直接下载即是完整的高清原图。
    4.  **自动打包 ZIP 与命名**：集成 JSZip 库，在整话下载完成后自动将所有复原的漫画页面打包为以章节标题命名的 `.zip` 文件；支持前排 `CONFIG.zipEnabled` 开关自由开启/关闭此打包功能。
    5.  **RSS 自动检查更新**：新增”RSS轮询”和”自动检查”悬浮开关。开启 RSS 轮询后，脚本会定时拉取系列 RSS Feed（仅几 KB），发现新话后结合自动检查开关决定是否自动下载。相比旧版页面刷新方案，更轻量、更安全，可放心设置高频轮询。
    6.  **智能时间窗口**：仅自动下载在配置时间窗口内（默认 24 小时）发布的新话，避免误开开关时意外下载旧章节。

### 悬浮按钮说明

页面左下角会显示三个按钮（从下到上）：

| 按钮 | 左键点击 | 右键点击 |
|------|----------|----------|
| **一键下载整话** | 下载当前章节 | — |
| **自动检查** | 开关自动下载 | 切换时间窗口：1时 → 6时 → 12时 → 24时 → 48时 → 7天 |
| **RSS轮询** | 开关 RSS 轮询 | 切换轮询间隔：1分 → 5分 → 10分 → 30分 → 60分 |

按钮文字直接显示当前设定值（如 `RSS：1分`、`自动：24时`），一目了然。

- RSS 轮询每次仅请求几 KB 的 XML，高频轮询无压力。
- 自动下载仅处理在时间窗口内发布的新话。
- 按钮文字直接显示当前值，右键即可切换，无需编辑脚本。
- 所有设置通过 `localStorage` 持久化，刷新页面后保持。

---

## 📦 早期归档方案 (Obsolete Java & CLI Tools)

以下为早期用于解决下载和复原的控制台工具，目前已被油猴脚本完全替代，保留于 `archive` 目录用于技术参考：

### 1. 📥 [Take_picture](archive/Take_picture/) (Java & Node.js 下载器)
*   **App.java**：一个无依赖 of Java 多线程下载器，用于抓取普通 HTML 页面中的图片链接。
*   **scripts/extract-images-from-har.js**：在网站采用前端 JavaScript 异步加载图片时，通过解析浏览器导出的 `.har` 网络包来提取图片链接。

### 2. 🧩 [manga](archive/manga/) (Java 拼图复原工具)
*   **ReorderTiledImage.java**：本地图像拼图复原工具。在早期方案中，由于下载的图片是混淆后的 4x4 切片图，需要通过该 Java 程序在本地对图片进行重新切割和拼接（采用矩阵重排）。

### 3. 📂 [reference](archive/reference/) (网页分析与调试参考)
*   **extract_page_urls.js**：早期尝试从网页中解析提取图片 URL 的参考脚本。
*   **download_all_pages.js**：测试在浏览器端异步请求和下载所有图片的实验代码。
*   **linux_deployment_guide.md**：包含 Linux 部署与环境调试的详细指南，保留作为未来开发时的环境参考。
