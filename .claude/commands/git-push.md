---
description: Auto commit all changes and push to remote
---

Thực hiện git commit toàn bộ thay đổi hiện tại và push lên remote. Làm theo các bước sau:

1. Chạy `git status` để xem các file thay đổi
2. Chạy `git diff --stat HEAD` để tóm tắt nội dung thay đổi
3. Dựa vào nội dung thay đổi, tự động soạn commit message ngắn gọn, súc tích theo format:
   - `feat: ...` cho tính năng mới
   - `fix: ...` cho bug fix
   - `refactor: ...` cho refactor
   - `style: ...` cho thay đổi CSS/UI
   - `chore: ...` cho thay đổi khác
4. Stage tất cả file đã thay đổi (`git add` các file cụ thể, tránh dùng `git add -A` nếu có file nhạy cảm)
5. Commit với message đã soạn
6. Push lên remote (`git push`)
7. Báo kết quả: branch, commit hash, số file thay đổi

Không hỏi thêm — tự động làm luôn.
