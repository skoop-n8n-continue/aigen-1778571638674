'use strict';

/**
 * Skoop Live Preview Runtime
 *
 * Walks data-bind-* attributes on the page and applies values from the data
 * document. Listens for postMessage updates from the parent configurator so
 * unsaved changes can be previewed without reloading the iframe.
 *
 * Bindings supported (path is dot-separated against `sections`):
 *
 *   data-bind-text="storefront.store_name"           → element.textContent
 *   data-bind-html="about_page.about_body"           → element.innerHTML (newlines → <br>)
 *   data-bind-currency="products.0.price"            → "$X.XX"
 *   data-bind-number="app_settings.idle_timeout"     → number formatted
 *   data-bind-percent="products.0.discount"          → "X%"
 *   data-bind-src="storefront.logo"                  → src on img/video/source
 *   data-bind-href="storefront.website_url"          → href on a/link
 *   data-bind-bg-image="hero.background"             → style.backgroundImage url(...)
 *   data-bind-color="app_settings.primary_color"     → style.color
 *   data-bind-bg-color="app_settings.background"     → style.backgroundColor
 *   data-bind-border-color="app_settings.accent"     → style.borderColor
 *   data-bind-show="app_settings.show_prices"        → hidden attribute when false
 *   data-bind-hide="app_settings.compact_mode"       → hidden attribute when true
 *   data-bind-class="app_settings.nav_style"         → adds class "<lastKey>-<value>"
 *   data-bind-attr="aria-label:storefront.store_name" → arbitrary attr (key:path[, key:path])
 *   data-bind-style="--brand-color:brands.0.accent"   → CSS prop or --custom-prop (key:path[, key:path])
 *
 * Color fields (type: "color") on non-collection sections also auto-populate
 * CSS custom properties on :root, named "--<field_key_kebab_case>". This means
 * any color in data.json becomes available in CSS as var(--field-key) without
 * requiring an explicit binding. Per-collection-item CSS variables (a brand's
 * accent color, a category's tint) need data-bind-style to live-update because
 * :root variables can't represent per-item values.
 */

