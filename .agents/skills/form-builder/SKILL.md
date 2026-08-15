---
name: form-builder
description: Hướng dẫn đầy đủ tạo Formbricks & LimeSurvey / Adaptive Engine v2.0 CSV/Excel test bank, survey JSON, biểu thức LimeScript AST, rẽ nhánh điều kiện, ma trận điểm SPSS - chuẩn tiếng Việt.
---

# Hướng dẫn Tạo Form Builder & Adaptive Engine v2.0 (Tiếng Việt)

Sử dụng skill này khi tạo Formbricks surveys, test banks, adaptive forms, hoặc CSV/Excel imports cho Formbricks / AI Lab.

## Hướng dẫn tải cho ChatGPT / AI Agent

Để ChatGPT hoặc AI Agent tạo được file nhập chuẩn, hãy thực hiện các bước dưới đây:

### Bước 1: Tải file Skill.md
1. Mở file `.agents/skills/form-builder/SKILL.md` (file này).
2. Tải lên như một tệp đính kèm trong cuộc trò chuyện với ChatGPT/AI Agent.
3. Nội dung file chứa đầy đủ cấu trúc chuẩn: Nhóm (G), Câu hỏi (Q), Biến số (V), Biểu thức LimeScript AST, ma trận điểm SPSS.

### Bước 2: Tải file Excel template
- **Excel (.xlsx)**: `apps/web/public/sample-csv/AILAB_Full_Adaptive_Survey_Template.xlsx`
- **CSV (.csv)**: `apps/web/public/sample-csv/formbricks-survey-import-template.csv`
- Đính kèm cùng với Skill.md vào cùng một cuộc trò chuyện.

### Bước 3: Yêu cầu ChatGPT tạo test bank
Prompt mẫu:
```
Tôi đã đính kèm Skill.md (hướng dẫn chuẩn) và file Excel template (Adaptive Engine v2.0).
Hãy tạo một test bank adaptive response với:
- [Số] câu hỏi trắc nghiệm (multipleChoiceSingle)
- [Số] câu hỏi tự luận (openText)
- Biểu thức rẽ nhánh LimeScript AST (điều kiện relevance)
- Ma trận điểm SPSS (biến số V tính tổng điểm, R rẽ nhánh theo điểm)
- Ngôn ngữ mặc định: tiếng Việt (language = vi)
- Xuất ra file CSV/Excel đúng chuẩn Adaptive Engine v2.0
```

### Bước 4: Kiểm tra và nạp
1. Tải file kết quả (đuôi `.csv` hoặc `.xlsx`).
2. Nạp tại **AI Lab → Survey Import** (tối đa 10 MiB).
3. Hệ thống sẽ preview groups/questions/options/variables.
4. Kiểm tra biểu thức rẽ nhánh và ma trận điểm.
5. Xác nhận nạp.

---

## 1. Các loại Câu hỏi được hỗ trợ

| Mã loại | Loại phần tử Formbricks | Mô tả |
| :--- | :--- | :--- |
| `openText` | Tự luận (Open Text) | Câu trả lời ngắn, dài, hoặc nhập số. |
| `multipleChoiceSingle` | Chọn một (Radio) | Câu hỏi chọn một đáp án (A, B, C, D). |
| `multipleChoiceMulti` | Chọn nhiều (Checkbox) | Câu hỏi chọn nhiều đáp án. |
| `nps` | Net Promoter Score | Thang điểm 0-10 (Lòng trung thành). |
| `rating` | Đánh giá (Rating) | Thang điểm 1-5, 1-7, hoặc 1-10 (Smiley, Star, Number). |
| `csat` | Mức độ hài lòng (CSAT) | Thang điểm 1-5. |
| `ces` | Mức độ nỗ lực (CES) | Thang điểm 1-5 hoặc 1-7. |
| `matrix` | Ma trận (Matrix) | Ma trận đánh giá Likert (hàng × cột). |
| `ranking` | Xếp hạng (Ranking) | Kéo thả sắp xếp thứ tự ưu tiên. |
| `date` | Chọn ngày (Date Picker) | Trường chọn ngày (`M-d-y`, `d-M-y`, `y-M-d`). |

---

## 2. Đặc tả CSV - Adaptive Engine v2.0

