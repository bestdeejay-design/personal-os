# Personal OS

Личный операционный центр: заметки, канбан-задачи, проекты, календарь, файлы,
профили (Work / Home / Family / Friends) и дайджесты дня/недели в одном месте.
Поиск и агент-подсказки работают поверх локального RAG (Ollama, бесплатные модели).

> Проект портфолио. Полностью бесплатно: локально (Ollama, OrbStack) + free-tier
> облачные модели Ollama-провайдера (`minimax-m3:cloud`, `nemotron-3-super:cloud`).

## Стек

- **Frontend** — React + Vite + TypeScript, тёмная/светлая темы, настраиваемый акцент.
  Сборка в статику, отдаётся через nginx (внутри контейнера).
- **Backend** — Node.js + TypeScript + Express + PostgreSQL (`pg`), WebSocket для
  realtime-агента, RAG-клиент к Ollama.
- **Инфра** — OrbStack + Docker Compose (postgres / backend / frontend).
- **RAG** — Ollama: `nomic-embed-text` (эмбеддинги) + генеративная модель
  (`minimax-m3:cloud`). Без Ollama агент-фичи неактивны, остальное работает.

## Фазы

- **P1 — каркас (готово)**: профили, заметки, задачи/канбан, проекты, календарь
  (внутренний + `.ics` экспорт), файлы, поиск, дайджесты, настройки темы.
- **P2 — агент + голос**: tone-of-voice агент, STT/TTS, ежедневные дайджесты.
- **P3 — глубина**: пересечения плоскостей профилей, приоритизация-как-процесс.
- **P4 — натив**: обёртка Tauri 2 вместо веба.

## Быстрый старт (OrbStack)

Требования: установленный [OrbStack](https://orbstack.dev) с Docker, опционально
[Ollama](https://ollama.com) для RAG.

```bash
# 1. Запустить виртуальную машину OrbStack (один раз)
orbctl start

# 2. Поднять стек (postgres + backend + frontend)
docker compose up --build

# 3. Открыть в браузере
open http://localhost:8080
```

Остановить: `docker compose down`. Удалить данные вместе с томами: `docker compose down -v`.

### RAG (опционально)

Если Ollama запущена на хосте (Mac), бэкенд в контейнере достанет её через
`host.docker.internal:11434` — это уже прописано в `docker-compose.yml`.
Для локального запуска бэкенда вне Docker см. `backend/.env.example`.

```bash
ollama pull nomic-embed-text
ollama pull minimax-m3:cloud   # или другая генеративная модель
```

## Переменные окружения (backend)

См. `backend/.env.example`. В Docker значения задаются в `docker-compose.yml`.

| Переменная      | По умолчанию                        | Назначение                         |
|-----------------|-------------------------------------|------------------------------------|
| `PORT`          | `8080` (в docker `8081`)            | Порт бэкенда                       |
| `DATABASE_URL`  | `postgres://...@localhost:5432/...` | Строка подключения к PostgreSQL    |
| `OLLAMA_HOST`   | `http://localhost:11434`            | Эндпоинт Ollama                    |
| `GEN_MODEL`     | `minimax-m3:cloud`                  | Генеративная модель для агента     |
| `EMBED_MODEL`   | `nomic-embed-text`                  | Модель эмбеддингов                 |
| `DATA_DIR`      | `./data/uploads`                    | Каталог загрузок файлов            |

## Структура

```
personal-os/
├── docker-compose.yml     # оркестрация postgres + backend + frontend
├── backend/               # Node + TS + Express + pg + RAG-клиент
│   └── src/               # index, db, rag, ics, routes/*
└── frontend/              # React + Vite, тема, модули P1
    └── src/               # App, api, theme, components/, views/
```

## Разработка без Docker

```bash
# Бэкенд
cd backend && npm install && npx tsc --noEmit

# Фронтенд
cd frontend && npm install && npm run build
```

Подробная спецификация и поведение агента — в `docs/SPEC.md`.
