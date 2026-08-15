---
name: ai-lab-survey-import
description: Generate idempotent LimeSurvey / Adaptive Engine v2.0 CSV or Excel (.xlsx) test banks for the Formbricks AI LAB Survey import (upload at AI Lab -> Survey Import, up to 10 MiB, validated and previewed before commit).
---

# AI LAB Survey Import — CSV / Excel Skill

Use this skill when the user asks to build a survey test bank, question set, or LimeSurvey / Adaptive Engine v2.0 CSV or Excel file for the **AI LAB Survey Import** page, or wants a CSV/Excel "mẫu chuẩn" (standard template) matching the app's download: `/sample-csv/AILAB_120Q_Advanced_Adaptive_2026_Master_Template.xlsx`.

The import pipeline (`importLegacyCsv` / `importCanonicalWorkbook` in `@formbricks/survey-compiler`) is **idempotent**: every entity is keyed by a deterministic `external_id`, re-importing the same file never duplicates, and ordering is explicit.

## Output format

Produce the deliverable as a downloadable file:

- **CSV**: UTF-8 (BOM optional), header row + data rows, `class` in column 1. Semicolon-free, comma-separated; quote values containing commas or newlines. Keep under 10 MiB.
- **Excel**: `.xlsx` workbook with the sheets `Survey`, `Groups`, `Questions`, `Options`, `Logic`, `Variables`, `Quotas` (optional: `Guide`, `DataDictionary`, `ExpressionExamples`, `Compatibility`), one row per record, exact required columns listed below.

## 1. CSV row classes (column `class`)

| class | Meaning | Key columns |
| :--- | :--- | :--- |
| `S` | Survey settings | `name`, `language` |
| `SL` | Survey language row | `name = surveyls_title`, `language`, `text` |
| `G` | Group / section | `name` (or `external_id`), `text` (title), `relevance`, `order` |
| `Q` | Question | `name`/`external_id`, `type/scale` (LimeSurvey code), `text`, `help`, `relevance`, `order`, `mandatory`, `other` (metadata) |
| `V` / `E` / `EQ` / `CALC` / `VARIABLE` | Variable / equation | `name`, `type`, `calculation` (or `value`/`text`), `order` |
| `A` | Answer option | `parent_external_id` (or `question_external_id`), `text`, `value`, `order` |
| `SQ` | Matrix subquestion (row) | `parent_external_id`, `text`, `value`, `order` |
| `R` | Routing / relevance rule | `parent_external_id` (target question/group `external_id`), `relevance` |

### Common columns (all rows)

`class`, `name`, `external_id`, `text`, `help`, `title`, `relevance`, `order`, `mandatory`, `parent_external_id`, `question_external_id`, `type/scale`, `type`, `value`, `calculation`, `other`, `language`

- `external_id`: ASCII slug (max 128 chars), must start with a letter. The importer normalizes it (strip diacritics, non-alphanumerics → `_`, e.g. `Câu hỏi 1` → `Cau_hoi_1`). Reuse it to update an entity idempotently.
- `language`: e.g. `vi` or `en-US`; the row's `text`/`help` is tagged with that language. Multi-language = repeat the entity row with the same `external_id` and different `language` (rows merge by `external_id`).
- `order`: numeric position (0-based) within its parent.
- `mandatory`: `y`/`yes`/`true`/`1` = required.
- `other` (metadata, semicolon-separated `key=value`): `formbricksType=statement|consent|multipleChoiceSingle|multipleChoiceMulti|rating|openText|variable|ranking|matrix|csat|ces|nps`, `displayType=list|dropdown`, `shuffleOption=none|all|exceptLast|reverseOrderOccasionally|reverseOrderExceptLast`, `longAnswer=y`, `inputType=text|email|url|number|phone`, `placeholder=...`, `range=3|4|5|7|10`, `scale=number|smiley|star`.

## 2. Question type codes (column `type/scale`)

| Code | LimeSurvey name | Canonical type |
| :--- | :--- | :--- |
| `5` | 5-point choice | `rating` (range 5) |
| `S` | Short free text | `openText` |
| `T` | Long free text | `openText` |
| `U` | Huge free text | `openText` |
| `N` | Numerical input | `numeric` |
| `L` | List (radio) | `singleChoice` → `multipleChoiceSingle` |
| `!` | List (dropdown) | `singleChoice` → `multipleChoiceSingle` |
| `O` | List with comment | `singleChoice` |
| `M` | Multiple choice (checkbox) | `multipleChoice` → `multipleChoiceMulti` |
| `P` | Multiple choice with comments | `multipleChoice` |
| `Y` | Yes/No | `singleChoice` (auto options: `Có` / `Không`) |
| `G` | Gender / binary | `singleChoice` |
| `F` | Array (matrix) | `matrix` |
| `A` | Array 5-point | `matrix` |
| `B` | Array 10-point | `matrix` |
| `C` | Array yes/no/uncertain | `matrix` |
| `E` | Array increase/same/decrease | `matrix` |
| `H` | Array by column | `matrix` |
| `:` | Array numbers | `matrix` |
| `;` | Array texts | `matrix` |
| `1` | Dual-scale array | `matrix` |
| `K` | Multiple numerical input | `numeric` |
| `Q` | Multiple short text | `openText` |
| `R` | Ranking | `ranking` |
| `D` | Date / time | `date` |
| `X` | Boilerplate / text display | `display` |
| `I` | Language switch | `display` |
| `\|` | File upload | `fileUpload` |
| `*` | Equation | `equation` |

