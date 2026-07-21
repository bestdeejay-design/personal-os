#!/usr/bin/env bash
# seed-demo.sh — заполняет Personal OS демо-данными для показа функционала.
# Запускать после `docker compose up -d`, когда API отвечает 200.
set -euo pipefail

BASE="http://localhost:8080/api"

echo "=== Seed: Personal OS demo data ==="

# ---- Получаем профили ----
echo "--- Fetching profiles..."
PROFILES=$(curl -sf "$BASE/profiles")
WORK_ID=$(echo "$PROFILES" | python3 -c "import sys,json; ps={p['name']:p['id'] for p in json.load(sys.stdin)}; print(ps['Work'])")
HOME_ID=$(echo "$PROFILES" | python3 -c "import sys,json; ps={p['name']:p['id'] for p in json.load(sys.stdin)}; print(ps['Home'])")
FAMILY_ID=$(echo "$PROFILES" | python3 -c "import sys,json; ps={p['name']:p['id'] for p in json.load(sys.stdin)}; print(ps['Family'])")
FRIENDS_ID=$(echo "$PROFILES" | python3 -c "import sys,json; ps={p['name']:p['id'] for p in json.load(sys.stdin)}; print(ps['Friends'])")
echo "  Work=$WORK_ID Home=$HOME_ID Family=$FAMILY_ID Friends=$FRIENDS_ID"

# ---- Проект ----
echo "--- Creating project..."
PROJECT_PAYLOAD='{
  "name": "Запуск Personal OS",
  "desc_md": "Финальная полировка перед релизом: демо-данные, README, версионирование и CI.",
  "profile_ids": ["Work", "Home"],
  "status": "active",
  "goal": "Стабильный релиз v0.0.10 с примером всех возможностей системы."
}'
PROJECT_ID=$(curl -sf -X POST "$BASE/projects" \
  -H "Content-Type: application/json" \
  -d "$PROJECT_PAYLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  project_id=$PROJECT_ID"

# ---- Заметки ----
echo "--- Creating notes..."

# Заметка 1 — архитектурная
NOTE1_PAYLOAD='{
  "title": "Архитектура Personal OS",
  "body_md": "## Стек\n\n- **Backend:** Node.js + Express + TypeScript + PostgreSQL\n- **Frontend:** React + Vite + TypeScript\n- **Инфра:** OrbStack / Docker Compose\n- **RAG:** Ollama (nomic-embed-text, qwen2.5:7b)\n- **Desktop:** Tauri v2\n\n## Разделы\n\n1. Профили (Work / Home / Family / Friends) — изоляция контекстов\n2. Заметки с Markdown, профильной привязкой и тегами\n3. Канбан-доска: backlog → todo → in_progress → done\n4. Проекты и календарь с ICS-экспортом\n5. Поиск: семантический (через Ollama) + ILIKE-фолбэк\n6. Агент: тональность, напоминания, дайджесты дня/недели\n\n## Версионирование\n\n- Мажорные (+0.1.00): новые разделы, архитектурные изменения\n- Минорные (+0.0.01): новые фичи, улучшения, багфиксы\n- Текущая версия: **0.0.10**",
  "profile_ids": ["Work"],
  "tags": ["architecture", "docs", "personal-os"]
}'
curl -sf -X POST "$BASE/notes" -H "Content-Type: application/json" -d "$NOTE1_PAYLOAD" > /dev/null
echo "  note 1 (architecture) done"

# Заметка 2 — бытовая
NOTE2_PAYLOAD='{
  "title": "Список покупок на неделю",
  "body_md": "- Овощи: помидоры, огурцы, салат\n- Фрукты: яблоки, бананы\n- Молочка: молоко, йогурт, сыр\n- Крупы: гречка, рис, овсянка\n- Мясо: курица, фарш\n\n_Пример заметки в личном профиле Home._",
  "profile_ids": ["Home"],
  "tags": ["home", "list"]
}'
curl -sf -X POST "$BASE/notes" -H "Content-Type: application/json" -d "$NOTE2_PAYLOAD" > /dev/null
echo "  note 2 (groceries) done"

# Заметка 3 — planning
NOTE3_PAYLOAD='{
  "title": "Идеи для Family-выходных",
  "body_md": "- Пикник в парке (если погода)\n- Настольные игры дома\n- Киновечер с попкорном\n- Поход в зоопарк\n\n_Профиль Family — планирование досуга._",
  "profile_ids": ["Family"],
  "tags": ["family", "weekend"]
}'
curl -sf -X POST "$BASE/notes" -H "Content-Type: application/json" -d "$NOTE3_PAYLOAD" > /dev/null
echo "  note 3 (family ideas) done"

# ---- Задачи ----
echo "--- Creating tasks..."

TASK1_PAYLOAD='{
  "title": "Написать seed-скрипт демо-данных",
  "desc_md": "Создать shell-скрипт, который заполняет БД примерами: заметки, задачи, события.",
  "status": "done",
  "priority": "high",
  "weight": 5,
  "profile_ids": ["Work"],
  "project_id": "'"$PROJECT_ID"'"
}'
curl -sf -X POST "$BASE/tasks" -H "Content-Type: application/json" -d "$TASK1_PAYLOAD" > /dev/null
echo "  task 1 (seed script) done"

