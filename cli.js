#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");

const DEFAULT_API = "http://localhost:3000";
const CODE_PATTERN = /^[0-9A-Za-z]{6}$/;

function usage() {
  return [
    "Usage:",
    "  snip add <url>    Create a short link",
    "  snip ls           List links and hit counts",
    "  snip open <code>  Open a short link in the browser",
    "  snip help         Show this help",
    "",
    "Set SNIP_API to change the API base URL (default: http://localhost:3000).",
  ].join("\n");
}

function apiBase(env) {
  const value = env.SNIP_API || DEFAULT_API;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SNIP_API must be a valid HTTP(S) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("SNIP_API must be a valid HTTP(S) URL");
  }
  return value.replace(/\/+$/, "");
}

async function request(path, options, dependencies) {
  const base = apiBase(dependencies.env);
  let response;
  try {
    response = await dependencies.fetch(`${base}${path}`, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw new Error(`Could not reach Snip API: ${error.message}`);
  }

  const manualRedirect = options.redirect === "manual" && response.status === 302;
  if (!response.ok && !manualRedirect) {
    let message = `Snip API returned HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.error === "string" && body.error) message = body.error;
    } catch {
      // Keep the HTTP status when the server does not return a JSON error.
    }
    throw new Error(message);
  }
  return response;
}

function openInBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = "rundll32.exe";
    args = ["url.dll,FileProtocolHandler", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function formatLinks(links) {
  if (!links.length) return "No links yet.";
  const codeWidth = Math.max(4, ...links.map((link) => String(link.code).length));
  const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
  const rows = [
    `${"CODE".padEnd(codeWidth)}  ${"HITS".padStart(hitsWidth)}  URL`,
    ...links.map(
      (link) =>
        `${String(link.code).padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`,
    ),
  ];
  return rows.join("\n");
}

async function run(argv, overrides = {}) {
  const dependencies = {
    env: process.env,
    fetch: globalThis.fetch,
    launchBrowser: openInBrowser,
    stdout: process.stdout,
    stderr: process.stderr,
    ...overrides,
  };
  const [command, ...args] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    dependencies.stdout.write(`${usage()}\n`);
    return 0;
  }

  try {
    if (command === "add") {
      if (args.length !== 1) throw new Error("Usage: snip add <url>");
      let url;
      try {
        url = new URL(args[0]);
      } catch {
        throw new Error("URL must be a valid HTTP(S) URL");
      }
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        !url.hostname
      ) {
        throw new Error("URL must be a valid HTTP(S) URL");
      }

      const response = await request(
        "/api/links",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: args[0] }),
        },
        dependencies,
      );
      const link = await response.json();
      if (typeof link.shortUrl !== "string") {
        throw new Error("Snip API returned an invalid link response");
      }
      dependencies.stdout.write(`${link.shortUrl}\n`);
      return 0;
    }

    if (command === "ls") {
      if (args.length !== 0) throw new Error("Usage: snip ls");
      const response = await request("/api/links", { method: "GET" }, dependencies);
      const links = await response.json();
      if (!Array.isArray(links)) throw new Error("Snip API returned an invalid link list");
      dependencies.stdout.write(`${formatLinks(links)}\n`);
      return 0;
    }

    if (command === "open") {
      if (args.length !== 1 || !CODE_PATTERN.test(args[0])) {
        throw new Error("Usage: snip open <6-character-code>");
      }
      const response = await request(
        `/${encodeURIComponent(args[0])}`,
        { method: "GET", redirect: "manual" },
        dependencies,
      );
      if (response.status !== 302) {
        throw new Error(`Snip API returned unexpected HTTP ${response.status}`);
      }
      const destination = response.headers.get("location");
      if (!destination) throw new Error("Snip API redirect did not include a Location");
      let target;
      try {
        target = new URL(destination);
      } catch {
        throw new Error("Snip API redirect included an invalid Location");
      }
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        throw new Error("Snip API redirect must use HTTP or HTTPS");
      }
      await dependencies.launchBrowser(destination);
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    dependencies.stderr.write(`${error.message}\n`);
    if (command !== "add" && command !== "ls" && command !== "open") {
      dependencies.stderr.write(`${usage()}\n`);
    }
    return 1;
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

module.exports = { formatLinks, run, usage };
