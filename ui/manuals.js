/* Markdown is tokenized by bundled Marked. Render only known tokens into DOM:
   no HTML injection, embedded scripts, remote media or filesystem navigation. */
(() => {
  'use strict';
  const text = value => document.createTextNode(String(value ?? ''));
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  function entityText(value) {
    return String(value || '').replace(/&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/gi, s => {
      const named = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
      if (named[s.toLowerCase()]) return named[s.toLowerCase()];
      const n = s[2].toLowerCase() === 'x' ? parseInt(s.slice(3),16) : parseInt(s.slice(2),10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : s;
    });
  }
  function localReference(href, folder) {
    if (typeof href !== 'string' || href.length > 1200 || /[\\\u0000-\u001f]/.test(href)) return null;
    try {
      const url = new URL(href, location.origin + '/__manual__/' + encodeURIComponent(folder) + '/');
      if (url.origin !== location.origin || url.search || !url.pathname.startsWith('/__manual__/')) return null;
      const parts = url.pathname.slice(12).split('/').map(p => decodeURIComponent(p));
      if (parts.some(p => p === '.' || p === '..' || /[\\/:\u0000-\u001f]/.test(p))) return null;
      return {folder:parts[0], file:parts.slice(1).join('/'), hash:url.hash};
    } catch { return null; }
  }
  function photoURL(href, folder, id, token) {
    const ref = localReference(href, folder);
    if (!ref || ref.folder !== folder || ref.hash || !/\.(?:jpe?g|png|webp)$/i.test(ref.file)) return null;
    return '/manual-media/' + id + '/' + ref.file.split('/').map(encodeURIComponent).join('/') + '?k=' + encodeURIComponent(token);
  }
  function renderDocument(markdown, {folder, id, token, t, guides = []}) {
    const fragment = document.createDocumentFragment(), headings = new Map(); let count = 0;
    function render(tokens, parent, depth = 0) {
      if (depth > 32) throw Error(t('Слишком сложная структура мануала'));
      for (const item of tokens || []) {
        if (++count > 16000) throw Error(t('Слишком большой мануал'));
        let node;
        switch (item.type) {
          case 'space': continue;
          case 'text': case 'escape':
            if (item.tokens) render(item.tokens, parent, depth + 1); else parent.append(text(entityText(item.text))); continue;
          case 'paragraph': node = el('p'); break;
          case 'heading': {
            node = el('h' + Math.max(1, Math.min(6, item.depth)));
            const slug = item.text.toLowerCase().replace(/[^\w\u0400-\u04ff\s-]/g,'').trim().replace(/\s+/g,'-') || 'section';
            const used = headings.get(slug) || 0; headings.set(slug, used + 1); node.id = 'manual-' + slug + (used ? '-' + used : ''); break;
          }
          case 'strong': node = el('strong'); break;
          case 'em': node = el('em'); break;
          case 'del': node = el('del'); break;
          case 'codespan': node = el('code'); node.textContent = entityText(item.text); parent.append(node); continue;
          case 'code': node = el('pre'); { const code = el('code'); code.textContent = item.text; node.append(code); } parent.append(node); continue;
          case 'br': parent.append(el('br')); continue;
          case 'hr': parent.append(el('hr')); continue;
          case 'blockquote': node = el('blockquote'); break;
          case 'list':
            node = el(item.ordered ? 'ol' : 'ul'); if (item.ordered && Number.isInteger(item.start)) node.start = item.start;
            for (const entry of item.items) { const li = el('li'); render(entry.tokens, li, depth + 1); node.append(li); }
            parent.append(node); continue;
          case 'checkbox': node = el('input'); node.type = 'checkbox'; node.checked = Boolean(item.checked); node.disabled = true; parent.append(node); continue;
          case 'table': {
            const wrapper = el('div','sc-manual-table'), table = el('table'), head = el('thead'), body = el('tbody'), tr = el('tr');
            item.header.forEach(cell => { const th = el('th'); render(cell.tokens,th,depth+1); tr.append(th); }); head.append(tr);
            item.rows.forEach(row => { const tr = el('tr'); row.forEach(cell => { const td = el('td'); render(cell.tokens,td,depth+1); tr.append(td); }); body.append(tr); });
            table.append(head,body); wrapper.append(table); parent.append(wrapper); continue;
          }
          case 'link': {
            const ref = localReference(item.href,folder), guide = ref && guides.find(g => g.folder === ref.folder);
            if (item.href.startsWith('#') || ref && ref.folder === folder && (!ref.file || ref.file === 'index.md')) {
              node = el('button','sc-manual-link'); node.type = 'button'; node.dataset.manualAnchor = item.href.startsWith('#') ? item.href.slice(1) : ref.hash.slice(1);
            } else if (ref && ref.file === 'index.md' && guide) {
              node = el('button','sc-manual-link'); node.type = 'button'; node.dataset.manualOpen = guide.id; node.dataset.manualAnchorTarget = ref.hash.slice(1);
            } else { node = el('span','sc-manual-reference'); node.title = item.href; }
            break;
          }
          case 'image': {
            const url = photoURL(item.href,folder,id,token), wrap = el('span','sc-manual-figure'), caption = el('span','sc-manual-figure-caption');
            caption.textContent = entityText(item.title || item.text || t('Фотография'));
            if (url) {
              const button = el('button','sc-manual-photo'), image = el('img'); button.type = 'button'; button.dataset.manualPhoto = url; button.dataset.manualPhotoTitle = caption.textContent;
              button.setAttribute('aria-label',t('Открыть фотографию: {0}',[caption.textContent])); image.src = url; image.alt = entityText(item.text); image.loading = 'lazy'; image.draggable = false; image.dataset.manualImage = '';
              image.addEventListener('error',() => { image.hidden = true; button.disabled = true; button.textContent = t('Фотография не найдена'); }); button.append(image); wrap.append(button);
              const hint = el('span','sc-manual-photo-hint'); hint.textContent = t('Нажми на фото, чтобы увеличить'); wrap.append(hint);
            } else { const note = el('span','sc-manual-photo-missing'); note.textContent = t('Фотография должна находиться в папке этого гайда'); wrap.append(note); }
            wrap.append(caption); parent.append(wrap); continue;
          }
          case 'html': parent.append(text(item.raw)); continue;
          default: parent.append(text(item.text || item.raw)); continue;
        }
        render(item.tokens || [], node, depth + 1); parent.append(node);
      }
    }
    render(window.marked.lexer(markdown,{gfm:true,breaks:false}),fragment); return fragment;
  }
  function create(root, {api,t,I18n,token}) {
    const $ = s => root.querySelector(s), catalog = $('[data-manuals-catalog]'), reader = $('[data-manuals-reader]'),
      list = $('[data-manuals-list]'), status = $('[data-manuals-status]'), doc = $('[data-manuals-document]'),
      search = $('[data-manuals-search]'), category = $('[data-manuals-category]'), overlay = $('[data-manual-photo-overlay]'),
      large = $('[data-manual-photo-large]'), stage = $('[data-manual-photo-stage]');
    let active = false, timer, busy = false, guides = [], revision = '', selection = null, documentSerial = 0,
      state = null, zoom = 1, imageSource = '', focusReturn = null;
    function drawList() {
      const selectedCategory = category.value, categories = [...new Set(guides.map(g => g.category).filter(Boolean))]; category.replaceChildren();
      const all = el('option'); all.value = ''; all.textContent = t('Все разделы'); category.append(all);
      for (const name of categories) { const option = el('option'); option.value = name; option.textContent = name; category.append(option); }
      category.value = categories.includes(selectedCategory) ? selectedCategory : '';
      const query = search.value.trim().toLocaleLowerCase(), found = guides.filter(g => (!category.value || g.category === category.value) && (!query || [g.title,g.summary,g.category].join(' ').toLocaleLowerCase().includes(query)));
      list.replaceChildren();
      for (const guide of found) {
        const card = el('button','sc-manual-card'); card.type = 'button'; card.dataset.manualOpen = guide.id;
        const icon = document.createElementNS('http://www.w3.org/2000/svg','svg'); icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('fill','none'); icon.setAttribute('stroke','currentColor'); icon.setAttribute('stroke-width','1.5'); icon.setAttribute('aria-hidden','true');
        const path = document.createElementNS(icon.namespaceURI,'path'); path.setAttribute('d','M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1v15M5 8h4M15 8h4'); icon.append(path);
        const body = el('div'), title = el('strong'), summary = el('span'), meta = el('small'); title.textContent = guide.title; summary.textContent = guide.summary || t('Открыть инструкцию');
        meta.textContent = [guide.category, new Date(guide.modified).toLocaleDateString(I18n.locale)].filter(Boolean).join(' · '); body.append(title,summary,meta); card.append(icon,body); list.append(card);
      }
      if (!found.length) { const empty = el('div','sc-manuals-empty'); empty.textContent = guides.length ? t('Ничего не найдено. Измени запрос.') : t('Пока нет мануалов. Добавь папку с index.md в каталог manuals рядом с EXE.'); list.append(empty); }
      status.textContent = state?.invalid ? t('Инструкций: {0}. Не прочитано: {1}. Проверь UTF-8 и размер до 64 КБ.',[guides.length,state.invalid]) : state?.limitReached ? t('Показаны первые 128 инструкций') : t('Найдено инструкций: {0}',[found.length]);
    }
    function schedule() { clearTimeout(timer); if (active) timer = setTimeout(() => refresh(),3000); }
    async function refresh(force = false) {
      if (!active || busy || document.hidden) { schedule(); return; } busy = true;
      try {
        const data = await api(force ? '/api/manuals?refresh=1' : '/api/manuals'); if (!active) return;
        state = data;
        if (revision !== data.revision) { revision = data.revision; guides = data.guides; drawList(); }
        if (selection) {
          const current = guides.find(g => g.id === selection.id);
          if (!current) { back(); status.textContent = t('Этот мануал удалён из папки'); }
          else { $('[data-manuals-reload]').hidden = current.revision === selection.revision; if (force) open(selection.id,'',true); }
        }
      } catch { if (active) status.textContent = t('Не удалось обновить список. Нажми «Обновить».'); }
      finally { busy = false; schedule(); }
    }
    function back() { documentSerial++; selection = null; reader.hidden = true; catalog.hidden = false; doc.replaceChildren(); closePhoto(); }
    function scrollAnchor(anchor) {
      if (!anchor) { doc.scrollTop = 0; return; }
      let decoded; try { decoded = decodeURIComponent(anchor); } catch { return; }
      const heading = [...doc.querySelectorAll('[id]')].find(n => n.id === 'manual-' + decoded || n.id === decoded); heading?.scrollIntoView({block:'start'});
    }
    async function open(id, anchor = '', preserve = false) {
      const guide = guides.find(g => g.id === id); if (!guide || !active) return;
      const serial = ++documentSerial, scroll = preserve ? doc.scrollTop : 0; selection = {id,revision:''}; catalog.hidden = true; reader.hidden = false;
      $('[data-manuals-reading-title]').textContent = guide.title;
      if (!preserve) doc.textContent = t('Загрузка мануала…');
      try {
        const data = await api('/api/manual/' + id); if (!active || serial !== documentSerial) return;
        doc.replaceChildren(renderDocument(data.markdown,{folder:data.folder,id,token,t,guides})); selection = {id,revision:data.revision}; guide.revision = data.revision;
        $('[data-manuals-reload]').hidden = true; if (preserve) doc.scrollTop = scroll; else scrollAnchor(anchor);
      } catch (e) { if (active && serial === documentSerial) doc.textContent = t('Не удалось открыть мануал. Проверь index.md и фотографии.'); }
    }
    function applyZoom() {
      const w = Math.max(100,stage.clientWidth - 32), h = Math.max(100,stage.clientHeight - 32), fit = Math.min(w / (large.naturalWidth || w),h / (large.naturalHeight || h),1);
      large.style.width = Math.round((large.naturalWidth || w) * fit * zoom) + 'px'; large.style.height = 'auto';
      $('[data-manual-photo-reset]').textContent = Math.round(zoom * 100) + '%';
      $('[data-manual-photo-zoom="-1"]').disabled = zoom <= 1; $('[data-manual-photo-zoom="1"]').disabled = zoom >= 4;
    }
    function closePhoto() { if (!overlay.hidden) { overlay.hidden = true; large.removeAttribute('src'); large.style.width = ''; focusReturn?.focus({preventScroll:true}); } }
    function showPhoto(button) { focusReturn = button; zoom = 1; imageSource = button.dataset.manualPhoto; large.hidden = false; large.src = imageSource; large.alt = button.dataset.manualPhotoTitle; $('[data-manual-photo-caption]').textContent = large.alt; overlay.hidden = false; stage.scrollTop = stage.scrollLeft = 0; applyZoom(); $('[data-manual-photo-close]').focus({preventScroll:true}); }
    root.addEventListener('click',event => {
      const button = event.target.closest('button'); if (!button || button.disabled) return;
      if (button.hasAttribute('data-manual-open')) open(button.dataset.manualOpen,button.dataset.manualAnchorTarget);
      else if (button.hasAttribute('data-manuals-back')) back();
      else if (button.hasAttribute('data-manuals-refresh')) refresh(true);
      else if (button.hasAttribute('data-manuals-reload') && selection) open(selection.id,'',true);
      else if (button.hasAttribute('data-manuals-scroll')) doc.scrollBy({top:Number(button.dataset.manualsScroll)*250,behavior:'smooth'});
      else if (button.hasAttribute('data-manual-anchor')) scrollAnchor(button.dataset.manualAnchor);
      else if (button.hasAttribute('data-manual-photo')) showPhoto(button);
      else if (button.hasAttribute('data-manual-photo-close')) closePhoto();
      else if (button.hasAttribute('data-manual-photo-zoom')) { zoom = Math.max(1,Math.min(4,zoom + Number(button.dataset.manualPhotoZoom)*.5)); applyZoom(); }
      else if (button.hasAttribute('data-manual-photo-reset')) { zoom = 1; applyZoom(); }
    });
    large.addEventListener('load',applyZoom); large.addEventListener('error',() => { large.hidden = true; $('[data-manual-photo-caption]').textContent = t('Фотография не найдена'); }); overlay.addEventListener('click',event => { if (event.target === overlay) closePhoto(); });
    search.addEventListener('input',drawList); category.addEventListener('change',drawList);
    document.addEventListener('keydown',event => {
      if (overlay.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closePhoto(); }
      if (event.key === 'Tab') { const buttons = [...overlay.querySelectorAll('button:not(:disabled)')]; const at = buttons.indexOf(document.activeElement); if (event.shiftKey && at <= 0) { event.preventDefault(); buttons[buttons.length-1].focus(); } else if (!event.shiftKey && at === buttons.length - 1) { event.preventDefault(); buttons[0].focus(); } }
    },true);
    document.addEventListener('visibilitychange',() => { if (!document.hidden && active) refresh(); });
    return {setActive(value) { if (active === value) return; active = value; clearTimeout(timer); if (active) refresh(); else { documentSerial++; closePhoto(); } }};
  }
  window.SCADA_MANUALS = {create,renderDocument,photoURL,localReference};
})();
