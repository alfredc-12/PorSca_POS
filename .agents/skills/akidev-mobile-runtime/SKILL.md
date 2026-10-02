---
name: akidev-mobile-runtime
description: Use only after explicit user intent for device/runtime inspection or mobile UI behavior; route agent-device interactive sessions, ADB, the deterministic .ad suite, or static checks without racing a shared device.
---

<!-- Managed by AkiDev integration: akidev-mobile-runtime -->
# AkiDev mobile runtime routing

This skill is an explicit-user-intent router.
Read `.akidev/config` before any selected mobile runtime work.
When `agent-device` is selected, also read the canonical `akidev-mobile-verification` policy skill for the intent gate, operating modes, freshness rules, and evidence boundaries.

## Choose the layer

1. Use source inspection and static tests when runtime state is not needed.
2. Use `agent-device` interactively (Mode A) for unfamiliar-flow exploration, reproduction, logs, network or crash investigation, and deep runtime state: open a session, inspect the current UI, act, re-inspect, and continue from the existing session rather than restarting the journey.
3. Use shared `adb` for transport, package/process, logs, reverse ports, or facts that higher-level tools cannot provide.
4. Use the selected `agent-device-mcp` integration only when a structured MCP interface is explicitly useful; it exposes the same command contracts as the CLI and never replaces the CLI as the acceptance gate.
5. Use the deterministic `.ad` suite through the project npm commands (Mode B) for regression and acceptance evidence.

The `akidev-mobile-verification` skill owns the evidence-driven policy, failure classification, selector guidance, and evidence boundaries.
The `akidev-e2e-verification` skill owns the project command interface and the deterministic PASS/FAIL gate.
This router owns only capability choice and the one-device boundary.

## WSL2 Android emulator preflight

For React Native + Expo Android verification in WSL2, the developer starts and manages the Windows-hosted Android Studio emulator before development.
That emulator is the default Android verification device for agents running in WSL2.
Use the existing localhost ADB connection from WSL2 when it is healthy.

Only after the user explicitly requests device, runtime, or E2E work, and before any Android device or E2E operation:

1. Run `adb devices -l`.
2. Discover a ready device from that output at runtime rather than assuming a serial or device ID.
3. Prefer the ready emulator over a physical device.
4. Keep the selected runtime device identity for the rest of the operation.

If the emulator is missing, report a verification blocker.
Do not launch, recreate, wipe, reconfigure, or repair an AVD to recover it.
Do not reconfigure or repair ADB networking to recover it.
Do not set `ADB_SERVER_SOCKET`, start a second ADB server, or run `adb kill-server` when the existing localhost connection is healthy.
Do not fall back to a physical device unless the task explicitly requires physical-device behavior.

## One-device owner

The shared Windows-hosted emulator is mutable shared state.
Only one agent or worktree may control a physical device or emulator at a time.
Serialize `agent-device` sessions, device-oriented ADB, and MCP sessions through the designated verification lane.
`agent-device` device claims block a second `open` while a foreign live claim exists; named sessions are for intentional sharing only.
Do not start device tooling because a task is difficult or because a command happens to be available.
