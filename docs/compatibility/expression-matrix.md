# Expression compatibility matrix

| Expression feature | Class | Required semantics |
|---|---|---|
| `and`, `or`, `not` | `native` | Nested condition groups |
| Equality and ordered comparison | `native` | Typed comparison; no locale coercion |
| Empty, set, submitted, skipped | `native` | Explicit missing/unknown state |
| Contains/prefix/suffix and option membership | `native` | Existing Formbricks operators |
| Answer, hidden-field, and variable references | `native` | Stable external ID resolution |
| Group/question relevance | `compiled` | Route predicates and deterministic fallbacks |
| `if`, `coalesce` | `extended` | Lazy branch evaluation and typed result |
| `sum`, `avg`, `min`, `max`, `count` | `extended` | Ignore-missing policy declared per call |
| `round`, arithmetic, weighted score | `extended` | Decimal result retained for routing; display rounding separate |
| `.NAOK` compatibility | `extended` | Missing answer converted according to documented function/operator context |
| `shown` and dynamic denominator | `extended` | Uses route state, not DOM visibility |
| Regex/date operations | `extended` | Bounded regex and ISO machine values |
| Arbitrary PHP/JavaScript or unknown function | `unsupported` | Publish-blocking diagnostic |

The compiler returns one classification per AST node and one overall classification per expression. Any `unsupported` node blocks publication; `extended` expressions require server/client parity fixtures before activation.
