// In-app updater toast.
// Exposes window.TauriUpdater = { init, check, relaunch, removeMounted }.
// Requires: plugin-updater.js + plugin-process.js loaded first,
// and updater-toast.css for styling.
(function () {
    'use strict';

    var CHECK_TIMEOUT_MS = 10000;
    var STALL_TIMEOUT_MS = 2 * 60 * 1000;
    var AUTO_RETRY_DELAY_MS = 5000;

    function getCore() {
        return (window.__TAURI__ && window.__TAURI__.core) || null;
    }

    var state = {
        current: 'IDLE',
        update: null,
        downloaded: 0,
        total: 0,
        stallTimer: null,
        abortController: null,
        mounted: null,
        cancelled: false,
        autoCheckToken: 0
    };

    function classifyError(e) {
        var msg = String((e && e.message) || e);
        if (/signature|verify/i.test(msg)) return 'SIGNATURE';
        if (/rate.?limit|403/i.test(msg)) return 'RATE_LIMIT';
        if (/not.?found|404/i.test(msg)) return 'NOT_FOUND';
        if (/network|fetch|timeout|tls|dns/i.test(msg)) return 'NETWORK';
        if (/permission|access.?denied/i.test(msg)) return 'PERMISSION';
        if (/another.?instance|file.?in.?use/i.test(msg)) return 'IN_USE';
        return 'UNKNOWN';
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatBytes(bytes) {
        if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // --- stall watchdog ----------------------------------------------------

    function clearStallTimer() {
        if (state.stallTimer) {
            clearTimeout(state.stallTimer);
            state.stallTimer = null;
        }
    }

    function touchProgress() {
        clearStallTimer();
        state.stallTimer = setTimeout(function () {
            if (state.current === 'DOWNLOADING') handleStall();
        }, STALL_TIMEOUT_MS);
    }

    // --- DOM ---------------------------------------------------------------

    function ensureContainer() {
        var c = document.getElementById('updater-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'updater-container';
            document.body.appendChild(c);
        }
        return c;
    }

    function buildToastHtml(update) {
        return ''
            + '<div class="update-toast" data-version="' + esc(update.version || '') + '">'
            +   '<div class="update-toast-header">'
            +     '<span class="update-toast-title">Update available</span>'
            +     '<button class="update-toast-close" aria-label="Dismiss">&times;</button>'
            +   '</div>'
            +   '<div class="update-toast-body">'
            +     '<p>Version <strong>v' + esc(update.version || '?') + '</strong> is ready to install.</p>'
            +     '<div class="update-toast-actions">'
            +       '<button class="update-toast-update">Update</button>'
            +       '<button class="update-toast-cancel" hidden>Cancel</button>'
            +     '</div>'
            +     '<div class="update-toast-progress" hidden>'
            +       '<div class="update-toast-progress-bar"><div class="update-toast-progress-fill"></div></div>'
            +       '<span class="update-toast-progress-text">Downloading&hellip;</span>'
            +     '</div>'
            +     '<div class="update-toast-error" hidden></div>'
            +   '</div>'
            + '</div>';
    }

    function wireToastEvents(el) {
        el.querySelector('.update-toast-close').addEventListener('click', removeMounted);
        el.querySelector('.update-toast-update').addEventListener('click', startDownload);
        el.querySelector('.update-toast-cancel').addEventListener('click', cancelDownload);
    }

    function mountToast(update) {
        if (state.mounted && state.mounted.getAttribute('data-version') === update.version) {
            return state.mounted;
        }
        removeMounted();
        var c = ensureContainer();
        c.insertAdjacentHTML('beforeend', buildToastHtml(update));
        var el = c.querySelector('.update-toast');
        state.mounted = el;
        state.update = update;
        state.downloaded = 0;
        state.total = 0;
        state.cancelled = false;
        state.current = 'AVAILABLE';
        wireToastEvents(el);
        return el;
    }

    function removeMounted() {
        clearStallTimer();
        abortDownload();
        if (state.mounted && state.mounted.parentNode) {
            state.mounted.parentNode.removeChild(state.mounted);
        }
        state.mounted = null;
        state.current = 'IDLE';
    }

    function setProgress(el, done, total) {
        var fill = el.querySelector('.update-toast-progress-fill');
        var text = el.querySelector('.update-toast-progress-text');
        if (total > 0) {
            var pct = Math.min(100, Math.round((done / total) * 100));
            if (pct === 0 && done > 0) pct = 1;
            if (fill) {
                fill.style.width = pct + '%';
                fill.classList.remove('indeterminate');
            }
            if (text) text.textContent = 'Downloading\u2026 ' + pct + '%';
        } else {
            if (fill) {
                fill.style.width = '';
                fill.classList.add('indeterminate');
            }
            if (text) {
                text.textContent = done > 0
                    ? 'Downloading\u2026 ' + formatBytes(done)
                    : 'Downloading\u2026';
            }
        }
    }

    function renderDownloading() {
        var el = state.mounted;
        if (!el) return;
        var progress = el.querySelector('.update-toast-progress');
        var actions = el.querySelector('.update-toast-actions');
        if (progress) progress.hidden = false;
        if (actions) {
            actions.hidden = false;
            var updateBtn = el.querySelector('.update-toast-update');
            var cancelBtn = el.querySelector('.update-toast-cancel');
            if (updateBtn) updateBtn.hidden = true;
            if (cancelBtn) cancelBtn.hidden = false;
        }
        setProgress(el, state.downloaded, state.total);
    }

    function renderReady() {
        var el = state.mounted;
        if (!el) return;
        var progress = el.querySelector('.update-toast-progress');
        var actions = el.querySelector('.update-toast-actions');
        if (progress) progress.hidden = true;
        if (actions) {
            actions.hidden = false;
            actions.innerHTML = '<button class="update-toast-restart">Restart now</button>';
            actions.querySelector('.update-toast-restart').addEventListener('click', relaunch);
        }
    }

    function errorCopy(errorClass) {
        switch (errorClass) {
            case 'SIGNATURE':
                return { title: 'Update verification failed', body: 'The downloaded file could not be verified. Do not install it; report this on the project issue tracker.' };
            case 'RATE_LIMIT':
                return { title: 'Rate limit hit', body: 'Too many update checks from this network. Try again later.' };
            case 'NOT_FOUND':
                return { title: 'Release not found', body: 'The update endpoint did not return a release. It may have been removed or unpublished.' };
            case 'NETWORK':
                return { title: "Couldn't reach the update server", body: 'Check your connection and retry.' };
            case 'PERMISSION':
                return { title: "Couldn't install the update", body: 'Try closing any other running instances, or run as administrator.' };
            case 'IN_USE':
                return { title: 'Update file in use', body: 'Close all running instances of the app and click Retry.' };
            case 'STALL':
                return { title: 'Download seems stuck', body: 'No progress for a while. Click Retry to try again.' };
            default:
                return { title: 'Update failed', body: 'See the console for details. Click Retry to try again.' };
        }
    }

    function showErrorPanel(el, errorClass, retryLabel) {
        if (!el) return;
        var progress = el.querySelector('.update-toast-progress');
        var actions = el.querySelector('.update-toast-actions');
        var errorEl = el.querySelector('.update-toast-error');
        if (progress) progress.hidden = true;
        if (actions) actions.hidden = true;
        if (!errorEl) return;
        var copy = errorCopy(errorClass);
        errorEl.innerHTML = ''
            + '<p class="update-toast-error-title"><strong>' + esc(copy.title) + '</strong></p>'
            + '<p>' + esc(copy.body) + '</p>'
            + '<div class="update-toast-actions">'
            +   '<button class="update-toast-retry">' + esc(retryLabel || 'Retry') + '</button>'
            +   '<button class="update-toast-dismiss">Dismiss</button>'
            + '</div>';
        errorEl.hidden = false;
        errorEl.querySelector('.update-toast-retry').addEventListener('click', function () {
            errorEl.hidden = true;
            errorEl.innerHTML = '';
            startDownload();
        });
        errorEl.querySelector('.update-toast-dismiss').addEventListener('click', removeMounted);
    }

    // --- download lifecycle ------------------------------------------------

    function abortDownload() {
        if (state.abortController) {
            try { state.abortController.abort(); } catch (_) { /* noop */ }
            state.abortController = null;
        }
    }

    function startDownload() {
        if (!state.update) return;
        state.cancelled = false;
        state.abortController = new AbortController();
        state.downloaded = 0;
        state.total = 0;
        state.current = 'DOWNLOADING';
        renderDownloading();
        touchProgress();

        state.update.downloadAndInstall(function (event) {
            if (state.cancelled) return;
            if (event.event === 'started') {
                state.total = (event.data && event.data.contentLength) || 0;
                touchProgress();
                renderDownloading();
            } else if (event.event === 'progress') {
                state.downloaded += (event.data && event.data.chunkLength) || 0;
                touchProgress();
                renderDownloading();
            } else if (event.event === 'finished') {
                clearStallTimer();
                state.current = 'READY';
                renderReady();
            }
        }, { signal: state.abortController.signal }).catch(function (e) {
            if (state.cancelled) return;
            clearStallTimer();
            console.warn('Update download failed:', e && e.message);
            state.current = 'ERROR';
            showErrorPanel(state.mounted, classifyError(e));
        });
    }

    function cancelDownload() {
        state.cancelled = true;
        clearStallTimer();
        abortDownload();
        state.downloaded = 0;
        state.total = 0;
        state.current = 'AVAILABLE';
        var el = state.mounted;
        if (!el) return;
        var progress = el.querySelector('.update-toast-progress');
        var actions = el.querySelector('.update-toast-actions');
        if (progress) progress.hidden = true;
        if (actions) {
            actions.hidden = false;
            var updateBtn = el.querySelector('.update-toast-update');
            var cancelBtn = el.querySelector('.update-toast-cancel');
            if (updateBtn) updateBtn.hidden = false;
            if (cancelBtn) cancelBtn.hidden = true;
        }
        setProgress(el, 0, 0);
    }

    function handleStall() {
        clearStallTimer();
        if (state.current !== 'DOWNLOADING' || !state.mounted) return;
        state.cancelled = true;
        abortDownload();
        state.current = 'ERROR';
        showErrorPanel(state.mounted, 'STALL');
    }

    function relaunch() {
        var proc = window.__TAURI_PLUGIN_PROCESS__;
        if (proc && typeof proc.relaunch === 'function') {
            proc.relaunch();
            return;
        }
        var core = getCore();
        if (core) {
            core.invoke('plugin:process|restart');
            return;
        }
        console.error('Cannot relaunch: tauri-plugin-process is not available');
    }

    // --- checking ----------------------------------------------------------

    function autoCheck(retriesLeft) {
        var token = ++state.autoCheckToken;
        var timeoutId = setTimeout(function () {
            if (token !== state.autoCheckToken) return;
            state.autoCheckToken++;
            if (retriesLeft > 0) {
                setTimeout(function () { autoCheck(retriesLeft - 1); }, AUTO_RETRY_DELAY_MS);
            }
        }, CHECK_TIMEOUT_MS);

        var updater = window.__TAURI_PLUGIN_UPDATER__;
        if (!updater) {
            clearTimeout(timeoutId);
            return;
        }
        updater.check().then(function (update) {
            if (token !== state.autoCheckToken) return;
            clearTimeout(timeoutId);
            if (update && update.available) mountToast(update);
        }).catch(function (e) {
            if (token !== state.autoCheckToken) return;
            clearTimeout(timeoutId);
            console.warn('Auto-update check failed:', e && e.message);
            if (retriesLeft > 0) {
                state.autoCheckToken++;
                setTimeout(function () { autoCheck(retriesLeft - 1); }, AUTO_RETRY_DELAY_MS);
            }
        });
    }

    function init() {
        autoCheck(1);
    }

    // Manual check for a menu/settings button. Resolves the update object
    // (or null when up to date) and rejects when the check itself fails -
    // show your own status text from that promise.
    function check() {
        var updater = window.__TAURI_PLUGIN_UPDATER__;
        if (!updater) return Promise.reject(new Error('Updater not available'));
        return updater.check().then(function (update) {
            if (update && update.available) mountToast(update);
            return update;
        });
    }

    window.TauriUpdater = {
        init: init,
        check: check,
        relaunch: relaunch,
        removeMounted: removeMounted
    };
})();
