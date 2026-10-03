# Закупки, помощник, депозиты и сборка

Срез: 2026-10-03, `547b503580ddde131e47ba655ce3087d9fb0fa5f`. Назад к [общей карте](../PROJECT_MAP.md).

| Задача | Файл и API |
| --- | --- |
| Цены, фильтры, история | [PurchasePrices.tsx](../../src/PurchasePrices.tsx): `GET /purchase-prices`, `GET /purchase-prices/history` |
| Недельное влияние цены на блюда | [PurchaseImpact.tsx](../../src/PurchaseImpact.tsx): `GET /purchase-prices/impact` |
| История помощника и вопросы | [PurchaseAssistant.tsx](../../src/PurchaseAssistant.tsx): `/assistant/status`, `/assistant/conversations`, `/assistant/conversations/:id`, `POST /assistant/messages` |
| Панель помощника и источники | [AssistantContext.tsx](../../src/AssistantContext.tsx), [AssistantRail.tsx](../../src/AssistantRail.tsx) |
| Список, карточка и Excel депозитов | [DepositsPage.tsx](../../src/DepositsPage.tsx): `/deposits`, `/deposits/:id`, `/deposits/venues`, `/deposits/creation-venues`, `/deposits/permissions`, `/deposits/export` |
| Создание депозита | [CreateDeposit.tsx](../../src/CreateDeposit.tsx): `POST /deposits`; [depositDates.ts](../../src/depositDates.ts) — дата по времени Крыма |
| Аккаунты, заведения, терминалы | [ManagementPage.tsx](../../src/ManagementPage.tsx): `/management/accounts`, `/management/venues`, пути сохранения вложенных сущностей |

- [PurchasePrices.tsx](../../src/PurchasePrices.tsx) сначала получает цены, затем `include_impact=true` для недельных оценок. [PurchaseImpact.tsx](../../src/PurchaseImpact.tsx) отдельно показывает покрытие продаж, исключения, блюда и источники; выбор заведения для оценки отличается от общей области цен по сети.
- [AssistantContext.tsx](../../src/AssistantContext.tsx) хранит состояние открытия и товарный контекст; [AssistantRail.tsx](../../src/AssistantRail.tsx) загружает источник через `/purchase-prices/history`, затем открывает `PurchaseImpact`. [PurchaseModal.tsx](../../src/PurchaseModal.tsx) — общая оболочка окон закупок.
- [PurchaseAssistant.tsx](../../src/PurchaseAssistant.tsx) отправляет вопрос с `request_id`, `conversation_id` и контекстом товара/фильтров. Панель доступна при праве на `purchase-prices`, кроме страниц депозитов и управления.
- [CreateDeposit.tsx](../../src/CreateDeposit.tsx) сохраняет `request_id` при повторе неопределённой отправки. Экспорт в [DepositsPage.tsx](../../src/DepositsPage.tsx) идёт через `apiBlob()`; права на создание и просмотр приходят отдельно.
- После сохранения в [ManagementPage.tsx](../../src/ManagementPage.tsx) [App.tsx](../../src/App.tsx) обновляет `/me`. Управление аккаунтами dashboard не совпадает со справочником сотрудников iiko.
- [api.ts](../../src/api.ts) задаёт базу `/api` по умолчанию, cookie-запросы, `POST /auth/refresh` при `401`, `ApiError`, `apiBlob` и `apiCsv`. [useData.ts](../../src/useData.ts) — обычная загрузка; кеш заявок описан в [documents.md](documents.md).
- [package.json](../../package.json): `npm run test` — Node test runner, `npm run build` — `tsc && vite build`. [vite.config.ts](../../vite.config.ts) проксирует локальный `/api` на порт `8013`.
- Тесты периодов: [indicator-periods.test.mjs](../../tests/indicator-periods.test.mjs); даты брони: [deposit-dates.test.mjs](../../tests/deposit-dates.test.mjs). Серверные расчёты, права и текущий деплой подтверждать в backend/операционной документации.
