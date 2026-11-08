import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import appHandler from "./api/index";
import { getTursoD1FromEnv, tursoSyncNow, tursoDiag } from "./src/turso-d1";
import { writeFileSync } from "fs";
import { gzipSync } from "zlib";
import { join as pJoin } from "path";
import { BOT_TOKEN, aiChatComplete } from "./src/core";
import { msAiRelay } from "./src/multi-school";

const PORT = Number(process.env.PORT || 3000);
let cachedPdfJsBuf: Buffer | null = null;

// ===== صف ارسال تلگرام (Telegram Outbox Relay) =====
// در میزبان‌های داخل ایران (مثل گردو) دسترسی به api.telegram.org مسدود است؛
// ارسال‌ها در صف دیتابیس (ms_tg_outbox) ذخیره می‌شوند و نمونه‌ی متصل (Render)
// هر چند ثانیه آن‌ها را واقعاً ارسال می‌کند. حالت به‌صورت خودکار در بوت تشخیص داده می‌شود.
const realFetch = globalThis.fetch.bind(globalThis);
const TG_API = "https://api.telegram.org/";
let tgOutboxMode = true; // امن‌ترین حالت پیش‌فرض: صف؛ بعد از تست اتصال، مستقیم می‌شود

async function tgOutboxEnsure(): Promise<void> {
  try {
    const db = getTursoD1FromEnv(process.env);
    if (!db) return;
    await db.prepare("CREATE TABLE IF NOT EXISTS ms_tg_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, body TEXT, attempts INTEGER DEFAULT 0, created_at INTEGER)").run();
  } catch (e) {
    console.error("tgOutboxEnsure:", (e as any)?.message || e);
  }
}

async function tgOutboxEnqueue(url: string, body: string): Promise<void> {
  try {
    const db = getTursoD1FromEnv(process.env);
    if (!db) return;
    await tgOutboxEnsure();
    await db.prepare("INSERT INTO ms_tg_outbox (url, body, created_at) VALUES (?,?,?)").bind(url, body, Date.now()).run();
  } catch (e) {
    console.error("tgOutboxEnqueue:", (e as any)?.message || e);
  }
}

async function tgOutboxDrain(): Promise<void> {
  try {
    const db = getTursoD1FromEnv(process.env);
    if (!db) return;
    await tgOutboxEnsure();
    const res: any = await db.prepare("SELECT id, url, body, attempts FROM ms_tg_outbox WHERE attempts < 5 ORDER BY id LIMIT 10").all();
    const rows: any[] = (res && res.results) || [];
    for (const r of rows) {
      try {
        const resp = await realFetch(String(r.url), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: String(r.body || ""),
          signal: AbortSignal.timeout(15000),
        });
        if (resp.ok) {
          await db.prepare("DELETE FROM ms_tg_outbox WHERE id = ?").bind(r.id).run();
        } else {
          await db.prepare("UPDATE ms_tg_outbox SET attempts = attempts + 1 WHERE id = ?").bind(r.id).run();
        }
      } catch {
        try { await db.prepare("UPDATE ms_tg_outbox SET attempts = attempts + 1 WHERE id = ?").bind(r.id).run(); } catch {}
      }
    }
  } catch {}
}

// ==================== 🤖 صف درخواست‌های هوش مصنوعی (برای میزبان‌های داخل ایران) ====================
function headersToObj(h: any): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!h) return out;
    if (typeof h.forEach === "function" && typeof h.get === "function") {
      h.forEach((v: string, k: string) => { out[k] = v; });
    } else if (Array.isArray(h)) {
      for (const pair of h) { if (pair && pair.length >= 2) out[String(pair[0])] = String(pair[1]); }
    } else if (typeof h === "object") {
      for (const k of Object.keys(h)) { if (h[k] !== undefined && h[k] !== null) out[k] = String(h[k]); }
    }
  } catch {}
  return out;
}

