---
name: akidev-mobile-verification
description: Mobile verification policy for agent-device projects; explicit-intent gate, device ownership, WSL2 emulator contract, native-runtime freshness, two operating modes, failure classification, and evidence boundaries.
---

<!-- Managed by AkiDev integration: akidev-mobile-verification -->
# AkiDev mobile verification policy

Agent Device is the primary and canonical Android device automation, UI verification, E2E/flow testing, and debugging framework for this project.
The shared `agent-device` CLI is the canonical runtime.
The optional `agent-device-mcp` integration exposes the same commands as a structured MCP interface for agents; it never replaces the CLI as the acceptance gate.
Read `.akidev/config` before using a selected capability.
The official `agent-device` project skill owns the CLI's command syntax, session model, and accessibility reference.

## Operating modes

Use exactly one of two modes for device work, and say which one you are in.

### Mode A - implementation and debugging (interactive)

Work like a human tester against the current device state:

1. Open a session and inspect the current UI with `agent-device open` and `agent-device snapshot -i`.
2. Act on the current UI with the smallest command that answers the question (`press`, `click`, `fill`, `scroll`, `back`), using `--settle` where supported.
3. Re-inspect from the printed diff after each action before deciding the next step.
4. Diagnose unexpected states in place; recover only when it is safe, and continue from the existing session instead of restarting the whole journey.
5. Close the session when done.

Interactive evidence supports diagnosis and exploration.
A fixed interactive pass is not regression acceptance; promoting a verified journey into a `.ad` script is how it becomes coverage.

### Mode B - established regression/E2E coverage (deterministic)

Checked-in `.ad` scripts under the project flow directory are the regression suite.
Run a focused script with `agent-device replay <script>` and the suite through the project npm actions.
Scripts contain explicit verification steps so genuine regressions fail instead of being silently worked around.
A replay failure returns a structured divergence report (step, file, line, post-failure snapshot digest, ranked selector suggestions).
Use the guarded resume (`replay --from <step> --plan-digest <digest>`) only when the plan is unchanged and the repaired state is understood; there are exactly zero blind full-flow retries.

## Explicit intent gate and device ownership

Device, runtime, and E2E capabilities are explicit-user-intent only.
Task difficulty alone never activates them.
`akidev-mobile-runtime`, `akidev-e2e-verification`, this skill, the `agent-device` CLI and MCP, and device-oriented ADB all sit behind that gate.
Only one agent or worktree may actively control a physical device or emulator at a time.
The shared Windows-hosted emulator is mutable state, so route active device work through the designated serialized verification lane.
`agent-device` device claims add tool-level enforcement: a foreign live claim blocks `open`, and ambiguous multi-device matches fail instead of guessing.

## WSL2 Android emulator preflight

For React Native + Expo Android verification from WSL2, the developer starts and manages the Windows-hosted Android Studio emulator before development.
That emulator is the default Android verification device for agents running in WSL2.
Use the existing localhost ADB connection from WSL2 rather than changing host or ADB networking.

After explicit user intent is established and before any Android device or E2E operation, run:

```bash
adb devices -l
```

Discover a ready device from the current output at runtime.
Prefer the ready emulator over a physical device, and keep its current serial or device identity for the operation.
If no usable emulator is listed, report a verification blocker and stop.
Do not launch, recreate, wipe, reconfigure, or repair an AVD to recover it.
Do not reconfigure or repair ADB networking to recover it.
Do not set `ADB_SERVER_SOCKET`, start a second ADB server, or run `adb kill-server` in the healthy-connection path.
Use a physical device only when the task explicitly requires physical-device behavior.

All Agent Device Android transport is mediated by the `adb` client from `PATH` talking to the ADB server that owns the device, so the WSL2-to-Windows path is the same one `adb` and previous device tooling already used.
On first helper-backed use, `agent-device` installs its bundled snapshot-helper and test-IME helper apps over that path; treat a one-time helper install as expected device-state mutation, not a regression.

## Verification order

Prefer this order when relevant:

1. static/type/lint checks;
2. focused unit tests;
3. backend/API/database integration tests;
4. related JS/React Native tests;
5. native-runtime freshness assessment;
6. device E2E with `agent-device` only when the runtime is usable;
7. manual/device follow-up when needed.

Do not skip earlier, cheaper evidence just because device tooling is installed.

## Native-runtime freshness assessment

Treat the installed development build as potentially stale when the implementation changes native characteristics, including:

- adding, removing, or upgrading a dependency with native Android/iOS code;
- adding or changing Expo config plugins;
- changing Android/iOS permissions or other native app configuration;
- changing files under `android/` or `ios/`;
- upgrading Expo SDK, React Native, or native module versions;
- changing package/bundle identifiers, schemes, deep-link/native intent configuration, or other build-time native settings.

Do not infer staleness from "package changed" alone.
JS-only packages, backend dependencies, API/server changes, database changes, and ordinary TypeScript/JavaScript edits do not by themselves require a new mobile build.
Inspect the actual diff and dependency metadata, and consult official dependency/framework documentation when uncertain.

### Runtime usable

