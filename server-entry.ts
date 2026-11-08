import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import appHandler from "./api/index";
import { getTursoD1FromEnv } from "./src/turso-d1";
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

(globalThis as any).fetch = async (input: any, init?: any): Promise<Response> => {
  try {
    const url = typeof input === "string" ? input : String((input && input.url) || "");
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

    if (cleanPath === "/api/net-check") {
      const out: any = { mode: tgOutboxMode ? "outbox" : "direct", ts: Date.now() };
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
      await one("auto", "auto");
      await one("gemini", "gemini");
      await one("openrouter", "openrouter");
      if (String(request.url || "").includes("relay=1")) {
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
    res.writeHead(webRes.status, outHeaders);
    res.end(Buffer.from(respArrayBuf));
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
