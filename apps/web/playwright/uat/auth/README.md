# AUTH UAT Automation

Suite này ánh xạ 1:1 `AUTH-001` đến `AUTH-012` trong sheet `UT01_XacThuc`. Metadata và dữ liệu mẫu
nằm ở `auth-test-cases.json`; test title, Playwright annotations, JSON/JUnit report và workbook đều dùng
cùng TC ID để truy vết.

## Chuẩn bị môi trường

```bash
pnpm db:up
pnpm db:migrate:dev
E2E_TESTING=1 RATE_LIMITING_DISABLED=1 SMTP_AUTHENTICATED=0 pnpm dev
```

MailHog mặc định ở `http://127.0.0.1:8025`. Có thể đổi bằng `UAT_MAILHOG_URL`. Nếu MailHog không chạy,
`AUTH-009` được ghi `Blocked`, không bị báo sai thành `Failed`.
`RATE_LIMITING_DISABLED=1` chỉ dùng cho môi trường UAT cô lập để các lần chạy forgot-password không dùng
chung quota theo IP; không cấu hình biến này ở production.

OAuth dùng tài khoản/provider test, không lưu secret trong repo. Khi muốn chạy `AUTH-011`, cấu hình:

```bash
export UAT_OAUTH_BUTTON_NAME="Continue with OpenID"
export UAT_OAUTH_USERNAME="<test-account>"
export UAT_OAUTH_PASSWORD="<test-password>"
export UAT_OAUTH_EXPECTED_EMAIL="<mapped-email>"
```

Nếu IdP dùng selector khác, đặt thêm `UAT_OAUTH_USERNAME_SELECTOR`, `UAT_OAUTH_PASSWORD_SELECTOR`,
`UAT_OAUTH_SUBMIT_SELECTOR` và tùy chọn `UAT_OAUTH_CONSENT_SELECTOR`. Thiếu cấu hình thì `AUTH-011` được
ghi `Blocked`.

## Chạy và xuất report

Trong terminal khác, từ repo root:

```bash
pnpm test:e2e:auth-uat
```

Lệnh luôn cập nhật workbook kể cả khi test có case Failed. Artifact được lưu tại `artifacts/uat/auth/`:

- `playwright-report/index.html`: report trực quan, trace/video/screenshot khi lỗi.
- `results.json`: nguồn máy đọc để đồng bộ workbook.
- `junit.xml`: tích hợp CI/test management.
- `AILABSurvey_UATest_EndUser_AUTH_Automation.xlsx`: bản sao workbook nguồn, có dữ liệu mẫu, kết quả và
  sheet `AUT_Execution`.

Không ghi đè `AILABSurvey_UATest_EndUser (1).xlsx`. Test data dùng prefix `uat-auth-` và được dọn theo
đúng email/organization đã tạo sau suite.
