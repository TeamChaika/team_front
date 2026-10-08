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
| Форма документа и проверки данных | [DocumentEditor.tsx](../src/DocumentEditor.tsx), [documentModel.ts](../src/documentModel.ts); мобильный подбор — [MobileDocumentItems.tsx](../src/MobileDocumentItems.tsx) |
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

## Отдельная панель управления SaaS (08.10.2026)

- [saas-admin.html](../saas-admin.html) → [SaasAdminMain.tsx](../src/SaasAdminMain.tsx) → [SaasAdmin.tsx](../src/SaasAdmin.tsx): отдельная точка входа RestControl, реестр компаний, подписки и история выбранной компании. Рабочий dashboard через `index.html` не меняется.
- [SaasAdminForm.tsx](../src/SaasAdminForm.tsx): создание/изменение компании, контакта администратора, Chain/RMS, модулей и параметров подписки. Это регистрационные данные; DNS, аккаунты и подключения автоматически не создаются и не проверяются.
- [saasAdminApi.ts](../src/saasAdminApi.ts): исключительно `/api/saas-admin/auth/*`, `/companies`, `/companies/{id}`, `/companies/{id}/events`; cookie-сессия и CSRF в заголовке `X-CSRF-Token`. PATCH/архивация используют `expected_version`; архив сохраняет серверную историю.
- [saasAdminModel.ts](../src/saasAdminModel.ts), [saasAdmin.css](../src/saasAdmin.css): контракт, нормализация, вспомогательная валидация и изолированные стили. Служебные статусы регистрации отличаются от фактической работоспособности; статус подписки вычисляет сервер.
- Сборка `npm run build -- --mode saas-admin` → `dist-saas-admin/saas-admin.html`; Локальная проверка — только через backend `http://127.0.0.1:8210`, который раздаёт собранный frontend и API с одного origin. Vite dev/preview для полноценной сессии SaaS не поддерживаются: backend проверяет Host/Origin, SaaS API proxy отключён. Адрес отдельного production-сервиса — `https://rc.chaika.team`: API и статические файлы должны обслуживаться с одного origin. Этот код подготовлен к выпуску; успешный деплой подтверждается отдельно.
- [saasAdminModel.test.mjs](../tests/saasAdminModel.test.mjs): пустая регистрация, нормализация и проверки входных данных.

### Проверка соединений iiko в SaaS

- [SaasAdminConnection.tsx](../src/SaasAdminConnection.tsx): логин/пароль Chain и каждого RMS в редакторе, ручная проверка черновика, сохранённый статус с временем в карточке компании и повторная проверка сохранённого подключения.
- `connection_credentials` — write-only часть POST/PATCH компании (`chain` или UUID RMS → логин и необязательный пароль). Пустой пароль означает сохранить существующий только при прежнем адресе/логине; для нового или изменённого подключения нужен пароль. Пароль не возвращается API и не записывается в браузерное хранилище.
- GET `/companies/{id}/connections` возвращает адрес, логин, признак сохранённого пароля и результат проверки. POST `/connections/test` проверяет черновик; POST `/companies/{id}/connections/{connection_id}/test` — сохранённое подключение с `expected_version`. Возвращённая версия обновляет карточку перед последующим редактированием.
- Проверка запускается только кнопкой, подтверждает соединение/авторизацию, не гарантирует доступ к модулям. Изменение адреса/логина/пароля отменяет проверку и её старый результат. Во время проверки сохранение блокируется. После сохранения черновика серверный статус подключения снова «Не проверено» до отдельной проверки карточки.

### Доступ администратора компании (08.10.2026)

- [SaasAdminAccess.tsx](../src/SaasAdminAccess.tsx): отдельная секция карточки «Доступ администратора». GET `/companies/{id}/admin-access`, явный POST создания по сохранённому контакту, POST `/reset` с подтверждением завершения прежних сеансов. Обе записи используют `expected_version`, новая версия обновляет карточку/историю; сохранение контакта само по себе аккаунт не создаёт.
- Временный пароль возвращается только после создания/сброса, показывается в закрываемом диалоге вместе с логином, ссылкой входа и копированием. Он хранится только в состоянии компонента; закрытие диалога, смена компании и выход уничтожают это состояние. В браузерные хранилища пароль не записывается. Срок 72 часа, при первом входе обязательна смена.
- [SaasAdminMain.tsx](../src/SaasAdminMain.tsx) выбирает отдельный [SaasTenant.tsx](../src/SaasTenant.tsx) для `/tenant/{slug}`. Ссылка владельца открывает вход в новой вкладке на текущем origin сервиса; зарегистрированный удалённый домен не считается готовым tenant-сервисом.
- [saasTenantApi.ts](../src/saasTenantApi.ts): только `/api/saas-tenant/{slug}/auth/{login,me,password,logout}` и `/workspace`, свой CSRF и отдельная серверная cookie. API владельца для tenant-входа не вызывается. `must_change_password` допускает только смену пароля или выход; постоянный пароль от 8 символов, с подтверждением. Workspace получает только имя/идентификатор своей компании и выбранные модули, показывает ожидающее подключение данных. Production dashboard и учебные бизнес-данные не подключаются.
- [saasTenant.test.mjs](../tests/saasTenant.test.mjs): границы маршрута, пароль, отдельные slug/CSRF, сохранение запрета обязательной смены. Проверки: `npm test`, `npm run build -- --mode saas-admin`; серверная изоляция и реальные cookie проверяются отдельно в backend.
- Восстановление после потерянного ответа создания/сброса: `loadAdminAccessSnapshot` читает метаданные доступа и при расхождении версии — полную актуальную компанию. Повторная запись автоматически не выполняется; следующий сброс требует отдельного подтверждения. Пока версии доступа и карточки не совпадают, создание/сброс блокируются. Это также обновляет slug, контакт и статус после параллельного редактирования.
- Tenant CSRF обновляется только последним начатым запросом сессии; запоздавший `/auth/me` не подменяет токен после смены пароля. Logout с истёкшей сессией (401) очищает состояние входа и CSRF. Регрессии проверяются в тестах потерянного ответа, движущейся версии, запоздавшего me и истёкшего logout.

- Production SaaS: адрес входа компании формируется из текущего `window.location.origin` и `/tenant/{slug}`, поэтому локальная проверка и `https://rc.chaika.team` используют одну сборку. Все запросы остаются относительными `/api/saas-admin/*` и `/api/saas-tenant/{slug}/*`; API зарегистрированных доменов компаний не вызывается. Workspace возвращает `mode: "local" | "production"`, `business_modules_ready: false` и прежние `company`/`admin`. Значение production подтверждает среду сервиса, но не готовность аналитики, документов или других бизнес-модулей: интерфейс сохраняет состояние ожидающего подключения.
