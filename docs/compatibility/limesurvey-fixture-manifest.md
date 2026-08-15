# LimeSurvey fixture corpus manifest

## Scope and handling

This manifest records the LimeSurvey design exports currently available in the separate, local legacy
checkout. It intentionally contains no survey prompts, answer labels, contact values, participant data,
responses, tokens, or credentials. Source files are not copied into this repository.

The inventory was generated on 2026-07-29. SHA-256 identifies the exact local source revision so that
future sanitized fixtures can be traced without redistributing the source content.

Privacy status meanings:

- `synthetic`: maintained in this repository and suitable for automated tests.
- `metadata-only`: automated pattern scanning found no obvious email, phone, IP address, credential URL,
  or secret assignment; manual content and licensing review is still required before copying.
- `quarantined`: a sensitive field or value was detected; the source must be transformed and manually
  reviewed before it can become a test fixture.

## Committed fixture

| Fixture                        | Format        | Privacy status | Intended coverage                                                                         |
| ------------------------------ | ------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `fixtures/phase-0-minimal.csv` | Canonical CSV | synthetic      | Survey/group records, choice and numeric questions, relevance, answers, and a calculation |

## Local source inventory

The paths below are relative to the separate legacy checkout's `.upstream/limesurvey/` directory.

| Source                                                | Format                   |     Size | Logical records                                                                            | SHA-256                                                            | Privacy status |
| ----------------------------------------------------- | ------------------------ | -------: | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------- |
| `AILAB_Standard_Adaptive_Survey_2026.lss`             | LimeSurvey XML           |  7,307 B | 1 survey, 3 groups, 3 questions, 2 answers                                                 | `0654f10270dedc643bbbc6ac0430fc6cf470e20817920f90c1dc98cab3d883d2` | quarantined    |
| `AILAB_120Q_Advanced_Adaptive_Survey_2026.csv`        | LimeSurvey TSV-style CSV | 31,792 B | 1 survey-language row, 6 survey rows, 8 groups, 120 questions, 37 subquestions, 36 answers | `76ca5f535f53e6bbb183706c4281aee0f5f2ff2558b569cdfb8dc2d2725c3652` | metadata-only  |
| `AILAB_120Q_Advanced_Adaptive_2026.csv`               | LimeSurvey TSV-style CSV | 17,713 B | 1 survey-language row, 6 survey rows, 8 groups, 120 questions, 36 subquestions, 35 answers | `b32cadf0619f1ac6fa661a768bf51e630940ec81dd4a6d94465ddeabbdcf1b47` | metadata-only  |
| `AILAB_Experiment_Forms_60Q_Adaptive_Survey_2026.csv` | LimeSurvey TSV-style CSV | 10,258 B | 1 survey-language row, 1 survey row, 6 groups, 60 questions, 7 answers                     | `b60f7d26cdf890f497ac0f6a160e261f9a97707283531d3f92744aa516b36514` | metadata-only  |
| `AILAB_Friendly_Form_Creator_Template_2026.csv`       | Authoring CSV            |  1,714 B | 6 data rows                                                                                | `4711ef19b4e1bb1eb496a6bc0b9ba2607f6904e95ea842edf92e2c269a169054` | metadata-only  |

The `.lss` source contains one email-shaped value in its survey administration fields. The manifest
does not reproduce it. The source also declares an `adminemail` field, so anonymization must replace
both administrative identity fields and values while preserving structural validity.

## Observed source capabilities

The `.lss` export contains these LimeSurvey entities:

- survey settings and localized survey settings;
- groups and localized group metadata;
- questions and localized question text/help;
- answers and localized answer labels;
- question/group relevance, mandatory flags, ordering, language, and survey presentation settings.

The three LimeSurvey CSV exports use the columns `class`, `type/scale`, `name`, `relevance`, `text`,
`help`, `language`, `mandatory`, and `other`. Their observed class records are survey (`S`),
survey-language (`SL`), group (`G`), question (`Q`), subquestion (`SQ`), and answer (`A`).

The authoring CSV uses six columns for group name, question code, question text, question type, choices,
and adaptive response rule. It is a separate adapter contract and must not be assumed to be a native
LimeSurvey export.

## Required anonymization before promotion

Before promoting any local source into `fixtures/`, generate a new derivative rather than editing the
source in place:

1. Replace survey IDs, group IDs, question IDs, answer IDs, codes, titles, prompts, help, and labels with
   deterministic synthetic values.
2. Replace administrator names and email addresses, URLs, organization names, and free text.
3. Preserve entity counts only where needed for a scale test; otherwise minimize the fixture.
4. Preserve expression topology and question-type combinations while rewriting identifiers and literals.
5. Remove tokens, participants, responses, attachments, audit records, timestamps, and IP addresses if
   they appear in future exports.
6. Scan the derivative for personal data and secrets, review it manually, record its provenance and
   license decision, then assign a new checksum.

## Corpus gaps

The current sources do not prove coverage for `.lsa` archives, XLSX imports, database extraction,
bilingual localization, quotas, token tables, participants, responses, attachments, plugins, themes,
audit history, malformed input, or a production-scale snapshot. These remain Phase 0 acquisition and
sanitization requirements; none should be inferred from file names alone.
