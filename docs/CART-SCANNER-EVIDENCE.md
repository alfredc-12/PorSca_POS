# Barcode scanner and cart: test plan and evidence (week 6)

Scope: the six staged steps of the approved week-6 plan
(`porsca-cart-plan-20260926/report.md`, captain's rounds 1 and 2 applied). Mobile
only. **Zero API changes**: the contract version at that delivery stayed `porsca-mobile-api-v1` (historical; the current auth delivery uses v2) and
no Laravel route, request or response changed.

Branch: `fm/porsca-cart-build-20260926`, based on `origin/staging` `070bedd`.

| Stage | Commit | What it covers |
| --- | --- | --- |
| 0 seam + fixtures | `bcdc696` | `src/hooks/useBarcodeScan.ts`, `src/domain/barcode.ts`, `src/data/barcodeFixtures.ts`; behaviour unchanged |
| 1 scanner hardening | `fceeb49` | ref lock, same-symbol cooldown, shape validation, UPC-A/EAN-13 second attempt, per-status scanner states, camera-ready gate |
| 2 cart consistency | `907e656` | single guarded reducer, no unchecked add path, limit feedback, Clear All with five-second undo |
| 3 search speed | `ad50b84` | 280 ms debounce, one in-flight read per query, one meaning for a numeric query |
| 4 pre-checkout revalidation | `7954549`, `a8c8cd2` | price/stock re-read before payment, review sheet, applied reconciliation, deleted-product copy |
| 5 offline policy | `708b618` | demo catalog behind an off-by-default flag, explicit offline states, checkout unavailable offline, cart still editable |
| 6 evidence + docs | this file | test plan, evidence, doc corrections |

## Automated evidence

Canonical gate, run on the branch tip:

```bash
npm run verify          # expo lint && tsc --noEmit && jest --runInBand
```

- Baseline on `origin/staging` `070bedd`: **9 suites / 49 tests**, lint and typecheck clean.
- Branch tip: **18 suites / 143 tests**, lint and typecheck clean (zero warnings).
- Added: 9 suites, 94 tests, all below the camera screen or the domain layer.

Post-audit follow-up: the three merge-blockers plus the search-dedupe/parity and
fixture corrections added 11 more cases over the first branch tip and removed the
one pre-existing `react-hooks/exhaustive-deps` warning in `PosContext.tsx`, so
lint, typecheck, and all suites pass together.

Suites that carry the new behaviour: `src/domain/barcode.test.ts`,
`src/domain/cart.test.ts`, `src/domain/checkout.test.ts`,
`src/domain/revalidation.test.ts`, `src/config/offline.test.ts`,
`src/hooks/useBarcodeScan.test.ts`, `src/hooks/useDebouncedValue.test.ts`,
`app/scanner.test.tsx`, `app/(tabs)/pos.test.tsx`,
`src/context/PosContext.offline.test.tsx`, plus the existing
`app/checkout.test.tsx`, `src/context/PosContext.test.tsx` and
`src/domain/pos.test.ts`, which were extended in place.

## Camera test plan (fixtures, no device)

`src/data/barcodeFixtures.ts` holds the plan's fixture set. The camera binding
itself stays in `app/scanner.tsx`; `useBarcodeScan` owns the decisions, so Jest
drives the session directly and the screen is driven through the existing
`expo-camera` component mock (now also exposing `onCameraReady`).

| Case | Scenario | Where |
| --- | --- | --- |
| S1 | idle session is armed | `useBarcodeScan.test.ts` |
| S2 | disarmed until `onCameraReady`; callbacks before then are ignored | `useBarcodeScan.test.ts`, `app/scanner.test.tsx` |
| S3 | three native callbacks in one tick produce one lookup | `useBarcodeScan.test.ts` |
| S4 | a five-second exposure to one symbol produces exactly one answer | `useBarcodeScan.test.ts`, `app/scanner.test.tsx` |
| S5 | an explicit retry suppresses the same symbol inside the cooldown, then accepts it | `useBarcodeScan.test.ts` |
| S6 | the cooldown is per symbol, so the next product scans immediately | `useBarcodeScan.test.ts` |
| S7 | non-numeric, too short and over-long codes are rejected locally with no request | `useBarcodeScan.test.ts`, `app/scanner.test.tsx` |
| S8 | unknown code with a failing check digit names the misread risk | `useBarcodeScan.test.ts` |
| S9 | unknown code with a valid check digit keeps the plain recovery copy | `useBarcodeScan.test.ts` |
| S10 | resolved product and cart quantity pass through the session | `useBarcodeScan.test.ts` |
| S11 | out-of-stock and stock-limit each get their own headline | `useBarcodeScan.test.ts`, `app/scanner.test.tsx` |
| S12 | unreachable API keeps the resolver copy and the fallback flag | `useBarcodeScan.test.ts` |
| S13 | a rejected resolver never leaves the session busy or locked | `useBarcodeScan.test.ts` |
| C1 | UPC-A reported by iOS as `0036000291452` retries the 12-digit form and adds one line | `app/scanner.test.tsx` |
| C2 | POS add confirms in place, then returns to the cart by itself | `app/scanner.test.tsx` |
| C3 | inventory mode opens the product, and offers product creation when unknown | `app/scanner.test.tsx` |
| C4 | a resolved failure re-arms only when the cashier taps "Scan again" | `app/scanner.test.tsx` |

Fixtures used: `4800000000019` (in stock), `4800000000026` (low stock),
`4800000000033` (out of stock), `4800000000040` (high stock),
`9999999999994` (unknown), `PSCA-CART-42` (non-product code), `12345` (short),
65 digits (over-long), `6291041500214` (GS1 example with a bad check digit),
`6291041500213` (GS1 example, valid check digit), and the UPC-A / EAN-13 pair
`036000291452` / `0036000291452`.

## Cart, search and checkout cases

| Area | Cases |
| --- | --- |
| Cart reducer | guarded add and its message; increment from the stored line; a rejected add does not mutate the cart; last-unit decrement drops the line; clear into an undo buffer and restore exact lines and quantities; undo refused after the window; buffer dropped by the next successful mutation; buffer dropped when a checkout begins; reset after a sale; replace-lines reconciliation; `useReducer` form and reduction form stay identical |
| POS cart | limit message on "+" instead of a silent no-op; notice cleared by the next successful add; last-unit "−" empties the cart; Clear All + undo restores; undo offer disappears when its window closes |
| Search | eight keystrokes produce at most two catalog reads; one in-flight read per query; a repeated same-query invocation before it resolves still answers; a same-query retry after an unavailable catalog works; barcode-shaped query uses `?barcode=`; every non-barcode query is name-only in both modes, matching the documented `?search=` contract |
| Revalidation | clean cart goes straight to checkout; price change shown and applied before checkout; short stock blocks and clamps on accept; a product that left the catalog is removed on accept; unreachable API keeps the cart and explains itself; dismissing the review applies nothing; an edit during the line read is re-read rather than bypassing validation; a review whose cart changed is re-validated instead of overwriting the edit |
| Checkout copy | deleted-product detail maps to a named recovery instead of generic validation text; stock, cash, and idempotency-replay conflicts each keep their own recovery action; an unresolved earlier cash attempt points at Transactions |
| Offline policy | flag is off unless exactly `1`; no substituted catalog or inventory; no barcode substitution; sale refused with no local record and the cart retained; strict-offline read not labelled a demo fallback; a demo catalog substitutes reads only and can never record a local sale; the checkout route itself refuses to render payment controls when the API is not configured |
| Cash retry | a plain retry after a transport failure reuses the idempotency key; an uncertain attempt is bound to its exact payload (including per-line price); a repriced retry first looks up the earlier receipt and refuses to replay the old-price sale; a repriced retry proceeds with a fresh key only once Laravel confirms the earlier attempt was never recorded |

## Manual printed-fixture step: **NOT EXECUTED**

The plan calls for one honest manual step: print a fixture card
(`zint -b EANX13 -d 4800000000019`), hold it in frame for five seconds on a real
device, and assert exactly one cart line, because a glossy monitor frequently
fails to decode. The fixture values now carry valid GS1 check digits, so the
printed symbol and the asserted value agree (see finding 1 below).

This environment has no printer and no physical device, so that step was **not
run** and no device-decode evidence is claimed. What exists instead:

- the same assertion at the logic and component level (S4 and the five-second
  exposure case in `app/scanner.test.tsx`), driven through the camera mock;
- `scanFromURLAsync` was deliberately **not** used to fake coverage: Expo
  documents image-based scanning as QR-only on iOS, so it cannot stand in for a
  live EAN/UPC decode.

Recorded risk: the camera binding itself is never exercised in CI. The scan
session seam narrows that gap; it does not close it. Anyone with a printer and a
phone should run the printed-card step before the module is called
device-verified, and record the result here.

## Findings from the build

1. **The approved plan's fixture list was not GS1 mod-10 valid; this branch now
   corrects it.** Every `EAN13_*` code in the plan was off by one on its check
   digit: for payload `480000000001` the correct check digit is `9`, not the
   plan's `0`. The fixtures now carry the valid digits
   (`4800000000019`, `4800000000026`, `4800000000033`, `4800000000040`, and the
   unknown-code fixture `9999999999994`), and a test asserts each one passes the
   GS1 mod-10 check, so a printed card can actually decode to the asserted value.
   The seeded catalog's `4800010000011` had the same defect and is now
   `4800010000016`.
2. **The check digit is still a reported signal, not a hard gate.** Legacy
   catalog identifiers can predate GTIN validation, and Laravel remains the
   authority on whether a barcode exists. Whether those legacy identifiers need
   tolerated lookup separately from GTIN validation is an open decision, so the
   scanner reports `checkDigitValid` and changes the not-found copy rather than
   rejecting the scan. Verified against GS1's published worked example
   `6291041500213`.
2. **The board artifact and the captain's reference images were not
   recoverable.** The plan's review board lived in `.lavish/` inside the
   planning worktree, and the worktree pool recycled it before this task started,
   so the six UI states were built from the report's written descriptions in the
   PorSca design system rather than from the mockups themselves. If the mockups
   show details the description does not capture, the six states need a visual
   pass.
3. **A pre-existing decrement bug was caught by the new reducer tests.** The
   first implementation of the reducer treated "same line count" as "no change",
   which silently ignored a quantity decrement; the domain test caught it before
   it reached the screen.
4. **Revalidation originally read a paginated catalog list**, which could make a
   valid line past the first page look removed. It now reads each cart line from
   `GET /products/:id` (`a8c8cd2`).

## Post-audit follow-up fixes

An independent audit of the first branch tip (`905d674`) held the merge and named
these defects. Each is fixed on this branch with the tests listed.

| Defect | Fix | Regression test |
| --- | --- | --- |
| F1: demo mode could still record an unrecorded offline sale | `completeCashSale` has no local-sale branch; `app/checkout.tsx` refuses to render payment controls when the API is not configured | `PosContext.offline.test.tsx` (demo mode), `checkout.test.tsx` (offline route) |
| F2: an async review could bypass or overwrite cart edits | `revalidateCart` returns a `cartSignature` and re-reads a cart that changes under it; `applyReview` re-validates instead of applying a stale review | `(tabs)/pos.test.tsx` (edit during read, edit during review) |
| F3: a cash retry could replay an old-price sale after repricing | an uncertain attempt is bound to its exact payload; a changed payload first resolves the earlier receipt and refuses to replay it; a 409 idempotency conflict has its own copy | `PosContext.test.tsx` (recorded and unrecorded repriced retries), `domain/checkout.test.ts` |
| F4: a duplicate same-query search could leave the catalog loading forever | the request generation advances only when a request starts, and the in-flight marker is released on every exit | `PosContext.test.tsx` (duplicate invocation, retry after unavailable) |
| F5: short numeric queries differed online and offline | non-barcode search is name-only in both modes, matching the documented `?search=` contract | `domain/pos.test.ts` (name-only, short numeric prefix) |
| F6: fixtures had invalid check digits | the five EAN fixtures and the seeded `4800010000016` carry valid GS1 check digits | `domain/barcode.test.ts` (fixtures pass mod-10) |

## Residual limitations and risks

- The camera binding is not device-verified (above).
- Same-symbol suppression is 1200 ms (`SAME_BARCODE_COOLDOWN_MS`), at the top of
  the 500-1500 ms retail range. The primary duplicate defence is that the camera
  callback is disarmed as soon as a scan resolves; the cooldown covers the window
  where callbacks are already queued natively and the moment right after an
  explicit retry. Both are named constants and can be tuned after the manual pass.
- Search debounce is 280 ms (`SEARCH_DEBOUNCE_MS`). 200 ms may feel better on a
  fast LAN.
- Revalidation reads the product record per cart line. Whether Laravel's
  `GET /products/:id` still answers for a product deactivated between add and
  checkout was not verified from this checkout; if it does, that case is caught
  by Laravel's checkout validation, which now has named recovery copy.
- Barcode canonicalisation (UPC-A/EAN-13) lives in the client only, as the plan
  decided. The server-side form of that rule remains future work.
- Signing and read-back of `EAN13_IN_STOCK` etc. use synthetic GTINs; the values
  are now mod-10 valid so they can be printed and scanned, but they are not real
  products and are not in any production catalog.
- The Appium smoke seam's `APPIUM_BARCODE_FIXTURE` default is an external
  staging-seed value supplied by the device lab, not one of this repo's
  fixtures; it is left to the captain-owned device run.
- Resolving an uncertain cash attempt reads `GET /sales?per_page=100` and
  matches the echoed idempotency key. A receipt older than the first page, or an
  unreachable sales list, keeps the client in the safe "needs checking" state
  rather than sending a duplicate sale.
