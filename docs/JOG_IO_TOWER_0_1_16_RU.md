# Jog, входы/выходы и светофор · Guris SCADA 0.1.16

Разбор файлов станка от 16.10.2026. Исходники: CurrentPlc_1.tpy, TCPLC_P_1.wbp и dyntextgeneral.xml.wbp. Команды в реальный ПЛК не отправлялись. Новая страница Jog пока пустая — список ниже предназначен для согласования наполнения.

## Настройки Jog, подтверждённые полями ввода штатного HMI

Найдено **18 различных параметров** в 19 полях ввода. Все имеют тип REAL. Диапазоны взяты из обработчиков штатного HMI и не являются проверенными физическими пределами оборудования.

| Узел / настройка | ADS-символ | Диапазон поля HMI | Подпись / единица в HMI | Страница и доказательство |
|---|---|---|---|---|
| Балерина / подача 1 | `.stKaliciData.Salma[1].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_BALERIN / 0x141a02 |
| Балерина / подача 2 | `.stKaliciData.Salma[2].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_BALERIN2 / 0x1326c0 |
| Балерина / подача 3 | `.stKaliciData.Salma[3].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_BALERIN3 / 0x1361a8 |
| Балерина / подача 4 | `.stKaliciData.Salma[7].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_BALERIN4 / 0x139c90 |
| Балерина / подача 5 | `.stKaliciData.Salma[10].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_BALERIN5 / 0x13d781 |
| Нож · Jaw Jog | `.stKaliciData.sRecipeData.rCeneJogHiz` | 1…1000 | Jaw jog speed | VISU_CENE / 0x150944 |
| Основной размотчик | `.stKaliciData.Salma[4].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_COZGU / 0x154b02 |
| Размотчик усиления / карты | `.stKaliciData.Salma[6].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_KART_COZGU / 0x24900d |
| Размотчик фальцовки | `.stKaliciData.Salma[5].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_KATLAMA_COZGU / 0x24cc40 |
| Протяжка линии · Merdane Jog · время разгона, не скорость | `.stKaliciData.rMerdaneJogAcc` | 0.1…20 | Cylender jog Acc time (s) | VISU_MERDANE1 / 0x264811 |
| Протяжка линии · Merdane Jog | `.stKaliciData.sRecipeData.rMerdaneJogHiz` | 1…60 | Jog speed | VISU_MERDANE1 / 0x264e2b |
| Балерина узла Sedef | `.stKaliciData.Salma[9].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_SEDEFTAKMABALERIN / 0x2cc795 |
| Дополнительная запайка Tavuk | `.stKaliciData.rTavukAparatJogHiz` | 30…1000 | Ek Kaynak (Tavuk) Jog Hizi (º/sn) | VISU_SERVOLAR / 0x2d1499 |
| Балерина усиления | `.stKaliciData.Salma2[11].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_TAKVIYE_BALERIN / 0x2e6ecc |
| Протяжной вал мягкой ручки | `.stKaliciData.rYSapMerdaneJogHiz` | не задан в обработчике; 0…360 | Yumusak Sap Merdane Jog Hiz | VISU_YSAP_KALIBRE / 0x33237d; VISU_YUMUSAKSAP2 / 0x335d5f |
| Механизм мягкой ручки | `.stKaliciData.rYSapJogHiz` | не задан в обработчике | Yumusak Sap Jog Hiz | VISU_YSAP_KALIBRE / 0x33254d |
| Размотчик мягкой ручки | `.stKaliciData.rYSapCozguMotoruJogHiz` | 0…360 | Soft Handle Unwinder Jog Speed | VISU_YUMUSAKSAP2 / 0x335617 |
| Балерина Zipper | `.stKaliciData.Salma[8].rJogHizi` | 1…50 | JOG SPEED (%) | VISU_ZIPPERBALERIN / 0x341838 |

