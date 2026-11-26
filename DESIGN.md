# Design system

Inherit the existing Forte concept preview; this is an Operate surface, implemented directly in code. The participant reads financial figures at a desk or on a phone in normal daylight: use a light, high-contrast workspace.

## Tokens
- Brand: #96134d; brand hover: #78103e; subtle brand: #f7eaf0.
- Canvas: #f8f7f9; panels: #ffffff; ink: #27212a; secondary: #716974; borders: #e8e3e8.
- Caution: #9a5a13 on #fff7e9. Negative state: #b13844 on #fff0f1. These describe extraction issues, never a person's creditworthiness.
- Typography: system UI sans stack with Cyrillic support; 14px body, 12px secondary, 28px workspace heading, tabular financial numbers.
- Radius: 12px panels, 8px controls. Borders rather than decorative shadows.

## Composition
Persistent narrow left navigation on desktop; compact top navigation on mobile. One primary upload panel before a file exists. Once loaded, financial totals above a debt breakdown and payment-to-income comparison; full obligations and field provenance get dedicated tabs. Use real controls, readable tables and visible missing values.

## Behavior
150ms state transitions, reduced-motion support, explicit focus rings, responsive document review, upload errors inline. No invented AI typing, simulated progress, credit-health grades or approval predictions.

