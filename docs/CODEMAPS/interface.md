# Интерфейс и маршруты

Срез: 2026-10-03, `547b503580ddde131e47ba655ce3087d9fb0fa5f`. Назад к [общей карте](../PROJECT_MAP.md).

| URL или задача | Компонент и источник |
| --- | --- |
| `/`, обзор | [Overview.tsx](../../src/Overview.tsx), [OverviewCards.tsx](../../src/OverviewCards.tsx); `GET /overview`, `GET /purchase-prices` |
| `/indicators` | [Indicators.tsx](../../src/Indicators.tsx), [indicatorPeriods.ts](../../src/indicatorPeriods.ts); `GET /indicators/filters`, `POST /indicators/metric/:key` |
| `/sales?kind=...` | `SalesPage` в [pages.tsx](../../src/pages.tsx); `GET /sales/:kind` |
| `/cash-shifts`, `/invoices`, `/outgoing`, `/products`, `/charts`, `/employees`, `/events` | `ResourcePage` в [pages.tsx](../../src/pages.tsx); `GET /resources/:resource` |
| `/:resource/:id` | `DetailPage` в [pages.tsx](../../src/pages.tsx); `GET /resources/:resource/:id` |
| `/events/topology` | `TopologyPage` в [pages.tsx](../../src/pages.tsx); `GET /topology` |
| `/balances` | [BalancesPage.tsx](../../src/BalancesPage.tsx), [BalanceSearch.tsx](../../src/BalanceSearch.tsx); `GET /resources/balances` |
| `/status` | `StatusPage` в [pages.tsx](../../src/pages.tsx); `GET /status` |
| `/profile` | [ProfilePage.tsx](../../src/ProfilePage.tsx), [PasswordForm.tsx](../../src/PasswordForm.tsx); `POST /profile/password`, `GET /profile/telegram`, `POST /profile/telegram/link`, `POST /profile/telegram/unlink` |
| `/forgot-password`, `/reset-password` | [PasswordRecovery.tsx](../../src/PasswordRecovery.tsx); публичные маршруты до загрузки `/me`, `GET /auth/recovery/telegram`, `POST /auth/recovery/reset` |
| `/transfers`, `/writeoffs` | Если `meta.documents_enabled` — [заявки](documents.md); `?view=analytics` возвращает `ResourcePage` |

- [App.tsx](../../src/App.tsx) содержит `sections`, `<Routes>`, боковое меню и `WorkspaceContext` с заведениями и датами. `meta.sections` ограничивает разделы, `meta.can_manage` — `/management`; `/profile` доступен всем вошедшим независимо от рабочих разделов. Недоступный рабочий маршрут перенаправляется в первый доступный раздел.
- Восстановление доступно только через ранее привязанный Telegram. Одноразовый токен `/reset-password#token=…` сохраняется только в памяти компонента, fragment сразу удаляется при открытии и смене ссылки; GET не меняет пароль. POST требует пароль 8–128 символов, без старого пароля; успех возвращает к обычному входу. Неопределённый результат не повторяется автоматически; 422/429 допускают повтор. Нет сохранения токена или пароля в localStorage/sessionStorage.
- Если `GET /me` возвращает `user.password_change_required=true`, `App` показывает только экран смены временного пароля и выхода, без рабочего контекста, маршрутов и Telegram. То же ограничение включается после специального `403`, входа, обновления сессии или сигнала другой вкладки; снятие подтверждается новым `GET /me` после `POST /profile/password`. При возвращении к открытой вкладке `/me` перепроверяется с ограничением частоты.
- Глобальные даты используются обзором, продажами, сменами, накладными, перемещениями, списаниями и событиями. Показатели рассчитывают свой период; закупочные цены не используют общий диапазон дат.
- [Overview.tsx](../../src/Overview.tsx) объединяет KPI, тренд и блюда; [OverviewCards.tsx](../../src/OverviewCards.tsx) — уведомления и лидеры изменения цен. [LiveDataNotice.tsx](../../src/LiveDataNotice.tsx) и [PartialDayNotice.tsx](../../src/PartialDayNotice.tsx) отмечают источник и неполные дни.
- [Indicators.tsx](../../src/Indicators.tsx) загружает карточки независимо, повторяет ответ `loading` по `retry_after`; порядок и скрытие карточек хранит в `localStorage` по `meta.user.id`. Логика календарных сравнений — в [indicatorPeriods.ts](../../src/indicatorPeriods.ts).
- [pages.tsx](../../src/pages.tsx) также содержит `DataTable`, `ExportButton`, KPI продаж и часовую диаграмму. [DiscountDrilldown.tsx](../../src/DiscountDrilldown.tsx) связывает скидки с событиями заказа.
- Сотрудники iiko: список/деталь находятся в `pages.tsx`, форма и ожидание изменений — в [EmployeeEditor.tsx](../../src/EmployeeEditor.tsx); пути `/employees/options`, `/employees/:id/edit`, `/employees`, `/employees/:id`, `/employees/pending`, `/employees/changes/:id/refresh`.
- Мобильное меню открывает `App` и закрывает при смене URL. Общая оболочка и адаптивные правила — [styles.css](../../src/styles.css); экраны — [overview.css](../../src/overview.css), [indicators.css](../../src/indicators.css), [documents.css](../../src/documents.css), [deposits.css](../../src/deposits.css), [purchase-prices.css](../../src/purchase-prices.css), [purchase-assistant.css](../../src/purchase-assistant.css).
