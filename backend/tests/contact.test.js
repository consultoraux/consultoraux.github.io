"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer, validateSubmission, makeEmail, escapeHtml } = require("../server");

const valid = {
  name: "María Pérez",
  email: "maria@example.com",
  profile: "ux-junior",
  service: "discovery",
  challenge: "Me gustaría definir objetivos y validar una idea antes de diseñarla.",
  projectUrl: "https://example.com/proyecto",
  website: "",
  consent: true
};

async function withServer(callback, overrides = {}) {
  const deliveries = [];
  const server = createServer({
    env: { ALLOWED_ORIGINS: "https://ejemplo.github.io", RESEND_API_KEY: "test", ...overrides.env },
    deliver: overrides.deliver || (async (submission) => { deliveries.push(submission); })
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await callback({ base, deliveries }); }
  finally { await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); }
}

async function send(base, body, options = {}) {
  return fetch(`${base}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: JSON.stringify(body)
  });
}

test("datos válidos y protección de nombre, correo y URL", () => {
  assert.equal(validateSubmission(valid).email, "maria@example.com");
  assert.equal(validateSubmission({ ...valid, consent: false }), null);
  assert.equal(validateSubmission({ ...valid, projectUrl: "javascript:alert(1)" }), null);
  assert.equal(validateSubmission({ ...valid, email: "pepe\r\nBCC:someone@example.com" }), null);
  assert.equal(validateSubmission({ ...valid, challenge: "corto" }), null);
  assert.equal(validateSubmission({ ...valid, service: "fake" }), null);
  assert.equal(validateSubmission({ ...valid, name: "Yo\nBCC:someone@example.com" }), null);
  assert.equal(validateSubmission({ ...valid, website: "bot" }).isSpam, true);
});

test("HTML de email escapa etiquetas y conserva cuerpo de texto", () => {
  assert.equal(escapeHtml('<script>"&'), "&lt;script&gt;&quot;&amp;");
  const out = makeEmail({ ...valid, challenge: "<script>alert(1)</script>  una frase de más" });
  assert.match(out.html, /&lt;script&gt;/);
  assert.doesNotMatch(out.html, /<script>/);
  assert.match(out.text, /María Pérez/);
});

test("web y archivos ilustrados se sirven pero backend no es público", async () => {
  await withServer(async ({ base }) => {
    for (const file of ["/", "/privacidad.html", "/assets/css/styles.css", "/assets/img/ux-studio.webp", "/assets/img/discovery.svg", "/assets/vendor/bootstrap/bootstrap.min.css", "/assets/vendor/bootstrap/bootstrap.bundle.min.js"]) {
      const response = await fetch(base + file);
      assert.equal(response.status, 200, file);
      assert.ok(Number(response.headers.get("content-length")) > 100, file);
    }
    const secret = await fetch(base + "/backend/.env.example");
    assert.equal(secret.status, 404);
  });
});

test("solicitud válida llega a proveedor; respuesta segura", async () => {
  await withServer(async ({ base, deliveries }) => {
    const response = await send(base, valid);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].name, "María Pérez");
  });
});

test("formularios inválidos se rechazan; honeypot se descarta", async () => {
  await withServer(async ({ base, deliveries }) => {
    assert.equal((await send(base, { ...valid, consent: false })).status, 400);
    assert.equal((await send(base, { ...valid, website: "una web spam" })).status, 200);
    assert.equal(deliveries.length, 0);
  });
});

test("orígenes CORS: preflight autorizado, origen extraño bloqueado", async () => {
  await withServer(async ({ base }) => {
    const ok = await fetch(base + "/api/contact", { method: "OPTIONS", headers: { Origin: "https://ejemplo.github.io", "Access-Control-Request-Method": "POST" } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get("access-control-allow-origin"), "https://ejemplo.github.io");
    const denied = await send(base, valid, { headers: { Origin: "https://sitio-falso.example" } });
    assert.equal(denied.status, 403);
  });
});

test("limita peticiones repetidas", async () => {
  await withServer(async ({ base }) => {
    for (let i = 0; i < 5; i += 1) assert.equal((await send(base, valid)).status, 200);
    const response = await send(base, valid);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) > 0);
  });
});

test("proveedor no configurado devuelve 503; fallo de envío devuelve 502", async () => {
  await withServer(async ({ base }) => {
    const response = await send(base, valid);
    assert.equal(response.status, 503);
  }, {
    env: { RESEND_API_KEY: "" },
    deliver: async () => { const error = new Error("missing"); error.code = "EMAIL_NOT_CONFIGURED"; throw error; }
  });
  await withServer(async ({ base }) => {
    const response = await send(base, valid);
    assert.equal(response.status, 502);
  }, { deliver: async () => { throw new Error("SMTP unavailable"); } });
});

test("health endpoint informa configuración, sin revelar secretos", async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(base + "/api/health");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, emailConfigured: true });
  });
});
