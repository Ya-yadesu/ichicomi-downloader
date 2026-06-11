# Projects Folder 🗂️

本文件夹用于管理与漫画下载和还原相关的脚本和项目。

随着技术方案的演进，我们目前主要采用**油猴脚本（Tampermonkey Userscript）**作为一体化解决方案，它完全替代了早期的控制台命令行方案。

---

## 🌟 核心推荐方案

### ⚡ [一迅社图片下载油猴脚本](一迅社图片下载油猴脚本.user.js) (Tampermonkey Userscript)

[![Install Userscript](https://img.shields.io/badge/install-Userscript-green.svg?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/Ya-yadesu/ichicomi-downloader/main/%E4%B8%80%E8%BF%85%E7%A4%BE%E5%9B%BE%E7%89%87%E4%B8%8B%E8%BD%BD%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC.user.js)

*   **直装链接**：👉 [点击此处直接安装脚本](https://raw.githubusercontent.com/Ya-yadesu/ichicomi-downloader/main/%E4%B8%80%E8%BF%85%E7%A4%BE%E5%9B%BE%E7%89%87%E4%B8%8B%E8%BD%BD%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC.user.js) 👈 *(请确保浏览器已安装 Tampermonkey 或 Violentmonkey 插件)*
*   **路径**：[一迅社图片下载油猴脚本.user.js](一迅社图片下载油猴脚本.user.js)
*   **功能**：直接在浏览器中运行，提供“一键下载整话”的悬浮按钮。
*   **优势**：
    1.  **无视网络与反爬限制**：直接复用浏览器已登录的会话，无需配置 User-Agent 和 Cookie。
    2.  **支持 Blob 资源**：在内存中截获并解析图片数据，解决传统网络下载器无法抓取 `blob:` 临时协议图片的问题。
    3.  **即时解密复原**：利用 Canvas 在浏览器端执行 4x4 的 GigaViewer 图像切片转置算法，直接下载即是完整的高清原图。

---

## 📦 早期归档方案 (Obsolete Java & CLI Tools)

以下为早期用于解决下载和复原的控制台工具，目前已被油猴脚本完全替代，保留于 `archive` 目录用于技术参考：

### 1. 📥 [Take_picture](archive/Take_picture/) (Java & Node.js 下载器)
*   **App.java**：一个无依赖的 Java 多线程下载器，用于抓取普通 HTML 页面中的图片链接。
*   **scripts/extract-images-from-har.js**：在网站采用前端 JavaScript 异步加载图片时，通过解析浏览器导出的 `.har` 网络包来提取图片链接。

### 2. 🧩 [manga](archive/manga/) (Java 拼图复原工具)
*   **ReorderTiledImage.java**：本地图像拼图复原工具。在早期方案中，由于下载的图片是混淆后的 4x4 切片图，需要通过该 Java 程序在本地对图片进行重新切割和拼接（采用矩阵重排）。

### 3. 📂 [reference](archive/reference/) (网页分析与调试参考)
*   **extract_page_urls.js**：早期尝试从网页中解析提取图片 URL 的参考脚本。
*   **download_all_pages.js**：测试在浏览器端异步请求和下载所有图片的实验代码。
*   **linux_deployment_guide.md**：包含 Linux 部署与环境调试的详细指南，保留作为未来开发时的环境参考。
