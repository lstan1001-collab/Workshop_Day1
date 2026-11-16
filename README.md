# Snip backend

A zero-dependency Bun URL shortener. Links are kept in memory and are cleared
when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL`
to set the origin used in generated short URLs, or `RAILWAY_PUBLIC_DOMAIN` to
derive an HTTPS origin when `BASE_URL` is unset. `BASE_URL` takes precedence.

Set `PUBLIC_DIR` to serve static files from a directory; `/` serves
`index.html`. An existing static file takes precedence over a short code.

## API

- `POST /api/links` with `{"url":"https://example.com"}` returns `201` and the
  created link. Invalid JSON or non-HTTP(S) URLs return `400` with an `error`.
- `GET /api/links` returns all links.
- `GET /:code` redirects to the original URL and increments its hit count;
  unknown codes return `404`.
