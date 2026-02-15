# Pixel Refiner

[Japanese version](./README.ja.md)

![Pixel Refiner Demo](.github/assets/demo.png)

### 🚀 Try it now: <a href="https://pixel-refiner.app/" target="_blank">pixel-refiner.app</a>

**Pixel Refiner** is a web-based tool that cleans up pixel art — especially AI-generated pixel art — and turns it into high-quality assets and icons.
It removes anti-aliasing, auto-detects pixel grids, makes backgrounds transparent, and supports batch processing of multiple images — all running fast in the browser.

![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF)

## ✨ Features

AI-generated pixel art often comes with blurry edges (anti-aliasing artifacts), misaligned grids, and opaque backgrounds. Pixel Refiner fixes all of that.

- **Anti-aliasing removal** — Sharpens blurry edges back into clean, crisp pixels.
- **Auto grid detection** — Automatically detects the pixel grid size and resamples to the optimal resolution.
  - **1:1 mode** — Bypasses grid detection and works directly with the source pixels.
  - **Fast estimation** — A turbo mode for quick previews, even on large images.
- **Smart background removal**:
  - Auto-transparency based on corner colors
  - **Eyedropper tool** — Click to pick the exact background color
  - Adjustable tolerance
  - Interior hole filling (e.g. the inside of a donut shape)
  - Isolated noise pixel cleanup
- **Color reduction & palette mapping**:
  - **Retro console palettes** — NES, Game Boy, SNES, PC-9801, MSX1, PICO-8, and more.
  - **Custom quantization** — High-quality color reduction using Oklab color space and K-means clustering.
  - **Dithering** — Supports Floyd-Steinberg, Bayer (2x2, 4x4, 8x8), and Ordered dithering.
- **Outline generation** — Automatically adds an outline (stroke) to the sprite.
  - **Styles** — Rounded (8-way) or Sharp (4-way).
  - **Custom color** — Choose any color for the outline.
- **Preset management** — Save and load your favorite processing configurations to reuse them across different images.
- **Auto trim** — Strips transparent margins and crops to content bounds.
- **Forced resize** — Resizes to an exact pixel dimension you specify.
- **Scaled export** — Download at x2, x4, … up to x32 for use in game engines and other tools.
- **Multi-image processing**:
  - **Batch upload** — Drag and drop multiple files at once.
  - **Session management** — Manage multiple images, remove unwanted ones, or clear all.
  - **Batch download** — Process all images and download them as a single ZIP file.
  - **Batch scaling** — Apply a specific scale factor to all images in the ZIP export.
- **Non-blocking processing** — Heavy image processing runs in a Web Worker so the UI stays responsive.
- **Toast notifications** — Real-time feedback for actions like saving presets or completing downloads.

## 📖 Usage

1. Open the app (locally or on a deployed instance).
2. Drag & drop images onto the drop zone (or click to browse). Multiple images are supported.
3. Use the **"Images"** list to switch between uploaded images.
4. Hit **"Process"** (or enable **"Auto"**) to generate optimized pixel art sprites.
5. Fine-tune settings as needed:
    - **General** — Grid detection on/off, fast mode toggle
    - **Colors & Palette** — Preset selection, color count, dithering
    - **Background** — Transparency mode (auto/manual), tolerance, cleanup options
    - **Outline** — Add an outline to the sprite
5. Use the **"Compare"** view to check the difference between the original and processed image with a slider.
6. When you're happy with the result, click **"Download"** (use the ▼ dropdown to choose a scale factor).
7. For multiple images, use **"Download All (ZIP)"** to export all processed sprites at once.

## 🛠️ Development

Built with TypeScript + Vite.

### Prerequisites

- Node.js v18+
- npm

### Setup

```bash
git clone https://github.com/HappyOnigiri/PixelRefiner.git
cd PixelRefiner
npm install
```

### Dev server

```bash
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Build

```bash
npm run build
```

Output goes to the `dist` directory.

### Tests

Runs unit tests for the core image processing logic.

```bash
npm test
```

## 📂 Project Structure

- `src/browser/` — Browser UI logic and main entry point
- `src/core/` — Core image processing algorithms (grid detection, resampling, transparency, etc.)
- `src/shared/` — Type definitions and configuration constants
- `test/` — Test code and fixture images

## Note

Please note that this tool is designed primarily for automatic image conversion and optimization. Therefore, we do not plan to implement manual pixel-by-pixel editing features similar to paint software.

## License

This project is licensed under the [MIT License](./LICENSE).
