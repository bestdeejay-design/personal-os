# Seed: полные тестовые данные для Personal OS

## Как использовать

1. Убедись, что стек запущен: `docker compose ps` — все 3 контейнера `Up`.
2. Выполняй команды ниже **по порядку** (проекты нужно создать перед задачами, которые на них ссылаются).

---

## 1. Проекты

```bash
# Проект: Ремонт в гостиной
curl -sf -X POST http://localhost:8080/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ремонт в гостиной",
    "desc_md": "Косметический ремонт: покраска стен, замена ламината, новая люстра.",
    "profile_ids": ["Home", "Family"],
    "status": "active",
    "goal": "Завершить ремонт до конца месяца"
  }'

# Проект: Подготовка отчёта Q3
curl -sf -X POST http://localhost:8080/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Подготовка отчёта Q3",
    "desc_md": "Собрать метрики, написать выводы, подготовить презентацию для руководства.",
    "profile_ids": ["Work"],
    "status": "active",
    "goal": "Сдать отчёт до 15 числа"
  }'

# Проект: Организация дня рождения
curl -sf -X POST http://localhost:8080/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Организация дня рождения",
    "desc_md": "Подготовить праздник для друга: площадка, еда, музыка, гости.",
    "profile_ids": ["Friends"],
    "status": "active",
    "goal": "Провести незабываемый вечер"
  }'
```

Сохрани ID проектов — они понадобятся ниже (заменить `PROJECT_ID_xxx`).

---

## 2. Заметки + Задачи (JSON-импорт)

`POST /api/import` принимает JSON. Каждый элемент массива становится заметкой или задачей (по полю `type`).

Сначала сохрани массив в файл:

```bash
cat > /tmp/seed-data.json << 'JSONEOF'
[
  {
    "type": "note",
    "title": "Идеи для воскресного обеда",
    "body_md": "— Паста с креветками и рукколой\n— Цезарь с курицей\n— Чизкейк на десерт",
    "tags": ["еда", "home", "рецепты"],
    "profile_ids": ["Home"]
  },
  {
    "type": "note",
    "title": "Заметки по TypeScript 5.8",
    "body_md": "## Новое в TS 5.8\n\n- `using` declarations (stage 3)\n- Улучшенный `--isolatedDeclarations`\n- `const` type parameters",
    "tags": ["typescript", "dev", "learning"],
    "profile_ids": ["Work"]
  },
  {
    "type": "note",
    "title": "Маршрут отпуска",
    "body_md": "**День 1:** Прилёт, заселение, прогулка по набережной\n**День 2:** Экскурсия в горы\n**День 3:** Пляж, snorkeling\n**День 4:** Музей + шопинг\n**День 5:** Обратный вылет",
    "tags": ["travel", "family", "отпуск"],
    "profile_ids": ["Family"]
  },
  {
    "type": "note",
    "title": "Книги для прочтения",
    "body_md": "- «Чистый код» — Роберт Мартин\n- «Совершенный код» — Стив Макконнелл\n- «Domain-Driven Design» — Эрик Эванс\n- «System Design Interview» — Алекс Сюй",
    "tags": ["books", "dev", "reading"],
    "profile_ids": ["Work"]
  },
  {
    "type": "note",
    "title": "Плейлист для вечеринки",
    "body_md": "1. Daft Punk — Get Lucky\n2. Pharrell Williams — Happy\n3. Mark Ronson — Uptown Funk\n4. Lizzo — Juice\n5. Bruno Mars — 24K Magic",
    "tags": ["music", "fun", "playlist"],
    "profile_ids": ["Friends"]
  },
  {
    "type": "task",
    "title": "Покрасить стены в гостиной",
    "desc_md": "Купить краску (бежевый RAL 1013), валики, малярный скотч. Застелить пол.",
    "status": "in_progress",
    "priority": "high",
    "weight": 5,
    "profile_ids": ["Home", "Family"],
    "project_id": null
  },
  {
    "type": "task",
    "title": "Выбрать ламинат",
    "desc_md": "Съездить в Леруа Мерлен, посмотреть образцы. Бюджет — до 3000 руб/м².",
    "status": "todo",
    "priority": "medium",
    "weight": 3,
    "due_date": "2026-08-01T12:00:00Z",
    "profile_ids": ["Home"],
    "project_id": null
  },
  {
    "type": "task",
    "title": "Согласовать бюджет с CEO",
    "desc_md": "Записаться на встречу, подготовить смету по проектам.",
    "status": "backlog",
    "priority": "high",
    "weight": 4,
    "due_date": "2026-07-28T10:00:00Z",
    "assignee": "Иван Петров",
    "profile_ids": ["Work"],
    "project_id": null
  },
  {
    "type": "task",
    "title": "Написать выводы к отчёту",
    "desc_md": "Раздел «Выводы и рекомендации» — 2-3 страницы с графиками.",
    "status": "todo",
    "priority": "medium",
    "weight": 3,
    "due_date": "2026-08-10T18:00:00Z",
    "profile_ids": ["Work"],
    "project_id": null
  },
  {
    "type": "task",
    "title": "Проверить почту",
    "desc_md": "Ответить на письма от клиентов, проверить задачи в Jira.",
    "status": "done",
    "priority": "low",
    "weight": 1,
    "profile_ids": ["Work"]
  },
  {
    "type": "task",
    "title": "Купить подарок на ДР",
    "desc_md": "Бюджет 5000 руб. Идеи: книга, настольная игра, парфюм.",
    "status": "backlog",
    "priority": "medium",
    "weight": 2,
    "due_date": "2026-08-20T12:00:00Z",
    "profile_ids": ["Friends"]
  },
  {
    "type": "task",
    "title": "Записаться к стоматологу",
    "desc_md": "Профилактический осмотр, запись через госуслуги.",
    "status": "todo",
    "priority": "medium",
    "weight": 2,
    "profile_ids": ["Family"]
  },
  {
    "type": "task",
    "title": "Установить полки в кладовке",
    "desc_md": "Купить уголки и ДСП, отпилить по размеру, закрепить на стену.",
    "status": "backlog",
    "priority": "low",
    "weight": 1,
    "profile_ids": ["Home"]
  }
]
JSONEOF
```

