/**
 * auth.js — Cổng đăng nhập Google qua Firebase Auth + allowlist trên Firestore.
 *
 * Luồng: Firebase Auth (Google popup) → đọc allowlist từ Firestore `authConfig/main`
 * (thiếu doc → admin gốc seed từ DEFAULTS) → check quyền → mở app.
 * Ghi allowlist: chỉ admin (enforce bằng firestore.rules, không chỉ client).
 *
 * Gate UI là client-side; data tĩnh trong js/data/*.js vẫn public trên host tĩnh —
 * xem ghi chú ở tab 🔐. Allowlist thì đồng bộ MỌI người dùng qua Firestore.
 *
 * Phụ thuộc: firebase-*-compat.js (CDN, global `firebase`), js/auth.config.js.
 */
const AuthGate = (() => {

    // Firestore path: apps/{APP_ID} — project firebase dùng chung nhiều app, mỗi app 1 doc
    const APPS_COLLECTION = 'apps';
    const appId = () => (window.AUTH_CONFIG || {}).APP_ID || 'default';

    // Cờ "đã từng đăng nhập thành công" — để lần mở sau hiện "đang khôi phục phiên"
    // thay vì chớp màn login trong lúc Firebase restore session (async).
    const SEEN_KEY = 'mc_auth_seen';

    let _user = null;    // {email, name, picture}
    let _config = null;  // allowlist đang hiệu lực (Firestore hoặc DEFAULTS fallback)
    let _db = null;

    const conf = () => window.AUTH_CONFIG || {};
    const norm = list => (list || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);

    function isConfigured() {
        return !!(conf().FIREBASE && conf().FIREBASE.apiKey);
    }

    // ── Allowlist ─────────────────────────────────────────────────────────────
    function getConfig() { return _config || { ...(conf().DEFAULTS || {}) }; }

    function isRootAdmin(email) {
        return norm(conf().ROOT_ADMINS).includes(String(email).toLowerCase().trim());
    }

    function isAdmin() {
        if (!_user) return false;
        if (_user.email === 'dev@local') return true;            // chưa cấu hình → cho setup
        if (isRootAdmin(_user.email)) return true;               // admin gốc luôn có quyền
        return norm(getConfig().ADMIN_EMAILS).includes(_user.email.toLowerCase());
    }

    /** Được vào app khi: email lẻ được phép, HOẶC domain được phép, HOẶC là admin. */
    function accessAllowed(email) {
        const cfg = getConfig();
        const em = String(email).toLowerCase().trim();
        if (isRootAdmin(em)) return true;
        if (norm(cfg.ADMIN_EMAILS).includes(em)) return true;
        if (norm(cfg.ALLOWED_EMAILS).includes(em)) return true;
        const domains = norm(cfg.ALLOWED_DOMAINS);
        if (domains.includes('*')) return true;
        const dom = em.split('@')[1];
        return !!dom && domains.includes(dom);
    }

    // ── Firestore config doc ──────────────────────────────────────────────────
    async function loadRemoteConfig(email) {
        const ref = _db.collection(APPS_COLLECTION).doc(appId());
        try {
            const snap = await ref.get();
            if (snap.exists) { _config = snap.data(); return; }
            // Doc chưa có: admin gốc seed từ DEFAULTS (rules chỉ cho admin gốc create)
            if (isRootAdmin(email)) {
                _config = { ...(conf().DEFAULTS || {}) };
                await ref.set(_config);
            } else {
                _config = { ...(conf().DEFAULTS || {}) };   // fallback read-only
            }
        } catch (e) {
            console.warn('[auth] Không đọc được Firestore config — dùng DEFAULTS.', e);
            _config = { ...(conf().DEFAULTS || {}) };
        }
    }

    /** Ghi allowlist mới lên Firestore (áp dụng cho MỌI người). Chỉ admin qua được rules. */
    async function saveConfig(cfg) {
        const ref = _db.collection(APPS_COLLECTION).doc(appId());
        await ref.set(cfg);
        _config = cfg;
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    function showError(msg) {
        const el = $('auth-error');
        // innerHTML (không phải textContent) để MutationObserver của i18n dịch được khi đang ở EN
        if (el) { el.innerHTML = msg; el.style.display = 'block'; }
    }

    /** true = ẩn card login, hiện popup loading nhẹ "đang khôi phục phiên". */
    function setChecking(on) {
        const card = document.querySelector('#auth-overlay .auth-card');
        const chk = $('auth-checking');
        if (card) card.style.display = on ? 'none' : '';
        if (chk) chk.style.display = on ? '' : 'none';
    }

    function unlock() {
        document.body.classList.remove('auth-locked');
        if (isAdmin()) document.body.classList.add('is-admin');
        const ov = $('auth-overlay');
        if (ov) ov.style.display = 'none';
        renderUserChip();
        if (typeof AuthAdmin !== 'undefined') AuthAdmin.init();
    }

    function renderUserChip() {
        const host = $('auth-user-chip');
        if (!host || !_user) return;
        host.style.display = '';
        host.innerHTML = `
            ${_user.picture ? `<img class="auth-chip-avatar" src="${_user.picture}" alt="" referrerpolicy="no-referrer">` : ''}
            <div class="auth-chip-info">
                <span class="auth-chip-name">${_user.name || _user.email}${isAdmin() ? ' <span class="badge ok">Admin</span>' : ''}</span>
                <span class="auth-chip-email">${_user.email}</span>
            </div>
            <button class="btn-icon-sm" id="auth-signout" title="Đăng xuất">⏻</button>`;
        $('auth-signout')?.addEventListener('click', signOut);
    }

    function signOut() {
        localStorage.removeItem(SEEN_KEY);
        const done = () => location.reload();
        if (isConfigured() && window.firebase) firebase.auth().signOut().then(done, done);
        else done();
    }

    // ── Firebase flow ─────────────────────────────────────────────────────────
    async function onSignedIn(fbUser) {
        await loadRemoteConfig(fbUser.email);
        if (!accessAllowed(fbUser.email)) {
            showError(`Tài khoản ${fbUser.email} không nằm trong danh sách được phép.`);
            firebase.auth().signOut();
            return;
        }
        _user = { email: fbUser.email, name: fbUser.displayName || '', picture: fbUser.photoURL || '' };
        localStorage.setItem(SEEN_KEY, '1');
        unlock();
    }

    function initFirebase() {
        firebase.initializeApp(conf().FIREBASE);
        _db = firebase.firestore();

        $('auth-google-btn')?.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            firebase.auth().signInWithPopup(provider).catch(e => {
                if (e.code !== 'auth/popup-closed-by-user') showError(e.message || String(e));
            });
        });

        // Phiên do Firebase tự giữ (persistence LOCAL) — F5 không phải đăng nhập lại
        firebase.auth().onAuthStateChanged(u => {
            if (u && u.email) { onSignedIn(u); return; }
            // không còn phiên → bỏ cờ, hiện lại card login
            localStorage.removeItem(SEEN_KEY);
            setChecking(false);
        });
    }

    // ── Entry ─────────────────────────────────────────────────────────────────
    function init() {
        document.body.classList.add('auth-locked');
        const ov = $('auth-overlay');
        if (ov) ov.style.display = '';

        // Firebase Auth không chạy trên file:// — cần http(s). Hiện hướng dẫn + cho bỏ qua (dev).
        if (location.protocol === 'file:') {
            const btn = $('auth-google-btn');
            if (btn) btn.style.display = 'none';
            showError('Đăng nhập Google không chạy khi mở trực tiếp file (file://). Hãy chạy local server: python -m http.server 8000 rồi mở http://localhost:8000.');
            const skip = $('auth-skip');
            if (skip) {
                skip.style.display = '';
                skip.addEventListener('click', () => {
                    _user = { email: 'dev@local', name: 'Dev (chưa cấu hình auth)', picture: '' };
                    _config = { ...(conf().DEFAULTS || {}) };
                    unlock();
                });
            }
            return;
        }

        if (!isConfigured() || typeof firebase === 'undefined') {
            // Chưa cấu hình Firebase → hướng dẫn + cho bỏ qua (dev mode, được coi là admin để setup)
            const setup = $('auth-setup-note');
            if (setup) setup.style.display = 'block';
            const btn = $('auth-google-btn');
            if (btn) btn.style.display = 'none';
            const skip = $('auth-skip');
            if (skip) {
                skip.style.display = '';
                skip.addEventListener('click', () => {
                    _user = { email: 'dev@local', name: 'Dev (chưa cấu hình auth)', picture: '' };
                    _config = { ...(conf().DEFAULTS || {}) };
                    unlock();
                });
            }
            return;
        }
        // Đã từng đăng nhập → hiện loading nhẹ thay vì chớp card login trong lúc restore phiên
        if (localStorage.getItem(SEEN_KEY) === '1') setChecking(true);
        initFirebase();
    }

    document.addEventListener('DOMContentLoaded', init);

    return { getConfig, saveConfig, isAdmin, signOut, isConfigured, user: () => _user };

})();
