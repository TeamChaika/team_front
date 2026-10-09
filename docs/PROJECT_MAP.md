# Карта frontend Chaika Team

Срез исходников: **2026-10-03**, commit `547b503580ddde131e47ba655ce3087d9fb0fa5f`. Это навигация по frontend; серверные контракты и состояние публикации здесь не проверяются. API-пути в тематических картах относительны к базе из [api.ts](../src/api.ts).

## Где искать

| Задача | Начать с |
| --- | --- |
| Маршруты, меню, доступ к разделам, сессия | [App.tsx](../src/App.tsx), [interface.md](CODEMAPS/interface.md) |
| Личный кабинет, пароль и Telegram | [ProfilePage.tsx](../src/ProfilePage.tsx), [PasswordForm.tsx](../src/PasswordForm.tsx), [App.tsx](../src/App.tsx), [api.ts](../src/api.ts) |
| Tenant: восстановление до входа | `main.tsx`, `TenantPasswordRecovery.tsx`, `tenantRecoveryRequest.ts`; только точные `/forgot-password` и `/reset-password` после company context + full readiness, свои API/бот, запросы без cookies, бренд компании |
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
- [SaasCompanyModuleSettings.tsx](../src/SaasCompanyModuleSettings.tsx): настройки собственного продавца, Telegram-бота и ИИ в карточке компании. Owner-only GET/PATCH `/companies/{id}/module-settings`, оптимистичная версия; секреты вводятся для замены, пустое поле сохраняет прежний секрет, отдельная команда удаляет его. Ключи не возвращаются и не сохраняются браузером; смена провайдера удаляет старый ключ. Сохранение требует повторной проверки запуска компании.
- Временный пароль возвращается только после создания/сброса, показывается в закрываемом диалоге вместе с логином, ссылкой входа и копированием. Он хранится только в состоянии компонента; закрытие диалога, смена компании и выход уничтожают это состояние. В браузерные хранилища пароль не записывается. Срок 72 часа, при первом входе обязательна смена.
- [SaasAdminMain.tsx](../src/SaasAdminMain.tsx) выбирает отдельный [SaasTenant.tsx](../src/SaasTenant.tsx) для `/tenant/{slug}`. Ссылка владельца открывает вход в новой вкладке на текущем origin сервиса; зарегистрированный удалённый домен не считается готовым tenant-сервисом.
- [saasTenantApi.ts](../src/saasTenantApi.ts): только `/api/saas-tenant/{slug}/auth/{login,me,password,logout}` и `/workspace`, свой CSRF и отдельная серверная cookie. API владельца для tenant-входа не вызывается. `must_change_password` допускает только смену пароля или выход; постоянный пароль от 8 символов, с подтверждением. Workspace получает только имя/идентификатор своей компании и выбранные модули, показывает ожидающее подключение данных. Production dashboard и учебные бизнес-данные не подключаются.
- [saasTenant.test.mjs](../tests/saasTenant.test.mjs): границы маршрута, пароль, отдельные slug/CSRF, сохранение запрета обязательной смены. Проверки: `npm test`, `npm run build -- --mode saas-admin`; серверная изоляция и реальные cookie проверяются отдельно в backend.
- Восстановление после потерянного ответа создания/сброса: `loadAdminAccessSnapshot` читает метаданные доступа и при расхождении версии — полную актуальную компанию. Повторная запись автоматически не выполняется; следующий сброс требует отдельного подтверждения. Пока версии доступа и карточки не совпадают, создание/сброс блокируются. Это также обновляет slug, контакт и статус после параллельного редактирования.
- Tenant CSRF обновляется только последним начатым запросом сессии; запоздавший `/auth/me` не подменяет токен после смены пароля. Logout с истёкшей сессией (401) очищает состояние входа и CSRF. Регрессии проверяются в тестах потерянного ответа, движущейся версии, запоздавшего me и истёкшего logout.

- Production SaaS: адрес входа компании формируется из текущего `window.location.origin` и `/tenant/{slug}`, поэтому локальная проверка и `https://rc.chaika.team` используют одну сборку. Все запросы остаются относительными `/api/saas-admin/*` и `/api/saas-tenant/{slug}/*`; API зарегистрированных доменов компаний не вызывается. Workspace возвращает `mode: "local" | "production"`, `business_modules_ready: false` и прежние `company`/`admin`. Значение production подтверждает среду сервиса, но не готовность аналитики, документов или других бизнес-модулей: интерфейс сохраняет состояние ожидающего подключения.

