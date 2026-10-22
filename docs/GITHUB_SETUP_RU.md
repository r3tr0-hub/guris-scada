# Первая загрузка Guris SCADA в GitHub

Подготовленная версия — **0.1.24**. Рекомендуемый репозиторий: **`r3tr0-hub/guris-scada`**.

## Самый простой способ на Windows

1. Установите [Git for Windows](https://git-scm.com/downloads/win). Если консоль уже была открыта до установки, откройте её заново.
2. Войдите на [github.com](https://github.com/) под `r3tr0-hub`.
3. На [странице создания репозитория](https://github.com/new) введите `guris-scada`. Выберите Private. Оставьте выключенными добавление README, `.gitignore` и лицензии. Нажмите **Create repository**.
4. Распакуйте архив исходников целиком, например в `C:\Projects\guris-scada`. В этой папке должны находиться `src`, `ui`, `.github`, `README.md` и `Upload_to_GitHub.cmd`.
5. Запустите **Upload_to_GitHub.cmd**. Дождитесь завершения. Git может открыть браузер для входа в аккаунт.
6. Обновите страницу репозитория. В `main` должны появиться исходники, а в списке тегов — `v0.1.24`.
7. Во вкладке **Actions** дождитесь проверки **Build and test**. После успешного Windows job можно скачать артефакт с ZIP сборки.

Скрипт использует HTTPS, проверяет пустоту удалённого репозитория и отправляет только `main` и тег текущей версии. Он не создаёт репозиторий на сайте, не делает force-push и не меняет глобальные настройки Git. Если в Git ещё не настроен автор, только для этой папки будут записаны `Авсаркисов Д.А.` и `wizzigun@gmail.com`.

Если GitHub предлагает пароль в консоли, используйте вход через Git Credential Manager/браузер. Обычный пароль аккаунта не подставляйте в файлы проекта или URL удалённого репозитория.

## Другое имя репозитория

Создайте пустой репозиторий с нужным именем, откройте PowerShell в папке исходников и выполните:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Push-GitHub.ps1 -Owner r3tr0-hub -Repository ИМЯ-РЕПОЗИТОРИЯ
```

## Ручной способ

Команды ниже выполняются в **Git Bash** из корня распакованной папки. Удалённый репозиторий должен быть пустым. Пример предполагает аккаунт `r3tr0-hub` и имя `guris-scada`.

```sh
git init -b main
git config user.name "Авсаркисов Д.А."
git config user.email "wizzigun@gmail.com"
git add .
git status --short
git commit -m "Import production SCADA 0.1.24 sources"
git tag -a v0.1.24 -m "Production SCADA 0.1.24 source baseline"
git remote add origin https://github.com/r3tr0-hub/guris-scada.git
git push -u origin main
git push origin v0.1.24
```

Ручной `git status` позволяет просмотреть состав первого коммита. В нём должны быть `src/`, `ui/`, `vendor/`, `reference/`, `tests/`, документы и `.github/workflows/ci.yml`. Рабочие `connection.json`, `local/`, EXE и `node_modules` не должны попадать в коммит.

Не загружайте весь проект через браузерный Upload files: Git удобнее для большого дерева, скрытых служебных файлов, следующих изменений и сохранения истории.

## Следующие изменения

После первой загрузки работайте в этой же папке либо клонируйте репозиторий на другой ПК:

```sh
git clone https://github.com/r3tr0-hub/guris-scada.git
cd guris-scada
```

Для обычного обновления:

```sh
git status
git add .
git commit -m "Describe the change"
git push
```

Скрипт `Upload_to_GitHub.cmd` предназначен для первоначального пустого репозитория. Для следующих изменений используйте обычные коммиты или GitHub Desktop. Тег `v0.1.24` оставляйте на исходной версии; новые теги создавайте для новых проверенных выпусков.

Для продолжения разработки передайте ссылку на репозиторий, ветку `main` и текущую задачу. Устройство проекта и основные ограничения описаны в `AGENTS.md`.

## Что уже подготовлено

- Полные исходники backend, UI и SQLite, необходимые для сборки.
- `.gitignore`, правила окончаний строк и описание архитектуры.
- Шаблон конфигурации с выключенным подключением.
- Сборка Windows x64 Zig 0.13.0 и упаковка ZIP с актуальными SHA256.
- GitHub Actions: нативные тесты, JSDOM/CSS, браузерный сценарий 0.1.24 и сборка Windows.
- Сохранённые схемы, подтверждённые привязки, справки и документация.

Скрипт загрузки требует Windows PowerShell 5.1+ и Git. Для самой первой отправки не нужны Zig, Python или Node.js. Они нужны только при локальной сборке и тестировании; в GitHub Actions устанавливаются автоматически.

Официальная инструкция GitHub: [Adding locally hosted code to GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).
