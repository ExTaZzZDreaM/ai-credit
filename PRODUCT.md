# Credit report pilot
<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
Closed pilot: upload a personal credit-bureau PDF, inspect extracted obligations, correct them and see reproducible descriptive analytics. The user has explicitly deferred improvement recommendations, approval forecasts and bank decision-engine integrations.

## Users
Pilot participants examining their own Kazakhstan PKB reports or Russian short-form GKB reports. Russian-language desktop and mobile web.

## Capabilities and Constraints
No external AI calls and no server-side storage of uploaded reports in this first increment. Parsing is rule-based and supports recognizable contract-detail fields; unsupported, incomplete and scanned reports must produce explicit limitations. Missing values never mean zero. Current and historical arrears differ. Card limits are not outstanding debt. Foreign currencies are not converted or added together. Income is user-provided and the resulting payment share is not an official KDN calculation. All extracted values remain provisional until the user checks them.

The income-share gauge describes known payments neutrally. It has no comfortable/moderate/high bands or built-in risk thresholds; incomplete or assumed data is explicitly labelled.

Evidence limits apply throughout the UI: no disposable-income or debt-free claims, no inference from inquiry counts to refusal reasons, and manual changes are distinguished from the PDF. Generic PKB periodic/minimum payments have assumed monthly frequency until confirmed, just as unknown-frequency GKB payments do. Unknown-currency amounts are shown individually and never summed. A source-total reconciliation warning keeps income shares and scenarios provisional even after selecting all represented loans.

PKB enrichment includes separately sourced card limits, scheduled contract dates and explicit historical maximum overdue days. Inquiry counts use rows of the supplied journal over 30/90 calendar days ending on the report date, independently of credit applications; requester names and identifiers are not retained. Optional contract fields remain editable with their original source values preserved.

## Stack
The site has six addressable pages: upload at `/`, overview at `/overview`, obligations at `/loans`, simulator at `/simulator`, editable review at `/review` and methodology at `/method`. Native navigation links use client-side history to keep the current report, income, scenario selections and unsaved form values in memory. Direct URLs and reloads work without storing credit data: report-dependent pages show a purposeful upload prompt until a PDF is loaded. Unknown addresses return an HTML 404 page. No localStorage, sessionStorage or server-side report sessions are used.

Implementation choice for the local first increment: Python standard-library HTTP server, PDFium for PDF text, pdfplumber for GKB table geometry, static HTML/CSS/JavaScript. This keeps financial calculation code independent of the UI. Original discussion proposed Streamlit; this implementation uses a custom interface while preserving the same workflow.

## Evidence on Hand
Existing Forte concept preview in the chat visualization directory establishes the burgundy, white and warm-neutral visual vocabulary. Parsing was checked against public PKB specimens, a supplied personal PKB report and a supplied short-form GKB report in a CMS container. User reports and personal identifiers are not included in regression fixtures. Reading a signed container does not verify its signature. GKB upcoming payments with unknown frequency may be included as explicitly marked monthly assumptions requiring confirmation; closed-contract summary counts do not create detailed loan records.

The full-closure simulator lets the participant select active borrower/co-borrower obligations, compare monthly payments and their share of entered income, and inspect selected known balances. Scenarios never change report records. Currencies remain separate; unknown amounts, source coverage gaps and monthly assumptions stay visible. Report balances are an estimate rather than a lender payoff quote. Mobile results remain visible while selecting loans.

## Product Principles
- Show provenance and missing information.
- Keep calculations deterministic and reviewable.
- Preserve the participant's control over the file.
- Label synthetic examples and incomplete totals clearly.