### Домен компании и единая учётная запись (08.10.2026, локальная подготовка)

- `SaasAdminMain.tsx` сначала один раз получает относительный `GET /api/saas-context`: `{surface: "platform" | "tenant", company: null | {id, slug, name}}`. Компания определяется сервером по проверенному Host и реестру, не по произвольному slug браузера. Ошибка или некорректный ответ закрывают вход без перехода в owner-panel.
- На служебном origin `surface=platform` сохраняются панель владельца и `/tenant/{slug}`. На клиентском origin `surface=tenant` корень и путь своей компании открывают `SaasTenant`; чужие slug и служебные пути закрыты. Сервер дополнительно проверяет домен/компанию каждого запроса. Опубликованный обычный dashboard не является этим tenant-входом; его API `xx.chaika.team` сюда не подключается.
- `SaasTenant.tsx` показывает имя компании из context до входа, email служит логином единой учётной записи. `saasTenantApi.ts` сохраняет относительные запросы, отдельную cookie-сессию компании, CSRF и обязательную смену временного пароля. Проверка Supabase Auth выполняется backend; ключи и пароли не хранятся frontend.
- `SaasAdminAccess.tsx` принимает `existing_account: true, temporary_password: null`: подключение компании к существующей учётной записи показывает инструкцию использовать прежний пароль, без выдуманного временного пароля и срока его действия. Статус `activation_required` означает требуемую активацию. Бизнес-модули остаются ожидающими подключения до отдельного серверного контракта и проверки изоляции данных.
- `tests/saasTenant.test.mjs` проверяет разрешение домена, отказ чужому slug/owner пути, ошибку bootstrap, относительные API и выдачу доступа существующей учётной записи. Изменение frontend не подтверждает настройку DNS/прокси, публикацию или готовность модулей.
- Сброс пароля в карточке доступен только при явном `can_reset_password: true` от backend; отсутствие признака запрещает действие. Пустой пароль выдачи без `existing_account: true` считается ошибкой активации, а не готовым доступом. Перенос клиентского frontend сейчас относится только к `iiko.tdpay.ru`; домен оплаты требует отдельного договора изоляции депозитов.

### Dashboard компании с собственным iiko (08.10.2026)

- `SaasTenant.tsx` после своей сессии и `/workspace` лениво открывает `TenantDashboard.tsx`: тот же `App.tsx`, Mantine theme (`dashboardTheme.ts`), RestaurantPicker, Overview и SalesPage. На домене компании работают `/` и `/sales`; служебный вход сохраняет basename `/tenant/{slug}`. Название компании используется вместо логотипа и в заголовке вкладки; бренд обычного dashboard сохранён.
- `dashboardRuntime.ts` устанавливает адаптер перед монтированием dashboard и удаляет его при выходе. `api.ts` делегирует запросы этому адаптеру; tenant не использует `VITE_API_BASE_URL`, `xx.chaika.team`, обычные `/auth/refresh` или `/auth/logout`. Адаптер `saasTenantApi.ts` допускает только GET `/api/saas-tenant/{slug}/dashboard/{me,overview,sales/daily,sales/dishes}`, сохраняет AbortSignal и обрабатывает потерю сессии/обязательную смену через собственный tenant auth.
- Разделы определяет серверный `/dashboard/me`; tenant дополнительно ограничен overview/sales. `supported_sales_kinds` ограничивает вкладки продаж. Закупочные цены, помощник, профиль, документы, управление, footer бренда и ссылки статуса не показываются; пустые `sales_dates` не создают кнопку фиктивного последнего дня. Неподключённые модули не выполняют запросов; дополнительные рабочие страницы обычного dashboard загружаются лениво.
- `tests/tenantDashboard.test.mjs`: same-origin allowlist, запрет неподключённых маршрутов, AbortSignal, tenant session loss/renew, cleanup/replacement адаптера и reload продаж на клиентском домене. Это проверки frontend; реальные данные/серверная изоляция/публикация проверяются отдельно.

### Общая публикация frontend в Timeweb Apps 254029

