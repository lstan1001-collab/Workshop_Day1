const { isAbsolute, relative, resolve, sep } = require("node:path");

const links = new Map();
const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function getBaseUrl(port) {
  const configured = process.env.BASE_URL
    ? process.env.BASE_URL
    : process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${port}`;
  const parsed = new URL(configured);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("BASE_URL must use HTTP or HTTPS");
  }

  return parsed.origin;
}

function getPort() {
  const value = process.env.PORT ?? "3000";
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

function jsonResponse(body, status = 200) {
  return Response.json(body, { status });
}

function corsResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createCode() {
  let code = "";
  const random = new Uint8Array(8);

  while (code.length < 6) {
    crypto.getRandomValues(random);
    for (const byte of random) {
      if (byte < 248) {
        code += base62[byte % base62.length];
        if (code.length === 6) break;
      }
    }
  }

  return code;
}

async function findStaticFile(pathname) {
  const publicDir = process.env.PUBLIC_DIR;
  if (!publicDir) return null;

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  } catch {
    return null;
  }
  if (!relativePath) relativePath = "index.html";

  const root = resolve(publicDir);
  const candidate = resolve(root, relativePath);
  const pathFromRoot = relative(root, candidate);
  if (
    isAbsolute(pathFromRoot) ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`)
  ) {
    return null;
  }

  const file = Bun.file(candidate);
  return (await file.exists()) ? file : null;
}

function staticResponse(file) {
  return new Response(file, {
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
}

const port = getPort();
const baseUrl = getBaseUrl(port);

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    let response;

    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    if (request.method === "POST" && url.pathname === "/api/links") {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return corsResponse(jsonResponse({ error: "Invalid JSON" }, 400));
      }

      const originalUrl =
        payload && typeof payload.url === "string" ? payload.url.trim() : "";
      let parsedUrl;
      try {
        parsedUrl = new URL(originalUrl);
      } catch {
        return corsResponse(jsonResponse({ error: "A valid HTTP(S) URL is required" }, 400));
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return corsResponse(jsonResponse({ error: "A valid HTTP(S) URL is required" }, 400));
      }

      let code = createCode();
      while (links.has(code)) code = createCode();

      const link = {
        code,
        url: originalUrl,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return corsResponse(jsonResponse(link, 201));
    }

    if (request.method === "GET" && url.pathname === "/api/links") {
      return corsResponse(jsonResponse(Array.from(links.values())));
    }

    if (request.method === "GET" || request.method === "HEAD") {
      try {
        const file = await findStaticFile(url.pathname);
        if (file) {
          const response = staticResponse(file);
          if (request.method === "HEAD") {
            return corsResponse(new Response(null, response));
          }
          return corsResponse(response);
        }
      } catch (error) {
        console.error("Failed to serve static file:", error);
        return corsResponse(jsonResponse({ error: "Unable to serve file" }, 500));
      }
    }

    if (request.method === "GET" && url.pathname !== "/") {
      let code;
      try {
        code = decodeURIComponent(url.pathname.slice(1));
      } catch {
        code = "";
      }
      const link = links.get(code);
      if (!link) return corsResponse(jsonResponse({ error: "Link not found" }, 404));

      link.hits += 1;
      response = new Response(null, {
        status: 302,
        headers: { Location: link.url },
      });
      return corsResponse(response);
    }

    return corsResponse(jsonResponse({ error: "Not found" }, 404));
  },
});

console.log(`Snip API listening on http://localhost:${port}`);
