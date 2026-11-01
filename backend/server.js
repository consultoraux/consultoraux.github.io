"use strict";

// API + servidor estático sin dependencias de terceros. Requiere Node.js >= 22.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { URL } = require("node:url");

const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") {
  // En Render las variables del servicio tienen prioridad sobre las locales.
  process.loadEnvFile(ENV_FILE);
}

const PUBLIC_ROOT = path.resolve(__dirname, "..");
const MAX_BODY_BYTES = 12_000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUBMISSIONS = 5;

const profiles = Object.freeze({
  "ux-junior": "UX/UI Designer junior",
  "ux-semi": "UX/UI Designer semisenior",
  frontend: "Desarrollador/a frontend",
  otro: "Otro perfil"
});
const services = Object.freeze({
  discovery: "Discovery, ideación y testing",
  research: "UX Research aplicado",
  handoff: "Documentación UX y handoff",
  orientacion: "Necesito orientación"
});
const TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
});

function sendJson(res, status, data, extraHeaders = {}) {
  if (res.headersSent || res.destroyed) return;
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(payload);
}

function commonHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateSubmission(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const name = normalizeText(body.name);
  const email = normalizeText(body.email).toLowerCase();
  const profile = normalizeText(body.profile);
  const service = normalizeText(body.service);
  const challenge = normalizeText(body.challenge);
  const projectUrl = normalizeText(body.projectUrl);
  const consent = body.consent === true;
  const website = normalizeText(body.website);

  // Campo honeypot: responder OK sin envío para no revelar la protección a bots.
  if (website) return { isSpam: true };
  if (name.length < 2 || name.length > 100 || /[\r\n\x00-\x1F]/.test(name)) return null;
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(email)) return null;
  if (!Object.hasOwn(profiles, profile) || !Object.hasOwn(services, service)) return null;
  if (challenge.length < 20 || challenge.length > 2000 || /\x00/.test(challenge)) return null;
  if (!consent || projectUrl.length > 500) return null;
  if (projectUrl) {
    try {
      const parsed = new URL(projectUrl);
      if (!(["http:", "https:"].includes(parsed.protocol)) || !parsed.hostname) return null;
    } catch { return null; }
  }
  return { name, email, profile, service, challenge, projectUrl };
}

function makeEmail(payload) {
  const subject = `[Consultora UX] Nueva solicitud · ${services[payload.service]}`;
  const rows = [
    ["Nombre", payload.name],
    ["Correo", payload.email],
    ["Perfil", profiles[payload.profile]],
    ["Servicio", services[payload.service]],
    ["Proyecto", payload.projectUrl || "No informado"]
  ];
  const text = [
    "Nueva solicitud de Consultora UX", "", ...rows.map(([k, v]) => `${k}: ${v}`),
    "", "Desafío:", payload.challenge,
    "", "Consentimiento para responder: Sí", "", "Respondé directamente a este correo para contactar a la persona."
  ].join("\n");
  const table = rows.map(([k, v]) => `<tr><th style="text-align:left;padding:10px 16px;vertical-align:top;background:#f7f3ff">${escapeHtml(k)}</th><td style="padding:10px 16px;overflow-wrap:anywhere">${escapeHtml(v)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="font:16px/1.6 Arial,sans-serif;color:#1d2533"><main style="max-width:620px;margin:auto"><h1 style="color:#7157c7">Nueva solicitud de consultoría UX</h1><table style="border-collapse:collapse;width:100%">${table}</table><h2>Desafío</h2><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(payload.challenge)}</p><p style="color:#6b7280;font-size:13px">La persona autorizó el uso de sus datos para responder su consulta.</p></main></body></html>`;
  return { subject, text, html };
}

async function sendContactEmail(payload, env = process.env) {
  const apiKey = normalizeText(env.RESEND_API_KEY);
  const from = normalizeText(env.RESEND_FROM) || "Consultora UX <onboarding@resend.dev>";
  const to = normalizeText(env.CONTACT_TO) || "maryorism6@gmail.com";
  if (!apiKey || !from || !to) {
    const error = new Error("Correo no configurado");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }
  const { subject, text, html } = makeEmail(payload);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to: [to], reply_to: [payload.email], subject, text, html }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    console.error("Proveedor de correo rechazó la solicitud. HTTP", response.status);
    const error = new Error("No se pudo enviar el correo");
    error.code = "EMAIL_DELIVERY_FAILED";
    throw error;
  }
}

async function readJsonBody(req) {
  const contentType = (req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    const error = new Error("Formato de contenido no válido");
    error.httpStatus = 415;
    throw error;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error("Solicitud demasiado grande");
      error.httpStatus = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch {
    const error = new Error("JSON inválido");
    error.httpStatus = 400;
    throw error;
  }
}

function ipForLimit(req, trustProxy) {
  if (trustProxy) {
    // Tomamos el último salto reportado (el más cercano al proxy de confianza).
    const value = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean).at(-1);
    if (value && net.isIP(value)) return value;
  }
  return req.socket.remoteAddress || "unknown";
}

