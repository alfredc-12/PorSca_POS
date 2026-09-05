# PorSca POS Design System

## Design read

A task-first mobile POS for cashiers: calm, fast, legible, and native-feeling rather than decorative. The UI follows the Impeccable `Operate` guidance and Android Material conventions while remaining suitable for iOS through Expo.

## Visual direction

- Warm off-white background to reduce glare during long sessions.
- Deep green primary action color to communicate reliability and completed states without looking like a generic finance app.
- Strong dark text hierarchy, restrained borders, and very limited elevation.
- Rounded rectangles are functional containers only; avoid stacking decorative cards.
- No gradients, glassmorphism, neon glows, or ornamental dashboard chrome.

## Tokens

Source of truth: `src/theme/tokens.ts`.

- Background: `#F6F7F4`
- Surface: `#FFFFFF`
- Primary: `#1E6B4D`
- Primary soft: `#DDECE4`
- Text: `#17211A`
- Muted text: `#657066`
- Outline: `#D8DDD7`
- Danger: `#B42318`
- Warning: `#A15C00`

## Interaction rules

- Primary touch targets are at least ~48 dp high.
- System back gestures must work; routes use Expo Router rather than custom navigation traps.
- Camera scanning returns immediately to the POS after a valid product is recognized.
- Inventory is never deducted on a failed or pending payment.
- Error messages state both the problem and the next recovery action.
- Buttons use explicit action labels such as “Proceed to checkout” and “Confirm cash payment”.

## Core screens

### POS
The most important screen. Scan action first, cart second, quick-add fallback third, total and checkout last. This keeps the repeated cashier path visible without dashboard clutter.

### Scanner
Full camera preview, single high-contrast scan frame, concise instruction. No competing controls during scanning.

### Checkout
Large amount due, then a direct Cash / QR Ph choice. Cash exposes received amount and change. QR Ph reserves a clear payment area and status copy.

### Inventory
Compact summary followed by a simple editable product list. Product rows surface name, barcode, price, and current stock without a dense table.

### Sales
Chronological receipt-like records showing transaction ID, timestamp, payment method, paid status, and total.

## Accessibility and resilience

- Default body size is 16sp-equivalent and labels remain readable at increased font scale.
- Important state is never represented by color alone; paid/stock states also use text.
- Empty, permission-denied, invalid-input, insufficient-cash, missing-product, and out-of-stock paths are represented in the scaffold.
- Camera permission copy explains why the permission is needed.
