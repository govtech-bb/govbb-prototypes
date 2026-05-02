/* govbb-inline-edit.js
 * Section-based inline editing for ALL pages of GovBB prototype forms.
 * Activated automatically when the URL contains ?edit=1.
 * Loaded dynamically by govbb-framework.js — no prototype files need changing.
 *
 * What is editable on each page type
 * ────────────────────────────────────
 * Start page   : h1, description paragraphs, requirements list (add/remove/reorder),
 *                drag to reorder top-level sections
 * Question pages: h1, caption, field labels, hint text, drag to reorder field groups
 * Check / Decl : h1, h2 subheadings, static paragraphs
 * Confirmation  : h1, "what happens next" paragraphs
 *
 * Saves per-page to localStorage (key: ge:{slug}:{pageId}).
 * Cancel clears the page's localStorage entry and re-renders the original template.
 */
(function (global) {
  'use strict';

  /* ─── Slug ───────────────────────────────────────────── */
  var _slug = location.pathname.split('/').pop().replace('.html', '');

  /* ─── Small helpers ──────────────────────────────────── */
  function _$(id)  { return document.getElementById(id); }
  function _key(pageId) { return 'ge:' + _slug + ':' + pageId; }

  function _domIndex(el) {
    return Array.prototype.indexOf.call(el.parentNode.children, el);
  }

  function _currentPageId() {
    var flow = (GovBB.getFlow ? GovBB.getFlow() : []);
    var idx  = (GovBB.getCurrentIndex ? GovBB.getCurrentIndex() : 0);
    return flow[idx] || 'start';
  }

  function _btnStyle(bg, color, border) {
    return [
      'display:inline-flex', 'align-items:center', 'gap:0.375rem',
      'padding:0.375rem 0.875rem', 'border-radius:0.25rem',
      'font-family:inherit', 'font-size:0.875rem', 'font-weight:600',
      'cursor:pointer', 'background:' + bg, 'color:' + color,
      'border:' + (border || 'none'), 'white-space:nowrap',
      'transition:opacity 0.15s'
    ].join(';');
  }

  /* ─── Boot ───────────────────────────────────────────── */
  function _boot() {
    if (!global.GovBB) { setTimeout(_boot, 50); return; }
    var app = _$('app');
    if (!app)          { setTimeout(_boot, 50); return; }

    _injectBar();
    _injectStyles();

    var obs = new MutationObserver(function () { _onPageRender(app); });
    obs.observe(app, { childList: true });

    _onPageRender(app);   // handle the initial render
  }

  /* ─── Edit bar ───────────────────────────────────────── */
  function _injectBar() {
    if (_$('ge-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'ge-bar';
    bar.setAttribute('style', [
      'display:none', 'position:sticky', 'top:0', 'z-index:500',
      'background:#00267f', 'color:#fff',
      'padding:0.625rem 1.5rem',
      'align-items:center', 'gap:0.75rem',
      'font-family:Figtree,sans-serif', 'font-size:0.9375rem',
      'box-shadow:0 2px 8px rgba(0,0,0,0.2)', 'flex-wrap:wrap'
    ].join(';'));

    bar.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
        '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' +
      '</svg>' +
      '<span id="ge-label" style="font-weight:600">Editing page</span>' +
      '<span style="flex:1;min-width:0.5rem"></span>' +
      '<span style="font-size:0.8rem;opacity:0.7">Click text to edit &nbsp;·&nbsp; Drag ≡ to reorder</span>' +
      '<span style="flex:1;min-width:0.5rem"></span>' +
      '<button id="ge-save"   style="' + _btnStyle('#1fbf84', '#fff') + '">Save changes</button>' +
      '<button id="ge-cancel" style="' + _btnStyle('transparent', '#fff', '2px solid rgba(255,255,255,0.5)') + '">Cancel</button>';

    var alpha = document.querySelector('.bg-bb-blue-10');
    if (alpha && alpha.nextSibling) {
      alpha.parentNode.insertBefore(bar, alpha.nextSibling);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }

    _$('ge-save').addEventListener('click',   _save);
    _$('ge-cancel').addEventListener('click', _cancel);
  }

  function _showBar(pageId) {
    var b = _$('ge-bar');
    if (!b) return;
    b.style.display = 'flex';
    var lbl = _$('ge-label');
    if (lbl) lbl.textContent = 'Editing: ' + _pageName(pageId);
  }

  function _hideBar() {
    var b = _$('ge-bar');
    if (b) b.style.display = 'none';
  }

  function _pageName(pageId) {
    if (!pageId || pageId === 'start')        return 'Start page';
    if (pageId === 'check')                   return 'Check your answers';
    if (pageId === 'confirmation')            return 'Confirmation';
    if (pageId === 'declaration')             return 'Declaration';
    /* Prettify hyphenated page IDs */
    return pageId.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /* ─── Main page-render handler ───────────────────────── */
  function _onPageRender(app) {
    var pageId = _currentPageId();

    /* Skip editing the confirmation page (no meaningful editable content) */
    if (pageId === 'confirmation') { _hideBar(); return; }

    _showBar(pageId);
    _applySavedData(app, pageId);

    if (pageId === 'start' || GovBB.getCurrentIndex() === 0) {
      _activateStartPage(app);
    } else {
      _activateQuestionPage(app, pageId);
    }
  }

  /* ═══════════════════════════════════════════════════════
     START PAGE
     ═══════════════════════════════════════════════════════ */
  function _activateStartPage(app) {
    var root = _getRoot(app);
    if (!root) return;

    Array.from(root.children).forEach(function (section, si) {
      section.setAttribute('data-ge-orig', si);
      _setupSection(section, root);
    });
  }

  function _getRoot(app) {
    return app.querySelector('.space-y-8') || app.firstElementChild;
  }

  function _setupSection(el, root) {
    if (el.hasAttribute('data-ge')) return;
    if (_isButtonRow(el))           return;

    el.setAttribute('data-ge', 'section');
    el.setAttribute('draggable', 'true');
    el.style.position = 'relative';

    el.appendChild(_createHandle('Drag to reorder section'));

    el.querySelectorAll('h1, h2').forEach(_makeEditable);
    el.querySelectorAll('p').forEach(function (p) {
      if (!p.closest('ul') && !p.closest('[data-ge-ignore]')) _makeEditable(p);
    });

    var ul = el.querySelector('ul');
    if (ul) _setupList(ul);

    _bindSectionDrag(el, root);
  }

  function _isButtonRow(el) {
    return !!el.querySelector('a[onclick*="next"]') && !el.querySelector('h2, ul');
  }

  function _bindSectionDrag(el, root) {
    el.addEventListener('dragstart', function (e) {
      if (e.target.hasAttribute('data-ge-li')) return;
      e.dataTransfer.effectAllowed = 'move';
      el.style.opacity = '0.45';
      global.__geDragSection = el;
      e.stopPropagation();
    });
    el.addEventListener('dragend', function () {
      el.style.opacity = '';
      global.__geDragSection = null;
      root.querySelectorAll('.ge-drop-target').forEach(function (s) {
        s.classList.remove('ge-drop-target');
      });
    });
    el.addEventListener('dragover', function (e) {
      if (global.__geDragSection && global.__geDragSection !== el) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('ge-drop-target');
      }
    });
    el.addEventListener('dragleave', function () {
      el.classList.remove('ge-drop-target');
    });
    el.addEventListener('drop', function (e) {
      e.stopPropagation();
      var src = global.__geDragSection;
      if (src && src !== el) {
        if (_domIndex(src) < _domIndex(el)) root.insertBefore(src, el.nextSibling);
        else                                root.insertBefore(src, el);
      }
      el.classList.remove('ge-drop-target');
    });
  }

  /* ─── Requirements list ──────────────────────────────── */
  function _setupList(ul) {
    Array.from(ul.querySelectorAll('li')).forEach(function (li) { _setupListItem(li, ul); });

    var addBtn = document.createElement('button');
    addBtn.className = 'ge-add-item';
    addBtn.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' +
      '</svg> Add item';
    addBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var li = document.createElement('li');
      li.textContent = 'New requirement';
      ul.appendChild(li);
      _setupListItem(li, ul);
      li.focus();
    });
    ul.parentNode.insertBefore(addBtn, ul.nextSibling);
  }

  function _setupListItem(li, ul) {
    if (li.hasAttribute('data-ge-li')) return;
    li.setAttribute('data-ge-li', '1');
    li.setAttribute('draggable', 'true');
    li.contentEditable = 'true';
    li.classList.add('ge-li');

    li.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); li.blur(); }
    });

    var del = document.createElement('button');
    del.className = 'ge-del';
    del.title = 'Remove item';
    del.innerHTML = '&times;';
    del.setAttribute('contenteditable', 'false');
    del.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); li.remove(); });
    li.appendChild(del);

    li.addEventListener('dragstart', function (e) {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      li.style.opacity = '0.45';
      global.__geDragLi = li;
    });
    li.addEventListener('dragend', function () {
      li.style.opacity = '';
      global.__geDragLi = null;
      ul.querySelectorAll('.ge-li-target').forEach(function (l) { l.classList.remove('ge-li-target'); });
    });
    li.addEventListener('dragover', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (global.__geDragLi && global.__geDragLi !== li) {
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('ge-li-target');
      }
    });
    li.addEventListener('dragleave', function () { li.classList.remove('ge-li-target'); });
    li.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      var src = global.__geDragLi;
      if (src && src !== li) {
        if (_domIndex(src) < _domIndex(li)) ul.insertBefore(src, li.nextSibling);
        else                                ul.insertBefore(src, li);
      }
      li.classList.remove('ge-li-target');
    });
  }

  /* ═══════════════════════════════════════════════════════
     QUESTION / CHECK / DECLARATION PAGES
     ═══════════════════════════════════════════════════════ */
  function _activateQuestionPage(app, pageId) {
    /* h1, h2, caption */
    app.querySelectorAll('h1, h2').forEach(_makeEditable);
    app.querySelectorAll('p.border-bb-blue-40').forEach(_makeEditable);   // caption

    /* Static paragraphs (not inside field groups, not hint — handled below) */
    app.querySelectorAll('p:not(.border-bb-blue-40)').forEach(function (p) {
      if (!p.closest('.field-group') && !p.closest('[data-ge-ignore]')) {
        _makeEditable(p);
      }
    });

    /* Field groups: make label + hint editable; make the group draggable */
    var fieldsRoot = app.querySelector('.space-y-8');
    if (fieldsRoot) {
      Array.from(fieldsRoot.children).forEach(function (child, ci) {
        child.setAttribute('data-ge-orig', ci);

        /* Skip continue / submit button rows */
        if (_isButtonRow(child) || child.classList.contains('mt-8')) return;

        _setupFieldGroup(child, fieldsRoot);
      });
    }

    /* Labels and hint text inside field groups */
    app.querySelectorAll('.field-group label').forEach(_makeEditable);
    app.querySelectorAll('.field-group p').forEach(_makeEditable);
    /* Radio group question text (p.font-bold inside field-group) */
    app.querySelectorAll('.field-group > p').forEach(_makeEditable);
  }

  function _setupFieldGroup(el, root) {
    if (el.hasAttribute('data-ge')) return;
    el.setAttribute('data-ge', 'field');
    el.setAttribute('draggable', 'true');
    el.style.position = 'relative';
    el.appendChild(_createHandle('Drag to reorder field'));
    _bindFieldDrag(el, root);
  }

  function _bindFieldDrag(el, root) {
    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.effectAllowed = 'move';
      el.style.opacity = '0.45';
      global.__geDragField = el;
      e.stopPropagation();
    });
    el.addEventListener('dragend', function () {
      el.style.opacity = '';
      global.__geDragField = null;
      root.querySelectorAll('.ge-drop-target').forEach(function (s) {
        s.classList.remove('ge-drop-target');
      });
    });
    el.addEventListener('dragover', function (e) {
      if (global.__geDragField && global.__geDragField !== el) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('ge-drop-target');
      }
    });
    el.addEventListener('dragleave', function () { el.classList.remove('ge-drop-target'); });
    el.addEventListener('drop', function (e) {
      e.stopPropagation();
      var src = global.__geDragField;
      if (src && src !== el) {
        if (_domIndex(src) < _domIndex(el)) root.insertBefore(src, el.nextSibling);
        else                                root.insertBefore(src, el);
      }
      el.classList.remove('ge-drop-target');
    });
  }

  /* ─── Generic: make element contenteditable ──────────── */
  function _makeEditable(el) {
    if (el.contentEditable === 'true') return;
    el.contentEditable = 'true';
    el.classList.add('ge-editable');
    if (el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'LABEL') {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });
    }
  }

  /* ─── Drag handle element ────────────────────────────── */
  function _createHandle(title) {
    var h = document.createElement('div');
    h.className = 'ge-handle';
    h.title = title;
    h.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>' +
      '</svg>';
    return h;
  }

  /* ═══════════════════════════════════════════════════════
     SAVE & CANCEL
     ═══════════════════════════════════════════════════════ */
  function _save() {
    var app    = _$('app');
    var pageId = _currentPageId();

    if (pageId === 'start' || GovBB.getCurrentIndex() === 0) {
      _saveStartPage(app, pageId);
    } else {
      _saveQuestionPage(app, pageId);
    }

    _toast('Changes saved');
  }

  /* ── Start page save ────────────────────────────── */
  function _saveStartPage(app, pageId) {
    var root = _getRoot(app);
    if (!root) return;

    var order = [], sections = [];

    Array.from(root.children).forEach(function (section) {
      order.push(parseInt(section.getAttribute('data-ge-orig') || '0', 10));

      var d  = {};
      var h1 = section.querySelector('h1');
      var h2 = section.querySelector('h2');
      var ps = Array.from(section.querySelectorAll('p')).filter(function (p) {
        return !p.closest('ul');
      });
      var ul = section.querySelector('ul');

      if (h1) d.h1 = h1.textContent.trim();
      if (h2) d.h2 = h2.textContent.trim();
      if (ps.length) d.paragraphs = ps.map(function (p) { return p.textContent.trim(); });
      if (ul) {
        d.items = Array.from(ul.querySelectorAll('li')).map(function (li) {
          var c = li.cloneNode(true);
          c.querySelectorAll('.ge-del, .ge-handle').forEach(function (n) { n.remove(); });
          return c.textContent.trim();
        });
      }
      sections.push(d);
    });

    _persist(pageId, { version: 1, order: order, sections: sections });
  }

  /* ── Question / check / declaration page save ─── */
  function _saveQuestionPage(app, pageId) {
    var d = { version: 1 };

    var h1 = app.querySelector('h1');
    if (h1) d.h1 = h1.textContent.trim();

    var cap = app.querySelector('p.border-bb-blue-40');
    if (cap) d.caption = cap.textContent.trim();

    /* h2 subheadings */
    var h2s = Array.from(app.querySelectorAll('h2'));
    if (h2s.length) d.h2s = h2s.map(function (h) { return h.textContent.trim(); });

    /* Static paragraphs outside field groups */
    var staticPs = Array.from(app.querySelectorAll('p:not(.border-bb-blue-40)'))
      .filter(function (p) { return !p.closest('.field-group'); });
    if (staticPs.length) d.staticPs = staticPs.map(function (p) { return p.textContent.trim(); });

    /* Field groups: label, hint, and order */
    var fieldsRoot = app.querySelector('.space-y-8');
    if (fieldsRoot) {
      var fieldOrder = [];
      var fields     = {};

      Array.from(fieldsRoot.children).forEach(function (child) {
        var origIdx = child.getAttribute('data-ge-orig');
        if (origIdx === null) return;
        fieldOrder.push(parseInt(origIdx, 10));

        var lbl  = child.querySelector('label');
        var hint = child.querySelector('p');
        var fd   = {};
        if (lbl)  fd.label = lbl.textContent.trim();
        if (hint) fd.hint  = hint.textContent.trim();
        fields[origIdx] = fd;
      });

      d.fieldOrder = fieldOrder;
      d.fields     = fields;
    }

    _persist(pageId, d);
  }

  function _persist(pageId, data) {
    try { localStorage.setItem(_key(pageId), JSON.stringify(data)); } catch (e) {}
  }

  /* ── Cancel ──────────────────────────────────────────── */
  function _cancel() {
    var pageId = _currentPageId();
    try { localStorage.removeItem(_key(pageId)); } catch (e) {}
    if (global.GovBB && GovBB.render) GovBB.render();
  }

  /* ═══════════════════════════════════════════════════════
     RESTORE SAVED DATA
     ═══════════════════════════════════════════════════════ */
  function _applySavedData(app, pageId) {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(_key(pageId))); } catch (e) {}
    if (!saved) return;

    if (pageId === 'start' || GovBB.getCurrentIndex() === 0) {
      _restoreStartPage(app, saved);
    } else {
      _restoreQuestionPage(app, saved);
    }
  }

  function _restoreStartPage(app, saved) {
    var root = _getRoot(app);
    if (!root) return;

    /* Reorder sections */
    if (saved.order && saved.order.length) {
      var orig = Array.from(root.children);
      saved.order.forEach(function (origIdx) {
        if (orig[origIdx]) root.appendChild(orig[origIdx]);
      });
    }

    /* Patch text content */
    if (saved.sections) {
      Array.from(root.children).forEach(function (section, si) {
        var d = saved.sections[si];
        if (!d) return;
        if (d.h1) { var h = section.querySelector('h1'); if (h) h.textContent = d.h1; }
        if (d.h2) { var h2 = section.querySelector('h2'); if (h2) h2.textContent = d.h2; }
        if (d.paragraphs) {
          var ps = Array.from(section.querySelectorAll('p')).filter(function (p) { return !p.closest('ul'); });
          d.paragraphs.forEach(function (txt, i) { if (ps[i]) ps[i].textContent = txt; });
        }
        if (d.items) {
          var ul = section.querySelector('ul');
          if (ul) {
            ul.innerHTML = '';
            d.items.forEach(function (txt) {
              var li = document.createElement('li');
              li.textContent = txt;
              ul.appendChild(li);
            });
          }
        }
      });
    }
  }

  function _restoreQuestionPage(app, saved) {
    if (saved.h1) {
      var h1 = app.querySelector('h1');
      if (h1) h1.textContent = saved.h1;
    }
    if (saved.caption) {
      var cap = app.querySelector('p.border-bb-blue-40');
      if (cap) cap.textContent = saved.caption;
    }
    if (saved.h2s) {
      var h2s = app.querySelectorAll('h2');
      saved.h2s.forEach(function (txt, i) { if (h2s[i]) h2s[i].textContent = txt; });
    }
    if (saved.staticPs) {
      var sps = Array.from(app.querySelectorAll('p:not(.border-bb-blue-40)'))
        .filter(function (p) { return !p.closest('.field-group'); });
      saved.staticPs.forEach(function (txt, i) { if (sps[i]) sps[i].textContent = txt; });
    }

    var fieldsRoot = app.querySelector('.space-y-8');
    if (!fieldsRoot) return;

    /* Patch field labels and hints by original index */
    if (saved.fields) {
      Array.from(fieldsRoot.children).forEach(function (child, ci) {
        var fd = saved.fields[ci];
        if (!fd) return;
        if (fd.label) { var lbl = child.querySelector('label'); if (lbl) lbl.textContent = fd.label; }
        if (fd.hint)  { var hint = child.querySelector('p'); if (hint) hint.textContent = fd.hint; }
      });
    }

    /* Reorder field groups */
    if (saved.fieldOrder && saved.fieldOrder.length) {
      var orig = Array.from(fieldsRoot.children);
      saved.fieldOrder.forEach(function (origIdx) {
        if (orig[origIdx]) fieldsRoot.appendChild(orig[origIdx]);
      });
    }
  }

  /* ─── Toast ──────────────────────────────────────────── */
  function _toast(msg) {
    var t = document.createElement('div');
    t.className = 'ge-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.classList.add('ge-toast-out');
      setTimeout(function () { t.remove(); }, 400);
    }, 2200);
  }

  /* ─── Styles ─────────────────────────────────────────── */
  function _injectStyles() {
    if (_$('ge-css')) return;
    var s = document.createElement('style');
    s.id = 'ge-css';
    s.textContent = [
      /* Section / field-group outlines */
      '[data-ge]{outline:2px dashed #99a8cc;outline-offset:6px;border-radius:4px;transition:outline-color 0.15s;}',
      '[data-ge]:hover{outline-color:#0e5f64;}',
      '[data-ge].ge-drop-target{outline:3px solid #30c0c8 !important;background:#eaf9f9;}',

      /* Drag handle (≡) */
      '.ge-handle{position:absolute;top:-2px;right:-2px;width:26px;height:26px;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:#e5e9f2;border-radius:4px;cursor:grab;color:#595959;' +
        'opacity:0;transition:opacity 0.15s;z-index:10;pointer-events:none;}',
      '[data-ge]:hover .ge-handle{opacity:1;}',

      /* Editable text */
      '.ge-editable{cursor:text;}',
      '.ge-editable:focus{outline:none;background:#fff9e9;border-radius:2px;' +
        'box-shadow:0 0 0 2px #30c0c8;}',
      'label.ge-editable:focus{display:block;}',

      /* List items */
      '.ge-li{position:relative;padding-right:2.5rem!important;' +
        'border:1px solid transparent;border-radius:3px;cursor:grab;transition:border-color 0.1s,background 0.1s;}',
      '.ge-li:hover{border-color:#c0c8d8;background:#f8fafc;}',
      '.ge-li:focus{outline:none;border-color:#30c0c8;background:#fff9e9;}',
      '.ge-li.ge-li-target{border-color:#30c0c8;background:#eaf9f9;}',

      /* Delete button */
      '.ge-del{position:absolute;right:4px;top:50%;transform:translateY(-50%);' +
        'width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;' +
        'background:none;border:none;cursor:pointer;color:#a42c2c;' +
        'font-size:18px;line-height:1;border-radius:3px;' +
        'opacity:0;transition:opacity 0.15s,background 0.1s;}',
      '.ge-li:hover .ge-del,.ge-li:focus .ge-del{opacity:0.6;}',
      '.ge-del:hover{opacity:1!important;background:#fff0f0;}',

      /* Add-item button */
      '.ge-add-item{display:inline-flex;align-items:center;gap:0.375rem;' +
        'margin-top:0.5rem;padding:0.375rem 0.875rem;' +
        'background:#eaf9f9;color:#0e5f64;' +
        'border:2px dashed #ace6e9;border-radius:0.25rem;' +
        'font-family:Figtree,sans-serif;font-size:0.875rem;font-weight:600;' +
        'cursor:pointer;transition:background 0.1s;}',
      '.ge-add-item:hover{background:#ace6e9;}',

      /* Toast */
      '.ge-toast{position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);' +
        'background:#00654a;color:#fff;padding:0.75rem 1.5rem;border-radius:0.375rem;' +
        'font-family:Figtree,sans-serif;font-size:1rem;font-weight:600;' +
        'z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.4s;}',
      '.ge-toast-out{opacity:0;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ─── Boot ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

}(window));
