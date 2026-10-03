# Заявки, согласование и кеш

Срез: 2026-10-03, `547b503580ddde131e47ba655ce3087d9fb0fa5f`. Назад к [общей карте](../PROJECT_MAP.md).

- [App.tsx](../../src/App.tsx) при `meta.documents_enabled` направляет `/transfers/*` в `waybill`, `/writeoffs/*` в `writeoff`. Деталь заявки: `/:resource/documents/:documentId`; аналитика iiko доступна как `?view=analytics`.
- [DocumentsPage.tsx](../../src/DocumentsPage.tsx) управляет вкладками, фильтрами, пагинацией, созданием и карточкой. Вызывает `GET /documents/:kind/options`, `GET /documents/:kind?...&page=`, `GET /documents/:kind/export`, `GET /documents/:kind/:id`.
- Начальный список — статус `Created`; для `waybill` направление `incoming`. `DocumentListItem` в [DocumentListItem.tsx](../../src/DocumentListItem.tsx) предварительно загружает карточку по наведению, фокусу и касанию.
- В карточке кнопки берутся из серверного `doc.actions`. `confirm`, `deny`, `cancel` отправляют `POST /documents/:kind/:id/:action` с `version` и `request_id`. После действия список и карточка инвалидируются; если строка больше не подходит `Created`, она удаляется сразу. Состояния `queued` и `sending` опрашиваются каждые 5 секунд.
- [DocumentEditor.tsx](../../src/DocumentEditor.tsx) создаёт/редактирует/копирует через `POST /documents/:kind` или `POST /documents/:kind/:id/:mode`; товар ищет через `GET /documents/:kind/products`. При неопределённой отправке сохраняет подготовленный запрос для повтора с тем же `request_id`.
- [documentModel.ts](../../src/documentModel.ts) содержит типы, подписи статусов и `documentPayload()`: обязательный склад, отличный получатель или причина списания, допустимые позиции и количество. Статус `sent` означает принятие iiko, а не подтверждённое проведение.
- [DocumentPanel.tsx](../../src/DocumentPanel.tsx) — боковая панель от `64em`, полноэкранная модалка ниже; здесь фокус, Escape и запрет закрытия при отправке.
- [DocumentData.tsx](../../src/DocumentData.tsx) создаёт отдельный кеш на `meta.user.id`. [documentCache.ts](../../src/documentCache.ts) хранит данные по API-пути, объединяет одновременные запросы, ограничивает prefetch двумя, защищает от старого ответа через revision. `401/403/404` удаляют приватный снимок; logout уничтожает кеш.
- [DocumentAccess.tsx](../../src/DocumentAccess.tsx) — права рабочих профилей `view/create/approve` по складам и привязка к аккаунту dashboard: `GET /documents/admin/staff`, `POST /documents/admin/staff/:id` с `revision`. Вкладка подключена в [ManagementPage.tsx](../../src/ManagementPage.tsx) при `documentsEnabled`.
- Проверки: [documents.test.mjs](../../tests/documents.test.mjs) — полезная нагрузка/статусы; [documentCache.test.mjs](../../tests/documentCache.test.mjs) — предварительная загрузка, гонки, потеря доступа, удаление из списка.
