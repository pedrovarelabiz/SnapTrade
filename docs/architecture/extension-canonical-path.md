# Extension: Canonical Build Location

## Decision

The Chrome extension is built exclusively from `extension/` at the **repository root**.

## Background

A duplicate copy previously existed at `frontend/extension/`. That copy was an exact shadow of the root-level directory with no ownership boundary. Changes in one copy were silently never applied to the other, creating a divergence hazard. The duplicate has been removed.

## Single Source of Truth

| Path | Status |
|------|--------|
| `extension/` | ✅ Canonical — all development, builds, and CI happen here |
| `frontend/extension/` | ❌ Deleted — do not recreate |

## CI

The `extension-build` job in `.github/workflows/deploy.yml` builds exclusively from `extension/`. Do not add a second extension build step or duplicate this directory anywhere under `frontend/`.

## Rules

- Never copy `extension/` into `frontend/` or any other subdirectory.
- Any build script that references the extension must reference `extension/` at the root.
- Version bumps must be applied to `extension/manifest.json` and `extension/package.json` — there is no second copy to keep in sync.
