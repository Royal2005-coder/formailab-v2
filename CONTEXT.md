# AI LAB Survey

This context defines the language for the AI LAB Survey compatibility layer around Formbricks Community. It describes research-survey behaviour without prescribing storage or UI implementation.

## Survey lifecycle

**Survey Version**:
An immutable definition of a survey structure and its behaviour. Responses belong to exactly one survey version.
_Avoid_: Draft, survey copy

**Publication**:
A reviewed survey version made available for response collection.
_Avoid_: Save, activate (unless collection is actually enabled)

**Route**:
The ordered path a respondent may follow through groups, questions, and endings.
_Avoid_: Flow, jump (a jump is one route action)

**Relevance Rule**:
A deterministic predicate that decides whether a survey target is applicable.
_Avoid_: Visibility flag, frontend condition

**Calculated Variable**:
A typed value derived from answers or other variables using the constrained expression language.
_Avoid_: Arbitrary formula, JavaScript expression

## Import and compatibility

**Canonical Survey**:
The versioned, tool-independent survey definition produced by an importer before compilation to Formbricks.
_Avoid_: Lime survey, Formbricks JSON

**Compatibility Class**:
The supported translation of a source capability: `native`, `compiled`, `extended`, or `unsupported`.
_Avoid_: Fully compatible (unless the specific capability and format are named)

**Import Job**:
An auditable attempt to validate, preview, or commit a source survey definition.
_Avoid_: Upload, migration (migration is reserved for persisted version changes)

**Dry Run**:
Validation and compilation preview with no mutation to a survey or response.
_Avoid_: Temporary import

## Response governance

**Route Trace**:
The recorded explanation of evaluated rules, selected targets, and calculated values for one response.
_Avoid_: Debug log

**Quality Flag**:
A review signal about response validity or research quality; it never silently deletes data.
_Avoid_: Invalid response (unless a reviewer has set that status)
