/* global module */

(() => {
  const mode = document.currentScript.getAttribute('data-module-bridge');

  if (mode === 'capture' && typeof module === 'object') {
    window.module = module;
    module = undefined;
  }

  if (mode === 'restore' && window.module) {
    module = window.module;
  }
})();
