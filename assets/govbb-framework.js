/* GovBB Framework — govbb-framework.js */
(function (global) {
  'use strict';

  var GovBB = {};

  /* ── Data store ── */
  GovBB.D = {};

  /* ── Parishes ── */
  GovBB.PARISHES = [
    'Christ Church', 'St. Andrew', 'St. George', 'St. James',
    'St. John', 'St. Joseph', 'St. Lucy', 'St. Michael',
    'St. Peter', 'St. Philip', 'St. Thomas'
  ];

  /* ── Internal state ── */
  var _formName  = '';
  var _flow      = [];
  var _pages     = {};
  var _current   = 0;
  var _validate  = function () { return []; };
  var _getFlow   = null;
  var _appEl     = 'app';
  var _onRadio   = null;

  /* ── CSS class constants ── */
  GovBB.BTN_CLS = 'relative inline-flex items-center justify-center gap-2 text-[20px] whitespace-nowrap transition-[background-color,box-shadow] duration-200 outline-none bg-bb-teal-00 text-bb-white-00 hover:bg-[#1a777d] hover:shadow-[inset_0_0_0_4px_rgba(222,245,246,0.10)] active:bg-[#0a4549] active:shadow-[inset_0_0_0_3px_rgba(0,0,0,0.20)] px-xm py-s rounded-sm leading-[1.7] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-1 focus-visible:ring-bb-teal-100 focus-visible:rounded-sm';
  GovBB.LINK_CLS = 'inline-flex outline-none underline-offset-2 underline hover:no-underline active:bg-bb-yellow-100 active:no-underline focus-visible:bg-bb-yellow-100 focus-visible:no-underline active:text-bb-black-00 focus-visible:text-bb-black-00 text-bb-teal-00 hover:text-bb-black-00 hover:bg-bb-teal-10';
  GovBB.INPUT_WRAP_CLS = 'relative inline-flex w-full rounded-sm border-2 border-bb-black-00 items-center gap-2 transition-all bg-bb-white-00 hover:shadow-form-hover focus-within:ring-4 focus-within:ring-bb-teal-100';
  GovBB.INPUT_CLS = 'w-full min-w-0 p-s outline-none rounded-[inherit] placeholder:text-bb-black-00/60';

  /* ── Init ── */
  GovBB.init = function (cfg) {
    _formName = cfg.formName || '';
    _flow     = (cfg.flow || []).slice();
    _pages    = cfg.pages || {};
    _validate = cfg.validate || function () { return []; };
    _getFlow  = cfg.getFlow || null;
    _appEl    = cfg.appElementId || 'app';
    _onRadio  = cfg.onRadioChange || null;
    _current  = 0;
    GovBB.render();
  };

  /* ── Navigation ── */
  GovBB.render = function () {
    var flow = _getFlow ? _getFlow() : _flow;
    var pageId = flow[_current];
    var el = document.getElementById(_appEl);
    if (!el) return;
    var fn = _pages[pageId];
    if (!fn) { el.innerHTML = '<p>Page not found: ' + pageId + '</p>'; return; }
    el.innerHTML = fn();
    _bindInputs();
    _bindRadios();
    _bindCheckboxes();
    _initSignaturePads();
    window.scrollTo(0, 0);
  };

  GovBB.getFlow = function () {
    return (_getFlow ? _getFlow() : _flow).slice();
  };

  GovBB.getCurrentIndex = function () {
    return _current;
  };

  GovBB.nav = function (pageId) {
    var flow = _getFlow ? _getFlow() : _flow;
    var idx = flow.indexOf(pageId);
    if (idx !== -1) { _current = idx; GovBB.render(); }
  };

  GovBB.next = function () {
    var errors = _validate(_currentPageId());
    if (errors && errors.length) { GovBB.showErrors(errors); return; }
    GovBB.clearErrors();
    var flow = _getFlow ? _getFlow() : _flow;
    var nextIdx = _current + 1;
    if (nextIdx >= flow.length) return;
    var nextPage = flow[nextIdx];
    if (nextPage === 'confirmation') {
      _submitForm(function () { _current = nextIdx; GovBB.render(); });
    } else {
      _current = nextIdx;
      GovBB.render();
    }
  };

  GovBB.back = function () {
    if (_current > 0) { _current--; GovBB.render(); }
  };

  function _currentPageId() {
    var flow = _getFlow ? _getFlow() : _flow;
    return flow[_current];
  }

  /* ── Form submission ── */
  function _submitForm(cb) {
    var email = GovBB.D['contact-email'] || GovBB.D['email'] || '';
    var payload = { formName: _formName, formData: GovBB.D, userEmail: email };
    fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.referenceNumber) window.__refNumber = data.referenceNumber;
      cb();
    })
    .catch(function () {
      window.__refNumber = _genRef();
      cb();
    });
  }

  function _genRef() {
    return 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /* ── Input auto-binding ── */
  function _bindInputs() {
    var inputs = document.querySelectorAll('[data-field]');
    inputs.forEach(function (el) {
      var field = el.getAttribute('data-field');
      // Restore saved value
      if (GovBB.D[field] !== undefined) {
        if (el.type === 'checkbox') el.checked = !!GovBB.D[field];
        else el.value = GovBB.D[field];
      }
      var ev = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(ev, function () {
        if (el.type === 'checkbox') GovBB.D[field] = el.checked;
        else GovBB.D[field] = el.value;
        if (el.getAttribute('data-trigger-render')) GovBB.render();
      });
    });
  }

  /* ── Radio binding ── */
  function _bindRadios() {
    var radios = document.querySelectorAll('[role="radio"]');
    radios.forEach(function (btn) {
      var name  = btn.getAttribute('data-name');
      var value = btn.getAttribute('data-value');
      if (GovBB.D[name] === value) _setRadioActive(name, value);
      btn.addEventListener('click', function () {
        GovBB.selectRadio(name, value);
        if (_onRadio) _onRadio(name, value);
      });
    });
  }

  function _setRadioActive(name, value) {
    var all = document.querySelectorAll('[role="radio"][data-name="' + name + '"]');
    all.forEach(function (b) {
      var isActive = b.getAttribute('data-value') === value;
      b.setAttribute('aria-checked', isActive ? 'true' : 'false');
      if (isActive) {
        b.classList.add('bg-bb-teal-00', 'border-bb-teal-00');
        b.classList.remove('bg-bb-white-00');
        b.innerHTML = '<span class="size-5 rounded-full bg-bb-white-00 block"></span>';
      } else {
        b.classList.remove('bg-bb-teal-00', 'border-bb-teal-00');
        b.classList.add('bg-bb-white-00');
        b.innerHTML = '';
      }
    });
  }

  GovBB.selectRadio = function (name, value) {
    GovBB.D[name] = value;
    _setRadioActive(name, value);
    // Show/hide conditional elements
    var conditionals = document.querySelectorAll('[data-show-when-name="' + name + '"]');
    conditionals.forEach(function (el) {
      var showVal = el.getAttribute('data-show-when-value');
      var invert  = el.getAttribute('data-show-when-not');
      var show;
      if (invert) show = value !== invert;
      else show = value === showVal;
      el.style.display = show ? '' : 'none';
    });
  };

  /* ── Checkbox binding ── */
  function _bindCheckboxes() {
    var checks = document.querySelectorAll('[data-checkbox]');
    checks.forEach(function (el) {
      var name = el.getAttribute('data-checkbox');
      var mark = el.parentElement ? el.parentElement.querySelector('.check-mark') : null;
      function _syncMark() {
        if (mark) mark.style.display = el.checked ? 'flex' : 'none';
      }
      if (GovBB.D[name]) { el.checked = true; _syncMark(); }
      el.addEventListener('change', function () {
        GovBB.D[name] = el.checked;
        _syncMark();
        var conditionals = document.querySelectorAll('[data-show-when-check="' + name + '"]');
        conditionals.forEach(function (c) {
          c.style.display = el.checked ? '' : 'none';
        });
      });
      // Run on init to restore state
      var conditionals = document.querySelectorAll('[data-show-when-check="' + name + '"]');
      conditionals.forEach(function (c) {
        c.style.display = GovBB.D[name] ? '' : 'none';
      });
    });
  }

  GovBB.toggleCheckbox = function (name) {
    GovBB.D[name] = !GovBB.D[name];
    GovBB.render();
  };

  /* ── Signature pads ── */
  function _initSignaturePads() {
    var canvases = document.querySelectorAll('canvas.sig-canvas');
    canvases.forEach(function (canvas) {
      var field = canvas.getAttribute('data-field') || 'signature';
      var ctx = canvas.getContext('2d');
      var drawing = false;
      var lastX = 0, lastY = 0;

      function getPos(e) {
        var r = canvas.getBoundingClientRect();
        var src = e.touches ? e.touches[0] : e;
        return { x: src.clientX - r.left, y: src.clientY - r.top };
      }
      function start(e) { e.preventDefault(); drawing = true; var p = getPos(e); lastX = p.x; lastY = p.y; }
      function draw(e) {
        e.preventDefault();
        if (!drawing) return;
        var p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        lastX = p.x; lastY = p.y;
        GovBB.D[field] = canvas.toDataURL();
      }
      function stop() { drawing = false; }

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stop);
      canvas.addEventListener('mouseleave', stop);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', stop);
    });

    // Clear buttons
    var clears = document.querySelectorAll('[data-clear-sig]');
    clears.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-clear-sig');
        var canvas = document.querySelector('canvas[data-field="' + target + '"]');
        if (canvas) {
          canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
          GovBB.D[target] = '';
        }
      });
    });
  }

  /* ── Validation helpers ── */
  GovBB.clearErrors = function () {
    var summary = document.getElementById('error-summary');
    if (summary) summary.remove();
    document.querySelectorAll('.field-error').forEach(function (e) { e.remove(); });
    document.querySelectorAll('.border-bb-red-00').forEach(function (el) {
      el.classList.remove('border-bb-red-00');
      el.classList.add('border-bb-black-00');
    });
  };

  GovBB.showFieldError = function (id, msg) {
    var input = document.getElementById(id) || document.querySelector('[data-field="' + id + '"]');
    if (!input) return;
    var wrap = input.closest('.input-wrap') || input.parentElement;
    if (wrap && wrap.classList.contains('border-bb-black-00')) {
      wrap.classList.remove('border-bb-black-00');
      wrap.classList.add('border-bb-red-00');
    }
    var err = document.createElement('span');
    err.className = 'field-error';
    err.id = 'err-' + id;
    err.textContent = msg;
    var container = input.closest('.field-group') || wrap.parentElement || input.parentElement;
    if (container) container.insertBefore(err, wrap || input);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'err-' + id);
  };

  GovBB.showErrors = function (errors) {
    GovBB.clearErrors();
    if (!errors || !errors.length) return;
    // Build summary
    var html = '<div id="error-summary" class="error-summary" role="alert" tabindex="-1"><h2>There is a problem</h2><ul>';
    errors.forEach(function (e) {
      html += '<li><a href="#' + e.id + '">' + _esc(e.msg) + '</a></li>';
    });
    html += '</ul></div>';
    var app = document.getElementById(_appEl);
    app.insertAdjacentHTML('afterbegin', html);
    document.getElementById('error-summary').focus();
    // Inline errors
    errors.forEach(function (e) { GovBB.showFieldError(e.id, e.msg); });
    // Update page title
    if (!document.title.startsWith('Error:')) document.title = 'Error: ' + document.title;
  };

  /* ── Template helpers ── */
  GovBB.backLink = function () {
    return '<a href="#" onclick="back();return false;" class="inline-flex items-center gap-xs outline-none underline-offset-2 underline hover:no-underline active:bg-bb-yellow-100 focus-visible:bg-bb-yellow-100 text-bb-teal-00 hover:text-bb-black-00 hover:bg-bb-teal-10 mb-m block">← Back</a>';
  };

  GovBB.caption = function (text) {
    return '<p class="border-bb-blue-40 border-l-4 py-xs pl-s text-bb-mid-grey-00 mb-s">' + _esc(text || _formName) + '</p>';
  };

  GovBB.continueBtn = function (label) {
    return '<div class="mt-8 flex gap-4"><button type="button" onclick="next()" class="' + GovBB.BTN_CLS + '">' + _esc(label || 'Continue') + '</button></div>';
  };

  GovBB.startBtn = function (label) {
    return '<div class="mt-8"><a href="#" onclick="next();return false;" class="' + GovBB.BTN_CLS + ' no-underline">' + _esc(label || 'Complete the online form') + '</a></div>';
  };

  GovBB.textField = function (id, label, opts) {
    opts = opts || {};
    var val = GovBB.D[id] || '';
    var hint = opts.hint ? '<p class="text-[1.25rem] leading-normal text-bb-mid-grey-00 mt-xs">' + _esc(opts.hint) + '</p>' : '';
    var style = opts.width ? ' style="max-width:' + opts.width + '"' : '';
    return '<div class="field-group flex flex-col gap-xs w-full items-start">' +
      '<label for="' + id + '" class="block text-[1.25rem] leading-normal font-bold text-bb-black-00">' + _esc(label) + '</label>' +
      hint +
      '<div class="input-wrap ' + GovBB.INPUT_WRAP_CLS + '"' + style + '>' +
        '<input type="text" id="' + id + '" name="' + id + '" data-field="' + id + '"' +
        (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
        (opts.maxlength ? ' maxlength="' + opts.maxlength + '"' : '') +
        (opts.placeholder ? ' placeholder="' + _esc(opts.placeholder) + '"' : '') +
        ' value="' + _esc(val) + '"' +
        ' class="' + GovBB.INPUT_CLS + '" />' +
      '</div>' +
    '</div>';
  };

  GovBB.emailField = function (id, label, opts) {
    opts = opts || {};
    var val = GovBB.D[id] || '';
    var hint = opts.hint ? '<p class="text-[1.25rem] leading-normal text-bb-mid-grey-00 mt-xs">' + _esc(opts.hint) + '</p>' : '';
    return '<div class="field-group flex flex-col gap-xs w-full items-start">' +
      '<label for="' + id + '" class="block text-[1.25rem] leading-normal font-bold text-bb-black-00">' + _esc(label) + '</label>' +
      hint +
      '<div class="input-wrap ' + GovBB.INPUT_WRAP_CLS + '">' +
        '<input type="email" id="' + id + '" name="' + id + '" data-field="' + id + '"' +
        ' value="' + _esc(val) + '"' +
        ' autocomplete="email" class="' + GovBB.INPUT_CLS + '" />' +
      '</div>' +
    '</div>';
  };

  GovBB.telField = function (id, label, opts) {
    opts = opts || {};
    var val = GovBB.D[id] || '';
    var hint = opts.hint ? '<p class="text-[1.25rem] leading-normal text-bb-mid-grey-00 mt-xs">' + _esc(opts.hint) + '</p>' : '';
    var style = opts.width ? ' style="max-width:' + opts.width + '"' : '';
    return '<div class="field-group flex flex-col gap-xs w-full items-start">' +
      '<label for="' + id + '" class="block text-[1.25rem] leading-normal font-bold text-bb-black-00">' + _esc(label) + '</label>' +
      hint +
      '<div class="input-wrap ' + GovBB.INPUT_WRAP_CLS + '"' + style + '>' +
        '<input type="tel" id="' + id + '" name="' + id + '" data-field="' + id + '"' +
        (opts.placeholder ? ' placeholder="' + _esc(opts.placeholder) + '"' : '') +
        ' value="' + _esc(val) + '"' +
        ' class="' + GovBB.INPUT_CLS + '" />' +
      '</div>' +
    '</div>';
  };

  GovBB.selectField = function (id, label, options, opts) {
    opts = opts || {};
    var val = GovBB.D[id] || '';
    var hint = opts.hint ? '<p class="text-[1.25rem] leading-normal text-bb-mid-grey-00 mt-xs">' + _esc(opts.hint) + '</p>' : '';
    var ops = '<option value="">Select one</option>';
    options.forEach(function (o) {
      var v = (typeof o === 'object') ? o.value : o;
      var l = (typeof o === 'object') ? o.label : o;
      ops += '<option value="' + _esc(v) + '"' + (val === v ? ' selected' : '') + '>' + _esc(l) + '</option>';
    });
    return '<div class="field-group flex flex-col gap-xs w-full items-start">' +
      '<label for="' + id + '" class="block text-[1.25rem] leading-normal font-bold text-bb-black-00">' + _esc(label) + '</label>' +
      hint +
      '<div class="input-wrap ' + GovBB.INPUT_WRAP_CLS + '">' +
        '<select id="' + id + '" name="' + id + '" data-field="' + id + '" class="' + GovBB.INPUT_CLS + ' cursor-pointer">' + ops + '</select>' +
      '</div>' +
    '</div>';
  };

  GovBB.textareaField = function (id, label, opts) {
    opts = opts || {};
    var val = GovBB.D[id] || '';
    var hint = opts.hint ? '<p class="text-[1.25rem] leading-normal text-bb-mid-grey-00 mt-xs">' + _esc(opts.hint) + '</p>' : '';
    return '<div class="field-group flex flex-col gap-xs w-full items-start">' +
      '<label for="' + id + '" class="block text-[1.25rem] leading-normal font-bold text-bb-black-00">' + _esc(label) + '</label>' +
      hint +
      '<div class="input-wrap ' + GovBB.INPUT_WRAP_CLS + ' flex-col p-0">' +
        '<textarea id="' + id + '" name="' + id + '" data-field="' + id + '"' +
        ' rows="' + (opts.rows || 5) + '"' +
        (opts.maxlength ? ' maxlength="' + opts.maxlength + '"' : '') +
        ' class="w-full p-s outline-none rounded-[inherit] resize-y">' + _esc(val) + '</textarea>' +
      '</div>' +
    '</div>';
  };

  GovBB.dateField = function (prefix, label, hint) {
    var day   = GovBB.D[prefix + '-day']   || '';
    var month = GovBB.D[prefix + '-month'] || '';
    var year  = GovBB.D[prefix + '-year']  || '';
    var hintHtml = hint ? '<p class="text-[1.25rem] leading-normal text-bb-mid-grey-00">' + _esc(hint) + '</p>' : '<p class="text-[1.25rem] leading-normal text-bb-mid-grey-00">For example, 27 03 2007</p>';
    return '<div class="field-group flex flex-col gap-xs w-full items-start">' +
      '<p class="text-[1.25rem] leading-normal font-bold text-bb-black-00">' + _esc(label) + '</p>' +
      hintHtml +
      '<div class="flex gap-s items-end flex-wrap">' +
        _datePart(prefix + '-day',   'Day',   '5rem',  day,   'numeric') +
        _datePart(prefix + '-month', 'Month', '5rem',  month, 'numeric') +
        _datePart(prefix + '-year',  'Year',  '7rem',  year,  'numeric') +
      '</div>' +
    '</div>';
  };

  function _datePart(id, lbl, w, val, mode) {
    return '<div class="flex flex-col gap-xs">' +
      '<label for="' + id + '" class="text-[1.25rem] leading-normal font-bold text-bb-black-00">' + lbl + '</label>' +
      '<div class="input-wrap relative inline-flex rounded-sm border-2 border-bb-black-00 items-center transition-all bg-bb-white-00 hover:shadow-form-hover focus-within:ring-4 focus-within:ring-bb-teal-100" style="width:' + w + '">' +
        '<input type="text" id="' + id + '" name="' + id + '" data-field="' + id + '" inputmode="' + mode + '" value="' + _esc(val) + '" class="w-full min-w-0 p-s outline-none rounded-[inherit]" />' +
      '</div>' +
    '</div>';
  }

  GovBB.radioGroup = function (name, label, options, opts) {
    opts = opts || {};
    var hint = opts.hint ? '<p class="text-[1.25rem] leading-normal text-bb-mid-grey-00">' + _esc(opts.hint) + '</p>' : '';
    var items = '';
    options.forEach(function (o) {
      var v = (typeof o === 'object') ? o.value : o;
      var l = (typeof o === 'object') ? o.label : o;
      items += '<div class="flex gap-5 items-center">' +
        '<button type="button" role="radio" aria-checked="false" data-name="' + name + '" data-value="' + _esc(v) + '"' +
        ' class="relative inline-flex size-12 shrink-0 items-center justify-center bg-bb-white-00 border-2 border-bb-black-00 rounded-full transition-all outline-none hover:cursor-pointer hover:shadow-form-hover focus-visible:border-bb-teal-00 focus-visible:ring-4 focus-visible:ring-bb-teal-100"></button>' +
        '<label class="text-[1.25rem] leading-normal text-bb-black-00 cursor-pointer">' + _esc(l) + '</label>' +
      '</div>';
    });
    return '<div class="field-group flex flex-col gap-s items-start w-full">' +
      '<p class="text-[1.25rem] leading-normal font-bold text-bb-black-00">' + _esc(label) + '</p>' +
      hint +
      items +
    '</div>';
  };

  GovBB.checkboxItem = function (name, label) {
    var checked = GovBB.D[name] ? ' checked' : '';
    return '<div class="flex gap-4 items-start">' +
      '<div class="relative inline-flex mt-1 size-8 shrink-0 border-2 border-bb-black-00 rounded-sm bg-bb-white-00 hover:shadow-form-hover">' +
        '<input type="checkbox" id="' + name + '" data-checkbox="' + name + '"' + checked +
        ' class="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />' +
        '<span class="check-mark hidden absolute inset-0 flex items-center justify-center pointer-events-none">' +
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' +
        '</span>' +
      '</div>' +
      '<label for="' + name + '" class="text-[1.25rem] leading-normal text-bb-black-00 cursor-pointer">' + label + '</label>' +
    '</div>';
  };

  GovBB.summaryRow = function (label, value, changeTo) {
    var changeLink = changeTo
      ? '<a href="#" onclick="nav(\'' + changeTo + '\');return false;" class="' + GovBB.LINK_CLS + ' text-[1rem]">Change<span class="sr-only"> ' + _esc(label) + '</span></a>'
      : '';
    return '<div class="summary-row">' +
      '<dt class="font-semibold text-[1rem]">' + _esc(label) + '</dt>' +
      '<dd class="text-[1rem]">' + _esc(value || '—') + '</dd>' +
      '<div>' + changeLink + '</div>' +
    '</div>';
  };

  /* ── Escape helper ── */
  function _esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ── Global aliases ── */
  global.GovBB  = GovBB;
  global.next   = function () { GovBB.next(); };
  global.back   = function () { GovBB.back(); };
  global.goBack = function () { GovBB.back(); };
  global.nav    = function (p) { GovBB.nav(p); };
  global.goTo   = function (p) { GovBB.nav(p); };

}(window));
