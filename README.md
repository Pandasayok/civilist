# Перенос на GitHub

Это сохранённые исходники версии для Sites. Конфигурация самостоятельного запуска на Cloudflare Workers и D1 готовится следующим изменением.

# Civilist 0.1

Personal Russian-law study app. The initial source of content is `content/seed.json`; data is seeded idempotently into D1 after schema migrations. Admin edits thereafter are authoritative and are never replaced by seed updates.

User identity comes from Sites dispatch and ChatGPT sign-in. Progress is keyed by the stable site-scoped user ID. The administrator is allowlisted server-side by `CIVILIST_ADMIN_EMAIL`. All writes validate identity, content, and supplied Origin. Event IDs make retried learning submissions idempotent. XP is calculated server-side and capped per material/day or first completion. Free-text answers are stored for self-assessment and excluded from automatic accuracy.

## Weekly practice preparation

This Site stays private. The draft-only `/api/editorial` service endpoint relies on that private platform boundary; disable `CIVILIST_PRIVATE_EDITORIAL_WRITER` before making the Site public. It never publishes material or modifies learner progress.

Each unattended run reopens the same Site with Sites `get_site`, checks owner role and private/custom owner-only access, and obtains its current service token in memory. It reads public primary sources on `vsrf.ru` and `pravo.gov.ru`. It reads existing material via `GET /api/editorial`, then sends `POST /api/editorial` with `{entries:[...]}` and `OAI-Sites-Authorization: Bearer <token>`. No token is stored in this repository or schedule instructions. Read back via the same GET to verify drafts; duplicate source URLs are skipped.

Each entry: `id`, `title`, `category` (`Обзоры`, `Пленумы`, `Дела`), `date` (`YYYY-MM-DD`, actual document date), `number`, `summary`, `decision`, `importance`, `norms`, `source` (`label`, `url`, `checkedAt`). Use canonical official document links. Read the full act before summarizing its legal conclusion; if inaccessible, omit the material. Keep distinctions between judgment, oral hearing, and press notice. If there is no relevant new material, report that rather than inventing a weekly item. The owner reviews and publishes drafts in the admin interface.

Preparation is scheduled weekly in Europe/Moscow. The linked schedule contains this complete workflow and does not rely on local files. Manual admin entry remains available.

## Content boundary

Starter lessons are concise summaries, not a complete law course. Judicial records distinguish summaries from indexes and hearing recordings. Hypothetical case outcomes are educational rather than predictions. Templates contain explicit placeholders, checks, and document-specific limits. Dates shown are source-review dates, not a guarantee that law remains unchanged.