File CSV có dòng tiêu đề (header) + dòng dữ liệu. Cột `class` (cột 1) xác định loại dòng:

| `class` | Ý nghĩa | Các cột chính |
| :--- | :--- | :--- |
| `S` | Cài đặt khảo sát | `name`, `language` |
| `SL` | Ngôn ngữ khảo sát | `name`, `language`, `text` |
| `G` | Nhóm / Phần (Section) | `name`/`external_id`, `text` (tiêu đề), `relevance`, `order` |
| `Q` | Câu hỏi | `name`/`external_id`, `type/scale`, `text`, `help`, `relevance`, `order`, `mandatory`, `other` |
| `V` / `E` / `EQ` / `CALC` | Biến số / Phương trình | `name`, `type`, `calculation` (hoặc `value`/`text`), `order` |
| `A` | Đáp án / Lựa chọn | `parent_external_id`, `text`, `value`, `order` |
| `SQ` | Hàng con của Ma trận | `parent_external_id`, `text`, `value`, `order` |
| `R` | Luật rẽ nhánh / điều kiện | `parent_external_id`, `relevance` |

### Các cột chung (tất cả dòng)

`class`, `name`, `external_id`, `text`, `help`, `title`, `relevance`, `order`, `mandatory`, `parent_external_id`, `question_external_id`, `type/scale`, `type`, `value`, `calculation`, `other`, `language`

**Quy tắc:**
- `external_id`: Slug ASCII (tối đa 128 ký tự), phải bắt đầu bằng chữ cái. Importer tự chuẩn hóa.
- `language`: `vi` hoặc `en-US`; `text`/`help` được gắn ngôn ngữ đó.
- `order`: Vị trí số (bắt đầu từ 0) trong phần tử cha.
- `mandatory`: `y`/`yes`/`true`/`1` = bắt buộc.
- `other` (metadata, phân tách bằng `;`): `formbricksType=multipleChoiceSingle|multipleChoiceMulti|rating|openText|variable|ranking|matrix|csat|ces|nps`, `displayType=list|dropdown`, `range=3|4|5|7|10`, `scale=number|smiley|star`.

---

## 3. Định dạng Excel (.xlsx)

Workbook Excel gồm các sheet:

| Sheet | Cột bắt buộc |
| :--- | :--- |
| `Survey` | `external_id`, `default_language`, `title` |
| `Groups` | `external_id`, `order`, `title` |
| `Questions` | `external_id`, `group_external_id`, `type`, `order`, `text`, `mandatory` |
| `Options` | `external_id`, `question_external_id`, `order`, `value`, `label` |
| `Logic` | `external_id`, `target_external_id`, `expression`, `action` |
| `Variables` | `external_id`, `type`, `name`, `default_value`, `calculation` |
| `Quotas` | `external_id`, `limit`, `expression`, `outcome` |

Sheet tùy chọn: `Guide`, `DataDictionary`, `ExpressionExamples`, `Compatibility`.

---

## 4. Mã loại Câu hỏi

| Mã | Tên LimeSurvey | Loại chuẩn |
| :--- | :--- | :--- |
| `5` | 5-point choice | `rating` (range 5) |
| `S` | Short free text | `openText` |
| `L` | List (radio) | `multipleChoiceSingle` |
| `M` | Multiple choice | `multipleChoiceMulti` |
| `Y` | Yes/No | `multipleChoiceSingle` (tự động: `Có` / `Không`) |
| `F` | Array (matrix) | `matrix` |
| `R` | Ranking | `ranking` |
| `*` | Equation | `equation` |

---

## 5. Biểu thức LimeScript AST & Rẽ nhánh

Biểu thức là văn bản thuần (có thể bọc trong `{...}`); importer tự bỏ ngoặc.

### Toán tử
- **So sánh**: `==`, `!=`, `>`, `<`, `>=`, `<=`
- **Logic**: `&&`, `||`, `!`
- **Số học**: `+`, `-`, `*`, `/`

### Ví dụ biểu thức rẽ nhánh
1. **Rẽ nhánh theo đáp án**: `q_5 == "Không"` → hiện khi trả lời `Không`
2. **Rẻo nhánh theo điểm**: `q_score >= 80` → End Screen "Đạt"
3. **Biến số tính điểm**: `calculation = q_1 + q_2 + q_3`, type `number`
4. **Luật rẽ nhánh** (`R`):
   ```csv
   R,route_pass,score >= 80,jump_to_end_pass
   R,route_fail,score < 80,jump_to_end_retake
   ```