Run device E2E only when the relevant app is installed on the target device, the installed development build contains the required native capabilities, Metro/backend prerequisites are available, and the script is meaningful for the claim.
For newly implemented or changed behavior, use Mode A first.
Do not create, modify, or repeatedly replay a `.ad` script while discovering the working application path.
Diagnose and repair the implementation in the live session and continue from the current state when safe.
After the behavior succeeds interactively, promote the verified journey to Mode B only when durable regression/E2E coverage is justified.

If a relevant checked-in `.ad` regression already exists, Mode B replay may be run first as regression evidence.
If it diverges, use interactive diagnosis as needed, repair the actual cause, then rerun or guarded-resume the existing flow.

Run the broader suite through `npm run e2e` only when the task or an acceptance gate requires it.

### Runtime stale, unknown, or rebuild required

Do not run device E2E as if it were valid feature evidence.
Instead:

- finish all meaningful non-device verification first;
- report `PASS_WITH_GAPS` or `INCOMPLETE` according to the remaining risk;
- state that device E2E is deferred because runtime freshness is stale or unverified;
- identify the native-affecting change that triggered the gate;
- state that a fresh development build must be built and installed before device E2E can provide valid evidence.

Do not automatically run EAS build/submit or another costly/external build operation unless the user explicitly authorizes it and repository instructions allow it.

## Failure classification

A failing command is an observation, not a diagnosis.
A plausible explanation is a hypothesis, not a proven cause.
A successful run is not acceptance unless it proves the required behavior on the required evidence surface.

When a failure occurs, use this control loop before changing anything:

```text
OBSERVE -> CLASSIFY -> ISOLATE -> PROVE -> CHANGE -> RERUN -> EVALUATE
```

Classify the failure as exactly one of:

`TEST | APP | DATA | TIMING | ENVIRONMENT | DEVICE | BACKEND/NETWORK | VERIFIER/HARNESS | EXTERNAL | UNKNOWN`

Record all five fields before changing code, script, or environment:

```text
Observed: what actually happened.
Expected: the intended state or result.
Evidence: the exact step, snapshot, divergence report, logs, and identities.
Cause: the current evidence-backed classification and hypothesis.
Next experiment: the smallest change that can distinguish the hypothesis.
```

Do not modify product code while the best evidence-backed classification is `DEVICE`, `ENVIRONMENT`, `VERIFIER/HARNESS`, `EXTERNAL`, or `UNKNOWN`.
A nonzero command proves that the command failed; it does not automatically prove that the application failed.
If a device-side probe reports failure while an independent host/API check proves the service is healthy, investigate the probe before changing application networking.
Never repeatedly rerun a failed command without changing the condition that caused the failure.
A failed command proves that the command failed; it does not by itself prove an application defect.

Misleading-failure protection: if device E2E fails and runtime freshness was not established first, distinguish among a real application regression, a stale or incompatible development build, a disconnected device, unavailable Metro/backend services, an invalid script or selector, and an environment/tooling failure before classifying the feature as broken.

## Evidence boundaries

Match evidence to the claim being accepted.

- Required Android UI behavior needs real device or agent-device evidence.
- Required Web UI behavior needs real browser UI evidence.
- API or database evidence may support persistence, identity, or backend claims, but it does not replace explicitly required UI evidence.
- Restart survival requires an actual restart transition when that is the acceptance criterion.
- Offline behavior requires an actual offline device state when that is the acceptance criterion.
- Connectivity recovery requires a real connectivity transition and synchronization when that is the acceptance criterion.

Never relabel simulated state, local-only state, API state, static inspection, or an adjacent successful stage as evidence for a different required surface.

## Evaluate the evaluator

Treat preflights, assertions, shell probes, evidence scripts, and validation commands as fallible software.
When a verifier fails, identify the exact claim it was intended to prove and compare its result with independent evidence.
Inspect the verifier's assumptions before modifying product code.
Correct the verifier when it measures the wrong condition, uses an unsupported command contract, scopes files incorrectly, or interprets an expected artifact as a regression.
A failed verifier is evidence about the verifier execution first.
Only classify the product as failed when the verifier validly measures the product claim and the evidence supports that conclusion.

## Reporting and closeout

Report:

- whether native-affecting changes were detected;
- runtime status: `USABLE`, `STALE`, or `UNKNOWN`;
- the agent-device command and result if it actually ran;
- earlier checks that passed or failed;
- the exact remaining device/build gap.

Never claim device E2E passed when it was skipped, unavailable, deferred, or run against a runtime known to be stale.
Use the project's evidence template when present.
Record the phase or flow, commit and worktree status, device model and OS, app and native-build identity, runtime freshness, exact commands, timestamps, artifacts, backend or persistence proof when relevant, and skipped checks.
Record required evidence surfaces separately so supporting evidence cannot silently substitute for them.
Close the `agent-device` session when interactive work ends, and leave no MCP server or viewer process running.
Do not clear app state or delete test data unless the approved acceptance procedure requires it.
Claim acceptance only when every required stage is proven on its required evidence surface, required source/build/runtime identities are known, no required stage was skipped or weakened, and the required deterministic checks passed.
