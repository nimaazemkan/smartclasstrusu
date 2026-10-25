import coreWorker, {
  BOT_TOKEN,
  PANEL_PASSWORD,
  SCHOOL_NAME,
  TEACHER_ID,
  TEACHER_NAME,
} from "../src/core";
import { getTursoD1FromEnv, resolveTursoConfig } from "../src/turso-d1";
import { handleSetupRequest } from "../src/setup-ui";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;
    const tursoCfg = resolveTursoConfig(process.env);
    const db = getTursoD1FromEnv(process.env);
    const groqKey = (process.env.GROQ_API_KEY || "").trim();

    // ۱. اتاق راه‌اندازی و انتقال یک‌کلیکی (/setup)
    const setupResp = await handleSetupRequest(request, {
      schoolName: SCHOOL_NAME,
      teacherName: TEACHER_NAME,
      teacherId: TEACHER_ID,
      botToken: BOT_TOKEN,
      panelPassword: PANEL_PASSWORD,
      hasTurso: Boolean(tursoCfg && db),
      hasGroqKey: Boolean(groqKey),
      db,
    });
    if (setupResp) return setupResp;

    // اگر دیتابیس Turso هنوز متصل نشده باشد، کاربر را در مرورگر به صفحه راهنمای راه‌اندازی هدایت کن
    if (!db) {
      if (url.pathname.startsWith("/api/")) {
        return Response.json(
          {
            error:
              "دیتابیس Turso هنوز متصل نشده است. متغیرهای TURSO_DATABASE_URL و TURSO_AUTH_TOKEN را در بخش Environment سرور وارد کنید.",
          },
          { status: 503 }
        );
      }
      return Response.redirect(`${origin}/setup`, 302);
    }

    const env = {
      telegram_bot_db: db,
      GROQ_API_KEY: groqKey,
      PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || `${origin}/app`,
    };

    // ۲. کران‌جاب روزانه ورسل (تبریک تولد + یادآور ددلاین‌ها)
    if (url.pathname === "/api/cron") {
      try {
        await coreWorker.scheduled({}, env);
        return Response.json({ ok: true, ranAt: new Date().toISOString() });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
      }
    }

    // ۳. هندلر اصلی ربات تلگرام (/webhook) + اپلیکیشن ۳ پنله (/ و /app و /api/app/*)
    return await coreWorker.fetch(request, env);
  },
};
