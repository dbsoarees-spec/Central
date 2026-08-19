import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/inicio", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("protects local access with a password cookie", async () => {
  const previousPassword = process.env.CENTRAL_FRETE_PASSWORD;
  const previousSecret = process.env.CENTRAL_FRETE_SESSION_SECRET;
  delete process.env.CENTRAL_FRETE_PASSWORD;
  delete process.env.CENTRAL_FRETE_SESSION_SECRET;
  try {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("auth-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  };
  const context = {
    waitUntil() {},
    passThroughOnException() {},
  };

  const rejected = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "incorreta" }),
    }),
    env,
    context,
  );
  assert.equal(rejected.status, 401);

  const accepted = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "central123" }),
    }),
    env,
    context,
  );
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers.get("set-cookie") ?? "", /cf_local_session=/);
  assert.match(accepted.headers.get("set-cookie") ?? "", /HttpOnly/i);
  } finally {
    if (previousPassword === undefined) delete process.env.CENTRAL_FRETE_PASSWORD;
    else process.env.CENTRAL_FRETE_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.CENTRAL_FRETE_SESSION_SECRET;
    else process.env.CENTRAL_FRETE_SESSION_SECRET = previousSecret;
  }
});
