# Snip

Snip is a tiny URL shortener with one backend and two clients: an Angular web
app and a Node.js CLI. The backend stores links in memory, so restarting it
clears them.

## API contract

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://…" }` | `201` `{ code, url, shortUrl, hits, createdAt }`; `400` for invalid input |
| `GET` | `/api/links` | — | `200` array of link objects |
| `GET` | `/:code` | — | `302` redirect and increment hit count; `404` if unknown |

## Repository layout

Each component is maintained at the root of its own branch: `backend`,
`frontend`, and `cli`. The `main` branch mounts those branches as submodules
and pins each to a commit. The `bundle` branch is generated release output.

Clone with submodules populated:

```sh
git clone --recurse-submodules https://github.com/lstan1001-collab/Workshop_Day1.git
```

Plain clones leave the submodule folders empty; populate them with
`git submodule update --init --recursive`.

## Run locally

Start the backend in one terminal:

```sh
cd backend
bun start
```

Run the web app in another terminal:

```sh
cd frontend
npm install
npx ng serve
```

Use the CLI from a third terminal:

```sh
cd cli
node cli.js help
node cli.js add https://example.com
node cli.js ls
```

The CLI uses `http://localhost:3000` by default; set `SNIP_API` to use another
backend URL.

## Update workflow

Make and push a component change from its submodule:

```sh
cd backend
git add -A
git commit -m "Describe backend change"
git push
```

Then update the pinned commit in the superproject:

```sh
cd ..
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push
```

Repeat with `frontend` or `cli` as appropriate. Rebuild generated release
output with Node.js 20+ and npm installed:

```sh
node scripts/build-bundle.mjs
```

The script updates source submodules, builds the Angular app, and assembles
the `bundle` submodule. It is safe to run again when nothing changed. Use
`--push` after testing to publish the generated bundle and updated
superproject pointer:

```sh
node scripts/build-bundle.mjs --push
```

The bundle workflow runs hourly and on manual dispatch. The Docker workflow
runs when the pinned `bundle` submodule commit changes (or when its workflow
file changes). It runs client tests, an npm dependency audit, a Trivy image
scan, and a container smoke test before publishing `latest` and a short-SHA
tag to GHCR. A failed test or image scan prevents the image push. Dependency
audit findings block normal releases; for a manually dispatched release, the
operator can explicitly accept the current Angular 19 findings. That exception
is logged, and the image scan and container smoke test still must pass.
