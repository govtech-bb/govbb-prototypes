/**
 * govbb-schema-bridge.js
 *
 * Loads a form's JSON schema and exposes a validation helper that the
 * prototype's validate() function can call instead of hardcoded field checks.
 *
 * This is a library — it does not automatically intercept anything.
 * The prototype decides when to call GovBBSchema.validatePage().
 *
 * Toggle compatibility is automatic: since GovBBSchema.validatePage() is
 * called FROM the prototype's validate(), and the validation toggle already
 * bypasses the entire validate() call, schema validation is bypassed too.
 *
 * Usage in a prototype:
 *
 *   // 1. Load after govbb-framework.js:
 *   <script src="../assets/govbb-schema-bridge.js"></script>
 *
 *   // 2. In the form script, before GovBB.init():
 *   GovBBSchema.load('../schemas/my-form.json');
 *
 *   // 3. In validate():
 *   function validate(pageId) {
 *     var errors = GovBBSchema.validatePage(pageId);
 *     // ... add custom cross-field rules below ...
 *     return errors;
 *   }
 */

(function (global) {
  'use strict';

  /* ─── Internal state ─────────────────────────────────────────────────── */

  var _schema        = null;
  var _shared        = {};   // cache: ref path → resolved section JSON
  var _baseUrl       = '';   // directory containing the schema file
  var _ready         = false;

  /* ─── Public API ─────────────────────────────────────────────────────── */

  var GovBBSchema = {

    /** True once the schema (and all $ref sections) have finished loading. */
    isReady: false,

    /** The raw parsed schema object. Null until load() resolves. */
    schema: null,

    /**
     * Fetch and cache the schema at `url`.
     * Automatically fetches any shared/$ref sections referenced inside it.
     *
     * @param {string} url  Relative or absolute URL to the form's JSON schema.
     */
    load: function (url) {
      // Derive base directory so $ref paths resolve correctly
      _baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

      fetch(url)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (schema) {
          _schema             = schema;
          GovBBSchema.schema  = schema;
          return _resolveRefs(schema);
        })
        .then(function () {
          _ready              = true;
          GovBBSchema.isReady = true;
        })
        .catch(function (err) {
          console.warn('[GovBBSchema] Could not load schema:', err);
        });
    },

    /**
     * Validate all fields declared for `pageId` in the schema.
     * Returns an array of { id, msg } error objects (empty array = no errors).
     *
     * Returns [] immediately if:
     *  - The schema is not loaded yet (safe — falls back to existing behaviour)
     *  - The page has no field declarations in the schema
     *  - The validation toggle is currently OFF
     *
     * @param  {string} pageId
     * @returns {{ id: string, msg: string }[]}
     */
    validatePage: function (pageId) {
      // Respect the validation toggle
      if (global.GovBBToggle && !global.GovBBToggle.isEnabled()) return [];

      // Schema not loaded or page not declared → safe no-op
      if (!_ready || !_schema || !_schema.pages) return [];
      var page = _schema.pages[pageId];
      if (!page || !page.fields) return [];

      var errors = [];
      var D      = (global.GovBB && global.GovBB.D) ? global.GovBB.D : {};

      // Validate each declared field (resolving $ref sections inline)
      _eachField(page.fields, function (field) {
        _checkField(field, D, errors);
      });

      // Cross-field rules declared on shared fieldsets (e.g. "at least one phone")
      _eachFieldset(page.fields, function (section) {
        if (!section.crossFieldValidation) return;
        section.crossFieldValidation.forEach(function (rule) {
          if (rule.rule === 'at-least-one') {
            var anyFilled = rule.fields.some(function (id) {
              var v = D[id];
              return v !== undefined && v !== null && String(v).trim() !== '';
            });
            if (!anyFilled) {
              errors.push({ id: rule.fields[0], msg: rule.message });
            }
          }
        });
      });

      return errors;
    },

    /**
     * Look up a single field definition by its id, across all pages.
     * Useful for reading hint text, validation rules, etc. at runtime.
     *
     * @param  {string} id  Field id (e.g. 'nis-number')
     * @returns {object|null}
     */
    getField: function (id) {
      if (!_schema || !_schema.pages) return null;
      var result = null;
      Object.keys(_schema.pages).forEach(function (pageId) {
        if (result) return;
        var page = _schema.pages[pageId];
        if (!page.fields) return;
        _eachField(page.fields, function (f) {
          if (f.id === id) result = f;
        });
      });
      return result;
    },

    /**
     * Returns the dynamic flow for this form after applying all
     * conditionalLogic rules from the schema.
     *
     * Use as `getFlow` in GovBB.init() to enable schema-driven branching:
     *
     *   GovBB.init({
     *     ...
     *     getFlow: GovBBSchema.computeFlow,
     *   });
     *
     * @returns {string[]}  Ordered array of page IDs
     */
    computeFlow: function () {
      if (!_schema) return [];
      var flow = (_schema.flow || []).slice();
      var D    = (global.GovBB && global.GovBB.D) ? global.GovBB.D : {};

      if (!_schema.conditionalLogic) return flow;

      _schema.conditionalLogic.forEach(function (rule) {
        if (!_evalCondition(rule.when, D)) return;

        var action = rule.then.action;

        if (action === 'insert_page') {
          var afterIdx = flow.indexOf(rule.then.after);
          if (afterIdx !== -1 && flow.indexOf(rule.then.page) === -1) {
            flow.splice(afterIdx + 1, 0, rule.then.page);
          }
        }

        if (action === 'skip_page') {
          var skipIdx = flow.indexOf(rule.then.page);
          if (skipIdx !== -1) flow.splice(skipIdx, 1);
        }
      });

      return flow;
    }

  };

  /* ─── Private helpers ─────────────────────────────────────────────────── */

  /** Fetch all $ref sections referenced in the schema pages. */
  function _resolveRefs(schema) {
    var pending = [];

    Object.keys(schema.pages || {}).forEach(function (pageId) {
      var page = schema.pages[pageId];
      if (!page.fields) return;
      page.fields.forEach(function (f) {
        if (f.$ref && !_shared[f.$ref]) {
          _shared[f.$ref] = null; // mark as in-flight to avoid duplicate fetches
          pending.push(
            fetch(_baseUrl + f.$ref)
              .then(function (r) { return r.json(); })
              .then(function (data) { _shared[f.$ref] = data; })
              .catch(function (err) {
                console.warn('[GovBBSchema] Could not load shared section:', f.$ref, err);
              })
          );
        }
      });
    });

    return Promise.all(pending);
  }

  /**
   * Iterate over each resolved field in a fields array.
   * Transparently expands $ref entries into their individual fields.
   */
  function _eachField(fields, cb) {
    fields.forEach(function (f) {
      if (f.$ref) {
        var section = _shared[f.$ref];
        if (section && section.fields) {
          section.fields.forEach(function (sf) { cb(sf); });
        }
      } else if (f.type !== 'fieldset') {
        cb(f);
      }
    });
  }

  /** Iterate over each resolved fieldset (for cross-field rules). */
  function _eachFieldset(fields, cb) {
    fields.forEach(function (f) {
      if (f.$ref) {
        var section = _shared[f.$ref];
        if (section) cb(section);
      }
    });
  }

  /** Run all declared validation rules for a single field. */
  function _checkField(field, D, errors) {
    var raw    = D[field.id];
    var strVal = (raw !== undefined && raw !== null) ? String(raw).trim() : '';

    // Required
    if (field.required && strVal === '') {
      var verb = (field.type === 'radio' || field.type === 'select') ? 'Select' : 'Enter';
      var tail = (field.type === 'radio' || field.type === 'select')
        ? 'an option'
        : ('your ' + field.label.toLowerCase());
      errors.push({ id: field.id, msg: field.label + ' \u2013 ' + verb + ' ' + tail });
      return; // no further checks if the value is missing
    }

    if (strVal === '') return; // optional + empty → nothing to check

    var v = field.validation;
    if (!v) return;

    // Pattern
    if (v.pattern) {
      try {
        if (!new RegExp(v.pattern).test(strVal)) {
          errors.push({
            id:  field.id,
            msg: field.label + ' – ' + (v.patternMessage || ('Enter a valid ' + field.label.toLowerCase()))
          });
          return;
        }
      } catch (e) {
        console.warn('[GovBBSchema] Invalid pattern for field', field.id, e);
      }
    }

    // Max length
    if (v.maxLength && strVal.length > v.maxLength) {
      errors.push({
        id:  field.id,
        msg: field.label + ' – Must be ' + v.maxLength + ' characters or fewer'
      });
    }

    // Date: not in future
    if (field.type === 'date' && v.notFuture) {
      var day   = parseInt(D[field.id + '-day'],   10);
      var month = parseInt(D[field.id + '-month'], 10);
      var year  = parseInt(D[field.id + '-year'],  10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        var entered = new Date(year, month - 1, day);
        if (entered > new Date()) {
          errors.push({
            id:  field.id + '-day',
            msg: field.label + ' – Date must not be in the future'
          });
        }
      }
    }
  }

  /** Evaluate a single when-condition against the current form data. */
  function _evalCondition(when, D) {
    var fieldVal = D[when.field];
    switch (when.operator) {
      case 'equals':     return fieldVal === when.value;
      case 'not_equals': return fieldVal !== when.value;
      case 'empty':      return !fieldVal;
      case 'not_empty':  return !!fieldVal;
      case 'in':         return Array.isArray(when.value) && when.value.indexOf(fieldVal) !== -1;
      case 'not_in':     return Array.isArray(when.value) && when.value.indexOf(fieldVal) === -1;
      default:           return false;
    }
  }

  /* ─── Expose ─────────────────────────────────────────────────────────── */
  global.GovBBSchema = GovBBSchema;

}(window));
