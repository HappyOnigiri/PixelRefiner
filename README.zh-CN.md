# Pixel Refiner

[English version](./README.md) | [日本語版](./README.ja.md)

![Pixel Refiner Demo](.github/assets/demo.png)

### 立即使用：<a href="https://pixel-refiner.app/" target="_blank">pixel-refiner.app</a>

**Pixel Refiner** 是一个基于 Web 的像素画清理工具，特别适合优化 AI 生成的像素画，并将其转换为高质量素材和图标。
它可以移除抗锯齿、自动检测像素网格、让背景透明，并支持多张图片批量处理。所有处理都在浏览器内快速完成。

![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF)

## 功能

AI 生成的像素画经常会出现边缘模糊（抗锯齿痕迹）、网格错位、背景不透明等问题。Pixel Refiner 用于解决这些问题。

- **移除抗锯齿**：把模糊边缘还原为干净、锐利的像素。
- **智能网格检测**：自动检测像素网格尺寸，并重采样到合适的分辨率。
  - **网格候选选择**：显示多个可能的网格尺寸，可手动选择最适合的结果。
  - **灵活模式**：可选择 **Auto**、**Hint (Pixel + Auto)**、**Force (Pixel only)** 或 **Off (1:1)**。
  - **高分辨率支持**：提升大图和复杂像素图案的检测准确度。
  - **快速估算**：针对大图提供更快的预览模式。
- **智能背景移除**：
  - **自动模式（默认）**：从整个图像外缘推断背景，支持渐变和轻度噪点
  - 基于角落颜色的透明化（手动指定）
  - **吸管工具**：点击图片直接选择背景色
  - 可调容差
  - 内部孔洞填充，例如环形图案内部
  - 孤立噪点清理
- **减色与调色板映射**：
  - **复古主机调色板**：支持 NES、Game Boy、SNES、PC-9801、MSX1、PICO-8 等。
  - **自定义量化**：使用 Oklab 色彩空间和 K-means 聚类进行高质量减色。
  - **抖动**：支持 Floyd-Steinberg、Bayer (2x2, 4x4, 8x8) 和 Ordered 抖动。
- **描边生成**：自动给 sprite 添加描边。
  - **样式**：支持 Rounded (8-way) 或 Sharp (4-way)。
  - **自定义颜色**：可选择任意描边颜色。
- **预设管理**：保存和加载常用处理配置，便于在不同图片间复用。
- **自动裁剪**：移除透明边距并裁剪到内容边界。
- **强制缩放**：按指定像素宽高输出。
- **放大导出**：支持 x2、x4 到 x32 下载，便于在游戏引擎和其他工具中使用。
- **多图片处理**：
  - **批量上传**：一次拖放多张文件。
  - **会话管理**：管理已加载图片、移除不需要的图片或全部清除。
  - **批量下载**：把所有已处理图片打包为一个 ZIP 下载。
  - **批量缩放**：ZIP 导出时对所有图片应用同一个放大倍率。
- **非阻塞处理**：复杂图片处理在 Web Worker 中运行，UI 保持响应。
- **Toast 通知**：保存预设、完成下载等操作会实时反馈。

## 使用方法

1. 打开应用（本地运行或访问部署站点）。
2. 将图片拖放到上传区域，或点击选择文件。支持多张图片。
3. 使用 **Images** 列表在已上传图片之间切换。
4. 点击 **Process**，或启用 **Auto**，生成优化后的像素画 sprite。
5. 根据需要调整设置：
    - **Grid Detection**：模式选择（Auto/Hint/Force/Off）、候选尺寸选择、快速模式开关
    - **Colors & Palette**：调色板选择、颜色数量、抖动
    - **Background**：透明化模式（自动/手动）、容差、清理选项
    - **Outline**：为 sprite 添加描边
6. 使用 **Compare** 视图通过滑块比较原图和处理结果。
7. 满意后点击 **Download** 保存结果，也可以通过下拉按钮选择放大倍率。
8. 多张图片时，使用 **Download All (ZIP)** 一次导出所有已处理 sprite。

## 开发

需要 Node.js 24.x 和 pnpm。

```bash
pnpm install # 安装依赖
pnpm dev     # 启动开发服务器: http://localhost:5173
pnpm build   # 构建生产版本
pnpm test    # 运行测试
```

### Auto 流水线

Auto 是默认处理流水线。它会对每张图像进行分类，并选择网格优化、连续色调转换，
或在结果不确定时安全地保留原始尺寸。网格判断置信度较低时，应用会显示候选结果，
而不会强制进行极端缩小。

运行 `pnpm test:quality:report` 可针对同一组 fixture 比较当前输出与基线输出。
Pull Request 也会在 GitHub Actions 中发布质量门禁摘要。

## 说明

本工具主要用于自动图片转换和优化。因此，当前不计划实现类似绘图软件的逐像素手动编辑功能。

## 许可证

本项目基于 [MIT License](./LICENSE) 发布。
