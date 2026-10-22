# Продолжение SCADA — 0.1.23

Архитектура: native C11 ADS/TCP + loopback HTTP + HTML/CSS/vanilla JS + SQLite. Это не Tauri/React. Production: Windows x64, Start_Compatibility.cmd.

Последнее изменение: PERFORMANS использует 25 строк и 28 полей каталога. У трёх read-only записей ui/performance.json есть pairedWith. Соответствия: feedStartActual→feedStartSet, feedStopActual→feedStopSet, perfLowMaterialActual→perfLowMaterialTime. Не выводить связанные фактические показания отдельными строками и не подставлять вместо них значения уставок.

ui/functionality.js рендерит общий список для двух разделов. Map rows хранит {row,control}; связанный факт имеет собственную вложенную ячейку, data-performance-key и disabled data-performance-control. Его подпись data-performance-help открывает описание. Различные качества связанной пары независимы. Цвета задания/факта должны сохраняться в classic/dark.

Новый последний enum F_EDGE_SENSITIVITY: edgeSensitivity, .stKaliciData.rKenarKontrol_OluBolge, REAL 4 байта, 0.1…10 мм. Общее поле, доступ оператору/инженеру, прежний HMI не требует остановки. field_presence использует общую конфигурацию edgeChannelCount 1…4 и прежнее исключение 0 для старого HMI; некорректная/неизвестная конфигурация блокирует ввод.

Смысл — позиционная зона нечувствительности, не скорость/таймер. KenKontrol.Kontrol присваивает один scalar четырём FbKenKontrol[1..4].LrOluBolgeGenislik; fb_KenarKontrol сравнивает модуль отклонения с порогом и снимает автоматическое направление внутри зоны. Доказательства: docs/EDGE_SENSITIVITY_EVIDENCE_0_1_23.json, исходный обработчик __VISU_KENARKONTROL_KALIBRE_INPUTCODE.

Всего 256 полей, 175 скалярных настроек, 19 отдельных команд; индексы старых полей не менялись. Тесты: tests/test_release23.py (6 API), test_release23_browser.cjs (совмещение строк/цвета/независимая достоверность, общая чувствительность/клавиатура, роли, offline, свайп, темы/языки/4K). Имитационные запросы отправляются только локальному ADS-серверу. Реальный станок и Windows GUI здесь не проверялись.

Все предыдущие ограничения из CONTINUE_SCADA_0_1_22_RU.md сохраняются: отдельные инженерная максимальная длина и расчётный лимит главной, неподтверждённые единицы/названия не выдумывать, fresh metadata + compare-before-write + no replay on lost ACK, остановка для инженерных настроек, восстановление временных режимов.
