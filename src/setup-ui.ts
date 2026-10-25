import { D1Database } from "./turso-d1";

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
    try {
      body = await request.json();
    } catch {}
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
      <div style="color:#94A3B8;font-size:13px;">نسخه مستقل، رایگان و بدون فیلتر (Render / ابری + دیتابیس ۵ گیگابایتی Turso) — آماده برای چندین مدرسه</div>
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
