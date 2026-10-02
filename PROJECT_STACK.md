# Project Stack Guide - React Native + Expo

## Defaults

- Prefer APIs officially supported by the installed Expo SDK.
- Follow existing Expo Router/navigation conventions.
- Avoid unnecessary native modules when Expo-supported APIs solve the problem.
- Account for iOS/Android platform differences when relevant.
- Handle permissions intentionally and explain why a permission is needed.
- Consider app lifecycle, deep links, offline/network transitions, stale requests, and local persistence when relevant.
- Preserve accessibility labels/roles and touch target usability.
- Keep expensive work off hot render paths.
- Avoid large synchronous work on the JS thread.

## Android development and verification

The developer starts and manages the Windows-hosted Android Studio emulator before development.
That emulator is the default Android verification device for agents running in WSL2.
When an agent runs in WSL2, its `adb` uses the existing localhost ADB connection exposed by that managed emulator.
Agents must not create a new host connection when that existing connection is healthy.

Android device and E2E work remains behind the explicit user-intent gate.
A code-only task does not activate device or E2E tooling merely because it is difficult or touches mobile code.
Before any Android device or E2E operation, agents must:

1. Run `adb devices -l`.
2. Discover a ready device from the current output at runtime instead of hard-coding a serial or MCP device ID.
3. Prefer the ready emulator over a physical device, and use the selected runtime identity consistently for the operation.
4. Confirm that the shared emulator has one active agent/worktree owner before controlling it.

When the existing localhost connection works, do not launch, recreate, wipe, reconfigure, or repair an AVD.
Do not reconfigure or repair ADB networking.
Do not set `ADB_SERVER_SOCKET`, start a second ADB server, or run `adb kill-server` in the healthy-connection path.
If `adb devices -l` does not show a usable emulator, report a verification blocker instead of mutating the Windows host, AVD, or ADB setup.
Do not fall back to a physical device unless the task explicitly requires physical-device behavior.

For newly implemented or changed device behavior, verify the path interactively first with Agent Device.
Open the app, inspect the live UI, including the current screen or hierarchy when useful, act, re-inspect, diagnose failures in place, and continue from the current session when safe.
Do not author the durable `.ad` script until the path succeeds interactively.

Once the behavior is stable, create or update the smallest justified `.ad` regression flow and replay it once to prove deterministic coverage.

If a relevant checked-in `.ad` flow already exists, replay it as regression evidence and use interactive diagnosis when it diverges.

For an existing or newly promoted Mode B flow, run `agent-device replay <script>`, preserve the first failure, diagnose the smallest failing interaction from the divergence report, make one evidence-backed change, and rerun the focused script.
Broaden to full E2E only when the task or an acceptance gate requires it.
Do not add automatic retries, rebuilds, emulator wipes, ADB or Metro recovery, or blind reruns around agent-device.
A failed agent-device command is evidence that the command failed, not proof of an application defect.

## Verification

Follow the strict ladder `static -> unit/component -> integration/Feature -> API/contract -> E2E` and stop at the lowest rung that proves the changed behavior.
Use the target workflow of feature implementation -> targeted test -> fast verification -> affected backend/contract checks -> E2E decision gate -> smallest justified E2E flow -> review.
Jest/jest-expo plus React Native Testing Library is the ordinary completion path for mobile features.
Agent Device is only a small representative native-boundary check after fast tests and only when the E2E decision gate justifies native evidence.
Normal mobile features should finish without Metro, an Android emulator, or Agent Device.

Ordinary tests must mock or abstract biometrics, gallery/image pickers, permissions, secure storage, notifications, and similar native APIs.
Prefer deterministic ADB/emulator mechanisms over repeated dialog fighting when native verification is justified.
Classify biometrics, gallery pickers, permissions, and comparable native blockers as manual/native verification required rather than retry loops.
Keep each justified deterministic Mode B E2E/replay flow within a two-attempt ceiling and never add blind reruns.
This ceiling applies to flow attempts, not to individual interactive Mode A actions; Mode A may inspect, act, diagnose, fix, and continue from the current session without restarting the full journey after every failure.

E2E is exceptional, not automatic extra confidence, and is allowed only for browser-specific behavior, native/OS boundaries, critical multi-system journeys, release/staging acceptance, regressions lower tests could not catch, or an explicit user request.
Use project-defined checks first and run the smallest justified flow after fast tests and affected backend or contract checks.
For critical flows, consider:
- unit/component and Expo/React Native tests;
- affected integration/Feature and API/contract checks;
- a focused agent-device flow through `npm run e2e:flow -- <flow>` only after explicit user intent and the E2E decision gate;
- manual native verification for native blockers or acceptance criteria that cannot be simulated;
- platform-specific manual checks.

Shared `adb`, `graphify`, and `agent-device` commands are resolved from `PATH`; AkiDev never installs them. Keep active device-control sessions serialized with one owner per physical device/emulator.

Do not run EAS build/submit automatically.

## Documentation

Official Expo documentation/skills are authoritative for SDK-specific behavior.
General React Native skills are complementary, not a replacement for Expo guidance.
