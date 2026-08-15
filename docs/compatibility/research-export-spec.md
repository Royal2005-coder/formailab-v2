# Research export specification

Every export is generated from one immutable survey version and one explicit response filter. Machine-facing values remain stable and non-localized.

## Required formats

Phase delivery order is CSV, XLSX, JSON/data dictionary, SPSS syntax plus DAT, SAV/ZSAV, Stata DTA/DO, R import script, then Parquet. Unsupported formats must fail explicitly rather than silently degrading labels or missing-value metadata.

## Variable contract

Each variable records `name`, `question_external_id`, source label, value labels, data type, measurement level, missing values, group, language, and derivation. Exports support raw codes, labels, codes plus labels, wide/long layouts, one row per response, and one row per selected option.

## Manifest contract

The package manifest contains survey/version IDs, response/included/excluded counts, filters, definition checksum, data checksum, generated-at timestamp, format versions, and de-identification policy. Checksums cover canonical serialized bytes so an export can be reconciled independently.
