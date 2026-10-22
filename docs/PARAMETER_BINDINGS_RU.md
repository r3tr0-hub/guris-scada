# Текущие привязки · 0.1.24

714 уникальных нативных полей, 596 регулируемых скалярных настроек и 42 команды. Основные 256 полей опрашиваются постоянно; дополнительные — при открытии соответствующего инженерного раздела. Обычные инженерные параметры доступны при любом состоянии машины.

Подробный справочник: [ENGINEERING_PARAMETERS_0_1_24_RU.md](ENGINEERING_PARAMETERS_0_1_24_RU.md). Полные доказательства HMI и исходные диапазоны сохранены в JSON-каталогах.

| Ключ | Параметр | Переменная | Тип | Доступ |
|---|---|---|---|---|
| width | Ширина пакета | `.stKaliciData.sRecipeData.rMerdanePosMesafe` | REAL | регулировка |
| batch | Пакетов в пачке | `.stKaliciData.sRecipeData.diIstenenPaketAdet` | DINT | регулировка |
| welding | Скорость шва | `.stKaliciData.sRecipeData.rCeneKaynakHiz` | REAL | регулировка |
| weldingEnabled | Скорость шва · включение | `.stKaliciData.sRecipeData.bMoonStepAktif` | BOOL | регулировка |
| speedSet | Скорость выпуска | `.stKaliciData.rCeneHizAdetSet_dk` | REAL | регулировка |
| productionQty | Количество производства | `.stKaliciData.sRecipeData.diIstenilenUretimAdet` | DINT | регулировка |
| current | Пакетов в текущей пачке | `MAIN.diActPaketAdet` | DINT | чтение / отдельная команда |
| groups | Сформировано пачек | `MAIN.diGrupAdet` | DINT | чтение / отдельная команда |
| total | Всего изготовлено | `MAIN.diToplamAdet` | DINT | чтение / отдельная команда |
| machineState | Состояние машины | `.I_MESSAGEID` | INT | чтение / отдельная команда |
| beltTimed | Работа конвейера по времени | `.stKaliciData.sRecipeData.bBant_But` | BOOL | регулировка |
| beltTime1 | Лента · время 1 | `.stKaliciData.iIstiflemeErkenStartSuresi_ms` | INT | регулировка |
| beltTime2 | Лента · время 2 | `.stKaliciData.sRecipeData.diBantOtoSure` | DINT | регулировка |
| beltTime3 | Лента · время 3 | `.stKaliciData.sRecipeData.diGrupBantSureOfset` | DINT | регулировка |
| conveyorContinuous | Непрерывная работа конвейера | `.stKaliciData.bBantSurekliCalismaAktif` | BOOL | регулировка |
| conveyorTime1 | Конвейер · параметр 1 | `.stKaliciData.rKonvoyorFrekans` | REAL | регулировка |
| conveyorTime2 | Конвейер · параметр 2 | `.stKaliciData.rPaketArasiBantFrekans` | REAL | регулировка |
| beltStep | Шаг ленты | `.stKaliciData.sRecipeData.rBantUzeriIstenenUrunAdet` | REAL | регулировка |
| waitingQty | Количество холостых ударов | `.stKaliciData.sRecipeData.diCeneBosVurmaAdet` | DINT | регулировка |
| offset | Тонкая настройка шага | `.stKaliciData.sRecipeData.rKayisOfset` | REAL | регулировка |
| beltIdleSpeed | Скорость холостой работы ленты | `.stKaliciData.rKayisStopHizYuzde` | REAL | регулировка |
| offsetDisplay | Показание тонкой настройки | `SLOW_TASK.RKAYISKADEMEOFSET` | REAL | чтение / отдельная команда |
| offsetStep | Шаг тонкой настройки | `.stKaliciData.rKayisOfset_Adim` | REAL | инженер |
| speedLimit | Ограничение скорости ПЛК | `X_CENE.LRCENEHIZLIMIT` | LREAL | чтение / отдельная команда |
| waitingLimit | Предел холостых ударов | `MAIN.IMAXCENEBOSVURMAADET` | INT | чтение / отдельная команда |
| automatic | Автоматическая работа | `MAIN.BSISTEMOTOMATIK` | BOOL | чтение / отдельная команда |
| heat1Set | Верхний нож · задание | `.stKaliciData.sIsiPar[1].rSP` | REAL | регулировка |
| heat1Actual | Верхний нож · фактическая температура | `Isilar.fbIsiKont[1].rAktIsi` | REAL | чтение / отдельная команда |
| heat2Set | Нижний нож · задание | `.stKaliciData.sIsiPar[2].rSP` | REAL | регулировка |
| heat2Actual | Нижний нож · фактическая температура | `Isilar.fbIsiKont[2].rAktIsi` | REAL | чтение / отдельная команда |
| heat3Set | Подпайщик 1 · задание | `.stKaliciData.sIsiPar[3].rSP` | REAL | регулировка |
| heat3Actual | Подпайщик 1 · фактическая температура | `Isilar.fbIsiKont[3].rAktIsi` | REAL | чтение / отдельная команда |
| heat4Set | Подпайщик 2 · задание | `.stKaliciData.sIsiPar[4].rSP` | REAL | регулировка |
| heat4Actual | Подпайщик 2 · фактическая температура | `Isilar.fbIsiKont[4].rAktIsi` | REAL | чтение / отдельная команда |
| heat5Set | Продольный шов · задание | `.stKaliciData.sIsiPar[5].rSP` | REAL | регулировка |
| heat5Actual | Продольный шов · фактическая температура | `Isilar.fbIsiKont[5].rAktIsi` | REAL | чтение / отдельная команда |
| heat1Enabled | Верхний нож · включение | `.stKaliciData.sIsiPar[1].bEnable` | BOOL | регулировка |
| heat1Identity | Верхний нож · назначение канала | `.stKaliciData.iActiveHeatId[1]` | INT | инженер |
| heat2Enabled | Нижний нож · включение | `.stKaliciData.sIsiPar[2].bEnable` | BOOL | регулировка |
| heat2Identity | Нижний нож · назначение канала | `.stKaliciData.iActiveHeatId[2]` | INT | инженер |
| heat3Enabled | Подпайщик 1 · включение | `.stKaliciData.sIsiPar[3].bEnable` | BOOL | регулировка |
| heat3Identity | Подпайщик 1 · назначение канала | `.stKaliciData.iActiveHeatId[3]` | INT | инженер |
| heat4Enabled | Подпайщик 2 · включение | `.stKaliciData.sIsiPar[4].bEnable` | BOOL | регулировка |
| heat4Identity | Подпайщик 2 · назначение канала | `.stKaliciData.iActiveHeatId[4]` | INT | инженер |
| heat5Enabled | Продольный шов · включение | `.stKaliciData.sIsiPar[5].bEnable` | BOOL | регулировка |
| heat5Identity | Продольный шов · назначение канала | `.stKaliciData.iActiveHeatId[5]` | INT | инженер |
| heat6Set | Нож · мощность · задание | `.stKaliciData.sIsiPar[6].rSP` | REAL | регулировка |
| heat6Enabled | Нож · мощность · включение | `.stKaliciData.sIsiPar[6].bEnable` | BOOL | регулировка |
| heat6Identity | Нож · мощность · назначение канала | `.stKaliciData.iActiveHeatId[6]` | INT | инженер |
| glueEnabled | Подача клея | `.stKaliciData.sRecipeData.bHotmeltUniteAktif` | BOOL | регулировка |
| gluePhotoMode | Клей · режим фотометки | `.stKaliciData.sRecipeData.bHotmeltFotoselliCalismaAktif` | BOOL | регулировка |
| glueSearchWindow | Клей · окно поиска метки | `.stKaliciData.sRecipeData.rHotmeltSensorKontrolAralik` | REAL | регулировка |
| glueMissLimit | Клей · пропуски до остановки | `.stKaliciData.sRecipeData.diHotmeltSensorGormemeAdet` | DINT | регулировка |
| glueStartOffset | Клей · рабочая дистанция / смещение старта | `.stKaliciData.sRecipeData.rHotmeltStartOfset` | REAL | регулировка |
| glueWorkingDistance | Клей · дистанция без клея / участок A | `.stKaliciData.sRecipeData.rHotmeltCalismaMesafe` | REAL | регулировка |
| glueWithoutDistance | Клей · участок B без клея | `.stKaliciData.rHotmeltAraTutkalsizMesafe` | REAL | регулировка |
| glueReference | Клей · коэффициент подачи | `.stKaliciData.sRecipeData.rHotmeltValfMaxHizdakiRef` | REAL | регулировка |
| glueEncoder | Клей · положение энкодера | `HOTMELTUNITE1.LRACTUELMODPOS` | LREAL | чтение / отдельная команда |
| glueMeanLength | Клей · среднее расстояние между метками | `HotmeltUnite1.lrHesaplananUrunBoy` | LREAL | чтение / отдельная команда |
| seamEnabled | Продольный шов · включение | `.stKaliciData.bYolunaKaynakStartValf1Aktif` | BOOL | регулировка |
| liner1Stretch | Лайнер 1 · растяжение | `.stKaliciData.sRecipeData.rBantTorkYuzde` | REAL | регулировка |
| liner1StopDiameter | Лайнер 1 · стоп-диаметр | `.stKaliciData.rBantDurusCapi` | REAL | регулировка |
| liner1AutoStop | Лайнер 1 · автоостановка | `.stKaliciData.sRecipeData.bBantKontrol` | BOOL | регулировка |
| liner1Diameter | Лайнер 1 · текущий диаметр | `SERITBANT1.LRACTCAP` | LREAL | чтение / отдельная команда |
| liner2Stretch | Лайнер 2 · растяжение | `.stKaliciData.sRecipeData.rBantTorkYuzde2` | REAL | регулировка |
| liner2StopDiameter | Лайнер 2 · стоп-диаметр | `.stKaliciData.rBantDurusCapi2` | REAL | регулировка |
| liner2AutoStop | Лайнер 2 · автоостановка | `.stKaliciData.sRecipeData.bBantKontrol2` | BOOL | регулировка |
| liner2Diameter | Лайнер 2 · текущий диаметр | `SERITBANT2.LRACTCAP` | LREAL | чтение / отдельная команда |
| liner3Stretch | Лайнер 3 · растяжение | `.stKaliciData.sRecipeData.rBantTorkYuzde3` | REAL | регулировка |
| liner3StopDiameter | Лайнер 3 · стоп-диаметр | `.stKaliciData.rBantDurusCapi3` | REAL | регулировка |
| liner3AutoStop | Лайнер 3 · автоостановка | `.stKaliciData.sRecipeData.bBantKontrol3` | BOOL | регулировка |
| liner3Diameter | Лайнер 3 · текущий диаметр | `SERITBANT3.LRACTCAP` | LREAL | чтение / отдельная команда |
| tensionSet | Настройка натяжения | `.stKaliciData.sRecipeData.rMerdane2SenkronYuzde` | REAL | регулировка |
| takeoffMoonstep | Приёмный вал · Moonstep | `.stKaliciData.bDizgiMoonStepAktif` | BOOL | регулировка |
| takeoffMoonstepValue | Приёмный вал · расчётная скорость | `.stKaliciData.rDizgiMoonStepHizi_addk` | REAL | чтение / отдельная команда |
| takeoffOffset | Синхронизация приёма пакета | `.stKaliciData.rDizgiOfset` | REAL | регулировка |
| ejectEnabled | Выкидные валы · включение | `.stKaliciData.bTutucuAktif` | BOOL | регулировка |
| ejectSpeedEnabled | Выкидные валы · скорость | `.stKaliciData.bTutucuMoonStepAktif` | BOOL | регулировка |
| ejectSpeed | Выкидные валы · задание скорости | `.stKaliciData.rTutucuMoonStepHizi_addk` | REAL | регулировка |
| ejectOffset | Синхронизация выкидывания | `.stKaliciData.rTutucuOfset` | REAL | регулировка |
| support1Time | Подпайщик 1 · время | `.stKaliciData.iValveDuration_ms[1]` | INT | регулировка |
| support1Enabled | Подпайщик 1 · включение | `.stKaliciData.bValveAktif[1]` | BOOL | регулировка |
| support1Identity | Подпайщик 1 · назначение канала | `.stKaliciData.iValveId[1]` | INT | инженер |
| support2Time | Подпайщик 2 · время | `.stKaliciData.iValveDuration_ms[2]` | INT | регулировка |
| support2Enabled | Подпайщик 2 · включение | `.stKaliciData.bValveAktif[2]` | BOOL | регулировка |
| support2Identity | Подпайщик 2 · назначение канала | `.stKaliciData.iValveId[2]` | INT | инженер |
| drill1Time | Пробойник 1 · время | `.stKaliciData.iValveDuration_ms[3]` | INT | регулировка |
| drill1Enabled | Пробойник 1 · включение | `.stKaliciData.bValveAktif[3]` | BOOL | регулировка |
| drill1Identity | Пробойник 1 · назначение канала | `.stKaliciData.iValveId[3]` | INT | инженер |
| videojet1Time | Videojet 1 · время | `.stKaliciData.iValveDuration_ms[4]` | INT | регулировка |
| videojet1Enabled | Videojet 1 · включение | `.stKaliciData.bValveAktif[4]` | BOOL | регулировка |
| videojet1Identity | Videojet 1 · назначение канала | `.stKaliciData.iValveId[4]` | INT | инженер |
| handle1Time | Ручка 1 · время | `.stKaliciData.iValveDuration_ms[5]` | INT | регулировка |
| handle1Enabled | Ручка 1 · включение | `.stKaliciData.bValveAktif[5]` | BOOL | регулировка |
| handle1Identity | Ручка 1 · назначение канала | `.stKaliciData.iValveId[5]` | INT | инженер |
| photoEnabled | Фотометка · включение | `.stKaliciData.sRecipeData.bPrintMarkAktif` | BOOL | регулировка |
| photoSearchWindow | Фотометка · окно контроля метки | `.stKaliciData.sRecipeData.rPrintmarkKontrolAralik` | REAL | регулировка |
| photoMissLimit | Фотометка · пропуски до остановки | `.stKaliciData.sRecipeData.diIndexGormemeAdet` | DINT | регулировка |
| photoOffsetTenths | Фотометка · смещение позиции | `.stKaliciData.sRecipeData.rIndexPosOfset` | REAL | регулировка |
| photoLength | Фотометка · средняя длина | `.LRVISUORTALAMABOY` | LREAL | чтение / отдельная команда |
| airStartAngle | Начало раздува | `.stKaliciData.sRecipeData.rMedaneArasiValf_StartAci` | REAL | регулировка |
| airStopAngle | Конец раздува | `.stKaliciData.sRecipeData.rMedaneArasiValf_StopAci` | REAL | регулировка |
| edge1Auto | Краевой контроль 1 · автоматический контроль | `.stKaliciData.bOpKenKontrolOto[1]` | BOOL | регулировка |
| edge1Reverse | Краевой контроль 1 · обратное направление | `.stKaliciData.bKenarKontrolReverse[1]` | BOOL | регулировка |
| edge2Auto | Краевой контроль 2 · автоматический контроль | `.stKaliciData.bOpKenKontrolOto[2]` | BOOL | регулировка |
| edge2Reverse | Краевой контроль 2 · обратное направление | `.stKaliciData.bKenarKontrolReverse[2]` | BOOL | регулировка |
| edge3Auto | Краевой контроль 3 · автоматический контроль | `.stKaliciData.bOpKenKontrolOto[3]` | BOOL | регулировка |
| edge3Reverse | Краевой контроль 3 · обратное направление | `.stKaliciData.bKenarKontrolReverse[3]` | BOOL | регулировка |
| workingLength | Рабочая длина изделия | `.rMakineUrunBoy` | REAL | чтение / отдельная команда |
| edge1Position | Краевой контроль 1 · положение | `KenKontrol.FbKenKontrol[1].LrActPosition` | LREAL | чтение / отдельная команда |
| edge2Position | Краевой контроль 2 · положение | `KenKontrol.FbKenKontrol[2].LrActPosition` | LREAL | чтение / отдельная команда |
| edge3Position | Краевой контроль 3 · положение | `KenKontrol.FbKenKontrol[3].LrActPosition` | LREAL | чтение / отдельная команда |
| edgeChannelCount | Число каналов краевого контроля | `.stKaliciData.iKenarKontrolSayisi` | INT | инженер |
| takeoffPosition | Положение приёмного вала | `.sDizgi.LrActModPos` | LREAL | чтение / отдельная команда |
| ejectPosition | Положение выкидных валов | `.sTutucu.LrActModPos` | LREAL | чтение / отдельная команда |
| dancer1Reference | Канал баллерины 1 | `Slow_Task.iYolunaKaynakRef1` | INT | чтение / отдельная команда |
| dancer2Reference | Канал баллерины 2 | `Slow_Task.iYolunaKaynakRef2` | INT | чтение / отдельная команда |
| dancer1Position | Баллерина 1 | `Salmalar.rScaledBalerin[Slow_Task.iYolunaKaynakRef1]` | REAL | чтение / отдельная команда |
| dancer2Position | Баллерина 2 | `Salmalar.rScaledBalerin[Slow_Task.iYolunaKaynakRef2]` | REAL | чтение / отдельная команда |
| feedStartActual | Фактический угол начала подачи | `x_CENE.lrMerdaneStartPos` | LREAL | чтение / отдельная команда |
| feedStopActual | Фактический угол прекращения подачи | `x_CENE.lrMerdaneStopPos` | LREAL | чтение / отдельная команда |
| jawActualAngle | Фактический угол ножа | `MAIN.LrActCeneAci` | LREAL | чтение / отдельная команда |
| feedStartSet | Начало подачи | `.stKaliciData.sRecipeData.rCeneAciMerdanePosBas` | REAL | инженер |
| feedStopSet | Прекращение подачи | `.stKaliciData.sRecipeData.rCeneAciMerdanePosBit` | REAL | инженер |
| jawOffset | Смещение ножа | `.stKaliciData.rCeneSenkronOfset` | REAL | инженер |
| jawServoGearQuantity | Зубья шестерни сервопривода | `.stKaliciData.sRecipeData.rCeneMotorDisliSayisi` | REAL | инженер |
| jawGearQuantity | Зубья шестерни ножа | `.stKaliciData.sRecipeData.rCeneHareketDisliSayisi` | REAL | инженер |
| jawWeldingAngleWindow | Угловое окно сварки | `.stKaliciData.sRecipeData.rBicakSenkronAralik` | REAL | инженер |
| jawJogSpeed | Скорость ручного хода ножа | `.stKaliciData.sRecipeData.rCeneJogHiz` | REAL | инженер |
| moonstepAccCoefficient | Moonstep · разгон | `.stKaliciData.sRecipeData.rCeneKaynakHizAcc` | REAL | инженер |
| moonstepDecCoefficient | Moonstep · замедление | `.stKaliciData.sRecipeData.rCeneKaynakHizDec` | REAL | инженер |
| ceneHizAdimi | Шаг изменения скорости ножа | `.stKaliciData.rCeneHizAdetAdim_dk` | REAL | инженер |
| sistemBaslangicHizi | Начальная скорость | `.stKaliciData.rBaslangicHiz` | REAL | инженер |
| ceneMaksIvme | Максимальное ускорение ножа | `.stKaliciData.rCeneMaxIvme` | REAL | инженер |
| ceneMaksHiz | Максимальная скорость ножа | `.stKaliciData.rCeneMaxHiz_desn` | REAL | инженер |
| ceneTrafoManRef | Ручное задание трансформатора | `.stKaliciData.iCeneTrafoManRef` | INT | инженер |
| unwinderAutoStop | Остановка по датчику остатка материала | `.stKaliciData.bMalAzaldiStop` | BOOL | регулировка |
| unwinderSensorPresent | Датчик остатка материала установлен | `.stKaliciData.bMalAzaldiSenVar` | BOOL | инженер |
| edge1JogFw | Краевой контроль 1 · вперёд | `KenKontrol.bKenKontrolJogFw[1]` | BOOL | чтение / отдельная команда |
| edge1JogBw | Краевой контроль 1 · назад | `KenKontrol.bKenKontrolJogBw[1]` | BOOL | чтение / отдельная команда |
| edge2JogFw | Краевой контроль 2 · вперёд | `KenKontrol.bKenKontrolJogFw[2]` | BOOL | чтение / отдельная команда |
| edge2JogBw | Краевой контроль 2 · назад | `KenKontrol.bKenKontrolJogBw[2]` | BOOL | чтение / отдельная команда |
| edge3JogFw | Краевой контроль 3 · вперёд | `KenKontrol.bKenKontrolJogFw[3]` | BOOL | чтение / отдельная команда |
| edge3JogBw | Краевой контроль 3 · назад | `KenKontrol.bKenKontrolJogBw[3]` | BOOL | чтение / отдельная команда |
| takeoffJog | Ручной ход приёмного вала | `.sDizgi.bIleri` | BOOL | чтение / отдельная команда |
| ejectJogFw | Выкидные валы · вперёд | `.sTutucu.bIleri` | BOOL | чтение / отдельная команда |
| ejectJogBw | Выкидные валы · назад | `.sTutucu.bGeri` | BOOL | чтение / отдельная команда |
| glueReset | Сброс клея | `HotmeltUnite1.bHotmeltSensorReset_but` | BOOL | чтение / отдельная команда |
| glueTest | Тест клея | `HotmeltUnite1.bHotmeltTest` | BOOL | чтение / отдельная команда |
| photoReset | Обучение фотометки | `MAIN.bIndexSensorReset_but` | BOOL | чтение / отдельная команда |
| knifeSave | Применить настройки ножа | `.sCene.bWriteSF` | BOOL | чтение / отдельная команда |
| alarmAck | Подтвердить аварии | `.stA.bAlarmResetOP` | BOOL | чтение / отдельная команда |
| alarmClear | Очистить историю аварий | `.stA.bClearList` | BOOL | чтение / отдельная команда |
| groupsReset | Сброс счётчика пачек | `MAIN.bGrupAdetReset` | BOOL | чтение / отдельная команда |
| totalReset | Сброс общего счётчика | `MAIN.bToplamAdetReset` | BOOL | чтение / отдельная команда |
| widthMinimum | Предел HMI · widthMinimum | `MAIN.rMinUrunBoy` | REAL | чтение / отдельная команда |
| widthMaximum | Предел HMI · widthMaximum | `MAIN.rMaxUrunBoy` | REAL | чтение / отдельная команда |
| waitingMinimum | Предел HMI · waitingMinimum | `MAIN.diMinCeneBosVurusAdet` | DINT | чтение / отдельная команда |
| weldingLimit | Предел HMI · weldingLimit | `x_CENE.lrCeneHizLimit2` | LREAL | чтение / отдельная команда |
| heat1Limit | Предел HMI · heat1Limit | `.stKaliciData.iMaxSetSicaklik[1]` | INT | инженер |
| heat2Limit | Предел HMI · heat2Limit | `.stKaliciData.iMaxSetSicaklik[2]` | INT | инженер |
| heat3Limit | Предел HMI · heat3Limit | `.stKaliciData.iMaxSetSicaklik[3]` | INT | инженер |
| heat4Limit | Предел HMI · heat4Limit | `.stKaliciData.iMaxSetSicaklik[4]` | INT | инженер |
| heat5Limit | Предел HMI · heat5Limit | `.stKaliciData.iMaxSetSicaklik[5]` | INT | инженер |
| heat6Limit | Предел HMI · heat6Limit | `.stKaliciData.iMaxSetSicaklik[6]` | INT | инженер |
| currentReset | Сброс текущей пачки | `MAIN.bAdetReset` | BOOL | чтение / отдельная команда |
| equipmentTemperature | Комплектация · нагрев | `.stKaliciData.bIsiKontrolVar` | BOOL | инженер |
| equipmentGlue | Комплектация · клей | `.stKaliciData.bHotmeltUniteVar` | BOOL | инженер |
| equipmentSeamHidden | Комплектация · скрыть продольный шов | `Slow_Task.bYolunaKaynakInvisible` | BOOL | чтение / отдельная команда |
| equipmentLiner | Комплектация · лайнер | `.stKaliciData.bBantVar` | BOOL | инженер |
| equipmentEjectServo | Комплектация · сервопривод выкидных валов | `MAIN.bTutucuServoEnable` | BOOL | чтение / отдельная команда |
| equipmentEjectAC | Комплектация · выкидные валы AC | `.stKaliciData.bAcTutucuUnite` | BOOL | инженер |
| equipmentEjectAutoJog | Комплектация · выкидные валы AutoJog | `.stKaliciData.bTutucuServoAutoJogMode` | BOOL | инженер |
| equipmentTakeoff | Комплектация · приёмный вал | `.stKaliciData.bDizgiServoVar` | BOOL | инженер |
| cfgCeneServoVar | Сервопривод ножа | `.stKaliciData.bCeneServoVar` | BOOL | инженер |
| cfgElgecmeServoVar | Сервопривод вырубной ручки | `.stKaliciData.bElgecmeServoVar` | BOOL | инженер |
| cfgTutucuServoVar | Сервопривод выкидных валов | `.stKaliciData.bTutucuServoVar` | BOOL | инженер |
| cfgSariciVar | Намотчик | `.stKaliciData.bSariciVar` | BOOL | инженер |
| cfgDelikEncUniteVar | Многократная пробивка | `.stKaliciData.bDelikEncUniteVar` | BOOL | инженер |
| cfgBalerin2PotansCalismaAktif | Баллерина 2: прямой потенциометр | `.stKaliciData.bBalerin2PotansCalismaAktif` | BOOL | чтение / отдельная команда |
| cfgPotansliCalismaAktif | Управление потенциометром | `.stKaliciData.bPotansliCalismaAktif` | BOOL | инженер |
| cfgSistemdeEmniyetPLCVar | ПЛК безопасности установлен | `.stKaliciData.bSistemdeEmniyetPLCVar` | BOOL | инженер |
| cfgEmniyetPLC_ModulluVersiyon | ПЛК безопасности с модулями | `.stKaliciData.bEmniyetPLC_ModulluVersiyon` | BOOL | инженер |
| cfgEmniyetKapilarPasif | Контроль дверей отключён | `.stKaliciData.bEmniyetKapilarPasif` | BOOL | инженер |
| cfgEmniyetKapiVAR | Защитные двери установлены | `.stKaliciData.bEmniyetKapiVAR` | BOOL | инженер |
| cfgEmniyetBariyerVAR | Защитный барьер установлен | `.stKaliciData.bEmniyetBariyerVAR` | BOOL | инженер |
| cfgYolunaKaynakVar1 | Продольный шов 1 | `.stKaliciData.bYolunaKaynakVar1` | BOOL | инженер |
| cfgYolunaKaynakVar2 | Продольный шов 2 | `.stKaliciData.bYolunaKaynakVar2` | BOOL | инженер |
| cfgEkKartUniteVar | Узел подачи картонной вставки | `.stKaliciData.bEkKartUniteVar` | BOOL | инженер |
| cfgCiftCeneUnite | Двойной нож | `.stKaliciData.bCiftCeneUnite` | BOOL | инженер |
| cfgSonicUniteVar | Ультразвуковой узел | `.stKaliciData.bSonicUniteVar` | BOOL | инженер |
| cfgDilimlemeUniteVar | Узел продольной резки | `.stKaliciData.bDilimlemeUniteVar` | BOOL | инженер |
| cfgLoadCellUniteVar | Контроль натяжения тензодатчиком | `.stKaliciData.bLoadCellUniteVar` | BOOL | инженер |
| cfgLoadcelModulVar | Модуль тензодатчика EL3351 | `.stKaliciData.bLoadcelModulVar` | BOOL | инженер |
| cfgAciciCapSensorAktif | Датчик диаметра размотки | `.stKaliciData.bAciciCapSensorAktif` | BOOL | инженер |
| cfgYumusakSapUniteVarYok | Пневматическая мягкая ручка | `.stKaliciData.bYumusakSapUniteVarYok` | BOOL | инженер |
| cfgZipYolunaKaynakUniteVarYok | Продольная сварка зиппера | `.stKaliciData.bZipYolunaKaynakUniteVarYok` | BOOL | инженер |
| cfgKatlamaUniteOpsiyon | Узел складывания | `.stKaliciData.bKatlamaUniteOpsiyon` | BOOL | инженер |
| cfgKatlamaEK1100 | Станция EK1100 узла складывания | `.stKaliciData.bKatlamaEK1100` | BOOL | инженер |
| cfgTakviyeVar | Узел усиления | `.stKaliciData.bTakviyeVar` | BOOL | инженер |
| cfgEkKaynakServoVar | Сервопривод дополнительной сварки | `.stKaliciData.bEkKaynakServoVar` | BOOL | инженер |
| cfgTavukFireUnite | Удаление отхода Tavuk | `.stKaliciData.bTavukFireUnite` | BOOL | инженер |
| cfgTakviyeHatCekiciUnite | Протяжка усилительной вставки | `.stKaliciData.bTakviyeHatCekiciUnite` | BOOL | инженер |
| cfgSenkronMerdane2Var | Синхронный вал 1 | `.stKaliciData.bSenkronMerdane2Var` | BOOL | инженер |
| cfgSenkronMerdane3Var | Синхронный вал 2 | `.stKaliciData.bSenkronMerdane3Var` | BOOL | инженер |
| cfgHotmelt2UniteVar | Клеевая станция 2 | `.stKaliciData.bHotmelt2UniteVar` | BOOL | инженер |
| cfgInchMode | Размеры в дюймах | `.stKaliciData.bInchMode` | BOOL | инженер |
| cfgElGecme2ServoVar | Сервопривод вырубной ручки 2 | `.stKaliciData.bElGecme2ServoVar` | BOOL | инженер |
| cfgHotmelt3UniteVar | Клеевой клапан 3 | `.stKaliciData.bHotmelt3UniteVar` | BOOL | инженер |
| cfgHotmeltSwKontrol | Контроль готовности клеевой станции | `.stKaliciData.bHotmeltSwKontrol` | BOOL | инженер |
| cfgSicaklikAlarmStopYapsin | Остановка по аварии температуры | `.stKaliciData.bSicaklikAlarmStopYapsin` | BOOL | инженер |
| cfgZipperUniteVar | Узел зиппера | `.stKaliciData.bZipperUniteVar` | BOOL | инженер |
| cfgTeflonUniteVar | Узел тефлоновой ленты | `.stKaliciData.bTeflonUniteVar` | BOOL | инженер |
| cfgIstiflemePistonuYOK | Укладочный пневмоцилиндр отключён | `.stKaliciData.bIstiflemePistonuYOK` | BOOL | инженер |
| cfgKorukUniteVar | Узел формирования складки Körük | `.stKaliciData.bKorukUniteVar` | BOOL | инженер |
| cfgServoYumusakSapUniteVarYok | Сервопривод мягкой ручки | `.stKaliciData.bServoYumusakSapUniteVarYok` | BOOL | инженер |
| cfgUrunToplamaVar | Сбор изделий с мягкой ручкой | `.stKaliciData.bUrunToplamaVar` | BOOL | инженер |
| cfgYolunaKaynakBlowerVar | Обдув продольного шва | `.stKaliciData.bYolunaKaynakBlowerVar` | BOOL | инженер |
| cfgOPCActive | Обмен OPC UA в ПЛК | `.stKaliciData.bOPCActive` | BOOL | инженер |
| cfgAcic2UniteVar | Размотчик 2 | `.stKaliciData.bAcic2UniteVar` | BOOL | инженер |
| cfgSedefTakmaVarYok | Узел Sedef Takma | `.stKaliciData.bSedefTakmaVarYok` | BOOL | инженер |
| cfgKargoMakinasi | Исполнение Kargo | `.stKaliciData.bKargoMakinasi` | BOOL | инженер |
| cfgAkimAlarmStopYapsin | Остановка по аварии тока | `.stKaliciData.bAkimAlarmStopYapsin` | BOOL | инженер |
| cfgInjetUniteVar | Узел Injet | `.stKaliciData.bInjetUniteVar` | BOOL | инженер |
| cfgMerkezPanoStopSinyaliVar | Сигнал «Стоп» центрального шкафа | `.stKaliciData.bMerkezPanoStopSinyaliVar` | BOOL | инженер |
| cfgKargoPanoStopSinyaliVar | Сигнал «Стоп» шкафа Kargo | `.stKaliciData.bKargoPanoStopSinyaliVar` | BOOL | инженер |
| cfgHotmeltEncoderModuluVar | Модуль энкодера клеевой станции | `.stKaliciData.bHotmeltEncoderModuluVar` | BOOL | инженер |
| cfgCurrentAlarmDelay | Задержка остановки по току | `.stKaliciData.iAkimAlarmStopDelayTime_sn` | INT | инженер |
| cfgGlueEncoderPulses | Импульсов энкодера клея | `.stKaliciData.rHotmeltEncoderPulse` | REAL | инженер |
| glueActualReference | Актуальный коэффициент подачи клея | `.AO_HotmeltRef` | INT | чтение / отдельная команда |
| glueRollDiameter | Диаметр вала | `.stKaliciData.sRecipeData.rHotmeltEncoder_MerdaneCap` | REAL | регулировка |
| glueScaleSave | Применить масштаб энкодера клея | `.sHotmeltEncoder.bWriteSF` | BOOL | чтение / отдельная команда |
| glueScaleWritten | Масштаб энкодера клея применён | `.sHotmeltEncoder.bWrittenSF` | BOOL | чтение / отдельная команда |
| perfDualFeedStart | Начало подачи · двойной нож | `.stKaliciData.rCiftCeneAciMerdanePosBas` | REAL | инженер |
| perfDualFeedStop | Окончание подачи · двойной нож | `.stKaliciData.rCiftCeneAciMerdanePosBit` | REAL | инженер |
| perfJawRateLimit | Предел частоты ножа | `.stKaliciData.sRecipeData.rCeneVurusMaxHizAd_dk` | REAL | инженер |
| perfFilmSpeedLimit | Предел скорости плёнки | `.stKaliciData.sRecipeData.rHatHizMax_m_dk` | REAL | инженер |
| perfDualJawRateLimit | Предел выпуска · двойной нож | `.stKaliciData.rCiftCeneMaxHiz_addk` | REAL | инженер |
| perfFeedAcceleration | Максимальное ускорение подачи | `.stKaliciData.rMerdaneMaxIvme` | REAL | инженер |
| perfBatchPrewarning | Предупреждение до конца пачки | `.stKaliciData.sRecipeData.diAdetOnceUyari` | DINT | инженер |
| perfJawEarlyOffset | Коррекция раннего отвода ножа | `.stKaliciData.rCeneErkenKacmaPos` | REAL | инженер |
| perfProductLengthLimit | Максимальная длина изделия | `.stKaliciData.iMaxUrunBoyu_mm` | INT | инженер |
| perfHydraulicMode | Режим гидравлики | `.stKaliciData.iHidrolikCalismaID` | INT | инженер |
| perfBasketSpeedFactor | Коэффициент скорости Sepet Cozgu | `.stKaliciData.rSepetCozguHizCarpani` | REAL | инженер |
| perfBasketManualSpeed | Ручная скорость Sepet Cozgu | `.stKaliciData.iSepetCozguManHizRef` | INT | инженер |
| perfInjet1Distance | Фотодатчик клея → Injet 1 | `.stKaliciData.rHotmelt1FotoselInjet1Mesafe` | REAL | инженер |
| perfInjet2Distance | Фотодатчик клея → Injet 2 | `.stKaliciData.rHotmelt1FotoselInjet2Mesafe` | REAL | инженер |
| perfLabelDistance | Фотодатчик клея → этикетка | `.stKaliciData.rHotmelt1FotoselEtiketMesafe` | REAL | инженер |
| perfLabelDelay | Задержка клапана этикетки | `.stKaliciData.iEtiketValfGecikmesi_ms` | INT | инженер |
| perfInjet1Delay | Задержка Injet 1 | `.stKaliciData.iInjet1Gecikmesi_ms` | INT | инженер |
| perfInjet2Delay | Задержка Injet 2 | `.stKaliciData.iInjet2Gecikmesi_ms` | INT | инженер |
| perfReinforcementIdleStrokes | Минимум холостых ударов · усиление | `.stKaliciData.diCeneMinBosVurmaAdet_Takviye` | DINT | инженер |
| perfInterbatchBrakeFactor | Усиление торможения между пачками | `.stKaliciData.rPaketArasiFrenKatsayi` | REAL | инженер |
| perfLowMaterialTime | Задержка остатка рулона · при макс. скорости | `.stKaliciData.rMalAzaldiSuresi` | REAL | инженер |
| perfLowMaterialActual | Расчётная задержка остатка рулона | `Slow_Task.rMalAzaldiSuresi` | REAL | чтение / отдельная команда |
| edgeSensitivity | Чувствительность краевого контроля | `.stKaliciData.rKenarKontrol_OluBolge` | REAL | регулировка |
| eng0001 | Диаметр подающего вала | `.stKaliciData.sRecipeData.rMerdaneCap1` | REAL | инженер |
| eng0002 | Передаточное отношение подачи | `.stKaliciData.sRecipeData.rMerdane1Reduksiyon` | REAL | инженер |
| eng0003 | Скорость обратного хода | `.stKaliciData.sRecipeData.rMerdaneGeriPosHizi` | REAL | инженер |
| eng0004 | Скорость ручной протяжки | `.stKaliciData.sRecipeData.rMerdaneJogHiz` | REAL | инженер |
| eng0005 | Длина обратного хода | `.stKaliciData.sRecipeData.rMerdaneGeriPosMesafe` | REAL | инженер |
| eng0006 | Угол начала обратного хода | `.stKaliciData.sRecipeData.rMerdaneGeriAci` | REAL | инженер |
| eng0007 | Разгон при ручной протяжке | `.stKaliciData.rMerdaneJogAcc` | REAL | инженер |
| eng0008 | Задержка старта подачи | `.stKaliciData.sRecipeData.diStartBeklemeSure` | DINT | инженер |
| eng0009 | Максимальная скорость подачи | `.stKaliciData.rMaxMerdaneHiz` | REAL | инженер |
| eng0010 | Применение: .sMerdane1.bWriteSF | `.sMerdane1.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0011 | Диаметр синхронного вала 1 | `.stKaliciData.sRecipeData.rMerdaneCap2` | REAL | инженер |
| eng0012 | Передаточное отношение синхронного вала 1 | `.stKaliciData.sRecipeData.rMerdane2Reduksiyon` | REAL | инженер |
| eng0013 | Диаметр синхронного вала 2 | `.stKaliciData.sRecipeData.rMerdaneCap3` | REAL | инженер |
| eng0014 | Передаточное отношение синхронного вала 2 | `.stKaliciData.sRecipeData.rMerdane3Reduksiyon` | REAL | инженер |
| eng0015 | Применение: .sMerdane3.bWriteSF | `.sMerdane3.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0016 | Применение: .sMerdane2.bWriteSF | `.sMerdane2.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0017 | Начальная скорость шва | `.stKaliciData.rCeneKaynakBaslangicHizi_addk` | REAL | инженер |
| eng0018 | Заданное положение баллерины | `.stKaliciData.Salma[1].rBalerinSetPos` | REAL | инженер |
| eng0019 | Разгон баллерины | `.stKaliciData.Salma[1].rAcc_sn` | REAL | инженер |
| eng0020 | Нижний порог положения | `.stKaliciData.Salma[1].rBalerinDownLimDegeri` | REAL | инженер |
| eng0021 | Замедление баллерины | `.stKaliciData.Salma[1].rDec_sn` | REAL | инженер |
| eng0022 | Верхний порог положения | `.stKaliciData.Salma[1].rBalerinUpLimDegeri` | REAL | инженер |
| eng0023 | Максимальная скорость баллерины | `.stKaliciData.Salma[1].rMaxHiz` | REAL | инженер |
| eng0024 | Минимальная скорость баллерины | `.stKaliciData.Salma[1].rMinHiz` | REAL | инженер |
| eng0025 | Скорость ручного Jog | `.stKaliciData.Salma[1].rJogHizi` | REAL | инженер |
| eng0026 | Коэффициент остановки баллерины | `.stKaliciData.Salma[1].rStopFactor` | REAL | инженер |
| eng0027 | Замедление баллерины между пачками | `.stKaliciData.rBalerinPaketArasiYavaslamaRampasi_sn` | REAL | инженер |
| eng0028 | Замедление баллерины при остановке | `.stKaliciData.rBalerinDurusRampasi_sn` | REAL | инженер |
| eng0029 | Прямое управление потенциометром · канал 1 | `.stKaliciData.Salma[1].bRunViaPotans` | BOOL | инженер |
| eng0030 | Положение баллерины | `Salmalar.rScaledBalerin[1]` | REAL | чтение / отдельная команда |
| eng0031 | Заданное положение баллерины | `.stKaliciData.Salma[2].rBalerinSetPos` | REAL | инженер |
| eng0032 | Разгон баллерины | `.stKaliciData.Salma[2].rAcc_sn` | REAL | инженер |
| eng0033 | Нижний порог положения | `.stKaliciData.Salma[2].rBalerinDownLimDegeri` | REAL | инженер |
| eng0034 | Замедление баллерины | `.stKaliciData.Salma[2].rDec_sn` | REAL | инженер |
| eng0035 | Верхний порог положения | `.stKaliciData.Salma[2].rBalerinUpLimDegeri` | REAL | инженер |
| eng0036 | Максимальная скорость баллерины | `.stKaliciData.Salma[2].rMaxHiz` | REAL | инженер |
| eng0037 | Минимальная скорость баллерины | `.stKaliciData.Salma[2].rMinHiz` | REAL | инженер |
| eng0038 | Скорость ручного Jog | `.stKaliciData.Salma[2].rJogHizi` | REAL | инженер |
| eng0039 | Коэффициент остановки баллерины | `.stKaliciData.Salma[2].rStopFactor` | REAL | инженер |
| eng0040 | Прямое управление потенциометром · канал 2 | `.stKaliciData.Salma[2].bRunViaPotans` | BOOL | инженер |
| eng0041 | Положение баллерины | `Salmalar.rScaledBalerin[2]` | REAL | чтение / отдельная команда |
| eng0042 | Заданное положение баллерины | `.stKaliciData.Salma[3].rBalerinSetPos` | REAL | инженер |
| eng0043 | Разгон баллерины | `.stKaliciData.Salma[3].rAcc_sn` | REAL | инженер |
| eng0044 | Нижний порог положения | `.stKaliciData.Salma[3].rBalerinDownLimDegeri` | REAL | инженер |
| eng0045 | Замедление баллерины | `.stKaliciData.Salma[3].rDec_sn` | REAL | инженер |
| eng0046 | Верхний порог положения | `.stKaliciData.Salma[3].rBalerinUpLimDegeri` | REAL | инженер |
| eng0047 | Максимальная скорость баллерины | `.stKaliciData.Salma[3].rMaxHiz` | REAL | инженер |
| eng0048 | Минимальная скорость баллерины | `.stKaliciData.Salma[3].rMinHiz` | REAL | инженер |
| eng0049 | Скорость ручного Jog | `.stKaliciData.Salma[3].rJogHizi` | REAL | инженер |
| eng0050 | Коэффициент остановки баллерины | `.stKaliciData.Salma[3].rStopFactor` | REAL | инженер |
| eng0051 | Прямое управление потенциометром · канал 3 | `.stKaliciData.Salma[3].bRunViaPotans` | BOOL | инженер |
| eng0052 | Положение баллерины | `Salmalar.rScaledBalerin[3]` | REAL | чтение / отдельная команда |
| eng0053 | Заданное положение баллерины | `.stKaliciData.Salma[7].rBalerinSetPos` | REAL | инженер |
| eng0054 | Разгон баллерины | `.stKaliciData.Salma[7].rAcc_sn` | REAL | инженер |
| eng0055 | Нижний порог положения | `.stKaliciData.Salma[7].rBalerinDownLimDegeri` | REAL | инженер |
| eng0056 | Замедление баллерины | `.stKaliciData.Salma[7].rDec_sn` | REAL | инженер |
| eng0057 | Верхний порог положения | `.stKaliciData.Salma[7].rBalerinUpLimDegeri` | REAL | инженер |
| eng0058 | Максимальная скорость баллерины | `.stKaliciData.Salma[7].rMaxHiz` | REAL | инженер |
| eng0059 | Минимальная скорость баллерины | `.stKaliciData.Salma[7].rMinHiz` | REAL | инженер |
| eng0060 | Скорость ручного Jog | `.stKaliciData.Salma[7].rJogHizi` | REAL | инженер |
| eng0061 | Коэффициент остановки баллерины | `.stKaliciData.Salma[7].rStopFactor` | REAL | инженер |
| eng0062 | Прямое управление потенциометром · канал 7 | `.stKaliciData.Salma[7].bRunViaPotans` | BOOL | инженер |
| eng0063 | Положение баллерины | `Salmalar.rScaledBalerin[7]` | REAL | чтение / отдельная команда |
| eng0064 | Заданное положение баллерины | `.stKaliciData.Salma[10].rBalerinSetPos` | REAL | инженер |
| eng0065 | Разгон баллерины | `.stKaliciData.Salma[10].rAcc_sn` | REAL | инженер |
| eng0066 | Нижний порог положения | `.stKaliciData.Salma[10].rBalerinDownLimDegeri` | REAL | инженер |
| eng0067 | Замедление баллерины | `.stKaliciData.Salma[10].rDec_sn` | REAL | инженер |
| eng0068 | Верхний порог положения | `.stKaliciData.Salma[10].rBalerinUpLimDegeri` | REAL | инженер |
| eng0069 | Максимальная скорость баллерины | `.stKaliciData.Salma[10].rMaxHiz` | REAL | инженер |
| eng0070 | Минимальная скорость баллерины | `.stKaliciData.Salma[10].rMinHiz` | REAL | инженер |
| eng0071 | Скорость ручного Jog | `.stKaliciData.Salma[10].rJogHizi` | REAL | инженер |
| eng0072 | Коэффициент остановки баллерины | `.stKaliciData.Salma[10].rStopFactor` | REAL | инженер |
| eng0073 | Положение баллерины | `Salmalar.rScaledBalerin[10]` | REAL | чтение / отдельная команда |
| eng0074 | Заданное положение баллерины | `.stKaliciData.Salma[4].rBalerinSetPos` | REAL | инженер |
| eng0075 | Разгон баллерины | `.stKaliciData.Salma[4].rAcc_sn` | REAL | инженер |
| eng0076 | Нижний порог положения | `.stKaliciData.Salma[4].rBalerinDownLimDegeri` | REAL | инженер |
| eng0077 | Замедление баллерины | `.stKaliciData.Salma[4].rDec_sn` | REAL | инженер |
| eng0078 | Верхний порог положения | `.stKaliciData.Salma[4].rBalerinUpLimDegeri` | REAL | инженер |
| eng0079 | Максимальная скорость баллерины | `.stKaliciData.Salma[4].rMaxHiz` | REAL | инженер |
| eng0080 | Минимальная скорость баллерины | `.stKaliciData.Salma[4].rMinHiz` | REAL | инженер |
| eng0081 | Скорость ручного Jog | `.stKaliciData.Salma[4].rJogHizi` | REAL | инженер |
| eng0082 | Коэффициент остановки баллерины | `.stKaliciData.Salma[4].rStopFactor` | REAL | инженер |
| eng0083 | Прямое управление потенциометром · канал 4 | `.stKaliciData.Salma[4].bRunViaPotans` | BOOL | инженер |
| eng0084 | Положение баллерины | `Salmalar.rScaledBalerin[4]` | REAL | чтение / отдельная команда |
| eng0085 | Заданное положение баллерины | `.stKaliciData.Salma[5].rBalerinSetPos` | REAL | инженер |
| eng0086 | Разгон баллерины | `.stKaliciData.Salma[5].rAcc_sn` | REAL | инженер |
| eng0087 | Нижний порог положения | `.stKaliciData.Salma[5].rBalerinDownLimDegeri` | REAL | инженер |
| eng0088 | Замедление баллерины | `.stKaliciData.Salma[5].rDec_sn` | REAL | инженер |
| eng0089 | Верхний порог положения | `.stKaliciData.Salma[5].rBalerinUpLimDegeri` | REAL | инженер |
| eng0090 | Максимальная скорость баллерины | `.stKaliciData.Salma[5].rMaxHiz` | REAL | инженер |
| eng0091 | Минимальная скорость баллерины | `.stKaliciData.Salma[5].rMinHiz` | REAL | инженер |
| eng0092 | Скорость ручного Jog | `.stKaliciData.Salma[5].rJogHizi` | REAL | инженер |
| eng0093 | Коэффициент остановки баллерины | `.stKaliciData.Salma[5].rStopFactor` | REAL | инженер |
| eng0094 | Прямое управление потенциометром · канал 5 | `.stKaliciData.Salma[5].bRunViaPotans` | BOOL | инженер |
| eng0095 | Положение баллерины | `Salmalar.rScaledBalerin[5]` | REAL | чтение / отдельная команда |
| eng0096 | Заданное положение баллерины | `.stKaliciData.Salma[6].rBalerinSetPos` | REAL | инженер |
| eng0097 | Разгон баллерины | `.stKaliciData.Salma[6].rAcc_sn` | REAL | инженер |
| eng0098 | Нижний порог положения | `.stKaliciData.Salma[6].rBalerinDownLimDegeri` | REAL | инженер |
| eng0099 | Замедление баллерины | `.stKaliciData.Salma[6].rDec_sn` | REAL | инженер |
| eng0100 | Верхний порог положения | `.stKaliciData.Salma[6].rBalerinUpLimDegeri` | REAL | инженер |
| eng0101 | Максимальная скорость баллерины | `.stKaliciData.Salma[6].rMaxHiz` | REAL | инженер |
| eng0102 | Минимальная скорость баллерины | `.stKaliciData.Salma[6].rMinHiz` | REAL | инженер |
| eng0103 | Скорость ручного Jog | `.stKaliciData.Salma[6].rJogHizi` | REAL | инженер |
| eng0104 | Коэффициент остановки баллерины | `.stKaliciData.Salma[6].rStopFactor` | REAL | инженер |
| eng0105 | Стоп-диаметр рулона усиления | `.stKaliciData.iKartCozguDurusCapi_mm` | INT | инженер |
| eng0106 | Прямое управление потенциометром · канал 6 | `.stKaliciData.Salma[6].bRunViaPotans` | BOOL | инженер |
| eng0107 | Положение баллерины | `Salmalar.rScaledBalerin[6]` | REAL | чтение / отдельная команда |
| eng0108 | Диаметр рулона усиления | `x_KARTCOZGU.rActuelCap_mm` | REAL | чтение / отдельная команда |
| eng0109 | Канал 15 · Назначение канала | `.stKaliciData.iActiveHeatId[15]` | INT | инженер |
| eng0110 | Канал 14 · Назначение канала | `.stKaliciData.iActiveHeatId[14]` | INT | инженер |
| eng0111 | Канал 13 · Назначение канала | `.stKaliciData.iActiveHeatId[13]` | INT | инженер |
| eng0112 | Канал 12 · Назначение канала | `.stKaliciData.iActiveHeatId[12]` | INT | инженер |
| eng0113 | Канал 11 · Назначение канала | `.stKaliciData.iActiveHeatId[11]` | INT | инженер |
| eng0114 | Канал 10 · Назначение канала | `.stKaliciData.iActiveHeatId[10]` | INT | инженер |
| eng0115 | Канал 9 · Назначение канала | `.stKaliciData.iActiveHeatId[9]` | INT | инженер |
| eng0116 | Канал 8 · Назначение канала | `.stKaliciData.iActiveHeatId[8]` | INT | инженер |
| eng0117 | Канал 7 · Назначение канала | `.stKaliciData.iActiveHeatId[7]` | INT | инженер |
| eng0118 | Количество каналов нагрева | `.stKaliciData.iActiveHeatNumer` | INT | инженер |
| eng0119 | Канал 5 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[5].KpHeat` | LREAL | инженер |
| eng0120 | Канал 4 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[4].KpHeat` | LREAL | инженер |
| eng0121 | Канал 3 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[3].KpHeat` | LREAL | инженер |
| eng0122 | Канал 2 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[2].KpHeat` | LREAL | инженер |
| eng0123 | Канал 1 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[1].KpHeat` | LREAL | инженер |
| eng0124 | Канал 5 · Td · время регулятора | `.stKaliciData.sParaControlInternal[5].TdHeat` | TIME | инженер |
| eng0125 | Канал 4 · Td · время регулятора | `.stKaliciData.sParaControlInternal[4].TdHeat` | TIME | инженер |
| eng0126 | Канал 3 · Td · время регулятора | `.stKaliciData.sParaControlInternal[3].TdHeat` | TIME | инженер |
| eng0127 | Канал 2 · Td · время регулятора | `.stKaliciData.sParaControlInternal[2].TdHeat` | TIME | инженер |
| eng0128 | Канал 1 · Td · время регулятора | `.stKaliciData.sParaControlInternal[1].TdHeat` | TIME | инженер |
| eng0129 | Канал 5 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[5].TnHeat` | TIME | инженер |
| eng0130 | Канал 4 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[4].TnHeat` | TIME | инженер |
| eng0131 | Канал 3 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[3].TnHeat` | TIME | инженер |
| eng0132 | Канал 2 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[2].TnHeat` | TIME | инженер |
| eng0133 | Канал 1 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[1].TnHeat` | TIME | инженер |
| eng0134 | Канал 5 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[5].TvHeat` | TIME | инженер |
| eng0135 | Канал 4 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[4].TvHeat` | TIME | инженер |
| eng0136 | Канал 3 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[3].TvHeat` | TIME | инженер |
| eng0137 | Канал 2 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[2].TvHeat` | TIME | инженер |
| eng0138 | Канал 1 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[1].TvHeat` | TIME | инженер |
| eng0139 | Канал 10 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[10]` | INT | инженер |
| eng0140 | Канал 9 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[9]` | INT | инженер |
| eng0141 | Канал 8 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[8]` | INT | инженер |
| eng0142 | Канал 7 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[7]` | INT | инженер |
| eng0143 | Канал 6 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[6].KpHeat` | LREAL | инженер |
| eng0144 | Канал 10 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[10].KpHeat` | LREAL | инженер |
| eng0145 | Канал 9 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[9].KpHeat` | LREAL | инженер |
| eng0146 | Канал 8 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[8].KpHeat` | LREAL | инженер |
| eng0147 | Канал 7 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[7].KpHeat` | LREAL | инженер |
| eng0148 | Канал 6 · Td · время регулятора | `.stKaliciData.sParaControlInternal[6].TdHeat` | TIME | инженер |
| eng0149 | Канал 10 · Td · время регулятора | `.stKaliciData.sParaControlInternal[10].TdHeat` | TIME | инженер |
| eng0150 | Канал 9 · Td · время регулятора | `.stKaliciData.sParaControlInternal[9].TdHeat` | TIME | инженер |
| eng0151 | Канал 8 · Td · время регулятора | `.stKaliciData.sParaControlInternal[8].TdHeat` | TIME | инженер |
| eng0152 | Канал 7 · Td · время регулятора | `.stKaliciData.sParaControlInternal[7].TdHeat` | TIME | инженер |
| eng0153 | Канал 6 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[6].TnHeat` | TIME | инженер |
| eng0154 | Канал 10 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[10].TnHeat` | TIME | инженер |
| eng0155 | Канал 9 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[9].TnHeat` | TIME | инженер |
| eng0156 | Канал 8 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[8].TnHeat` | TIME | инженер |
| eng0157 | Канал 7 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[7].TnHeat` | TIME | инженер |
| eng0158 | Канал 6 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[6].TvHeat` | TIME | инженер |
| eng0159 | Канал 10 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[10].TvHeat` | TIME | инженер |
| eng0160 | Канал 9 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[9].TvHeat` | TIME | инженер |
| eng0161 | Канал 8 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[8].TvHeat` | TIME | инженер |
| eng0162 | Канал 7 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[7].TvHeat` | TIME | инженер |
| eng0163 | Канал 15 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[15]` | INT | инженер |
| eng0164 | Канал 14 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[14]` | INT | инженер |
| eng0165 | Канал 13 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[13]` | INT | инженер |
| eng0166 | Канал 12 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[12]` | INT | инженер |
| eng0167 | Канал 11 · Предел задания температуры | `.stKaliciData.iMaxSetSicaklik[11]` | INT | инженер |
| eng0168 | Канал 15 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[15].KpHeat` | LREAL | инженер |
| eng0169 | Канал 14 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[14].KpHeat` | LREAL | инженер |
| eng0170 | Канал 13 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[13].KpHeat` | LREAL | инженер |
| eng0171 | Канал 12 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[12].KpHeat` | LREAL | инженер |
| eng0172 | Канал 11 · Kp · усиление ПИД | `.stKaliciData.sParaControlInternal[11].KpHeat` | LREAL | инженер |
| eng0173 | Канал 15 · Td · время регулятора | `.stKaliciData.sParaControlInternal[15].TdHeat` | TIME | инженер |
| eng0174 | Канал 14 · Td · время регулятора | `.stKaliciData.sParaControlInternal[14].TdHeat` | TIME | инженер |
| eng0175 | Канал 13 · Td · время регулятора | `.stKaliciData.sParaControlInternal[13].TdHeat` | TIME | инженер |
| eng0176 | Канал 12 · Td · время регулятора | `.stKaliciData.sParaControlInternal[12].TdHeat` | TIME | инженер |
| eng0177 | Канал 11 · Td · время регулятора | `.stKaliciData.sParaControlInternal[11].TdHeat` | TIME | инженер |
| eng0178 | Канал 15 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[15].TnHeat` | TIME | инженер |
| eng0179 | Канал 14 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[14].TnHeat` | TIME | инженер |
| eng0180 | Канал 13 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[13].TnHeat` | TIME | инженер |
| eng0181 | Канал 12 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[12].TnHeat` | TIME | инженер |
| eng0182 | Канал 11 · Tn · время интегрирования | `.stKaliciData.sParaControlInternal[11].TnHeat` | TIME | инженер |
| eng0183 | Канал 15 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[15].TvHeat` | TIME | инженер |
| eng0184 | Канал 14 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[14].TvHeat` | TIME | инженер |
| eng0185 | Канал 13 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[13].TvHeat` | TIME | инженер |
| eng0186 | Канал 12 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[12].TvHeat` | TIME | инженер |
| eng0187 | Канал 11 · Tv · время упреждения | `.stKaliciData.sParaControlInternal[11].TvHeat` | TIME | инженер |
| eng0188 | Канал 15 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[15]` | BOOL | инженер |
| eng0189 | Канал 15 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[15]` | BOOL | инженер |
| eng0190 | Канал 14 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[14]` | BOOL | инженер |
| eng0191 | Канал 14 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[14]` | BOOL | инженер |
| eng0192 | Канал 13 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[13]` | BOOL | инженер |
| eng0193 | Канал 13 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[13]` | BOOL | инженер |
| eng0194 | Канал 12 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[12]` | BOOL | инженер |
| eng0195 | Канал 12 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[12]` | BOOL | инженер |
| eng0196 | Канал 11 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[11]` | BOOL | инженер |
| eng0197 | Канал 11 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[11]` | BOOL | инженер |
| eng0198 | Канал 10 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[10]` | BOOL | инженер |
| eng0199 | Канал 10 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[10]` | BOOL | инженер |
| eng0200 | Канал 9 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[9]` | BOOL | инженер |
| eng0201 | Канал 9 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[9]` | BOOL | инженер |
| eng0202 | Канал 8 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[8]` | BOOL | инженер |
| eng0203 | Канал 8 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[8]` | BOOL | инженер |
| eng0204 | Канал 7 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[7]` | BOOL | инженер |
| eng0205 | Канал 7 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[7]` | BOOL | инженер |
| eng0206 | Канал 6 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[6]` | BOOL | инженер |
| eng0207 | Канал 6 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[6]` | BOOL | инженер |
| eng0208 | Канал 5 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[5]` | BOOL | инженер |
| eng0209 | Канал 5 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[5]` | BOOL | инженер |
| eng0210 | Канал 4 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[4]` | BOOL | инженер |
| eng0211 | Канал 4 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[4]` | BOOL | инженер |
| eng0212 | Канал 3 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[3]` | BOOL | инженер |
| eng0213 | Канал 3 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[3]` | BOOL | инженер |
| eng0214 | Канал 2 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[2]` | BOOL | инженер |
| eng0215 | Канал 2 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[2]` | BOOL | инженер |
| eng0216 | Канал 1 · Контроль тока | `.stKaliciData.bHeatingCurrentControl[1]` | BOOL | инженер |
| eng0217 | Канал 1 · ПИД отключён | `.stKaliciData.bHeatingPidPasif[1]` | BOOL | инженер |
| eng0218 | Применение: Isilar.bDefault | `Isilar.bDefault` | BOOL | чтение / отдельная команда |
| eng0219 | Канал 5 · Автонастройка ПИД | `Isilar.bTuneCmd[5]` | BOOL | инженер |
| eng0220 | Канал 4 · Автонастройка ПИД | `Isilar.bTuneCmd[4]` | BOOL | инженер |
| eng0221 | Канал 3 · Автонастройка ПИД | `Isilar.bTuneCmd[3]` | BOOL | инженер |
| eng0222 | Канал 2 · Автонастройка ПИД | `Isilar.bTuneCmd[2]` | BOOL | инженер |
| eng0223 | Канал 1 · Автонастройка ПИД | `Isilar.bTuneCmd[1]` | BOOL | инженер |
| eng0224 | Канал 6 · Автонастройка ПИД | `Isilar.bTuneCmd[6]` | BOOL | инженер |
| eng0225 | Минимальная калибровочная нагрузка | `.stKaliciData.sRecipeData.rFrenMinYuk` | REAL | инженер |
| eng0226 | Максимальная калибровочная нагрузка | `.stKaliciData.sRecipeData.rFrenMaxYuk` | REAL | инженер |
| eng0227 | Сырой сигнал при минимальной нагрузке | `.stKaliciData.sRecipeData.rFrenMin_AI_HamDeg` | REAL | инженер |
| eng0228 | Сырой сигнал при максимальной нагрузке | `.stKaliciData.sRecipeData.rFrenMax_AI_HamDeg` | REAL | инженер |
| eng0229 | Пропорциональный коэффициент натяжения | `.stKaliciData.sRecipeData.rFrenPID_P` | REAL | инженер |
| eng0230 | Интегральный коэффициент натяжения | `.stKaliciData.sRecipeData.rFrenPID_I` | REAL | инженер |
| eng0231 | Размотчик 2 · минимальная нагрузка | `.stKaliciData.sRecipeData.rFrenMinYuk_Acici2` | REAL | инженер |
| eng0232 | Размотчик 2 · максимальная нагрузка | `.stKaliciData.sRecipeData.rFrenMaxYuk_Acici2` | REAL | инженер |
| eng0233 | Размотчик 2 · сырой минимум | `.stKaliciData.sRecipeData.rFrenMin_AI_HamDeg_Acici2` | REAL | инженер |
| eng0234 | Размотчик 2 · сырой максимум | `.stKaliciData.sRecipeData.rFrenMax_AI_HamDeg_Acici2` | REAL | инженер |
| eng0235 | Применение: Slow_Task.bKalibrasyon | `Slow_Task.bKalibrasyon` | BOOL | чтение / отдельная команда |
| eng0236 | Калибровка тензодатчика · выбранная точка | `Slow_Task.iSelectedAnalogId` | INT | инженер |
| eng0237 | Применение: Acici2.bKalibrasyon | `Acici2.bKalibrasyon` | BOOL | чтение / отдельная команда |
| eng0238 | Текущее натяжение · размотчик 1 | `Slow_Task.rFrenActGergiFiltre` | REAL | чтение / отдельная команда |
| eng0239 | Текущий сырой сигнал · размотчик 1 | `.diLoadcellGiris` | DINT | чтение / отдельная команда |
| eng0240 | Текущее натяжение · размотчик 2 | `Acici2.rActFrenGergi` | REAL | чтение / отдельная команда |
| eng0241 | Текущий сырой сигнал · размотчик 2 | `.AI_diLoadcel_Acici2` | DINT | чтение / отдельная команда |
| eng0242 | Максимальная коррекция фотометки | `.stKaliciData.sRecipeData.rDuzeltmeBoyPencere` | REAL | инженер |
| eng0243 | Коэффициент коррекции фотометки | `.stKaliciData.sRecipeData.rFotoselDuzeltKatsayi` | REAL | инженер |
| eng0244 | Время контроля лайнера на максимальной скорости | `.stKaliciData.sRecipeData.diBantKontrolSure` | DINT | инженер |
| eng0245 | Лайнер 1 · импульсов на оборот | `.stKaliciData.diBantCapSensorDisSayisi` | DINT | инженер |
| eng0246 | Лайнер 2 · импульсов на оборот | `.stKaliciData.iYapiskanBant2CapDisSayisi` | INT | инженер |
| eng0247 | Лайнер 3 · импульсов на оборот | `.stKaliciData.iYapiskanBant3CapDisSayisi` | INT | инженер |
| eng0248 | Количество лайнеров | `.stKaliciData.iYapiskanBantAdet` | INT | инженер |
| eng0249 | Импульсов датчика диаметра размотчика | `.stKaliciData.diAciciCapSensorDisSayisi` | DINT | инженер |
| eng0250 | Расчётное время контроля лайнера | `Slow_Task.rSetBantKontrolSure` | REAL | чтение / отдельная команда |
| eng0251 | Клапан 10 · Назначение клапана | `.stKaliciData.iValveId[10]` | INT | инженер |
| eng0252 | Клапан 9 · Назначение клапана | `.stKaliciData.iValveId[9]` | INT | инженер |
| eng0253 | Клапан 8 · Назначение клапана | `.stKaliciData.iValveId[8]` | INT | инженер |
| eng0254 | Клапан 7 · Назначение клапана | `.stKaliciData.iValveId[7]` | INT | инженер |
| eng0255 | Клапан 6 · Назначение клапана | `.stKaliciData.iValveId[6]` | INT | инженер |
| eng0256 | Клапан 10 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[10]` | INT | инженер |
| eng0257 | Клапан 9 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[9]` | INT | инженер |
| eng0258 | Клапан 8 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[8]` | INT | инженер |
| eng0259 | Клапан 7 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[7]` | INT | инженер |
| eng0260 | Клапан 6 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[6]` | INT | инженер |
| eng0261 | Клапан 5 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[5]` | INT | инженер |
| eng0262 | Клапан 4 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[4]` | INT | инженер |
| eng0263 | Клапан 3 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[3]` | INT | инженер |
| eng0264 | Клапан 2 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[2]` | INT | инженер |
| eng0265 | Клапан 1 · Смещение старта клапана | `.stKaliciData.iValveStartOfset_ms[1]` | INT | инженер |
| eng0266 | Количество дополнительных клапанов | `.stKaliciData.iActiveValveNumer` | INT | инженер |
| eng0267 | Продольная резка · порог запуска | `.stKaliciData.rDilimlemeStartBalerinAci` | REAL | инженер |
| eng0268 | Продольная резка · порог остановки | `.stKaliciData.rDilimlemeStopBalerinAci` | REAL | инженер |
| eng0269 | Сматывание обрези · опорная баллерина | `.stKaliciData.iFireSarmaSalmaRef` | INT | инженер |
| eng0270 | Зиппер · номер опорной баллерины | `.stKaliciData.iZipYolunaKaynakRef` | INT | инженер |
| eng0271 | Зиппер · порог запуска шва | `.stKaliciData.rZipYolunaKaynakStartBalerinAci` | REAL | инженер |
| eng0272 | Зиппер · порог остановки шва | `.stKaliciData.rZipYolunaKaynakStopBalerinAci` | REAL | инженер |
| eng0273 | Зиппер · порог включения нагрева | `.stKaliciData.rZipYolunaKaynakIsiStartBalerinAci` | REAL | инженер |
| eng0274 | Остаток пути до раздува | `.stKaliciData.rMerdaneArasiValfMesafeKala` | REAL | инженер |
| eng0275 | Быстрый пробойник 1 · расстояние до фотодатчика | `.stKaliciData.rDelikEncValfToFotoselMesafe1` | REAL | инженер |
| eng0276 | Быстрый пробойник 1 · импульс | `.stKaliciData.iDelikEncValfOnTime1` | INT | инженер |
| eng0277 | Быстрый пробойник 2 · расстояние до фотодатчика | `.stKaliciData.rDelikEncValfToFotoselMesafe2` | REAL | инженер |
| eng0278 | Быстрый пробойник 2 · импульс | `.stKaliciData.iDelikEncValfOnTime2` | INT | инженер |
| eng0279 | Задержка клапана пробойника | `.stKaliciData.iDelikDelmeVaGecikme` | INT | инженер |
| eng0280 | Диаметр энкодерного вала пробойника | `.stKaliciData.rSalmaEnkoderDiameter` | REAL | инженер |
| eng0281 | Применение: ValveKontrol.bDefault | `ValveKontrol.bDefault` | BOOL | чтение / отдельная команда |
| eng0282 | Клапан 10 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[10]` | BOOL | инженер |
| eng0283 | Клапан 9 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[9]` | BOOL | инженер |
| eng0284 | Клапан 8 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[8]` | BOOL | инженер |
| eng0285 | Клапан 7 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[7]` | BOOL | инженер |
| eng0286 | Клапан 6 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[6]` | BOOL | инженер |
| eng0287 | Клапан 5 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[5]` | BOOL | инженер |
| eng0288 | Клапан 4 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[4]` | BOOL | инженер |
| eng0289 | Клапан 3 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[3]` | BOOL | инженер |
| eng0290 | Клапан 2 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[2]` | BOOL | инженер |
| eng0291 | Клапан 1 · Обратная опорная фаза клапана | `.stKaliciData.bValveReverseRef[1]` | BOOL | инженер |
| eng0292 | Применение: DelikDelmeValf.bWriteSF_Enc | `DelikDelmeValf.bWriteSF_Enc` | BOOL | чтение / отдельная команда |
| eng0293 | Усиление краевого контроля | `.stKaliciData.rKenarKontrolKazanc` | REAL | инженер |
| eng0294 | Минимальное воздействие краевого контроля | `.stKaliciData.rMinKenarKontrolDegeri_Volt` | REAL | инженер |
| eng0295 | Максимальная скорость конвейера | `.stKaliciData.sRecipeData.rKayisMaxHizKalibrasyon` | REAL | инженер |
| eng0296 | Разгон конвейера | `.stKaliciData.sRecipeData.rKayisHizlanmaRampasi` | REAL | инженер |
| eng0297 | Замедление конвейера | `.stKaliciData.sRecipeData.rKayisYavaslamaRampasi` | REAL | инженер |
| eng0298 | Длина конвейера | `.stKaliciData.sRecipeData.rKayisUzunluk` | REAL | инженер |
| eng0299 | Максимальный выход тормоза размотчика | `.stKaliciData.rFren1MaxOut` | REAL | инженер |
| eng0300 | Максимальный выход тормоза ленты | `.stKaliciData.rFren2MaxOut` | REAL | инженер |
| eng0301 | Тормоз при остановке | `.stKaliciData.sRecipeData.diBostaFrenYuzde` | DINT | инженер |
| eng0302 | Максимальная скорость выкидных валов | `.stKaliciData.sRecipeData.rTutucuMaxHizKalibrasyon` | REAL | инженер |
| eng0303 | Клей 1 · Максимальная скорость энкодера | `.stKaliciData.sRecipeData.rHotmeltEnkoderMaxHiz` | REAL | инженер |
| eng0304 | Клей 1 · Минимальное опорное значение | `.stKaliciData.sRecipeData.rHotmeltValfMinHizdakiRef` | REAL | инженер |
| eng0305 | Клей 1 · Скорость включения клапана | `.stKaliciData.iHotmeltCalismaHizi` | INT | инженер |
| eng0306 | Клей 1 · Скорость выключения клапана | `.stKaliciData.iHotmeltStopHizi` | INT | инженер |
| eng0307 | Клей 1 · Опорная баллерина | `.stKaliciData.iHotmeltBalerinRef` | INT | инженер |
| eng0308 | Клей 1 · Расстояние до фотодатчика | `.stKaliciData.rHotmeltFotoselMesafe` | REAL | инженер |
| eng0309 | Клей 1 · Тестовое аналоговое задание | `.stKaliciData.iHotmeltTestRef` | INT | инженер |
| eng0310 | Клей 1 · Длительность импульса клапана | `.stKaliciData.iHotmeltValfTetikSuresi_ms` | INT | инженер |
| eng0311 | Клей 1 · Задержка поршня головки | `.stKaliciData.iHotmeltKafaPistonGecikme_ms` | INT | инженер |
| eng0312 | Клей 2 · Диаметр энкодерного вала | `.stKaliciData.sRecipeData.rHotmelt2Encoder_MerdaneCap` | REAL | инженер |
| eng0313 | Клей 2 · Максимальная скорость энкодера | `.stKaliciData.sRecipeData.rHotmelt2EnkoderMaxHiz` | REAL | инженер |
| eng0314 | Клей 2 · Минимальное опорное значение | `.stKaliciData.sRecipeData.rHotmelt2ValfMinHizdakiRef` | REAL | инженер |
| eng0315 | Клей 2 · Максимальное опорное значение | `.stKaliciData.sRecipeData.rHotmelt2ValfMaxHizdakiRef` | REAL | инженер |
| eng0316 | Клей 2 · Скорость включения клапана | `.stKaliciData.iHotmelt2CalismaHizi` | INT | инженер |
| eng0317 | Клей 2 · Скорость выключения клапана | `.stKaliciData.iHotmelt2StopHizi` | INT | инженер |
| eng0318 | Клей 2 · Опорная баллерина | `.stKaliciData.iHotmelt2BalerinRef` | INT | инженер |
| eng0319 | Клей 2 · Расстояние до фотодатчика | `.stKaliciData.rHotmelt2FotoselMesafe` | REAL | инженер |
| eng0320 | Клей 2 · Длительность импульса клапана | `.stKaliciData.iHotmelt2ValfTetikSuresi_ms` | INT | инженер |
| eng0321 | Клей 2 · Задержка поршня головки | `.stKaliciData.iHotmelt2KafaPistonGecikme_ms` | INT | инженер |
| eng0322 | Применение: .sHotmelt2Encoder.bWriteSF | `.sHotmelt2Encoder.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0323 | Применение: HotmeltUnite2.bHotmeltTest | `HotmeltUnite2.bHotmeltTest` | BOOL | чтение / отдельная команда |
| eng0324 | Скорость энкодерной оси клея 2 | `.Axis_Hotmelt2Encoder.NcToPlc.SetVelo` | LREAL | чтение / отдельная команда |
| eng0325 | Скорость энкодерной оси клея 1 | `.Axis_HotmeltEncoder.NcToPlc.SetVelo` | LREAL | чтение / отдельная команда |
| eng0326 | Сигнал при минимальном диаметре | `.stKaliciData.rAciciCapSensorMinAI` | REAL | инженер |
| eng0327 | Минимальный калибровочный диаметр | `.stKaliciData.rAciciCapSensorMinVal` | REAL | инженер |
| eng0328 | Сигнал при максимальном диаметре | `.stKaliciData.rAciciCapSensorMaxAI` | REAL | инженер |
| eng0329 | Максимальный калибровочный диаметр | `.stKaliciData.rAciciCapSensorMaxVal` | REAL | инженер |
| eng0330 | Тормоз в начале паузы между пачками | `.stKaliciData.iAciciPaketArasiYuzde` | INT | инженер |
| eng0331 | Тормоз в конце паузы между пачками | `.stKaliciData.iAciciPaketArasiBitisYuzde` | INT | инженер |
| eng0332 | Применение: Slow_Task.bMinCapSet | `Slow_Task.bMinCapSet` | BOOL | чтение / отдельная команда |
| eng0333 | Применение: Slow_Task.bMaxCapSet | `Slow_Task.bMaxCapSet` | BOOL | чтение / отдельная команда |
| eng0334 | Текущий диаметр рулона | `Slow_Task.LrAciciActCap` | LREAL | чтение / отдельная команда |
| eng0335 | Текущий сигнал датчика диаметра | `Slow_Task.diAI_CozguCapSensorFilter` | DINT | чтение / отдельная команда |
| eng0336 | Усиление · задержка подачи вставки | `.stKaliciData.rTakviyeKartGecikmeMesafe` | REAL | инженер |
| eng0337 | Усиление · момент начала сварки | `.stKaliciData.rTakviyeKaynakStartZamani_ms` | REAL | инженер |
| eng0338 | Усиление · момент запуска ножа | `.stKaliciData.rTakviyeBicakStartZamani_ms` | REAL | инженер |
| eng0339 | Продольный шов 1 · порог запуска | `.stKaliciData.rYolunaKaynakStartValf1Aci` | REAL | инженер |
| eng0340 | Продольный шов 1 · опорная баллерина | `.stKaliciData.iYolunaKaynakBalerinRef[1]` | INT | инженер |
| eng0341 | Продольный шов 1 · порог остановки | `.stKaliciData.rYolunaKaynakStopValf1Aci` | REAL | инженер |
| eng0342 | Продольный шов 2 · опорная баллерина | `.stKaliciData.iYolunaKaynakBalerinRef[2]` | INT | инженер |
| eng0343 | Продольный шов 2 · порог запуска | `.stKaliciData.rYolunaKaynakStartValf2Aci` | REAL | инженер |
| eng0344 | Проволочный шов 1 · опорная баллерина | `.stKaliciData.iTelKaynak1BalerinRef` | INT | инженер |
| eng0345 | Продольный шов 2 · порог остановки | `.stKaliciData.rYolunaKaynakStopValf2Aci` | REAL | инженер |
| eng0346 | Проволочный шов 2 · опорная баллерина | `.stKaliciData.iTelKaynak2BalerinRef` | INT | инженер |
| eng0347 | Проволочный шов 1 · порог запуска | `.stKaliciData.sRecipeData.rTelKaynak1BaslangicAcisi` | REAL | инженер |
| eng0348 | Проволочный шов 1 · порог остановки | `.stKaliciData.sRecipeData.rTelKaynak1DurusAcisi` | REAL | инженер |
| eng0349 | Проволочный шов 2 · порог запуска | `.stKaliciData.sRecipeData.rTelKaynak2BaslangicAcisi` | REAL | инженер |
| eng0350 | Проволочный шов 2 · порог остановки | `.stKaliciData.sRecipeData.rTelKaynak2DurusAcisi` | REAL | инженер |
| eng0351 | Максимальный ток шкалы амперметра | `.stKaliciData.rMaxAmpermetreDeger` | REAL | инженер |
| eng0352 | Порог ошибки тока шва | `.stKaliciData.iYolunaKaynakHataAkimDeger` | INT | инженер |
| eng0353 | Контроль тока продольного шва | `.stKaliciData.bYolunaKaynakAkimKontrol` | BOOL | инженер |
| eng0354 | Проволочный шов 1 · положение баллерины | `Slow_Task.rTelKaynak1BalerinSeviye` | REAL | чтение / отдельная команда |
| eng0355 | Проволочный шов 2 · положение баллерины | `Slow_Task.rTelKaynak2BalerinSeviye` | REAL | чтение / отдельная команда |
| eng0356 | Передаточное отношение дополнительной сварки | `.stKaliciData.rEkKaynakReduksiyon` | REAL | инженер |
| eng0357 | Диаметр сервоприводных выкидных валов | `.stKaliciData.iTutucuServoCap_mm` | INT | инженер |
| eng0358 | Минимальное время движения дополнительной сварки | `.stKaliciData.iEkKaynakMinHareketSuresi_ms` | INT | инженер |
| eng0359 | Скорость Jog дополнительной сварки | `.stKaliciData.rTavukAparatJogHiz` | REAL | инженер |
| eng0360 | Передаточное отношение приёмного вала | `.stKaliciData.rDizgiReduksiyon` | REAL | инженер |
| eng0361 | Нулевая позиция приёмного вала | `.stKaliciData.rDizgiHomePos` | REAL | инженер |
| eng0362 | Передаточное отношение ручки 1 | `.stKaliciData.rElGecmeReduksiyon` | REAL | инженер |
| eng0363 | Передаточное отношение протяжки усиления | `.stKaliciData.rTakviyeHatCekiciReduksiyon` | REAL | инженер |
| eng0364 | Передаточное отношение конвейера усиления | `.stKaliciData.rTakviyeKonveyorReduksiyon` | REAL | инженер |
| eng0365 | Диаметр конвейера усиления | `.stKaliciData.rTakviyeKonveyorCap` | REAL | инженер |
| eng0366 | Передаточное отношение ручки 2 | `.stKaliciData.rElGecme2Reduksiyon` | REAL | инженер |
| eng0367 | Применение: .sElgecme2.bWriteSF | `.sElgecme2.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0368 | Применение: .sTakviyeKonveyor.bWriteSF | `.sTakviyeKonveyor.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0369 | Применение: .sTakviyeHatCekici.bWriteSF | `.sTakviyeHatCekici.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0370 | Применение: .sEkKaynak.bWriteSF | `.sEkKaynak.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0371 | Применение: .sDizgi.bWriteSF | `.sDizgi.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0372 | Применение: .sElgecme.bWriteSF | `.sElgecme.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0373 | Расстояние от ножа до протяжного вала | `.stKaliciData.rHatCekiciBicakMerdaneArasiMesafe_mm` | REAL | инженер |
| eng0374 | Задержка поршня клея усиления | `.stKaliciData.iTutkatPistonStartGecikmeZamani` | INT | инженер |
| eng0375 | Задержка распыления клея усиления | `.stKaliciData.iTutkatPuskurmeGecikmeZamani` | INT | инженер |
| eng0376 | Фильтр датчика конца усиления | `.stKaliciData.iKartBittiSensoruGormemeZamani` | INT | инженер |
| eng0377 | Импульсов датчика рулона усиления | `.stKaliciData.iTutkalCapDisliSayisi` | INT | инженер |
| eng0378 | Длина вставки усиления | `.stKaliciData.rTakviyeKartBoy` | REAL | инженер |
| eng0379 | Клей усиления · нижняя скорость калибровки | `.stKaliciData.rTutkalKalibrasyonMinHiz_mdk` | REAL | инженер |
| eng0380 | Клей усиления · подача на нижней скорости | `.stKaliciData.rTutkalKalibrasyonMinDeger_Yuzde` | REAL | инженер |
| eng0381 | Клей усиления · верхняя скорость калибровки | `.stKaliciData.rTutkalKalibrasyonMaxHiz_mdk` | REAL | инженер |
| eng0382 | Клей усиления · подача на верхней скорости | `.stKaliciData.rTutkalKalibrasyonMaxDeger_Yuzde` | REAL | инженер |
| eng0383 | Заданное положение баллерины | `.stKaliciData.Salma2[11].rBalerinSetPos` | REAL | инженер |
| eng0384 | Разгон баллерины | `.stKaliciData.Salma2[11].rAcc_sn` | REAL | инженер |
| eng0385 | Нижний порог положения | `.stKaliciData.Salma2[11].rBalerinDownLimDegeri` | REAL | инженер |
| eng0386 | Замедление баллерины | `.stKaliciData.Salma2[11].rDec_sn` | REAL | инженер |
| eng0387 | Верхний порог положения | `.stKaliciData.Salma2[11].rBalerinUpLimDegeri` | REAL | инженер |
| eng0388 | Максимальная скорость баллерины | `.stKaliciData.Salma2[11].rMaxHiz` | REAL | инженер |
| eng0389 | Минимальная скорость баллерины | `.stKaliciData.Salma2[11].rMinHiz` | REAL | инженер |
| eng0390 | Скорость ручного Jog | `.stKaliciData.Salma2[11].rJogHizi` | REAL | инженер |
| eng0391 | Коэффициент остановки баллерины | `.stKaliciData.Salma2[11].rStopFactor` | REAL | инженер |
| eng0392 | Сигнал готовности клеевого узла усиления | `.stKaliciData.bTutkalUniteHazirSinyali` | BOOL | инженер |
| eng0393 | Текущая скорость клея усиления | `x_TAKVIYEHATCEKICI.rTutkalKartHiz_mdk` | REAL | чтение / отдельная команда |
| eng0394 | Текущая подача клея усиления | `x_TAKVIYEHATCEKICI.rTutkalMiktari_Yuzde` | REAL | чтение / отдельная команда |
| eng0395 | Положение баллерины | `Salmalar.rScaledBalerin[11]` | REAL | чтение / отдельная команда |
| eng0396 | Диаметр энкодерного вала тефлона | `.stKaliciData.rTeflonCap` | REAL | инженер |
| eng0397 | Передаточное отношение тефлона | `.stKaliciData.rTeflonReduksiyon` | REAL | инженер |
| eng0398 | Максимальная скорость тефлона | `.stKaliciData.diTeflonMaxHiz` | DINT | инженер |
| eng0399 | Ручная скорость тефлона | `.stKaliciData.diTeflonManHiz` | DINT | инженер |
| eng0400 | Энкодерный режим шва зиппера | `.stKaliciData.bZipperKaynakHotEnc` | BOOL | инженер |
| eng0401 | Применение: .sTeflon.bWriteSF | `.sTeflon.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0402 | Положение баллерины 0 | `Salmalar.rScaledBalerin[0]` | REAL | чтение / отдельная команда |
| eng0403 | Заданное положение баллерины | `.stKaliciData.Salma[8].rBalerinSetPos` | REAL | инженер |
| eng0404 | Разгон баллерины | `.stKaliciData.Salma[8].rAcc_sn` | REAL | инженер |
| eng0405 | Нижний порог положения | `.stKaliciData.Salma[8].rBalerinDownLimDegeri` | REAL | инженер |
| eng0406 | Замедление баллерины | `.stKaliciData.Salma[8].rDec_sn` | REAL | инженер |
| eng0407 | Верхний порог положения | `.stKaliciData.Salma[8].rBalerinUpLimDegeri` | REAL | инженер |
| eng0408 | Максимальная скорость баллерины | `.stKaliciData.Salma[8].rMaxHiz` | REAL | инженер |
| eng0409 | Минимальная скорость баллерины | `.stKaliciData.Salma[8].rMinHiz` | REAL | инженер |
| eng0410 | Скорость ручного Jog | `.stKaliciData.Salma[8].rJogHizi` | REAL | инженер |
| eng0411 | Коэффициент остановки баллерины | `.stKaliciData.Salma[8].rStopFactor` | REAL | инженер |
| eng0412 | Прямое управление потенциометром · канал 8 | `.stKaliciData.Salma[8].bRunViaPotans` | BOOL | инженер |
| eng0413 | Положение баллерины | `Salmalar.rScaledBalerin[8]` | REAL | чтение / отдельная команда |
| eng0414 | Опорная баллерина ультразвукового узла | `.stKaliciData.iUltraSonicRef` | INT | инженер |
| eng0415 | Ультразвук · порог запуска | `.stKaliciData.sRecipeData.rSonicBaslangicAcisi` | REAL | инженер |
| eng0416 | Ультразвук · порог остановки | `.stKaliciData.sRecipeData.rSonicDurusAcisi` | REAL | инженер |
| eng0417 | Заданное положение баллерины | `.stKaliciData.Salma[9].rBalerinSetPos` | REAL | инженер |
| eng0418 | Разгон баллерины | `.stKaliciData.Salma[9].rAcc_sn` | REAL | инженер |
| eng0419 | Нижний порог положения | `.stKaliciData.Salma[9].rBalerinDownLimDegeri` | REAL | инженер |
| eng0420 | Замедление баллерины | `.stKaliciData.Salma[9].rDec_sn` | REAL | инженер |
| eng0421 | Верхний порог положения | `.stKaliciData.Salma[9].rBalerinUpLimDegeri` | REAL | инженер |
| eng0422 | Максимальная скорость баллерины | `.stKaliciData.Salma[9].rMaxHiz` | REAL | инженер |
| eng0423 | Минимальная скорость баллерины | `.stKaliciData.Salma[9].rMinHiz` | REAL | инженер |
| eng0424 | Скорость ручного Jog | `.stKaliciData.Salma[9].rJogHizi` | REAL | инженер |
| eng0425 | Коэффициент остановки баллерины | `.stKaliciData.Salma[9].rStopFactor` | REAL | инженер |
| eng0426 | Декор · импульсов датчика диаметра | `.stKaliciData.diSedefTakmaCapSensorDisSayisi` | DINT | инженер |
| eng0427 | Положение баллерины | `Salmalar.rScaledBalerin[9]` | REAL | чтение / отдельная команда |
| eng0428 | Мягкая ручка · время подачи вставки | `.stKaliciData.iYSapKartSurmeSure_ms` | INT | инженер |
| eng0429 | Мягкая ручка · задержка подачи вставки | `.stKaliciData.iYSapKaynakFwWaitTime_ms` | INT | инженер |
| eng0430 | Мягкая ручка · минимальный путь сдвига | `.stKaliciData.rYSapPosetIlerlediKucukPos` | REAL | инженер |
| eng0431 | Мягкая ручка · время движения вперёд | `.stKaliciData.rYSapKulpFwDuration_ms` | REAL | инженер |
| eng0432 | Мягкая ручка · путь до сдвига | `.stKaliciData.rYSapPosetKontrolEsikDeger` | REAL | инженер |
| eng0433 | Мягкая ручка · задержка возврата | `.stKaliciData.iYSapKulpGeriGecikme_ms` | INT | инженер |
| eng0434 | Мягкая ручка · время сварочного поршня | `.stKaliciData.rYSapKaynakStartZamani_ms` | REAL | инженер |
| eng0435 | Мягкая ручка · задержка реза | `.stKaliciData.iYSapKesimGecikme_ms` | INT | инженер |
| eng0436 | Мягкая ручка · длительность реза | `.stKaliciData.iYSapKesimSure_ms` | INT | инженер |
| eng0437 | Мягкая ручка · передача механизма | `.stKaliciData.rYSapReduksiyon` | REAL | инженер |
| eng0438 | Мягкая ручка · передача подающего вала | `.stKaliciData.rYSapMerdaneReduksiyon` | REAL | инженер |
| eng0439 | Мягкая ручка · диаметр подающего вала | `.stKaliciData.rYSapMerdaneCap` | REAL | инженер |
| eng0440 | Мягкая ручка · скорость Jog механизма | `.stKaliciData.rYSapJogHiz` | REAL | инженер |
| eng0441 | Мягкая ручка · скорость Jog вала | `.stKaliciData.rYSapMerdaneJogHiz` | REAL | инженер |
| eng0442 | Мягкая ручка · смещение | `.stKaliciData.rYsapOfset` | REAL | инженер |
| eng0443 | Мягкая ручка · минимальный коэффициент сварки | `.stKaliciData.rYsapMinKaynakHizFactor` | REAL | инженер |
| eng0444 | Применение: .sYSapMerdane.bWriteSF | `.sYSapMerdane.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0445 | Применение: .sYSap.bWriteSF | `.sYSap.bWriteSF` | BOOL | чтение / отдельная команда |
| eng0446 | Подача вставки · фактическое время | `Pno_YumusakSap.stKartSurme.iActDurationFw` | INT | чтение / отдельная команда |
| eng0447 | Движение ручки вперёд · фактическое время | `Pno_YumusakSap.stKulp.iActDurationFw` | INT | чтение / отдельная команда |
| eng0448 | Возврат ручки · фактическое время | `Pno_YumusakSap.stKulp.iActDurationBw` | INT | чтение / отдельная команда |
| eng0449 | Сварочный поршень · фактическое время | `Pno_YumusakSap.stKaynak.iActDurationFw` | INT | чтение / отдельная команда |
| eng0450 | Заводской код машины | `.stKaliciData.sEncryptedMacID` | STRING(12) | инженер |
| eng0451 | Контрольное значение постоянных данных | `.stKaliciData.nCheckSum` | DINT | инженер |
| eng0452 | Код заводской активации | `VadeAktivasyon.diDeActivationCode` | DINT | инженер |
| eng0453 | Применение: .bReturnToFactorySettings | `.bReturnToFactorySettings` | BOOL | чтение / отдельная команда |
| eng0454 | Применение: .bSaveAsFactorySettings | `.bSaveAsFactorySettings` | BOOL | чтение / отдельная команда |
| eng0455 | Версия исполнения машины | `.rMachineVersion` | REAL | чтение / отдельная команда |
| eng0456 | Идентификатор машины 1 | `VISUCONTROL.fbDeviceID.sDeviceMacID` | STRING(12) | чтение / отдельная команда |
| eng0457 | Идентификатор машины 2 | `VISUCONTROL.fbDeviceID2.sDeviceMacID` | STRING(12) | чтение / отдельная команда |
| eng0458 | Имитация в программе ПЛК | `MAIN.bSml` | BOOL | инженер |
