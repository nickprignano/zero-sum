# Zero Sum

An original browser game: dial in to an old green-screen computer and try to get through a
standoff without anyone launching. Plain JavaScript, no build step, installable as an app that
plays offline. Made for 13 and up.

The plan is in [docs/SPEC.md](docs/SPEC.md), and putting it on Cloudflare is in
[docs/DEPLOY.md](docs/DEPLOY.md). MIT licensed.

## Working on it

- Serve the folder with any static server (for example `npx http-server`) and open it.
- `node --test` runs the tests.
- After changing any game file, run `node tools/sw-version.mjs` so the installed app picks up the
  new version (a test fails if you forget).
- After changing `icons/icon.svg`, run `node tools/make-icons.mjs` (needs Playwright).
