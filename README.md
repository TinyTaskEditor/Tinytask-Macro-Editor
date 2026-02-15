# TinyTask Macro Editor 🚀

A comprehensive editor for TinyTask `.rec` macros. This project provides both a web-based interface and a portable desktop application (built with Electron) to inspect, modify, and optimize your recorded macros.

## ✨ Features

- **Binary Parsing**: Full support for TinyTask `.rec` structure (EVENTMSG structs).
- **In-place Editing**: Modify delays (ms) directly in the grid.
- **Batch Processing**: Select multiple events to nudge delays, set specific values, or clamp jitter.
- **Visual Preview**: Real-time canvas reproduction of mouse movements and keyboard events.
- **Desktop App**: Portable Windows executable (`.exe`) with no installation required.
- **Privacy Focused**: Menu and DevTools are disabled in the desktop version for a clean, secure experience.
- **Multi-language Support**: Optimized for English and Russian with high-quality SVG flag icons.
- **Performance**: High-performance virtualization handles macros with tens of thousands of events smoothly.

## 📂 Project Structure

- `web/` – Main application directory (Vite + React + TypeScript)
  - `electron/` – Electron main process and preload scripts
  - `src/` – React frontend and business logic
  - `src/assets/flags/` – Custom SVG flag icons for RU/US locales
- `fixtures/` – Sample recordings for testing

## 🛠 Compilation & Build Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (Recommended: Latest LTS)
- npm (Comes with Node.js)

### Manual Build Steps

1. **Navigate to the web directory**:
   ```bash
   cd web
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Development Mode**:
   Launch the Electron app in development mode:
   ```bash
   npm run dev
   ```

4. **Production Build (Portable EXE)**:
   To generate the portable Windows executable:
   ```bash
   npm run build
   ```
   After the build completes, the standalone `.exe` will be located in the `web/dist-electron` and `web/release` directories.

## ⌨️ Dashboard Shortcuts

- `Ctrl + A` — Select all events
- `Delete` — Remove selected events
- `Ctrl + Z` / `Ctrl + Y` — Undo / Redo
- `+` / `-` — Nudge delays by ±10ms
- `Space` — Play/Pause preview

---
*Created with focus on performance and usability.*
