# Changelog

All notable changes to `@zongcn/dsh-next-steps` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases up
to 0.1.2 predate this file and are listed for completeness.

## [Unreleased]

## [0.1.3] — 2026-11-09

### Fixed

- **The browser half now registers under the package name.** `client.js`
  declared `window.__ModuleLoader__.load({ id: 'dsh-next-steps' })` while
  client-modules keys every boot row by the package name
  (`@zongcn/dsh-next-steps`). The stale literal made the loader treat the batch
  as "loaded without registering", refetch the bundle through its own
  one-resource URL and execute the same bytes a second time. That surfaced as
  `client-modules: duplicate factory registration for "dsh-next-steps"` and left
  the suggestion band unmounted.
- `scripts/verify-dock.mjs` asserts that the registered id equals
  `package.json`'s `name`, so a rename can no longer drift silently.

### Changed

- The bundle row in `cordis.patch.yml` keeps the short identity `id:
  dsh-next-steps`; only its `name` has to be the package name.
- Both README examples and both release checklists were synced with the scoped
  name, the desktop reinstall caveat, and the clean-profile `curl` pitfalls.

### Incident — `web boot: 1 entry did not activate` (2026-11-08)

The desktop app could not start its web client after the package was renamed
from `dsh-next-steps` to `@zongcn/dsh-next-steps`:

```
Error: web boot: 1 entry did not activate
@zongcn/dsh-next-steps: import failed (see console for the import error)
```

Two independent mismatches were involved.

1. **Stale dependency key.** The profile still listed
   `"dsh-next-steps": "link:/Applications/project/next-steps"`, so
   `node_modules/@zongcn/dsh-next-steps` did not exist while the bundle's patch
   row asked for that name. The loader imports the row's `name` from the profile
   root, so the entry never got a fiber.
2. **Stale registration id.** Once the browser half loaded, its literal
   `dsh-next-steps` did not match the boot row id, producing the duplicate
   factory error and an unmounted band.

Resolution: reinstall the bundle from **Settings → Plugins** (a toggle does not
re-run pnpm and leaves the dependency key stale — see the README caveat), then
ship the registration-id fix. Verified end to end on a clean `DSH_HOME` and in
the running desktop app.

Prevention: the `verify-dock` assertion pins the id; the README and RELEASING
docs record the reinstall caveat and the token/cookie pitfalls; issues
[#2](https://github.com/WURONZON/dsh-next-steps/issues/2) and
[#3](https://github.com/WURONZON/dsh-next-steps/issues/3) capture the upstream
behaviour.

## [0.1.2] — 2026-11-08

Released before this changelog existed: metadata and packaging follow-ups to the
first publication.

## [0.1.1] — 2026-11-08

Released before this changelog existed.

## [0.1.0] — 2026-11-08

First publication of `@zongcn/dsh-next-steps`: up to three suggested prompts
above the composer after every finished turn, one model call per turn, draft-only
insertion (the plugin never sends a prompt itself).
