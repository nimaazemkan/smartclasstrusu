import fs from "node:fs";
import nodePath from "node:path";
import { D1Database, getTursoD1FromEnv } from "./turso-d1";

export interface SetupDeps {
  schoolName: string;
  teacherName: string;
  teacherId: number;
  botToken: string;
  panelPassword: string;
  hasTurso: boolean;
  hasGroqKey: boolean;
  db: D1Database | null;
}

export async function handleSetupRequest(
  request: Request,
  deps: SetupDeps
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = `${url.protocol}//${url.host}`;

  // ۱. اجرای APIهای جادوگر راه‌اندازی و انتقال داده
  if (path === "/api/setup/action" && request.method === "POST") {
    let body: any = {};
    const ctReq = request.headers.get("content-type") || "";
    const isFormReq = ctReq.includes("urlencoded") || ctReq.includes("multipart");
    if (isFormReq) {
      try {
        const fd = await request.formData();
        body = Object.fromEntries((fd as any).entries() || []);
      } catch {}
    } else {
      try {
        body = await request.json();
      } catch {}
    }
    if (body.password !== deps.panelPassword) {
      return Response.json({ ok: false, error: "رمز مدیریت اشتباه است." }, { status: 401 });
    }

    // الف) تنظیم خودکار وبهوک ربات تلگرام روی دامنه جدید Vercel
    if (body.action === "set_webhook") {
      if (!deps.botToken) {
        return Response.json({ ok: false, error: "BOT_TOKEN تنظیم نشده است." }, { status: 400 });
      }
      const webhookUrl = `${origin}/webhook`;
      const tgRes = await fetch(
        `https://api.telegram.org/bot${deps.botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`
      );
      const tgJson = (await tgRes.json()) as any;
      if (!tgJson.ok) {
        return Response.json({ ok: false, error: tgJson.description || "خطا از سمت تلگرام" }, { status: 400 });
      }
      return Response.json({
        ok: true,
        message: `✅ ربات تلگرام با موفقیت به سرور بدون فیلتر جدید متصل شد!\nآدرس وبهوک: ${webhookUrl}`,
      });
    }

    // ب) انتقال خودکار دانش‌آموزان و سوابق از کلودفلر قبلی به دیتابیس جدید Turso
    if (body.action === "migrate_from_cloudflare") {
      if (!deps.db) {
        return Response.json({ ok: false, error: "ابتدا متغیرهای TURSO_DATABASE_URL و TURSO_AUTH_TOKEN را در تنظیمات سرور وارد کنید." }, { status: 400 });
      }
      const sourceUrl = String(body.oldUrl || "https://my-telegram-bot.nimaazemkan.workers.dev").replace(/\/+$/, "");
      const dashRes = await fetch(`${sourceUrl}/api/dashboard`);
      if (!dashRes.ok) {
        return Response.json({ ok: false, error: `سرور قبلی پاسخ نداد (${dashRes.status})` }, { status: 400 });
      }
      const dash = (await dashRes.json()) as any;
      const students = Array.isArray(dash.students) ? dash.students : [];
      let importedStudents = 0;
      let importedHw = 0;
      let importedBadges = 0;

      for (const s of students) {
        let grade = "";
        let stDetail: any = null;
        try {
          const r = await fetch(`${sourceUrl}/api/student/${s.user_id}`);
          if (r.ok) stDetail = await r.json();
          grade = stDetail?.my?.grade || "";
        } catch {}

        await deps.db
          .prepare(
            `INSERT INTO students (user_id, name, score, joined, streak, max_streak, level, grade)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               name = excluded.name,
               score = MAX(students.score, excluded.score),
               streak = MAX(students.streak, excluded.streak),
               max_streak = MAX(students.max_streak, excluded.max_streak),
               level = MAX(students.level, excluded.level)`
          )
          .bind(
            Number(s.user_id),
            String(s.name || ""),
            Number(s.score || 0),
            new Date().toISOString(),
            Number(s.streak || 0),
            Number(s.maxStreak || s.streak || 0),
            Number(s.levelNum || 1),
            String(grade)
          )
          .run();
        importedStudents++;

        // انتقال نشان‌های دانش‌آموز در صورت خالی بودن
        const existingBadges = await deps.db
          .prepare("SELECT COUNT(*) as c FROM badges WHERE user_id = ?")
          .bind(Number(s.user_id))
          .first<{ c: number }>();
        if (!existingBadges?.c && Array.isArray(stDetail?.my?.badges)) {
          for (const b of stDetail.my.badges) {
            await deps.db
              .prepare("INSERT INTO badges (user_id, badge, date) VALUES (?, ?, ?)")
              .bind(Number(s.user_id), String(b.name || b.badge || "🏅"), new Date().toISOString())
              .run();
            importedBadges++;
          }
        }

        // انتقال خلاصه تکالیف قبلی در صورت خالی بودن
        const existingHw = await deps.db
          .prepare("SELECT COUNT(*) as c FROM homework WHERE user_id = ?")
          .bind(Number(s.user_id))
          .first<{ c: number }>();
        if (!existingHw?.c && Array.isArray(stDetail?.my?.homework)) {
          for (const h of stDetail.my.homework) {
            await deps.db
              .prepare("INSERT INTO homework (user_id, name, date, type, score, feedback) VALUES (?, ?, ?, ?, ?, ?)")
              .bind(
                Number(s.user_id),
                String(s.name || ""),
                new Date().toISOString(),
                String(h.type || "تکلیف"),
                Number(h.score || 0),
                String(h.feedback || "")
              )
              .run();
            importedHw++;
          }
        }
      }

      // انتقال ددلاین‌ها
      if (Array.isArray(dash.deadlines)) {
        const dlCount = await deps.db.prepare("SELECT COUNT(*) as c FROM deadlines").first<{ c: number }>();
        if (!dlCount?.c) {
          for (const d of dash.deadlines) {
            await deps.db
              .prepare("INSERT INTO deadlines (title, due_date, created) VALUES (?, ?, ?)")
              .bind(String(d.title || ""), String(d.dueDate || d.due_date || ""), new Date().toISOString())
              .run();
          }
        }
      }

      return Response.json({
        ok: true,
        message: `🎉 انتقال کامل انجام شد!\n👥 ${importedStudents} دانش‌آموز، 📝 ${importedHw} سابقه تکلیف و 🏅 ${importedBadges} نشان افتخار با موفقیت به دیتابیس ۵ گیگابایتی Turso منتقل شدند.`,
      });
    }

    // ج) اتصال دیتابیس Turso از همین صفحه (بدون نیاز به پنل میزبان)
    if (body.action === "connect_db") {
      const tursoUrl = String(body.tursoUrl || "").trim();
      const tursoToken = String(body.tursoToken || "").trim();
      const groqIn = String(body.groqKey || "").trim();
      if (!tursoUrl.startsWith("libsql://") || tursoToken.length < 20) {
        return Response.json({ ok: false, error: "آدرس یا توکن دیتابیس Turso معتبر نیست." }, { status: 400 });
      }
      const cfg: any = { TURSO_DATABASE_URL: tursoUrl, TURSO_AUTH_TOKEN: tursoToken };
      if (groqIn.startsWith("gsk_")) cfg.GROQ_API_KEY = groqIn;
      let saveNote = "";
      try {
        fs.writeFileSync(nodePath.join(process.cwd(), "smartclass-config.json"), JSON.stringify(cfg, null, 2));
      } catch (e: any) {
        saveNote = " (ذخیره فایل ممکن نشد؛ در حافظه فعال شد)";
      }
      process.env.TURSO_DATABASE_URL = tursoUrl;
      process.env.TURSO_AUTH_TOKEN = tursoToken;
      if (cfg.GROQ_API_KEY) process.env.GROQ_API_KEY = cfg.GROQ_API_KEY;
      let studentCount2 = 0;
      try {
        const db2 = getTursoD1FromEnv(process.env);
        const r: any = db2 ? await db2.prepare("SELECT COUNT(*) as c FROM students WHERE name != ''").first() : null;
        studentCount2 = r?.c || 0;
      } catch {}
      if (isFormReq) {
        return new Response(
          "<!DOCTYPE html><html lang='fa' dir='rtl'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><body style='background:#0F172A;color:#fff;font-family:Tahoma;text-align:center;padding:40px'><h2>\u2705 اتصال دیتابیس انجام شد!</h2><p>" + studentCount2 + " دانش‌آموز" + saveNote + "</p><a style='color:#38BDF8;font-size:18px;line-height:2' href='/school'>\u2190 ورود به پنل مدرسه</a></body></html>",
          { status: 302, headers: { Location: origin + "/school", "Content-Type": "text/html; charset=utf-8" } }
        );
      }
      return Response.json({
        ok: true,
        message: "\u2705 دیتابیس Turso با موفقیت متصل شد! (" + studentCount2 + " دانش‌آموز)" + saveNote + "\nهمه اطلاعات مدرسه در دسترس است.",
      });
    }

    return Response.json({ ok: false, error: "عملیات نامعتبر" }, { status: 400 });
  }

  if (path !== "/setup" && path !== "/setup/") return null;

  let studentCount = 0;
  let dbError = "";
  if (deps.db) {
    try {
      const r = await deps.db.prepare("SELECT COUNT(*) as c FROM students WHERE name != ''").first<{ c: number }>();
      studentCount = r?.c || 0;
    } catch (e: any) {
      dbError = e?.message || "خطا در اتصال به Turso";
    }
  }

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>راه‌اندازی مدرسه هوشمند — ${deps.schoolName}</title>
  <style>
    body { margin:0; font-family: Tahoma, system-ui, sans-serif; background:#0F172A; color:#F8FAFC; padding:18px; line-height:1.75; }
    .wrap { max-width:640px; margin:0 auto; }
    .card { background:#1E293B; border:1px solid #334155; border-radius:18px; padding:18px; margin-bottom:16px; }
    h1 { margin:0 0 6px; font-size:20px; color:#FDE047; }
    .row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #334155; font-size:14px; gap:10px; }
    .row:last-child { border-bottom:none; }
    .ok { color:#34D399; font-weight:bold; }
    .warn { color:#FBBF24; font-weight:bold; }
    input { width:100%; box-sizing:border-box; padding:12px; border-radius:12px; border:1px solid #475569; background:#0F172A; color:#fff; font-size:14px; margin-bottom:10px; }
    button, a.btn { display:block; width:100%; box-sizing:border-box; text-align:center; text-decoration:none; padding:13px; border-radius:12px; border:none; font-weight:bold; font-size:14px; cursor:pointer; margin-bottom:10px; font-family:inherit; }
    .btn-primary { background:linear-gradient(135deg,#4F46E5,#0284C7); color:#fff; }
    .btn-gold { background:linear-gradient(135deg,#D97706,#F59E0B); color:#fff; }
    .btn-green { background:linear-gradient(135deg,#059669,#10B981); color:#fff; }
    #logBox { display:none; padding:12px; border-radius:12px; background:#064E3B; border:1px solid #10B981; white-space:pre-line; font-size:13px; margin-top:10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>🏫 اتاق راه‌اندازی یک‌کلیکی «${deps.schoolName}»</h1>
      <div style="color:#94A3B8;font-size:13px;">نسخه مستقل، رایگان و بدون فیلتر (پیکربندی v4) (Render / ابری + دیتابیس ۵ گیگابایتی Turso) — آماده برای چندین مدرسه</div>
    </div>

    <div class="card">
      <div class="row"><span>🌐 آدرس بدون فیلتر سامانه:</span><strong dir="ltr" style="color:#38BDF8;">${origin}</strong></div>
      <div class="row"><span>👨‍🏫 استاد / مدیر کلاس:</span><strong>${deps.teacherName} (${deps.teacherId})</strong></div>
      <div class="row">
        <span>🗄 دیتابیس ۵ گیگابایتی Turso:</span>
        ${deps.hasTurso && !dbError
          ? `<span class="ok">✅ متصل (${studentCount} دانش‌آموز فعال)</span>`
          : `<span class="warn">⚠️ متصل نشده — متغیرهای TURSO_DATABASE_URL و TURSO_AUTH_TOKEN را تنظیم کنید ${dbError ? `(${dbError})` : ""}</span>`}
      </div>
      <div class="row">
        <span>🤖 هوش مصنوعی رایگان Groq:</span>
        ${deps.hasGroqKey
          ? `<span class="ok">✅ کلید فعال است</span>`
          : `<span class="warn">⚠️ متغیر GROQ_API_KEY تنظیم نشده</span>`}
      </div>
    </div>

    ${!deps.hasTurso || dbError ? `
    <div class="card" style="border-color:#10B981;">
      <div style="font-weight:bold;margin-bottom:8px;color:#34D399;">🔌 اتصال دیتابیس Turso — مستقیم از همین صفحه</div>
      <div style="color:#94A3B8;font-size:12.5px;margin-bottom:10px;">دو مقدار TURSO_DATABASE_URL و TURSO_AUTH_TOKEN را این‌جا وارد کنید تا بلافاصله وصل شود — نیازی به پنل میزبان نیست.</div>
      <form method="POST" action="/api/setup/action" onsubmit="try{connectDb();return false;}catch(e){return true;}">
        <input type="hidden" name="action" value="connect_db" />
        <input id="tursoUrl" name="tursoUrl" dir="ltr" oninput="maybeAutoDb()" placeholder="TURSO_DATABASE_URL (شروع با libsql://)" />
        <input id="tursoToken" name="tursoToken" dir="ltr" oninput="maybeAutoDb()" placeholder="TURSO_AUTH_TOKEN (شروع با eyJ)" />
        <input id="groqKey" name="groqKey" dir="ltr" placeholder="GROQ_API_KEY (اختیاری — شروع با gsk_)" />
        <input id="admPassDb" name="password" type="password" dir="ltr" oninput="maybeAutoDb()" placeholder="رمز مدیریت پنل (Mina1362@)" />
        <button class="btn-green" type="submit">💾 ذخیره و اتصال فوری</button>
      </form>
      <div id="dbLog" style="display:none;padding:12px;border-radius:12px;white-space:pre-line;font-size:13px;margin-top:10px;"></div>
    </div>` : ""}
    <div class="card">
      <div style="font-weight:bold;margin-bottom:8px;color:#FDE047;">🔐 عملیات راه‌اندازی با یک کلیک</div>
      <input id="admPass" type="password" dir="ltr" placeholder="رمز مدیریت پنل (PANEL_PASSWORD) را وارد کنید" />
      <button class="btn-primary" onclick="runAction('set_webhook')">🔗 ۱. اتصال خودکار ربات تلگرام به این سرور (Set Webhook)</button>
      <button class="btn-gold" onclick="runAction('migrate_from_cloudflare')">📥 ۲. انتقال خودکار دانش‌آموزان فعلی از سرور قبلی کلودفلر</button>
      <a class="btn btn-green" href="/app">📱 ۳. ورود به اپلیکیشن ۳ پنله مدرسه (/app)</a>
      <div id="logBox"></div>
    </div>
  </div>

  <script>
    let dbAutoDone = false;
    function maybeAutoDb() {
      if (dbAutoDone) return;
      try {
        const u = document.getElementById("tursoUrl").value.trim();
        const t = document.getElementById("tursoToken").value.trim();
        const p = (document.getElementById("admPassDb") || {}).value || (document.getElementById("admPass") || {}).value;
        if (u.indexOf("libsql://") === 0 && t.length > 20 && p) { dbAutoDone = true; connectDb(); }
      } catch (e) {}
    }
    function dbShow(msg, color) {
      const b1 = document.getElementById("dbLog");
      if (b1) { b1.style.display = "block"; b1.style.background = color === "red" ? "#7F1D1D" : "#064E3B"; b1.textContent = msg; }
      const b2 = document.getElementById("logBox");
      if (b2) { b2.style.display = "block"; b2.style.background = color === "red" ? "#7F1D1D" : "#064E3B"; b2.textContent = msg; }
    }
    async function connectDb() {
      const password = (document.getElementById("admPassDb") || {}).value || (document.getElementById("admPass") || {}).value;
      if (!password) { dbShow("رمز مدیریت پنل (Mina1362@) را در فیلد آخر وارد کنید.", "red"); return; }
      dbShow("⏳ در حال اتصال به دیتابیس...", "gray");
      box.style.display = "block"; box.style.background = "#1E293B";
      box.textContent = "⏳ در حال اتصال به دیتابیس...";
      try {
        const res = await fetch("/api/setup/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "connect_db", password,
            tursoUrl: document.getElementById("tursoUrl").value.trim(),
            tursoToken: document.getElementById("tursoToken").value.trim(),
            groqKey: (document.getElementById("groqKey") || {}).value || ""
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          dbShow("\u274c " + (data.error || "خطا در اتصال"), "red");
        } else {
          dbShow(data.message, "green");
          try { alert(data.message); } catch (e) {}
          setTimeout(() => { location.href = "/school"; }, 1500);
        }
      } catch (e) {
        dbShow("\u274c خطای ارتباط: " + e.message, "red");
      }
    }
    (function () {
      try {
        const h = new URLSearchParams((location.search || "?").replace(/^\?/, "") + "&" + location.hash.replace(/^#/, ""));
        if (h.get("u")) document.getElementById("tursoUrl").value = h.get("u");
        if (h.get("t")) document.getElementById("tursoToken").value = h.get("t");
        if (h.get("g")) document.getElementById("groqKey").value = h.get("g");
        if (h.get("p")) document.getElementById("admPassDb").value = h.get("p");
        if (h.get("auto") === "1" && document.getElementById("tursoToken").value) connectDb();
      } catch (e) {}
    })();

    async function runAction(action) {
      const password = document.getElementById("admPass").value;
      if (!password) { alert("لطفاً ابتدا رمز مدیریت را وارد کنید."); return; }
      const box = document.getElementById("logBox");
      box.style.display = "block";
      box.style.background = "#1E293B";
      box.textContent = "⏳ در حال انجام عملیات... لطفاً چند ثانیه صبر کنید...";
      try {
        const res = await fetch("/api/setup/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, password })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          box.style.background = "#7F1D1D";
          box.textContent = "❌ " + (data.error || "خطا در انجام عملیات");
        } else {
          box.style.background = "#064E3B";
          box.textContent = data.message;
          setTimeout(() => location.reload(), 2500);
        }
      } catch (e) {
        box.style.background = "#7F1D1D";
        box.textContent = "❌ خطای ارتباط: " + e.message;
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