- Общий `index.html` → `main.tsx` сначала выбирает поверхность через `sharedDashboardEntry.ts`. Только точные HTTPS origin из build-переменной `VITE_PRIMARY_ORIGINS` открывают прежний Chaika App; localhost допускается лишь в Vite development. Для production сборки требуется `VITE_PRIMARY_ORIGINS=https://dashboard.chaika.team,https://teamchaika-team-front-204d.twc1.net`.
- На остальных HTTPS доменах источник определяется как `https://api.<hostname>` и проверяется на точное соответствие. GET `/api/saas-context` на этом API обязан вернуть tenant и собственную компанию. Ошибка, platform-ответ или запрещённый путь закрывают вход без переключения на Chaika API. Список клиентских доменов frontend не хранит: подключение/изоляцию определяет реестр backend.
- Этот же `SaasTenant.tsx` получает явный `apiOrigin`; публичный context, auth, workspace и dashboard обращаются только к нему с `credentials: include`. Клиентский домен обслуживается общей Apps-сборкой, а backend компании — API-поддоменом с TLS и точным credentialed CORS для зарегистрированного frontend origin. Для `rc.chaika.team` отдельный SaasAdmin entry сохраняет относительные same-origin API. Это уточнение заменяет same-origin транспорт tenant из предыдущего раздела только для общей Apps-публикации.
- `tests/tenantDashboard.test.mjs` дополнительно проверяет точное совпадение служебных origin, недопустимые элементы конфигурации, вывод API-поддомена для произвольной новой компании, отказ чужой API-базе, закрытие при ошибке context и все cookie/CSRF запросы к явному API компании. Сборка не подтверждает DNS/TLS/CORS и реальную авторизацию: эти проверки выполняются на опубликованном origin.
- Публичная `.env.production` содержит оба прежних primary origin, поэтому обычный `npm run build` сохраняет служебные dashboard; build environment может явно переопределить список. Ошибка tenant logout передаётся в App и видна в рабочем пространстве, сессия остаётся доступной для повторного выхода. Все ссылки статуса используют права раздела; tenant не получает переходов в неподключённый статус.
- `DataSourceNotice.tsx` в Overview и SalesPage показывает серверные `data_status.observed_at` и `expires_at` как время обновления iiko и срок кеша. Отсутствие этого поля в прежнем dashboard не добавляет уведомления и не меняет представление данных.
- Стили light SaaS из `saasAdmin.css` ограничены собственными `.sa-auth`, `.sa-app` (корень owner shell), `.sa-overlay` и историческим `.sa-tenant-workspace`. Базовые заголовки, controls, таблицы и media-правила не затрагивают общий тёмный App после входа; body margin меняется только при непосредственном SaaS-корне. `tests/saasStyleIsolation.test.mjs` запрещает глобальные SaaS-селекторы и проверяет owner theme root.
- Tenant runtime последовательно отправляет GET overview/sales одной компании, чтобы параллельные текущий обзор и 30-дневный тренд не конкурировали за iiko connection lock. Очередь принадлежит конкретному runtime; auth не ожидает отчётов, отменённые ожидающие запросы не выполняются, ошибка одного отчёта не блокирует следующий. Это локальная очередь браузера; backend остаётся ответственным за кеш и конкуренцию между вкладками.
- Для tenant Overview сначала получает выбранный период; 30-дневный тренд запрашивается лишь после успешного ответа, совпадающего с текущими датами. Ошибка или смена периода не запускают тренд по старому ответу. Обычный dashboard сохраняет параллельную загрузку, совпадение выбранного и трендового периода по-прежнему использует один запрос.

### Подписка и возможности (локальная основа, 08.10.2026)

`SaasEntitlements.tsx` — редактор подписки для служебной карточки компании:
серверный каталог `/api/saas-admin/entitlements/catalog`, выбор именованного плана,
статус, даты/часовой пояс и раскрываемые исключения возможностей с UTC сроком.
Сохраняется через существующий versioned save карточки, без клиентского каталога
или прямой записи в БД. `saasEntitlementsModel.ts` формирует изменения;
`saasAdminModel.ts` сохраняет дополнительные поля при normalizeCompany.
Старые карточки сохраняют legacy до явного выбора плана; новая форма предлагает
analytics. Пять модульных переключателей остаются верхней границей доступа.
`tests/saasEntitlements.test.mjs` проверяет сохранение политики и исключений,
удаление исключения при inherit и отсутствие скрытого перехода legacy.

