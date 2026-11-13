# Проверка собранного кабинета компании

```sh
npm run build
BROWSER_CHANNEL=chrome node tests/browser/tenantDashboard.smoke.mjs
```

Нужен доступный пакет `playwright` и установленный Chrome. При необходимости
укажите абсолютный путь к пакету через `PLAYWRIGHT_MODULE`. Без
`BROWSER_CHANNEL` используется Chromium, установленный Playwright.

Проверка читает production-файлы `dist`; `DASHBOARD_DIST` меняет этот путь.
Для SaaS entrypoint используйте `DASHBOARD_DIST=dist-saas-admin` и
`DASHBOARD_HTML=saas-admin.html` после сборки `npm run build -- --mode saas-admin`.
Тот же сценарий проверяет восстановление и гостевую оплату, включая отсутствие
ошибок провайдера компонентов и запрет восстановления на платёжной поверхности.

Снимки сохраняются в `/tmp/restcontrol-browser`; `BROWSER_ARTIFACTS` меняет каталог.

Все компании, аккаунты, домены и ответы API синтетические. Неожиданные запросы
блокируются, реальная сеть, авторизация, Telegram, iiko и деньги не используются.
Проверяются полный dashboard, собственный бренд, глобальный владелец, сохранённая
доступность истории, мобильный экран, режим первичной настройки терминалов и
восстановление пароля. Доступность реальных модулей проверяется отдельно.

Для ручной проверки причин списания через CUA используйте отдельный локальный
стенд на Vite development (сборка `dist` не нужна):

```sh
node tests/browser/writeoffReasons.server.mjs
```

Откройте `http://127.0.0.1:4186/management` и вкладку «Причины списания».
Только синтетические данные в памяти; перезапуск сбрасывает изменения. Сценарии
ошибок: `PORT=4187 FIXTURE_ERROR=409 node tests/browser/writeoffReasons.server.mjs`
(также 400/403). Без административных прав:
`PORT=4188 FIXTURE_ADMIN=0 node tests/browser/writeoffReasons.server.mjs`.
Стенд использует штатный primary entry для DEV localhost. Production-проверки
origin не меняются; tenant transport/CSRF отдельно проверяют node-тесты.
Это тестовый стенд, его нельзя публиковать как рабочий API.
