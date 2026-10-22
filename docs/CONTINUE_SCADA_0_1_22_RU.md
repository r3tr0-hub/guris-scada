# Продолжение проекта — SCADA 0.1.22

Текущая архитектура: native C11, ADS/TCP, loopback HTTP, HTML/CSS/vanilla JavaScript, SQLite. Рабочая ОС Windows 10/11 x64. Это не React/Tauri. В архиве исходники и готовый EXE. Запуск: Start_Compatibility.cmd.

## Последнее изменение

PERFORMANS перенесён из штатной инженерки в Меню → Опции → Производительность. 25 исходных настроек + 3 показания, ui/performance.json. Документация и native доказательства: docs/PERFORMANCE_PARAMETERS_RU.md и PERFORMANCE_EVIDENCE_0_1_22.json.

ui/functionality.js теперь общий компонент для functionality и performance. Параметры компонента: pageKey, catalogURL, titleText. Обе страницы — единый scroll grid без вкладок. Сохранённые поля page/column в functionality.json — исторические координаты HMI, а не UI-пагинация.

src/fields.h: 255 полей. Новые 22 поля добавлены в конец enum, существующие индексы не менялись. 21 новое writable-поле требует Engineer + остановка 5/9 и auto=0; последнее поле только для чтения. Углы подачи feedStartSet/feedStopSet также требуют инженера и остановку. Углы воздуха на своей существующей странице сохраняют прежний доступ оператора; новая инженерная страница дополнительно ограничивает весь ввод.

Не объединять perfProductLengthLimit (INT .stKaliciData.iMaxUrunBoyu_mm) и widthMaximum (REAL MAIN.rMaxUrunBoy). Последнее вычисляется ПЛК с учётом единиц. Новые символы разрешаются по ADS metadata, статические адреса из Boot не используются.

Три дистанции имеют программный cap 100000 мм, исходный HMI не задаёт upper bound. Не называть cap пределом ПЛК. Не приписывать единицу perfJawEarlyOffset; не переименовывать Injet в Videojet, Sepet Cozgu в конкретный механизм или режимы гидравлики в Manual/Auto без подтверждения.

## Проверка

tests/test_release22.py: 7 native API тестов. tests/test_release22_browser.cjs: настоящий touch input, оба scroll list, все 28 описаний, REAL/INT/DINT, роли/состояние/offline, языки и две темы до 4K. Запуск браузера через tests/run_browser.py и SCADA_BROWSER/NODE_PATH. Сеть loopback тестового backend и браузера должна быть в одном процессе-оркестраторе.

Хранить существующие защиты свежести ADS, compare-before-write, запрет повтора после lost ACK, серверную роль/остановку и восстановление временных режимов. Тесты используют только локальные имитаторы. Windows GUI и реальный станок здесь не проверялись.