### Глобальный владелец SaaS (локальная подготовка)

- `platformSso.ts`: target-side state/nonce/PKCE, временный browser proof, очистка fragment до обмена, одноразовый POST своему API. Пароль/JWT/refresh/code в storage не записываются.
- `PlatformSsoAuthorize.tsx` → `/sso/authorize` на центральном origin: подтверждение owner session либо единый вход владельца, авторизация по CSRF, возврат только на server-derived зарегистрированный origin.
- `SaasAdminAccess.tsx`: «Открыть кабинет клиента» запускает вход через frontend клиента. `SaasTenant.tsx`: кнопка центрального входа, обмен callback и постоянный видимый company/owner context + возврат в SaaS. `main.tsx`/`SaasAdminMain.tsx` передают company UUID и platform origin из проверенного context.
- `tests/platformSso.test.mjs`: proof uniqueness, StrictMode single start/exchange, state/nonce/company rejection, own API + credentials, очистка URL. Это локальная проверка; полный business runtime и реальный cross-domain переход проверяются отдельно.

### Полный tenant adapter — локальная интеграция 08.10.2026

Серверный context `full_dashboard_ready` включает полный адаптер в
`saasTenantApi.ts`/`SaasTenant.tsx`; `full_dashboard_available` сохраняет тот же
интерфейс истории после изменения настроек, когда новая готовность ещё не
подтверждена. `setup_available` открывает platform owner только «Управление» и
профиль для первоначальной настройки. Эти значения передают обе точки входа:
`main.tsx` и `SaasAdminMain.tsx`. Без них остаётся ограниченный Overview/Sales.
Полный адаптер направляет существующий `api.ts`
в свой `/api/*`, сохраняет body/AbortSignal, принудительно использует точный API
origin компании, credentials, собственный текущий CSRF для изменений и запрещает
redirect. `dashboardRuntime.ts` закрывает SaaS/чужой tenant/auth namespaces,
неизвестные API roots и обход пути. Сервер обязан независимо проверить те же
границы, сотрудника/склады и купленные возможности.

`TenantDashboard.tsx` подключает тот же App. В полном режиме App использует
разделы/права `/me`, включает существующие профиль/помощник и проверку сессии;
старый ограниченный режим сохраняется. Компания отображается вместо бренда
Чайки, provider/page keys включают компанию и пользователя. Ошибки tenant
транспорта переводятся `api.ts` в прежний ApiError с detail/employee_pending,
чтобы экраны документов/сотрудников сохраняли прежние проверки. Tests:
`tenantFullDashboard.test.mjs`, прежний `tenantDashboard.test.mjs`.

В `SaasAdminForm.tsx` редактор SaasEntitlements встроен в третью вкладку после
модульных переключателей. Новый POST компании требует `plans_v1`/существующий
server plan; прежние записи допускают legacy при изменении. Каталог требует
входа владельца. Наличие UI полного adapter не доказывает готовность серверных
модулей/реальных подключений и не включает production readiness автоматически.

SaaS onboarding status in company card: `SaasProvisioning.tsx` →
`saasAdminApi.ts` → owner GET `companies/{id}/provisioning`, versioned POST
`…/start` / `…/retry`. Shows durable stage progress, safe error, operator-configured
DNS records and explicit terminal readiness; polls while pending/running.

Tenant управление терминалами: `ManagementPage.tsx` содержит проверку сохранённого ключа через `/payment-settings/venues/{uuid}/terminals/{uuid}/validate` без создания платежа. Тестовый/рабочий режим обозначен отдельно; основной терминал не означает подтверждённую готовность реального платежа.

`ManagementPage setupOnly` показывает только свои заведения и терминалы;
`App` ограничивает меню и прямые маршруты, сервер повторяет ограничения независимо.
Постоянный banner глобального владельца учитывается при позиционировании sidebar
и на мобильном экране. Собранный frontend проверяется в
`tests/browser/tenantDashboard.smoke.mjs`; запуск и границы синтетической проверки
описаны в `tests/browser/README.md`.
