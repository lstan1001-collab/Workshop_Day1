# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener API.
Node.js 20 or newer is required.

```text
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
node cli.js help
```

Set `SNIP_API` to the backend base URL to use another API server. It defaults
to `http://localhost:3000`.

The `snip`, `snip.cmd`, and `snip.ps1` wrappers run `cli.js` on POSIX shells,
Windows Command Prompt, and PowerShell respectively. Run `npm test` for the
CLI tests.
