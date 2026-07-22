#!/usr/bin/env bash
# seed-full.sh — заполняет Personal OS тестовыми данными (все разделы).
# Запускать после `docker compose up -d`.
set -euo pipefail

BASE="http://localhost:8080/api"
echo "=== Seed: Personal OS full test data ==="

# ── 1. Проекты ──
echo "--- Creating projects..."
P1=$(curl -sf -X POST "$BASE/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ремонт в гостиной","desc_md":"Косметический ремонт: покраска стен, замена ламината, новая люстра.","profile_ids":["Home","Family"],"status":"active","goal":"Завершить ремонт до конца месяца"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  project 'Ремонт в гостиной' id=$P1"

P2=$(curl -sf -X POST "$BASE/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"Подготовка отчёта Q3","desc_md":"Собрать метрики, написать выводы, подготовить презентацию.","profile_ids":["Work"],"status":"active","goal":"Сдать отчёт до 15 числа"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  project 'Подготовка отчёта Q3' id=$P2"

P3=$(curl -sf -X POST "$BASE/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"Организация дня рождения","desc_md":"Подготовить праздник для друга: площадка, еда, музыка, гости.","profile_ids":["Friends"],"status":"active","goal":"Провести незабываемый вечер"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  project 'Организация дня рождения' id=$P3"

# ── 2. Заметки + Задачи (JSON-импорт) ──
echo "--- Importing notes and tasks..."

# Формируем JSON с подстановкой ID проектов
IMPORT_JSON=$(cat << JSONEOF | python3 -c "import sys,json; print(json.dumps({'source':'json','target':'notes','profile_ids':[],'content':json.loads(sys.stdin.read())}))"
[
  {"type":"note","title":"Идеи для воскресного обеда","body_md":"— Паста с креветками и рукколой\n— Цезарь с курицей\n— Чизкейк на десерт","tags":["еда","home","рецепты"],"profile_ids":["Home"]},
  {"type":"note","title":"Заметки по TypeScript 5.8","body_md":"## Новое в TS 5.8\n\n- using declarations\n- Улучшенный --isolatedDeclarations\n- const type parameters","tags":["typescript","dev","learning"],"profile_ids":["Work"]},
  {"type":"note","title":"Маршрут отпуска","body_md":"День 1: Прилёт\nДень 2: Экскурсия в горы\nДень 3: Пляж\nДень 4: Музей\nДень 5: Обратный вылет","tags":["travel","family","отпуск"],"profile_ids":["Family"]},
  {"type":"note","title":"Книги для прочтения","body_md":"- Чистый код (Роберт Мартин)\n- Совершенный код (Макконнелл)\n- Domain-Driven Design (Эванс)\n- System Design Interview (Сюй)","tags":["books","dev","reading"],"profile_ids":["Work"]},
  {"type":"note","title":"Плейлист для вечеринки","body_md":"1. Daft Punk — Get Lucky\n2. Pharrell Williams — Happy\n3. Mark Ronson — Uptown Funk\n4. Lizzo — Juice","tags":["music","fun","playlist"],"profile_ids":["Friends"]},
  {"type":"task","title":"Покрасить стены в гостиной","desc_md":"Купить краску (бежевый RAL 1013), валики, малярный скотч.","status":"in_progress","priority":"high","weight":5,"profile_ids":["Home","Family"],"project_id":null},
  {"type":"task","title":"Выбрать ламинат","desc_md":"Съездить в Леруа Мерлен, посмотреть образцы.","status":"todo","priority":"medium","weight":3,"due_date":"2026-08-01T12:00:00Z","profile_ids":["Home"],"project_id":null},
  {"type":"task","title":"Согласовать бюджет с CEO","desc_md":"Записаться на встречу, подготовить смету.","status":"backlog","priority":"high","weight":4,"due_date":"2026-07-28T10:00:00Z","assignee":"Иван Петров","profile_ids":["Work"],"project_id":null},
  {"type":"task","title":"Написать выводы к отчёту","desc_md":"Раздел Выводы и рекомендации — 2-3 страницы.","status":"todo","priority":"medium","weight":3,"due_date":"2026-08-10T18:00:00Z","profile_ids":["Work"],"project_id":"$P2"},
  {"type":"task","title":"Проверить почту","desc_md":"Ответить на письма от клиентов.","status":"done","priority":"low","weight":1,"profile_ids":["Work"]},
  {"type":"task","title":"Купить подарок на ДР","desc_md":"Бюджет 5000 руб. Идеи: книга, настольная игра, парфюм.","status":"backlog","priority":"medium","weight":2,"due_date":"2026-08-20T12:00:00Z","profile_ids":["Friends"]},
  {"type":"task","title":"Записаться к стоматологу","desc_md":"Профилактический осмотр.","status":"todo","priority":"medium","weight":2,"profile_ids":["Family"]},
  {"type":"task","title":"Установить полки в кладовке","desc_md":"Купить уголки и ДСП, отпилить, закрепить.","status":"backlog","priority":"low","weight":1,"profile_ids":["Home"]}
]
JSONEOF
)

RESULT=$(curl -sf -X POST "$BASE/import" \
  -H "Content-Type: application/json" \
  -d "$IMPORT_JSON")
echo "  import result: $RESULT"

# ── 3. Календарь ──
echo "--- Creating calendar events..."
curl -sf -X POST "$BASE/calendar" \
  -H "Content-Type: application/json" \
  -d '{"title":"Созвон по архитектуре","start":"2026-07-28T10:00:00Z","end":"2026-07-28T11:00:00Z","profile_ids":["Work"],"notes_md":"Обсудить план релиза.","location":"Google Meet"}' > /dev/null
echo "  event 1 done"

curl -sf -X POST "$BASE/calendar" \
  -H "Content-Type: application/json" \
  -d '{"title":"Семейный ужин","start":"2026-08-01T19:00:00Z","end":"2026-08-01T21:00:00Z","profile_ids":["Family"],"notes_md":"Раз в неделю собираемся всей семьёй.","location":"Дома"}' > /dev/null
echo "  event 2 done"

curl -sf -X POST "$BASE/calendar" \
  -H "Content-Type: application/json" \
  -d '{"title":"Футбол с друзьями","start":"2026-07-30T18:00:00Z","end":"2026-07-30T19:30:00Z","profile_ids":["Friends"],"notes_md":"Футбол по средам.","location":"Спорткомплекс"}' > /dev/null
echo "  event 3 done"

curl -sf -X POST "$BASE/calendar" \
  -H "Content-Type: application/json" \
  -d '{"title":"Выходные на даче","start":"2026-08-09T09:00:00Z","end":"2026-08-10T20:00:00Z","all_day":true,"profile_ids":["Family","Friends"],"notes_md":"Шашлыки, баня, настольные игры.","location":"Дача"}' > /dev/null
echo "  event 4 done"

curl -sf -X POST "$BASE/calendar" \
  -H "Content-Type: application/json" \
  -d '{"title":"Еженедельная синхронизация","start":"2026-07-29T15:00:00Z","end":"2026-07-29T15:30:00Z","profile_ids":["Work"],"notes_md":"Статус по задачам.","location":"Zoom","recurrence":{"freq":"weekly","interval":1,"until":"2026-12-31T23:59:00Z"}}' > /dev/null
echo "  event 5 done"

# ── 4. Агент ──
echo "--- Creating agent messages..."
PG_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
if [ -n "$PG_CONTAINER" ]; then
  docker exec -i "$PG_CONTAINER" psql -U postgres -d personalos <<'SQL'
INSERT INTO agent_messages (id, trigger_type, title, body, suggested_actions_json, resolved, profile_ids)
SELECT gen_random_uuid(), 'onboarding', '👋 Добро пожаловать в Personal OS!',
  E'Это демонстрационный экземпляр Personal OS.\n\n📝 Заметки — с Markdown, тегами\n📋 Канбан-доска — backlog → todo → in_progress → done\n📅 Календарь — события, ICS-экспорт\n📁 Проекты — группировка задач и заметок\n🔍 Поиск — семантический + текстовый\n🤖 Агент — дайджесты дня/недели\n🎨 Темы — тёмная/светлая\n👤 Профили — Work / Home / Family / Friends',
  '["profile","project","note","task","calendar","search","agent"]'::jsonb, false, '["Work","Home","Family","Friends"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM agent_messages WHERE trigger_type='onboarding')
LIMIT 1;

INSERT INTO agent_messages (id, trigger_type, title, body, suggested_actions_json, resolved, profile_ids)
SELECT gen_random_uuid(), 'reminder', '⏰ Не забудьте про созвон по архитектуре',
  'Завтра в 10:00 созвон с командой.',
  '[{"type":"create_note","label":"Записать вопросы","params":{}},{"type":"create_task","label":"Создать задачу","params":{}}]'::jsonb,
  false, '["Work"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM agent_messages WHERE trigger_type='reminder' AND profile_ids @> '["Work"]'::jsonb)
LIMIT 1;

INSERT INTO agent_messages (id, trigger_type, title, body, suggested_actions_json, resolved, profile_ids)
SELECT gen_random_uuid(), 'suggestion', '💡 Запланировать семейный ужин',
  'Давно не собирались все вместе.',
  '[{"type":"create_meeting","label":"Создать событие","params":{"title":"Семейный ужин","duration":120}},{"type":"create_task","label":"Создать задачу","params":{}}]'::jsonb,
  false, '["Family"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM agent_messages WHERE trigger_type='suggestion' AND profile_ids @> '["Family"]'::jsonb)
LIMIT 1;
SQL
  echo "  agent messages done"
else
  echo "  SKIP: postgres container not found"
fi

# ── 5. Настройки ──
echo "--- Settings..."
curl -sf -X POST "$BASE/settings" \
  -H "Content-Type: application/json" \
  -d '{"key":"theme","value":"dark"}' > /dev/null
curl -sf -X POST "$BASE/settings" \
  -H "Content-Type: application/json" \
  -d '{"key":"accent_color","value":"#e7890d"}' > /dev/null
echo "  settings done"

# ── Проверка ──
echo ""
echo "=== Verification ==="
echo -n "  Notes:    "; curl -s "$BASE/notes" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))"
echo -n "  Tasks:    "; curl -s "$BASE/tasks" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))"
echo -n "  Projects: "; curl -s "$BASE/projects" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))"
echo -n "  Events:   "; curl -s "$BASE/calendar" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))"
echo -n "  Agent:    "; curl -s "$BASE/agent/inbox" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))"

echo ""
echo "=== Seed complete ==="
