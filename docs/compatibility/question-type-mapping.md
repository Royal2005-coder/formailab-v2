# Question type mapping

This matrix classifies the LimeSurvey structure types required by the migration inventory. Exact source codes must be verified against exported fixtures before production import; names and target behaviours are normative.

| Lime type | Meaning | Canonical type | Class | Formbricks target |
|---|---|---|---|---|
| `5` | 5-point choice | `rating` | `compiled` | Rating |
| `A`, `B`, `C`, `E`, `F`, `H` | Array variants | `matrix` | `compiled` | Matrix plus normalized choices |
| `1` | Dual-scale array | `matrix` | `extended` | Two linked matrix definitions |
| `:`, `;` | Array numbers/text | `matrix` | `extended` | Matrix with typed cell validation |
| `D` | Date/time | `date` | `native` | Date |
| `G`, `Y` | Binary choice | `singleChoice` | `compiled` | Multiple choice single |
| `I` | Language switch | `display` | `unsupported` | Survey language control, not a response question |
| `K` | Multiple numerical input | `numeric` | `compiled` | Ordered numeric questions/group |
| `L`, `!` | List radio/dropdown | `singleChoice` | `native` | Multiple choice single |
| `M` | Multiple options | `multipleChoice` | `native` | Multiple choice multi |
| `N` | Numerical input | `numeric` | `compiled` | Open text number |
| `O` | List with comment | `singleChoice` | `compiled` | Choice plus conditional open text |
| `P` | Multiple options with comments | `multipleChoice` | `compiled` | Multi-choice plus comment questions |
| `Q` | Multiple short text | `openText` | `compiled` | Ordered open-text questions/group |
| `R` | Ranking | `ranking` | `native` | Ranking |
| `S`, `T`, `U` | Short/long/huge free text | `openText` | `native` | Open text with size metadata |
| `X` | Text display | `display` | `compiled` | Description/section element |
| `|` | File upload | `fileUpload` | `native` | File upload |
| `*` | Equation | `equation` | `extended` | Calculated variable; optionally display result |

Formbricks-native types without a direct Lime type remain supported canonical targets: `consent`, `rating`, and specialized metrics can be emitted by an AI LAB workbook without claiming Lime format parity.
