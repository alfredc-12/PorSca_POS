# Graph Report - PorSca_POS  (2026-10-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 321 nodes · 578 edges · 16 communities (13 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f311de35`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13

## God Nodes (most connected - your core abstractions)
1. `useResponsive()` - 20 edges
2. `ApiClient` - 19 edges
3. `Screen()` - 16 edges
4. `react` - 15 edges
5. `usePos()` - 13 edges
6. `colors` - 12 edges
7. `react-native` - 12 edges
8. `expo` - 12 edges
9. `radius` - 10 edges
10. `expo-router` - 10 edges

## Surprising Connections (you probably didn't know these)
- `RootLayout()` --calls--> `PosProvider()`  [EXTRACTED]
  app/_layout.tsx → src/context/PosContext.tsx
- `CheckoutScreen()` --calls--> `cashChange()`  [EXTRACTED]
  app/checkout.tsx → src/domain/pos.ts
- `CheckoutScreen()` --calls--> `paymentError()`  [EXTRACTED]
  app/checkout.tsx → src/domain/pos.ts
- `CheckoutScreen()` --calls--> `AppButton()`  [EXTRACTED]
  app/checkout.tsx → src/components/AppButton.tsx
- `CheckoutScreen()` --calls--> `ProductThumbnail()`  [EXTRACTED]
  app/checkout.tsx → src/components/ProductThumbnail.tsx

## Import Cycles
- None detected.

## Communities (16 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (50): CheckoutScreen(), styles, categories, Field(), ProductFormScreen(), styles, ScannerScreen(), styles (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (35): RootLayout(), main, name, private, scripts, android, ios, lint (+27 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (31): typescript, cors, dotenv, express, @types/cors, @types/express, zod, dependencies (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (13): API_CONTRACT_VERSION, ApiClient, ApiClientError, ApiClientOptions, ApiErrorBody, configuredBaseUrl(), InventoryUpdate, isDeviceSafeApiUrl() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (25): PosContext, PosContextValue, PosProvider(), seedProducts, addProductToCart(), calculateCartTotal(), canRecordPaidSale(), CartChange (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (22): tsx, name, private, scripts, smoke, typecheck, byId(), byText() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (19): dependencies, expo, expo-camera, expo-constants, expo-font, expo-linking, expo-router, expo-status-bar (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): package, typedRoutes, expo, android, experiments, ios, name, orientation (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (14): devDependencies, appium, appium-uiautomator2-driver, tsx, @types/mocha, @types/node, typescript, @wdio/appium-service (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (10): expo/tsconfig.base, compilerOptions, baseUrl, ignoreDeprecations, paths, strict, types, exclude (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-expo, jest, jest-expo, react-test-renderer, @testing-library/react-native, @types/jest (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.20
Nodes (9): compilerOptions, esModuleInterop, module, moduleResolution, outDir, skipLibCheck, strict, target (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (8): compilerOptions, module, moduleResolution, skipLibCheck, strict, target, types, include

## Knowledge Gaps
- **29 isolated node(s):** `expo`, `expo-constants`, `expo-font`, `expo-linking`, `expo-system-ui` (+24 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 180 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `typescript` connect `Community 2` to `Community 1`, `Community 5`?**
  _High betweenness centrality (0.289) - this node is a cross-community bridge._
- **What connects `expo`, `expo-constants`, `expo-font` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.10528846153846154 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Community 0` to `Community 1`, `Community 4`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05547652916073969 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `Community 6` to `Community 1`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06417112299465241 - nodes in this community are weakly interconnected._