(function () {
  if (window.SkoopLive) return; // idempotent — only one runtime per page

  // Resolve a dot-separated path against the sections object. Handles typed
  // field unwrapping (returns .value when the resolved node is a typed field)
  // and collection wrappers (drills into .value array on numeric keys).
  function readPath(sections, pathStr) {
    if (!sections || !pathStr) return undefined;
    var parts = String(pathStr).split('.');
    var obj = sections;
    for (var i = 0; i < parts.length; i++) {
      if (obj === null || obj === undefined) return undefined;
      var key = parts[i];
      // Drill into a typed collection's .value array
      if (obj && obj.type === 'collection' && Array.isArray(obj.value)) {
        if (!isNaN(key)) obj = obj.value[parseInt(key, 10)];
        else obj = obj.value[key];
        continue;
      }
      // Drill into raw arrays
      if (Array.isArray(obj) && !isNaN(key)) {
        obj = obj[parseInt(key, 10)];
        continue;
      }
      obj = obj[key];
    }
    // Unwrap typed field nodes to their .value
    if (obj && typeof obj === 'object' && 'value' in obj && 'type' in obj) {
      return obj.value;
    }
    return obj;
  }

  function kebab(str) {
    return String(str).replace(/_/g, '-');
  }

  function applyColorVariables(sections) {
    if (!sections || typeof sections !== 'object') return;
    var root = document.documentElement;
    for (var sectionKey in sections) {
      var section = sections[sectionKey];
      if (!section || typeof section !== 'object') continue;
      // Skip collections — color vars come from non-collection sections only
      if (section.type === 'collection') continue;
      for (var fieldKey in section) {
        var field = section[fieldKey];
        if (field && field.type === 'color' && typeof field.value === 'string') {
          root.style.setProperty('--' + kebab(fieldKey), field.value);
        }
      }
    }
  }

  function setSrc(el, value) {
    if (typeof value !== 'string' || !value) return;
    var tag = el.tagName;
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'SOURCE' || tag === 'AUDIO' || tag === 'IFRAME') {
      if (el.src !== value) el.src = value;
    } else {
      el.setAttribute('src', value);
    }
  }

  function applyBindings(sections) {
    if (!sections) return;

    applyColorVariables(sections);

    var nodeList;

    // Text content
    nodeList = document.querySelectorAll('[data-bind-text]');
    for (var i = 0; i < nodeList.length; i++) {
      var el = nodeList[i];
      var v = readPath(sections, el.getAttribute('data-bind-text'));
      if (v !== undefined && v !== null) el.textContent = String(v);
    }

    // Inner HTML (textarea / multiline) — newlines become <br>
    nodeList = document.querySelectorAll('[data-bind-html]');
    for (var i2 = 0; i2 < nodeList.length; i2++) {
      var el2 = nodeList[i2];
      var v2 = readPath(sections, el2.getAttribute('data-bind-html'));
      if (v2 !== undefined && v2 !== null) {
        var safe = String(v2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        el2.innerHTML = safe.replace(/\n/g, '<br>');
      }
    }

    // Currency formatting
    nodeList = document.querySelectorAll('[data-bind-currency]');
    for (var i3 = 0; i3 < nodeList.length; i3++) {
      var el3 = nodeList[i3];
      var v3 = readPath(sections, el3.getAttribute('data-bind-currency'));
      if (typeof v3 === 'number') el3.textContent = '$' + v3.toFixed(2);
    }

    // Plain number
    nodeList = document.querySelectorAll('[data-bind-number]');
    for (var i4 = 0; i4 < nodeList.length; i4++) {
      var el4 = nodeList[i4];
      var v4 = readPath(sections, el4.getAttribute('data-bind-number'));
      if (typeof v4 === 'number') el4.textContent = String(v4);
    }

    // Percentage
    nodeList = document.querySelectorAll('[data-bind-percent]');
    for (var i5 = 0; i5 < nodeList.length; i5++) {
      var el5 = nodeList[i5];
      var v5 = readPath(sections, el5.getAttribute('data-bind-percent'));
      if (typeof v5 === 'number') el5.textContent = v5 + '%';
    }

    // src
    nodeList = document.querySelectorAll('[data-bind-src]');
    for (var i6 = 0; i6 < nodeList.length; i6++) {
      var el6 = nodeList[i6];
      setSrc(el6, readPath(sections, el6.getAttribute('data-bind-src')));
    }

    // href
    nodeList = document.querySelectorAll('[data-bind-href]');
    for (var i7 = 0; i7 < nodeList.length; i7++) {
      var el7 = nodeList[i7];
      var v7 = readPath(sections, el7.getAttribute('data-bind-href'));
      if (typeof v7 === 'string') el7.setAttribute('href', v7);
    }

    // background-image
    nodeList = document.querySelectorAll('[data-bind-bg-image]');
    for (var i8 = 0; i8 < nodeList.length; i8++) {
      var el8 = nodeList[i8];
      var v8 = readPath(sections, el8.getAttribute('data-bind-bg-image'));
      if (typeof v8 === 'string' && v8) el8.style.backgroundImage = "url('" + v8 + "')";
    }

    // color
    nodeList = document.querySelectorAll('[data-bind-color]');
    for (var i9 = 0; i9 < nodeList.length; i9++) {
      var el9 = nodeList[i9];
      var v9 = readPath(sections, el9.getAttribute('data-bind-color'));
      if (typeof v9 === 'string') el9.style.color = v9;
    }

    // background-color
    nodeList = document.querySelectorAll('[data-bind-bg-color]');
    for (var iA = 0; iA < nodeList.length; iA++) {
      var elA = nodeList[iA];
      var vA = readPath(sections, elA.getAttribute('data-bind-bg-color'));
      if (typeof vA === 'string') elA.style.backgroundColor = vA;
    }

    // border-color
    nodeList = document.querySelectorAll('[data-bind-border-color]');
    for (var iB = 0; iB < nodeList.length; iB++) {
      var elB = nodeList[iB];
      var vB = readPath(sections, elB.getAttribute('data-bind-border-color'));
      if (typeof vB === 'string') elB.style.borderColor = vB;
    }

    // show — hidden when value is exactly false
    nodeList = document.querySelectorAll('[data-bind-show]');
    for (var iC = 0; iC < nodeList.length; iC++) {
      var elC = nodeList[iC];
      var vC = readPath(sections, elC.getAttribute('data-bind-show'));
      if (vC === false) elC.setAttribute('hidden', '');
      else elC.removeAttribute('hidden');
    }

    // hide — hidden when value is exactly true
    nodeList = document.querySelectorAll('[data-bind-hide]');
    for (var iD = 0; iD < nodeList.length; iD++) {
      var elD = nodeList[iD];
      var vD = readPath(sections, elD.getAttribute('data-bind-hide'));
      if (vD === true) elD.setAttribute('hidden', '');
      else elD.removeAttribute('hidden');
    }

    // class — adds class "<lastKey>-<value>", removing previous matching variants
    nodeList = document.querySelectorAll('[data-bind-class]');
    for (var iE = 0; iE < nodeList.length; iE++) {
      var elE = nodeList[iE];
      var pathE = elE.getAttribute('data-bind-class');
      var vE = readPath(sections, pathE);
      if (typeof vE === 'string' && vE) {
        var prefix = (elE.getAttribute('data-bind-class-prefix') || pathE.split('.').pop()) + '-';
        var existing = Array.prototype.slice.call(elE.classList);
        for (var iEx = 0; iEx < existing.length; iEx++) {
          if (existing[iEx].indexOf(prefix) === 0) elE.classList.remove(existing[iEx]);
        }
        elE.classList.add(prefix + vE);
      }
    }

    // arbitrary attributes — "key:path, key2:path2"
    nodeList = document.querySelectorAll('[data-bind-attr]');
    for (var iF = 0; iF < nodeList.length; iF++) {
      var elF = nodeList[iF];
      var spec = elF.getAttribute('data-bind-attr') || '';
      var pairs = spec.split(',');
      for (var iFp = 0; iFp < pairs.length; iFp++) {
        var pair = pairs[iFp].trim();
        if (!pair) continue;
        var colon = pair.indexOf(':');
        if (colon < 0) continue;
        var attrName = pair.slice(0, colon).trim();
        var attrPath = pair.slice(colon + 1).trim();
        var attrVal = readPath(sections, attrPath);
        if (typeof attrVal !== 'undefined' && attrVal !== null) {
          elF.setAttribute(attrName, String(attrVal));
        }
      }
    }

    // Inline styles (incl. CSS custom properties) — "prop:path, prop:path"
    // The most common need is per-element CSS variables for theming, e.g.
    // <div data-bind-style="--brand-color:brands.N.accent_color">. The
    // runtime uses element.style.setProperty which works for both standard
    // CSS properties (color, padding, border-radius, ...) and custom
    // properties (--anything). This is what makes per-card brand theming
    // live-update — without it, top-level :root variables update but per-
    // item ones do not, because :root can only hold a single value per name.
    nodeList = document.querySelectorAll('[data-bind-style]');
    for (var iG = 0; iG < nodeList.length; iG++) {
      var elG = nodeList[iG];
      var styleSpec = elG.getAttribute('data-bind-style') || '';
      var stylePairs = styleSpec.split(',');
      for (var iGp = 0; iGp < stylePairs.length; iGp++) {
        var sPair = stylePairs[iGp].trim();
        if (!sPair) continue;
        var sColon = sPair.indexOf(':');
        if (sColon < 0) continue;
        var propName = sPair.slice(0, sColon).trim();
        var propPath = sPair.slice(sColon + 1).trim();
        var propVal = readPath(sections, propPath);
        if (typeof propVal === 'undefined' || propVal === null) continue;
        try {
          elG.style.setProperty(propName, String(propVal));
        } catch (_) { /* invalid property names silently ignored */ }
      }
    }
  }

  // Public API
  window.SkoopLive = {
    apply: function (data) {
      try {
        var sections = data && data.sections ? data.sections : data;
        applyBindings(sections);
      } catch (err) {
        console.warn('[skoop-live] apply failed:', err);
      }
    },
  };

  // Apply on initial page load — runs after the page's own init() has built
  // the DOM. Listens for DOMContentLoaded so it doesn't matter where this
  // script is included relative to the page's main script.
  function applyFromInjectedOrFetch() {
    if (window.__skoop_dirty_data__) {
      window.SkoopLive.apply(window.__skoop_dirty_data__);
      return;
    }
    // The page's own init() already fetched and applied data.json. We don't
    // re-fetch here — bindings are applied on the existing DOM that init()
    // built, using the same data the page already loaded. To do that we
    // intercept the fetch and stash the result, OR we just wait for the
    // page to set window.__skoop_data__ if it chooses to expose it. Most
    // apps won't, so we no-op here on initial load — bindings are inert
    // until the configurator sends a postMessage update.
    //
    // The only critical case is when dirty data is already set (preview
    // reload via srcdoc), and that's handled above.
  }

  // Run after the page's main script has had a chance to build the DOM
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(applyFromInjectedOrFetch, 0);
  } else {
    document.addEventListener('DOMContentLoaded', applyFromInjectedOrFetch);
  }

  // Listen for postMessage updates from the parent configurator
  window.addEventListener('message', function (e) {
    if (!e || !e.data || typeof e.data !== 'object') return;
    if (e.data.type !== 'skoop:config_update') return;
    var payload = e.data.data;
    if (!payload) return;
    window.SkoopLive.apply(payload);
  });
})();
