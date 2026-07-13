/**
 * auth.config.js — Cấu hình Firebase cho đăng nhập Google + allowlist.
 *
 * KIẾN TRÚC: allowlist (domain/email/admin) lưu ở Firestore document `authConfig/main`
 * → admin sửa trên tab 🔐 Auth Config là áp dụng NGAY cho mọi người, không cần redeploy.
 * File này chỉ chứa: (1) Firebase project config, (2) defaults để seed Firestore lần đầu
 * và làm fallback khi chưa kết nối được Firestore.
 *
 * SETUP (1 lần):
 *  1. https://console.firebase.google.com → Add project (tắt Analytics cũng được)
 *  2. Authentication → Sign-in method → bật Google
 *  3. Authentication → Settings → Authorized domains → thêm localhost + domain Vercel
 *  4. Firestore Database → Create database (production mode) → dán rules từ file firestore.rules
 *  5. Project settings → General → Your apps → Web app → copy firebaseConfig dán vào dưới
 *
 * Lưu ý: apiKey của Firebase web là PUBLIC by design (không phải secret) — bảo vệ nằm ở
 * Security Rules, không phải ở việc giấu key.
 */
window.AUTH_CONFIG = {
    // firebaseConfig từ Firebase Console (project authen-84f17 — dùng chung cho nhiều app).
    // apiKey của Firebase web là public by design; bảo vệ nằm ở Security Rules.
    FIREBASE: {
        apiKey: 'AIzaSyA46Uj9MSUxcbMRTzjkbMwYTFVoxT4G_0k',
        authDomain: 'authen-84f17.firebaseapp.com',
        projectId: 'authen-84f17',
        appId: '1:39902925269:web:5be58597eb02c25c5bed5c',
    },

    // Namespace của app này trong Firestore (project firebase dùng chung nhiều app):
    // allowlist nằm ở document  apps/{APP_ID}  — app khác thêm APP_ID khác là xong.
    APP_ID: 'm1-dashboard-balancing',

    // Defaults — dùng để SEED Firestore lần đầu (admin đầu tiên đăng nhập sẽ tạo doc)
    // và làm fallback khi Firestore chưa sẵn sàng. Sau khi seed, nguồn sự thật là Firestore.
    DEFAULTS: {
        // Email thuộc các domain này được vào app. '*' = mọi domain.
        ALLOWED_DOMAINS: ['easygoing.vn'],
        // Email LẺ được phép dù không thuộc domain nào ở trên.
        ALLOWED_EMAILS: [],
        // Admin: luôn được vào app + thấy tab 🔐 Auth Config.
        ADMIN_EMAILS: ['giangnb@easygoing.vn'],
    },

    // Admin gốc (bootstrap): luôn có quyền admin kể cả khi doc Firestore hỏng/bị xoá,
    // và là người duy nhất được TẠO doc config lần đầu (khớp firestore.rules).
    ROOT_ADMINS: ['giangnb@easygoing.vn'],
};
