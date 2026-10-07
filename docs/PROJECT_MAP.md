# Карта frontend Chaika Team

Срез исходников: **2026-10-03**, commit `547b503580ddde131e47ba655ce3087d9fb0fa5f`. Это навигация по frontend; серверные контракты и состояние публикации здесь не проверяются. API-пути в тематических картах относительны к базе из [api.ts](../src/api.ts).

## Где искать

| Задача | Начать с |
| --- | --- |
| Маршруты, меню, доступ к разделам, сессия | [App.tsx](../src/App.tsx), [interface.md](CODEMAPS/interface.md) |
| Личный кабинет, пароль и Telegram | [ProfilePage.tsx](../src/ProfilePage.tsx), [PasswordForm.tsx](../src/PasswordForm.tsx), [App.tsx](../src/App.tsx), [api.ts](../src/api.ts) |
| Забытый пароль через Telegram | [PasswordRecovery.tsx](../src/PasswordRecovery.tsx), [passwordRecoveryRules.ts](../src/passwordRecoveryRules.ts); публичные `/forgot-password`, `/reset-password`, API `/auth/recovery/*` |
| Общие фильтры заведений и дат | [App.tsx](../src/App.tsx), [RestaurantPicker.tsx](../src/RestaurantPicker.tsx) |
| Обзор и карточки | [Overview.tsx](../src/Overview.tsx), [interface.md](CODEMAPS/interface.md) |
| Показатели и периоды сравнения | [Indicators.tsx](../src/Indicators.tsx), [indicatorPeriods.ts](../src/indicatorPeriods.ts) |
| Ручной запуск синхронизации | [ScheduledSync.tsx](../src/ScheduledSync.tsx), [scheduledSyncModel.ts](../src/scheduledSyncModel.ts); `GET /status`, `POST /status/sync/{job}/run` |
| Продажи, ресурсы, детали, статус данных | [pages.tsx](../src/pages.tsx), [interface.md](CODEMAPS/interface.md) |
| Приходные накладные, реализация и счёт PDF | [CommercialInvoices.tsx](../src/CommercialInvoices.tsx), [commercialInvoiceModel.ts](../src/commercialInvoiceModel.ts); `/invoices`, `/outgoing`, [контракт](CODEMAPS/documents.md#приходные-накладные-и-реализация) |
| Перемещения/списания: заявки, согласование | [DocumentsPage.tsx](../src/DocumentsPage.tsx), [documents.md](CODEMAPS/documents.md) |
| Форма документа и проверки данных | [DocumentEditor.tsx](../src/DocumentEditor.tsx), [documentModel.ts](../src/documentModel.ts) |
| Оценка стоимости списания | [WriteoffCosts.tsx](../src/WriteoffCosts.tsx), [writeoffCostModel.ts](../src/writeoffCostModel.ts); сумма после создания заявки |
| Кеш карточек документов и обновление | [DocumentData.tsx](../src/DocumentData.tsx), [documentCache.ts](../src/documentCache.ts) |
| Права на документы | [DocumentAccess.tsx](../src/DocumentAccess.tsx), [CommercialInvoiceAccess.tsx](../src/CommercialInvoiceAccess.tsx), [documents.md](CODEMAPS/documents.md) |
| Создание контрагентов в iiko и восстановление операции | [CommercialCounterpartyCreate.tsx](../src/CommercialCounterpartyCreate.tsx), [commercialCounterpartyModel.ts](../src/commercialCounterpartyModel.ts), [CounterpartyPermission.tsx](../src/CounterpartyPermission.tsx); [контракт](CODEMAPS/documents.md#создание-контрагентов-в-iiko) |
| Ограничение всех данных выбранными складами | [ManagementPage.tsx](../src/ManagementPage.tsx), [App.tsx](../src/App.tsx), [api.ts](../src/api.ts); [границы](CODEMAPS/interface.md#ограничение-по-складам) |
| Закупочные цены, недельное влияние | [PurchasePrices.tsx](../src/PurchasePrices.tsx), [PurchaseImpact.tsx](../src/PurchaseImpact.tsx) |
| Помощник и его источники | [PurchaseAssistant.tsx](../src/PurchaseAssistant.tsx), [integrations.md](CODEMAPS/integrations.md) |
| Остатки и поиск товара | [BalancesPage.tsx](../src/BalancesPage.tsx), [BalanceSearch.tsx](../src/BalanceSearch.tsx) |
| Сотрудники iiko | [EmployeeEditor.tsx](../src/EmployeeEditor.tsx), [interface.md](CODEMAPS/interface.md) |
| Депозиты и создание | [DepositsPage.tsx](../src/DepositsPage.tsx), [CreateDeposit.tsx](../src/CreateDeposit.tsx) |
| Аккаунты dashboard, заведения, терминалы | [ManagementPage.tsx](../src/ManagementPage.tsx), [integrations.md](CODEMAPS/integrations.md) |
| Мобильный UI и стили | [styles.css](../src/styles.css), [interface.md](CODEMAPS/interface.md) |
| Сборка и проверки | [package.json](../package.json), [integrations.md](CODEMAPS/integrations.md) |
| Сжатие JS/CSS, кеш браузера, SPA fallback в Timeweb | [static-delivery.md](static-delivery.md), [timeweb-reverse-proxy.json](../ops/timeweb-reverse-proxy.json); настройки приложения `254029`, не `ops/Caddyfile` |

## Точки входа и границы

- [index.html](../index.html) → [main.tsx](../src/main.tsx) (React, Mantine, Router) → [App.tsx](../src/App.tsx) (сессия, контекст рабочего пространства, маршруты).
- [api.ts](../src/api.ts) — общий клиент запросов и обновление cookie-сессии; [useData.ts](../src/useData.ts) — обычная загрузка GET. Документы используют отдельный кеш, описанный в [documents.md](CODEMAPS/documents.md).
- При `meta.user.password_change_required` [App.tsx](../src/App.tsx) показывает только отдельную форму [PasswordForm.tsx](../src/PasswordForm.tsx). [passwordChangeFlow.ts](../src/passwordChangeFlow.ts) предотвращает повторный `POST` после успешного сохранения при ошибке проверки; [foregroundPasswordCheck.ts](../src/foregroundPasswordCheck.ts) отбрасывает устаревшую фоновую проверку. `api.ts` распознаёт `403 detail.code=password_change_required`, уведомляет другие вкладки и не обновляет сессию по такому ответу. Рабочие маршруты открываются лишь после нового `GET /me` с ложным признаком.
- [interface.md](CODEMAPS/interface.md) — маршруты, обзор, показатели, продажи, ресурсы, стили; [integrations.md](CODEMAPS/integrations.md) — закупки, помощник, депозиты, управление, тесты.
- Начните с строки нужной задачи в таблице, затем откройте тематическую карту; кода в ней достаточно для выбора первого файла.
- Разделы «Сотрудники iiko» и «Управление аккаунтами dashboard» имеют разные модели и API. При `meta.documents_enabled` перемещения и списания переключаются с аналитики iiko на заявки с отдельной вкладкой аналитики.
- Связи между frontend и backend приведены по реально вызываемым URL, без предположений о внутренней реализации сервера.
- Права, расчёты, статус синхронизации и фактический деплой подтверждаются в backend/операционной документации. Эта карта фиксирует только вызовы и переходы, видимые в frontend.

Дополнение 07.10.2026: складская область доступа и создание контрагентов реализованы в локальной release-копии `.local/commercial-release/frontend`; это описание исходников, подтверждение production-деплоя ещё требуется.
