# Releasing

**English** · [简体中文](RELEASING.zh-CN.md)

The checklist for every release, distilled from v0.1.0 through v0.1.3. The npm
package is `@zongcn/dsh-next-steps`; the GitHub repository, tags, and releases
keep the name `dsh-next-steps`.

## Before you start

| Requirement | Why |
| --- | --- |
| npm token with **Read and write (publish and stage)** and **Bypass 2FA** | A stage-only token forces staged publishing; without bypass the CLI stops at `EOTP` — either finish the browser web-auth prompt npm opens (npm 10 and later) or pass `--otp=<code>` |
| Writable `~/.npm` cache | `npm pack` / `npm publish` report `EPERM` on root-owned cache files (`sudo chown -R 501:20 ~/.npm`) |
| `.github/workflows/ci.yml` present in the tagged commit | Tag pushes only run CI when the workflow exists at that commit |
| Clean working tree | The version bump is the only change in the release commit |

## Checklist

1. **Bump the version** — the only change in the release commit:

   ```sh
   npm version <next-version> --no-git-tag-version
   ```

2. **Verify locally**:

   ```sh
   npm test              # 33 host checks + 13 dock checks
   npm pack --dry-run    # 16 files
   ```

3. **Commit and push** — triggers the CI run on `main`:

   ```sh
   git add package.json
   git commit -m 'chore: release 0.1.3'
   git push
   ```

4. **Tag and push** — triggers the CI run on the tag:

   ```sh
   git tag -a v0.1.3 -m 'dsh-next-steps 0.1.3' -m '<release notes>'
   git push origin v0.1.3
   ```

   Wait for both Actions runs to reach `success` before publishing.

5. **Publish**:

   ```sh
   npm publish
   ```

   Expected outcomes:

   - exit 0, and the version appears on the registry after a short delay;
   - `EOTP` → run `npm publish --otp=<code>`;
   - `202` / "being processed", or a public `0.0.0-stage` placeholder → the
     version is staged; wait for processing or approve it in the Staged
     Packages tab.

6. **Confirm the registry**:

   ```sh
   npm view @zongcn/dsh-next-steps version dist-tags   # latest must be 0.1.3
   ```

7. **Create the GitHub Release**:

   ```sh
   git tag -l --format='%(contents)' v0.1.3 > /tmp/notes.md
   gh release create v0.1.3 --title 'v0.1.3' --notes-file /tmp/notes.md --latest
   ```

8. **Verify on a clean profile**:

   ```sh
   DSH_HOME=/tmp/dsh-home-013 dsh plugin --profile web add @zongcn/dsh-next-steps@0.1.3
   DSH_HOME=/tmp/dsh-home-013 dsh --profile web --dump-config
   DSH_HOME=/tmp/dsh-home-013 dsh --profile web --no-open --host 127.0.0.1 --port 6130
   ```

   With the token printed by the server:

   - `GET /` → 200, and the boot payload lists the plugin module;
   - `POST /api/next-steps/state` → `200 {"ok":true, ...}`;
   - an unknown route → 404.

   The token is only accepted on the first request: `GET /?token=…` answers
   `303` and sets a session cookie, so a script has to carry it with
   `-c/-b <jar> -L`. `Authorization: Bearer <token>` is rejected with `401`,
   and before that cookie exists every path — including a bogus one — answers
   `401`, so the 404 check only proves something once the session is
   established:

   ```sh
   TOKEN=<printed token>; J=/tmp/jar
   curl -s -c "$J" -b "$J" -L -o /tmp/index.html -w 'GET / %{http_code}\n' \
     "http://127.0.0.1:6130/?token=$TOKEN"
   curl -s -c "$J" -b "$J" -X POST "http://127.0.0.1:6130/api/next-steps/state?token=$TOKEN" \
     -H 'content-type: application/json' -d '{"all":true}'
   curl -s -c "$J" -b "$J" -o /dev/null -w 'unknown route %{http_code}\n' \
     "http://127.0.0.1:6130/api/next-steps/definitely-not-a-route?token=$TOKEN"
   ```

   Count how often the boot payload references the module:
   `grep -o '@zongcn/dsh-next-steps' /tmp/index.html | wc -l`. Expected: `5`.
   `index.html` is minified onto a single line, so `grep -c` would answer `1`
   no matter how many times the module is referenced.

9. **Clean up**:

   ```sh
   rm -rf /tmp/dsh-home-013
   ```

   Confirm no `dsh --profile web` process is left and the port is free.

## Rules and pitfalls

- **Never move a released tag.** Every release gets its own tag; force-pushing
  a tag breaks existing clones.
- **The npm name is scoped.** npm rejects the unscoped `dsh-next-steps` as too
  similar to the existing `dsh-nextsteps` package.
- **Staged publishing.** A staged version leaves a public `0.0.0-stage`
  placeholder; unpublishing it requires an OTP, because bypass-2FA tokens may
  not unpublish.
- **Publish processing.** `dist-tags` may update a few seconds to a few minutes
  after `npm publish` returns; poll until `latest` matches.
- **CI.** `.github/workflows/ci.yml` runs `npm test` and `npm pack --dry-run`
  on Node 22 and 24 for pushes to `main`, `v*` tags, and pull requests.
