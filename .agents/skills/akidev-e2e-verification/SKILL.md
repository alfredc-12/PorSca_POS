---
name: akidev-e2e-verification
description: Run targeted or deterministic Expo/agent-device verification only for explicit E2E/device requests; use project npm scripts as authoritative PASS/FAIL evidence.
---

<!-- Managed by AkiDev integration: akidev-e2e-verification -->
# AkiDev E2E verification

This skill owns the project command interface and deterministic acceptance result.
Load it only after explicit E2E, device, or mobile verification intent.
The task difficulty alone does not activate this skill.
The `akidev-mobile-verification` policy skill owns operating modes, runtime freshness, failure classification, and evidence boundaries.

## Android emulator preflight

For React Native + Expo Android verification in WSL2, the developer starts and manages the Windows-hosted Android Studio emulator before development.
That emulator is the default Android verification device for agents running in WSL2.
Use the existing localhost ADB connection from WSL2 instead of creating a new connection.

This skill remains behind explicit user intent for device, runtime, or E2E work.
Before any Android device or E2E operation, run `adb devices -l` and discover the ready device at runtime from its output.
Prefer the emulator over a physical device, and retain its current serial or device ID for the operation.
If no usable emulator is listed, report a verification blocker and stop.
Do not launch, recreate, wipe, reconfigure, or repair an AVD.
Do not reconfigure or repair ADB networking.
Do not set `ADB_SERVER_SOCKET`, start a second ADB server, or run `adb kill-server` in the healthy-connection path.
Use a physical device only when the task explicitly requires physical-device behavior.

## Project interface

```bash
npm run e2e:doctor
agent-device replay .agent-device/flows/<flow>.ad
npm run e2e:flow -- .agent-device/flows/<flow>.ad
npm run e2e
```

Run relevant lint, typecheck, unit, and integration checks before interpreting mobile results.
Use the project's native-build freshness guidance before treating a device result as an app result.
For an existing checked-in regression or acceptance flow, plain `agent-device replay <script>` is the normal focused Mode B path, and the project flow action is its package-script form.
For newly implemented or materially changed behavior whose successful path is not yet established, route to `akidev-mobile-verification` Mode A first.
Do not use this skill as the default discovery loop for a fresh feature.
`npm run e2e` runs the deterministic `.ad` suite under `.agent-device/flows/`, and `npm run e2e:doctor` delegates to `agent-device doctor` for device/toolchain readiness.

For existing or newly promoted Mode B flows, use this focused-to-broad progression:

1. Run the focused script with `agent-device replay <script>`.
2. Preserve the exact failing interaction, device/build identity, logs, screenshots, and other artifacts.
3. Diagnose the smallest failing interaction using the structured divergence report (step, file, line, post-failure snapshot digest, ranked selector suggestions).
4. Make one evidence-backed change.
5. Rerun the focused script.
6. Run broader or full E2E with `npm run e2e` only when the task or an acceptance gate requires it.

Do not add automatic retries, rebuilds, emulator wipes, ADB or Metro recovery, or blind reruns around agent-device.
The guarded `replay --from <step> --plan-digest <digest>` resume is allowed only with an unchanged plan and understood, repaired state.
A failed replay command proves that the command failed; it does not by itself prove an application defect.

MCP sessions, snapshots, and interactive results are diagnostic evidence.
The project npm or agent-device CLI result is the deterministic PASS or FAIL gate.
Keep one active owner per physical device or emulator and return any failure to the canonical evidence lifecycle before another full-flow run.
