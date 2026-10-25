import http from "node:http";
import appHandler from "./api/index";

const PORT = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  try {
    // مسیر سلامت سریع برای Render و سرویس‌های بیدارنگهدار رایگان (cron-job.org)
    if (req.url === "/health" || req.url === "/ping") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
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