TASK2_PAYLOAD='{
  "title": "Обновить README и описание проекта",
  "desc_md": "Написать понятное README: для кого проект, что умеет, как установить.",
  "status": "in_progress",
  "priority": "high",
  "weight": 3,
  "profile_ids": ["Work"],
  "project_id": "'"$PROJECT_ID"'"
}'
curl -sf -X POST "$BASE/tasks" -H "Content-Type: application/json" -d "$TASK2_PAYLOAD" > /dev/null
echo "  task 2 (readme) done"

TASK3_PAYLOAD='{
  "title": "Купить подарок другу на ДР",
  "desc_md": "Придумать идею и заказать заранее.",
  "status": "todo",
  "priority": "medium",
  "weight": 2,
  "due_date": "'$(date -v+14d +%Y-%m-%dT12:00:00Z)'",
  "profile_ids": ["Friends"]
}'
curl -sf -X POST "$BASE/tasks" -H "Content-Type: application/json" -d "$TASK3_PAYLOAD" > /dev/null
echo "  task 3 (gift) done"

TASK4_PAYLOAD='{
  "title": "Запланировать семейный ужин",
  "desc_md": "Выбрать ресторан или приготовить дома.",
  "status": "backlog",
  "priority": "low",
  "weight": 1,
  "profile_ids": ["Family"]
}'
curl -sf -X POST "$BASE/tasks" -H "Content-Type: application/json" -d "$TASK4_PAYLOAD" > /dev/null
echo "  task 4 (family dinner) done"

# ---- Календарь ----
echo "--- Creating calendar events..."

TOMORROW=$(date -v+1d +%Y-%m-%d)
NEXT_WEEK=$(date -v+7d +%Y-%m-%d)

EVENT1_PAYLOAD='{
  "title": "Созвон по архитектуре",
  "start": "'"$TOMORROW"T10:00:00Z'",
  "end": "'"$TOMORROW"T11:00:00Z'",
  "profile_ids": ["Work"],
  "notes_md": "Обсудить план релиза и road map.",
  "location": "Google Meet"
}'
curl -sf -X POST "$BASE/calendar" -H "Content-Type: application/json" -d "$EVENT1_PAYLOAD" > /dev/null
echo "  event 1 (arch call) done"

EVENT2_PAYLOAD='{
  "title": "Семейный ужин",
  "start": "'"$NEXT_WEEK"T19:00:00Z'",
  "end": "'"$NEXT_WEEK"T21:00:00Z'",
  "profile_ids": ["Family"],
  "notes_md": "Раз в неделю собираемся всей семьёй.",
  "location": "Дома"
}'
curl -sf -X POST "$BASE/calendar" -H "Content-Type: application/json" -d "$EVENT2_PAYLOAD" > /dev/null
echo "  event 2 (family dinner) done"

EVENT3_PAYLOAD='{
  "title": "Тренировка с друзьями",
  "start": "'"$(date -v+3d +%Y-%m-%d)"T18:00:00Z'",
  "end": "'"$(date -v+3d +%Y-%m-%d)"T19:30:00Z'",
  "profile_ids": ["Friends"],
  "notes_md": "Футбол по средам.",
  "location": "Спорткомплекс"
}'
curl -sf -X POST "$BASE/calendar" -H "Content-Type: application/json" -d "$EVENT3_PAYLOAD" > /dev/null
echo "  event 3 (sports) done"

# ---- Приветственное сообщение агента (прямая вставка в БД) ----
echo "--- Creating welcome agent message..."
CONTAINER=$(docker ps --filter "name=personal-os-postgres" --format "{{.Names}}" | head -1)
if [ -n "$CONTAINER" ]; then
  docker exec -i "$CONTAINER" psql -U postgres -d personalos <<-SQL
    INSERT INTO agent_messages (id, trigger_type, title, body, suggested_actions_json, resolved, profile_ids)
    VALUES (
      gen_random_uuid(),
      'onboarding',
      '👋 Добро пожаловать в Personal OS!',
      'Это демонстрационный экземпляр Personal OS. Вы видите примеры всех возможностей системы:

📝 **Заметки** — с Markdown, тегами и привязкой к профилям/задачам/проектам
📋 **Канбан-доска** — задачи со статусами backlog → todo → in_progress → done
📅 **Календарь** — события с привязкой к профилям и ICS-экспортом
📁 **Проекты** — группировка задач и заметок
🔍 **Поиск** — семантический (через Ollama) + текстовый
🤖 **Агент** — тональность, напоминания, дайджесты дня и недели
🎨 **Темы** — тёмная/светлая, настраиваемый акцентный цвет
👤 **Профили** — Work / Home / Family / Friends (изоляция контекстов)

💡 **Подсказки:**
  • Переключайте профили в боковом меню — данные фильтруются по профилю
  • Пробуйте поиск — он ищет и по тексту, и по смыслу
  • Задачи можно перетаскивать между колонками канбана
  • В календаре доступен экспорт в .ics

_Эти данные созданы для демонстрации — можете редактировать, добавлять свои или удалить через меню._'
      ,
      '["profile", "project", "note", "task", "calendar", "search", "agent"]'::jsonb,
      false,
      '["Work", "Home", "Family", "Friends"]'::jsonb
    )
    ON CONFLICT DO NOTHING;
SQL
  echo "  agent welcome message done"
else
  echo "  skip welcome message (no postgres container)"
fi

echo ""
echo "=== Seed complete ==="
