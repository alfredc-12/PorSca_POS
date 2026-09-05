# PorSca POS Design System

## Approved direction

The September 5 mockups are now the visual authority for the mobile application. PorSca is a task-first cashier tool, but it should feel like a warm neighborhood retail product rather than a plain CRUD utility: cream surfaces, fresh botanical green, restrained organic background shapes, generous rounded corners, soft depth, and dark navy typography.

The three primary tab views must read as one system:

- **POS** — search/scan, online status, cart, totals, payment selection, and checkout action.
- **Inventory** — the same PorSca header/search language, inventory health summary, product rows, stock states, and Add Product action.
- **Transactions** — the same header language, search/filter tools, sales summary, payment filters, and receipt-style transaction rows.

The bottom navigation is intentionally identical across all three screens. It has exactly three destinations — POS, Inventory, Transactions — and the selected destination sits inside a pale-green rounded rectangular highlight.

## Visual language

- Warm cream base instead of a stark white canvas.
- PorSca green is the main action and success color, not the color of every surface.
- Dark navy text provides stronger contrast and a more polished retail identity than pure black.
- Pale green, cream, yellow, blue, and red washes communicate state while keeping the app light.
- Large surfaces can use low-opacity organic leaf/plant shapes in the background. They are ambient texture only and never reduce legibility.
- Cards use subtle borders and soft downward shadows. No neon glow, heavy glassmorphism, or dark-dashboard styling.
- Rounded containers are used for meaningful groups: cart, inventory overview, transaction overview, payment selection, and editable forms.
- Icons come from the shared Ionicons family; do not substitute emoji or random glyph styles.

## Tokens

Source of truth: `src/theme/tokens.ts`.

Core values:

- Background: `#F8F5EE`
- Background green: `#F3F8EF`
- Surface: `#FFFCF8`
- Primary: `#078351`
- Primary pressed: `#066A45`
- Primary soft: `#E4F3E8`
- Primary wash: `#F0F8EE`
- Text: `#111936`
- Muted text: `#66728A`
- Outline: `#E3E2DB`
- Danger: `#E1272F`
- Warning: `#D89200`

## Shared app chrome

`src/components/Screen.tsx` owns the common PorSca visual shell:

- PorSca POS mark and tagline: **Good Products • Brighter Days**.
- Main Store selector.
- Cashier avatar/status marker.
- Warm botanical background texture.
- Consistent page spacing and safe-area behavior.

Tab navigation lives in `app/(tabs)/_layout.tsx` and must remain visually consistent with the approved mockups.

## Interaction rules

- Primary touch targets are at least ~48 dp high.
- System back navigation remains functional on Android and iOS.
- Scanning from POS adds a recognized product to the cart.
- Scanning from Inventory opens the existing product editor or prepares a new product with the scanned barcode.
- Inventory is deducted only after a successful cash confirmation or QR Ph payment confirmation.
- Search controls provide real filtering rather than decorative fields.
- Payment-method controls communicate selection with icon, text, border/state, and a check indicator — never color alone.
- Error messages name both the problem and the recovery action.

## Screen details

### POS

The cashier workflow is intentionally linear: search/scan → cart → total → payment method → proceed. Search results only appear while searching so the cart stays dominant. The cart provides quantity controls, stock visibility, subtotal/discount/total, and a secure payment handoff.

### Inventory

Search and inventory scanning sit above a four-part health summary: total products, healthy stock, low stock, out of stock. Product rows expose name, category/SKU, stock condition, price, and edit affordance. Stock states use green, amber, and red text/badges.

### Transactions

Search/filter sits above a summary for sales amount, completed sales, cash count, and QR Ph count. Filter chips support All, Today, Cash, and QR Ph. Transaction rows show receipt ID, time, item count, payment method, completed state, and total.

### Checkout

Checkout inherits the same cream/green visual system. It presents amount due, order summary, Cash / QR Ph selection, cash received/change handling, or the QR Ph sandbox state. Stock changes only after successful completion.

### Product editor

Product create/edit uses the same surface and form system and includes product category. Inventory barcode scanning can pre-fill a new product barcode.

### Scanner

Scanner is the intentional dark exception because the live camera image is the primary surface. A clear white scan frame, green scan line, mode label, and concise privacy copy keep it recognizably PorSca without obscuring the camera.

## Accessibility and resilience

- Keep body copy around 16sp-equivalent and avoid fixed layouts that fail with larger font settings.
- Text and controls must maintain strong contrast against cream/green washes.
- Important states include text labels in addition to color.
- Empty cart, empty sales, no-search-results, camera permission denial, invalid inputs, insufficient cash, missing product, low stock, and out-of-stock paths remain represented.
- Decorative botanical shapes are pointer-inactive and stay behind content.
