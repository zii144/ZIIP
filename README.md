# ZIIP

<p align="center">
  <svg xmlns="http://www.w3.org/2000/svg" width="140" height="72" viewBox="0 0 140 72">
    <defs>
      <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#1e40af"/>
        <stop offset="50%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#0ea5e9"/>
      </linearGradient>
    </defs>
    <text x="70" y="52" font-size="56" font-weight="700" font-family="system-ui, -apple-system, sans-serif" fill="url(#blueGrad)" text-anchor="middle">ZII</text>
  </svg>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0--alpha-9333ea?style=for-the-badge&labelColor=1e293b" alt="Version" />
  <img src="https://img.shields.io/badge/Tauri-2.0-FFC131?style=for-the-badge&logo=tauri&logoColor=000" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=000" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=fff" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=fff" alt="Vite" />
  <img src="https://img.shields.io/badge/Rust-Backend-000000?style=for-the-badge&logo=rust&logoColor=fff" alt="Rust" />
  <img src="https://img.shields.io/badge/Tailwind-4-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=fff" alt="Tailwind CSS" />
</p>

<p align="center">
  <strong>A sleek desktop API client with an AI-powered assistant.</strong>
</p>

---

## About

**ZIIP** is a modern, native desktop application for testing and exploring APIs. Built with [Tauri 2](https://tauri.app) and a React frontend, it combines a full-featured HTTP client with **ZII** — an AI assistant that helps you craft requests, debug responses, and generate mock payloads.

### Features

- **HTTP Client** — Send GET, POST, PUT, DELETE, and PATCH requests
- **Request Builder** — Headers, query params, body (JSON), and auth (Bearer / Basic)
- **IDE-style Response Viewer** — Syntax-highlighted JSON with status codes and timing
- **ZII Assistant** — AI-powered chat panel for API exploration and help
- **Native Performance** — Lightweight Rust backend via Tauri

## Tech Stack

| Layer        | Technology                         |
| ------------ | ---------------------------------- |
| **Desktop**  | Tauri 2                            |
| **Frontend** | React 19, TypeScript, Vite 7       |
| **Styling**  | Tailwind CSS 4, Framer Motion      |
| **Backend**  | Rust (reqwest)                     |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

### Install & Run

```bash
# Clone and install dependencies
git clone <repository-url>
cd ZIIP
npm install

# Development mode (hot reload)
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
ZIIP/
├── src/                    # React frontend
│   ├── App.tsx             # Main app + API client UI
│   └── App.css             # Styles
├── src-tauri/              # Rust backend
│   ├── src/lib.rs          # HTTP client (make_request)
│   └── tauri.conf.json     # Tauri config
├── public/                 # Static assets
└── package.json
```

## License

[Add your license here]

---

<p align="center">
  Made with <span style="color:#e74c3c">♥</span> by ZII
</p>