Salma[1…10] и Salma2[11] — индексы разных механизмов в программе; их не следует автоматически переименовывать в «размотчик 1…11». В частности, используются балерины, фальцовка, карта/усиление, Zipper и Sedef. Параметр rYSapMerdaneJogHiz встречается на двух страницах; это одна переменная. Проценты явно указаны только у rJogHizi, секунды — у rMerdaneJogAcc, градусы/секунду — у Tavuk. Для остальных единицы не назначены по предположению.

## Другие сохранённые параметры Jog, объявленные в TPY

Наличие символа подтверждено. Поле его редактирования в штатном HMI в текущем разборе не установлено; это не означает, что параметр влияет на установленную комплектацию.

| Параметр | Тип | Комментарий |
|---|---|---|
| `.stKaliciData.iKartCozucuJogHiz` | INT | Отдельный сохранённый параметр; связь с рабочим алгоритмом требует проверки |
| `.stKaliciData.rCozguJogHiz` | REAL | Отдельный сохранённый параметр; связь с рабочим алгоритмом требует проверки |
| `.stKaliciData.sRecipeData.rAcmaJogHiz` | REAL | Отдельный сохранённый параметр; связь с рабочим алгоритмом требует проверки |
| `.stKaliciData.rKatlamaCozguJogHiz` | REAL | Отдельный сохранённый параметр; связь с рабочим алгоритмом требует проверки |
| `.stKaliciData.rTakviyeHatCekiciJogHiz` | REAL | Отдельный сохранённый параметр; связь с рабочим алгоритмом требует проверки |
| `.stKaliciData.Salma[0].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[12].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[13].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[14].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[15].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[16].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[17].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[18].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[19].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |
| `.stKaliciData.Salma2[20].rJogHizi` | REAL | Индекс объявлен в массиве, отдельная используемая страница не подтверждена |

Итого сохранённых числовых параметров с Jog в имени: **33**, из них 18 подтверждены полями HMI; ещё 15 объявлены в TPY.

Режим, а не скорость: `.stKaliciData.bTutucuServoAutoJogMode` — BOOL, автоматический Jog прижима. Его следует рассматривать отдельно от настроек скорости.

## Расчётные задания и параметры приводов

Это внутренние значения алгоритма. Наличие ADS-символа не означает, что его следует делать редактируемым: ПЛК может пересчитывать его каждый цикл.

- `MAIN.LrMerdaneJogAcc`, `MAIN.LrMerdaneJogDec`, `MAIN.LrMerdaneJogJerk` — LREAL: расчётные ускорение, торможение и рывок протяжки.
- `Slow_Task.iKartCozucuJogHiz` — INT: рабочее значение скорости размотчика карты.
- `x_TUTUCU.rAutoJogReferans_addk`, `x_TUTUCU.rAutoJogReferans_mdk` — REAL: расчётные задания автоматического Jog прижима.

В 19 экспортированных экземплярах Servo_Kontrol есть `LrManHizRef` типа LREAL — задание скорости ручного хода. Экземпляры:

`.sSanalMaster.LrManHizRef`
`.sHotmeltEncoder.LrManHizRef`
`.sTeflon.LrManHizRef`
`.sHotmelt2Encoder.LrManHizRef`
`.sCene.LrManHizRef`
`.sMerdane1.LrManHizRef`
`.sMerdane2.LrManHizRef`
`.sMerdane3.LrManHizRef`
`.sTutucu.LrManHizRef`
`.sElgecme.LrManHizRef`
`.sEkKaynak.LrManHizRef`
`.sTavukFire.LrManHizRef`
`.sDizgi.LrManHizRef`
`.sTakviyeHatCekici.LrManHizRef`
`.sTakviyeKonveyor.LrManHizRef`
`.sElgecme2.LrManHizRef`
`.sYSap.LrManHizRef`
`.sYSapMerdane.LrManHizRef`
`.sKartCozgu.LrManHizRef`

## Физические кнопки Jog

Найдено 83 дискретных входов с Jog в имени. Это состояния реальных кнопок, а не настройки скорости и не команды для записи.

| Вход | Назначение по каталогу | Тип |
|---|---|---|
| `.DI_Merdane2JogIleri` | Вал 2 ручной ход вперёд | BOOL |
| `.DI_Merdane2JogGeri` | Вал 2 ручной ход назад | BOOL |
| `.DI_PosetJogIleri` | Пакет ручной ход вперёд | BOOL |
| `.DI_PosetJogGeri` | Пакет ручной ход назад | BOOL |
| `.DI_AnaMotorJog` | Главный двигатель ручной ход | BOOL |
| `.DI_SalmaJog` | Размотчик ручной ход | BOOL |
| `.DI_BantJog` | Конвейер/лента ручной ход | BOOL |
| `.DI_CozguJogBut` | Дополнительный размотчик ручной ход кнопка | BOOL |
| `.DI_TeflonJog` | Тефлоновая лента ручной ход | BOOL |
| `.DI_KartCozguJog` | Размотчик усиления ручной ход | BOOL |
| `.DI_KatlamaCozguJog` | Фальцовка дополнительный размотчик ручной ход | BOOL |
| `.DI_Salma2Jog` | Размотчик 2 ручной ход | BOOL |
| `.DI_Tambur2Jog` | Барабан 2 ручной ход | BOOL |
| `.DI_SalmaJogBtn[1]` | Размотчик ручной ход кнопка [1] | BOOL |
| `.DI_SalmaJogBtn[2]` | Размотчик ручной ход кнопка [2] | BOOL |
| `.DI_SalmaJogBtn[3]` | Размотчик ручной ход кнопка [3] | BOOL |
| `.DI_SalmaJogBtn[4]` | Размотчик ручной ход кнопка [4] | BOOL |
| `.DI_SalmaJogBtn[5]` | Размотчик ручной ход кнопка [5] | BOOL |
| `.DI_SalmaJogBtn[6]` | Размотчик ручной ход кнопка [6] | BOOL |
| `.DI_SalmaJogBtn[7]` | Размотчик ручной ход кнопка [7] | BOOL |
| `.DI_SalmaJogBtn[8]` | Размотчик ручной ход кнопка [8] | BOOL |
| `.DI_SalmaJogBtn[9]` | Размотчик ручной ход кнопка [9] | BOOL |
| `.DI_SalmaJogBtn[10]` | Размотчик ручной ход кнопка [10] | BOOL |
| `.DI_SalmaJogBtn2[11]` | Размотчик ручной ход кнопка 2[11] | BOOL |
| `.DI_SalmaJogBtn2[12]` | Размотчик ручной ход кнопка 2[12] | BOOL |
| `.DI_SalmaJogBtn2[13]` | Размотчик ручной ход кнопка 2[13] | BOOL |
| `.DI_SalmaJogBtn2[14]` | Размотчик ручной ход кнопка 2[14] | BOOL |
| `.DI_SalmaJogBtn2[15]` | Размотчик ручной ход кнопка 2[15] | BOOL |
| `.DI_SalmaJogBtn2[16]` | Размотчик ручной ход кнопка 2[16] | BOOL |
| `.DI_SalmaJogBtn2[17]` | Размотчик ручной ход кнопка 2[17] | BOOL |
| `.DI_SalmaJogBtn2[18]` | Размотчик ручной ход кнопка 2[18] | BOOL |
| `.DI_SalmaJogBtn2[19]` | Размотчик ручной ход кнопка 2[19] | BOOL |
| `.DI_SalmaJogBtn2[20]` | Размотчик ручной ход кнопка 2[20] | BOOL |
| `.DI_TavukAparati_Jog` | Узел Tavuk ручной ход | BOOL |
| `.DI_DizgiJogFwBtn` | Приёмный узел ручной ход вперёд кнопка | BOOL |
| `.DI_FireSarma1JogBtn` | Намотка отходов 1 ручной ход кнопка | BOOL |
| `.DI_KenarKontrolJogFw[0]` | Краевой контроль ручной ход вперёд [0] | BOOL |
| `.DI_KenarKontrolJogFw[1]` | Краевой контроль ручной ход вперёд [1] | BOOL |
| `.DI_KenarKontrolJogFw[2]` | Краевой контроль ручной ход вперёд [2] | BOOL |
| `.DI_KenarKontrolJogFw[3]` | Краевой контроль ручной ход вперёд [3] | BOOL |
| `.DI_KenarKontrolJogFw[4]` | Краевой контроль ручной ход вперёд [4] | BOOL |
| `.DI_KenarKontrolJogBw[0]` | Краевой контроль ручной ход назад [0] | BOOL |
| `.DI_KenarKontrolJogBw[1]` | Краевой контроль ручной ход назад [1] | BOOL |
| `.DI_KenarKontrolJogBw[2]` | Краевой контроль ручной ход назад [2] | BOOL |
| `.DI_KenarKontrolJogBw[3]` | Краевой контроль ручной ход назад [3] | BOOL |
| `.DI_KenarKontrolJogBw[4]` | Краевой контроль ручной ход назад [4] | BOOL |
| `.DI_TutucuJogFwBtn` | Прижим ручной ход вперёд кнопка | BOOL |
| `.DI_ElgecmeJog` | Вырубная ручка ручной ход | BOOL |
| `.DI_Merdane3JogIleri` | Вал 3 ручной ход вперёд | BOOL |
| `.DI_Merdane3JogGeri` | Вал 3 ручной ход назад | BOOL |
| `.DI_HatCekiciJog` | Тянущий узел ручной ход | BOOL |
| `.DI_TakviyeCozguJog` | Усиление дополнительный размотчик ручной ход | BOOL |
| `.DI_PosetJogIleri_2` | Пакет ручной ход вперёд 2 | BOOL |
| `.DI_PosetJogGeri_2` | Пакет ручной ход назад 2 | BOOL |
| `.DI_Merdane2JogIleri_2` | Вал 2 ручной ход вперёд 2 | BOOL |
| `.DI_Merdane2JogGeri_2` | Вал 2 ручной ход назад 2 | BOOL |
| `.DI_Elgecme2Jog` | Вырубная ручка 2 ручной ход | BOOL |
| `.DI_YSapMerdaneJog` | Мягкая ручка вал ручной ход | BOOL |
| `.DI_YSapJog` | Мягкая ручка ручной ход | BOOL |
| `.DI_YSap1CozguJog` | Мягкая ручка 1 дополнительный размотчик ручной ход | BOOL |
| `.DI_YSap2CozguJog` | Мягкая ручка 2 дополнительный размотчик ручной ход | BOOL |
| `.DI_SepetCozguJog` | Размотчик Sepet дополнительный размотчик ручной ход | BOOL |
| `.DI_AnaMotorJog_MerkezPano` | Главный двигатель ручной ход основной пульт | BOOL |
| `.DI_SalmaJogBtn_2[1]` | Размотчик ручной ход кнопка 2[1] | BOOL |
| `.DI_SalmaJogBtn_2[2]` | Размотчик ручной ход кнопка 2[2] | BOOL |
| `.DI_SalmaJogBtn_2[3]` | Размотчик ручной ход кнопка 2[3] | BOOL |
| `.DI_SalmaJogBtn_2[4]` | Размотчик ручной ход кнопка 2[4] | BOOL |
| `.DI_SalmaJogBtn_2[5]` | Размотчик ручной ход кнопка 2[5] | BOOL |
| `.DI_SalmaJogBtn_2[6]` | Размотчик ручной ход кнопка 2[6] | BOOL |
| `.DI_SalmaJogBtn_2[7]` | Размотчик ручной ход кнопка 2[7] | BOOL |
| `.DI_SalmaJogBtn_2[8]` | Размотчик ручной ход кнопка 2[8] | BOOL |
| `.DI_SalmaJogBtn_2[9]` | Размотчик ручной ход кнопка 2[9] | BOOL |
| `.DI_SalmaJogBtn_2[10]` | Размотчик ручной ход кнопка 2[10] | BOOL |
| `.DI_KenarKontrolJogFw_2[0]` | Краевой контроль ручной ход вперёд 2[0] | BOOL |
| `.DI_KenarKontrolJogFw_2[1]` | Краевой контроль ручной ход вперёд 2[1] | BOOL |
| `.DI_KenarKontrolJogFw_2[2]` | Краевой контроль ручной ход вперёд 2[2] | BOOL |
| `.DI_KenarKontrolJogFw_2[3]` | Краевой контроль ручной ход вперёд 2[3] | BOOL |
| `.DI_KenarKontrolJogFw_2[4]` | Краевой контроль ручной ход вперёд 2[4] | BOOL |
| `.DI_KenarKontrolJogBw_2[0]` | Краевой контроль ручной ход назад 2[0] | BOOL |
| `.DI_KenarKontrolJogBw_2[1]` | Краевой контроль ручной ход назад 2[1] | BOOL |
| `.DI_KenarKontrolJogBw_2[2]` | Краевой контроль ручной ход назад 2[2] | BOOL |
| `.DI_KenarKontrolJogBw_2[3]` | Краевой контроль ручной ход назад 2[3] | BOOL |
| `.DI_KenarKontrolJogBw_2[4]` | Краевой контроль ручной ход назад 2[4] | BOOL |

## Команды Jog штатного HMI

Найдено 9 экспортированных целей кнопок с Jog в имени. Известные кнопки краевого контроля и приёмного вала в SCADA сохраняют режим удержания и снятия; новая страница Jog не добавляет команд движения.

| Символ | Тип | Страницы HMI | Поведение |
|---|---|---|---|
| `KenKontrol.bKenKontrolJogBw[1]` | BOOL | VISU_KENARKONTROL, VISU_KENARKONTROL2 | press_1_release_0 |
| `KenKontrol.bKenKontrolJogBw[2]` | BOOL | VISU_KENARKONTROL, VISU_KENARKONTROL2 | press_1_release_0 |
| `KenKontrol.bKenKontrolJogBw[3]` | BOOL | VISU_KENARKONTROL, VISU_KENARKONTROL2 | press_1_release_0 |
| `KenKontrol.bKenKontrolJogBw[4]` | BOOL | VISU_KENARKONTROL2 | press_1_release_0 |
| `KenKontrol.bKenKontrolJogFw[1]` | BOOL | VISU_KENARKONTROL, VISU_KENARKONTROL2 | press_1_release_0 |
| `KenKontrol.bKenKontrolJogFw[2]` | BOOL | VISU_KENARKONTROL, VISU_KENARKONTROL2 | press_1_release_0 |
| `KenKontrol.bKenKontrolJogFw[3]` | BOOL | VISU_KENARKONTROL, VISU_KENARKONTROL2 | press_1_release_0 |
| `KenKontrol.bKenKontrolJogFw[4]` | BOOL | VISU_KENARKONTROL2 | press_1_release_0 |
| `.stKaliciData.bTutucuServoAutoJogMode` | BOOL | VISU_OPSIYON3 | toggle |

## Диагностика Input / Output в сборке

Созданы пять страниц входов и три страницы выходов по штатному HMI: все **241 строки** сопоставлены. В трёх строках используются исходные выражения:

| Индикатор HMI | Что читается | Доказательство в TCPLC_P_1.wbp |
|---|---|---|
| Фотодатчик | бит 0 `.SI_Merdane1DigInState` | `0x1e2694…0x1e26a2` |
| Фотодатчик пробивки | бит 4 `.SI_Merdane1DigInState` | `0x1e2ebd…0x1e2ecb` |
| Исходное положение ножа | `.DI_CeneHomeSEN OR .DI_CeneYukardaSen` | `0x1e2aba…0x1e2ad0` |

Общий список содержит 872 элемента образа I/O и 11 вычисленных показаний штатного HMI: всего **883 записи**. Это не 883 отдельных физических датчика: сюда входят элементы массивов, байты обмена и служебные данные. Есть поиск, фильтр типа и страницы по 48 строк. Аналоговые значения образа I/O показываются в исходных единицах PLC-типа; шкалы преобразования штатного HMI для них не подставляются.

Индикатор 1 — зелёный, 0 — красный, неизвестно — серый с прочерком. Цвет показывает сырой логический уровень, а не наличие неисправности: некоторые цепи используют инверсную логику. Составные индикаторы используют выражения из HMI. Без свежего чтения значение не превращается в ноль.

Адреса разрешаются по именам ADS на подключённом ПЛК; статические адреса из WBP не используются для обмена. Диагностика читает только видимую выборку, до 48 символов; обновление 500 мс, по два новых поиска имени за цикл. Подписка требует продления и истекает через 2,5 секунды. При выходе со страницы опрос I/O отключается. Записи/форсирования выходов в диагностике нет.

## Светофор и звуковой сигнал

**Выходы найдены; устойчивого внешнего запроса на произвольный звук/цвет в разобранной логике не найдено.** Текущая программа ПЛК назначает эти выходы сама.

| Выход | Тип | Назначение по проекту | Кто записывает |
|---|---|---|---|
| `.DO_Korna` | BOOL | Звуковой сигнал | `Slow_Task.Korna` |
| `.DO_Yesil_Sinyal_Lamba` | BOOL | Зелёная лампа | `Slow_Task.Lambalar` |
| `.DO_Kirmizi_Sinyal_Lamba` | BOOL | Красная лампа | `Slow_Task.Lambalar` |
| `.DO_Sari_Sinyal_Lamba` | BOOL | Жёлтая лампа | `Slow_Task.Lambalar` |

Восстановленная логика:

- Зелёная: состояние `MAIN.bSistemOtomatik`.
- Красная по имени физического выхода: мигание при `Slow_Task.bAll_Genel`, период 3 с, включена 1 с / выключена 2 с.
- Жёлтая по имени физического выхода: `(мигание малого остатка материала OR NOT автомат) AND NOT общая авария`. Для малого остатка период также 3 с, включена 1 с / выключена 2 с.
- Звук: генератор 500 мс включён / 500 мс выключен, запускается штатными предупреждениями перед пачкой/пуском, поиском исходного положения ножа, малым остатком материала, достижением группового задания; при общей аварии также используется импульс таймера 5 с. Эти условия относятся к найденной программе и ещё не проверены на физическом светофоре.

Внутренние имена двух генераторов цвета не совпадают с именами конечных выходов. Назначение выше установлено по конечной записи в образ выходов, а не по названию функционального блока. Соответствие физической проводке на станке здесь не проверялось.

Прямая запись 1 в DO_Korna или лампу будет конкурировать с циклической записью программы. По этой причине кнопки управления светофором/звуком в эту сборку не добавлены; доступно чтение состояния.

Для предсказуемого управления следует добавить в программу ПЛК отдельные запросы SCADA: тест звука и ламп с ограничением длительности, подтверждением принятия и приоритетом штатных аварий/предупреждений. При пропаже связи запрос должен сам сниматься в ПЛК. Конкретные поля и команды можно определить после согласования назначения сигналов; форсирование выходов для этого не требуется.

Доказательства конечных записей: звук `0xba6e4/0xba6ed`; зелёный `0xba710/0xba719`; красный `0xba783/0xba78c`; жёлтый `0xba806/0xba80f`. SHA-256 WBP: `60b2972ba194922a8abf3a2ef96d744e04dbab79bc1076b3fae93fe062bcddd6`.
