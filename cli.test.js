"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("./cli");

function streams() {
  let stdout = "";
  let stderr = "";
  return {
    get stdoutText() {
      return stdout;
    },
    get stderrText() {
      return stderr;
    },
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
  };
}

function deps(output, extra = {}) {
  return {
    env: {},
    fetch: async () => {
      throw new Error("unexpected request");
    },
    launchBrowser: async () => {},
    stdout: output.stdout,
    stderr: output.stderr,
    ...extra,
  };
}

test("help and no arguments print usage without calling the API", async () => {
  const output = streams();
  const dependencies = deps(output);

  assert.equal(await run([], dependencies), 0);
  assert.equal(await run(["help"], dependencies), 0);
  assert.match(output.stdoutText, /snip add <url>/);
});

test("add rejects invalid URLs before making an API request", async () => {
  const output = streams();
  let called = false;
  const dependencies = deps(output, {
    fetch: async () => {
      called = true;
    },
  });

  assert.equal(await run(["add", "javascript:alert(1)"], dependencies), 1);
  assert.equal(called, false);
  assert.match(output.stderrText, /HTTP\(S\)/);
});

test("add posts the URL and prints the returned short URL", async () => {
  const output = streams();
  let requestUrl;
  let requestOptions;
  const dependencies = deps(output, {
    env: { SNIP_API: "http://localhost:3000/" },
    fetch: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return Response.json({
        code: "a1B2c3",
        url: "https://example.com",
        shortUrl: "http://localhost:3000/a1B2c3",
        hits: 0,
        createdAt: new Date().toISOString(),
      }, { status: 201 });
    },
  });

  assert.equal(await run(["add", "https://example.com"], dependencies), 0);
  assert.equal(requestUrl, "http://localhost:3000/api/links");
  assert.equal(requestOptions.method, "POST");
  assert.equal(JSON.parse(requestOptions.body).url, "https://example.com");
  assert.equal(output.stdoutText, "http://localhost:3000/a1B2c3\n");
});

test("ls handles empty and populated link lists", async () => {
  const emptyOutput = streams();
  assert.equal(
    await run(
      ["ls"],
      deps(emptyOutput, { fetch: async () => Response.json([]) }),
    ),
    0,
  );
  assert.equal(emptyOutput.stdoutText, "No links yet.\n");

  const listOutput = streams();
  assert.equal(
    await run(
      ["ls"],
      deps(listOutput, {
        fetch: async () =>
          Response.json([{ code: "a1B2c3", hits: 2, url: "https://example.com" }]),
      }),
    ),
    0,
  );
  assert.match(listOutput.stdoutText, /CODE\s+HITS\s+URL/);
  assert.match(listOutput.stdoutText, /a1B2c3\s+2\s+https:\/\/example\.com/);
});

test("open requests without following the redirect and launches Location", async () => {
  const output = streams();
  let requestOptions;
  let launched;
  const dependencies = deps(output, {
    fetch: async (_url, options) => {
      requestOptions = options;
      return new Response(null, {
        status: 302,
        headers: { Location: "https://example.com" },
      });
    },
    launchBrowser: async (url) => {
      launched = url;
    },
  });

  assert.equal(await run(["open", "a1B2c3"], dependencies), 0);
  assert.equal(requestOptions.redirect, "manual");
  assert.equal(launched, "https://example.com");
});

test("API failures and unreachable servers go to stderr with exit code 1", async () => {
  const apiError = streams();
  assert.equal(
    await run(
      ["ls"],
      deps(apiError, {
        fetch: async () => Response.json({ error: "Link service unavailable" }, { status: 500 }),
      }),
    ),
    1,
  );
  assert.equal(apiError.stderrText, "Link service unavailable\n");

  const networkError = streams();
  assert.equal(
    await run(
      ["ls"],
      deps(networkError, { fetch: async () => { throw new Error("connection refused"); } }),
    ),
    1,
  );
  assert.match(networkError.stderrText, /Could not reach Snip API/);
});

test("open rejects an unknown code and a non-redirect response", async () => {
  const invalidCode = streams();
  assert.equal(await run(["open", "short"], deps(invalidCode)), 1);
  assert.match(invalidCode.stderrText, /Usage: snip open/);

  const unknownCode = streams();
  assert.equal(
    await run(
      ["open", "a1B2c3"],
      deps(unknownCode, {
        fetch: async () => Response.json({ error: "Link not found" }, { status: 404 }),
      }),
    ),
    1,
  );
  assert.equal(unknownCode.stderrText, "Link not found\n");
});

test("open refuses a redirect outside HTTP(S)", async () => {
  const output = streams();
  let launched = false;
  assert.equal(
    await run(
      ["open", "a1B2c3"],
      deps(output, {
        fetch: async () =>
          new Response(null, { status: 302, headers: { Location: "file:///etc/passwd" } }),
        launchBrowser: async () => {
          launched = true;
        },
      }),
    ),
    1,
  );
  assert.equal(launched, false);
  assert.match(output.stderrText, /must use HTTP or HTTPS/);
});
