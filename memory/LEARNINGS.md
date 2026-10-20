# canary — LEARNINGS (append-only)

Every error → root cause → rule. Auto-compressed when >500 lines (memory-compress.sh).

## 2026-06-20 · One bootstrap, at the root
- **What broke:** the memory bootstrap lived at `memory/MEMORY.md`, so the check `wc -w MEMORY.md` failed at the root.
- **Root cause:** two copies with no owner; `identity/MEMORY.md` even called the wrong one "the root".
- **Rule:** the bootstrap is root `MEMORY.md` (at most 2,000 tokens). Every other memory file points to it.

## 2026-06-21 · ESM services need the OpenTelemetry import hook
- **What broke:** `canary instrument` produced spans for a CommonJS service and none for an ESM one.
- **Root cause:** for ESM, auto-instrumentation patches `node:http` only through an import hook registered
  with `register()` from `node:module` before the app loads `http`. The bootstrap never registered it.
- **Rule:** the generated bootstrap registers `@opentelemetry/instrumentation/hook.mjs` first, and the
  acceptance fixture is ESM, because ESM is the 2026 default.

## 2026-06-21 · `"type": "module"` breaks CommonJS scripts
- **What broke:** inherited hooks that use `require` threw `require is not defined in ES module scope`.
- **Rule:** in an ESM package, a CommonJS script ends in `.cjs`.

## 2026-06-21 · Time the real operation before setting a timeout
- **What broke:** the cockpit killed brain search at 20 seconds; the search really takes 12 to 80 seconds.
- **Rule:** measure the slow path first, then give slow commands their own timeout.

## 2026-06-30 · E2B has three timeouts
- **What broke:** the microVM expired mid `npm install` ("reached its end of life").
- **Root cause:** `Sandbox.create({ timeoutMs })` is the VM's whole lifetime, separate from a command's
  `timeoutMs` and the HTTP `requestTimeoutMs` (60 seconds by default).
- **Rule:** set the lifetime above the longest step (300 seconds), kill the sandbox in `finally`, and start
  long-running servers with `background: true`.

## 2026-09-22 · Never write a model ID
- **What broke:** `scripts/budget-manager.sh apply` wrote a model ID into `.claude/settings.local.json`,
  which outranks the client default and froze new sessions on an old model.
- **Rule:** never write a model ID into a setting, flag or script. Leave the model to the client default.
