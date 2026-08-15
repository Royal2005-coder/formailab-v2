# AI LAB survey import schema v1

CSV accepts the legacy row classes below. XLSX uses normalized sheets and is the preferred authoring format. Both compile to `Canonical Survey schemaVersion: 1`.

## Legacy CSV rows

| Class | Meaning | Required references |
|---|---|---|
| `S` | Survey metadata | None |
| `SL` | Survey-language metadata | Survey |
| `G` | Group | Survey |
| `Q` | Question | Group |
| `SQ` | Subquestion/matrix row | Parent question |
| `A` | Answer option | Parent question |
| `V` | Calculated or assigned variable | Survey |
| `R` | Relevance/routing rule | Question, group, variable, or ending target |

Core columns are `class`, `type/scale`, `name`, `relevance`, `text`, `help`, `language`, and `mandatory`. Optional v1 columns are `external_id`, `parent_external_id`, `order`, `default_value`, `validation`, `min`, `max`, `score`, `weight`, `calculation`, `random_group`, `hidden`, `quota`, `ending`, `variable_label`, `value_label`, `measurement_level`, `missing_value`, and `tags`.

## XLSX sheets

| Sheet | Required columns |
|---|---|
| `Survey` | `external_id`, `default_language`, `title` |
| `Groups` | `external_id`, `order`, `title` |
| `Questions` | `external_id`, `group_external_id`, `type`, `order`, `text`, `mandatory` |
| `Options` | `external_id`, `question_external_id`, `order`, `value`, `label` |
| `Logic` | `external_id`, `target_external_id`, `expression`, `action` |
| `Variables` | `external_id`, `type`, `name`, `default_value`, `calculation` |
| `Quotas` | `external_id`, `limit`, `expression`, `outcome` |

Localized columns use a BCP-47 suffix, for example `title:en-US` and `title:vi`. Unknown sheets or columns are warnings; missing required columns, duplicate IDs, dangling references, invalid types, cycles, and unsafe expressions are errors.

## Import invariants

- Source bytes and canonical JSON each have a SHA-256 checksum.
- Validation and preview never mutate persisted surveys.
- Re-import is keyed by source checksum plus stable external IDs.
- A commit is transactional and cannot replace an active publication.
- Diagnostics carry severity, stable code, message, sheet, row, column, and external ID where known.
