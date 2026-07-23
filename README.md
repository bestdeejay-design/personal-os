# Personal OS v0.0.14

> [Read in Russian](./README.ru.md)

**Your personal command center.** Notes, kanban tasks, projects, calendar, files, profiles (Work / Home / Family / Friends), daily and weekly digests, agent suggestions, and semantic search — all in one place, fully local.

> 🎯 **For:** developers, product managers, freelancers, and anyone who wants a unified workspace with full control over their data. No cloud, no subscriptions — just your computer.

## Features

| Section | What it does |
|---------|-------------|
| 📝 **Notes** | Markdown, tags, profiles/tasks/projects linking, manual sorting |
| 📋 **Kanban** | Statuses backlog → in_progress → done, priorities, weight, rank |
| 📅 **Calendar** | Events, profile filtering, ICS export, recurrence |
| 📁 **Projects** | Group tasks and notes, status, goal tracking, item dashboard |
| 👤 **Profiles** | Work / Home / Family / Friends — full context isolation, custom profiles |
| 🔍 **Search** | Semantic (Ollama) + ILIKE full-text across all content |
| 🤖 **Agent** | Tone, reminders, daily & weekly digests, DND windows |
| 🎨 **Themes** | Dark / Light, customizable accent color |
| 🖥️ **Desktop** | Tauri v2 .app — bundles and runs the whole stack as a native app |
| 📎 **Files** | Upload, link to projects/profiles, text extraction, semantic indexing |
| ⏰ **Reminders** | Time-based, WebSocket push |
| 📊 **Analytics** | Task distribution, productivity stats |

## Quick Start

### Requirements
- [OrbStack](https://orbstack.dev) or Docker Desktop
- [Ollama](https://ollama.com) (optional, for RAG/agent)

### 1. Launch the stack
```bash
git clone https://github.com/bestdeejay-design/personal-os.git
cd personal-os
docker compose up --build
open http://localhost:8080
```

### 2. Seed demo data (optional)
```bash
bash backend/seed-demo.sh
```

### 3. Use it
Switch profiles in the sidebar — data filters by context (Work, Home, Family, Friends). Try search, drag tasks between kanban columns, export events as .ics.

### Stop
```bash
docker compose down          # stop
docker compose down -v       # stop + delete all data
```

### RAG (optional)
```bash
ollama pull nomic-embed-text
ollama pull qwen2.5:7b     # or minimax-m3:cloud / nemotron-3-super:cloud
```

## Desktop App (macOS)

```bash
cd desktop && npm run build
open src-tauri/target/release/bundle/macos/Personal\ OS.app
```

## Tech Stack
```
Frontend:    React + Vite + TypeScript
Backend:     Node.js + Express + TypeScript + PostgreSQL (pg)
Infra:       OrbStack / Docker Compose
RAG:         Ollama (nomic-embed-text, qwen2.5:7b)
Desktop:     Tauri v2 (Rust)
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.0.14 | Jul 2026 | Kanban tags, WeekGrid drag-n-drop, recurring tasks auto-creation |
| 0.0.13 | Jul 2026 | Note card redesign, file delete, mojibake fix, CHANGELOG |
| 0.0.12 | Jul 2026 | Full i18n, profile management, settings, file search |
| 0.0.11 | Jul 2026 | Settings: start screen, time format, week start, kanban columns, window size |
| 0.0.10 | Jul 2026 | Initial public release: P1–P3 features, Tauri shell, demo data |

## Development
```bash
cd backend && npm install && npx tsc
cd frontend && npm install && npm run build
cd desktop && npm install && npm run build
```

## License
MIT — do whatever you want.
