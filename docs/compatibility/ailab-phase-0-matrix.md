# AI LAB Survey Phase 0 compatibility matrix

Phase 0 is a specification gate. A capability is not “complete” until its class, source syntax, target behaviour, and observable acceptance test are recorded.

| Capability | Formbricks baseline | AI LAB class | Phase 0 acceptance |
|---|---|---|---|
| Survey elements and endings | Native | `native` | Every current element type has a mapping or explicit unsupported result |
| Groups/sections | Ordered blocks/elements | `compiled` | Group order and shared relevance have a deterministic mapping |
| Basic conditions | Conditions and connectors | `native` | Operators and unknown-value behaviour are documented |
| Jump/required actions | Block logic actions | `native` | Route graph rejects cycles and unreachable targets |
| Numeric/text variable actions | Existing calculate actions | `native` | Existing behaviour is preserved by golden fixtures |
| Lime ExpressionScript subset | No general parser | `extended` | Tokenizer/parser/type-checker contract is defined; no arbitrary JS |
| Advanced calculations | Limited action operators | `extended` | Typed AST, dependency DAG, limits, and error semantics are defined |
| CSV survey import | CSV utilities exist, no canonical compiler | `compiled` | Stable external IDs, row/cell diagnostics, dry-run, idempotent commit |
| XLSX workbook template | Not a Lime format | `extended` | Sheet names, columns, template version, and checksum rules are fixed |
| Quotas | Not assumed in Community | `extended` | Transactional counter semantics and screen-out outcomes are defined |
| Participants/tokens | Partial/native integrations | `extended` | Token hashing, expiry, single-use and resume semantics are specified |
| Analytics and SPSS/Stata export | Basic response export | `extended` | Codebook, labels, missing values, and manifest checksums are specified |
| Enterprise RBAC/audit/SSO | Outside Community scope | `unsupported` for core fork | AI LAB ownership and security review are explicit |

## Canonical import contract

The first workbook version uses these sheets:

`Survey`, `Groups`, `Questions`, `Options`, `Logic`, `Variables`, `Quotas`.

Every row has a stable `external_id`; references use those IDs, never database IDs. An import produces `errors`, `warnings`, `counts`, `canonical_checksum`, and (for preview/commit) a compiled Formbricks payload. Commit is transactional and cannot mutate an active publication.

## Expression safety contract

Only a constrained grammar is accepted: literals, references, arithmetic/comparison, boolean operators, and approved functions (`if`, `coalesce`, `sum`, `avg`, `min`, `max`, `count`, `concat`, `round`). Evaluation is locale-independent and bounded by maximum AST depth, operation count, and wall-clock budget. Cycles, division by zero, unknown references, and type errors are diagnostics—not executable fallbacks.

## Golden scenarios

1. Import the same workbook twice: no duplicate groups, questions, options, variables, or rules.
2. A rule referencing a missing question reports the exact sheet and row.
3. A route cycle prevents publication.
4. Hidden answers do not enter calculations unless explicitly referenced.
5. Identical answers and policy version select the same next target.
6. Server and client evaluation return the same visible targets and calculated values.
