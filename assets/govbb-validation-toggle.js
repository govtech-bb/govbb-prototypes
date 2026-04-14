/**
 * govbb-validation-toggle.js
 *
 * Adds a floating toggle button that lets you switch client-side validation
 * ON or OFF without modifying any prototype code.
 *
 * When OFF: clicking Continue skips all validation and advances the form.
 * When ON:  normal behaviour — validation runs as usual.
 *
 * Load AFTER govbb-framework.js:
 *   <script src="/assets/govbb-framework.js"></script>
 *   <script src="/assets/govbb-validation-toggle.js"></script>
 *
 * Optionally seed the initial state from the form schema:
 *   GovBBToggle.setEnabled(false);  // call before GovBB.init()
 */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'govbb_validation_enabled';

  /* ─── State ─────────────────────────────────────────────────────────── */

  // Read persisted state; default to ON if nothing stored
  var _enabled = sessionStorage.getItem(STORAGE_KEY) !== 'false';

  /* ─── Patch GovBB.next ───────────────────────────────────────────────
   *
   * When validation is OFF we replicate the navigation logic using only
   * public framework methods (getFlow, getCurrentIndex, nav, clearErrors).
   * This avoids touching any private variables inside the framework.
   */
  var _origNext = GovBB.next;

  GovBB.next = function () {
    if (_enabled) {
      // Normal path — validation runs as usual
      return _origNext.call(GovBB);
    }

    // Bypass path — clear any existing errors and just advance
    GovBB.clearErrors();

    var flow    = GovBB.getFlow();
    var nextIdx = GovBB.getCurrentIndex() + 1;

    if (nextIdx >= flow.length) return;

    // nav() handles rendering for all page types including confirmation.
    // The confirmation page has a client-side reference fallback so it
    // renders correctly even without an API round-trip.
    GovBB.nav(flow[nextIdx]);
  };

  /* ─── Public API ─────────────────────────────────────────────────────── */

  var Toggle = {

    /** Returns true if validation is currently enabled. */
    isEnabled: function () { return _enabled; },

    /** Turn validation on. */
    enable: function () {
      _enabled = true;
      sessionStorage.setItem(STORAGE_KEY, 'true');
      _updateButton();
    },

    /** Turn validation off. */
    disable: function () {
      _enabled = false;
      sessionStorage.setItem(STORAGE_KEY, 'false');
      _updateButton();
    },

    /** Flip the current state. */
    toggle: function () {
      _enabled ? Toggle.disable() : Toggle.enable();
    },

    /**
     * Seed the initial state from a schema's validation object.
     * Call this before GovBB.init() if you want the schema to control
     * the default.
     *
     * Example:
     *   GovBBToggle.setEnabled(schema.validation.enabled);
     */
    setEnabled: function (bool) {
      bool ? Toggle.enable() : Toggle.disable();
    }
  };

  /* ─── Floating button ────────────────────────────────────────────────── */

  function _buildButton() {
    var btn = document.createElement('button');
    btn.id = 'govbb-toggle-btn';
    btn.setAttribute('aria-label', 'Toggle form validation');
    btn.setAttribute('title',      'Toggle form validation');
    btn.style.cssText = [
      'position:fixed',
      'bottom:1.5rem',
      'right:1.5rem',
      'z-index:9999',
      'display:inline-flex',
      'align-items:center',
      'gap:0.5rem',
      'padding:0.5rem 0.875rem',
      'border-radius:9999px',
      'border:2px solid transparent',
      'font-family:inherit',
      'font-size:0.875rem',
      'font-weight:600',
      'line-height:1.4',
      'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
      'transition:background 0.15s, color 0.15s, border-color 0.15s'
    ].join(';');

    btn.addEventListener('click', function () { Toggle.toggle(); });
    document.body.appendChild(btn);
    return btn;
  }

  function _updateButton() {
    var btn = document.getElementById('govbb-toggle-btn');
    if (!btn) return;

    if (_enabled) {
      btn.style.background    = '#00654a';   // bb-green-00 — validation is active
      btn.style.color         = '#ffffff';
      btn.style.borderColor   = '#00654a';
      btn.innerHTML           = _icon('check') + 'Validation ON';
    } else {
      btn.style.background    = '#fff9e9';   // bb-yellow-10 — validation is bypassed
      btn.style.color         = '#000000';
      btn.style.borderColor   = '#e8a833';   // bb-yellow-00
      btn.innerHTML           = _icon('cross') + 'Validation OFF';
    }
  }

  function _icon(type) {
    if (type === 'check') {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }

  /* ─── Init ───────────────────────────────────────────────────────────── */

  function _init() {
    var btn = _buildButton();  // eslint-disable-line no-unused-vars
    _updateButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ─── Expose ─────────────────────────────────────────────────────────── */
  global.GovBBToggle = Toggle;

}(window));
