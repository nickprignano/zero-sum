# Putting the game on Cloudflare

The game is static files, served by Cloudflare Workers static assets with no Worker script.
[`wrangler.jsonc`](../wrangler.jsonc) names the Worker `zero-sum` and serves the repo folder;
[`.assetsignore`](../.assetsignore) leaves out the tests, tools and docs. There's no build step.

The owner does these steps in the Cloudflare dashboard. Nothing here needs a key or token in the
repo: Cloudflare's GitHub app deploys on each push to `main`.

## One-time setup

1. In the Cloudflare dashboard, open **Workers & Pages**, choose **Create application**, then
   **GitHub**.
2. Sign in to GitHub if asked, and pick `nickprignano/zero-sum`.
3. Settings:
   - **Project name**: `zero-sum`. It must match `name` in `wrangler.jsonc`, or the build fails.
   - **Production branch**: `main`.
   - **Build command**: leave empty.
   - **Deploy command**: `npx wrangler deploy` (the default).
   - **Root directory**: `/` (the default).
4. Choose **Save and Deploy**. When it finishes, the game is on the `zero-sum` `workers.dev` address the
   dashboard shows. Open it and dial in to check.
5. Add the domain: open the `zero-sum` Worker, then its **Domains** tab (older dashboards:
   **Settings**, **Domains & Routes**), **Add**, **Custom domain**, and enter `zero-sum.prignano.ai`. Cloudflare adds the DNS record and
   certificate itself, because the domain's zone is already on the account.
6. Optional: on the same tab, turn off the `workers.dev` address so the
   game has one home.

## After that

Every merge to `main` deploys on its own. Other branches get preview builds if
**Settings**, **Builds** has non-production branch builds turned on. To roll back, open the
Worker's **Deployments** tab and pick an earlier version.

## Checking it

- `https://zero-sum.prignano.ai/` shows the content note, then the dial-in, with the site header above.
- `https://zero-sum.prignano.ai/test/` and `/tools/` return 404 (left out by `.assetsignore`).
- The browser console shows no errors.

## Installing and playing offline (manual check)

Do this once after each build that changes the app, on a real phone (the spec keeps it out of CI):

1. iPhone or iPad: open the site in Safari, tap Share, then **Add to Home Screen**. Android: open it
   in Chrome and use **Install app** (or the menu's INSTALL AS AN APP line).
2. Open the installed app once while online, then turn on airplane mode, close it and open it
   again. It should dial in and show the menu.
3. Turn airplane mode off. After a new version is merged, reopen the app: the menu shows
   UPDATE THE GAME, which reloads into the new version.
