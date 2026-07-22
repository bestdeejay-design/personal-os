# Plan: Projects Feature

## Goal

Сделать Проекты центральной организующей сущностью Personal OS: экран проектов, привязка всех entity к проектам, кнопка «записать итог встречи».

## Что уже есть (не надо создавать)

- `projects` таблица в БД (id, name, desc_md, profile_ids, status, goal, created_at)
- `notes.linked_project_id`, `tasks.project_id`, `meetings.linked_project_id`
- `file_meta.owner_type` / `owner_id` (поддерживает `'project'`)
- Backend: `GET /api/projects`, `POST /api/projects`
- Frontend: `Project` type, `getProjects()`, `createProject()` в api.ts
- Calendar.tsx и Kanban.tsx уже показывают `<select>` с проектами в формах

## Что нужно сделать (слайсы)

### Слайс A — Backend (Projects)

1. **PATCH /api/projects/:id** — обновление проекта (name, desc_md, profile_ids, status, goal)
2. **DELETE /api/projects/:id** — удаление проекта
3. **GET /api/projects/:id/items** — возвращает все связанные с проектом entity:
   - notes (WHERE linked_project_id = $1)
   - tasks (WHERE project_id = $1)
   - meetings (WHERE linked_project_id = $1)
   - files (WHERE owner_type = 'project' AND owner_id = $1)

### Слайс B — Frontend: Projects view

1. **Projects.tsx** — новая вьюха `/src/views/Projects.tsx`:
   - Список проектов (карточки: имя, описание, профили, статус, счётчики связанных entity)
   - Кнопка «Создать проект» → модалка (name, desc_md, profile_ids, status, goal)
   - Клик по проекту → раскрывает деталь: список связанных заметок/задач/встреч/файлов
   - Редактирование проекта (карандаш на карточке)
   - Удаление проекта (с подтверждением)
2. **App.tsx**: добавить `"projects"` в ViewKey, NAV_GROUPS, import Projects вьюхи
3. **Projects.css** — стили для карточек проектов

### Слайс C — Frontend: project selector в формах

1. **Notes.tsx** (openEdit/openCreate): добавить `<select>` с проектами (+ none)
2. **Calendar.tsx**: уже есть project selector (linked_project_id) — унифицировать стиль
3. **Kanban.tsx**: уже есть project selector (project_id) — унифицировать стиль
4. **Files.tsx**: при загрузке файла дать выбор проекта (owner_type = 'project')
5. **ProfileChips / NoteItem / TaskCard**: показать project badge если есть linked_project_id

### Слайс D — «Записать итог встречи»

1. В Calendar.tsx EventList: кнопка «Записать итог» после окончания встречи
2. Создаёт новую заметку с:
   - title = `"Итог: {meeting.title}"`
   - body_md = пусто (пользователь заполнит)
   - linked_meeting_id = meeting.id
   - linked_project_id = meeting.linked_project_id (наследуется от встречи)
   - profile_ids = meeting.profile_ids (наследуются)
3. После создания — открывает NoteItem в режиме редактирования (или перебрасывает на Notes)
4. Сама заметка отображается в Calendar как связанная (если есть body_md — показать превью)

### Слайс E — Деталь проекта / Project Dashboard

1. Страница проекта (отдельный роут или модалка):
   - Шапка: name, desc_md, goal, profile_ids, статус
   - Вкладки: Заметки | Задачи | Встречи | Файлы
   - Каждая вкладка — список соответствующих entity, отфильтрованных по project_id
   - Возможность создать новый entity сразу в контексте проекта

## Скоуп и приоритет

| Слайс | Приоритет | Зависит от | Примерный объём |
|-------|-----------|-----------|-----------------|
| A (Backend) | P0 | — | 2 файла, ~60 строк |
| B (Projects view) | P0 | A | 2-3 файла, ~250 строк |
| C (Project selector) | P1 | — | 3-4 файла, ~100 строк |
| D (Meeting → Note) | P1 | C (т.к. наследует project_id) | 1 файл, ~40 строк |
| E (Project dashboard) | P2 | A+B | 2 файла, ~200 строк |

## Ambiguities / assumptions

1. Projects view открывается как обычная вьюха (в NAV_GROUPS), не отдельный роут
2. Проекты НЕ заменяют профили — они ортогональны: профили = контекст, проекты = единица работы
3. Фильтрация: profile AND project (пересечение), не OR
4. Meeting→Note: кнопка появляется только для прошедших встреч (start < now)
5. Удаление проекта: не каскадное (entity остаются, project_id/ linked_project_id сбрасывается в null)
6. Статус проекта: free-text поле (как в задаче), не enum
