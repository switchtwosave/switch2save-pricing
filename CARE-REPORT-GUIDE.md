# Care Savings Report browser edition 1.1.0

Open `care-savings-report.html`, choose the original statement and one transaction
export, then create the report. The fictional sample runs the same importer and
renderer. `care-demo-files.zip` contains safe EPX-layout and Valor-format fixtures.

## Supported input

- Text-based, unlocked, complete calendar-month EPX statement PDF with its merchant
  cover, daily deposit detail, deposit summary, billing and interchange detail.
- Valor UTF-8 CSV or XLSX with one populated sheet. Headers are resolved by name.
  Differential and Custom Fee are aliases, counted once; conflicting values stop.
- Each input at most 20 MB; PDFs at most 100 pages; exports at most 50,000 card rows.
  Scanned PDFs, XLS, unfamiliar statements and macro-enabled workbooks are unsupported.

The importer checks the statement name, address, MID and period. The export store
name must match; an optional MID must agree. Cash, declined and voided rows are
excluded and logged. Unknown types/statuses, blank required money, debit surcharge,
duplicate transaction IDs and inconsistent amounts stop processing.

Every daily brand deposit must match a unique export group by exact sale/refund
counts and cents. Explicit settlement dates are used when present. Otherwise,
transaction-day groups may match a unique deposit within seven days; there is no
universal offset. Missing boundary records, combined-day deposits and ambiguous
matches need additional source evidence. In-period unmatched rows cannot be silently
dropped. Strongly linked same-day full reversals are removed only when the statement
corroborates them. Partial/ambiguous reversals need review.

Refund metadata is not deducted again. A credit refund with no explicit returned
surcharge requires an unambiguous original sale. Full-total refunds return its
surcharge; base-only/partial refunds retain it under the confirmed policy unless
explicitly returned. Unknown allocation stops. Source fees, brand/service volumes,
and the actual period Released to account must reconcile exactly. Unexplained
funding adjustments and unrecognized fee rows stop; no residual amounts are invented.

## Approved output

The engine reuses the approved September 30 calculation code, October 2 source-address
verification, exact branding assets and renderer geometry. The renderer correction
replaces a hard-coded refund total of two with the actual count, and avoids negative
zero refund displays. ReportLab runs in WebAssembly; no separate layout recreation.

The effective-rate headline excludes monthly service fees and uses sales less
refunds and retained surcharges as its denominator. Estimated annual savings includes
the actual monthly fee and uses the entered assumed comparison benchmark. Conditional
insurance/check-conversion savings are omitted without independently established
eligibility. Successful results include a PDF and separate audit with source hashes,
row dispositions, daily matches, refund basis, assumptions and normalized input.
Failed checks provide a discrepancy audit and no final PDF.

At most four brands and nine service rows fit the approved page. Overflow stops.
Automated checks do not replace an independent human source review. The initial
coverage does not automate every reconciliation supported by the analyst-led kit.

## Privacy, dependencies and source

All runtime assets are self-hosted. The page has no forms posting files, external
scripts, AI calls, analytics, cookies or browser persistence. Inputs are passed to
a Web Worker and kept in its memory-backed filesystem; each run clears input files,
and Clear files terminates the worker and revokes report/audit URLs. Downloaded files
remain on the user's device. The CSP restricts connections to the same origin.

`care-report-engine.zip` contains the Python source, exact assets, fictional fixtures,
pure-Python libraries and their license metadata. Pyodide 0.28.3, Pillow 11.3.0,
ReportLab 4.4.9, pypdf 6.10.0 and openpyxl 3.1.5 are pinned. PDF.js 6.4.299 renders
the in-page preview locally; the original generated PDF remains the download.
Download provenance and
SHA-256 values are in `care-dependencies.json`. No real merchant examples, original
statements or transaction exports are distributed.
