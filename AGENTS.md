# Base44 Dev Environment

## What this is
RealMe — a static HTML/CSS/JS social network. No build step, no bundler, no
package.json. ES modules are loaded directly in the browser from `src/` using
absolute paths (`/src/...`) and CDN imports (Firebase 10.12.0 from gstatic,
Font Awesome from cdnjs).

## How it runs here
Served as static files by `nginx:alpine` via `docker-compose.base44.yml`.
The repo root is bind-mounted read-only at `/usr/share/nginx/html`.

- Web entry point: host port **3000** → nginx port 80.
- `nginx.base44.conf` runs nginx workers as **root** because the sandbox repo
  directory is `drwx------` (owned by root); the default `nginx` worker user
  cannot traverse it and returns 403.
- `try_files` falls back to `/index.html` for the root; individual pages
  (`/feed.html`, `/login.html`, etc.) are served directly.

## No external secrets
Firebase web config (`apiKey`, `appId`, …) is hardcoded in
`src/config/config.js`. These are Firebase *public* web API keys — they
identify the project, they are not secret; access control is enforced by
Firestore security rules and Firebase Auth. No `set_secrets` is needed.

## Editing
There is no live-reload dev server (it's plain static files). After editing
HTML/CSS/JS, call `reload_preview` so the preview picks up the change. No
container restart is needed — files are bind-mounted.

## Verify it works
```
docker compose -f docker-compose.base44.yml up -d
curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:3000/      # 200
curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:3000/feed.html  # 200
```
