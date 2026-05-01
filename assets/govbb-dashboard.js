/**
 * govbb-dashboard.js
 *
 * Enhances the index.html homepage with:
 *   - A search bar to filter forms by name / description
 *   - An MDA (agency) dropdown filter
 *   - A service-type dropdown filter
 *
 * Works non-destructively: reads the existing .form-card DOM, injects
 * data-mda / data-type / data-status attributes, adds the filter UI into
 * the existing #filter-bar, and wraps the existing filterForms() function
 * so audience + new filters all work together.
 *
 * Load AFTER the page's inline script (i.e. at the bottom of <body>).
 */

(function (global) {
  'use strict';

  /* ─── Form metadata ──────────────────────────────────────────────────── *
   * Maps each prototype href to its MDA slug and service type.
   * The audience is already stored in data-audience on each card.
   * ────────────────────────────────────────────────────────────────────── */
  var FORM_META = {
    /* NIS */
    'prototypes/nisss-self-employment-registration.html': { mda: 'nis', type: 'registration' },
    'prototypes/nisss-employee-registration.html':        { mda: 'nis', type: 'registration' },
    'prototypes/nisss-direct-deposit.html':               { mda: 'nis', type: 'other'        },
    'prototypes/nisss-unemployment-benefit.html':         { mda: 'nis', type: 'claim'        },
    'prototypes/nisss-pensioner-declaration.html':        { mda: 'nis', type: 'declaration'  },
    'prototypes/nisss-self-employed-contributions.html':  { mda: 'nis', type: 'certificate'  },
    'prototypes/nisss-employer-registration.html':        { mda: 'nis', type: 'registration' },
    'prototypes/nisss-dp10.html':                         { mda: 'nis', type: 'other'        },
    'prototypes/nisss-termination-certificate.html':      { mda: 'nis', type: 'certificate'  },
    'prototypes/nisss-life-certificate.html':             { mda: 'nis', type: 'certificate'  },
    'prototypes/nisss-educational-status.html':           { mda: 'nis', type: 'other'        },
    'prototypes/nisss-old-age-pension.html':              { mda: 'nis', type: 'claim'        },
    /* BLA */
    'prototypes/bla-remove-building-boat.html':           { mda: 'bla', type: 'permit'       },
    /* SEA */
    'prototypes/nab-seniors-recreational-activities.html': { mda: 'sea', type: 'application' },
    'prototypes/nab-home-care-programme.html':             { mda: 'sea', type: 'application' },
    'prototypes/nab-community-elder-care.html':            { mda: 'sea', type: 'application' },
    /* CAIPO */
    'prototypes/caipo-company-name-search.html':               { mda: 'caipo', type: 'search'      },
    'prototypes/caipo-srl-name-search.html':                   { mda: 'caipo', type: 'search'      },
    'prototypes/caipo-business-names.html':                    { mda: 'caipo', type: 'registration' },
    'prototypes/caipo-financial-statements-exemption.html':    { mda: 'caipo', type: 'application' },
    'prototypes/caipo-articles-reincorporation.html':          { mda: 'caipo', type: 'application' },
    'prototypes/caipo-declaration-cap308.html':                { mda: 'caipo', type: 'declaration'  },
    'prototypes/caipo-declaration-nonprofit.html':             { mda: 'caipo', type: 'declaration'  },
    'prototypes/caipo-url-domain-declaration.html':            { mda: 'caipo', type: 'declaration'  },
    'prototypes/caipo-registered-agent.html':                  { mda: 'caipo', type: 'application' },
    'prototypes/caipo-geographical-agent-authorisation.html':  { mda: 'caipo', type: 'application' },
    'prototypes/caipo-caricom-complaints.html':                { mda: 'caipo', type: 'other'       },
    'prototypes/caipo-ibc-licence-application.html':           { mda: 'caipo', type: 'application' },
    /* CIPD (Immigration) */
    'prototypes/immd-caricom-indefinite-stay.html':   { mda: 'cipd', type: 'application' },
    'prototypes/immd-student-certificate-h2.html':    { mda: 'cipd', type: 'certificate'  },
    'prototypes/immd-student-eligibility-h1.html':    { mda: 'cipd', type: 'certificate'  },
    'prototypes/immd-citizenship-affidavit.html':     { mda: 'cipd', type: 'declaration'  },
    'prototypes/immd-commonwealth-citizenship.html':  { mda: 'cipd', type: 'registration' },
    'prototypes/immd-immigrant-status.html':          { mda: 'cipd', type: 'application' },
    'prototypes/immd-permanent-resident.html':        { mda: 'cipd', type: 'application' },
    'prototypes/immd-citizen-adult.html':             { mda: 'cipd', type: 'registration' },
    'prototypes/immd-citizen-marriage.html':          { mda: 'cipd', type: 'registration' },
    'prototypes/immd-citizen-under18.html':           { mda: 'cipd', type: 'registration' },
    'prototypes/immd-citizenship-descent.html':       { mda: 'cipd', type: 'certificate'  },
    'prototypes/immd-short-term-work-permit.html':    { mda: 'cipd', type: 'permit'       },
    'prototypes/immd-work-permit.html':               { mda: 'cipd', type: 'permit'       }
  };

  /* ─── Filter state ───────────────────────────────────────────────────── */
  var _state = { audience: 'all', search: '', mda: '', type: '', sort: '' };

  /* ─── Selectors ──────────────────────────────────────────────────────── */
  var PROTO_SECTION_SEL = 'section[data-section]:not([data-section="email-templates"])';

  /* ─── Apply data-* attributes to cards ──────────────────────────────── */
  function _applyMeta() {
    /* Prototype form cards — look up in FORM_META */
    document.querySelectorAll(PROTO_SECTION_SEL + ' .form-card').forEach(function (card) {
      var bodyLink = card.querySelector('a.form-card-body');
      var href = card.getAttribute('href') || (bodyLink && bodyLink.getAttribute('href'));
      var meta = FORM_META[href];
      if (meta) {
        card.setAttribute('data-mda',    meta.mda);
        card.setAttribute('data-type',   meta.type);
        card.setAttribute('data-status', 'alpha');
      }
    });

    /* Email template cards — derive data-mda from filename prefix */
    document.querySelectorAll('section[data-section="email-templates"] .form-card').forEach(function (card) {
      var href     = card.getAttribute('href') || '';
      var filename = href.split('/').pop();
      var mda;
      if      (filename.startsWith('nisss-'))  mda = 'nis';
      else if (filename.startsWith('nab-'))    mda = 'sea';
      else if (filename.startsWith('nhc-'))    mda = 'nhc';
      else if (filename.startsWith('bla-'))    mda = 'bla';
      else if (filename.startsWith('caipo-'))  mda = 'caipo';
      else if (filename.startsWith('immd-'))   mda = 'cipd';
      else                                     mda = 'other';
      card.setAttribute('data-mda', mda);
    });
  }

  /* ─── Filter email template cards (by mda + search, no audience filter) */
  function _filterEmailCards(mda, searchTerm) {
    var emailSection = document.querySelector('section[data-section="email-templates"]');
    if (!emailSection) return;

    emailSection.querySelectorAll('.form-card').forEach(function (card) {
      var cardMda  = card.getAttribute('data-mda') || '';
      var cardText = card.textContent.toLowerCase();
      var ok = (!mda || cardMda === mda) &&
               (!searchTerm || cardText.indexOf(searchTerm) !== -1);
      card.style.display = ok ? '' : 'none';
    });

    /* Show/hide the MDA and Applicant sub-sections */
    ['mda', 'applicant'].forEach(function (sub) {
      var heading = document.getElementById('email-sub-' + sub);
      var grid    = document.getElementById('email-grid-' + sub);
      if (!grid) return;
      var anyVisible = Array.from(grid.querySelectorAll('.form-card'))
                            .some(function (c) { return c.style.display !== 'none'; });
      grid.style.display    = anyVisible ? '' : 'none';
      if (heading) heading.style.display = anyVisible ? '' : 'none';
    });

    /* Hide the whole email section if nothing matches */
    var anyCard = Array.from(emailSection.querySelectorAll('.form-card'))
                       .some(function (c) { return c.style.display !== 'none'; });
    emailSection.style.display = anyCard ? '' : 'none';
  }

  /* ─── Combined filter ────────────────────────────────────────────────── */
  function _applyFilters() {
    var searchTerm = _state.search.toLowerCase().trim();
    var audience   = _state.audience;
    var mda        = _state.mda;
    var type       = _state.type;

    /* Email-templates-only mode: hide all form sections, filter email cards */
    if (audience === 'email-templates') {
      document.querySelectorAll(PROTO_SECTION_SEL).forEach(function (s) { s.style.display = 'none'; });
      _filterEmailCards(mda, searchTerm);
      _updateNoResults();
      return;
    }

    /* All other audience modes: filter form cards AND email template cards */
    _filterEmailCards(mda, searchTerm);

    document.querySelectorAll(PROTO_SECTION_SEL + ' .form-card').forEach(function (card) {
      var cardAudience = card.getAttribute('data-audience') || '';
      var cardMda      = card.getAttribute('data-mda')      || '';
      var cardType     = card.getAttribute('data-type')     || '';
      var cardText     = card.textContent.toLowerCase();

      var ok =
        (audience !== null && (audience === 'all' || cardAudience.indexOf(audience) !== -1)) &&
        (!mda        || cardMda  === mda)  &&
        (!type       || cardType === type) &&
        (!searchTerm || cardText.indexOf(searchTerm) !== -1);

      card.style.display = ok ? '' : 'none';
    });

    /* Hide / show sections based on visible cards */
    document.querySelectorAll(PROTO_SECTION_SEL).forEach(function (section) {
      var visible = Array.from(section.querySelectorAll('.form-card')).some(function (c) {
        return c.style.display !== 'none';
      });
      section.style.display = visible ? '' : 'none';
    });

    /* Sort cards within each section grid */
    _applySort();

    /* Show a "no results" message if everything is hidden */
    _updateNoResults();
  }

  /* ─── Sort cards within each section ────────────────────────────────── */
  function _cardTitle(card) {
    var el = card.querySelector('p.font-bold');
    return el ? el.textContent.trim().toLowerCase() : '';
  }

  function _applySort() {
    var sort = _state.sort;
    if (!sort) return; // default DOM order — no reordering needed

    document.querySelectorAll(PROTO_SECTION_SEL).forEach(function (section) {
      var grid = section.querySelector('.grid');
      if (!grid) return;

      var cards = Array.from(grid.querySelectorAll('.form-card'));
      cards.sort(function (a, b) {
        var ta = _cardTitle(a);
        var tb = _cardTitle(b);
        if (ta < tb) return sort === 'az' ? -1 :  1;
        if (ta > tb) return sort === 'az' ?  1 : -1;
        return 0;
      });

      /* Re-append in sorted order (moves existing nodes, no cloning) */
      cards.forEach(function (card) { grid.appendChild(card); });
    });
  }

  /* ─── No-results notice ──────────────────────────────────────────────── */
  function _updateNoResults() {
    var msg = document.getElementById('db-no-results');
    var allHidden = Array.from(
      document.querySelectorAll('section[data-section]')
    ).every(function (s) { return s.style.display === 'none'; });

    if (allHidden) {
      if (!msg) {
        msg = document.createElement('p');
        msg.id = 'db-no-results';
        msg.className = 'text-bb-mid-grey-00 text-[1.1rem] py-m';
        msg.textContent = 'No forms match your filters. Try different search terms or clear the filters.';
        var main = document.querySelector('main > div');
        if (main) main.appendChild(msg);
      }
      msg.style.display = '';
    } else if (msg) {
      msg.style.display = 'none';
    }
  }

  /* ─── Audience button styling ────────────────────────────────────────── */
  function _updateAudienceBtns(audience) {
    document.querySelectorAll('.filter-btn[data-filter]').forEach(function (btn) {
      var active = audience !== null && btn.getAttribute('data-filter') === audience;
      btn.style.background  = active ? 'var(--color-teal-00)' : 'var(--color-white-00)';
      btn.style.color       = active ? '#fff' : 'var(--color-black-00)';
      btn.style.borderColor = active ? 'var(--color-teal-00)' : 'var(--color-grey-00)';
    });
  }

  /* ─── Build the filter UI ────────────────────────────────────────────── */

  var SEL_CLS = [
    'border-2 border-bb-black-00 rounded-sm',
    'px-s py-1 text-[1rem]',
    'outline-none bg-bb-white-00 cursor-pointer',
    'focus:ring-4 focus:ring-bb-teal-100'
  ].join(' ');

  function _buildUI() {
    var bar = document.getElementById('filter-bar');
    if (!bar) return;

    var container = document.createElement('div');
    container.id = 'db-filter-row';
    container.className = 'w-full mt-2 pt-3 border-t border-bb-grey-00';

    /* Row 1: search (full width) */
    var searchRow = document.createElement('div');
    searchRow.innerHTML =
      '<input type="search" id="db-search" placeholder="Search forms…"' +
      '  class="border-2 border-bb-black-00 rounded-sm px-s py-1 text-[1rem] outline-none bg-bb-white-00 focus:ring-4 focus:ring-bb-teal-100"' +
      '  style="width:100%">';
    container.appendChild(searchRow);

    /* Row 2: agency + service type + sort + clear */
    var dropRow = document.createElement('div');
    dropRow.style.cssText = 'display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.5rem';
    dropRow.innerHTML =
      '<select id="db-mda" class="' + SEL_CLS + '">' +
      '  <option value="">All agencies</option>' +
      '  <option value="nis">NIS</option>' +
      '  <option value="bla">BLA</option>' +
      '  <option value="sea">SEA</option>' +
      '  <option value="nhc">NHC</option>' +
      '  <option value="caipo">CAIPO</option>' +
      '  <option value="cipd">CIPD (Immigration)</option>' +
      '</select>' +

      '<select id="db-type" class="' + SEL_CLS + '">' +
      '  <option value="">All service types</option>' +
      '  <option value="application">Application</option>' +
      '  <option value="certificate">Certificate</option>' +
      '  <option value="claim">Claim</option>' +
      '  <option value="declaration">Declaration</option>' +
      '  <option value="other">Other</option>' +
      '  <option value="permit">Permit</option>' +
      '  <option value="registration">Registration</option>' +
      '  <option value="search">Search</option>' +
      '</select>' +

      '<select id="db-sort" class="' + SEL_CLS + '">' +
      '  <option value="">Sort: Default</option>' +
      '  <option value="az">A → Z</option>' +
      '  <option value="za">Z → A</option>' +
      '</select>' +

      '<button id="db-clear" style="display:none"' +
      '  class="text-[0.9rem] text-bb-teal-00 underline hover:no-underline outline-none">' +
      'Clear</button>';

    container.appendChild(dropRow);
    bar.appendChild(container);

    /* Wire events */
    document.getElementById('db-search').addEventListener('input', function () {
      _state.search = this.value;
      _toggleClear();
      _applyFilters();
    });
    document.getElementById('db-mda').addEventListener('change', function () {
      _state.mda = this.value;
      _toggleClear();
      _applyFilters();
    });
    document.getElementById('db-type').addEventListener('change', function () {
      _state.type = this.value;
      _toggleClear();
      _applyFilters();
    });
    document.getElementById('db-sort').addEventListener('change', function () {
      _state.sort = this.value;
      _toggleClear();
      _applyFilters();
    });

    /* Clear resets all dropdowns and audience back to default */
    document.getElementById('db-clear').addEventListener('click', function () {
      _state.search   = '';
      _state.mda      = '';
      _state.type     = '';
      _state.sort     = '';
      _state.audience = 'all';
      document.getElementById('db-search').value = '';
      document.getElementById('db-mda').value    = '';
      document.getElementById('db-type').value   = '';
      document.getElementById('db-sort').value   = '';
      _updateAudienceBtns('all');
      _toggleClear();
      _applyFilters();
    });
  }

  function _toggleClear() {
    var btn = document.getElementById('db-clear');
    if (!btn) return;
    btn.style.display = (_state.search || _state.mda || _state.type || _state.sort) ? '' : 'none';
  }

  /* ─── Override filterForms() ─────────────────────────────────────────── *
   * The existing filterForms() does its own card-show/hide. We replace it
   * with a version that updates _state and calls our combined filter.
   * ────────────────────────────────────────────────────────────────────── */
  global.filterForms = function (audience) {
    /* Clicking the active audience button deselects it → null (show all, nothing highlighted) */
    var newAudience = (_state.audience === audience) ? null : audience;
    _state.audience = newAudience;
    _updateAudienceBtns(newAudience);
    _applyFilters();
  };

  /* ─── Init ───────────────────────────────────────────────────────────── */
  function _init() {
    _applyMeta();
    _buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ─── Expose ─────────────────────────────────────────────────────────── */
  global.GovBBDashboard = { applyFilters: _applyFilters };

}(window));