async function relayHttpFetch(url: string, init: any, bodyStr: string): Promise<Response> {
  const db = getTursoD1FromEnv(process.env);
  if (!db) throw new Error("relay: db not connected");
  await db.prepare("CREATE TABLE IF NOT EXISTS ms_http_jobs (id INTEGER PRIMARY KEY, method TEXT, url TEXT, headers TEXT, body TEXT, resp_status INTEGER, resp_body TEXT, error TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, created_at INTEGER)").run();
  const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  await db
    .prepare("INSERT INTO ms_http_jobs (id, method, url, headers, body, status, created_at) VALUES (?,?,?,?,?, 'pending', ?)")
    .bind(id, String(init.method || "GET"), url, JSON.stringify(headersToObj(init.headers)), bodyStr, Date.now())
    .run();
  for (let i = 0; i < 40; i++) {
    if (init && init.signal && init.signal.aborted) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 1500));
    try { await tursoSyncNow(true); } catch {}
    const row: any = await db.prepare("SELECT status, resp_status, resp_body, error FROM ms_http_jobs WHERE id = ?").bind(id).first();
    if (row && row.status === "done") {
      try { await db.prepare("DELETE FROM ms_http_jobs WHERE id = ?").bind(id).run(); } catch {}
      return new Response(String(row.resp_body || ""), { status: Number(row.resp_status || 200), headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    if (row && row.status === "error") {
      try { await db.prepare("DELETE FROM ms_http_jobs WHERE id = ?").bind(id).run(); } catch {}
      throw new Error(String(row.error || "relay failed"));
    }
  }
  try { await db.prepare("DELETE FROM ms_http_jobs WHERE id = ?").bind(id).run(); } catch {}
  throw new Error("پاسخ هوش مصنوعی به‌موقع نرسید.");
}

(globalThis as any).fetch = async (input: any, init?: any): Promise<Response> => {
  try {
    const url = typeof input === "string" ? input : String((input && input.url) || "");
    // هوش مصنوعی در برخی میزبان‌ها (ایران) تحریم/مسدود است — درخواست‌ها را از طریق صف به نمونه‌ی متصل می‌فرستیم
    const AI_HOSTS = ["api.groq.com", "generativelanguage.googleapis.com", "openrouter.ai"];
    if (String(process.env.SMARTCLASS_RELAY || "") === "1" && AI_HOSTS.some((h) => url.includes(h))) {
      let bodyStr = typeof (init as any)?.body === "string" ? String((init as any).body) : "";
      if ((init as any)?.body && !bodyStr && typeof (init as any).body.entries === "function") {
        try {
          const parts: any[] = [];
          for (const [k, v] of (init as any).body.entries()) {
            if (typeof v === "string") parts.push({ k, v });
            else {
              const buf = Buffer.from(await (v as any).arrayBuffer());
              parts.push({ k, b64: buf.toString("base64"), fn: (v as any).name || "file", ct: (v as any).type || "application/octet-stream" });
            }
          }
          bodyStr = JSON.stringify({ __form: parts });
        } catch { bodyStr = ""; }
      }
      if (!(init as any)?.body || bodyStr) {
        try {
          return await relayHttpFetch(url, (init as any) || {}, bodyStr);
        } catch (eRH) {
          return new Response(JSON.stringify({ error: "ارتباط با هوش مصنوعی برقرار نشد: " + String((eRH as any)?.message || eRH).slice(0, 110) }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
        }
      }
    }
    if (tgOutboxMode && url.startsWith(TG_API)) {
      if (url.includes("/getFile") || url.includes("/getMe")) {
        return new Response(JSON.stringify({ ok: false, error_code: 403, description: "telegram unreachable (outbox relay mode)" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      let u = url;
      if (u.includes("setWebhook")) {
        const base = (process.env.TELEGRAM_WEBHOOK_BASE || "https://smartclasstrusu.onrender.com").replace(/\/+$/, "");
        u = u.replace(/url=[^&]*/, "url=" + encodeURIComponent(base + "/webhook"));
      }
      const bodyStr = init && init.body != null ? String(init.body) : "";
      await tgOutboxEnqueue(u, bodyStr);
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
  } catch {}
  return realFetch(input as any, init as any);
};

const server = http.createServer(async (req, res) => {
  try {
    // مسیر سلامت فوق‌سبک برای Render و سرویس‌های بیدارنگهدار رایگان (cron-job.org / UptimeRobot)
    const cleanPath = (req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";
    if (cleanPath === "/health" || cleanPath === "/ping" || cleanPath === "/healthz") {
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Length": "0",
        });
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": "2",
      });
      res.end("ok");
      return;
    }

    // ⚡ اتصال خودکار دیتابیس از راه دور — معادل پر کردن فرم /setup ولی با یک لینک GET
    if (cleanPath === "/api/setup/quick") {
      const q = new URL(String(req.url || "/"), "http://l").searchParams;
      const wantPass = String(process.env.PANEL_PASSWORD || "Mina1362@");
      const pwd = String(q.get("p") || q.get("password") || "");
      const html = (title: string, body: string, ok: boolean) =>
        "<!DOCTYPE html><html lang='fa' dir='rtl'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><body style='background:#0F172A;color:#fff;font-family:Tahoma;text-align:center;padding:36px'><h1 style='font-size:44px;margin:10px'>" + (ok ? "\u2705" : "\u26a0\ufe0f") + "</h1><h2>" + title + "</h2><p style='font-size:19px;line-height:2'>" + body + "</p><a style='color:#38BDF8;font-size:20px;line-height:2.6' href='/school'>\u2190 ورود به پنل مدرسه</a></body></html>";
      if (pwd !== wantPass) {
        res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html("رمز نادرست است", "پارامتر p= با رمز مدیر مطابقت ندارد.", false));
        return;
      }
      const u = String(q.get("u") || "").trim();
      const t = String(q.get("t") || "").trim();
      const g = String(q.get("g") || "").trim();
      if (!u.startsWith("libsql://") || t.length < 20) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html("مقادیر ناقص است", "پارامترهای u= (آدرس Turso) و t= (توکن) لازم است.", false));
        return;
      }
      process.env.TURSO_DATABASE_URL = u;
      process.env.TURSO_AUTH_TOKEN = t;
      if (g.startsWith("gsk_")) process.env.GROQ_API_KEY = g;
      let note = "";
      try {
        const cfg: any = { TURSO_DATABASE_URL: u, TURSO_AUTH_TOKEN: t };
        if (g.startsWith("gsk_")) cfg.GROQ_API_KEY = g;
        writeFileSync(pJoin(process.cwd(), "smartclass-config.json"), JSON.stringify(cfg, null, 2));
      } catch (e: any) {
        note = " (ذخیره‌ی فایل ممکن نشد؛ در حافظه فعال شد)";
      }
      let cnt = 0;
      try {
        const db = getTursoD1FromEnv(process.env);
        const r: any = db ? await db.prepare("SELECT COUNT(*) as c FROM students WHERE name != ''").first() : null;
        cnt = Number((r && r.c) || 0);
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html("اتصال برقرار نشد", String((e && e.message) || e).slice(0, 160), false));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html("اتصال دیتابیس انجام شد!", "دیتابیس Turso با موفقیت وصل شد &mdash; <b>" + cnt + " دانش‌آموز</b> در دسترس است." + note + "<br><span style='opacity:.7'>quick-connect v1</span>", true));
      return;
    }

    if (cleanPath === "/api/net-check") {
      const out: any = { build: "v6", mode: tgOutboxMode ? "outbox" : "direct", ts: Date.now() };
      const probe = async (name: string, url: string) => {
        const t0 = Date.now();
        try {
          const r = await realFetch(url, { method: "GET", signal: AbortSignal.timeout(10000) });
          out[name] = { ms: Date.now() - t0, status: r.status };
        } catch (e: any) {
          out[name] = { ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 80) };
        }
      };
      await probe("groq", "https://api.groq.com/openai/v1/models");
      await probe("openrouter", "https://openrouter.ai/api/v1/models");
      await probe("gemini", "https://generativelanguage.googleapis.com/");
      await probe("telegram", "https://api.telegram.org/");
      const t0 = Date.now();
      try {
        const db = getTursoD1FromEnv(process.env);
        if (db) {
          await db.prepare("SELECT 1 as x").first();
          out.turso_q1 = { ms: Date.now() - t0 };
          const t1 = Date.now();
          await db.prepare("SELECT COUNT(*) as c FROM students WHERE name != ''").first();
          out.turso_count = { ms: Date.now() - t1 };
          const t2 = Date.now();
          await db.prepare("SELECT COUNT(*) as c FROM students WHERE name != ''").first();
          out.turso_count2 = { ms: Date.now() - t2 };
          out.diag = tursoDiag();
          out.flags = { RENDER: process.env.RENDER ? "set" : "", NO_REPLICA: process.env.TURSO_NO_REPLICA ? "set" : "" };
        } else {
          out.turso = { error: "no db" };
        }
      } catch (e: any) {
        out.turso = { error: String((e && e.message) || e).slice(0, 80) };
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
      return;
    }

    if (cleanPath === "/api/ai-check") {
      const out: any = { ts: Date.now() };
      const one = async (name: string, prov: string) => {
        const t0 = Date.now();
        try {
          let key = "";
          if (prov === "gemini" || prov === "openrouter") {
            try {
              const dbx = getTursoD1FromEnv(process.env);
              const kr: any = dbx ? await dbx.prepare("SELECT api_key FROM ms_ai_keys WHERE provider = ?").bind(prov).first() : null;
              key = String((kr && kr.api_key) || "");
            } catch {}
          }
          const r = await aiChatComplete({ GROQ_API_KEY: process.env.GROQ_API_KEY || "" } as any, prov, "پاسخ کوتاه بده.", "1+1 چند می شود؟ فقط عدد بنویس.", key);
          out[name] = { ms: Date.now() - t0, result: String(r).slice(0, 40) };
        } catch (e: any) {
          out[name] = { ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 120) };
        }
      };
      if (String(req.url || "").includes("hdrs=1")) {
        const th = Date.now();
        try {
          const hh = new Headers({ Authorization: "Bearer " + (process.env.GROQ_API_KEY || ""), "Content-Type": "application/json" });
          const rr = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: hh,
            body: JSON.stringify({ model: "qwen/qwen3.8-27b", messages: [{ role: "user", content: "فقط عدد: 3+3 چند می شود؟" }], max_tokens: 8 }),
          });
          const jj: any = await rr.json().catch(() => ({}));
          out.hdrsTest = { ms: Date.now() - th, status: rr.status, result: String(jj?.choices?.[0]?.message?.content || "").slice(0, 20), err: String(jj?.error || "").slice(0, 110) };
        } catch (eH: any) {
          out.hdrsTest = { ms: Date.now() - th, error: String((eH && eH.message) || eH).slice(0, 100) };
        }
      }
      const onlyHdrs = String(req.url || "").includes("only=hdrs");
      if (!onlyHdrs) {
        await one("auto", "auto");
        await one("gemini", "gemini");
        await one("openrouter", "openrouter");
      }
      if (String(req.url || "").includes("relay=1")) {
        const t0 = Date.now();
        try {
          const dbx = getTursoD1FromEnv(process.env);
          const r = await msAiRelay(dbx, "auto", "پاسخ کوتاه بده.", "1+1 چند می شود؟ فقط عدد بنویس.");
          out.relay = { ms: Date.now() - t0, result: String(r).slice(0, 40) };
        } catch (e: any) {
          out.relay = { ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 120) };
        }
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
      return;
    }

    if (cleanPath === "/api/tg-status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ mode: tgOutboxMode ? "outbox" : "direct" }));
      return;
    }

    // سرو مستقیم موتور رندر صفحات PDF برای وایت‌برد کلاس آنلاین (بدون نیاز به هیچ CDN خارجی یا فیلترشده)
    if (cleanPath === "/api/app/live/pdfjs.mjs") {
      if (!cachedPdfJsBuf) {
        const candidate = path.resolve(process.cwd(), "node_modules/unpdf/dist/pdfjs.mjs");
        if (fs.existsSync(candidate)) {
          cachedPdfJsBuf = fs.readFileSync(candidate);
        }
      }
      if (cachedPdfJsBuf) {
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=604800",
          "Access-Control-Allow-Origin": "*",
          "Content-Length": String(cachedPdfJsBuf.length),
        });
        res.end(cachedPdfJsBuf);
        return;
      }
    }

    const protoHeader = req.headers["x-forwarded-proto"];
    const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
    const fullUrl = `${proto}://${host}${req.url || "/"}`;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const item of v) headers.append(k, item);
      } else if (typeof v === "string") {
        headers.set(k, v);
      }
    }

    let bodyBuf: Buffer | undefined = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      bodyBuf = Buffer.concat(chunks);
    }

    const webReq = new Request(fullUrl, {
      method: req.method || "GET",
      headers,
      body: bodyBuf && bodyBuf.length > 0 ? new Uint8Array(bodyBuf) : undefined,
    });

    const webRes = await appHandler.fetch(webReq);

    const outHeaders: Record<string, string> = {};
    webRes.headers.forEach((val, key) => {
      outHeaders[key] = val;
    });

    const respArrayBuf = await webRes.arrayBuffer();
    let outBuf = Buffer.from(respArrayBuf);
    const ct = String(outHeaders["content-type"] || "");
    const wantsGzip = String(req.headers["accept-encoding"] || "").includes("gzip");
    if (wantsGzip && outBuf.length > 1024 && /text\/|javascript|json|svg|xml/i.test(ct) && !outHeaders["content-encoding"]) {
      try {
        const gz = gzipSync(outBuf);
        if (gz.length < outBuf.length) {
          outHeaders["content-encoding"] = "gzip";
          outHeaders["content-length"] = String(gz.length);
          outHeaders["vary"] = "Accept-Encoding";
          res.writeHead(webRes.status, outHeaders);
          res.end(gz);
          return;
        }
      } catch {}
    }
    res.writeHead(webRes.status, outHeaders);
    res.end(outBuf);
  } catch (err: any) {
    console.error("Server Request Error:", err);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err?.message || "Internal Server Error" }));
  }
});

