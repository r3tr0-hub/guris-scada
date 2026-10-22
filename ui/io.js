/* Read-only process-image diagnostics. Only the visible, whitelisted IDs are
   subscribed; the native worker owns symbol resolution and ADS transport. */
(() => {
  'use strict';
  window.SCADA_IO = {create(root, {api, getState, isOnline, t, I18n}) {
    const $ = s => root.querySelector(s), tabs = $('[data-io-tabs]'),
      grid = $('[data-io-grid]'), status = $('[data-io-status]'),
      search = $('[data-io-search]'), kind = $('[data-io-kind]');
    let active = false, catalog, loading, mode = 'VISU_INPUT', page = 0,
      generation = 0, timer, busy = false, selected = [], cards = [],
      renewAt = 0, selectedEpoch = -1, snapshot = null;
    const online = () => isOnline() && getState()?.connected && getState()?.adsState === 5;
    const language = () => I18n.language === 'en' ? 'en' : 'ru';
    const label = item => language() === 'en' ? (item.en || item.symbol || item.ru) : (item.ru || item.en || item.symbol);
    const number = value => value.toLocaleString(I18n.locale, {maximumFractionDigits: 4});
    function clearValues() {
      for (const {article, value, tag, row} of cards) {
        article.dataset.level = 'unknown';
        value.textContent = '—';
        article.title = tag ? t('Нет свежих данных') : t('Привязка не установлена');
      }
    }
    function paint(data) {
      const fresh = online() && data?.epoch === getState().epoch && data?.active;
      const records = new Map((fresh ? data.records : []).map(r => [r.id, r]));
      let good = 0;
      for (const {article, value, tag, row} of cards) {
        const r = records.get(tag?.id), other = records.get(row.expression?.other);
        let valid = r?.quality && Number.isFinite(r.value), reading = r?.value;
        const binary = tag?.type === 'BOOL' || Boolean(row.expression);
        if (valid && row.expression?.op === 'bit') reading = (reading & row.expression.mask) ? 1 : 0;
        if (row.expression?.op === 'any') { valid = valid && other?.quality; reading = (reading || other?.value) ? 1 : 0; }
        article.dataset.level = valid ? (binary ? (reading ? 'high' : 'low') : 'value') : 'unknown';
        value.textContent = valid ? (binary ? String(reading ? 1 : 0) : number(reading)) : '—';
        article.title = !tag ? t('Привязка не установлена') : valid ? tag.symbol : t('Нет свежих данных');
        if (valid) good++;
      }
      status.textContent = !online() ? t('Нет связи с ПЛК. Значения недоступны.') :
        t('Свежих сигналов: {0} из {1}. Цвет индикатора означает уровень 0 или 1.', [good, selected.length]);
    }
    function rows() {
      if (mode === 'all') return catalog.tags.map(tag => ({tag: tag.id, ru: tag.label, en: tag.labelEN, symbol: tag.symbol}));
      return catalog.pages.find(p => p.id === mode)?.rows || [];
    }
    function render() {
      if (!catalog) return;
      generation++; snapshot = null; renewAt = 0;
      tabs.replaceChildren();
      const options = [...catalog.pages.map(p => ({id: p.id, name: t(p.direction === 'in' ? 'Входы {0}' : 'Выходы {0}', [p.number])})),
        {id: 'all', name: t('Все сигналы')}];
      for (const option of options) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'sc-io-tab';
        b.textContent = option.name; b.dataset.ioTab = option.id;
        b.setAttribute('aria-pressed', String(mode === option.id)); tabs.append(b);
      }
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = rows().filter(row => {
        const tag = catalog.tags[row.tag];
        return (!kind.value || tag?.kind === kind.value) && (!query ||
          [row.ru, row.en, tag?.symbol, tag?.code].join(' ').toLocaleLowerCase().includes(query));
      });
      const pages = Math.max(1, Math.ceil(filtered.length / 48)); page = Math.min(page, pages - 1);
      const visible = filtered.slice(page * 48, (page + 1) * 48);
      grid.replaceChildren(); grid.scrollTop = 0; cards = [];
      for (const row of visible) {
        const tag = row.tag === null ? null : catalog.tags[row.tag];
        const article = document.createElement('article'); article.className = 'sc-io-card';
        if (tag) article.dataset.ioId = tag.id;
        article.dataset.level = 'unknown';
        const dot = document.createElement('i'); dot.className = 'sc-io-dot'; dot.setAttribute('aria-hidden', 'true');
        const body = document.createElement('div'), title = document.createElement('strong'), symbol = document.createElement('small');
        title.textContent = label(row); symbol.textContent = tag ? `${tag.kind} · ${tag.type} · ${tag.symbol}` : t('Привязка не установлена');
        body.append(title, symbol);
        const value = document.createElement('output'); value.textContent = '—';
        value.setAttribute('aria-label', t('Значение сигнала'));
        article.append(dot, body, value); grid.append(article); cards.push({article, value, tag, row});
      }
      if (!visible.length) grid.textContent = t('Сигналы не найдены');
      selected = [...new Set(cards.filter(c => c.tag).flatMap(c => c.row.expression?.op === 'any' ? [c.tag.id, c.row.expression.other] : [c.tag.id]))];
      $('[data-io-page-info]').textContent = t('Страница {0} из {1} · строк: {2}', [page + 1, pages, filtered.length]);
      $('[data-io-previous]').disabled = page === 0;
      $('[data-io-next]').disabled = page === pages - 1;
      paint(null);
      if (active) schedule(0);
    }
    function schedule(delay = 450) { clearTimeout(timer); if (active) timer = setTimeout(tick, delay); }
    async function tick() {
      if (!active) return;
      if (busy || !catalog) { schedule(); return; }
      const view = generation, epoch = getState()?.epoch || 0;
      if (!online()) { clearValues(); paint(null); renewAt = 0; schedule(); return; }
      busy = true;
      try {
        if (Date.now() >= renewAt || selectedEpoch !== epoch) {
          await api('/api/io-view', {ids: selected.join(','), epoch});
          if (!active || view !== generation) return;
          selectedEpoch = epoch; renewAt = Date.now() + 900;
        }
        const data = await api('/api/io');
        if (active && view === generation && epoch === getState()?.epoch) { snapshot = data; paint(data); }
      } catch (e) {
        if (active && view === generation) { renewAt = 0; paint(null); }
      } finally { busy = false; schedule(); }
    }
    async function load() {
      if (!loading) loading = fetch('/io_catalog.json', {cache: 'no-store'}).then(r => {
        if (!r.ok) throw Error('catalog'); return r.json();
      }).then(data => {
        if (data.readOnly !== true || !Array.isArray(data.tags) || data.tags.some((tag, i) => tag.id !== i) || !Array.isArray(data.pages)) throw Error('catalog');
        catalog = data; return data;
      }).catch(e => { loading = null; throw e; });
      return loading;
    }
    function setActive(next) {
      if (active === next) return;
      active = next; generation++; clearTimeout(timer); renewAt = 0;
      if (!next) {
        clearValues(); snapshot = null;
        api('/api/io-view', {ids: '', epoch: getState()?.epoch || 0}).catch(() => {});
        return;
      }
      load().then(() => { if (active) render(); }).catch(() => {
        if (active) status.textContent = t('Не удалось загрузить каталог сигналов');
      });
    }
    tabs.addEventListener('click', event => {
      const b = event.target.closest('[data-io-tab]'); if (!b) return;
      mode = b.dataset.ioTab; page = 0; render();
    });
    search.addEventListener('input', () => { page = 0; render(); });
    kind.addEventListener('change', () => { page = 0; render(); });
    $('[data-io-previous]').addEventListener('click', () => { page--; render(); });
    $('[data-io-next]').addEventListener('click', () => { page++; render(); });
    return {setActive, update() { if (active && !online()) paint(null); }};
  }};
})();
