import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = join(root, "bundle");
const suppliedUrl = process.argv[2] || process.env.SNIP_URL;
const port = process.env.PORT || "3127";
const baseUrl = suppliedUrl || `http://127.0.0.1:${port}`;
let server;
let output = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`Bun server exited early:\n${output}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Server did not become ready at ${url}:\n${output}`);
}

if (!suppliedUrl) {
  server = spawn("bun", ["run", "server.js"], {
    cwd: bundleDir,
    env: { ...process.env, PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.once("error", (error) => {
    output = (output + error.message).slice(-4000);
  });
  server.stdout.setEncoding("utf8").on("data", (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  server.stderr.setEncoding("utf8").on("data", (chunk) => {
    output = (output + chunk).slice(-4000);
  });
}

try {
  await waitForServer(baseUrl);

  const homepage = await fetch(baseUrl);
  const html = await homepage.text();
  assert(homepage.ok && html.includes("<html"), "Static frontend did not load");

  const createdResponse = await fetch(new URL("/api/links", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/smoke-test" }),
  });
  assert(createdResponse.status === 201, "POST /api/links did not return 201");
  const link = await createdResponse.json();
  assert(/^[0-9A-Za-z]{6}$/.test(link.code), "API returned an invalid short code");
  assert(link.hits === 0, "New link did not start with zero hits");
  assert(Number.isFinite(Date.parse(link.createdAt)), "API returned an invalid timestamp");

  const redirect = await fetch(new URL(`/${link.code}`, baseUrl), {
    redirect: "manual",
  });
  assert(redirect.status === 302, "Short URL did not return 302");
  assert(
    redirect.headers.get("location") === link.url,
    "Redirect target did not match the original URL",
  );

  const listResponse = await fetch(new URL("/api/links", baseUrl));
  assert(listResponse.ok, "GET /api/links failed");
  const links = await listResponse.json();
  const listedLink = links.find((item) => item.code === link.code);
  assert(listedLink?.hits === 1, "Redirect did not increment the hit count");

  const cli = spawnSync(process.execPath, ["cli.js", "ls"], {
    cwd: bundleDir,
    encoding: "utf8",
    env: { ...process.env, SNIP_API: baseUrl },
  });
  if (cli.error) throw cli.error;
  assert(cli.status === 0, `CLI list failed:\n${cli.stderr}`);
  assert(cli.stdout.includes(link.code), "CLI did not list the created link");

  console.log(`Smoke test passed for ${baseUrl}: frontend, API, redirect, hits, and CLI.`);
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([
      new Promise((resolveExit) => server.once("exit", resolveExit)),
      delay(5000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}
