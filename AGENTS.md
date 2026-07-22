# 🤖 Personal OS — правила проекта

> Этот файл содержит правила и контекст для AI-агентов (Sisyphus и др.),
> работающих над проектом Personal OS.

## О проекте

Personal OS — личный операционный центр: заметки, канбан-задачи, проекты,
календарь, файлы, профили (Work / Home / Family / Friends) и дайджесты
дня/недели в одном месте. Поиск и агент-подсказки работают поверх
локального RAG (Ollama, бесплатные модели).

**Целевая аудитория:** технически подкованные пользователи, которые хотят
единое рабочее пространство с полным контролем над данными (всё локально,
никаких облаков).

## Версионирование

Проект следует семантическому версионированию с двумя уровнями:

| Уровень | Изменение | Пример |
|---------|-----------|--------|
| **Мажорный** (+0.1.00) | Новые разделы, архитектурные изменения, крупные фичи | 0.0.10 → 0.1.00 → 0.2.00 |
| **Минорный** (+0.0.01) | Новые фичи, улучшения, багфиксы | 0.0.10 → 0.0.11 → 0.0.12 |

**Текущая версия:** `0.0.12`

### Правила
1. Каждый коммит в `main` должен увеличивать версию хотя бы на минорный шаг.
2. Мажорная версия фиксируется в README, AGENTS.md и git tag.
3. Git tag создаётся для каждой мажорной и минорной версии в формате `v0.0.10`.
4. Версия проставляется в:
   - `frontend/package.json` — `version`
   - `desktop/src-tauri/tauri.conf.json` — `version`
   - README.md — упоминание версии
   - AGENTS.md — текущая версия

## Структура

```
personal-os/
├── AGENTS.md              # правила проекта для AI-агентов
├── README.md              # описание, установка, версия
├── docker-compose.yml     # оркестрация postgres + backend + frontend
├── backend/               # Node + TS + Express + pg
│   ├── src/               # index, db, rag, ics, routes/*
│   └── seed-demo.sh       # заполнение демо-данными
├── frontend/              # React + Vite, тема, P1-модули
│   └── src/               # App, api, theme, components/, views/
└── desktop/               # Tauri v2 shell (macOS .app)
    ├── src-tauri/         # Rust: main.rs, tauri.conf.json
    └── scripts/           # copy-stack.sh (перед сборкой)
```

## Ключевые архитектурные решения

- **БД:** PostgreSQL, инициализация через `CREATE TABLE IF NOT EXISTS` в `db.ts`.
  Миграции — идемпотентные `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- **Профили:** 4 предустановленных (Work, Home, Family, Friends). Все entity
  ссылаются на профили через `profile_ids` (jsonb-массив имён).
- **Поиск:** семантический (через Ollama эмбеддинги) с ILIKE-фолбэком.
- **Агент:** воркер с тональностью, дайджестами, DND-окнами. Сообщения
  хранятся в `agent_messages`.
- **Desktop:** Tauri v2 .app, бандлит весь стек, запускает через
  `docker compose up -d`, при выходе гасит через fire-and-forget spawn.
- **Демо-данные:** `bash backend/seed-demo.sh` (curl + psql).

## Команды

```bash
# Запуск
docker compose up --build     # поднять стек
open http://localhost:8080    # открыть UI

# Остановка
docker compose down           # погасить стек
docker compose down -v        # + удалить volumes (все данные!)

# Seed
bash backend/seed-demo.sh     # заполнить демо-данными

# Desktop
cd desktop && npm run build   # собрать .app (Tauri)
open src-tauri/target/release/bundle/macos/Personal\ OS.app
```

## Связанные проекты

- OC Architecture — общая схема OpenCode-окружения (агенты, MCP, LSP, скиллы).
  Репозиторий: `oc-architecture/`.
