---
status: accepted
---

# Clean-room compatibility layer

AI LAB Survey will reproduce LimeSurvey behaviours through a canonical survey contract and Formbricks adapters, without copying LimeSurvey source code or treating its GPL formats as a requirement. This keeps Formbricks upgrades possible and makes each capability independently classifiable as native, compiled, extended, or unsupported.

## Consequences

Behaviour parity, format parity, and explicitly unsupported features must be reported separately. The canonical definition is the seam between import/compatibility modules and Formbricks runtime; published versions remain immutable.

The persistence seam stores every canonical version as an immutable snapshot with its checksum. Import attempts are workspace-scoped and idempotent; publications point to exactly one immutable version and one Formbricks runtime survey.
