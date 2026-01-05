# Enhanced Money Module for Saltcorn

The enhanced Money module extends the original Saltcorn money plugin to provide advanced features for handling monetary values in database-backed applications. It maintains core functionality for decimal precision and currency formatting while adding client-side masking, locale support, real-time calculations via formulas, readonly modes, custom CSS, and animations for better user experience.

### Key Features
- **Core Money Type**: Stores values as decimals with configurable precision and optional ISO 4217 currency.
- **Formatting and Masking**: Automatic currency input masking in edit views (e.g., "R$ 1.234,56") with locale-aware display.
- **Locale Support**: Customizable formatting locales (e.g., 'pt-BR') for international use.
- **Real-Time Calculations**: Formulas for dynamic computations (e.g., {field1} * {field2}) that update on input changes.
- **Readonly Mode**: Checkbox to make fields display-only with auto-updates.
- **Custom CSS**: Per-field styling overrides via code input.
- **Animations**: Visual feedback on value updates.

### Installation
Clone or fork the enhanced repository, then install via Saltcorn's plugin manager or npm. See detailed steps below.

### Configuration
Configure fields in Saltcorn's table editor: set attributes like decimal_points, currency, locale; in edit view, enable readonly, add formulas, or custom CSS.

---

This README.md documents the enhanced version of the Saltcorn money module, building on the original plugin from https://github.com/saltcorn/money. The original provides a basic "Money" field type for decimal values with precision and optional currency, using simple number inputs and locale-aware display formatting. Enhancements focus on user experience, internationalization, and dynamic features, making it suitable for financial apps, e-commerce forms, or any scenario requiring interactive monetary inputs.

#### Original vs. Enhanced Comparison
The original module (version 0.1.4) is lightweight, with minimal files (.gitignore, LICENSE, README.md, package.json, index.js). It exports a plugin for Saltcorn's field types API, defining "Money" as a decimal SQL type. Key original components:

| Component | Original | Enhanced |
|-----------|----------|----------|
| **Attributes** | decimal_points (Integer, default 2, required, immutable), currency (String, optional ISO 4217). | Added locale (String, default "en", e.g., 'pt-BR'). |
| **Fieldviews - Show** | Configurable currency, decimal_points, currencyDisplay (symbol/code/narrowSymbol/name); run formats value with toLocaleString using request locale or "en". | Unchanged, but benefits from new locale attribute. |
| **Fieldviews - Edit** | Simple <input type="number" step="any"> with basic classes/attributes. | Enhanced with text input for masking, client-side formatting script, readonly checkbox (Bool), formula (Code for JS expressions), custom CSS (Code for per-field styles). |
| **Read Functions** | readFromDB: String to number; read: Handles empty strings to null, +v conversion. | Improved read to parse formatted currency strings (remove symbols/separators, handle commas/dots). |
| **Other** | Legacy SQL fallback; no advanced features. | Real-time calculations (eval-based, with error handling), animations on updates, global script initialization to avoid duplicates. |

Enhancements were developed iteratively to address limitations like plain number inputs (no masking), lack of locale config, no parsing for formatted submissions, and absence of dynamic calculations/animations.

#### Installation and Setup
1. **Clone/Fork**: Download from your enhanced repo or fork the original and apply changes.
2. **Install in Saltcorn**: In Saltcorn admin, go to Settings > Plugins > Add Plugin, enter the GitHub URL or local path. Or via CLI: `saltcorn install-plugin @saltcorn/money` (update for enhanced version).
3. **Dependencies**: Relies on @saltcorn/markup/tags and @saltcorn/data/db/state; no additional installs needed.
4. **Database**: On field creation, sets immutable decimal precision; use in PostgreSQL/MySQL/SQLite as per Saltcorn.

#### Features in Detail
- **Automatic Input Formatting**: Client JS listener strips non-digits, scales by decimal points (e.g., /100 for 2 decimals), and applies toLocaleString for currency (e.g., 'pt-BR', BRL). Supports initial values and placeholders.
- **Locale Configuration**: New attribute for per-field locales, defaulting to "en"; overrides request locale for consistent formatting.
- **Data Parsing**: Enhanced `read` function cleans formatted strings (e.g., "R$ 1.234,56" → 1234.56), handling commas/dots/symbols for reliable DB saves.
- **Real-Time Calculations**: In edit config, "Formula" (code input) allows JS expressions (e.g., 'teste1 + teste2 * 0.1'). Global script parses/replaces field names, evaluates with eval, updates value, and triggers animation. Empty formula disables.
- **Readonly Mode**: Bool checkbox renders input as readonly; combines with formulas for display-only calculated fields.
- **Custom CSS**: Code input for per-field styles; placeholders like {$id} replaced with ID (e.g., .inputteste3). Injected via <style> if non-empty; defaults preserved otherwise.
- **Animations**: On updates, animarInput() removes/adds .animar class with reflow; requires @keyframes pulse (scale/color change) defined in app CSS.

#### Usage Examples
1. **Basic Money Field**: Create table field "price" as Money; set decimal_points=2, currency="BRL", locale="pt-BR". In edit form, input masks as "R$ 0,00".
2. **Calculated Readonly Field**: In edit config, check "Readonly", set formula "{quantity} * {unit_price}". Field updates live as other inputs change.
3. **Custom Styling**: Set CSS code ".{$id} { font-size: 2rem; color: green; }". Applies to specific input, e.g., larger green text.
4. **Error Handling**: Invalid formulas show "Erro no cálculo"; parsing handles negatives/decimals.

#### Known Issues and Limitations
- **Eval Security**: Formula uses eval for flexibility; safe for admins but avoid in untrusted environments (consider math.js for production).
- **Client-Side Only Calculations**: Visual previews; pair with Saltcorn calculated fields for DB storage.
- **Locale Support**: Requires full-ICU in Node.js for non-English locales; small-ICU may error.
- **Animation Dependency**: .animar and @keyframes pulse must be in app CSS; not bundled.
- **Multiple Fields**: Global script initializes once; works for forms with <50 fields, but test large forms.

#### Contributing
Fork the repo, apply changes to index.js, test locally in Saltcorn, submit PR. Report issues for bugs in masking, parsing, or calculations.

#### License
MIT (as original).