async function serveStatic(req, res, route) {
  // Solo exponemos los archivos públicos. El backend/.env jamás se publica.
  const isAsset = route.startsWith("/assets/");
  const allowedRootFile = route === "/" || route === "/index.html" || route === "/privacidad.html" || route === "/robots.txt";
  if (!isAsset && !allowedRootFile) return sendJson(res, 404, { error: "No encontrado" });
  let decoded;
  try { decoded = decodeURIComponent(route); } catch { return sendJson(res, 400, { error: "Ruta inválida" }); }
  if (decoded.includes("\\") || decoded.includes("\0")) return sendJson(res, 400, { error: "Ruta inválida" });
  const local = route === "/" ? "index.html" : decoded.slice(1);
  const fullPath = path.resolve(PUBLIC_ROOT, local);
  if (!fullPath.startsWith(PUBLIC_ROOT + path.sep)) return sendJson(res, 403, { error: "No autorizado" });
  const ext = path.extname(fullPath).toLowerCase();
  if (!Object.hasOwn(TYPES, ext)) return sendJson(res, 404, { error: "No encontrado" });
  try {
    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) return sendJson(res, 404, { error: "No encontrado" });
    res.writeHead(200, {
      "Content-Type": TYPES[ext],
      "Content-Length": stat.size,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(fullPath).pipe(res);
  } catch {
    sendJson(res, 404, { error: "No encontrado" });
  }
}

function createServer({ env = process.env, deliver = sendContactEmail } = {}) {
  const allowedOrigins = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean));
  const trustProxy = env.TRUST_PROXY === "true" || env.TRUST_PROXY === "1";
  const rateMap = new Map();

  return http.createServer((req, res) => {
    void (async () => {
    commonHeaders(res);
    let route;
    try { route = new URL(req.url, "http://localhost").pathname; }
    catch { return sendJson(res, 400, { error: "Ruta inválida" }); }

    if (route === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, emailConfigured: Boolean(env.RESEND_API_KEY) });
    }
    if (route === "/api/contact") {
      res.setHeader("Vary", "Origin");
      const origin = req.headers.origin;
      const sameOrigin = origin && (
        origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`
      );
      if (origin && !sameOrigin && !allowedOrigins.has(origin)) {
        return sendJson(res, 403, { error: "Origen no autorizado" });
      }
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" });
        return res.end();
      }
      if (req.method !== "POST") return sendJson(res, 405, { error: "Método no permitido" }, { Allow: "POST, OPTIONS" });
      const ip = ipForLimit(req, trustProxy);
      const now = Date.now();
      if (rateMap.size > 10000) {
        for (const [key, entry] of rateMap) if (now >= entry.resetAt) rateMap.delete(key);
        while (rateMap.size > 10000) rateMap.delete(rateMap.keys().next().value);
      }
      const entry = rateMap.get(ip);
      const limit = !entry || now >= entry.resetAt ? { count: 0, resetAt: now + WINDOW_MS } : entry;
      limit.count += 1;
      rateMap.set(ip, limit);
      if (limit.count > MAX_SUBMISSIONS) {
        const remaining = Math.max(1, Math.ceil((limit.resetAt - now) / 1000));
        return sendJson(res, 429, { error: "Demasiadas solicitudes. Intentá nuevamente más tarde." }, { "Retry-After": String(remaining) });
      }
      let body;
      try { body = await readJsonBody(req); }
      catch (error) { return sendJson(res, error.httpStatus || 400, { error: error.message }); }
      const submission = validateSubmission(body);
      if (!submission) return sendJson(res, 400, { error: "Datos de formulario inválidos" });
      if (submission.isSpam) return sendJson(res, 200, { ok: true });
      try {
        await deliver(submission, env);
        return sendJson(res, 200, { ok: true });
      } catch (error) {
        if (error.code === "EMAIL_NOT_CONFIGURED") return sendJson(res, 503, { error: "El formulario todavía no está habilitado" });
        console.error("No se pudo procesar la solicitud de contacto:", error.code || "EMAIL_ERROR");
        return sendJson(res, 502, { error: "No pudimos enviar tu solicitud. Intentá nuevamente." });
      }
    }
    if ((req.method === "GET" || req.method === "HEAD") && !route.startsWith("/api/")) {
      return serveStatic(req, res, route);
    }
    sendJson(res, 404, { error: "No encontrado" });
    })().catch((error) => {
      console.error("Error inesperado al atender una solicitud:", error?.code || "INTERNAL_ERROR");
      sendJson(res, 500, { error: "Error inesperado. Intentá nuevamente." });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT inválido");
  createServer().listen(port, "0.0.0.0", () => {
    console.log(`Consultora UX disponible en http://localhost:${port}`);
    console.log(process.env.RESEND_API_KEY ? "Envío de correo configurado" : "ATENCIÓN: falta RESEND_API_KEY; el formulario responderá 503");
  });
}

module.exports = { createServer, validateSubmission, makeEmail, escapeHtml, sendContactEmail };
