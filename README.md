# Snip frontend

Angular 19 client for the Snip URL shortener. The API is expected at
`http://localhost:3000`.

## Run locally

```bash
npm install
npx ng serve
```

Open `http://localhost:4200`. The backend must be running on port 3000.

## API contract

- `POST /api/links` with `{ "url": "https://..." }` returns
  `{ code, url, shortUrl, hits, createdAt }`; invalid input returns `400` with
  `{ error }`.
- `GET /api/links` returns an array of those link records.

## Verify

```bash
npx ng build
npm test
```

The production build is written to `dist/snip-frontend/browser`.