Теперь отправь на сервер:

```bash
curl -sf -X POST http://localhost:8080/api/import \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, sys
data = json.load(open('/tmp/seed-data.json'))
payload = {'source': 'json', 'target': 'notes', 'profile_ids': [], 'content': json.dumps(data)}
print(json.dumps(payload))
")"
```

---

## 3. События календаря

```bash
# Созвон по архитектуре (Work)
curl -sf -X POST http://localhost:8080/api/calendar \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Созвон по архитектуре",
    "start": "2026-07-28T10:00:00Z",
    "end": "2026-07-28T11:00:00Z",
    "profile_ids": ["Work"],
    "notes_md": "Обсудить план релиза и road map.",
    "location": "Google Meet"
  }'

# Семейный ужин (Family)
curl -sf -X POST http://localhost:8080/api/calendar \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Семейный ужин",
    "start": "2026-08-01T19:00:00Z",
    "end": "2026-08-01T21:00:00Z",
    "profile_ids": ["Family"],
    "notes_md": "Раз в неделю собираемся всей семьёй.",
    "location": "Дома"
  }'

# Футбол с друзьями (Friends)
curl -sf -X POST http://localhost:8080/api/calendar \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Футбол с друзьями",
    "start": "2026-07-30T18:00:00Z",
    "end": "2026-07-30T19:30:00Z",
    "profile_ids": ["Friends"],
    "notes_md": "Футбол по средам.",
    "location": "Спорткомплекс"
  }'

# Выходные на даче (Family + Friends)
curl -sf -X POST http://localhost:8080/api/calendar \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Выходные на даче",
    "start": "2026-08-09T09:00:00Z",
    "end": "2026-08-10T20:00:00Z",
    "all_day": true,
    "profile_ids": ["Family", "Friends"],
    "notes_md": "Шашлыки, баня, настольные игры.",
    "location": "Дача"
  }'

# Еженедельная синхронизация (Work)
curl -sf -X POST http://localhost:8080/api/calendar \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Еженедельная синхронизация",
    "start": "2026-07-29T15:00:00Z",
    "end": "2026-07-29T15:30:00Z",
    "profile_ids": ["Work"],
    "notes_md": "Статус по задачам, блокеры, планы.",
    "location": "Zoom",
    "recurrence": {"freq": "weekly", "interval": 1, "until": "2026-12-31T23:59:00Z"}
  }'
```

---

## 4. Приветственное сообщение агента (SQL)

Вставка через `psql` прямо в контейнер:

