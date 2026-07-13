/**
 * authAdmin.js — Tab 🔐 Auth Config (chỉ admin thấy).
 *
 * Allowlist ghi qua AuthGate.saveConfig → Firestore `apps/{APP_ID}`:
 * bấm Lưu là áp dụng NGAY cho mọi người dùng (rules chỉ cho admin ghi).
 *
 * Email được quản lý dạng BẢNG thành viên (thêm / xoá / tick Admin từng dòng);
 * dưới data vẫn là 2 mảng ALLOWED_EMAILS + ADMIN_EMAILS — admin=true nghĩa là
 * email nằm ở ADMIN_EMAILS, ngược lại nằm ở ALLOWED_EMAILS.
 */
const AuthAdmin = (() => {

    const $ = id => document.getElementById(id);

    const normEmail = s => String(s || '').toLowerCase().trim();
    const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    const isDomain = s => s === '*' || /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(s);

    // Trạng thái đang chỉnh (chưa lưu cho tới khi bấm 💾)
    let _members = [];   // [{email, admin}]
    let _domains = [];   // ['easygoing.vn', ...]

    function rootAdmins() {
        return ((window.AUTH_CONFIG || {}).ROOT_ADMINS || []).map(normEmail);
    }

    // ── State ↔ config ────────────────────────────────────────────────────────
    function membersFromConfig(cfg) {
        const admins = (cfg.ADMIN_EMAILS || []).map(normEmail);
        const allowed = (cfg.ALLOWED_EMAILS || []).map(normEmail);
        const seen = new Set();
        const list = [];
        // admin gốc luôn hiện đầu bảng (khoá thao tác)
        [...rootAdmins(), ...admins, ...allowed].forEach(em => {
            if (!em || seen.has(em)) return;
            seen.add(em);
            list.push({ email: em, admin: admins.includes(em) || rootAdmins().includes(em) });
        });
        return list;
    }

    function membersToConfig() {
        return {
            ALLOWED_DOMAINS: [..._domains],
            ALLOWED_EMAILS: _members.filter(m => !m.admin).map(m => m.email),
            ADMIN_EMAILS: _members.filter(m => m.admin).map(m => m.email),
        };
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function renderTable() {
        const body = $('acfg-mail-body');
        if (!body) return;
        const roots = rootAdmins();
        body.innerHTML = _members.length ? _members.map((m, i) => {
            const isRoot = roots.includes(m.email);
            return `<tr>
                <td class="mono" style="font-size:.82rem">${m.email}${isRoot ? ' <span class="badge ok" title="Admin gốc — cố định trong config &amp; rules">gốc</span>' : ''}</td>
                <td style="text-align:center"><input type="checkbox" data-i="${i}" class="acfg-adm-chk" ${m.admin ? 'checked' : ''} ${isRoot ? 'disabled' : ''}></td>
                <td><button class="btn-icon-sm acfg-del" data-i="${i}" title="Xoá" ${isRoot ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''}>🗑️</button></td>
            </tr>`;
        }).join('') : `<tr><td class="table-empty" colspan="3">Chưa có email lẻ nào — thêm ở ô trên.</td></tr>`;

        TableUtils.setText('acfg-mail-count', String(_members.length));

        body.querySelectorAll('.acfg-adm-chk').forEach(chk => chk.addEventListener('change', () => {
            _members[+chk.dataset.i].admin = chk.checked;
            setStatus('✏️ Đã đổi — nhớ bấm 💾 Lưu để áp dụng.');
        }));
        body.querySelectorAll('.acfg-del').forEach(btn => btn.addEventListener('click', () => {
            if (btn.disabled) return;
            _members.splice(+btn.dataset.i, 1);
            renderTable();
            setStatus('✏️ Đã đổi — nhớ bấm 💾 Lưu để áp dụng.');
        }));
    }

    function addEmail() {
        const input = $('acfg-mail-input');
        const em = normEmail(input.value);
        if (!isEmail(em)) { setStatus('⚠️ Email không hợp lệ.'); return; }
        if (_members.some(m => m.email === em)) { setStatus('⚠️ Email đã có trong bảng.'); return; }
        _members.push({ email: em, admin: false });
        input.value = '';
        renderTable();
        setStatus('✏️ Đã thêm — nhớ bấm 💾 Lưu để áp dụng.');
    }

    // ── Bảng domain ───────────────────────────────────────────────────────────
    function renderDomainTable() {
        const body = $('acfg-domain-body');
        if (!body) return;
        body.innerHTML = _domains.length ? _domains.map((d, i) => `<tr>
                <td class="mono" style="font-size:.82rem">${d === '*' ? '<span class="badge warn" title="Mọi domain đều được vào">*</span>' : d}</td>
                <td><button class="btn-icon-sm acfg-dom-del" data-i="${i}" title="Xoá">🗑️</button></td>
            </tr>`).join('') : `<tr><td class="table-empty" colspan="2">Chưa có domain nào — thêm ở ô trên.</td></tr>`;

        TableUtils.setText('acfg-domain-count', String(_domains.length));

        body.querySelectorAll('.acfg-dom-del').forEach(btn => btn.addEventListener('click', () => {
            _domains.splice(+btn.dataset.i, 1);
            renderDomainTable();
            setStatus('✏️ Đã đổi — nhớ bấm 💾 Lưu để áp dụng.');
        }));
    }

    function addDomain() {
        const input = $('acfg-domain-input');
        const d = String(input.value || '').toLowerCase().trim();
        if (!isDomain(d)) { setStatus('⚠️ Domain không hợp lệ (vd: easygoing.vn hoặc *).'); return; }
        if (_domains.includes(d)) { setStatus('⚠️ Domain đã có trong bảng.'); return; }
        _domains.push(d);
        input.value = '';
        renderDomainTable();
        setStatus('✏️ Đã thêm — nhớ bấm 💾 Lưu để áp dụng.');
    }

    function fill() {
        const cfg = AuthGate.getConfig();
        _domains = (cfg.ALLOWED_DOMAINS || []).map(s => String(s).toLowerCase().trim()).filter(Boolean);
        _members = membersFromConfig(cfg);
        renderDomainTable();
        renderTable();
        renderFirebaseStatus();
    }

    function renderFirebaseStatus() {
        const el = $('acfg-fb-status');
        if (!el) return;
        const fb = (window.AUTH_CONFIG || {}).FIREBASE || {};
        el.innerHTML = AuthGate.isConfigured()
            ? `<span class="badge ok">Đã kết nối</span> <span class="mono">${fb.projectId}</span> — allowlist lưu ở Firestore <span class="mono">apps/${(window.AUTH_CONFIG || {}).APP_ID || ''}</span>.`
            : `<span class="badge warn">Chưa cấu hình</span> Dán firebaseConfig vào <code>js/auth.config.js</code> (hướng dẫn trong file) rồi deploy.`;
    }

    function setStatus(msg) {
        const el = $('acfg-status');
        if (!el) return;
        el.innerHTML = msg;   // innerHTML để i18n observer dịch được khi đang ở EN
        el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0'; }, 3000);
    }

    // ── Save / reload ─────────────────────────────────────────────────────────
    async function save() {
        const form = membersToConfig();
        // chặn tự khoá: người đang đăng nhập phải còn quyền vào app sau khi lưu
        const me = AuthGate.user();
        if (me && me.email !== 'dev@local' && !rootAdmins().includes(normEmail(me.email))) {
            const em = normEmail(me.email);
            const dom = em.split('@')[1];
            const ok = form.ADMIN_EMAILS.includes(em)
                || form.ALLOWED_EMAILS.includes(em)
                || form.ALLOWED_DOMAINS.includes('*')
                || form.ALLOWED_DOMAINS.map(s => s.toLowerCase()).includes(dom);
            if (!ok) { setStatus('⚠️ Cấu hình này sẽ khoá chính tài khoản của bạn — chưa lưu.'); return; }
        }
        if (!AuthGate.isConfigured()) {
            setStatus('⚠️ Chưa cấu hình Firebase — không có chỗ lưu chung. Sửa DEFAULTS trong js/auth.config.js.');
            return;
        }
        try {
            await AuthGate.saveConfig(form);
            setStatus('✅ Đã lưu lên Firestore — áp dụng ngay cho mọi người.');
        } catch (e) {
            setStatus('❌ Lưu thất bại (rules chặn hoặc mất mạng): ' + (e.message || e));
        }
    }

    function reload() {
        fill();
        setStatus('↺ Đã tải lại cấu hình đang hiệu lực.');
    }

    let _bound = false;

    function init() {
        if (!AuthGate.isAdmin() || !$('acfg-save')) return;
        fill();
        if (_bound) return;
        _bound = true;
        $('acfg-save').addEventListener('click', save);
        $('acfg-reset').addEventListener('click', reload);
        $('acfg-mail-add').addEventListener('click', addEmail);
        $('acfg-mail-input').addEventListener('keydown', e => { if (e.key === 'Enter') addEmail(); });
        $('acfg-domain-add').addEventListener('click', addDomain);
        $('acfg-domain-input').addEventListener('keydown', e => { if (e.key === 'Enter') addDomain(); });
    }

    return { init };

})();
