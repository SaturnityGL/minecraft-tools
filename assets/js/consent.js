/**
 * Saturnity Consent Manager (consent.js)
 * Google Consent Mode v2 + cookie banner
 * Load in <head> with defer — before GTM and AdSense scripts.
 */

(function () {
  'use strict';

  // ─── Consent Mode v2 default (denied) ─────────────────────────────────────
  // Must run synchronously on script parse, before any ad/analytics script.
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('consent', 'default', {
    ad_storage:          'denied',
    ad_user_data:        'denied',
    ad_personalization:  'denied',
    analytics_storage:   'denied',
    wait_for_update:     500
  });

  // ─── Constants ────────────────────────────────────────────────────────────
  var STORAGE_KEY  = 'sat_consent_v1';
  var BANNER_ID    = 'sat-consent-banner';
  var PRIVACY_URL  = '/privacy-policy/';

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function readChoice() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveChoice(analytics, ads) {
    var choice = { analytics: !!analytics, ads: !!ads, ts: Date.now() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); } catch (e) {}
    return choice;
  }

  function deleteChoice() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function pushConsentUpdate(analytics, ads) {
    gtag('consent', 'update', {
      ad_storage:         ads       ? 'granted' : 'denied',
      ad_user_data:       ads       ? 'granted' : 'denied',
      ad_personalization: ads       ? 'granted' : 'denied',
      analytics_storage:  analytics ? 'granted' : 'denied'
    });
  }

  function pushDefaultDenied() {
    gtag('consent', 'update', {
      ad_storage:         'denied',
      ad_user_data:       'denied',
      ad_personalization: 'denied',
      analytics_storage:  'denied'
    });
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  var CSS = [
    '#sat-consent-banner {',
    '  position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;',
    '  background: rgba(20, 20, 20, 0.96); color: #e8e8e8;',
    '  border-top: 1px solid #333; backdrop-filter: blur(8px);',
    '  font-family: "Segoe UI", Arial, sans-serif; font-size: 13px;',
    '  padding: 8px 16px; box-sizing: border-box;',
    '  transform: translateY(100%); transition: transform 0.3s ease;',
    '}',
    '#sat-consent-banner.sat-visible { transform: translateY(0); }',
    '#sat-consent-inner {',
    '  max-width: 1600px; margin: 0 auto;',
    '  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;',
    '}',
    '#sat-consent-text { flex: 1; min-width: 280px; }',
    '#sat-consent-text h2 { display: none; }',
    '#sat-consent-text p {',
    '  margin: 0; line-height: 1.35; color: #c8c8c8; font-size: 12.5px;',
    '}',
    '#sat-consent-text a { color: #cc0000; text-decoration: underline; }',
    '#sat-consent-btns {',
    '  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;',
    '  flex-shrink: 0;',
    '}',
    '.sat-btn {',
    '  padding: 6px 14px; border-radius: 3px; font-size: 12.5px;',
    '  font-family: inherit; cursor: pointer; border: 1px solid transparent;',
    '  transition: opacity 0.2s; white-space: nowrap;',
    '}',
    '.sat-btn:hover { opacity: 0.85; }',
    '.sat-btn-accept { background: #cc0000; color: #fff; border-color: #cc0000; }',
    '.sat-btn-reject { background: transparent; color: #e8e8e8; border-color: #555; }',
    '.sat-btn-manage {',
    '  background: none; border: none; color: #aaa;',
    '  font-size: 13px; text-decoration: underline; cursor: pointer;',
    '  padding: 0; font-family: inherit;',
    '}',
    '#sat-consent-close {',
    '  position: absolute; top: 6px; right: 10px;',
    '  background: none; border: none; color: #888; font-size: 16px;',
    '  cursor: pointer; line-height: 1; font-family: inherit;',
    '}',
    '#sat-consent-close:hover { color: #e8e8e8; }',
    '#sat-consent-prefs {',
    '  margin-top: 14px; padding-top: 14px;',
    '  border-top: 1px solid #333; display: none;',
    '}',
    '#sat-consent-prefs.sat-open { display: block; }',
    '.sat-toggle-row {',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  margin-bottom: 10px; gap: 12px;',
    '}',
    '.sat-toggle-label { font-size: 13px; color: #c8c8c8; }',
    '.sat-toggle-label strong { color: #e8e8e8; display: block; }',
    '.sat-switch {',
    '  position: relative; display: inline-block;',
    '  width: 44px; height: 24px; flex-shrink: 0;',
    '}',
    '.sat-switch input { opacity: 0; width: 0; height: 0; }',
    '.sat-slider {',
    '  position: absolute; cursor: pointer;',
    '  top: 0; left: 0; right: 0; bottom: 0;',
    '  background: #444; border-radius: 24px;',
    '  transition: background 0.2s;',
    '}',
    '.sat-slider:before {',
    '  content: ""; position: absolute;',
    '  height: 18px; width: 18px; left: 3px; bottom: 3px;',
    '  background: #fff; border-radius: 50%; transition: transform 0.2s;',
    '}',
    '.sat-switch input:checked + .sat-slider { background: #cc0000; }',
    '.sat-switch input:checked + .sat-slider:before { transform: translateX(20px); }',
    '.sat-btn-save {',
    '  margin-top: 12px; background: #cc0000; color: #fff;',
    '  border-color: #cc0000;',
    '}',
    '@media (max-width: 600px) {',
    '  #sat-consent-inner { flex-direction: column; align-items: flex-start; }',
    '  #sat-consent-btns { width: 100%; }',
    '  .sat-btn { width: 100%; text-align: center; }',
    '  .sat-btn-manage { padding: 6px 0; }',
    '}'
  ].join('\n');

  // ─── Banner HTML ──────────────────────────────────────────────────────────
  function buildBannerHTML() {
    return [
      '<div id="sat-consent-banner" role="dialog" aria-label="Cookie consent" aria-modal="true">',
      '  <button id="sat-consent-close" aria-label="Close and reject cookies">&#215;</button>',
      '  <div id="sat-consent-inner">',
      '    <div id="sat-consent-text">',
      '      <h2>Cookies and the legally required popup</h2>',
      '      <p>Required ask: cookies are used for traffic measurement, and possibly ads if I ever convince myself I need the hosting money.',
      '         Most tools still run only in your browser, untouched, with the obvious exceptions of the downloadable ones. Pick whatever you are comfortable with, no hard feelings either way.',
      '         You can change your mind anytime on the <a href="' + PRIVACY_URL + '">Privacy Policy</a> page.</p>',
      '      <div id="sat-consent-prefs" role="group" aria-label="Cookie preferences">',
      '        <div class="sat-toggle-row">',
      '          <span class="sat-toggle-label">',
      '            <strong>Analytics</strong>',
      '            Lets me see if anyone is actually using these tools (Google Analytics).',
      '          </span>',
      '          <label class="sat-switch" aria-label="Analytics cookies">',
      '            <input type="checkbox" id="sat-toggle-analytics">',
      '            <span class="sat-slider"></span>',
      '          </label>',
      '        </div>',
      '        <div class="sat-toggle-row">',
      '          <span class="sat-toggle-label">',
      '            <strong>Advertising</strong>',
      '            Helps pay for hosting, if I ever actually turn on ads.',
      '          </span>',
      '          <label class="sat-switch" aria-label="Advertising cookies">',
      '            <input type="checkbox" id="sat-toggle-ads">',
      '            <span class="sat-slider"></span>',
      '          </label>',
      '        </div>',
      '        <button class="sat-btn sat-btn-save" id="sat-btn-save">Save preferences</button>',
      '      </div>',
      '    </div>',
      '    <div id="sat-consent-btns">',
      '      <button class="sat-btn sat-btn-accept" id="sat-btn-accept">Sounds fine, accept all</button>',
      '      <button class="sat-btn sat-btn-reject" id="sat-btn-reject">No thanks, reject all</button>',
      '      <button class="sat-btn-manage" id="sat-btn-manage">Let me pick</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  // ─── Banner logic ─────────────────────────────────────────────────────────
  var banner = null;

  function injectStyles() {
    if (document.getElementById('sat-consent-styles')) return;
    var style = document.createElement('style');
    style.id = 'sat-consent-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function hideBanner() {
    if (!banner) return;
    banner.classList.remove('sat-visible');
    // Remove from DOM after animation
    setTimeout(function () {
      if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
        banner = null;
      }
    }, 350);
  }

  function showBanner() {
    // Prevent double-render
    if (document.getElementById(BANNER_ID)) return;

    injectStyles();

    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildBannerHTML();
    banner = wrapper.firstElementChild;
    document.body.appendChild(banner);

    // Trigger slide-in on next frame
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner && banner.classList.add('sat-visible');
      });
    });

    // Wire up buttons
    document.getElementById('sat-btn-accept').addEventListener('click', function () {
      SatConsent.accept();
    });
    document.getElementById('sat-btn-reject').addEventListener('click', function () {
      SatConsent.reject();
    });
    document.getElementById('sat-consent-close').addEventListener('click', function () {
      SatConsent.reject();
    });
    document.getElementById('sat-btn-manage').addEventListener('click', function () {
      var prefs = document.getElementById('sat-consent-prefs');
      prefs.classList.toggle('sat-open');
      this.textContent = prefs.classList.contains('sat-open')
        ? 'Hide options'
        : 'Let me pick';
    });
    document.getElementById('sat-btn-save').addEventListener('click', function () {
      var analytics = document.getElementById('sat-toggle-analytics').checked;
      var ads       = document.getElementById('sat-toggle-ads').checked;
      saveChoice(analytics, ads);
      pushConsentUpdate(analytics, ads);
      hideBanner();
    });

    // Restore toggle states from any prior choice (edge case: reset then manage)
    var existing = readChoice();
    if (existing) {
      document.getElementById('sat-toggle-analytics').checked = !!existing.analytics;
      document.getElementById('sat-toggle-ads').checked       = !!existing.ads;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  var SatConsent = {
    accept: function () {
      saveChoice(true, true);
      pushConsentUpdate(true, true);
      hideBanner();
    },
    reject: function () {
      saveChoice(false, false);
      pushConsentUpdate(false, false);
      hideBanner();
    },
    reset: function () {
      deleteChoice();
      pushDefaultDenied();
      // Show immediately if DOM is ready, otherwise queue
      if (document.body) {
        showBanner();
      } else {
        document.addEventListener('DOMContentLoaded', showBanner);
      }
    },
    show: function () {
      if (document.body) {
        showBanner();
      } else {
        document.addEventListener('DOMContentLoaded', showBanner);
      }
    },
    get: function () {
      return readChoice();
    }
  };

  window.SatConsent = SatConsent;

  // ─── Auto-init: apply stored consent or show banner ───────────────────────
  var stored = readChoice();
  if (stored) {
    // Re-apply previously stored consent immediately (before GTM fires)
    pushConsentUpdate(stored.analytics, stored.ads);
  } else {
    // No choice yet — show banner after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }

}());