---

## 6. Ma trận điểm SPSS

Mỗi đáp án (`A`) có cột `value` (trọng số điểm). Biến số `V` tính tổng:

```csv
V,score,number,0,q_1 + q_2 + q_3 + q_4 + q_5,0
```

---

## 7. Mẫu CSV đầy đủ (Tiếng Việt)

```csv
class,name,external_id,text,help,relevance,order,mandatory,parent_external_id,question_external_id,type/scale,type,value,calculation,other,language
S,AILAB_Khao_sat_Adaptive,,,Adaptive AI LAB Survey,,,,,,,vi,,,,,
G,sec_1,SEC_1,Phần 1: Kiến thức Chung,Phần đánh giá kiến thức,,0,y,,,,,,,,
Q,q1,Q1,Đâu là thủ đô của Việt Nam?,Chọn 1 đáp án đúng,,0,y,,SEC_1,L,,,,formbricksType=multipleChoiceSingle,vi
A,a1,A1,Hà Nội,,,,0,,,Q1,,,10,,,vi
A,a2,A2,TP. Hồ Chí Minh,,,,1,,,Q1,,,0,,,vi
A,a3,A3,Đà Nẵng,,,,2,,,Q1,,,0,,,vi
A,a4,A4,Cần Thơ,,,,3,,,Q1,,,0,,,vi
Q,q2,Q2,Bạn đánh giá thế nào về trải nghiệm học tập?,Thang điểm 1-5,,1,y,,SEC_1,5,,,,formbricksType=rating;range=5;scale=number,vi
G,sec_2,SEC_2,Phần 2: Đánh giá Tự luận,,q1 == "A1",2,y,,,,,,,,
Q,q3,Q3,Hãy cho biết ý kiến đóng góp của bạn.,Viết ngắn gọn,,0,n,,SEC_2,S,,,,formbricksType=openText;longAnswer=y,vi
V,score,SCORE,Tổng điểm,,,,0,,,,number,,q_1 + q_2 + q_3,,
R,route_pass,ROUTE_PASS,score >= 80,,,,0,,,,,,jump_to_end_pass,,
R,route_fail,ROUTE_FAIL,score < 80,,,,1,,,,,,jump_to_end_retake,,
```

---

## 8. Quy tắc Idempotency & Chất lượng

- Mọi `G`, `Q`, `V` phải có `external_id` duy nhất, xác định, ASCII, bắt đầu bằng chữ cái.
- Group ID (`G`) là mỏ neo phần; mọi `Q` dưới `G` thuộc nhóm đó trừ khi `parent_external_id` chỉ định khác.
- Tham chiếu đến group/option/subquestion không tồn tại = lỗi.
- File phải UTF-8; importer tự fallback windows-1258 cho text tiếng Việt bị hỏng.
- Kích thước file < 10 MiB.

---

## 9. Checklist bàn giao

Trước khi bàn giao file:

1. Dòng tiêu đề dùng đúng tên cột (CSV) hoặc tên sheet (Excel).
2. Mọi `external_id` duy nhất, ASCII, bắt đầu bằng chữ cái, ≤ 128 ký tự.
3. Mọi `parent_external_id` tham chiếu đúng.
4. `type/scale` từ bảng mã; `formbricksType` trong `other` hợp lệ.
5. Matrix có dòng `SQ`; câu hỏi chọn có ≥ 2 dòng `A`; Yes/No không có dòng `A`.
6. Biểu thức dùng toán tử hỗ trợ, ngoặc `{}` tùy chọn.
7. Kích thước file < 10 MiB, encoding UTF-8.
8. Có dòng `G` mỗi phần.
9. Ngôn ngữ mặc định: `vi`.
10. Biến số điểm (`V`) và luật rẽ nhánh (`R`) đúng cú pháp.

Xuất file với đuôi `.csv` hoặc `.xlsx` (ví dụ `AILAB_<Tên>_<v1>.csv`), sẵn sàng nạp tại **AI Lab → Survey Import**.