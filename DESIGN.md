# PorSca POS Design System

## Approved direction

The September 5 mockups are now the visual authority for the mobile application. PorSca is a task-first cashier tool, but it should feel like a warm neighborhood retail product rather than a plain CRUD utility: cream surfaces, fresh botanical green, restrained organic background shapes, generous rounded corners, soft depth, and dark navy typography.

The three primary tab views must read as one system:

- **POS** — search/scan, online status, cart, totals, payment selection, and checkout action.
- **Inventory** — the same PorSca header/search language, inventory health summary, product rows, stock states, and an admin-only Add Product action. Cashiers see read-only inventory.
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
- Scanning from POS adds a recognized product to the cart and confirms it in place before returning.
- For admins, scanning from Inventory opens the existing product editor or prepares a new product with the scanned barcode. Cashiers inspect the scanned product without edit/add actions.
- Inventory is deducted only after a successful cash confirmation or QR Ph payment confirmation.
- Search controls provide real filtering rather than decorative fields.
- Payment-method controls communicate selection with icon, text, border/state, and a check indicator — never color alone.
- Error messages name both the problem and the recovery action.
- A rejected cart add, a stock limit, and a resolved scan all report in place, in the surface the cashier is already looking at, instead of in a dialog that has to be dismissed while a customer waits.

## Screen details

### Login

Login uses the same cream/green PorSca shell, labeled email/password inputs, a masked password, and an in-place recoverable error. Disable submission while the request is pending. Session restoration shows a loading state, never a flash of protected content. The signed-in tab header identifies the account role and offers Sign out.

### POS

The cashier workflow is intentionally linear: search/scan → cart → total → payment method → proceed. Search results only appear while searching so the cart stays dominant. The cart provides quantity controls, stock visibility, subtotal/discount/total, and a secure payment handoff.

Cart states added in week 6:

- **Stock limit** — a rejected "+" raises an amber notice inside the cart card naming the product, the available stock, and the quantity already in the cart. No dialog.
- **Clear with undo** — Clear All clears immediately and shows a dark snackbar in the cart card naming the line count with an **Undo** action, valid for five seconds. There is no confirmation dialog.
- **Pre-checkout review** — Proceed first re-reads the cart. If anything changed, a sheet lists each price change, stock change, or removed product with the previous and current values, and applies the reconciliation only when the cashier accepts it. A blocked cart cannot reach checkout.
- **Offline** — when Laravel is not configured, the payment card states that a sale cannot be completed, the Proceed action is unavailable, and the cart stays editable.

### Inventory

Search and inventory scanning sit above a four-part health summary: total products, healthy stock, low stock, out of stock. Product rows expose name, category/SKU, stock condition, price, and an admin-only edit affordance. Stock states use green, amber, and red text/badges.

### Transactions

Search/filter sits above a summary for sales amount, completed sales, cash count, and QR Ph count. Filter chips support All, Today, Cash, and QR Ph. Transaction rows show receipt ID, time, item count, payment method, completed state, and total.

### Checkout

Checkout inherits the same cream/green visual system. It presents amount due, order summary, Cash / QR Ph selection, cash received/change handling, or the QR Ph sandbox state. Stock changes only after successful completion.

### Product editor

Admin-only product create/edit uses the same surface and form system and includes product category. Inventory barcode scanning can pre-fill a new product barcode.

### Scanner

Scanner is the intentional dark exception because the live camera image is the primary surface. A clear white scan frame, green scan line, mode label, and concise privacy copy keep it recognizably PorSca without obscuring the camera.

Scanner states added in week 6. Each is a light card on the dark surface with an icon, a headline, and text, so no state depends on color alone:

- **Added confirmation** — the product name, unit price, cart quantity, and stock, with a **Done** action. The scanner returns to the cart on its own after ~1.2 s.
- **Out of stock** — its own headline with **Scan again** and **Back to cart**.
- **Stock limit reached** — the cart already holds all available stock, with the same recovery actions.
- **Product not found** — names the code, notes that both the UPC-A and EAN-13 forms were tried, and flags a failing check digit as a possible misread.
- **Not a product barcode** — a non-numeric, too short, or over-long code, answered without a request, pointing the cashier at Search.
- **API unavailable** — the lookup could not reach Laravel, with **Scan again** and **Back to cart**.
- **Inventory: not in inventory** — **Scan again** or, for admins only, **Add product** with the scanned barcode pre-filled. Cashiers can return to read-only inventory.
- **Starting the camera** — scanning stays disarmed until the camera reports ready.

## Accessibility and resilience

- Keep body copy around 16sp-equivalent and avoid fixed layouts that fail with larger font settings.
- Text and controls must maintain strong contrast against cream/green washes.
- Important states include text labels in addition to color.
- Empty cart, empty sales, no-search-results, camera permission denial, invalid inputs, insufficient cash, missing product, low stock, and out-of-stock paths remain represented.
- Decorative botanical shapes are pointer-inactive and stay behind content.