// زمان‌بند داخلی روزانه برای ارسال خودکار تبریک تولد و یادآور ددلاین‌ها (ساعت ۰۸:۳۰ صبح به وقت تهران)
let lastCronDay = "";
setInterval(async () => {
  try {
    if (tgOutboxMode) return; // کرون فقط در نمونه‌ی متصل به تلگرام (بدون تکرار)
    const nowUtc = new Date();
    const dayKey = nowUtc.toISOString().split("T")[0];
    if (nowUtc.getUTCHours() === 5 && lastCronDay !== dayKey) {
      lastCronDay = dayKey;
      await appHandler.fetch(new Request(`http://localhost:${PORT}/api/cron`));
    }
  } catch {}
}, 15 * 60 * 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ SmartClass Server running on http://0.0.0.0:${PORT}`);
});

async function aiJobsDrain(): Promise<void> {
  try {
    const db = getTursoD1FromEnv(process.env);
    if (!db) return;
    await db.prepare("CREATE TABLE IF NOT EXISTS ms_ai_jobs (id INTEGER PRIMARY KEY, provider TEXT, sys TEXT, user TEXT, result TEXT, error TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, created_at INTEGER)").run();
    try { await db.prepare("UPDATE ms_ai_jobs SET status = 'pending' WHERE status = 'running' AND created_at < ?").bind(Date.now() - 150000).run(); } catch {}
    const res: any = await db.prepare("SELECT id, provider, sys, user FROM ms_ai_jobs WHERE status = 'pending' AND attempts < 3 ORDER BY id LIMIT 3").all();
    const rows: any[] = (res && res.results) || [];
    for (const r of rows) {
      try {
        await db.prepare("UPDATE ms_ai_jobs SET attempts = attempts + 1, status = 'running' WHERE id = ?").bind(r.id).run();
        let key = "";
        if (r.provider === "gemini" || r.provider === "openrouter") {
          try {
            const kr: any = await db.prepare("SELECT api_key FROM ms_ai_keys WHERE provider = ?").bind(r.provider).first();
            key = String((kr && kr.api_key) || "");
          } catch {}
        }
        const out = await aiChatComplete({ GROQ_API_KEY: process.env.GROQ_API_KEY || "" } as any, String(r.provider || "auto"), String(r.sys || ""), String(r.user || ""), key);
        await db.prepare("UPDATE ms_ai_jobs SET status = 'done', result = ? WHERE id = ?").bind(String(out).slice(0, 24000), r.id).run();
      } catch (e: any) {
        try { await db.prepare("UPDATE ms_ai_jobs SET status = 'error', error = ? WHERE id = ?").bind(String((e && e.message) || e).slice(0, 300), r.id).run(); } catch {}
      }
    }
    // درخواست‌های HTTP خام هوش مصنوعی (askAI / aiTool / generateQuiz و...)
    try {
      await db.prepare("CREATE TABLE IF NOT EXISTS ms_http_jobs (id INTEGER PRIMARY KEY, method TEXT, url TEXT, headers TEXT, body TEXT, resp_status INTEGER, resp_body TEXT, error TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, created_at INTEGER)").run();
      try { await db.prepare("UPDATE ms_http_jobs SET status = 'pending' WHERE status = 'running' AND created_at < ?").bind(Date.now() - 150000).run(); } catch {}
      const hres: any = await db.prepare("SELECT id, method, url, headers, body FROM ms_http_jobs WHERE status = 'pending' AND attempts < 2 ORDER BY id LIMIT 3").all();
      for (const r of ((hres && hres.results) || []) as any[]) {
        try {
          await db.prepare("UPDATE ms_http_jobs SET attempts = attempts + 1, status = 'running' WHERE id = ?").bind(r.id).run();
          const hdrs: any = JSON.parse(String(r.headers || "{}"));
          let bodyArg: any = r.body ? String(r.body) : undefined;
          if (bodyArg && bodyArg.indexOf('{"__form"') === 0) {
            try {
              const parts = JSON.parse(bodyArg).__form || [];
              const fd = new FormData();
              for (const pt of parts) {
                if (pt.b64 !== undefined) fd.append(pt.k, new Blob([Buffer.from(pt.b64, "base64")], { type: pt.ct }), pt.fn);
                else fd.append(pt.k, pt.v);
              }
              bodyArg = fd;
              for (const hk of Object.keys(hdrs)) if (hk.toLowerCase() === "content-type") delete hdrs[hk];
            } catch {}
          }
          const resp = await realFetch(String(r.url), { method: String(r.method || "GET"), headers: hdrs, body: bodyArg });
          const txt = await resp.text();
          await db.prepare("UPDATE ms_http_jobs SET status = 'done', resp_status = ?, resp_body = ? WHERE id = ?").bind(resp.status, txt.slice(0, 300000), r.id).run();
        } catch (e2: any) {
          try { await db.prepare("UPDATE ms_http_jobs SET status = 'error', error = ? WHERE id = ?").bind(String((e2 && e2.message) || e2).slice(0, 300), r.id).run(); } catch {}
        }
      }
    } catch {}
  } catch {}
}

// تشخیص خودکار دسترسی به تلگرام + شروع تخلیه‌ی صف فقط در نمونه‌ی متصل
(async () => {
  try {
    const r = await realFetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(8000) });
    tgOutboxMode = !r.ok;
  } catch {
    tgOutboxMode = true;
  }
  console.log("Telegram relay mode:", tgOutboxMode ? "OUTBOX (queue -> relay node sends)" : "direct");
  process.env.SMARTCLASS_RELAY = tgOutboxMode ? "1" : "0";
  if (!tgOutboxMode) {
    setInterval(() => { tgOutboxDrain(); aiJobsDrain(); }, 5000);
  }
})();
