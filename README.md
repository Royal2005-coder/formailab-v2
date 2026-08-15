<div align="center">

  <img src="./apps/web/public/images/ai-lab-survey-logo.png" alt="FormaiLab Logo" width="180" />

  # 🧪 FormaiLab (AI LAB Survey Engine)

  **Hệ Thống Khảo Sát Thích Ứng Thông Minh & Nền Tảng Đánh Giá AI (Adaptive Survey & AI Intelligence Platform)**

  [![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
  [![Next.js](https://img.shields.io/badge/Next.js-15.1-black.svg?logo=nextdotjs)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react)](https://reactjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker)](https://www.docker.com/)

  [Trải Nghiệm Hệ Thống](https://formailab.royalai.dev) • [Tài Liệu Hướng Dẫn](#-hướng-dẫn-cài-đặt--triển-khai) • [Tính Năng Nổi Bật](#-tính-năng-nổi-bật)

</div>

---

## 📌 Giới Thiệu FormaiLab

**FormaiLab** là nền tảng khảo sát và đánh giá thông minh thế hệ mới, được thiết kế chuyên biệt cho công nghệ khảo sát thích ứng (**Adaptive Survey Engine v2.0**), đánh giá ma trận câu hỏi phức tạp (Test Bank Matrix), và tích hợp Trí Tuệ Nhân Tạo (AI) hỗ trợ sáng tạo khảo sát tự động.

Hệ thống hỗ trợ nhập trực tiếp ngân hàng câu hỏi thích ứng (CSV/Excel Test Bank), tự động tính toán điểm số đa chiều (Subscale Scoring & Equations), định tuyến logic thời gian thực theo biểu thức (LimeScript AST Engine) và xuất báo cáo kết quả chi tiết.

---

## ✨ Tính Năng Nổi Bật

### 🧠 1. Engine Khảo Sát Thích Ứng (Adaptive Engine v2.0)
- **Import Ngân Hàng Câu Hỏi Thích Ứng (CSV/Excel)**: Hỗ trợ nạp ma trận câu hỏi 120Q+, tự động phân loại danh mục, độ khó, trọng số và các biến số đánh giá.
- **Tính Điểm & Biểu Thức Động (Dynamic Equation Scoring)**: Hỗ trợ cú pháp biểu thức toán học LimeScript AST (`{Score_CatA = Score_CatA + 1}`) để tính toán điểm số trực tiếp.
- **Rẽ Nhánh & Định Tuyến Thông Minh (Score Routing)**: Tự động điều hướng câu hỏi tiếp theo dựa trên ngưỡng điểm số (Cut-off threshold) hoặc phản hồi trước đó.

### 🤖 2. Tích Hợp AI Trợ Lý (Google Gemini 2.5 Flash)
- **Khởi Tạo Khảo Sát Tự Động**: Tạo bộ câu hỏi khảo sát chuyên sâu theo ngữ cảnh từ mô tả yêu cầu bằng ngôn ngữ tự nhiên.
- **Phân Tích & Tổng Hợp AI**: Tóm tắt nội dung phản hồi, trích xuất sắc thái (sentiment) và phân loại dữ liệu câu hỏi mở tự động.

### 🏢 3. Hệ Thống Doanh Nghiệp (Enterprise & Self-Hosted)
- **Quản Lý Đa Workspace & Phân Quyền**: Hỗ trợ phân quyền chi tiết (Owner, Manager, Editor, Viewer) cho từng dự án.
- **Xác Thực Đăng Nhập An Toàn**: Tích hợp Google OAuth 2.0 SSO và SAML SSO.
- **Lưu Trữ Dữ Liệu & Caching**: Tích hợp MinIO S3 Object Storage, Redis/Valkey cache, và PostgreSQL Database.

---

## 🏗️ Kiến Trúc Mã Nguồn (Monorepo Tech Stack)

| Thành Phần | Công Nghệ Sử Dụng |
| :--- | :--- |
| **Framework Chính** | [Next.js 15 (App Router)](https://nextjs.org/) & [React 19](https://reactjs.org/) |
| **Ngôn Ngữ** | [TypeScript](https://www.typescriptlang.org/) (Strict Mode) |
| **Monorepo Manager** | [Turborepo](https://turbo.build/) & [pnpm](https://pnpm.io/) |
| **Database & ORM** | PostgreSQL & [Prisma ORM](https://www.prisma.io/) |
| **AI Integration** | Google Gemini 2.5 Flash SDK (`@google/genai`) |
| **Storage & Cache** | MinIO S3 Object Storage & Valkey (Redis) |
| **Test & QA Suite** | Playwright E2E & Vitest Unit Test |

---

## 🚀 Hướng Dẫn Cài Đặt & Triển Khai

### 1. Yêu Cầu Hệ Thống
- Node.js `>= 20.x`
- pnpm `>= 9.x`
- Docker & Docker Compose (Cho môi trường triển khai)

### 2. Chạy Phát Triển Cục Bộ (Local Development)

```bash
# 1. Clone repository
git clone https://github.com/Royal2005-coder/formailab.git
cd formailab

# 2. Cài đặt các gói phụ thuộc (Dependencies)
pnpm install

# 3. Khởi chạy các dịch vụ Docker (PostgreSQL, Redis, MinIO)
pnpm db:up

# 4. Chạy migration database
pnpm db:migrate:dev

# 5. Khởi chạy môi trường Dev
pnpm dev
```
Ứng dụng sẽ hoạt động tại địa chỉ: `http://localhost:3000`.

### 3. Triển Khai Production (Docker Deployment)

Để đóng gói và khởi chạy container trên máy chủ Production:

```bash
# Build Docker Image Production
docker build -t formbricks-ai-lab:staging-latest -f apps/web/Dockerfile .

# Chạy script deploy tự động
./docker/ai-lab/deploy.sh
```

---

## 📄 Giấy Phép (License)

Dự án được phát hành theo giấy phép [AGPL-3.0 License](LICENSE).
