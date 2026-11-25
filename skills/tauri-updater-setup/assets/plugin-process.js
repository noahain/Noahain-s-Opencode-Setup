// Process IPC wrapper. Exposes window.__TAURI_PLUGIN_PROCESS__ (relaunch).
// Used by the updater after an update is installed to restart into it.
(function () {
    'use strict';

    function getCore() {
        return (window.__TAURI__ && window.__TAURI__.core) || null;
    }

    function relaunch() {
        var core = getCore();
        if (!core) return Promise.reject(new Error('Tauri not available'));
        return core.invoke('plugin:process|restart');
    }

    window.__TAURI_PLUGIN_PROCESS__ = { relaunch: relaunch };
})();
