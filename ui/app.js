/* Guris SCADA 0.1.25. The PLC is the only source of displayed setting values. */
(async () => {
  'use strict';

  const I18n = window.SCADA_I18N || {
    ready: Promise.resolve(),
    t: (s, p = []) => s.replace(/\{(\d+)\}/g, (_, n) => p[n] ?? ''),
    text: s => s,
    locale: 'ru-RU',
    language: 'ru',
    decimal: ',',
    languages: [],
    bind: () => {},
    change: () => Promise.resolve()
  };
  await I18n.ready;
  const t = I18n.t;
  const root = document.querySelector('#guris-scada-demo');
  const $ = selector => root.querySelector(selector);
  const $$ = selector => Array.from(root.querySelectorAll(selector));
  const token = window.SCADA_BOOT.token;
  if (window.SCADA_BOOT.kiosk) document.title = `Guris SCADA [GurisSCADA:${location.port}]`;
  const gates = {
    welding: 'weldingEnabled',
    beltTime1: 'beltTimed',
    beltTime2: 'beltTimed',
    beltTime3: 'beltTimed',
    conveyorTime1: 'conveyorContinuous',
    conveyorTime2: 'conveyorContinuous'
  };
  const terminals = new Set(['confirmed', 'different', 'not_applied', 'rejected', 'conflict', 'uncertain', 'cancelled']);
  const labels = {
    confirmed: t("Подтверждено"),
    different: t("Другое значение"),
    not_applied: t("Не применено"),
    rejected: t("Отклонено"),
    conflict: t("Значение изменилось"),
    uncertain: t("Результат неизвестен"),
    cancelled: t("Отменено")
  };
  const stateNames = {
    1: t("ЗАДАНИЕ ВЫПОЛНЕНО"),
    2: t("АВАРИЙНАЯ ОСТАНОВКА"),
    3: t("НОЖ НЕ В РЕФЕРЕНСЕ"),
    4: t("АВТОМАТИЧЕСКАЯ РАБОТА"),
    5: t("МАШИНА ГОТОВА"),
    6: t("РУЧНОЕ ПЕРЕМЕЩЕНИЕ"),
    7: t("РАБОТА СИСТЕМЫ"),
    8: t("ЗАДАНИЕ ДОСТИГНУТО"),
    9: t("МАШИНА ГОТОВА"),
    10: t("КОНТРОЛЬ БЕЗОПАСНОСТИ"),
    11: t("РАЗБЛОКИРОВКА БЕЗОПАСНОСТИ"),
    12: t("ПОИСК РЕФЕРЕНСА"),
    13: t("МАШИНА НЕ ГОТОВА")
  };
  let state = {
    connected: false,
    adsState: 0,
    busy: false,
    fields: {},
    history: [],
    epoch: 0
  };
  let online = false,
    page = 'home',
    editor = null,
    resetEditor = null,
    pending = null,
    lastFeedback = '',
    stopped = false,
    pollTimer;
  let ioMonitor = null, manualBrowser = null, productionBrowser = null, functionalityBrowser = null, performanceBrowser = null, engineeringBrowser = null;
  const photoHelp = {active:false,step:0,operation:null,message:'',epoch:0,elapsed:0,frame:null,lastFrame:null,disposed:false};
  let authRole = 'operator',
    authBusy = false,
    authRevision = 0,
    optionBusy = false,
    exitRequested = false,
    exitAccepted = false,
    unwinderConfirm = null,
    calendarKey = '';
  const isEngineer = () => state.auth?.role === 'engineer';
  const motionEnabled = () => state.options?.animations !== false;
  const nodeTitles = {
    actuators: t("Актуаторы"),
    photomark: t("Фотометка"),
    edge: t("Краевой контроль"),
    temperature: t("Температура"),
    glue: t("Клей"),
    longitudinal: t("Продольный шов"),
    functionality: t("Функционал"),
    performance: t("Производительность"),
    engineering: t("Инженерные параметры"),
    jog: t("Настройки Jog"),
    eject: t("Выкидные валы"),
    liner: t("Лайнер"),
    takeoff: t("Приёмный вал"),
    tension: t("Натяжение"),
    air: t("Воздушные трубки"),
    feedangles: t("Углы подачи"),
    knife: t("Нож и контрнож"),
    unwinder: t("Размотчик"),
    ballerina: t("Баллерины"),
    options: t("Опции")
  };
  let mechanisms = null;
  const menuSlots = {edge:[1,1],temperature:[1,2],glue:[1,3],longitudinal:[2,2],eject:[3,1],liner:[3,2],takeoff:[3,4],tension:[4,2],scada:[4,5],options:[5,5]};
  function layoutMenu() {
    const grid=$('.sc-node-grid'),footer=$('.sc-node-menu-footer');
    if(footer){grid.append(...footer.children);footer.remove();}
    const reserved=new Set(Object.values(menuSlots).map(([r,c])=>`${r}:${c}`));let cell=0;
    for(const button of grid.querySelectorAll('.sc-node-tile')){
      const key=button.dataset.openNode||button.dataset.page;let slot=menuSlots[key];
      if(!slot){while(reserved.has(`${Math.floor(cell/5)+1}:${cell%5+1}`))cell++;slot=[Math.floor(cell/5)+1,cell%5+1];reserved.add(slot.join(':'));cell++;}
      button.style.gridRow=String(slot[0]);button.style.gridColumn=String(slot[1]);button.dataset.menuCell=slot.join(':');
    }
  }
  function menuPresence(key) {
    const map={temperature:'equipmentTemperature',glue:'equipmentGlue',longitudinal:'equipmentSeamHidden',liner:'equipmentLiner',takeoff:'equipmentTakeoff'};
    if(key==='eject'){
      const values=['equipmentEjectServo','equipmentEjectAC','equipmentEjectAutoJog'].map(display);
      return values.includes(1)?1:values.some(v=>v===null)?null:0;
    }
    if(!map[key])return 1;
    const v=display(map[key]);return v===null?null:key==='longitudinal'?1-v:v;
  }
  function renderMenuEquipment() {
    for(const key of ['edge','temperature','glue','longitudinal','eject','liner','takeoff','tension']){
      const button=$(`.sc-node-grid [data-open-node="${key}"]`),present=menuPresence(key);
      button.hidden=present===0;button.disabled=present===null;button.dataset.equipment=present===null?'unknown':present?'present':'absent';
      button.setAttribute('aria-label',present===null?t('{0} · комплектация недоступна',[nodeTitles[key]]):nodeTitles[key]);
      if(present===0&&page===key)setPage('menu');
    }
  }
  let pinEditor = null;
  const validPin = value => value.length >= 6 && value.length <= 128 && !/[^0-9]/.test(value);
  const temperatureText = value => format(value === null ? null : Math.trunc(value) || 0, 0);
  let languageReturnPage = null;
  try {
    languageReturnPage = sessionStorage.getItem('scada-language-return-page');
    sessionStorage.removeItem('scada-language-return-page');
  } catch {}
  const counterLabels = {
    current: t("Пакетов в текущей пачке"),
    groups: t("Группы · готовые пачки"),
    total: t("Общий счётчик")
  };
  const seen = new Set();
  const counterValues = new Map(),
    counterAnimations = new Map();
  const navigationTimers = new Map();
  const field = key => state.fields[key];
  const fresh = key => online && state.connected && field(key)?.quality === true;
  const ready = () => online && state.connected && state.adsState === 5 && !exitRequested && !state.quitting;
  const format = (value, digits = 3) => Number.isFinite(value) ? value.toLocaleString(I18n.locale, {
    maximumFractionDigits: digits
  }) : '—';
  const plain = value => Number.isFinite(value) ? String(Number(value.toFixed(6))).replace('.', I18n.decimal) : '';
  const display = key => {
    if (!fresh(key)) return null;
    const transactionKey = key === 'offsetDisplay' ? 'offset' : key;
    if (pending?.key === transactionKey) return pending.before;
    if (state.busy && state.operation?.key === transactionKey) return state.operation.before;
    return field(key).value;
  };
  function animateCounters() {
    for (const key of ['current', 'groups', 'total']) {
      const element = $(`[data-value="${key}"]`),
        value = display(key),
        previous = counterValues.get(key);
      if (value === null) {
        counterValues.delete(key);
        counterAnimations.get(key)?.cancel();
        counterAnimations.delete(key);
        continue;
      }
      counterValues.set(key, {
        value,
        epoch: state.epoch
      });
      if (previous && previous.epoch === state.epoch && previous.value !== value && page === 'home' && motionEnabled() && typeof element.animate === 'function') {
        counterAnimations.get(key)?.cancel();
        // Same short movement as the approved demo; this requested status motion remains enabled on the machine PC.
        const animation = element.animate([{
          transform: 'translateY(5px)'
        }, {
          transform: 'translateY(0)'
        }], {
          duration: 150,
          easing: 'ease-out'
        });
        counterAnimations.set(key, animation);
        animation.onfinish = () => {
          if (counterAnimations.get(key) === animation) counterAnimations.delete(key);
        };
      }
    }
  }
  const bounds = key => {
    const f = field(key);
    if (!f) return [0, 0];
    let max = f.max;
    const lim = key === 'speedSet' ? 'speedLimit' : key === 'waitingQty' ? 'waitingLimit' : null;
    if (lim && fresh(lim) && field(lim).value >= 0) max = Math.min(max, field(lim).value);
    return [f.min, max];
  };
  function editable(key, allowBusy = false) {
    if (key === 'photoOffsetTenths' && display('photoReset') !== 0) return false;
    const limitKey = key === 'speedSet' ? 'speedLimit' : key === 'waitingQty' ? 'waitingLimit' : null;
    if (key === 'beltIdleSpeed' && !isEngineer() && !(display('machineState') === 13 && display('automatic') === 0)) return false;
    return (!limitKey || fresh(limitKey) && field(limitKey).value >= (key === 'speedSet' ? 1 : 0)) && ready() && fresh(key) && field(key).writable && (allowBusy || !state.busy && !pending) && field(key).bindingReady !== false && field(key).rangeReady !== false && (!(field(key).gate || gates[key]) || fresh(field(key).gate || gates[key]) && field(field(key).gate || gates[key]).value === 1);
  }
  function resettable(key, allowBusy = false) {
    return Boolean(counterLabels[key] && ready() && fresh(key) && field(key).resettable && (allowBusy || !pending && !state.busy));
  }
  function toast(message, tone = 'neutral') {
    const t = $('[data-toast]');
    t.textContent = I18n.text(message);
    t.dataset.tone = tone;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.hidden = true, tone === 'danger' || tone === 'warning' ? 9000 : 5000);
  }
  async function api(path, body) {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), path.startsWith('/api/auth/') ? 10000 : 2500);
    try {
      const options = {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'X-SCADA-Token': token
        },
        credentials: 'same-origin',
        signal: abort.signal,
        cache: 'no-store'
      };
      if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
      const r = await fetch(path, options),
        data = await r.json();
      if (!r.ok) {
        const e = new Error(I18n.text(data.message) || t("Ошибка обмена"));
        e.definitive = true;
        e.status = r.status;
        throw e;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
  function stopNavigationAnimations() {
    for (const [button,timer] of navigationTimers) {
      clearTimeout(timer);
      delete button.dataset.navAnimating;
    }
    navigationTimers.clear();
  }
  function animateNavigation(button) {
    stopNavigationAnimations();
    if (!motionEnabled() || document.hidden) return;
    // Restart a short CSS response on repeated clicks; navigation itself is immediate.
    void button.offsetWidth;
    button.dataset.navAnimating = 'true';
    navigationTimers.set(button,setTimeout(() => {
      delete button.dataset.navAnimating;
      navigationTimers.delete(button);
    },2200));
  }
  function setPage(next) {
    stopHeld();
    if(Object.hasOwn(menuSlots,next)&&!['scada','options'].includes(next)&&menuPresence(next)!==1)return;
    if (!['home', 'belt', 'menu', 'scada', 'clock', 'about', 'alarms', 'io', 'manuals', 'production', 'jobs'].includes(next) && !nodeTitles[next] || ['scada','options','functionality','performance','engineering'].includes(next) && !isEngineer()) return;
    page = next;
    $('.sc-main').dataset.home = String(page === 'home');
    const content = page === 'ballerina' ? 'settings' : page;
    $$('[data-page-content]').forEach(e => e.hidden = e.dataset.pageContent !== content);
    $$('[data-node-icon]').forEach(e => e.hidden = content !== 'settings' || e.dataset.nodeIcon !== page);
    $$('[data-home-only]').forEach(e => e.hidden = page !== 'home');
    $$('[data-page]').forEach(e => e.dataset.page === page || e.classList.contains('sc-nav-button') && e.dataset.page === 'menu' && (Boolean(nodeTitles[page]) && !['actuators','photomark'].includes(page) || page === 'scada') ? e.setAttribute('aria-current', 'page') : e.removeAttribute('aria-current'));
    $('[data-page-title]').textContent = nodeTitles[page] || {
      home: t("Главная"),
      belt: t("Лента"),
      menu: t("Меню"),
      scada: t("Опции SCADA"),
      clock: t("Часы"),
      about: t("О программе SCADA"),
      alarms: t("Аварии станка"),
      io: t("Входы / выходы"),
      production: t("Производство"),
      jobs: t("Задания"),
      manuals: t("Мануалы")
    }[page];
    root.dataset.activePage = page;
    updateMechanisms();
    if (page === 'clock') clock();
    ioMonitor?.setActive(page === 'io');
    manualBrowser?.setActive(page === 'manuals');
    productionBrowser?.setPage(page);
    functionalityBrowser?.setPage(page);
    performanceBrowser?.setPage(page);
    engineeringBrowser?.setPage(page);
    if (page === 'alarms') renderAlarms();
    if (page !== 'photomark' && photoHelp.active) closePhotoHelp(false);
    syncPhotoHelpAnimation();
  }
  function render() {
    ioMonitor?.update();
    productionBrowser?.updateRole();
    functionalityBrowser?.render();
    performanceBrowser?.render();
    engineeringBrowser?.render();
    $$('[data-width-unit]').forEach(e=>e.textContent=fresh("cfgInchMode")?t(display("cfgInchMode")===1?"дюйм":"мм"):"—");
    $$('[data-value]').forEach(e => e.textContent = /^heat[1-6](Set|Actual)$/.test(e.dataset.value) ? temperatureText(display(e.dataset.value)) : format(display(e.dataset.value), ['current', 'groups', 'total', 'batch', 'productionQty'].includes(e.dataset.value) ? 0 : 3));
    animateCounters();
    const w = display('workingLength'),
      s = display('speedSet');
    $('[data-value="linear"]').textContent = format(w !== null && s !== null ? w * s / 1000 : null, 2);
    $('[data-linear-ms]').textContent = format(w !== null && s !== null ? w * s / 60000 : null, 2);
    $$('[data-edit]').forEach(e => {
      const key = e.dataset.edit;
      e.disabled = !editable(key);
      e.dataset.pending = String(pending?.key === key || state.busy && state.operation?.key === key);
      e.dataset.quality = fresh(key) ? 'good' : 'bad';
      if(field(key)?.bindingReady===false)e.title=t("Узел отсутствует или назначение канала изменилось");else if(e.title===t("Узел отсутствует или назначение канала изменилось"))e.removeAttribute('title');
    });
    $$('[data-reset-counter]').forEach(e => {
      e.disabled = !resettable(e.dataset.resetCounter);
      e.title = t("Обнуление счётчика");
    });
    renderCleaning();
    [['weldingEnabled', '[data-toggle-welding]', '[data-welding-toggle-text]'], ['beltTimed', '[data-toggle="beltTimed"]', '[data-toggle-text]'], ['conveyorContinuous', '[data-toggle="conveyorContinuous"]', '[data-toggle-text]']].forEach(([key, sel, text]) => {
      const e = $(sel),
        v = display(key);
      e.setAttribute('aria-checked', String(v === 1));
      e.disabled = !editable(key);
      e.dataset.pending = String(pending?.key === key || state.busy && state.operation?.key === key);
      e.querySelector(text).textContent = v === null ? '—' : v === 1 ? t("ВКЛ") : t("ВЫКЛ");
      const panel = key === 'weldingEnabled' ? $('[data-welding-card]') : $(`[data-timing-panel="${key}"]`);
      panel.dataset.enabled = String(v === 1);
    });
    const offset = display('offsetDisplay'),
      step = display('offsetStep'),
      stored = display('offset');
    $('[data-offset-value]').textContent = offset === null ? '—' : `${offset > 0 ? '+' : ''}${format(offset, 3)}`;
    $('[data-offset-marker]').style.left = `${offset === null ? 50 : Math.max(0, Math.min(100, (offset + .8) / 1.6 * 100))}%`;
    $$('[data-offset]').forEach(e => {
      const next = stored === null ? NaN : Number((stored + Number(e.dataset.offset) * step).toFixed(6));
      e.disabled = !editable('offset') || !fresh('offsetDisplay') || !fresh('offsetStep') || !(step > 0) || next < -.800001 || next > .800001;
      e.title = t("Шаг: {0}. На пределе измените основной шаг ленты.", [format(step, 3)]);
    });
    const current = display('current'),
      batch = display('batch'),
      fill = $('.sc-pack-fill'),
      track = $('.sc-pack-track');
    if (fill) fill.style.width = `${current !== null && batch > 0 ? Math.max(0, Math.min(100, current / batch * 100)) : 0}%`;
    if (track) {
      track.setAttribute('aria-valuenow', current === null ? '0' : String(current));
      track.setAttribute('aria-valuemax', batch > 0 ? String(batch) : '100');
    }
    const code = display('machineState'),
      tone = !fresh('machineState') ? 'neutral' : code === 2 ? 'danger' : [3, 13].includes(code) ? 'warning' : code === 4 ? 'success' : 'neutral';
    $('.sc-state').dataset.tone = tone;
    $('[data-state-title]').textContent = code === null ? t("СИСТЕМА: НЕТ ДАННЫХ") : t("СИСТЕМА: {0}", [stateNames[code] || t("КОД ") + code]);
    $('[data-state-note]').textContent = code === 4 ? t("Выпуск пакетов") : code === null ? t("Ожидаем ПЛК") : t("Код {0}", [code]);

    const cadence = $('.sc-cadence');
    cadence.dataset.playing = String(code === 4 && s > 0 && motionEnabled());
    cadence.style.setProperty('--sc-beat-period', `${s > 0 ? 60 / s : 1}s`);
    [['plc', online && state.connected ? t("Связь есть") : t("Нет связи"), online && state.connected ? 'success' : 'danger'], ['ads', online && state.connected ? state.adsState === 5 ? t("Связь есть") : t("Состояние {0}", [state.adsState]) : t("Нет связи"), online && state.connected ? ready() ? 'success' : 'warning' : 'danger'], ['alarms', code===2 || online&&state.connected&&state.alarms?.quality&&state.alarms.activeCount ? t("Есть авария") : online&&state.connected&&state.alarms?.quality ? t("Нет аварий") : t("Нет данных"), code===2 || online&&state.connected&&state.alarms?.quality&&state.alarms.activeCount ? 'danger' : online&&state.connected&&state.alarms?.quality ? 'success' : 'neutral']].forEach(([key, text, tone]) => {
      const e = $(`[data-indicator="${key}"]`);
      e.dataset.tone = tone;
      e.querySelector('[data-indicator-text]').textContent = text;
    });
    const cleaningFeedback = state.cleaning?.active ? t("Ускорение ленты · {0} с", [Math.ceil(state.cleaning.remainingMs / 1000)]) : state.cleaning?.pendingRestore ? state.cleaning.message : '';
    const u=state.unwinder||{}, unwinderFeedback=u.mode==='temporary'?t("Размотчик · контроль вернётся через {0}",[timerText(u.remainingMs)]):u.mode==='permanent'?t("Размотчик · контроль отключён бессрочно"):u.mode==='restoring'?I18n.text(u.message):'';
    const feedback = pending ? t("Ожидаем подтверждение ПЛК…") : state.busy ? t("Выполняется запись…") : !online ? t("Нет связи с программой") : !state.connected ? state.message || t("Нет связи с ПЛК") : [cleaningFeedback,unwinderFeedback].filter(Boolean).join(' · ') || lastFeedback || `ADS · ${state.ip}`;
    $('.sc-subtitle').textContent = I18n.text(feedback);
    $('.sc-subtitle').dataset.pending = String(Boolean(pending || state.busy));
    $('[data-open-connect]').dataset.connected = String(online && state.connected);
    $('[data-connect-status]').textContent = I18n.text(online ? state.message || '' : t("Нет связи с программой"));
    if (editor) {
      if (!editor.sent && !editor.conflict && (!editable(editor.key, true) || state.epoch !== editor.epoch || field(editor.key).raw !== editor.raw)) {
        editor.conflict = true;
        $('[data-entry-error]').textContent = t("Данные изменились или связь потеряна. Закройте ввод и откройте заново.");
      }
      $('[data-apply-number]').disabled = Boolean(editor.sent || editor.conflict || pending || state.busy || !editable(editor.key, true));
      $('[data-apply-number-text]').textContent = editor.sent ? t("Записываем…") : t("Ввести");
      $$('[data-key]').forEach(e => e.disabled = Boolean(editor.sent));
      $('[data-cancel-number]').textContent = editor.sent ? t("Скрыть окно") : t("Отмена");
    }
    if (resetEditor) {
      if (!resetEditor.sent && fresh(resetEditor.key)) $('[data-reset-before]').textContent = format(display(resetEditor.key), 0);
      if (!resetEditor.sent && !resetEditor.conflict && (!resettable(resetEditor.key, true) || state.epoch !== resetEditor.epoch)) {
        resetEditor.conflict = true;
        $('[data-reset-error]').textContent = t("Связь с ПЛК изменилась. Откройте подтверждение заново.");
      }
      $('[data-reset-apply]').disabled = Boolean(resetEditor.sent || resetEditor.conflict || pending || state.busy || !resettable(resetEditor.key, true));
      $('[data-reset-apply]').textContent = resetEditor.sent ? t("Обнуляем…") : t("Обнулить");
      $('[data-reset-cancel]').textContent = resetEditor.sent ? t("Скрыть окно") : t("Отмена");
    }
    if (!$('[data-history-overlay]').hidden) renderHistory();
    $$('[data-connect-submit]').forEach(e => e.disabled = Boolean(!isEngineer() || pending || state.busy));
    renderLocal();
    renderMenuEquipment();
    renderSpeedIcon();
    renderWeldingIcon();
    renderNodes();
    renderPhotoHelp();
    updateMechanisms();
    $('[data-open-language]').disabled = Boolean(pending || state.busy);
  }
  function finishOperation(tx) {
    if (!pending || tx.id !== pending.id || !terminals.has(tx.status)) return;
    seen.add(tx.id);
    const confirmed = tx.status === 'confirmed',
      tone = confirmed ? 'success' : tx.status === 'uncertain' ? 'warning' : 'danger';
    pending = null;
    completePhotoHelpOperation(tx);
    lastFeedback = confirmed ? t("ПЛК подтвердил значение") : tx.message;
    toast(tx.message, tone);
    if (editor?.id === tx.id) {
      $('[data-entry-error]').textContent = I18n.text(confirmed ? t("ПЛК подтвердил значение") : tx.message);
      $('[data-entry-error]').dataset.tone = tone;
      if (Number.isFinite(tx.actual)) $('[data-entry-old]').textContent = format(tx.actual);
      editor.sent = false;
      editor.conflict = true;
      if (confirmed) closeNumber();
    }
    if (resetEditor?.id === tx.id) {
      resetEditor.sent = false;
      resetEditor.conflict = true;
      $('[data-reset-error]').textContent = I18n.text(tx.message);
      if (confirmed) closeReset();
    }
  }
  function receive(next) {
    if(heldCommand&&(!next.connected||next.epoch!==heldCommand.epoch))stopHeld();
    state = next;
    if(next.quitting&&!exitRequested){exitRequested=true;exitAccepted=true;showExitState();}
    online = true;
    if (languageReturnPage) {
      const restore = languageReturnPage;
      languageReturnPage = null;
      setPage(restore);
    }
    if (pending) {
      const tx = [state.operation, ...(state.history || [])].find(t => t?.id === pending.id);
      if (tx) finishOperation(tx);else if (state.epoch !== pending.epoch || !state.busy && Date.now() - pending.created > 8000) {
        finishOperation({
          id: pending.id,
          status: 'uncertain',
          message: t("Сессия ПЛК изменилась. Проверьте фактическое значение; повторной отправки нет.")
        });
      }
    }
    render();
  }
  async function poll() {
    if (stopped) return;
    const revision = authRevision;
    try {
      const next = await api('/api/state');
      if (!authBusy && revision === authRevision) receive(next);
    } catch (e) {
      online = false;
      stopHeld();
      render();
      if (exitAccepted) {
        stopped = true;
        $('[data-exit-message]').textContent=t("Работа SCADA завершена. Окно можно закрыть.");
      }
    }
    // These reads fetch the local cache; PLC reads are scheduled independently by the worker.
    if (!stopped) pollTimer = setTimeout(poll, pending || state.busy ? 50 : 100);
  }
  function openNumber(key) {
    if (!editable(key)) return;
    const f = field(key),
      [min, max] = bounds(key);
    editor = {
      key,
      raw: f.raw,
      epoch: state.epoch,
      initial: f.value,
      draft: plain(f.value),
      replace: true,
      sent: false,
      conflict: false
    };
    $('#guris-scada-entry-title').textContent = I18n.text(f.label);
    $('#guris-scada-entry-hint').textContent = t("От {0} до {1}{2} · подтверждение от ПЛК", [format(min), format(max), f.unit ? ' ' + f.unit : '']);
    $('[data-entry-unit]').textContent = I18n.text(f.unit);
    $('[data-entry-old]').textContent = format(f.value);
    $('[data-entry-error]').textContent = '';
    $('[data-entry-error]').dataset.tone = 'danger';
    $('[data-entry-prompt]').textContent = t("Введите новое значение");
    $('[data-key="sign"]').hidden = min >= 0;
    $('.sc-numpad').dataset.signed = String(min < 0);
    $('[data-key=","]').hidden = f.integer;
    $('[data-number-overlay]').hidden = false;
    numberView();
    render();
    $('#guris-scada-entry').focus();
  }
  function numberView() {
    if (editor) {
      $('#guris-scada-entry').value = editor.draft;
      $('.sc-entry-box').dataset.replace = String(editor.replace);
    }
  }
  function closeNumber() {
    editor = null;
    $('[data-number-overlay]').hidden = true;
  }
  function closeReset() {
    resetEditor = null;
    $('[data-reset-overlay]').hidden = true;
  }
  function openReset(key) {
    if (!resettable(key)) return;
    const f = field(key);
    resetEditor = {
      key,
      raw: f.raw,
      epoch: state.epoch,
      sent: false,
      conflict: false
    };
    $('[data-reset-title]').textContent = t("Обнулить «{0}»?", [counterLabels[key]]);
    $('[data-reset-before]').textContent = format(f.value, 0);
    $('[data-reset-error]').textContent = '';
    $('[data-reset-overlay]').hidden = false;
    render();
    $('[data-reset-cancel]').focus();
  }
  function applyReset() {
    if (resetEditor && !resetEditor.sent && !resetEditor.conflict) requestWrite(resetEditor.key, 0, {
      raw: resetEditor.raw,
      epoch: resetEditor.epoch
    }, true);
  }
  function keyPress(key) {
    if (!editor || editor.sent || editor.conflict) return;
    const f = field(editor.key);
    if (key === 'restore') {
      editor.draft = plain(editor.initial);
      editor.replace = true;
    } else if (key === 'clear') {
      editor.draft = '';
      editor.replace = false;
    } else if (key === 'backspace') {
      editor.draft = editor.replace ? '' : editor.draft.slice(0, -1);
      editor.replace = false;
    } else if (key === 'sign') {
      if (f.min < 0) {
        if(editor.replace)editor.draft='';
        editor.draft = editor.draft.startsWith('-') ? editor.draft.slice(1) : '-' + editor.draft;
        editor.replace = false;
      }
    } else if (key === ',' || key === '.') {
      if (!f.integer) {
        if (editor.replace) editor.draft = '';
        if (!/[,.]/.test(editor.draft)) editor.draft = (editor.draft || '0') + I18n.decimal;
        editor.replace = false;
      }
    } else if (/^\d$/.test(key)) {
      if (editor.replace) editor.draft = '';
      if (editor.draft.length < 14) {
        editor.draft += key;
        editor.replace = false;
      }
    }
    $('[data-entry-error]').textContent = '';
    numberView();
  }
  async function requestWrite(key, value, baseline, reset = false) {
    if (pending || state.busy) return;
    if (!(reset ? resettable(key, true) : editable(key, true)) || state.epoch !== baseline.epoch || !reset && field(key).raw !== baseline.raw) {
      toast(t("Данные изменились. Откройте ввод заново."), 'danger');
      if (editor) editor.conflict = true;
      if (resetEditor) resetEditor.conflict = true;
      render();
      return;
    }
    const id = crypto.randomUUID();
    pending = {
      id,
      key,
      before: field(key).value,
      epoch: baseline.epoch,
      created: Date.now()
    };
    if (editor?.key === key) {
      editor.id = id;
      editor.sent = true;
      $('[data-entry-prompt]').textContent = t("Ожидаем подтверждение ПЛК…");
    }
    if (reset && resetEditor?.key === key) {
      resetEditor.id = id;
      resetEditor.sent = true;
    }
    lastFeedback = '';
    render();
    try {
      await api(reset ? '/api/counter-reset' : '/api/write', reset ? {
        id,
        key,
        expected: baseline.raw,
        epoch: baseline.epoch
      } : {
        id,
        key,
        value: String(value),
        expected: baseline.raw,
        epoch: baseline.epoch
      });
      // HTTP 202 and ADS ACK are not value confirmation. Only the worker's readback result is accepted.
    } catch (e) {
      if (e.definitive) {
        finishOperation({
          id,
          status: e.status === 409 ? 'conflict' : 'rejected',
          message: e.message
        });
        render();
      } else {
        toast(t("Ответ не получен. Проверяем результат операции; повторной отправки нет."), 'warning');
      }
    }
  }
  function applyNumber() {
    if (!editor || editor.sent || editor.conflict) return;
    const [min, max] = bounds(editor.key),
      text = editor.draft.replace(',', '.');
    const value = Number(text),
      f = field(editor.key);
    if (!/^-?\d+(\.\d*)?$/.test(text) || !Number.isFinite(value) || value < min || value > max || f.integer && !Number.isInteger(value)) {
      $('[data-entry-error]').textContent = f.integer ? t("Введите целое число от {0} до {1}.", [format(min), format(max)]) : t("Введите число от {0} до {1}.", [format(min), format(max)]);
      return;
    }
    requestWrite(editor.key, value, {
      raw: editor.raw,
      epoch: editor.epoch
    });
  }
  function toggle(key) {
    if (editable(key)) requestWrite(key, 1 - field(key).value, {
      raw: field(key).raw,
      epoch: state.epoch
    });
  }
  function adjustOffset(direction) {
    if (!editable('offset') || !fresh('offsetStep') || !fresh('offsetDisplay')) return;
    const next = Number((field('offset').value + direction * field('offsetStep').value).toFixed(6));
    if (next < -.800001 || next > .800001) {
      toast(t("Достигнут предел тонкой настройки. Измените основной шаг ленты."), 'warning');
      return;
    }
    requestWrite('offset', next, {
      raw: field('offset').raw,
      epoch: state.epoch
    });
  }
  function openConnect() {
    if (!isEngineer()) return;
    $('[data-connect-ip]').value = state.ip || '192.168.1.250';
    $('[data-connect-net]').value = state.netId || '5.105.198.193.1.1';
    $('[data-connect-port]').value = state.port || 801;
    $('[data-connect-overlay]').hidden = false;
    render();
  }
  async function connect(enabled) {
    if (!isEngineer() || pending || state.busy) return;
    try {
      const r = await api('/api/connect', {
        ip: $('[data-connect-ip]').value.trim(),
        netId: $('[data-connect-net]').value.trim(),
        port: String($('[data-connect-port]').value),
        enabled
      });
      toast(r.message);
      $('[data-connect-overlay]').hidden = true;
    } catch (e) {
      $('[data-connect-status]').textContent = e.message;
    }
  }
  function renderHistory() {
    const list = $('[data-history-list]');
    list.replaceChildren();
    const history = [...(state.history || [])].reverse();
    if (!history.length) {
      const e = document.createElement('p');
      e.textContent = t("Записей пока нет.");
      list.append(e);
      return;
    }
    history.forEach(tx => {
      const row = document.createElement('div');
      row.className = 'sc-log-row';
      row.dataset.tone = tx.status === 'confirmed' ? 'success' : tx.status === 'uncertain' ? 'warning' : 'danger';
      const title = document.createElement('strong');
      title.textContent = `${tx.kind === 'counter_reset' ? t("Обнуление · ") : ''}${field(tx.key)?.label || tx.key}: ${format(tx.before)} → ${format(tx.requested)}`;
      const detail = document.createElement('span');
      detail.textContent = `${tx.utc} · ${labels[tx.status] || tx.status}${tx.actual === null ? '' : t(" · ПЛК: {0}", [format(tx.actual)])}`;
      const message = document.createElement('span');
      message.textContent = I18n.text(tx.message);
      row.append(title, detail, message);
      list.append(row);
    });
  }
  async function downloadReport() {
    try {
      const report = await api('/api/report'),
        blob = new Blob([JSON.stringify(report, null, 2)], {
          type: 'application/json'
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `GurisSCADA_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(t("Отчёт сохранён в загрузки браузера."));
    } catch (e) {
      toast(e.message, 'danger');
    }
  }
  function renderNodes() {
    $$('[data-node-reading]').forEach(e => {
      const value = display(e.dataset.nodeReading);
      e.textContent = /^heat[1-6](Set|Actual)$/.test(e.dataset.nodeReading) ? temperatureText(value) : format(value, Number(e.dataset.decimals || 0));
    });
    $$('[data-edge-status],[data-node-toggle]').forEach(e => {
      const key = e.dataset.nodeToggle || e.dataset.edgeStatus, value = display(key);
      e.dataset.unknown = String(value === null);
      e.dataset.on = String(value === 1);
      const text = e.querySelector('[data-state-text],[data-node-toggle-text]');
      if (text) text.textContent = value === null ? '—' : value === 1 ? t("ВКЛ") : t("ВЫКЛ");
      if (e.hasAttribute('data-node-toggle')) {
        e.setAttribute('aria-checked', String(value === 1));
        e.disabled = !editable(key);
        e.dataset.pending = String(pending?.key === key || state.busy && state.operation?.key === key);
      }
    });
    $$('[data-actuator-row]').forEach(e=>{const value=display(e.dataset.actuatorRow);e.dataset.enabled=String(value===1);e.dataset.unknown=String(value===null);});
    $$('[data-photo-activation-panel]').forEach(e=>e.dataset.enabled=String(display('photoEnabled')===1));
    $$('[data-nudge]').forEach(e => {
      const key=e.dataset.nudge, value=display(key), [min,max]=bounds(key), next=value+Number(e.dataset.step);
      e.disabled=!editable(key)||value===null||next<min||next>max;
    });
    const photoMode=display('gluePhotoMode');
    $$('[data-glue-mode]').forEach(e => {
      const selected=photoMode===Number(e.dataset.glueMode==='photo');
      e.setAttribute('aria-pressed',String(selected));
      e.disabled=!editable('gluePhotoMode');
    });
    $$('[data-glue-panel]').forEach(e => e.hidden=photoMode===null || e.dataset.gluePanel!==(photoMode===1?'photo':'ordinary'));
    $$('[data-glue-width-limit]').forEach(e => e.textContent = format(display('workingLength'), 1));
    $$('[data-liner-row]').forEach(e => {
      const value=display('liner'+e.dataset.linerRow+'AutoStop');
      e.querySelector('[data-liner-status]').textContent=value===null?t("Нет данных"):value===1?t("Контроль включён"):t("Контроль выключен");
    });
    for(const [selector,key] of [['[data-seam-state]','seamEnabled'],['[data-eject-motion-state]','ejectEnabled']]) {
      const value=display(key);
      $$(selector).forEach(e=>e.textContent=value===null?t("Нет данных"):value===1?t("Включён"):t("Отключён"));
    }
    const seamOn = display('seamEnabled') === 1;
    $('[data-seam-module]').dataset.enabled = String(seamOn);
    $('[data-seam-heat]').hidden = !seamOn;
    const tension=display('tensionSet');
    $$('[data-tension-shape]').forEach(e => e.textContent=tension===null?t("Схема узла"):tension===0?t("Плёнка прямая"):tension>0?t("Провисание плёнки"):t("Натяжение плёнки"));
    $$('[data-tension-marker]').forEach(e=>e.style.left=`${tension===null?50:Math.max(0,Math.min(100,(tension+25)*2))}%`);
    renderCommands();renderAlarms();renderUnwinder();
  }
  function nudge(key,step) {
    if(!editable(key))return;
    const value=Number((field(key).value+step).toFixed(6)),[min,max]=bounds(key);
    if(value>=min&&value<=max)requestWrite(key,value,{raw:field(key).raw,epoch:state.epoch});
  }
  function updateMechanisms() {
    // Menu icons are illustrations. Detailed diagrams retain the live-state gate.
    mechanisms?.update(page === 'menu' || fresh('machineState') && field('machineState').value === 4, motionEnabled(),Object.fromEntries(['takeoffPosition','ejectPosition','tensionSet','airStartAngle','airStopAngle','ejectSpeed','ejectSpeedEnabled','ejectEnabled','seamEnabled'].filter(fresh).map(key=>[key,field(key).value])));
  }
  function renderWeldingIcon() {
    const icon = $('[data-welding-icon]'),
      machine = display('speedSet'),
      weld = display('welding'),
      enabled = display('weldingEnabled') === 1;
    const valid = enabled && machine !== null && machine > 0 && weld !== null,
      half = valid ? machine / 2 : 0,
      delta = valid ? weld - half : 0;
    const neutral = !valid || Math.abs(delta) <= 10,
      tone = neutral ? 'neutral' : delta < 0 ? 'lower' : 'higher';
    const angle = neutral ? 0 : Math.sign(delta) * Math.min(70, (Math.abs(delta) - 10) / Math.max(10, half - 10) * 70);
    icon.dataset.tone = tone;
    icon.dataset.quality = valid ? 'good' : 'unknown';
    icon.dataset.playing = String(valid && fresh('machineState') && field('machineState').value === 4 && motionEnabled());
    icon.style.setProperty('--sc-weld-angle', angle + 'deg');
    icon.style.setProperty('--sc-weld-period', `${Math.max(.5, Math.min(2.8, 60 / Math.max(weld || 1, 1)))}s`);
    $('[data-weld-relation]').textContent = valid ? '≈ ½' : '—';
    icon.setAttribute('data-delta', valid ? String(delta) : '');
    $('[data-edit="welding"]').title = valid ? t("Ориентир: половина скорости станка {0} ±10 шт/мин. Отклонение: {1}. Это рекомендация; значение не изменяется автоматически.", [format(half), format(delta)]) : t("Рекомендация оценивается при включённой скорости шва и свежих данных скорости станка.");
  }
  function openLanguage() {
    const list = $('[data-language-list]');
    list.replaceChildren();
    for (const language of I18n.languages) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sc-language-choice';
      button.dataset.chooseLanguage = language.code;
      button.setAttribute('aria-pressed', String(I18n.language === language.code));
      const flag = document.createElement('img');
      flag.src = language.flag;
      flag.alt = '';
      flag.width = 34;
      flag.height = 23;
      const name = document.createElement('span');
      name.textContent = language.name;
      button.append(flag, name);
      list.append(button);
    }
    $('[data-language-overlay]').hidden = false;
    list.querySelector('button')?.focus();
  }
  async function changeLanguage(code) {
    if (pending || state.busy) return;
    try {
      await api('/api/language', {
        language: code
      });
      sessionStorage.setItem('scada-language-return-page', page);
      await I18n.change(code);
    } catch (e) {
      toast(e.message, 'danger');
    }
  }
  function renderSpeedIcon() {
    const icon = $('[data-speed-icon]'),
      speed = display('speedSet'),
      width = display('width');
    // Both inputs are confirmed PLC settings, not independent measured speeds.
    const valid = speed !== null && width !== null && speed >= 0 && width > 0,
      film = valid ? speed * width / 1000 : null;
    const knife = valid ? speed / 250 : 0,
      web = valid ? film / 60 : 0,
      load = Math.max(knife, web);
    icon.dataset.quality = valid ? 'good' : 'bad';
    icon.dataset.playing = String(valid && fresh('machineState') && field('machineState').value === 4 && speed > 0 && motionEnabled());
    icon.dataset.limiter = valid ? Math.abs(knife - web) < .005 ? 'both' : knife > web ? 'knife' : 'film' : 'unknown';
    icon.style.setProperty('--sc-speed-period', `${(2.6 - 2 * Math.min(1, load)).toFixed(3)}s`);
    icon.style.setProperty('--sc-speed-color', load > 1 ? '#a34d35' : load >= .85 ? '#906e19' : '#23627e');
    $('[data-speed-knife]').style.strokeDasharray = `${Math.max(0, Math.min(100, knife * 100))} 100`;
    $('[data-speed-film]').style.strokeDasharray = `${Math.max(0, Math.min(100, web * 100))} 100`;
    $('[data-speed-needle]').style.transform = `rotate(${-125 + Math.min(1, load) * 250}deg)`;
    $('[data-speed-load]').textContent = valid ? `${Math.round(load * 100)}%` : '—';
    $('[data-edit="speedSet"]').title = valid ? t("Расчётная загрузка по заданию: {0}%. Нож: {1} / 250 уд/мин. Плёнка: ≈ {2} / 60 м/мин. Ближе предел: {3}.", [Math.round(load * 100), format(speed), format(film, 2), icon.dataset.limiter === 'both' ? t("оба") : icon.dataset.limiter === 'knife' ? t("нож") : t("плёнка")]) : t("Нет свежих данных для расчёта загрузки");
  }
  function renderCleaning() {
    const c = state.cleaning || {},
      inProgress = Boolean(c.active || c.pendingRestore),
      st = display('machineState'),
      automatic = display('automatic'),
      allowed = ready() && st === 13 && automatic === 0;
    $('[data-cleaning-add]').disabled = !(allowed && c.available && fresh('beltIdleSpeed') && field('beltIdleSpeed').writable && (!state.busy || state.operation?.kind === 'cleaning_boost') && !pending && (!c.pendingRestore || c.active));
    $('[data-normal-belt]').disabled = !(allowed && (inProgress || editable('beltIdleSpeed') && display('beltIdleSpeed') !== 10));
    $('[data-cleaning-status]').textContent = !online ? t("Нет связи с SCADA") : c.active ? t("Ускорение · {0} с / 180 с", [Math.ceil(c.remainingMs / 1000)]) : c.pendingRestore ? c.message || t("Ожидаем возврата 10") : !allowed ? t("Доступно только в состоянии «Машина не готова»") : c.message || t("Обычная 10 · ускоренная 45");
    $('[data-cleaning-status]').textContent=I18n.text($('[data-cleaning-status]').textContent);
    $('.sc-cleaning-panel').dataset.active = String(Boolean(c.active));
    $('[data-cleaning-add]').textContent = c.active ? t("Ещё +60 с") : t("Ускорить · +60 с");
  }
  async function addCleaning() {
    if ($('[data-cleaning-add]').disabled) return;
    try {
      await api('/api/cleaning-add', {
        id: crypto.randomUUID(),
        expected: field('beltIdleSpeed').raw,
        epoch: state.epoch
      });
      receive(await api('/api/state'));
    } catch (e) {
      toast(e.definitive ? e.message : t("Ответ не получен. Проверьте остаток таймера перед следующим нажатием."), 'warning');
    }
  }
  async function normalBelt() {
    if ($('[data-normal-belt]').disabled) return;
    if (state.cleaning?.active || state.cleaning?.pendingRestore) {
      try {
        const r = await api('/api/cleaning-stop', {});
        toast(r.message);
        receive(await api('/api/state'));
      } catch (e) {
        toast(e.message, 'warning');
      }
    } else if (editable('beltIdleSpeed')) requestWrite('beltIdleSpeed', 10, {
      raw: field('beltIdleSpeed').raw,
      epoch: state.epoch
    });
  }
  function timerText(milliseconds) {
    const seconds=Math.max(0,Math.ceil((milliseconds||0)/1000));
    return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  }
  function unwinderReady() {
    return ready()&&fresh('unwinderAutoStop')&&state.unwinder?.available&&!pending&&!state.busy&&!state.commandLease?.pendingRelease;
  }
  function renderUnwinder() {
    const u=state.unwinder||{},value=display('unwinderAutoStop'),b=$('[data-unwinder-toggle]');
    b.dataset.unknown=String(value===null);b.dataset.on=String(value===1);b.setAttribute('aria-checked',String(value===1));b.disabled=!unwinderReady();
    $('[data-unwinder-toggle-text]').textContent=value===null?'—':value===1?t("Отключить на 5 мин"):t("Включить сейчас");
    $('[data-unwinder-state]').textContent=value===null?t("Нет свежих данных"):value===1?t("Контроль включён"):u.mode==='permanent'?t("Отключено бессрочно"):u.mode==='restoring'?t("Ожидаем включения контроля"):t("Временное отключение");
    $('[data-unwinder-countdown]').textContent=u.mode==='temporary'?timerText(u.remainingMs):'';
    $('[data-unwinder-message]').textContent=I18n.text(u.message||t("Обычный режим — контроль включён."));
    $('[data-unwinder-policy]').dataset.tone=value===null?'neutral':value===1?'success':u.mode==='permanent'?'danger':'warning';
    const canPermanent=isEngineer()&&unwinderReady()&&fresh('machineState')&&[5,9].includes(field('machineState').value)&&display('automatic')===0;
    $('[data-unwinder-permanent]').hidden=!isEngineer()||u.mode==='permanent';
    $('[data-unwinder-permanent]').disabled=!canPermanent;
    $('[data-unwinder-engineer-note]').hidden=isEngineer()&&canPermanent;
    $('[data-confirm-unwinder]').disabled=!canPermanent;
  }
  async function requestUnwinder(mode,baseline=null) {
    if(!unwinderReady())return;
    const key='unwinderAutoStop',f=field(key),snapshot=baseline||{raw:f.raw,epoch:state.epoch};
    if(snapshot.epoch!==state.epoch||snapshot.raw!==f.raw){toast(t("Данные изменились. Повторите действие."),'warning');return;}
    const id=crypto.randomUUID();pending={id,key,before:f.value,epoch:state.epoch,created:Date.now()};
    $('[data-unwinder-confirm]').hidden=true;lastFeedback='';render();
    try {await api('/api/unwinder',{id,mode,epoch:snapshot.epoch,expected:snapshot.raw});}
    catch(e){if(e.definitive){finishOperation({id,status:e.status===409?'conflict':'rejected',message:e.message});render();}else toast(t("Ответ не получен. Проверяем результат операции; повторной отправки нет."),'warning');}
  }
  function showExitState() {
    stopHeld();root.inert=true;root.dataset.exiting='true';
    $('[data-exit-overlay]').hidden=false;$('[data-exit-message]').textContent=t("Возвращаем временные режимы в нормальное состояние и закрываем SCADA…");
    $$('[data-exit]').forEach(b=>b.disabled=true);
  }
  async function requestExit() {
    if(exitRequested)return;
    exitRequested=true;showExitState();
    try {await api('/api/quit',{});exitAccepted=true;}
    catch(e){
      let reachable=false;try {receive(await api('/api/state'));reachable=true;}catch{}
      if(reachable&&!state.quitting){exitRequested=false;exitAccepted=false;root.inert=false;delete root.dataset.exiting;$('[data-exit-overlay]').hidden=true;toast(t("Не удалось запросить выход. Повторите действие."),'danger');render();}
      else {exitAccepted=true;stopped=true;clearTimeout(pollTimer);$('[data-exit-message]').textContent=t("Связь с программой закрыта. Окно можно закрыть.");}
    }
  }
  function renderLocal() {
    const engineer = isEngineer();
    const savedTheme = state.options?.theme || document.documentElement.dataset.theme;
    const theme = savedTheme === 'classic' ? 'classic' : 'dark';
    if (document.documentElement.dataset.theme !== theme) {
      document.documentElement.dataset.theme = theme;
      mechanisms?.refreshPalette();
    }
    $$('[data-theme-choice]').forEach(e => {
      e.setAttribute('aria-pressed', String(e.dataset.themeChoice === theme));
      e.disabled = !engineer || optionBusy;
    });
    $$('[data-engineer-only]').forEach(e => e.hidden = !engineer);
    $('[data-profile-role]').textContent = engineer ? t("Инженер") : t("Профиль");
    $('[data-operator-name]').textContent = engineer ? t("Инженер") : t("Оператор");
    if (!engineer) {
      if (['scada','options','functionality','performance','engineering'].includes(page)) setPage('menu');
      $('[data-engineering-overlay]').hidden=true;
      $('[data-unwinder-confirm]').hidden=true;
      $('[data-connect-overlay]').hidden = true;
      $('[data-password-overlay]').hidden = true;
      if (pinEditor?.target.closest('[data-password-overlay]')) closePin(false);
    }
    $('.sc-app').dataset.motion = motionEnabled() ? 'on' : 'off';
    if (!motionEnabled()) {
      stopNavigationAnimations();
      for (const a of counterAnimations.values()) a.cancel();
      counterAnimations.clear();
    }
    $$('[data-option]').forEach(e => {
      const on = state.options?.[e.dataset.option] !== false;
      e.setAttribute('aria-checked', String(on));
      e.querySelector('.sc-option-state').textContent = on ? t("ВКЛ") : t("ВЫКЛ");
      e.disabled = !engineer || optionBusy;
    });
    $('[data-system-summary]').textContent = t("SCADA {0} · локальный режим", [state.version || '0.1.25']);
    $('[data-about-version]').textContent=state.version||'0.1.25';
    $('[data-exit]').hidden=state.options?.exitButton===false;
    $$('[data-exit]').forEach(b=>b.disabled=exitRequested);
    const font=['system','tahoma','arial','verdana'].includes(state.options?.font)?state.options.font:'system';
    root.dataset.font=font;
    $('[data-font-choice]').value=font;$('[data-font-choice]').disabled=!engineer||optionBusy;
    $('[data-clock-wallpaper]').toggleAttribute('hidden',state.options?.wallpaper===false);
    $('[data-page-content="clock"]').dataset.wallpaper=state.options?.wallpaper===false?'off':'on';
    if(!engineer||!motionEnabled())stopSnowTest();
    $('[data-snow-test]').disabled=!engineer||!motionEnabled();
    seasonalSnow(new Date());
  }
  let snowTestUntil=0,snowTestTimer=0;
  function stopSnowTest(){clearTimeout(snowTestTimer);snowTestTimer=0;snowTestUntil=0;}
  function testSnow(){
    if(!isEngineer()||!motionEnabled())return;
    stopSnowTest();snowTestUntil=performance.now()+10000;
    snowTestTimer=setTimeout(()=>{stopSnowTest();seasonalSnow(new Date());},10000);
    seasonalSnow(new Date());
  }
  function seasonalSnow(d) {
    const preview=snowTestUntil>performance.now();
    $('[data-header-snow]').hidden = !(motionEnabled() && (preview || state.options?.snow !== false && [11, 0].includes(d.getMonth())));
    $('[data-snow-test]').textContent=preview?t('Тест · {0} с',[Math.max(1,Math.ceil((snowTestUntil-performance.now())/1000))]):t('Тест · 10 с');
  }
  function openPin(target) {
    if (!target || authBusy) return;
    const kind = target.dataset.pinInput;
    const legacy = kind === 'old-password' || kind === 'auth-password' && state.auth?.engineerConfigured;
    pinEditor = {target, kind, legacy};
    const titles = {
      'auth-password': t("Пароль инженера"),
      'auth-repeat': t("Повторите пароль"),
      'old-password': t("Текущий пароль"),
      'new-password': t("Новый пароль"),
      'repeat-password': t("Повторите новый пароль")
    };
    $('[data-pin-title]').textContent = titles[kind];
    $('[data-pin-hint]').textContent = legacy ? t("Введите пароль. Прежний буквенный пароль можно ввести с клавиатуры ПК.") : t("Введите цифровой пароль: минимум 6 цифр.");
    $('[data-pin-entry]').value = target.value;
    $('[data-pin-error]').textContent = '';
    $('[data-pin-overlay]').hidden = false;
    $('[data-pin-entry]').focus();
    $('[data-pin-entry]').select();
  }
  function closePin(restoreFocus = true) {
    const target = pinEditor?.target;
    pinEditor = null;
    $('[data-pin-entry]').value = '';
    $('[data-pin-error]').textContent = '';
    $('[data-pin-overlay]').hidden = true;
    if (restoreFocus) target?.focus();
  }
  function pinKey(key) {
    if (!pinEditor) return;
    const input = $('[data-pin-entry]');
    let start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    if (key === 'clear') input.value = '';
    else if (key === 'backspace') {
      if (start === end) start = Math.max(0, start - 1);
      input.setRangeText('', start, end, 'end');
    } else if (/^[0-9]$/.test(key) && input.value.length - (end - start) < 128) input.setRangeText(key, start, end, 'end');
    $('[data-pin-error]').textContent = '';
    input.focus();
  }
  function applyPin() {
    if (!pinEditor) return;
    const {target, kind, legacy} = pinEditor, value = $('[data-pin-entry]').value;
    if (legacy ? Array.from(value).length < 6 || Array.from(value).length > 128 : !validPin(value)) {
      $('[data-pin-error]').textContent = legacy ? t("Введите пароль длиной от 6 до 128 символов.") : t("Новый пароль должен содержать от 6 до 128 цифр.");
      return;
    }
    target.value = value;
    closePin(false);
    if (kind === 'auth-password' && !state.auth?.engineerConfigured) openPin($('[data-auth-repeat]'));
    else if (kind === 'auth-password' || kind === 'auth-repeat') authenticate();
    else if (kind === 'old-password') openPin($('[data-new-password]'));
    else if (kind === 'new-password') openPin($('[data-repeat-password]'));
    else if (kind === 'repeat-password') changePassword();
  }
  function chooseProfile(role) {
    authRole = role;
    $$('[data-auth-role]').forEach(e => e.setAttribute('aria-pressed', String(e.dataset.authRole === role)));
    const setup = !state.auth?.engineerConfigured;
    $('[data-auth-engineer]').hidden = role !== 'engineer';
    $('[data-auth-repeat-label]').hidden = !setup;
    $('[data-auth-note]').textContent = state.auth?.locked ? t("Профиль требует восстановления файла accounts.json.") : setup ? t("Первый вход: задайте свой пароль инженера. Заводского пароля нет.") : t("Введите пароль инженера. Вход действует до 8 часов.");
    $('[data-auth-submit]').textContent = role === 'operator' ? t("Работать оператором") : setup ? t("Создать профиль и войти") : t("Войти инженером");
    $('[data-auth-error]').textContent = '';
  }
  function openAuth() {
    $('[data-auth-password]').value = '';
    $('[data-auth-repeat]').value = '';
    $('[data-operator-overlay]').hidden = false;
    chooseProfile(isEngineer() ? 'engineer' : 'operator');
    $(`[data-auth-role="${authRole}"]`).focus();
  }
  async function authenticate(operator = false) {
    if (authBusy) return;
    const role = operator ? 'operator' : authRole,
      password = $('[data-auth-password]').value,
      setup = !state.auth?.engineerConfigured;
    if (role === 'engineer' && (setup ? !validPin(password) : Array.from(password).length < 6 || Array.from(password).length > 128)) {
      return void ($('[data-auth-error]').textContent = t("Новый пароль — от 6 до 128 цифр. Для входа подходит и прежний пароль."));
    }
    if (role === 'engineer' && setup && password !== $('[data-auth-repeat]').value) {
      return void ($('[data-auth-error]').textContent = t("Пароли не совпадают."));
    }
    authBusy = true;
    authRevision++;
    $('[data-auth-submit]').disabled = true;
    try {
      const r = await api(role === 'operator' ? '/api/auth/operator' : setup ? '/api/auth/setup' : '/api/auth/login', role === 'operator' ? {} : {
        password
      });
      receive(await api('/api/state'));
      $('[data-operator-overlay]').hidden = true;
      toast(r.message, 'success');
    } catch (e) {
      $('[data-auth-error]').textContent = e.message;
    } finally {
      authRevision++;
      authBusy = false;
      $('[data-auth-submit]').disabled = false;
      $('[data-auth-password]').value = '';
      $('[data-auth-repeat]').value = '';
    }
  }
  async function changeOption(key, value) {
    if (!isEngineer() || optionBusy) return;
    if (key === 'theme' && (!['dark','classic'].includes(value) || value === state.options?.theme)) return;
    if (key === 'font' && (!['system','tahoma','arial','verdana'].includes(value) || value === state.options?.font)) return;
    const options = {
      snow: state.options?.snow !== false ? 1 : 0,
      animations: motionEnabled() ? 1 : 0,
      wallpaper: state.options?.wallpaper !== false ? 1 : 0,
      exitButton: state.options?.exitButton !== false ? 1 : 0,
      theme: state.options?.theme === 'classic' ? 'classic' : 'dark',
      font: ['system','tahoma','arial','verdana'].includes(state.options?.font)?state.options.font:'system'
    };
    options[key] = ['theme','font'].includes(key) ? value : 1 - options[key];
    optionBusy = true;
    render();
    try {
      await api('/api/options', options);
      receive(await api('/api/state'));
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      optionBusy = false;
      render();
    }
  }
  function openPassword() {
    if (!isEngineer()) return;
    for (const s of ['old', 'new', 'repeat']) $(`[data-${s}-password]`).value = '';
    $('[data-password-error]').textContent = '';
    $('[data-password-overlay]').hidden = false;
    $('[data-password-overlay] [data-close-overlay]').focus();
  }
  async function changePassword() {
    const password = $('[data-new-password]').value;
    if (!isEngineer() || authBusy) return;
    if (!validPin(password) || password !== $('[data-repeat-password]').value) {
      $('[data-password-error]').textContent = t("Новый пароль: от 6 до 128 цифр; оба ввода должны совпадать.");
      return;
    }
    authBusy = true;
    authRevision++;
    $('[data-save-password]').disabled = true;
    try {
      const r = await api('/api/auth/password', {
        oldPassword: $('[data-old-password]').value,
        newPassword: password
      });
      receive(await api('/api/state'));
      $('[data-password-overlay]').hidden = true;
      toast(r.message, 'success');
    } catch (e) {
      $('[data-password-error]').textContent = e.message;
    } finally {
      authRevision++;
      authBusy = false;
      $('[data-save-password]').disabled = false;
      for (const s of ['old', 'new', 'repeat']) $(`[data-${s}-password]`).value = '';
    }
  }
  function clock() {
    const d = new Date();
    $('[data-clock]').textContent = d.toLocaleTimeString(I18n.locale);
    $('[data-date]').textContent = d.toLocaleDateString(I18n.locale);
    seasonalSnow(d);
    const h = d.getHours();
    $('[data-clock-greeting]').textContent = h < 6 ? t("ДОБРОЙ НОЧИ") : h < 12 ? t("ДОБРОЕ УТРО") : h < 18 ? t("ДОБРЫЙ ДЕНЬ") : t("ДОБРЫЙ ВЕЧЕР");
    $('[data-big-time]').textContent = d.toLocaleTimeString(I18n.locale, {
      hour: '2-digit',
      minute: '2-digit'
    });
    $('[data-big-seconds]').textContent = String(d.getSeconds()).padStart(2, '0');
    $('[data-clock-full-date]').textContent = d.toLocaleDateString(I18n.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const day = h >= 8 && h < 20,
      start = new Date(d),
      end = new Date(d);
    start.setHours(day ? 8 : 20, 0, 0, 0);
    if (!day && h < 8) start.setDate(start.getDate() - 1);
    end.setTime(start.getTime());
    end.setHours(end.getHours() + 12);
    $('[data-shift-name]').textContent = day ? t("Дневная смена") : t("Ночная смена");
    $('[data-shift-range]').textContent = day ? '08:00 — 20:00' : '20:00 — 08:00';
    $('[data-shift-progress]').style.width = `${Math.max(0, Math.min(100, (d - start) / (end - start) * 100))}%`;
    const mins = Math.max(0, Math.ceil((end - d) / 60000));
    $('[data-shift-remaining]').textContent = t("До конца смены {0} ч {1} мин", [Math.floor(mins / 60), String(mins % 60).padStart(2, '0')]);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (calendarKey === key) return;
    calendarKey = key;
    $('[data-calendar-month]').textContent = d.toLocaleDateString(I18n.locale, {
      month: 'long'
    });
    $('[data-calendar-year]').textContent = d.getFullYear();
    const grid = $('[data-calendar-days]');
    grid.replaceChildren();
    const offset = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() + 6) % 7,
      days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let i = 0; i < 42; i++) {
      const cell = document.createElement('span'),
        date = i - offset + 1;
      cell.className = 'sc-calendar-day';
      if (date >= 1 && date <= days) {
        cell.textContent = date;
        cell.dataset.weekend = String(i % 7 >= 5);
        if (date === d.getDate()) {
          cell.setAttribute('aria-current', 'date');
          cell.title = t("Сегодня");
        }
      } else cell.dataset.empty = 'true';
      grid.append(cell);
    }
  }
  function resize() {
    const scale = Math.min(window.innerWidth / 1024, window.innerHeight / 600);
    root.style.transform = `translate(-50%,-50%) scale(${scale})`;
    mechanisms?.resize();
    resizePhotoHelpCanvas();
  }
  function renderIcons() {
    const paths = {
      house: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
      'gallery-vertical': 'M3 8h18v8H3ZM6 3h12M6 21h12',
      'layout-grid': 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
      timer: 'M9 2h6M12 7v6l3 2M18 5l2 2 M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
      'scan-line': 'M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M2 12h20',
      'triangle-alert': 'M12 3 2 21h20ZM12 9v5M12 17v.2',
      'user-round': 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21a8 8 0 0 1 16 0',
      activity: 'M2 12h4l3-8 5 16 3-8h5',
      network: 'M9 3h6v5H9ZM3 16h6v5H3ZM15 16h6v5h-6ZM12 8v4M6 16v-4h12v4',
      cable: 'M4 2v4M8 2v4M3 6h6v4H3ZM6 10v8a3 3 0 0 0 6 0V6a3 3 0 0 1 6 0v4M15 10h6v5h-6M17 15v4M19 15v4',
      'shield-check': 'M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6ZM8 12l3 3 5-6',
      'move-horizontal': 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
      pencil: 'M4 16 16 4l4 4L8 20H4ZM14 6l4 4',
      layers: 'M12 3 2 8l10 5 10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
      waves: 'M2 6c3-4 5 4 8 0s5 4 8 0h4M2 12c3-4 5 4 8 0s5 4 8 0h4M2 18c3-4 5 4 8 0s5 4 8 0h4',
      power: 'M12 2v10M6 5a9 9 0 1 0 12 0',
      gauge: 'M4 20a10 10 0 1 1 16 0ZM12 15l5-7M5 11h2M11 5v2',
      'package-check': 'M3 6l9-4 9 4v13l-9 3-9-3ZM3 6l9 4 9-4M12 10v12M15 14l2 2 4-4',
      'sliders-horizontal': 'M3 6h5M12 6h9M3 12h10M17 12h4M3 18h2M9 18h12M8 4v4M13 10v4M5 16v4',
      minus: 'M5 12h14',
      plus: 'M5 12h14M12 5v14',
      'file-box': 'M4 2h11l5 5v15H4ZM15 2v6h5M8 13h8v5H8Z',
      keyboard: 'M2 5h20v14H2ZM5 8h.1M9 8h.1M13 8h.1M17 8h.1M5 12h.1M9 12h.1M13 12h.1M17 12h.1M6 16h12',
      delete: 'M8 5h14v14H8L2 12ZM12 9l6 6M18 9l-6 6',
      eraser: 'M3 14 14 3l7 7-11 11H8ZM7 10l7 7M10 21h12',
      'rotate-ccw': 'M3 3v6h6M3 9a9 9 0 1 1 0 7',
      check: 'M4 12l5 5L20 6',
      settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'
    };
    $$('[data-lucide]').forEach(e => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.8');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', paths[e.dataset.lucide] || paths.settings);
      svg.append(path);
      e.replaceWith(svg);
    });
  }

  const photoHelpCanvas=$('[data-photo-help-canvas]');
  let photoHelpContext=null;
  let photoColors={};
  const photoHelpSteps=[
    {
      title:'Метка под датчиком',
      text:'Штатной кнопкой ручного Jog подведите фотометку под датчик. Плёнку пока не двигайте.',
      hint:'Нажмите «Включить обучение»: ПЛК запомнит начальную позицию, и отсчёт смещения начнётся с нуля.',
      caption:'Метка под фотодатчиком',
      drawing:'Схема ручной протяжки плёнки до фотометки.',
      next:'Включить обучение'
    },
    {
      title:'Подготовьте фотодатчик',
      text:'На фотодатчике нажимайте SET до режима «2nd», как в штатной инструкции. Метка остаётся под датчиком.',
      hint:'Режим обучения в SCADA остаётся включённым. Выбрали «2nd» — нажмите «Далее».',
      caption:'Кнопка SET и надпись «2nd»',
      drawing:'Палец нажимает SET на фотодатчике, на дисплее появляется 2nd.',
      next:'Далее'
    },
    {
      title:'Обучите фон и завершите',
      text:'Штатным Jog протяните плёнку до чистого участка без метки: смещение будет расти. Нажмите SET на датчике и дождитесь завершения его обучения.',
      hint:'После подтверждения на датчике нажмите «Завершить обучение». При запуске станка ПЛК также снимает этот режим.',
      caption:'Участок без метки · подтверждение SET',
      drawing:'Плёнка протягивается до участка без метки, затем оператор нажимает SET.',
      next:'Завершить обучение'
    }
  ];
  function photoSmoothStep(x){return x*x*(3-2*x);}
  function refreshPhotoColors(){
    const style=getComputedStyle($('.sc-app'));
    const color=(key,fallback)=>style.getPropertyValue(key).trim()||fallback;
    photoColors={panel:color('--sc-panel','#102b3e'),face:color('--sc-panel-top','#21445c'),film:color('--sc-field-top','#c6dbe6'),ink:color('--sc-field-ink','#10232f'),edge:color('--sc-line','#567082'),text:color('--sc-text','#d8e9ef'),cyan:color('--sc-cyan','#2ccaff'),amber:color('--sc-amber','#edbd66'),green:color('--sc-green','#63d9b1')};
  }
  function stopPhotoHelpMotion(){
    if(photoHelp.frame!==null)cancelAnimationFrame(photoHelp.frame);
    photoHelp.frame=null;photoHelp.lastFrame=null;
  }
  function resizePhotoHelpCanvas(){
    if(!photoHelp.active||page!=='photomark')return;
    const width=photoHelpCanvas.getBoundingClientRect().width;
    if(!width)return;
    const pixels=Math.min(4096,Math.max(1,Math.round(width*(window.devicePixelRatio||1))));
    const height=Math.round(pixels*400/720);
    if(photoHelpCanvas.width!==pixels||photoHelpCanvas.height!==height){photoHelpCanvas.width=pixels;photoHelpCanvas.height=height;drawPhotoHelp(photoHelp.elapsed);}
  }
  function syncPhotoHelpAnimation(){
    const visible=photoHelp.active&&page==='photomark'&&!document.hidden&&!photoHelp.disposed;
    if(!visible){stopPhotoHelpMotion();return;}
    const duration=[3.7,4.2,5.2][photoHelp.step];
    const animated=motionEnabled();
    if(!animated){stopPhotoHelpMotion();drawPhotoHelp(duration);return;}

    if(photoHelp.frame!==null)return;
    const tick=now=>{
      photoHelp.frame=null;
      if(!photoHelp.active||page!=='photomark'||document.hidden||!motionEnabled()){photoHelp.lastFrame=null;return;}
      if(photoHelp.lastFrame!==null)photoHelp.elapsed+=Math.min(.1,Math.max(0,(now-photoHelp.lastFrame)/1000));
      photoHelp.elapsed%=duration+1.2;
      photoHelp.lastFrame=now;drawPhotoHelp(Math.min(duration,photoHelp.elapsed));
      photoHelpCanvas.dataset.animationFrame=String(Math.floor(photoHelp.elapsed*100));
      photoHelp.frame=requestAnimationFrame(tick);
    };
    photoHelp.frame=requestAnimationFrame(tick);
  }
  function photoStep(step){
    photoHelp.step=step;photoHelp.elapsed=0;stopPhotoHelpMotion();
  }
  function startPhotoHelp(){
    if(photoHelp.active)return;
    if(!photoHelpContext)photoHelpContext=photoHelpCanvas.getContext('2d');
    photoHelp.active=true;photoHelp.epoch=state.epoch;photoHelp.message='';photoHelp.operation=null;
    photoStep(display('photoReset')===1?1:0);
    renderPhotoHelp();
    $('[data-photo-help-cancel]').focus({preventScroll:true});
  }
  function closePhotoHelp(restoreFocus=true){
    photoHelp.active=false;stopPhotoHelpMotion();
    renderPhotoHelp();
    if(restoreFocus)$('[data-photo-help]').focus({preventScroll:true});
  }
  function requestPhotoHelpState(value){
    if(!commandReady('photoReset'))return;
    const id=crypto.randomUUID();
    photoHelp.operation={id,value,epoch:state.epoch};photoHelp.message='';
    runCommand('photoReset',null,null,false,value,id);
  }
  function advancePhotoHelp(){
    if(!photoHelp.active||photoHelp.operation||!ready()||!fresh('photoReset'))return;
    const teach=display('photoReset');
    if(photoHelp.step===0){
      if(teach===1){photoStep(1);renderPhotoHelp();}
      else requestPhotoHelpState(1);
    }else if(photoHelp.step===1){
      if(teach!==1){photoStep(0);photoHelp.message='Обучение выключено в ПЛК. Проверьте положение метки перед повторным включением.';}
      else photoStep(2);
      renderPhotoHelp();
    }else if(teach===0){closePhotoHelp();toast(t('Режим обучения уже выключен в ПЛК. Проверьте пробную резку.'),'success');}
    else requestPhotoHelpState(0);
  }
  function completePhotoHelpOperation(tx){
    const operation=photoHelp.operation;
    if(!operation||operation.id!==tx.id)return;
    photoHelp.operation=null;
    if(!photoHelp.active)return;
    if(tx.status!=='confirmed'||state.epoch!==operation.epoch||display('photoReset')!==operation.value){
      photoHelp.message=tx.status==='confirmed'?'Режим обучения изменился в ПЛК. Проверьте его состояние':tx.message;
      return;
    }
    if(operation.value===1){photoStep(1);photoHelp.message='Обучение включено. Плёнку пока не двигайте: сначала подготовьте датчик.';}
    else {closePhotoHelp();toast(t('Обучение выключено. Проверьте пробную резку; при необходимости скорректируйте смещение.')); }
  }
  function renderPhotoHelp(){
    const teach=display('photoReset'),active=teach===1;
    const button=$('[data-photo-teach]');
    button.dataset.on=String(active);button.dataset.unknown=String(teach===null);
    button.setAttribute('aria-pressed',teach===null?'mixed':String(active));
    button.setAttribute('aria-label',t(active?'Завершить обучение фотометки':'Включить обучение фотометки'));
    button.title=t(active?'Завершить обучение фотометки':'Включить обучение фотометки');
    $('[data-photo-teach-detail]').textContent=teach===null?t('Нет данных'):t(active?'ВКЛ · нажмите для выхода':'Отсчёт протяжки');
    $('[data-photo-offset-note]').textContent=t(active?'Обучение · отсчёт протяжки':'Коррекция · шаг 0,5 мм');
    const length=display('workingLength');
    $('[data-photo-offset-range]').textContent=length===null?t('Пределы недоступны'):t('Предел: 0–{0} мм',[format(length,1)]);
    $('[data-photo-normal]').hidden=photoHelp.active;
    $('[data-photo-wizard]').hidden=!photoHelp.active;
    $('[data-photo-section-title]').textContent=t(photoHelp.active?'ПОМОЩЬ В НАСТРОЙКЕ':'РЕЗКА ПО ФОТОМЕТКЕ');
    $('[data-photo-section-detail]').textContent=photoHelp.active?t('Шаг {0} из 3',[photoHelp.step+1]):t('Обучение и коррекция');
    if(!photoHelp.active)return;
    if(photoHelp.epoch!==state.epoch){
      photoHelp.epoch=state.epoch;
      photoHelp.message='Связь с ПЛК изменилась. Проверьте положение плёнки и фактический режим обучения. Команды автоматически не повторялись.';
    }
    const info=photoHelpSteps[photoHelp.step];
    $('[data-photo-help-title]').textContent=t(info.title);
    $('[data-photo-help-text]').textContent=t(info.text);
    $('[data-photo-help-hint]').textContent=t(info.hint);
    $('[data-photo-help-caption]').textContent=t(info.caption);
    photoHelpCanvas.setAttribute('aria-label',t(info.drawing));
    $('[data-photo-step-hold]').hidden=photoHelp.step!==1;
    $('[data-photo-help-paused]').hidden=ready()&&fresh('photoReset');
    const message=$('[data-photo-help-message]');
    message.textContent=I18n.text(photoHelp.message);message.hidden=!photoHelp.message;
    $('[data-photo-help-mode]').textContent=teach===null?t('Нет данных'):t(active?'ВКЛ':'ВЫКЛ');
    const next=$('[data-photo-help-next]');
    const needsCommand=photoHelp.step===0&&teach===0||photoHelp.step===2&&teach===1;
    next.disabled=Boolean(photoHelp.operation||!ready()||!fresh('photoReset')||needsCommand&&!commandReady('photoReset'));
    $('[data-photo-help-next-text]').textContent=t(photoHelp.operation?'Ожидаем ПЛК…':photoHelp.step===2&&teach===0?'Закрыть помощь':photoHelp.step===1&&teach===0?'Проверить метку':info.next);
    $$('[data-photo-step]').forEach(item=>{
      const n=Number(item.dataset.photoStep);item.dataset.complete=String(n<photoHelp.step);
      if(n===photoHelp.step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
    });
    refreshPhotoColors();resizePhotoHelpCanvas();syncPhotoHelpAnimation();
  }
  document.addEventListener('visibilitychange',syncPhotoHelpAnimation);
  window.addEventListener('beforeunload',()=>{photoHelp.disposed=true;stopPhotoHelpMotion();});

      function photoBox(ctx, x, y, width, height, radius, fill, stroke = null) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+width-r,y);
        ctx.quadraticCurveTo(x+width,y,x+width,y+r);ctx.lineTo(x+width,y+height-r);
        ctx.quadraticCurveTo(x+width,y+height,x+width-r,y+height);ctx.lineTo(x+r,y+height);
        ctx.quadraticCurveTo(x,y+height,x,y+height-r);ctx.lineTo(x,y+r);
        ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
        if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
      }
      function photoPolygon(ctx, points, fill, stroke = null) {
        ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
        for(const point of points.slice(1))ctx.lineTo(point[0],point[1]);ctx.closePath();
        if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
      }
      function photoFinger(ctx, x, y, press, scale = 1) {
        ctx.save();ctx.translate(x,y+26*(1-press));ctx.rotate(-0.36);ctx.scale(scale,scale);
        ctx.beginPath();ctx.moveTo(-17,116);ctx.lineTo(-17,28);
        ctx.quadraticCurveTo(-17,7,0,7);ctx.quadraticCurveTo(17,7,17,28);ctx.lineTo(17,71);
        ctx.quadraticCurveTo(27,58,37,69);ctx.lineTo(54,103);
        ctx.quadraticCurveTo(65,124,48,155);ctx.lineTo(4,161);ctx.quadraticCurveTo(-27,148,-17,116);ctx.closePath();
        ctx.globalAlpha=0.94;ctx.fillStyle=photoColors.film;ctx.fill();
        ctx.strokeStyle=photoColors.edge;ctx.lineWidth=2.3;ctx.stroke();
        ctx.beginPath();ctx.moveTo(-10,40);ctx.lineTo(10,40);ctx.stroke();ctx.restore();
      }
      function photoSensor(ctx, x, y, scale, display, press = 0, hand = false, learned = false) {
        ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
        // Схематический корпус датчика; конкретная модель и геометрия не предполагаются.
        photoPolygon(ctx,[[14,0],[151,0],[164,12],[27,12]],photoColors.edge);
        photoPolygon(ctx,[[151,0],[164,12],[164,130],[151,116]],photoColors.ink);
        photoBox(ctx,0,10,151,117,8,photoColors.face,photoColors.edge);
        photoBox(ctx,16,25,119,40,4,photoColors.ink);
        ctx.fillStyle=learned?photoColors.green:photoColors.amber;
        ctx.font='500 38px "Consolas", monospace';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(display,75,46);
        ctx.beginPath();ctx.arc(42,92,15,0,Math.PI*2);ctx.fillStyle=press>0.65?photoColors.cyan:photoColors.panel;ctx.fill();
        ctx.strokeStyle=photoColors.cyan;ctx.lineWidth=2;ctx.stroke();
        ctx.fillStyle=photoColors.text;ctx.font='500 36px "Segoe UI", sans-serif';ctx.fillText('SET',102,94);
        ctx.beginPath();ctx.arc(130,118,4,0,Math.PI*2);ctx.fillStyle=learned?photoColors.green:photoColors.cyan;ctx.fill();
        ctx.beginPath();ctx.ellipse(74,127,19,7,0,0,Math.PI*2);ctx.fillStyle=photoColors.ink;ctx.fill();
        ctx.strokeStyle=photoColors.edge;ctx.lineWidth=2;ctx.stroke();
        ctx.strokeStyle=photoColors.edge;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(143,64);ctx.bezierCurveTo(194,62,176,-16,210,-19);ctx.stroke();
        if(hand)photoFinger(ctx,42,84,press,0.57);
        ctx.restore();
      }
      function photoMark(ctx, u, alpha = 1) {
        const a=u-0.021,b=u+0.021;
        const points=[[90+502*a,214-67*a],[90+502*b,214-67*b],[142+503*b,301-65*b],[142+503*a,301-65*a]];
        ctx.save();ctx.globalAlpha=alpha;photoPolygon(ctx,points,photoColors.ink);ctx.restore();
      }
      function photoFilm(ctx, u, movement, clear = false) {
        photoPolygon(ctx,[[90,214],[592,147],[645,236],[142,301]],photoColors.film,photoColors.edge);
        ctx.save();ctx.strokeStyle=photoColors.edge;ctx.globalAlpha=0.4;ctx.lineWidth=1.3;
        for(const r of [0.17,0.83]){
          ctx.beginPath();ctx.moveTo(90+52*r,214+87*r);ctx.lineTo(592+53*r,147+89*r);ctx.stroke();
        }
        ctx.restore();
        ctx.save();photoPolygon(ctx,[[90,214],[592,147],[645,236],[142,301]],null);ctx.clip();photoMark(ctx,u);ctx.restore();
        // Направление протяжки: от тянущей пары справа к открытому ножу слева.
        const arrowU=0.84-movement*0.12,x=116+502*arrowU,y=258-66*arrowU;
        ctx.save();ctx.strokeStyle=photoColors.cyan;ctx.lineWidth=4;ctx.globalAlpha=clear?0.4:0.85;
        ctx.beginPath();ctx.moveTo(x+40,y-5);ctx.lineTo(x-15,y+2);ctx.lineTo(x-3,y-12);
        ctx.moveTo(x-15,y+2);ctx.lineTo(x+1,y+13);ctx.stroke();ctx.restore();
        // Нож показан открытым на всём протяжении обучения.
        photoPolygon(ctx,[[56,172],[119,162],[165,228],[102,237]],photoColors.face,photoColors.edge);
        photoPolygon(ctx,[[102,237],[165,228],[165,240],[102,249]],photoColors.ink,photoColors.edge);
        photoPolygon(ctx,[[121,310],[184,301],[200,325],[137,335]],photoColors.face,photoColors.edge);
        ctx.strokeStyle=photoColors.edge;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(66,189);ctx.lineTo(136,324);ctx.moveTo(124,180);ctx.lineTo(191,316);ctx.stroke();
        ctx.save();ctx.translate(614,183);ctx.rotate(-0.12);
        photoBox(ctx,-14,-51,28,115,10,photoColors.face,photoColors.edge);
        ctx.strokeStyle=photoColors.cyan;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-2,-40);ctx.lineTo(-2,53);ctx.stroke();ctx.restore();
      }
      function drawPhotoHelp(seconds = 0) {
        if(!photoHelpContext || photoHelp.disposed)return;
        const ctx=photoHelpContext;ctx.setTransform(photoHelpCanvas.width/720,0,0,photoHelpCanvas.height/400,0,0);
        ctx.clearRect(0,0,720,400);ctx.fillStyle=photoColors.panel;ctx.fillRect(0,0,720,400);
        const step=photoHelp.step,p=Math.min(seconds,6.8);
        if(step===1){
          const pulse=p<3.25?Math.max(0,1-Math.abs((p%1.08)-0.68)/0.20):0;
          photoSensor(ctx,193,30,2.07,p>=3.25?'2nd':'—',pulse,p<3.25);
          if(p>=3.25){
            ctx.save();ctx.strokeStyle=photoColors.cyan;ctx.lineWidth=3;
            photoBox(ctx,223,78,259,100,8,null,photoColors.cyan);ctx.restore();
          }
        }else{
          const progress=photoSmoothStep(Math.min(1,p/(step===0?3.2:2.3)));
          const u=step===0?0.99-0.47*progress:0.52-0.34*progress;
          const markPresent=Math.abs(u-0.52)<0.026;
          const pressing=step===2 && p>2.8 && p<3.8;
          const pulse=pressing?Math.max(0,1-Math.abs(p-3.35)/0.35):0;
          const learned=step===2 && p>=4.6;
          photoFilm(ctx,u,progress,step===2 && p>=2.3);
          // Световое пятно остаётся на одном месте, движется только полотно.
          ctx.save();ctx.globalAlpha=0.17;
          photoPolygon(ctx,[[369,173],[365,218],[389,233]],markPresent?photoColors.green:photoColors.cyan);ctx.restore();
          ctx.save();ctx.beginPath();ctx.ellipse(378,225,16,9,-0.12,0,Math.PI*2);
          ctx.lineWidth=2.5;ctx.strokeStyle=markPresent?photoColors.green:photoColors.cyan;ctx.setLineDash([5,5]);ctx.stroke();ctx.restore();
          photoSensor(ctx,295,27,1.12,step===2 && p<3.8?'2nd':'—',pulse,pressing,learned);
          if(step===2 && p>=3.8 && p<4.6){
            ctx.save();ctx.strokeStyle=photoColors.amber;ctx.lineWidth=3;
            ctx.beginPath();ctx.arc(485,91,17,seconds*4,seconds*4+Math.PI*1.4);ctx.stroke();ctx.restore();
          }
        }
      }

  let alarmMessages = {}, heldCommand = null, alarmRenderKey = '';
  try { const response = await fetch('/alarms.json', {cache:'no-store'}); if(response.ok) alarmMessages=await response.json(); } catch {}
  function commandReady(key) {
    return ready() && state.commands?.[key]?.available && !pending && !state.busy && !state.commandLease?.pendingRelease && !state.quitting;
  }
  function sendStop(command, keepalive = false) {
    const body={key:command.key,id:command.id,epoch:command.epoch,action:'stop'};
    if(keepalive) return fetch('/api/command',{method:'POST',headers:{'X-SCADA-Token':token,'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body),keepalive:true}).catch(()=>{});
    return api('/api/command',body).catch(()=>{});
  }
  function stopHeld(keepalive=false) {
    const held=heldCommand;if(!held)return;
    heldCommand=null;clearInterval(held.timer);sendStop(held,keepalive);
    if(held.button?.hasPointerCapture?.(held.pointerId))try{held.button.releasePointerCapture(held.pointerId);}catch{}
    render();
  }
  async function runCommand(key, button=null, pointerId=null, confirmed=false, desiredValue=null, operationId=null) {
    if(!commandReady(key))return;
    if(key==='alarmClear'&&!confirmed){$('[data-command-confirm]').hidden=false;return;}
    const id=operationId||crypto.randomUUID(),epoch=state.epoch,fieldKey=state.commands[key].field;
    const commandBefore=display(fieldKey),commandRaw=field(fieldKey)?.raw;
    pending={id,key:fieldKey,before:field(fieldKey)?.value,epoch,created:Date.now()};
    const held=button?{key,id,epoch,button,pointerId,timer:null}:null;
    if(held){heldCommand=held;if(pointerId!==null)try{button.setPointerCapture(pointerId);}catch{}}
    render();
    try {
      const body={key,id,epoch,action:'start'};
      if(key==='photoReset'){body.action='set';body.value=desiredValue===null?1-commandBefore:desiredValue;body.expected=commandRaw;}
      await api('/api/command',body);
      if(held){
        if(heldCommand!==held){await sendStop(held);return;}
        held.timer=setInterval(()=>{
          if(heldCommand!==held)return;
          if(!online||!state.connected||state.epoch!==epoch||document.hidden||$$('.sc-overlay').some(o=>!o.hidden)){stopHeld();return;}
          api('/api/command',{key,id,epoch,action:'keepalive'}).catch(()=>stopHeld());
        },150);
      }
    } catch(e) {
      if(held){stopHeld();await sendStop(held);}
      if(e.definitive)finishOperation({id,status:e.status===409?'conflict':'rejected',message:e.message});
      else toast(t("Ответ не получен. Проверяем результат операции; повторной отправки нет."),'warning');
      render();
    }
  }
  function renderCommands() {
    $$('[data-command]').forEach(button=>{
      const own=heldCommand?.key===button.dataset.command;
      button.disabled=own?false:!commandReady(button.dataset.command);
      button.dataset.pending=String(own||state.commandLease?.active&&state.commands?.[button.dataset.command]?.held);
    });
    const value=display('glueTest');
    $$('[data-glue-test-state]').forEach(e=>e.textContent=value===null?t("Нет данных"):value===1?t("ВКЛ"):t("ВЫКЛ"));
    $$('[data-glue-test-detail]').forEach(e=>e.textContent=state.commandLease?.pendingRelease?I18n.text(state.commandLease.message):t("Тест подачи клея"));
  }
  function renderAlarms() {
    const a=state.alarms, good=online&&state.connected&&a?.quality;
    $('[data-alarms-text]').textContent=good&&display('machineState')===2&&!a.activeCount?t("Станок сообщает об аварийной остановке. Записи аварий ещё не получены."):good?t("Активных аварий: {0}. Ожидают подтверждения: {1}.",[a.activeCount,a.waitingAcknowledgement]):t("Подробный список аварий недоступен. Проверьте связь с ПЛК.");
    const alertButton=$('.sc-nav-button[data-page="alarms"]');
    alertButton.dataset.alarmActive=String(Boolean(online&&state.connected&&(display('machineState')===2||good&&a.activeCount>0)));
    if(page!=='alarms')return;
    const renderKey=good?JSON.stringify(a.records):'unavailable';if(renderKey===alarmRenderKey)return;alarmRenderKey=renderKey;
    const list=$('[data-alarm-list]');list.replaceChildren();
    if(!good)return;
    const records=[...(a.records||[])].sort((x,y)=>(x.state===10?0:1)-(y.state===10?0:1)||x.slot-y.slot);
    if(!records.length){list.textContent=t("Нет зарегистрированных аварий");return;}
    for(const row of records){
      const message=alarmMessages[String(row.id)]||{},article=document.createElement('article');article.className='sc-alarm-record';article.dataset.active=String(row.state===10);
      const title=document.createElement('strong'), status=document.createElement('span'),times=document.createElement('small');
      title.textContent=`${row.id}: ${I18n.language==='en'?(message.ENG||message.TUR||t("Неизвестная авария")):(message.RUS||message.ENG||message.TUR||t("Неизвестная авария"))}`;
      status.textContent=(row.state===20?t("Подтверждена"):row.condition?t("Причина активна"):t("Причина устранена · ожидает подтверждения"))+(message.cause?.startsWith('Isilar.')?(message.cause.endsWith('AkimF')?' · '+t("Контроль тока"):message.cause.endsWith('HeatF')?' · '+t("Контроль температуры"):''):'');
      times.textContent=t("Появление: {0} · Подтверждение: {1}",[row.occurred||'—',row.acknowledged||'—']);article.append(title,status,times);list.append(article);
    }
  }
  root.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-hold-command]');if(!button||button.disabled||event.button!==0)return;
    event.preventDefault();runCommand(button.dataset.command,button,event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(heldCommand&&heldCommand.pointerId===event.pointerId){const r=heldCommand.button.getBoundingClientRect();if(event.clientX<r.left-4||event.clientX>r.right+4||event.clientY<r.top-4||event.clientY>r.bottom+4)stopHeld();}
  });
  document.addEventListener('pointerup',()=>stopHeld());
  document.addEventListener('pointercancel',()=>stopHeld());
  root.addEventListener('lostpointercapture',()=>stopHeld());
  root.addEventListener('keydown',event=>{
    const button=event.target.closest('[data-hold-command]');if(button&&[' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat&&!heldCommand)runCommand(button.dataset.command,button);}
  });
  document.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key))stopHeld();});
  window.addEventListener('blur',()=>stopHeld());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopHeld(true);stopNavigationAnimations();}});
  window.addEventListener('pagehide',()=>stopHeld(true));
  root.addEventListener('dragstart',e=>e.preventDefault());
  root.addEventListener('selectstart',e=>{if(!e.target.closest?.('input,textarea,[contenteditable="true"]'))e.preventDefault();});
  document.addEventListener('keydown',e=>{if(exitRequested&&!e.altKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();e.stopImmediatePropagation();}},true);

  root.addEventListener('click', e => {
    if(exitRequested)return;
    const passwordInput = e.target.closest('input[data-pin-input]');
    if (passwordInput) return openPin(passwordInput);
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.classList.contains('sc-nav-button') || b.hasAttribute('data-nav-response')) animateNavigation(b);
    if(b.hasAttribute('data-unwinder-toggle'))return requestUnwinder(display('unwinderAutoStop')===1?'temporary':'enable');
    if(b.hasAttribute('data-unwinder-permanent')){unwinderConfirm={raw:field('unwinderAutoStop').raw,epoch:state.epoch};$('[data-unwinder-confirm-error]').textContent='';$('[data-unwinder-confirm]').hidden=false;return;}
    if(b.hasAttribute('data-confirm-unwinder'))return requestUnwinder('permanent',unwinderConfirm);
    if(b.hasAttribute('data-engineering-section')){if(isEngineer()){engineeringBrowser?.openSection(b.dataset.engineeringSection);setPage('engineering');}return;}
    if(b.hasAttribute('data-hold-command'))return;
    if(b.hasAttribute('data-command'))return runCommand(b.dataset.command);
    if(b.hasAttribute('data-confirm-alarm-clear')){$('[data-command-confirm]').hidden=true;return runCommand('alarmClear',null,null,true);}
    if(b.hasAttribute('data-photo-help'))return startPhotoHelp();
    if(b.hasAttribute('data-photo-help-next'))return advancePhotoHelp();
    if(b.hasAttribute('data-photo-help-cancel'))return closePhotoHelp();
    if (b.hasAttribute('data-pin-key')) pinKey(b.dataset.pinKey);else if (b.hasAttribute('data-pin-apply')) applyPin();else if (b.hasAttribute('data-pin-cancel')) closePin();else if (b.hasAttribute('data-page')) setPage(b.dataset.page);else if (b.hasAttribute('data-open-node')) setPage(b.dataset.openNode);else if (b.hasAttribute('data-open-language')) openLanguage();else if (b.hasAttribute('data-choose-language')) changeLanguage(b.dataset.chooseLanguage);else if (b.hasAttribute('data-glue-mode')) {
      const key='gluePhotoMode',value=Number(b.dataset.glueMode==='photo');
      if(editable(key)&&field(key).value!==value)requestWrite(key,value,{raw:field(key).raw,epoch:state.epoch});
    } else if (b.hasAttribute('data-alarm-scroll')) $('[data-alarm-list]').scrollBy({top:Number(b.dataset.alarmScroll)*180,behavior:'smooth'});else if (b.hasAttribute('data-node-toggle')) toggle(b.dataset.nodeToggle);else if (b.hasAttribute('data-nudge')) nudge(b.dataset.nudge,Number(b.dataset.step));else if (b.hasAttribute('data-edit')) openNumber(b.dataset.edit);else if (b.hasAttribute('data-reset-counter')) openReset(b.dataset.resetCounter);else if (b.hasAttribute('data-reset-apply')) applyReset();else if (b.hasAttribute('data-reset-cancel')) closeReset();else if (b.hasAttribute('data-normal-belt')) normalBelt();else if (b.hasAttribute('data-cleaning-add')) addCleaning();else if (b.hasAttribute('data-auth-role')) chooseProfile(b.dataset.authRole);else if (b.hasAttribute('data-auth-submit')) authenticate();else if (b.hasAttribute('data-switch-operator')) authenticate(true);else if (b.hasAttribute('data-theme-choice')) changeOption('theme',b.dataset.themeChoice);else if (b.hasAttribute('data-option')) changeOption(b.dataset.option);else if (b.hasAttribute('data-open-password')) openPassword();else if (b.hasAttribute('data-save-password')) changePassword();else if (b.hasAttribute('data-toggle-welding')) toggle('weldingEnabled');else if (b.hasAttribute('data-toggle')) toggle(b.dataset.toggle);else if (b.hasAttribute('data-offset')) adjustOffset(Number(b.dataset.offset));else if (b.hasAttribute('data-key')) keyPress(b.dataset.key);else if (b.hasAttribute('data-apply-number')) applyNumber();else if (b.hasAttribute('data-cancel-number')) closeNumber();else if (b.hasAttribute('data-open-connect')) openConnect();else if (b.hasAttribute('data-close-overlay')) $(b.dataset.closeOverlay).hidden = true;else if (b.hasAttribute('data-connect-submit')) connect(Number(b.dataset.connectSubmit));else if (b.hasAttribute('data-open-history')) {
      $('[data-history-overlay]').hidden = false;
      renderHistory();
    } else if (b.hasAttribute('data-download-report')) downloadReport();else if (b.hasAttribute('data-fullscreen')) {
      if (window.SCADA_BOOT.kiosk) return;
      const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      action.catch(() => toast(t("Для полного экрана нажмите F11.")));
    } else if (b.hasAttribute('data-open-alarms')) {
      setPage('alarms');
    } else if (b.hasAttribute('data-edit-operator')) openAuth();else if (b.hasAttribute('data-exit')) requestExit();
  });
  $('[data-pin-entry]').addEventListener('input', e => {
    if (pinEditor && !pinEditor.legacy) e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 128);
    $('[data-pin-error]').textContent = '';
  });
  document.addEventListener('keydown', e => {
    if(e.key==='Escape')stopHeld();
    if (pinEditor && ['Enter', 'Escape'].includes(e.key)) {
      if (e.key === 'Enter') applyPin(); else closePin();
      e.preventDefault();
      return;
    }
    if (pinEditor && !e.ctrlKey && !e.metaKey && (/^[0-9]$/.test(e.key) || ['Backspace', 'Delete'].includes(e.key))) {
      pinKey(e.key === 'Backspace' ? 'backspace' : e.key === 'Delete' ? 'clear' : e.key);
      e.preventDefault();
      return;
    }
    if (!$('[data-operator-overlay]').hidden && e.key === 'Enter') {
      authenticate();
      e.preventDefault();
      return;
    }
    if (!$('[data-password-overlay]').hidden && e.key === 'Enter') {
      changePassword();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && photoHelp.active && !editor && !resetEditor && !$$('.sc-overlay').some(o=>!o.hidden)) {e.preventDefault();closePhotoHelp();return;}
    if (e.key === 'Escape' && !editor && !resetEditor) {
      $$('.sc-overlay').forEach(o => o.hidden = true);
      return;
    }
    const dialog = pinEditor ? $('[data-pin-overlay]') : $$('.sc-overlay').find(o => !o.hidden);
    if (e.key === 'Tab' && dialog) {
      const items = Array.from(dialog.querySelectorAll('button,input')).filter(n => !n.disabled && !n.closest('[hidden]'));
      if (items.length) {
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
    if (pinEditor) return;
    if (resetEditor && !$('[data-reset-overlay]').hidden) {
      if (e.key === 'Escape') {
        closeReset();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        applyReset();
        e.preventDefault();
      }
      return;
    }
    if (!editor || $('[data-number-overlay]').hidden) return;
    if (e.key === 'Escape') {
      closeNumber();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      applyNumber();
      e.preventDefault();
    } else if (/^\d$/.test(e.key) || [',', '.', 'Backspace', 'Delete', '-'].includes(e.key)) {
      keyPress(e.key === 'Backspace' ? 'backspace' : e.key === 'Delete' ? 'clear' : e.key === '-' ? 'sign' : e.key);
      e.preventDefault();
    }
  });
  function announceReady(attempt = 0) {
    api('/api/ui-ready', {}).catch(() => {
      if (attempt < 2 && !stopped) setTimeout(() => announceReady(attempt + 1), 1000);
    });
  }
  window.addEventListener('resize', resize);
  root.addEventListener('change',e=>{if(e.target.matches('[data-font-choice]'))changeOption('font',e.target.value);});
  root.addEventListener('click',e=>{if(e.target.closest('[data-snow-test]'))testSnow();});
  window.addEventListener('beforeunload',stopSnowTest);
  layoutMenu();
  renderIcons();
  I18n.bind(document.body);
  $('[data-fullscreen]').hidden = window.SCADA_BOOT.kiosk === true;
  $('.sc-sidebar-foot').hidden = window.SCADA_BOOT.kiosk === true;
  mechanisms = window.SCADA_MECHANISMS?.create(root);
  window.addEventListener('beforeunload', () => {mechanisms?.dispose();functionalityBrowser?.dispose();performanceBrowser?.dispose();engineeringBrowser?.dispose();});
  functionalityBrowser = window.SCADA_FUNCTIONALITY?.create(root,{api,t,I18n,getState:()=>state,display,editable,requestWrite,navigate:setPage,openNumber});
  performanceBrowser = window.SCADA_FUNCTIONALITY?.create(root,{t,I18n,getState:()=>state,display,editable,requestWrite,navigate:setPage,openNumber,pageKey:'performance',catalogURL:'/performance.json',titleText:'Производительность'});
  engineeringBrowser = window.SCADA_FUNCTIONALITY?.create(root,{api,t,I18n,getState:()=>state,display,editable,requestWrite,requestCommand:key=>runCommand(key),navigate:setPage,openNumber,pageKey:'engineering',catalogURL:'/engineering.json',titleText:'Инженерные параметры'});
  productionBrowser=window.SCADA_PRODUCTION?.create(root,{api,t,I18n,token,navigate:setPage,getState:()=>state,getAlarm:id=>alarmMessages[String(id)]});
  manualBrowser=window.SCADA_MANUALS?.create(root,{api,t,I18n,token});
  ioMonitor=window.SCADA_IO?.create(root,{api,getState:()=>state,isOnline:()=>online,t,I18n});
  setPage('home');
  resize();
  clock();
  setInterval(clock, 1000);
  render();
  const startupNotice = document.getElementById('scada-startup-notice');
  if (startupNotice) startupNotice.hidden = true;
  announceReady();
  poll();
})();
