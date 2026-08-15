# AI LAB Survey migration roadmap

## Objective

Migrate supported LimeSurvey behaviour and data into Formbricks Community while keeping Formbricks as
the system of record. The compatibility layer must translate source data through the versioned
Canonical Survey contract. The legacy PHP application is a behavioural reference and migration source,
not a deployable dependency of the target system.

Infrastructure rollout is not part of product acceptance. Terraform, Kubernetes, Argo CD, Cloudflare,
and production cutover begin only after the end-to-end demo is accepted and the required domain and
cloud access are available.

## Delivery rules

- Do not claim compatibility without naming the source format, capability, and compatibility class.
- Do not publish a survey with unresolved publish-blocking diagnostics.
- Keep published Canonical Survey versions immutable.
- Scope every persisted operation and authorization decision to its workspace or organization.
- Make imports, response replay, and migration batches idempotent.
- Preserve unsupported source data in an auditable archive and compatibility report.
- Require tests, lint, typecheck, build, and phase-specific acceptance evidence before closing a phase.

## Phase 0: Freeze scope and evidence

Deliverables:

- Inventory representative LimeSurvey exports, database versions, plugins, themes, and integrations.
- Define Canonical Survey v1.1 and an explicit unsupported-capability policy.
- Classify personal, sensitive, attachment, token, and audit data.
- Build an anonymized golden fixture corpus.

Acceptance:

- Every observed LimeSurvey question and expression capability has a compatibility class.
- The fixture corpus covers bilingual surveys, every observed question type, nested relevance,
  calculations, matrices, quotas, tokens, malformed inputs, and a production-scale snapshot.
- Licensing, clean-room ownership, and security review decisions are recorded.

## Phase 1: Harden import and compilation

Deliverables:

- Adapters for supported CSV/XLSX, LimeSurvey `.lss`/`.lsa`, and database extraction.
- Canonical support for required validation, logic, endings, scoring, quota, and research metadata.
- Deterministic canonical serialization and checksums.
- A Canonical Survey to Formbricks compiler with a source-to-target crosswalk and compatibility report.
- Static expression reference and type validation plus deterministic route graph validation.

Acceptance:

- Repeated import produces byte-equivalent canonical output and the same checksum.
- Diagnostic locations identify the source file, sheet or table, row, column, and entity.
- Source-to-canonical-to-Formbricks entity crosswalk is complete.
- Unsupported publish-blocking capabilities prevent publication.

## Phase 2: Persistence and authorized import API

Deliverables:

- Verified PostgreSQL migration and repository integration tests.
- Import, version, approval, publication, supersede, and rollback state transitions.
- Concurrency retry or conflict handling for serializable version creation.
- Workspace authorization, tenant isolation, audit events, and immutable publication checks.
- A transactional import API that creates or updates the target Formbricks Survey.

Acceptance:

- Replaying an import creates no duplicate job, version, publication, or target survey.
- A failed transaction leaves no partial rows.
- Cross-workspace survey, version, job, and publication requests are rejected.
- Publication verifies the stored canonical checksum, approved status, diagnostics, and target ownership.

## Phase 3: Import and review experience

Deliverables:

- Upload, validate, compatibility summary, preview diff, manual-review resolution, commit, approve, and
  publish workflow.
- Formbricks design-system components, accessible interactions, and `react-i18next` strings.
- Playwright coverage for successful import and important failure paths.

Acceptance:

- A user can import a golden LimeSurvey fixture and publish a working Formbricks survey without direct
  database access.
- Error, warning, unsupported, and manual-review states are visible and actionable.
- Refreshing or retrying any workflow step does not duplicate persisted work.

## Phase 4: Runtime parity

Deliverables:

- Formbricks runtime support for compiled question, matrix, display, equation, and routing behaviour.
- Client and server expression parity.
- Participant assignment, token, resume, autosave, atomic quota, and deterministic route-trace support.

Acceptance:

- The same answer sequence produces the same visible route, ending, calculation values, and score in the
  legacy fixture oracle and target runtime, within declared tolerances.
- Client and server route traces are identical.
- Autosave, completion, quota reservation, and retry behaviour are idempotent.

## Phase 5: Response migration

Deliverables:

- Source extraction into an immutable raw archive.
- External-ID crosswalks and normalized Formbricks responses.
- Checkpointed, restartable migration batches for responses, events, participants, and attachments.
- Shadow-read or dual-write validation before cutover.

Acceptance:

- Survey, question, option, participant, response, and answer reconciliation passes.
- There are no orphan, duplicate, or cross-tenant records.
- Attachment checksums match and every batch is accounted for.
- Replaying a completed batch produces no additional records.

## Phase 6: Research analytics and export

Deliverables:

- Ported scoring, quality, benchmark, dashboard, and codebook behaviour.
- Auditable CSV/XLSX and approved statistical export formats.
- Minimum-cohort and sensitive-data controls.

Acceptance:

- Golden responses produce scores within the declared tolerance.
- Export schemas and value labels match the approved codebook.
- Privacy controls are enforced at query and export boundaries.

## Phase 7: Rehearsal and cutover

Deliverables:

- Snapshot, backfill, delta replay, reconciliation, read-only window, final delta, and traffic-switch
  runbooks.
- Feature-flag or DNS rollback, backup, restore, and disaster-recovery rehearsal.

Acceptance:

- Zero publish-blocking diagnostics, orphan records, and cross-tenant records.
- All migration batches and deltas are accounted for.
- Restore and rollback rehearsals meet the agreed recovery objectives.

## Phase 8: Production infrastructure

Prerequisites:

- Product demo and migration rehearsal accepted.
- Domain, Cloudflare account, cloud account, cluster, registry, and secret-management access supplied.

Deliverables:

- Reproducible container images, SBOM, vulnerability policy, and secret injection.
- Terraform-managed cloud resources.
- Kubernetes workloads and policies delivered through Argo CD.
- Cloudflare DNS, TLS, edge security, observability, backup, restore, and operational runbooks.

Acceptance:

- Staging and production are reproducible from version-controlled configuration.
- Deploy, rollback, backup, restore, and alert paths are demonstrated.
- No production secret or credential is committed to the repository.
