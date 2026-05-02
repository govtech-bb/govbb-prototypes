/* govbb-inline-edit.js
 * Section-based inline editing for GovBB prototype start pages.
 * Activated automatically when the URL contains ?edit=1.
 * Loaded dynamically by govbb-framework.js — no prototype files need changing.
 */
(function (global) {
  'use strict';

  /* ─── Slug / storage key ─────────────────────────────── */
  var _slug = location.pathname.split('/').pop().replace('.html', '');
  var _KEY  = 'ge:' + _slug;

  /* ─── State ──────────────────────────────────────────── */
  var _origHTML = '';   // clean template output; restored on Cancel

  /* ─── Helpers ────────────────────────────────────────── */
  function _$(id) { return document.getElementById(id); }

  function _domIndex(el) {
    return Array.prototype.indexOf.call(el.parentNode.children, el);
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

  /* ─── Boot: wait for GovBB to initialise ────────────── */
  function _boot() {
    if (!global.GovBB) { setTimeout(_boot, 50); return; }

    var app = _$('app');
    if (!app) { setTimeout(_boot, 50); return; }

    _injectBar();
    _injectStyles();

    /* Watch #app for page re-renders */
    var obs = new MutationObserver(function () {
      if (GovBB.getCurrentIndex() === 0) {
        _onStartPage(app);
      } else {
        _hideBar();
      }
    });
    obs.observe(app, { childList: true });

    /* Handle the initial render (already done by GovBB.init) */
    if (GovBB.getCurrentIndex() === 0) _onStartPage(app);
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
      '<span style="font-weight:600">Editing start page</span>' +
      '<span style="flex:1;min-width:0.5rem"></span>' +
      '<span style="font-size:0.8rem;opacity:0.7">Click any text to edit &nbsp;·&nbsp; Drag ≡ handles to reorder</span>' +
      '<span style="flex:1;min-width:0.5rem"></span>' +
      '<button id="ge-save" style="' + _btnStyle('#1fbf84', '#fff') + '">Save changes</button>' +
      '<button id="ge-cancel" style="' + _btnStyle('transparent', '#fff', '2px solid rgba(255,255,255,0.5)') + '">Cancel</button>';

    /* Insert after the alpha banner so the gov header is preserved */
    var alpha = document.querySelector('.bg-bb-blue-10');
    if (alpha && alpha.nextSibling) {
      alpha.parentNode.insertBefore(bar, alpha.nextSibling);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }

    _$('ge-save').addEventListener('click', _save);
    _$('ge-cancel').addEventListener('click', _cancel);
  }

  function _showBar() {
    var b = _$('ge-bar');
    if (b) b.style.display = 'flex';
  }

  function _hideBar() {
    var b = _$('ge-bar');
    if (b) b.style.display = 'none';
  }

  /* ─── Start page handler ─────────────────────────────── */
  function _onStartPage(app) {
    _origHTML = app.innerHTML;         // clean template output — for Cancel
    _applySavedData(app);              // restore any previous saves
    _showBar();
    _activateEditing(app);
  }

  /* ─── Restore saved data from localStorage ───────────── */
  function _applySavedData(app) {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(_KEY)); } catch (e) {}
    if (!saved) return;

    var root = _getRoot(app);
    if (!root) return;

    /* 1 — Reorder sections */
    if (saved.order && saved.order.length) {
      var orig = Array.from(root.children);
      saved.order.forEach(function (origIdx) {
        if (orig[origIdx]) root.appendChild(orig[origIdx]);
      });
    }

    /* 2 — Patch text content by current position */
    if (saved.sections) {
      Array.from(root.children).forEach(function (section, si) {
        var d = saved.sections[si];
        if (!d) return;

        if (d.h1) {
          var h = section.querySelector('h1');
          if (h) h.textContent = d.h1;
        }
        if (d.h2) {
          var h2 = section.querySelector('h2');
          if (h2) h2.textContent = d.h2;
        }
        if (d.paragraphs) {
          var ps = Array.from(section.querySelectorAll('p')).filter(function (p) {
            return !p.closest('ul');
          });
          d.paragraphs.forEach(function (txt, i) {
            if (ps[i]) ps[i].textContent = txt;
          });
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

  /* ─── Activate editing on the rendered DOM ───────────── */
  function _activateEditing(app) {
    var root = _getRoot(app);
    if (!root) return;

    Array.from(root.children).forEach(function (section, si) {
      section.setAttribute('data-ge-orig', si);   // record original index
      _setupSection(section, root);
    });
  }

  function _getRoot(app) {
    return app.querySelector('.space-y-8') || app.firstElementChild;
  }

  /* ─── Per-section setup ──────────────────────────────── */
  function _setupSection(el, root) {
    if (el.hasAttribute('data-ge')) return;   // already wired
    if (_isButtonRow(el)) return;             // skip start-button row

    el.setAttribute('data-ge', '1');
    el.setAttribute('draggable', 'true');
    el.style.position = 'relative';

    /* Drag handle */
    var handle = _createHandle('Drag to reorder section');
    el.appendChild(handle);

    /* Editable text elements */
    el.querySelectorAll('h1, h2').forEach(_makeEditable);
    el.querySelectorAll('p').forEach(function (p) {
      if (!p.closest('ul') && !p.closest('[data-ge-ignore]')) _makeEditable(p);
    });

    /* Editable list */
    var ul = el.querySelector('ul');
    if (ul) _setupList(ul);

    /* Section drag-and-drop */
    el.addEventListener('dragstart', function (e) {
      if (e.target.hasAttribute('data-ge-li')) return; // li handles own drag
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
        if (_domIndex(src) < _domIndex(el)) {
          root.insertBefore(src, el.nextSibling);
        } else {
          root.insertBefore(src, el);
        }
      }
      el.classList.remove('ge-drop-target');
    });
  }

  function _isButtonRow(el) {
    /* The start-button row has an onclick="next()" anchor and no h2 / ul */
    return !!el.querySelector('a[onclick*="next"]') && !el.querySelector('h2, ul');
  }

  /* ─── Drag handle element ────────────────────────────── */
  function _createHandle(title) {
    var h = document.createElement('div');
    h.className = 'ge-handle';
    h.title = title;
    h.setAttribute('draggable', 'true');
    h.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>' +
      '</svg>';
    return h;
  }

  /* ─── Inline text editing ────────────────────────────── */
  function _makeEditable(el) {
    if (el.contentEditable === 'true') return;
    el.contentEditable = 'true';
    el.classList.add('ge-editable');
    if (el.tagName === 'H1' || el.tagName === 'H2') {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });
    }
  }

  /* ─── List editing ───────────────────────────────────── */
  function _setupList(ul) {
    Array.from(ul.querySelectorAll('li')).forEach(function (li) {
      _setupListItem(li, ul);
    });

    /* "Add item" button */
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

    /* Prevent Enter from splitting into a new block */
    li.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); li.blur(); }
    });

    /* Delete button */
    var del = document.createElement('button');
    del.className = 'ge-del';
    del.title = 'Remove item';
    del.innerHTML = '&times;';
    del.setAttribute('contenteditable', 'false');
    del.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      li.remove();
    });
    li.appendChild(del);

    /* List-item drag-and-drop */
    li.addEventListener('dragstart', function (e) {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      li.style.opacity = '0.45';
      global.__geDragLi = li;
    });
    li.addEventListener('dragend', function () {
      li.style.opacity = '';
      global.__geDragLi = null;
      ul.querySelectorAll('.ge-li-target').forEach(function (l) {
        l.classList.remove('ge-li-target');
      });
    });
    li.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (global.__geDragLi && global.__geDragLi !== li) {
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('ge-li-target');
      }
    });
    li.addEventListener('dragleave', function () {
      li.classList.remove('ge-li-target');
    });
    li.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var src = global.__geDragLi;
      if (src && src !== li) {
        if (_domIndex(src) < _domIndex(li)) {
          ul.insertBefore(src, li.nextSibling);
        } else {
          ul.insertBefore(src, li);
        }
      }
      li.classList.remove('ge-li-target');
    });
  }

  /* ─── Save ───────────────────────────────────────────── */
  function _save() {
    var app = _$('app');
    var root = _getRoot(app);
    if (!root) return;

    var order    = [];
    var sections = [];

    Array.from(root.children).forEach(function (section) {
      /* Original DOM index (set during activation) */
      order.push(parseInt(section.getAttribute('data-ge-orig') || '0', 10));

      var d = {};

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
          /* Strip edit-chrome (delete button etc.) before reading text */
          var clone = li.cloneNode(true);
          clone.querySelectorAll('.ge-del, .ge-handle').forEach(function (n) { n.remove(); });
          return clone.textContent.trim();
        });
      }

      sections.push(d);
    });

    try {
      localStorage.setItem(_KEY, JSON.stringify({ version: 1, order: order, sections: sections }));
    } catch (e) {}

    _toast('Changes saved');
  }

  /* ─── Cancel ─────────────────────────────────────────── */
  function _cancel() {
    try { localStorage.removeItem(_KEY); } catch (e) {}
    /* Re-render from the original template — observer fires and re-activates edit */
    if (global.GovBB && GovBB.render) GovBB.render();
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
      /* Section blocks */
      '[data-ge]{outline:2px dashed #99a8cc;outline-offset:6px;border-radius:4px;transition:outline-color 0.15s;}',
      '[data-ge]:hover{outline-color:#0e5f64;}',
      '[data-ge].ge-drop-target{outline:3px solid #30c0c8;background:#eaf9f9;}',

      /* Drag handle (≡) */
      '.ge-handle{position:absolute;top:-2px;right:-2px;width:26px;height:26px;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:#e5e9f2;border-radius:4px;cursor:grab;color:#595959;' +
        'opacity:0;transition:opacity 0.15s;z-index:10;}',
      '[data-ge]:hover .ge-handle{opacity:1;}',
      '.ge-handle:hover{background:#99a8cc;color:#00164a;}',

      /* Editable text */
      '.ge-editable:focus{outline:none;border-bottom:2px solid #30c0c8!important;' +
        'background:#fff9e9;border-radius:2px;}',

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