```bash
docker exec -i $(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1) psql -U postgres -d personalos <<'SQL'
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
🤖 **Агент** — дайджесты дня и недели
🎨 **Темы** — тёмная/светлая
👤 **Профили** — Work / Home / Family / Friends

💡 **Подсказки:**
  • Переключайте профили в боковом меню — данные фильтруются
  • Задачи можно перетаскивать между колонками канбана
  • В календаре доступен экспорт в .ics
  • Поиск ищет и по тексту, и по смыслу (если подключена Ollama)'
  ,
  '["profile", "project", "note", "task", "calendar", "search", "agent"]'::jsonb,
  false,
  '["Work", "Home", "Family", "Friends"]'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO agent_messages (id, trigger_type, title, body, suggested_actions_json, resolved, profile_ids)
VALUES (
  gen_random_uuid(),
  'reminder',
  '⏰ Не забудьте про созвон по архитектуре',
  'Завтра в 10:00 созвон с командой. Подготовьте список вопросов.',
  '[
    {"type": "create_note", "label": "Записать вопросы", "params": {}},
    {"type": "create_task", "label": "Создать задачу на подготовку", "params": {}}
  ]'::jsonb,
  false,
  '["Work"]'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO agent_messages (id, trigger_type, title, body, suggested_actions_json, resolved, profile_ids)
VALUES (
  gen_random_uuid(),
  'suggestion',
  '💡 Запланировать семейный ужин',
  'Давно не собирались все вместе. Может, в эти выходные?',
  '[
    {"type": "create_meeting", "label": "Создать событие", "params": {"title": "Семейный ужин", "duration": 120}},
    {"type": "create_task", "label": "Создать задачу", "params": {}}
  ]'::jsonb,
  false,
  '["Family"]'::jsonb
)
ON CONFLICT DO NOTHING;
SQL
```

---

## 5. Напоминания (SQL)

```bash
docker exec -i $(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1) psql -U postgres -d personalos <<'SQL'
INSERT INTO reminders (id, type, fire_at, message, related_entity_type, related_entity_id, fired, profile_ids)
SELECT
  gen_random_uuid(),
  'digest_morning',
  CURRENT_DATE + INTERVAL '1 day' + TIME '09:00',
  'Доброе утро! Проверь сегодняшние задачи и встречи.',
  NULL, NULL, false,
  '["Work", "Home", "Family", "Friends"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM reminders WHERE type = 'digest_morning' AND fire_at > CURRENT_DATE);

INSERT INTO reminders (id, type, fire_at, message, related_entity_type, related_entity_id, fired, profile_ids)
SELECT
  gen_random_uuid(),
  'digest_evening',
  CURRENT_DATE + TIME '20:00',
  'Вечерний дайджест: что сделано за день, что осталось.',
  NULL, NULL, false,
  '["Work", "Home", "Family", "Friends"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM reminders WHERE type = 'digest_evening' AND fire_at > CURRENT_DATE);

INSERT INTO reminders (id, type, fire_at, message, related_entity_type, related_entity_id, fired, profile_ids)
VALUES (
  gen_random_uuid(),
  'task_due',
  CURRENT_DATE + INTERVAL '1 day' + TIME '08:00',
  'Напоминание: сегодня дедлайн по задаче "Согласовать бюджет с CEO"',
  'task', NULL, false,
  '["Work"]'::jsonb
);
SQL
```

---

## 6. Настройки темы (опционально)

```bash
curl -sf -X POST http://localhost:8080/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "theme", "value": "dark"}'

curl -sf -X POST http://localhost:8080/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "accent_color", "value": "#e7890d"}'
```

---

## Проверка

```bash
# Заметки
curl -s http://localhost:8080/api/notes | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Заметок: {len(d)}')"

# Задачи
curl -s http://localhost:8080/api/tasks | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Задач: {len(d)}')"

# Проекты
curl -s http://localhost:8080/api/projects | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Проектов: {len(d)}')"

# Календарь
curl -s http://localhost:8080/api/calendar | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Событий: {len(d)}')"

# Агент
curl -s http://localhost:8080/api/agent/inbox | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Сообщений агента: {len(d)}')"

# Аналитика
curl -s http://localhost:8080/api/analytics | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

## Сброс (если нужно перезалить)

```bash
docker compose down -v
docker compose up -d
```

`-v` удалит volume с БД — все данные сотрутся, контейнеры пересоздадутся чистыми.
