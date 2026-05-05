/* govbb-inline-edit.js
 * Full inline editing for GovBB prototype forms.
 * Activated when the URL contains ?edit=1.
 * Loaded dynamically by govbb-framework.js.
 *
 * Capabilities
 * ─────────────
 * All pages  : Edit h1, h2, caption, hint text, static paragraphs.
 * Start page : Edit / add / delete / reorder sections.
 *              Edit / add / delete / reorder requirements list items.
 * Question   : Edit / add / delete / reorder field groups.
 *              Choose field type when adding (text, email, phone, date,
 *              dropdown, textarea, radio, checkbox).
 * Page mgr   : View all pages, navigate, add a new page, delete a page.
 *
 * Persistence: localStorage, keyed by ge:{slug}:{pageId}.
 * Flow mods:   localStorage key ge:{slug}:__flow.
 * Custom pages: localStorage key ge:{slug}:__cp:{pageId}.
 */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────────────
     CONSTANTS & HELPERS
     ───────────────────────────────────────────────────── */
  var _slug   = location.pathname.split('/').pop().replace('.html', '');
  var _FIXED  = ['start', 'check', 'confirmation', 'declaration'];   // cannot be deleted

  function _$(id) { return document.getElementById(id); }
  function _pageKey(pageId) { return 'ge:' + _slug + ':' + pageId; }
  function _flowKey()       { return 'ge:' + _slug + ':__flow'; }
  function _cpKey(pageId)   { return 'ge:' + _slug + ':__cp:' + pageId; }

  function _load(k)    { try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; } }
  function _store(k,v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }
  function _del(k)     { try { localStorage.removeItem(k); } catch(e) {} }

  function _domIndex(el) {
    return Array.prototype.indexOf.call(el.parentNode.children, el);
  }

  function _uid() { return 'ge' + Date.now().toString(36); }

  function _currentPageId() {
    var flow = GovBB.getFlow ? GovBB.getFlow() : [];
    return flow[GovBB.getCurrentIndex ? GovBB.getCurrentIndex() : 0] || 'start';
  }

  function _pageName(pageId) {
    var map = { start: 'Start page', check: 'Check your answers',
                confirmation: 'Confirmation', declaration: 'Declaration' };
    return map[pageId] || pageId.replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }

  function _btnCss(bg, fg, border) {
    return 'display:inline-flex;align-items:center;gap:0.375rem;padding:0.375rem 0.875rem;' +
           'border-radius:0.25rem;font-family:inherit;font-size:0.875rem;font-weight:600;' +
           'cursor:pointer;background:' + bg + ';color:' + fg + ';' +
           'border:' + (border || 'none') + ';white-space:nowrap;transition:opacity 0.15s;';
  }

  var PENCIL_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
    '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

  var DRAG_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></svg>';

  var PLUS_SVG =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

  /* ─────────────────────────────────────────────────────
     BOOT
     ───────────────────────────────────────────────────── */
  function _boot() {
    if (!global.GovBB) { setTimeout(_boot, 50); return; }
    var app = _$('app');
    if (!app)          { setTimeout(_boot, 50); return; }

    /* Apply any saved flow modifications (new/deleted pages) */
    _applyStoredFlow();

    _injectBar();
    _injectStyles();

    var obs = new MutationObserver(function () { _onRender(app); });
    obs.observe(app, { childList: true });
    _onRender(app);
  }

  /* ─────────────────────────────────────────────────────
     FLOW PERSISTENCE
     ───────────────────────────────────────────────────── */
  function _applyStoredFlow() {
    var saved = _load(_flowKey());
    if (!saved) return;

    /* Re-register custom pages */
    (saved.customPageIds || []).forEach(function(pid) {
      var html = _load(_cpKey(pid));
      if (html) GovBB.addPage(pid, html);
    });

    /* Apply modified flow */
    if (saved.flow && saved.flow.length) GovBB.setFlow(saved.flow);
  }

  function _saveFlow() {
    var flow   = GovBB.getFlow();
    var cpIds  = flow.filter(function(pid) { return pid.startsWith('ge'); });
    _store(_flowKey(), { flow: flow, customPageIds: cpIds });
  }

  /* ─────────────────────────────────────────────────────
     EDIT BAR
     ───────────────────────────────────────────────────── */
  function _injectBar() {
    if (_$('ge-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'ge-bar';
    bar.setAttribute('style',
      'display:none;position:sticky;top:0;z-index:500;background:#00267f;color:#fff;' +
      'padding:0.625rem 1.5rem;align-items:center;gap:0.75rem;' +
      'font-family:Figtree,sans-serif;font-size:0.9375rem;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.2);flex-wrap:wrap;');
    bar.innerHTML =
      PENCIL_SVG +
      '<span id="ge-label" style="font-weight:600">Editing</span>' +
      '<span style="flex:1;min-width:0.5rem"></span>' +
      '<span style="font-size:0.8rem;opacity:0.7">Click text to edit &nbsp;·&nbsp; Drag ≡ to reorder</span>' +
      '<span style="flex:1;min-width:0.5rem"></span>' +
      '<button id="ge-pages-btn" style="' + _btnCss('#1a3a7a','#fff','2px solid rgba(255,255,255,0.4)') + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' +
        ' Pages' +
      '</button>' +
      '<button id="ge-save"   style="' + _btnCss('#1fbf84','#fff') + '">Save changes</button>' +
      '<button id="ge-cancel" style="' + _btnCss('transparent','#fff','2px solid rgba(255,255,255,0.5)') + '">Cancel</button>';

    var alpha = document.querySelector('.bg-bb-blue-10');
    if (alpha && alpha.nextSibling) alpha.parentNode.insertBefore(bar, alpha.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);

    _$('ge-save').addEventListener('click',      _save);
    _$('ge-cancel').addEventListener('click',    _cancel);
    _$('ge-pages-btn').addEventListener('click', _togglePageManager);
  }

  function _showBar(pageId) {
    var b = _$('ge-bar');
    if (b) b.style.display = 'flex';
    var l = _$('ge-label');
    if (l) l.textContent = 'Editing: ' + _pageName(pageId);
  }

  function _hideBar() {
    var b = _$('ge-bar');
    if (b) b.style.display = 'none';
    _closePageManager();
  }

  /* ─────────────────────────────────────────────────────
     PAGE MANAGER PANEL
     ───────────────────────────────────────────────────── */
  function _togglePageManager() {
    var panel = _$('ge-pm');
    if (panel) { panel.remove(); return; }
    _openPageManager();
  }

  function _openPageManager() {
    _closePageManager();
    var flow    = GovBB.getFlow();
    var current = _currentPageId();
    var bar     = _$('ge-bar');
    if (!bar) return;

    var panel = document.createElement('div');
    panel.id = 'ge-pm';
    panel.setAttribute('style',
      'position:fixed;top:' + (bar.offsetTop + bar.offsetHeight) + 'px;right:1.5rem;' +
      'width:280px;background:#fff;border:2px solid #00267f;border-radius:0.375rem;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:600;font-family:Figtree,sans-serif;overflow:hidden;');

    var html =
      '<div style="background:#00267f;color:#fff;padding:0.625rem 1rem;font-weight:600;font-size:0.9rem">Pages in this form</div>' +
      '<ul id="ge-pm-list" style="list-style:none;margin:0;padding:0.5rem 0;max-height:320px;overflow-y:auto;">';

    flow.forEach(function(pid) {
      var isFixed   = _FIXED.indexOf(pid) !== -1;
      var isCurrent = pid === current;
      html +=
        '<li data-pid="' + pid + '" style="display:flex;align-items:center;padding:0.375rem 0.75rem;' +
        'cursor:pointer;' + (isCurrent ? 'background:#eaf9f9;' : '') + '" ' +
        'onmouseenter="this.style.background=\'' + (isCurrent ? '#eaf9f9' : '#f8fafc') + '\'" ' +
        'onmouseleave="this.style.background=\'' + (isCurrent ? '#eaf9f9' : 'transparent') + '\'">' +
          '<span style="flex:1;font-size:0.875rem;' + (isCurrent ? 'color:#0e5f64;font-weight:600;' : '') + '">' +
            (isCurrent ? '▶ ' : '') + _pageName(pid) +
          '</span>' +
          (isFixed ? '<span style="font-size:0.75rem;color:#99a8cc">fixed</span>'
                   : '<button class="ge-pm-del" data-pid="' + pid + '" style="' +
                     'background:none;border:none;cursor:pointer;color:#a42c2c;' +
                     'font-size:16px;padding:0 0 0 0.5rem;opacity:0.6;line-height:1;" ' +
                     'title="Delete page" onclick="event.stopPropagation()">×</button>') +
        '</li>';
    });

    html +=
      '</ul>' +
      '<div style="padding:0.5rem 0.75rem;border-top:1px solid #e0e4e9;">' +
        '<button id="ge-pm-add" style="' + _btnCss('#eaf9f9','#0e5f64','2px dashed #ace6e9') + 'width:100%;justify-content:center;">' +
          PLUS_SVG + ' Add new page' +
        '</button>' +
      '</div>';

    panel.innerHTML = html;

    /* Navigate on row click */
    panel.querySelectorAll('li[data-pid]').forEach(function(li) {
      li.addEventListener('click', function() {
        GovBB.nav(li.getAttribute('data-pid'));
        _closePageManager();
      });
    });

    /* Delete page buttons */
    panel.querySelectorAll('.ge-pm-del').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        _deletePage(btn.getAttribute('data-pid'));
      });
    });

    panel.querySelector('#ge-pm-add').addEventListener('click', _addPage);

    document.body.appendChild(panel);

    /* Close when clicking outside */
    setTimeout(function() {
      document.addEventListener('click', _pmOutsideClick);
    }, 0);
  }

  function _pmOutsideClick(e) {
    var panel = _$('ge-pm');
    var btn   = _$('ge-pages-btn');
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
      _closePageManager();
    }
  }

  function _closePageManager() {
    var panel = _$('ge-pm');
    if (panel) panel.remove();
    document.removeEventListener('click', _pmOutsideClick);
  }

  /* ── Add page ── */
  function _addPage() {
    _closePageManager();
    var pid  = _uid();
    var html = _buildCustomPageHTML();
    GovBB.addPage(pid, html);
    _store(_cpKey(pid), html);

    /* Insert before 'check' or 'confirmation', whichever comes first */
    var flow    = GovBB.getFlow().slice();
    var insertAt = flow.indexOf('check');
    if (insertAt === -1) insertAt = flow.indexOf('confirmation');
    if (insertAt === -1) insertAt = flow.length - 1;
    flow.splice(insertAt, 0, pid);
    GovBB.setFlow(flow);
    _saveFlow();

    GovBB.nav(pid);
    _toast('New page added — click text to edit it');
  }

  function _buildCustomPageHTML() {
    var fid = _uid() + '-field';
    return '<form novalidate>' +
      GovBB.backLink() +
      GovBB.caption() +
      '<h1 class="font-bold text-[3.5rem] leading-[1.15] mb-8">New question</h1>' +
      '<div class="space-y-8">' +
        GovBB.textField(fid, 'Field label', { hint: 'Hint text (optional)' }) +
        GovBB.continueBtn() +
      '</div>' +
    '</form>';
  }

  /* ── Delete page ── */
  function _deletePage(pid) {
    if (_FIXED.indexOf(pid) !== -1) return;
    var flow = GovBB.getFlow().slice();
    if (flow.filter(function(p) { return _FIXED.indexOf(p) === -1; }).length <= 1) {
      _toast('Cannot delete the last question page');
      return;
    }
    var idx = flow.indexOf(pid);
    flow.splice(idx, 1);
    GovBB.setFlow(flow);
    _del(_pageKey(pid));
    _del(_cpKey(pid));
    _saveFlow();
    _closePageManager();

    /* Navigate to adjacent page */
    var newIdx = Math.min(GovBB.getCurrentIndex(), flow.length - 1);
    GovBB.nav(flow[newIdx]);
    _toast('Page deleted');
  }

  /* ─────────────────────────────────────────────────────
     MAIN RENDER HANDLER
     ───────────────────────────────────────────────────── */
  function _onRender(app) {
    var pid = _currentPageId();
    if (pid === 'confirmation') { _hideBar(); return; }

    _applySavedData(app, pid);
    _showBar(pid);
    _closePageManager();

    if (GovBB.getCurrentIndex() === 0) {
      _activateStartPage(app);
    } else {
      _activateQuestionPage(app, pid);
    }
  }

  /* ─────────────────────────────────────────────────────
     START PAGE
     ───────────────────────────────────────────────────── */
  function _activateStartPage(app) {
    var root = _getRoot(app);
    if (!root) return;

    Array.from(root.children).forEach(function(sec, i) {
      sec.setAttribute('data-ge-orig', i);
      _setupSection(sec, root);
    });

    /* "Add section" button at the bottom (before the start-button row) */
    if (!root.querySelector('.ge-add-section')) {
      var addBtn = _makeAddMenu('Add section', [
        { label: 'Text paragraph',    fn: _sectionParagraph },
        { label: 'Requirements list', fn: _sectionRequirements },
        { label: 'Notice box',        fn: _sectionNotice }
      ], function(html) {
        var startRow = Array.from(root.children).find(_isButtonRow);
        var el = _htmlToElement(html);
        if (startRow) root.insertBefore(el, startRow);
        else root.appendChild(el);
        el.setAttribute('data-ge-orig', root.children.length - 1);
        _setupSection(el, root);
      });
      addBtn.classList.add('ge-add-section');
      root.appendChild(addBtn);
    }
  }

  function _setupSection(el, root) {
    if (el.hasAttribute('data-ge')) return;
    if (_isButtonRow(el))           return;
    if (el.classList.contains('ge-add-section')) return;

    el.setAttribute('data-ge', 'section');
    el.setAttribute('draggable', 'true');
    el.style.position = 'relative';

    el.appendChild(_createHandle('Drag to reorder section'));
    el.appendChild(_createDeleteBtn(function() {
      el.remove();
      _toast('Section removed');
    }));

    el.querySelectorAll('h1, h2').forEach(_makeEditable);
    el.querySelectorAll('p').forEach(function(p) {
      if (!p.closest('ul')) _makeEditable(p);
    });

    var ul = el.querySelector('ul');
    if (ul) _setupList(ul);

    _bindDrag(el, root, '__geDragSection');
  }

  /* Section templates */
  function _sectionParagraph() {
    return '<div><p class="text-[1.25rem]">New paragraph. Click to edit.</p></div>';
  }
  function _sectionRequirements() {
    return '<div><h2 class="font-bold text-[1.5rem] mb-4">What you will need</h2>' +
           '<ul class="list-disc pl-6 space-y-2 text-[1.25rem]"><li>Item one</li><li>Item two</li></ul></div>';
  }
  function _sectionNotice() {
    return '<div class="bg-bb-blue-10 border-l-4 border-bb-blue-40 p-4">' +
           '<p class="font-bold">Notice heading</p>' +
           '<p>Notice body text. Click to edit.</p></div>';
  }

  /* ─────────────────────────────────────────────────────
     QUESTION / CHECK / DECLARATION PAGES
     ───────────────────────────────────────────────────── */
  function _activateQuestionPage(app, pid) {
    /* Always-editable: h1, h2, caption, static paragraphs */
    app.querySelectorAll('h1, h2').forEach(_makeEditable);
    app.querySelectorAll('p.border-bb-blue-40').forEach(_makeEditable);
    app.querySelectorAll('p:not(.border-bb-blue-40)').forEach(function(p) {
      if (!p.closest('.field-group')) _makeEditable(p);
    });

    var fieldsRoot = app.querySelector('.space-y-8');
    if (!fieldsRoot) return;

    /* Field groups: labels, hints, drag, delete */
    Array.from(fieldsRoot.children).forEach(function(child, ci) {
      child.setAttribute('data-ge-orig', ci);
      if (!_isButtonRow(child) && !child.classList.contains('ge-add-field')) {
        _setupFieldGroup(child, fieldsRoot);
      }
    });

    app.querySelectorAll('.field-group label').forEach(_makeEditable);
    app.querySelectorAll('.field-group p').forEach(_makeEditable);

    /* "Add field" button */
    if (!fieldsRoot.querySelector('.ge-add-field')) {
      var addBtn = _makeAddMenu('Add field', [
        { label: 'Text input',   fn: function() { return GovBB.textField(_uid(), 'Field label', { hint: 'Hint text (optional)' }); } },
        { label: 'Email',        fn: function() { return GovBB.emailField(_uid(), 'Email address'); } },
        { label: 'Phone number', fn: function() { return GovBB.telField(_uid(), 'Phone number'); } },
        { label: 'Date',         fn: function() { return GovBB.dateField(_uid(), 'Date', 'For example, 27 03 2007'); } },
        { label: 'Dropdown',     fn: function() { return GovBB.selectField(_uid(), 'Choose an option', ['Option 1', 'Option 2', 'Option 3']); } },
        { label: 'Textarea',     fn: function() { return GovBB.textareaField(_uid(), 'Description', { hint: 'Enter details here', rows: 4 }); } },
        { label: 'Radio group',  fn: function() { return GovBB.radioGroup(_uid() + '-radio', 'Choose one', ['Yes', 'No']); } },
        { label: 'Checkbox',     fn: function() { return GovBB.checkboxItem(_uid() + '-check', 'I confirm this'); } }
      ], function(html) {
        var continueRow = Array.from(fieldsRoot.children).find(_isButtonRow);
        var el = _htmlToElement(html);
        if (continueRow) fieldsRoot.insertBefore(el, continueRow);
        else fieldsRoot.appendChild(el);
        el.setAttribute('data-ge-orig', fieldsRoot.children.length - 1);
        _setupFieldGroup(el, fieldsRoot);
        el.querySelectorAll('label').forEach(_makeEditable);
        el.querySelectorAll('p').forEach(_makeEditable);
      });
      addBtn.classList.add('ge-add-field');

      var continueRow = Array.from(fieldsRoot.children).find(_isButtonRow);
      if (continueRow) fieldsRoot.insertBefore(addBtn, continueRow);
      else fieldsRoot.appendChild(addBtn);
    }
  }

  function _setupFieldGroup(el, root) {
    if (el.hasAttribute('data-ge')) return;
    if (_isButtonRow(el)) return;

    el.setAttribute('data-ge', 'field');
    el.setAttribute('draggable', 'true');
    el.style.position = 'relative';

    el.appendChild(_createHandle('Drag to reorder field'));
    el.appendChild(_createDeleteBtn(function() {
      el.remove();
      _toast('Field removed');
    }));

    _bindDrag(el, root, '__geDragField');
  }

  /* ─────────────────────────────────────────────────────
     REQUIREMENTS LIST
     ───────────────────────────────────────────────────── */
  function _setupList(ul) {
    Array.from(ul.querySelectorAll('li')).forEach(function(li) { _setupListItem(li, ul); });

    var addBtn = document.createElement('button');
    addBtn.className = 'ge-add-item';
    addBtn.innerHTML = PLUS_SVG + ' Add item';
    addBtn.addEventListener('click', function(e) {
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

    li.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); li.blur(); }
    });

    var del = document.createElement('button');
    del.className = 'ge-del';
    del.title = 'Remove item';
    del.innerHTML = '&times;';
    del.setAttribute('contenteditable', 'false');
    del.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); li.remove(); });
    li.appendChild(del);

    _bindDrag(li, ul, '__geDragLi');
  }

  /* ─────────────────────────────────────────────────────
     SHARED DRAG & DROP
     ───────────────────────────────────────────────────── */
  function _bindDrag(el, container, stateKey) {
    el.addEventListener('dragstart', function(e) {
      if (el.tagName === 'LI') e.stopPropagation();
      else if (stateKey !== '__geDragLi' && e.target.hasAttribute('data-ge-li')) return;
      e.dataTransfer.effectAllowed = 'move';
      el.style.opacity = '0.45';
      global[stateKey] = el;
      if (stateKey !== '__geDragLi') e.stopPropagation();
    });
    el.addEventListener('dragend', function() {
      el.style.opacity = '';
      global[stateKey] = null;
      container.querySelectorAll('.ge-drop-target').forEach(function(s) { s.classList.remove('ge-drop-target'); });
    });
    el.addEventListener('dragover', function(e) {
      if (global[stateKey] && global[stateKey] !== el) {
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('ge-drop-target');
      }
    });
    el.addEventListener('dragleave', function() { el.classList.remove('ge-drop-target'); });
    el.addEventListener('drop', function(e) {
      e.stopPropagation();
      var src = global[stateKey];
      if (src && src !== el) {
        if (_domIndex(src) < _domIndex(el)) container.insertBefore(src, el.nextSibling);
        else                                container.insertBefore(src, el);
      }
      el.classList.remove('ge-drop-target');
    });
  }

  /* ─────────────────────────────────────────────────────
     ADD-TYPE MENU
     ───────────────────────────────────────────────────── */
  function _makeAddMenu(label, types, onSelect) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;margin-top:0.75rem;';

    var btn = document.createElement('button');
    btn.className = 'ge-add-item';
    btn.innerHTML = PLUS_SVG + ' ' + label;
    wrap.appendChild(btn);

    var menu = document.createElement('div');
    menu.className = 'ge-type-menu';
    menu.style.cssText = 'display:none;position:absolute;left:0;top:calc(100% + 4px);' +
      'background:#fff;border:2px solid #00267f;border-radius:0.375rem;' +
      'box-shadow:0 8px 20px rgba(0,0,0,0.12);z-index:400;min-width:180px;overflow:hidden;';

    types.forEach(function(t) {
      var item = document.createElement('button');
      item.style.cssText = 'display:block;width:100%;text-align:left;padding:0.5rem 0.875rem;' +
        'background:none;border:none;font-family:inherit;font-size:0.875rem;cursor:pointer;' +
        'color:#000;transition:background 0.1s;';
      item.textContent = t.label;
      item.addEventListener('mouseenter', function() { item.style.background = '#eaf9f9'; });
      item.addEventListener('mouseleave', function() { item.style.background = 'none'; });
      item.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        menu.style.display = 'none';
        onSelect(t.fn());
      });
      menu.appendChild(item);
    });

    wrap.appendChild(menu);

    btn.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      var isOpen = menu.style.display !== 'none';
      /* Close all other menus */
      document.querySelectorAll('.ge-type-menu').forEach(function(m) { m.style.display = 'none'; });
      menu.style.display = isOpen ? 'none' : 'block';
    });

    /* Close menu on outside click */
    document.addEventListener('click', function() { menu.style.display = 'none'; });

    return wrap;
  }

  /* ─────────────────────────────────────────────────────
     GENERIC HELPERS
     ───────────────────────────────────────────────────── */
  function _makeEditable(el) {
    if (el.contentEditable === 'true') return;
    el.contentEditable = 'true';
    el.classList.add('ge-editable');
    if (['H1','H2','LABEL'].indexOf(el.tagName) !== -1) {
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });
    }
    if (el.tagName === 'LABEL') {
      el.addEventListener('click',     function(e) { e.preventDefault(); });
      el.addEventListener('mousedown', function(e) { e.preventDefault(); el.focus(); });
    }
  }

  function _createHandle(title) {
    var h = document.createElement('div');
    h.className = 'ge-handle';
    h.title = title;
    h.innerHTML = DRAG_SVG;
    return h;
  }

  function _createDeleteBtn(onDelete) {
    var b = document.createElement('button');
    b.className = 'ge-delete-btn';
    b.title = 'Delete';
    b.innerHTML = '&times;';
    b.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); onDelete(); });
    return b;
  }

  function _isButtonRow(el) {
    return !!el.querySelector('a[onclick*="next"], button[onclick*="next()"]') && !el.querySelector('h2, ul');
  }

  function _getRoot(app) {
    return app.querySelector('.space-y-8') || app.firstElementChild;
  }

  function _htmlToElement(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.firstElementChild || tmp;
  }

  /* ─────────────────────────────────────────────────────
     SAVE
     ───────────────────────────────────────────────────── */
  function _save() {
    var app = _$('app');
    var pid = _currentPageId();
    if (GovBB.getCurrentIndex() === 0) _saveStartPage(app, pid);
    else                               _saveQuestionPage(app, pid);
    _toast('Changes saved');
  }

  function _saveStartPage(app, pid) {
    var root = _getRoot(app);
    if (!root) return;
    var order = [], sections = [];

    Array.from(root.children).forEach(function(sec) {
      if (sec.classList.contains('ge-add-section')) return;
      order.push(parseInt(sec.getAttribute('data-ge-orig') || '0', 10));
      var d = {};
      var h1 = sec.querySelector('h1'), h2 = sec.querySelector('h2');
      var ps = Array.from(sec.querySelectorAll('p')).filter(function(p) { return !p.closest('ul'); });
      var ul = sec.querySelector('ul');
      if (h1) d.h1 = h1.textContent.trim();
      if (h2) d.h2 = h2.textContent.trim();
      if (ps.length) d.paragraphs = ps.map(function(p) { return p.textContent.trim(); });
      if (ul) {
        d.items = Array.from(ul.querySelectorAll('li')).map(function(li) {
          var c = li.cloneNode(true);
          c.querySelectorAll('.ge-del,.ge-handle,.ge-delete-btn').forEach(function(n) { n.remove(); });
          return c.textContent.trim();
        });
      }
      /* Preserve the outer HTML for new sections that weren't in the original template */
      var origIdx = parseInt(sec.getAttribute('data-ge-orig') || '0', 10);
      if (origIdx >= 1000) d._customHTML = sec.outerHTML;
      sections.push(d);
    });

    _store(_pageKey(pid), { version: 1, order: order, sections: sections });
  }

  function _saveQuestionPage(app, pid) {
    var d = { version: 1 };
    var h1 = app.querySelector('h1');
    if (h1) d.h1 = h1.textContent.trim();
    var cap = app.querySelector('p.border-bb-blue-40');
    if (cap) d.caption = cap.textContent.trim();
    var h2s = Array.from(app.querySelectorAll('h2'));
    if (h2s.length) d.h2s = h2s.map(function(h) { return h.textContent.trim(); });

    var fieldsRoot = app.querySelector('.space-y-8');
    if (fieldsRoot) {
      var fieldOrder = [], fields = {};
      Array.from(fieldsRoot.children).forEach(function(child) {
        var oi = child.getAttribute('data-ge-orig');
        if (oi === null || _isButtonRow(child)) return;
        fieldOrder.push(parseInt(oi, 10));
        var lbl = child.querySelector('label'), hint = child.querySelector('p');
        var fd = {};
        if (lbl)  fd.label = lbl.textContent.trim();
        if (hint) fd.hint  = hint.textContent.trim();
        fields[oi] = fd;
      });
      d.fieldOrder = fieldOrder;
      d.fields     = fields;
    }
    _store(_pageKey(pid), d);
  }

  /* ─────────────────────────────────────────────────────
     CANCEL (current page only)
     ───────────────────────────────────────────────────── */
  function _cancel() {
    _del(_pageKey(_currentPageId()));
    if (global.GovBB && GovBB.render) GovBB.render();
  }

  /* ─────────────────────────────────────────────────────
     RESTORE SAVED DATA
     ───────────────────────────────────────────────────── */
  function _applySavedData(app, pid) {
    var saved = _load(_pageKey(pid));
    if (!saved) return;
    if (GovBB.getCurrentIndex() === 0) _restoreStartPage(app, saved);
    else                               _restoreQuestionPage(app, saved);
  }

  function _restoreStartPage(app, saved) {
    var root = _getRoot(app);
    if (!root) return;

    if (saved.order && saved.order.length) {
      var orig = Array.from(root.children);
      saved.order.forEach(function(oi) { if (orig[oi]) root.appendChild(orig[oi]); });
    }

    if (saved.sections) {
      Array.from(root.children).forEach(function(sec, si) {
        var d = saved.sections[si];
        if (!d) return;
        if (d.h1) { var h = sec.querySelector('h1'); if (h) h.textContent = d.h1; }
        if (d.h2) { var h2 = sec.querySelector('h2'); if (h2) h2.textContent = d.h2; }
        if (d.paragraphs) {
          var ps = Array.from(sec.querySelectorAll('p')).filter(function(p) { return !p.closest('ul'); });
          d.paragraphs.forEach(function(t, i) { if (ps[i]) ps[i].textContent = t; });
        }
        if (d.items) {
          var ul = sec.querySelector('ul');
          if (ul) {
            ul.innerHTML = '';
            d.items.forEach(function(t) {
              var li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
            });
          }
        }
      });
    }
  }

  function _restoreQuestionPage(app, saved) {
    if (saved.h1)     { var h1 = app.querySelector('h1'); if (h1) h1.textContent = saved.h1; }
    if (saved.caption){ var cp = app.querySelector('p.border-bb-blue-40'); if (cp) cp.textContent = saved.caption; }
    if (saved.h2s) {
      var h2s = app.querySelectorAll('h2');
      saved.h2s.forEach(function(t, i) { if (h2s[i]) h2s[i].textContent = t; });
    }
    var fr = app.querySelector('.space-y-8');
    if (!fr || !saved.fields) return;

    Array.from(fr.children).forEach(function(child) {
      var oi = child.getAttribute('data-ge-orig');
      var fd = saved.fields && saved.fields[oi];
      if (!fd) return;
      if (fd.label) { var l = child.querySelector('label'); if (l) l.textContent = fd.label; }
      if (fd.hint)  { var p = child.querySelector('p'); if (p) p.textContent = fd.hint; }
    });

    if (saved.fieldOrder && saved.fieldOrder.length) {
      var orig = Array.from(fr.children);
      saved.fieldOrder.forEach(function(oi) { if (orig[oi]) fr.appendChild(orig[oi]); });
    }
  }

  /* ─────────────────────────────────────────────────────
     TOAST
     ───────────────────────────────────────────────────── */
  function _toast(msg) {
    var t = document.createElement('div');
    t.className = 'ge-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add('ge-toast-out'); setTimeout(function() { t.remove(); }, 400); }, 2200);
  }

  /* ─────────────────────────────────────────────────────
     STYLES
     ───────────────────────────────────────────────────── */
  function _injectStyles() {
    if (_$('ge-css')) return;
    var s = document.createElement('style');
    s.id = 'ge-css';
    s.textContent =
      '[data-ge]{outline:2px dashed #99a8cc;outline-offset:6px;border-radius:4px;transition:outline-color 0.15s;}' +
      '[data-ge]:hover{outline-color:#0e5f64;}' +
      '[data-ge].ge-drop-target{outline:3px solid #30c0c8!important;background:#eaf9f9;}' +

      '.ge-handle{position:absolute;top:-2px;right:28px;width:26px;height:26px;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:#e5e9f2;border-radius:4px;cursor:grab;color:#595959;' +
        'opacity:0;transition:opacity 0.15s;z-index:10;pointer-events:none;}' +
      '[data-ge]:hover .ge-handle{opacity:1;}' +

      '.ge-delete-btn{position:absolute;top:-2px;right:-2px;width:26px;height:26px;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:#fff0f0;border:none;border-radius:4px;cursor:pointer;' +
        'color:#a42c2c;font-size:18px;line-height:1;' +
        'opacity:0;transition:opacity 0.15s;z-index:10;}' +
      '[data-ge]:hover .ge-delete-btn{opacity:1;}' +
      '.ge-delete-btn:hover{background:#ffc4c4;}' +

      '.ge-editable{cursor:text;}' +
      '.ge-editable:focus{outline:none;background:#fff9e9;border-radius:2px;box-shadow:0 0 0 2px #30c0c8;}' +
      'label.ge-editable:focus{display:block;}' +

      '.ge-li{position:relative;padding-right:2.5rem!important;border:1px solid transparent;border-radius:3px;cursor:grab;transition:border-color 0.1s,background 0.1s;}' +
      '.ge-li:hover{border-color:#c0c8d8;background:#f8fafc;}' +
      '.ge-li:focus{outline:none;border-color:#30c0c8;background:#fff9e9;}' +
      '.ge-li.ge-drop-target{border-color:#30c0c8;background:#eaf9f9;}' +

      '.ge-del{position:absolute;right:4px;top:50%;transform:translateY(-50%);' +
        'width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;' +
        'background:none;border:none;cursor:pointer;color:#a42c2c;font-size:18px;line-height:1;' +
        'border-radius:3px;opacity:0;transition:opacity 0.15s,background 0.1s;}' +
      '.ge-li:hover .ge-del{opacity:0.6;}' +
      '.ge-del:hover{opacity:1!important;background:#fff0f0;}' +

      '.ge-add-item{display:inline-flex;align-items:center;gap:0.375rem;margin-top:0.5rem;' +
        'padding:0.375rem 0.875rem;background:#eaf9f9;color:#0e5f64;' +
        'border:2px dashed #ace6e9;border-radius:0.25rem;' +
        'font-family:Figtree,sans-serif;font-size:0.875rem;font-weight:600;cursor:pointer;transition:background 0.1s;}' +
      '.ge-add-item:hover{background:#ace6e9;}' +

      '.ge-toast{position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);' +
        'background:#00654a;color:#fff;padding:0.75rem 1.5rem;border-radius:0.375rem;' +
        'font-family:Figtree,sans-serif;font-size:1rem;font-weight:600;' +
        'z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.4s;}' +
      '.ge-toast-out{opacity:0;}';
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────────────────────────
     INIT
     ───────────────────────────────────────────────────── */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
  else _boot();

}(window));