Friendly aliases also work in `type/scale`: `openText/text/string`, `singleChoice/radio/list/dropdown/select`, `multipleChoice/checkbox/multi`, `rating/scale/stars`, `matrix/grid/array`, `ranking/order`, `date/datetime/time`, `display/boilerplate/info/html`, `fileUpload/file/upload`, `equation/calc/calculation`.

Behavior notes:

- **Matrix** questions: `SQ` rows define row labels; `A` rows define columns. If no `A` rows are given, columns default to `1..5`. Always provide `SQ` rows for a usable matrix.
- **Rating** questions default to range 5 / scale `number`; override with `other` metadata (`range=7`, `scale=star`).
- **Yes/No (`Y`)** questions get `Có` / `Không` options automatically — do not add `A` rows.
- **Equation / variable rows** (`V`/`E`/`CALC`): put the expression in `calculation`; support `value`/`text` fallbacks.

## 3. Expression / LimeScript AST syntax (columns `relevance`, `calculation`)

Expressions are plain text (optionally wrapped in `{...}`); the importer unwraps braces and converts `""` → `"`.

- **Comparisons**: `==`, `!=`, `>`, `<`, `>=`, `<=`
- **Containment**: `in`, `contains` (e.g. `q_01 in ["A","B"]`, `q_02 contains "AI"`)
- **Logical**: `&&`, `||`, `!`
- **Arithmetic**: `+`, `-`, `*`, `/` (for `equation` / variable calculations)

Examples:

- Branching: `q_5 == "Không"` on a question row → the question only shows when the answer equals `Không`.
- Group relevance: `q_1 in ["A","B"]` on a `G` row → the whole section shows conditionally.
- Score variable (`V`): `calculation = q_1 + q_2 + q_3`, type `number`.
- Use `R` rows (class `R`) to attach a `relevance` expression to an existing question/group by `parent_external_id`.

## 4. Idempotency & quality rules

- Every `G`, `Q`, `V` row must have a unique, deterministic `external_id` (never random). Re-uploading the same content with the same IDs updates rather than duplicates.
- Group IDs (`G`) act as section anchors; every `Q` below a `G` belongs to that group unless `parent_external_id` says otherwise. A missing `G` creates a default group `GROUP_1` (title "Thông tin Khảo sát") — always declare explicit groups.
- Questions referencing a missing group/option/subquestion produce errors (`csv.option.question_missing`, `csv.rule.target_missing`) — reference only IDs that exist in the file.
- Answer option `value` defaults to `name`/row text; keep `value` short and unique per question.
- The whole file must be UTF-8; the importer auto-falls back to windows-1258 for corrupted Vietnamese text.

## 5. Excel workbook sheets & required columns

| Sheet | Required columns |
| :--- | :--- |
| `Survey` | `external_id`, `default_language`, `title` |
| `Groups` | `external_id`, `order`, `title` |
| `Questions` | `external_id`, `group_external_id`, `type`, `order`, `text`, `mandatory` |
| `Options` | `external_id`, `question_external_id`, `order`, `value`, `label` |
| `Logic` | `external_id`, `target_external_id`, `expression`, `action` |
| `Variables` | `external_id`, `type`, `name`, `default_value`, `calculation` |
| `Quotas` | `external_id`, `limit`, `expression`, `outcome` |

Every required column must exist (extra columns are allowed). Row data mirrors the CSV semantics above (`type` in `Questions` accepts the same LimeSurvey codes / friendly names; `group_external_id` / `question_external_id` link rows).

## 6. Delivery checklist

Before handing over a generated file, verify:

1. Header row uses the exact column names (CSV) or sheet names (Excel) above.
2. Every `external_id` is unique, deterministic, ASCII, letter-first, ≤ 128 chars.
3. All `parent_external_id` / `question_external_id` references resolve.
4. `type/scale` codes are from the table (or friendly aliases); `formbricksType` in `other` is one of the supported list.
5. Matrix questions have `SQ` rows; choice questions have ≥ 2 `A` rows; Yes/No questions have none.
6. Expressions use the supported operators, braces optional.
7. File size < 10 MiB, encoding UTF-8.
8. Include a `G` row per section and order rows explicitly with `order`.

Output the file with a `.csv` or `.xlsx` extension (e.g. `AILAB_<Tên>_<v1>.csv`), ready for direct upload at **AI Lab → Survey Import** — the page will preview groups/questions/options/variables, show compatibility diagnostics, and only then commit.
