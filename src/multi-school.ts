// ============================================================================
// 🏫 موتور چندمدرسه‌ای کلاس هوشمند (Multi-School / Multi-Tenant Engine)
// مدیر ارشد کل سامانه + مدیر مدرسه + معلم + دانش‌آموز + والدین
// همه چیز رایگان، بدون وابستگی خارجی، روی Render + Turso
// ============================================================================

import type { D1Database } from "./turso-d1";
import { getLiveRoomPublicStatus, getLiveRoomsStats } from "./live-class";

export const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "SuperMina1362@";

// ---------------------------------------------------------------------------
// جداول دیتابیس (خودکارسازی کامل — بدون نیاز به SQL دستی)
// ---------------------------------------------------------------------------
export async function ensureSchoolTables(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS schools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        city TEXT DEFAULT '',
        admin_name TEXT DEFAULT '',
        admin_user TEXT UNIQUE,
        admin_pass TEXT,
        telegram_bot_token TEXT DEFAULT '',
        plan TEXT DEFAULT 'trial',
        expires_at TEXT DEFAULT '',
        max_students INTEGER DEFAULT 300,
        max_teachers INTEGER DEFAULT 30,
        active INTEGER DEFAULT 1,
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        grade_name TEXT NOT NULL,
        class_name TEXT NOT NULL,
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        subjects TEXT DEFAULT '{}',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        student_code TEXT UNIQUE,
        student_pin TEXT DEFAULT '1234',
        parent_code TEXT UNIQUE,
        tg_id TEXT DEFAULT '',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        updated TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        title TEXT DEFAULT '',
        score REAL NOT NULL,
        created_by TEXT DEFAULT '',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT DEFAULT '',
        created_by TEXT DEFAULT '',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER,
        audience TEXT DEFAULT 'all',
        title TEXT NOT NULL,
        body TEXT DEFAULT '',
        created_by TEXT DEFAULT '',
        created_at TEXT
      )`
    )
    .run();
}

// ---------------------------------------------------------------------------
// ابزارهای عمومی
// ---------------------------------------------------------------------------
export interface MultiSchoolDeps {
  db: D1Database;
  secret: string;
  defaultBotToken: string;
  signToken: (payload: Record<string, any>, secret: string) => Promise<string>;
  verifyToken: (token: string, secret: string) => Promise<any | null>;
  normalizeDigits: (s: string) => string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonOut(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS_HEADERS },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function randDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

async function genUniqueCode(db: D1Database, col: "student_code" | "parent_code" | "code", n: number): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const c = randDigits(n);
    const table = col === "code" ? "schools" : "ms_students";
    const row = await db.prepare(`SELECT id FROM ${table} WHERE ${col} = ?`).bind(c).first();
    if (!row) return c;
  }
  return String(Date.now()).slice(-n);
}

function classLabel(g: { grade_name?: string; class_name?: string }): string {
  return `${g.grade_name || ""}-${g.class_name || ""}`.replace(/^-|-$/g, "");
}

function parseSubjects(json: string): Record<string, string> {
  try {
    const o = JSON.parse(json || "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

async function tgSend(token: string, chatId: string | number, text: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function getSchoolRow(db: D1Database, schoolId: number): Promise<any | null> {
  return await db.prepare("SELECT * FROM schools WHERE id = ?").bind(schoolId).first();
}

// ---------------------------------------------------------------------------
// دسترسی به اتاق کلاس زنده برای کاربران چندمدرسه‌ای (فراخوانی از live-class.ts)
// ---------------------------------------------------------------------------
export async function msClassAccess(
  db: D1Database,
  schoolId: number,
  classId: number,
  auth: { role: string; teacherId?: number; studentId?: number }
): Promise<{ ok: boolean; name?: string; myUserId?: number }> {
  const cls = await db
    .prepare("SELECT * FROM ms_classes WHERE id = ? AND school_id = ?")
    .bind(classId, schoolId)
    .first();
  if (!cls) return { ok: false };

  if (auth.role === "ms_student") {
    const st = await db
      .prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ? AND class_id = ?")
      .bind(Number(auth.studentId || 0), schoolId, classId)
      .first();
    if (!st) return { ok: false };
    return { ok: true, name: st.name, myUserId: Number(st.id) };
  }

  if (auth.role === "ms_teacher") {
    const t = await db
      .prepare("SELECT * FROM ms_teachers WHERE id = ? AND school_id = ?")
      .bind(Number(auth.teacherId || 0), schoolId)
      .first();
    if (!t) return { ok: false };
    const subs = parseSubjects(t.subjects);
    if (!(String(classId) in subs)) return { ok: false };
    return { ok: true, name: t.name, myUserId: 0 };
  }

  if (auth.role === "ms_admin" || auth.role === "ms_super") {
    return { ok: true, name: auth.role === "ms_super" ? "مدیر ارشد" : "مدیر مدرسه", myUserId: 0 };
  }

  return { ok: false };
}

export async function msRoomRoster(db: D1Database, schoolId: number, classId: number): Promise<Array<{ user_id: number; name: string }>> {
  const rows = await db
    .prepare("SELECT id, name FROM ms_students WHERE school_id = ? AND class_id = ? ORDER BY name")
    .bind(schoolId, classId)
    .all();
  return (rows.results || []).map((r: any) => ({ user_id: Number(r.id), name: String(r.name) }));
}

export async function msMarkPresent(db: D1Database, schoolId: number, classId: number, uid: number, name: string): Promise<void> {
  const date = todayStr();
  const ex = await db
    .prepare("SELECT id FROM ms_attendance WHERE student_id = ? AND date = ?")
    .bind(uid, date)
    .first();
  if (ex) {
    await db
      .prepare("UPDATE ms_attendance SET status = 'present', updated = ? WHERE id = ?")
      .bind(nowIso(), Number(ex.id))
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO ms_attendance (school_id, class_id, student_id, date, status, updated) VALUES (?, ?, ?, ?, 'present', ?)"
      )
      .bind(schoolId, classId, uid, date, nowIso())
      .run();
  }
}

export async function msNotifyClassStarted(
  db: D1Database,
  schoolId: number,
  classId: number,
  title: string,
  defaultBotToken: string
): Promise<number> {
  const school = await getSchoolRow(db, schoolId);
  const botToken = String(school?.telegram_bot_token || "").trim() || defaultBotToken;
  const cls = await db
    .prepare("SELECT * FROM ms_classes WHERE id = ? AND school_id = ?")
    .bind(classId, schoolId)
    .first();
  const roster = await db
    .prepare("SELECT name, tg_id FROM ms_students WHERE school_id = ? AND class_id = ?")
    .bind(schoolId, classId)
    .all();
  const label = classLabel(cls || {});
  let sent = 0;
  for (const r of (roster.results || []) as any[]) {
    const tg = String(r.tg_id || "").trim();
    if (!tg) continue;
    const ok = await tgSend(
      botToken,
      tg,
      `🔴 کلاس مجازی زنده شروع شد!\n\n🏫 ${school?.name || "مدرسه"} — کلاس ${label}\n📌 موضوع: ${title}\n\nهمین الان وارد اپلیکیشن شوید ➡️ تب «🎥 کلاس آنلاین»`
    );
    if (ok) sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// هندلر اصلی مسیرهای /api/ms/*
// ---------------------------------------------------------------------------
export async function handleMultiSchoolRequest(
  request: Request,
  url: URL,
  deps: MultiSchoolDeps
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/ms/")) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const db = deps.db;
  await ensureSchoolTables(db);

  // ==================== جستجوی مدرسه (عمومی) ====================
  if (path === "/api/ms/schools/find" && request.method === "GET") {
    const code = deps.normalizeDigits(url.searchParams.get("code") || "").trim();
    const q = (url.searchParams.get("q") || "").trim();
    let rows: any[] = [];
    if (code) {
      const r = await db
        .prepare("SELECT code, name, city, active, expires_at FROM schools WHERE code = ?")
        .bind(code)
        .all();
      rows = r.results || [];
    } else if (q.length >= 2) {
      const r = await db
        .prepare("SELECT code, name, city, active, expires_at FROM schools WHERE name LIKE ? ORDER BY name LIMIT 8")
        .bind(`%${q}%`)
        .all();
      rows = r.results || [];
    }
    return jsonOut({
      schools: rows.map((s: any) => ({
        code: s.code,
        name: s.name,
        city: s.city || "",
        usable: Number(s.active) === 1 && (!s.expires_at || s.expires_at >= todayStr()),
      })),
    });
  }

  // ==================== ورود ۵ نقشه (public) ====================
  if (path === "/api/ms/login" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;
    const role = String(body.role || "");

    if (role === "super") {
      if (String(body.password || "") !== SUPER_ADMIN_PASSWORD) {
        return jsonOut({ error: "رمز مدیر ارشد اشتباه است." }, 401);
      }
      const token = await deps.signToken({ role: "ms_super" }, deps.secret);
      return jsonOut({ session: { role: "super", kind: "ms", name: "مدیر ارشد سامانه", token } });
    }

    const code = deps.normalizeDigits(String(body.schoolCode || "")).trim();
    if (!code) return jsonOut({ error: "کد مدرسه را وارد کنید." }, 400);
    const school = await db.prepare("SELECT * FROM schools WHERE code = ?").bind(code).first();
    if (!school) return jsonOut({ error: "مدرسه‌ای با این کد یافت نشد. کد مدرسه را دوباره بررسی کنید." }, 404);
    if (Number(school.active) !== 1) return jsonOut({ error: "این مدرسه موقتاً توسط مدیر ارشد معلق شده است." }, 403);
    if (school.expires_at && String(school.expires_at) < todayStr()) {
      return jsonOut({ error: "اشتراک این مدرسه منقضی شده است؛ لطفاً با مدیر مدرسه یا پشتیبانی تماس بگیرید." }, 403);
    }
    const schoolId = Number(school.id);
    const schoolName = String(school.name);

    if (role === "admin") {
      const u = String(body.username || "").trim();
      const p = String(body.password || "");
      if (!u || p !== String(school.admin_pass) || u !== String(school.admin_user)) {
        return jsonOut({ error: "نام کاربری یا رمز مدیر مدرسه اشتباه است." }, 401);
      }
      const token = await deps.signToken({ role: "ms_admin", schoolId, name: school.admin_name || "مدیر مدرسه" }, deps.secret);
      return jsonOut({
        session: {
          role: "admin",
          kind: "ms",
          schoolId,
          schoolName,
          schoolCode: school.code,
          name: school.admin_name || "مدیر مدرسه",
          token,
        },
      });
    }

    if (role === "teacher") {
      const u = String(body.username || "").trim();
      const p = String(body.password || "");
      const t = await db
        .prepare("SELECT * FROM ms_teachers WHERE school_id = ? AND username = ?")
        .bind(schoolId, u)
        .first();
      if (!t || String(t.password) !== p) {
        return jsonOut({ error: "نام کاربری یا رمز معلم اشتباه است." }, 401);
      }
      const token = await deps.signToken(
        { role: "ms_teacher", schoolId, teacherId: Number(t.id), name: t.name },
        deps.secret
      );
      return jsonOut({
        session: {
          role: "teacher",
          kind: "ms",
          schoolId,
          schoolName,
          schoolCode: school.code,
          teacherId: Number(t.id),
          name: t.name,
          token,
        },
      });
    }

    if (role === "student") {
      const c = deps.normalizeDigits(String(body.code || "")).trim();
      const pin = deps.normalizeDigits(String(body.pin || "")).trim();
      const st = await db
        .prepare("SELECT * FROM ms_students WHERE school_id = ? AND student_code = ?")
        .bind(schoolId, c)
        .first();
      if (!st || String(st.student_pin) !== pin) {
        return jsonOut({ error: "کد دانش‌آموزی یا رمز عبور اشتباه است." }, 401);
      }
      const token = await deps.signToken(
        { role: "ms_student", schoolId, studentId: Number(st.id), classId: Number(st.class_id), name: st.name },
        deps.secret
      );
      return jsonOut({
        session: {
          role: "student",
          kind: "ms",
          schoolId,
          schoolName,
          schoolCode: school.code,
          studentId: Number(st.id),
          classId: Number(st.class_id),
          name: st.name,
          token,
        },
      });
    }

    if (role === "parent") {
      const c = deps.normalizeDigits(String(body.code || "")).trim();
      const st = await db
        .prepare("SELECT * FROM ms_students WHERE school_id = ? AND parent_code = ?")
        .bind(schoolId, c)
        .first();
      if (!st) return jsonOut({ error: "کد اختصاصی والدین معتبر نیست." }, 401);
      const token = await deps.signToken(
        { role: "ms_parent", schoolId, studentId: Number(st.id), classId: Number(st.class_id), name: st.name },
        deps.secret
      );
      return jsonOut({
        session: {
          role: "parent",
          kind: "ms",
          schoolId,
          schoolName,
          schoolCode: school.code,
          studentId: Number(st.id),
          classId: Number(st.class_id),
          name: `والدین ${st.name}`,
          childName: st.name,
          token,
        },
      });
    }

    return jsonOut({ error: "نقش ورود نامعتبر است." }, 400);
  }

  // ==================== احراز هویت برای بقیه مسیرها ====================
  const rawToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const tok = await deps.verifyToken(rawToken, deps.secret);
  if (!tok || !String(tok.role || "").startsWith("ms_")) {
    return jsonOut({ error: "نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید." }, 401);
  }
  const role: string = tok.role;
  const schoolId: number = Number(tok.schoolId || 0);
  const isSuper = role === "ms_super";
  const isAdmin = role === "ms_admin";
  const isTeacher = role === "ms_teacher";
  const isStudent = role === "ms_student";
  const isParent = role === "ms_parent";

  if (!isSuper && !schoolId) return jsonOut({ error: "مدرسه یافت نشد." }, 404);

  // بررسی معتبر بودن اشتراک مدرسه برای همه نقش‌های مدرسه
  let schoolRow: any = null;
  if (!isSuper) {
    schoolRow = await getSchoolRow(db, schoolId);
    if (!schoolRow) return jsonOut({ error: "مدرسه یافت نشد." }, 404);
    if (Number(schoolRow.active) !== 1) return jsonOut({ error: "این مدرسه موقتاً معلق شده است." }, 403);
    if (schoolRow.expires_at && String(schoolRow.expires_at) < todayStr()) {
      return jsonOut({ error: "اشتراک این مدرسه منقضی شده است." }, 403);
    }
  }

  // ==================== اطلاعات خانه (همه نقش‌ها) ====================
  if (path === "/api/ms/home" && request.method === "GET") {
    if (isSuper) {
      const schools = (await db.prepare("SELECT COUNT(*) c FROM schools").first()) as any;
      const students = (await db.prepare("SELECT COUNT(*) c FROM ms_students").first()) as any;
      const teachers = (await db.prepare("SELECT COUNT(*) c FROM ms_teachers").first()) as any;
      const classes = (await db.prepare("SELECT COUNT(*) c FROM ms_classes").first()) as any;
      const active = (await db.prepare("SELECT COUNT(*) c FROM schools WHERE active = 1").first()) as any;
      const liveRooms = getLiveRoomsStats().filter((r: any) => r.active);
      return jsonOut({
        stats: {
          schools: Number(schools?.c || 0),
          activeSchools: Number(active?.c || 0),
          students: Number(students?.c || 0),
          teachers: Number(teachers?.c || 0),
          classes: Number(classes?.c || 0),
          liveRooms: liveRooms.length,
        },
        liveRooms,
      });
    }

    const schoolInfo = {
      id: schoolId,
      code: schoolRow.code,
      name: schoolRow.name,
      city: schoolRow.city || "",
      plan: schoolRow.plan || "trial",
      expiresAt: schoolRow.expires_at || "",
    };

    if (isStudent || isParent) {
      const stId = Number(tok.studentId || 0);
      const st = await db.prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ?").bind(stId, schoolId).first();
      if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
      const cls = await db.prepare("SELECT * FROM ms_classes WHERE id = ?").bind(Number(st.class_id)).first();

      // درس‌ها و معلمان این کلاس
      const tRows = await db.prepare("SELECT name, subjects FROM ms_teachers WHERE school_id = ?").bind(schoolId).all();
      const subjects: Array<{ subject: string; teacherName: string }> = [];
      for (const t of (tRows.results || []) as any[]) {
        const subs = parseSubjects(t.subjects);
        const subj = subs[String(st.class_id)];
        if (subj) subjects.push({ subject: subj, teacherName: t.name });
      }

      // حضور و غیاب
      const att = await db
        .prepare("SELECT status, date FROM ms_attendance WHERE student_id = ? ORDER BY date DESC LIMIT 30")
        .bind(stId)
        .all();
      const attRows = (att.results || []) as any[];
      const present = attRows.filter((a) => a.status === "present").length;
      const absent = attRows.filter((a) => a.status === "absent").length;
      const late = attRows.filter((a) => a.status === "late").length;

      // نمرات
      const gr = await db
        .prepare("SELECT subject, title, score, created_at FROM ms_grades WHERE student_id = ? ORDER BY id DESC LIMIT 40")
        .bind(stId)
        .all();

      // امتیازات
      const pts = (await db.prepare("SELECT COALESCE(SUM(delta),0) s FROM ms_points WHERE student_id = ?").bind(stId).first()) as any;
      const ptsLast = await db
        .prepare("SELECT delta, reason, created_at FROM ms_points WHERE student_id = ? ORDER BY id DESC LIMIT 10")
        .bind(stId)
        .all();

      // اطلاعیه‌ها
      const ann = await db
        .prepare(
          `SELECT * FROM ms_announcements WHERE school_id = ? AND (class_id IS NULL OR class_id = ?)
           AND audience IN ('all', ${isParent ? "'all'" : "'students'"}) ORDER BY id DESC LIMIT 12`
        )
        .bind(schoolId, Number(st.class_id))
        .all();

      const liveKey = `s${schoolId}c${Number(st.class_id)}`;
      return jsonOut({
        school: schoolInfo,
        class: { id: Number(st.class_id), label: classLabel(cls || {}), grade: cls?.grade_name || "", name: cls?.class_name || "" },
        student: { id: stId, name: st.name, studentCode: st.student_code, parentCode: st.parent_code, pin: st.student_pin },
        subjects,
        attendance: {
          present,
          absent,
          late,
          total: attRows.length,
          pct: attRows.length ? Math.round((present / attRows.length) * 100) : 100,
          last: attRows.slice(0, 10),
        },
        grades: (gr.results || []).map((g: any) => ({ subject: g.subject, title: g.title, score: g.score, date: String(g.created_at || "").split("T")[0] })),
        points: {
          total: Number(pts?.s || 0),
          last: (ptsLast.results || []).map((p: any) => ({ delta: p.delta, reason: p.reason, date: String(p.created_at || "").split("T")[0] })),
        },
        announcements: (ann.results || []).map((a: any) => ({ title: a.title, body: a.body, audience: a.audience, date: String(a.created_at || "").split("T")[0] })),
        live: getLiveRoomPublicStatus(liveKey),
      });
    }

    if (isTeacher) {
      const tId = Number(tok.teacherId || 0);
      const t = await db.prepare("SELECT * FROM ms_teachers WHERE id = ? AND school_id = ?").bind(tId, schoolId).first();
      if (!t) return jsonOut({ error: "معلم یافت نشد." }, 404);
      const subs = parseSubjects(t.subjects);
      const classIds = Object.keys(subs).map(Number);
      const classes: any[] = [];
      for (const cid of classIds) {
        const cls = await db.prepare("SELECT * FROM ms_classes WHERE id = ? AND school_id = ?").bind(cid, schoolId).first();
        if (!cls) continue;
        const cnt = (await db.prepare("SELECT COUNT(*) c FROM ms_students WHERE class_id = ?").bind(cid).first()) as any;
        classes.push({
          id: cid,
          label: classLabel(cls),
          grade: cls.grade_name,
          name: cls.class_name,
          subject: subs[String(cid)],
          studentCount: Number(cnt?.c || 0),
          live: getLiveRoomPublicStatus(`s${schoolId}c${cid}`),
        });
      }
      return jsonOut({ school: schoolInfo, teacher: { id: tId, name: t.name }, classes });
    }

    if (isAdmin) {
      const cCnt = (await db.prepare("SELECT COUNT(*) c FROM ms_classes WHERE school_id = ?").bind(schoolId).first()) as any;
      const tCnt = (await db.prepare("SELECT COUNT(*) c FROM ms_teachers WHERE school_id = ?").bind(schoolId).first()) as any;
      const sCnt = (await db.prepare("SELECT COUNT(*) c FROM ms_students WHERE school_id = ?").bind(schoolId).first()) as any;
      const today = todayStr();
      const absToday = (await db
        .prepare(
          `SELECT COUNT(*) c FROM ms_students s WHERE s.school_id = ? AND s.id NOT IN (
             SELECT student_id FROM ms_attendance WHERE date = ? AND status = 'present'
           )`
        )
        .bind(schoolId, today)
        .first()) as any;
      const ann = await db
        .prepare("SELECT * FROM ms_announcements WHERE school_id = ? ORDER BY id DESC LIMIT 12")
        .bind(schoolId)
        .all();
      return jsonOut({
        school: schoolInfo,
        stats: {
          classes: Number(cCnt?.c || 0),
          teachers: Number(tCnt?.c || 0),
          students: Number(sCnt?.c || 0),
          notPresentToday: Number(absToday?.c || 0),
        },
        announcements: (ann.results || []).map((a: any) => ({ title: a.title, body: a.body, audience: a.audience, classId: a.class_id, date: String(a.created_at || "").split("T")[0] })),
      });
    }

    return jsonOut({ error: "نقش نامعتبر." }, 400);
  }

  // ==================== پنل معلم ====================
  if (isTeacher) {
    const tId = Number(tok.teacherId || 0);
    const t: any = await db.prepare("SELECT * FROM ms_teachers WHERE id = ? AND school_id = ?").bind(tId, schoolId).first();
    if (!t) return jsonOut({ error: "معلم یافت نشد." }, 404);
    const subs = parseSubjects(t.subjects);

    const assertClass = async (cid: number) => {
      const cls = await db.prepare("SELECT * FROM ms_classes WHERE id = ? AND school_id = ?").bind(cid, schoolId).first();
      if (!cls || !(String(cid) in subs)) return null;
      return cls;
    };

    if (path === "/api/ms/teacher/class" && request.method === "GET") {
      const cid = Number(url.searchParams.get("classId") || 0);
      const cls = await assertClass(cid);
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      const roster = await db
        .prepare("SELECT id, name, student_code, parent_code, tg_id FROM ms_students WHERE class_id = ? AND school_id = ? ORDER BY name")
        .bind(cid, schoolId)
        .all();
      const today = todayStr();
      const att = await db
        .prepare("SELECT student_id, status FROM ms_attendance WHERE class_id = ? AND date = ?")
        .bind(cid, today)
        .all();
      const attMap: Record<number, string> = {};
      for (const a of (att.results || []) as any[]) attMap[Number(a.student_id)] = a.status;
      const grades = await db
        .prepare("SELECT student_id, title, score, created_at FROM ms_grades WHERE class_id = ? AND subject = ? ORDER BY id DESC LIMIT 60")
        .bind(cid, subs[String(cid)])
        .all();
      return jsonOut({
        class: { id: cid, label: classLabel(cls), subject: subs[String(cid)] },
        roster: (roster.results || []).map((s: any) => ({
          id: Number(s.id),
          name: s.name,
          studentCode: s.student_code,
          parentCode: s.parent_code,
          todayStatus: attMap[Number(s.id)] || "",
        })),
        grades: (grades.results || []).map((g: any) => ({
          studentId: Number(g.student_id),
          title: g.title,
          score: g.score,
          date: String(g.created_at || "").split("T")[0],
        })),
      });
    }

    if (path === "/api/ms/teacher/attendance" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const cid = Number(body.classId || 0);
      const cls = await assertClass(cid);
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      const date = String(body.date || todayStr()).slice(0, 10);
      const entries = Array.isArray(body.entries) ? body.entries : [];
      let saved = 0;
      for (const e of entries) {
        const sid = Number(e.studentId || 0);
        const st = ["present", "absent", "late"].includes(e.status) ? e.status : "";
        if (!sid || !st) continue;
        const ex = await db
          .prepare("SELECT id FROM ms_attendance WHERE student_id = ? AND date = ?")
          .bind(sid, date)
          .first();
        if (ex) {
          await db.prepare("UPDATE ms_attendance SET status = ?, updated = ? WHERE id = ?").bind(st, nowIso(), Number(ex.id)).run();
        } else {
          await db
            .prepare("INSERT INTO ms_attendance (school_id, class_id, student_id, date, status, updated) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(schoolId, cid, sid, date, st, nowIso())
            .run();
        }
        saved++;
      }
      return jsonOut({ ok: true, saved });
    }

    if (path === "/api/ms/teacher/grade" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const cid = Number(body.classId || 0);
      const cls = await assertClass(cid);
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      const sid = Number(body.studentId || 0);
      const score = Number(body.score);
      if (!sid || !isFinite(score)) return jsonOut({ error: "اطلاعات نمره ناقص است." }, 400);
      await db
        .prepare("INSERT INTO ms_grades (school_id, class_id, student_id, subject, title, score, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(schoolId, cid, sid, subs[String(cid)], String(body.title || "").trim() || "نمره", score, t.name, nowIso())
        .run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/teacher/grades" && request.method === "GET") {
      const cid = Number(url.searchParams.get("classId") || 0);
      const cls = await assertClass(cid);
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      const grades = await db
        .prepare("SELECT student_id, title, score, created_at FROM ms_grades WHERE class_id = ? AND subject = ? ORDER BY id DESC LIMIT 100")
        .bind(cid, subs[String(cid)])
        .all();
      return jsonOut({
        grades: (grades.results || []).map((g: any) => ({
          studentId: Number(g.student_id),
          title: g.title,
          score: g.score,
          date: String(g.created_at || "").split("T")[0],
        })),
      });
    }

    if (path === "/api/ms/announce" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const title = String(body.title || "").trim();
      const text = String(body.body || "").trim();
      if (title.length < 2) return jsonOut({ error: "عنوان اطلاعیه کوتاه است." }, 400);
      let cid = body.classId ? Number(body.classId) : null;
      if (cid) {
        const cls = await assertClass(cid);
        if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      }
      await db
        .prepare("INSERT INTO ms_announcements (school_id, class_id, audience, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(schoolId, cid, body.audience === "teachers" ? "teachers" : "all", title, text, t.name, nowIso())
        .run();
      return jsonOut({ ok: true });
    }
  }

  // ==================== پنل مدیر مدرسه ====================
  if (isAdmin) {
    if (path === "/api/ms/admin/classes" && request.method === "GET") {
      const rows = await db
        .prepare("SELECT * FROM ms_classes WHERE school_id = ? ORDER BY grade_name, class_name")
        .bind(schoolId)
        .all();
      const out: any[] = [];
      for (const c of (rows.results || []) as any[]) {
        const cnt = (await db.prepare("SELECT COUNT(*) c FROM ms_students WHERE class_id = ?").bind(Number(c.id)).first()) as any;
        out.push({ id: Number(c.id), grade: c.grade_name, name: c.class_name, label: classLabel(c), studentCount: Number(cnt?.c || 0) });
      }
      return jsonOut({ classes: out });
    }

    if (path === "/api/ms/admin/classes" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const grade = String(body.gradeName || "").trim();
      const name = String(body.className || "").trim();
      if (!grade || !name) return jsonOut({ error: "نام پایه و کلاس را وارد کنید." }, 400);
      const ex = await db
        .prepare("SELECT id FROM ms_classes WHERE school_id = ? AND grade_name = ? AND class_name = ?")
        .bind(schoolId, grade, name)
        .first();
      if (ex) return jsonOut({ error: "این کلاس قبلاً ثبت شده است." }, 400);
      const r = await db
        .prepare("INSERT INTO ms_classes (school_id, grade_name, class_name, created_at) VALUES (?, ?, ?, ?)")
        .bind(schoolId, grade, name, nowIso())
        .run();
      return jsonOut({ ok: true, id: Number(r.meta?.last_row_id || 0) });
    }

    if (path === "/api/ms/admin/classes/delete" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const id = Number(body.id || 0);
      const cnt = (await db.prepare("SELECT COUNT(*) c FROM ms_students WHERE class_id = ?").bind(id).first()) as any;
      if (Number(cnt?.c || 0) > 0) return jsonOut({ error: "این کلاس دانش‌آموز دارد؛ ابتدا دانش‌آموزان را جابه‌جا کنید." }, 400);
      await db.prepare("DELETE FROM ms_classes WHERE id = ? AND school_id = ?").bind(id, schoolId).run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/admin/teachers" && request.method === "GET") {
      const rows = await db
        .prepare("SELECT * FROM ms_teachers WHERE school_id = ? ORDER BY name")
        .bind(schoolId)
        .all();
      const classes = await db.prepare("SELECT * FROM ms_classes WHERE school_id = ? ORDER BY grade_name, class_name").bind(schoolId).all();
      return jsonOut({
        teachers: (rows.results || []).map((t: any) => ({
          id: Number(t.id),
          name: t.name,
          username: t.username,
          password: t.password,
          subjects: parseSubjects(t.subjects),
        })),
        classes: (classes.results || []).map((c: any) => ({ id: Number(c.id), label: classLabel(c) })),
      });
    }

    if (path === "/api/ms/admin/teachers" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const name = String(body.name || "").trim();
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();
      if (name.length < 3 || !username || password.length < 4) {
        return jsonOut({ error: "نام، نام کاربری و رمز (حداقل ۴ کاراکتر) لازم است." }, 400);
      }
      const tCnt = (await db.prepare("SELECT COUNT(*) c FROM ms_teachers WHERE school_id = ?").bind(schoolId).first()) as any;
      if (Number(tCnt?.c || 0) >= Number(schoolRow.max_teachers || 30)) {
        return jsonOut({ error: "سقف تعداد معلمان مدرسه پر شده است؛ با مدیر ارشد تماس بگیرید." }, 400);
      }
      const ex = await db
        .prepare("SELECT id FROM ms_teachers WHERE school_id = ? AND username = ?")
        .bind(schoolId, username)
        .first();
      if (ex) return jsonOut({ error: "این نام کاربری قبلاً ثبت شده است." }, 400);
      const r = await db
        .prepare("INSERT INTO ms_teachers (school_id, name, username, password, subjects, created_at) VALUES (?, ?, ?, ?, '{}', ?)")
        .bind(schoolId, name, username, password, nowIso())
        .run();
      return jsonOut({ ok: true, id: Number(r.meta?.last_row_id || 0) });
    }

    if (path === "/api/ms/admin/teachers/assign" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const id = Number(body.teacherId || 0);
      const subjects = body.subjects && typeof body.subjects === "object" ? body.subjects : {};
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(subjects)) {
        const cid = Number(k);
        const subj = String(v || "").trim();
        if (cid && subj) {
          const cls = await db.prepare("SELECT id FROM ms_classes WHERE id = ? AND school_id = ?").bind(cid, schoolId).first();
          if (cls) clean[String(cid)] = subj;
        }
      }
      const r = await db
        .prepare("UPDATE ms_teachers SET subjects = ? WHERE id = ? AND school_id = ?")
        .bind(JSON.stringify(clean), id, schoolId)
        .run();
      if (!r.meta || r.meta.changes === 0) {
        const chk = await db.prepare("SELECT id FROM ms_teachers WHERE id = ? AND school_id = ?").bind(id, schoolId).first();
        if (!chk) return jsonOut({ error: "معلم یافت نشد." }, 404);
      }
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/admin/teachers/reset" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const id = Number(body.teacherId || 0);
      const password = String(body.password || "").trim();
      if (password.length < 4) return jsonOut({ error: "رمز جدید حداقل ۴ کاراکتر باشد." }, 400);
      await db.prepare("UPDATE ms_teachers SET password = ? WHERE id = ? AND school_id = ?").bind(password, id, schoolId).run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/admin/teachers/delete" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      await db.prepare("DELETE FROM ms_teachers WHERE id = ? AND school_id = ?").bind(Number(body.id || 0), schoolId).run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/admin/students" && request.method === "GET") {
      const cid = Number(url.searchParams.get("classId") || 0);
      let rows: any[];
      if (cid) {
        rows = (
          await db
            .prepare("SELECT * FROM ms_students WHERE school_id = ? AND class_id = ? ORDER BY name")
            .bind(schoolId, cid)
            .all()
        ).results || [];
      } else {
        rows = (
          await db.prepare("SELECT * FROM ms_students WHERE school_id = ? ORDER BY name").bind(schoolId).all()
        ).results || [];
      }
      const classes = await db.prepare("SELECT * FROM ms_classes WHERE school_id = ? ORDER BY grade_name, class_name").bind(schoolId).all();
      const classMap: Record<number, string> = {};
      for (const c of (classes.results || []) as any[]) classMap[Number(c.id)] = classLabel(c);
      return jsonOut({
        students: rows.map((s: any) => ({
          id: Number(s.id),
          classId: Number(s.class_id),
          classLabel: classMap[Number(s.class_id)] || "",
          name: s.name,
          studentCode: s.student_code,
          pin: s.student_pin,
          parentCode: s.parent_code,
          tgId: s.tg_id || "",
        })),
        classes: (classes.results || []).map((c: any) => ({ id: Number(c.id), label: classLabel(c) })),
      });
    }

    if (path === "/api/ms/admin/students" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const name = String(body.name || "").trim();
      const classId = Number(body.classId || 0);
      if (name.length < 3 || !classId) return jsonOut({ error: "نام دانش‌آموز و کلاس لازم است." }, 400);
      const cls = await db.prepare("SELECT id FROM ms_classes WHERE id = ? AND school_id = ?").bind(classId, schoolId).first();
      if (!cls) return jsonOut({ error: "کلاس یافت نشد." }, 404);
      const sCnt = (await db.prepare("SELECT COUNT(*) c FROM ms_students WHERE school_id = ?").bind(schoolId).first()) as any;
      if (Number(sCnt?.c || 0) >= Number(schoolRow.max_students || 300)) {
        return jsonOut({ error: "سقف تعداد دانش‌آموزان مدرسه پر شده است؛ با مدیر ارشد تماس بگیرید." }, 400);
      }
      const pin = deps.normalizeDigits(String(body.pin || "1234")).trim() || "1234";
      const studentCode = await genUniqueCode(db, "student_code", 6);
      const parentCode = await genUniqueCode(db, "parent_code", 6);
      const r = await db
        .prepare(
          "INSERT INTO ms_students (school_id, class_id, name, student_code, student_pin, parent_code, tg_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(schoolId, classId, name, studentCode, pin, parentCode, String(body.tgId || "").trim(), nowIso())
        .run();
      return jsonOut({ ok: true, id: Number(r.meta?.last_row_id || 0), studentCode, parentCode, pin });
    }

    if (path === "/api/ms/admin/students/bulk" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const text = String(body.text || "").trim();
      if (!text) return jsonOut({ error: "متنی وارد نشده است." }, 400);
      const classes = await db.prepare("SELECT * FROM ms_classes WHERE school_id = ?").bind(schoolId).all();
      const clsList = (classes.results || []) as any[];
      if (clsList.length === 0) return jsonOut({ error: "ابتدا کلاس‌های مدرسه را بسازید." }, 400);

      const norm = (s: string) => deps.normalizeDigits(s).replace(/[ـ\-_.]+/g, " ").replace(/\s+/g, " ").trim();
      const findClass = (labelRaw: string): any | null => {
        const label = norm(labelRaw);
        if (!label) return null;
        let hit = clsList.find((c) => norm(classLabel(c)) === label);
        if (hit) return hit;
        hit = clsList.find((c) => norm(`${c.grade_name} ${c.class_name}`) === label);
        if (hit) return hit;
        hit = clsList.find((c) => norm(c.class_name) === label);
        if (hit) return hit;
        const byGrade = clsList.filter((c) => norm(c.grade_name) === label);
        if (byGrade.length === 1) return byGrade[0];
        return null;
      };

      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const results: any[] = [];
      let sCount = (await db.prepare("SELECT COUNT(*) c FROM ms_students WHERE school_id = ?").bind(schoolId).first()) as any;
      let total = Number(sCount?.c || 0);
      const maxStudents = Number(schoolRow.max_students || 300);

      for (const line of lines) {
        const parts = line.split(/[,;،\t]/).map((p) => p.trim()).filter(Boolean);
        if (parts.length < 2) {
          results.push({ line, ok: false, error: "قالب: نام, نام کلاس" });
          continue;
        }
        let name = parts[0];
        let cls: any = null;
        if (parts.length >= 3) {
          cls = findClass(parts[1] + "-" + parts[2]) || findClass(parts[2]) || findClass(parts[1]);
        } else {
          cls = findClass(parts[1]);
        }
        if (!cls) {
          results.push({ line, ok: false, error: `کلاس «${parts[1]}» پیدا نشد` });
          continue;
        }
        if (name.length < 3) {
          results.push({ line, ok: false, error: "نام کوتاه است" });
          continue;
        }
        if (total >= maxStudents) {
          results.push({ line, ok: false, error: "سقف دانش‌آموز مدرسه پر شد" });
          continue;
        }
        const studentCode = await genUniqueCode(db, "student_code", 6);
        const parentCode = await genUniqueCode(db, "parent_code", 6);
        await db
          .prepare(
            "INSERT INTO ms_students (school_id, class_id, name, student_code, student_pin, parent_code, tg_id, created_at) VALUES (?, ?, ?, ?, ?, ?, '', ?)"
          )
          .bind(schoolId, Number(cls.id), name, studentCode, "1234", parentCode, nowIso())
          .run();
        total++;
        results.push({
          line,
          ok: true,
          name,
          classLabel: classLabel(cls),
          studentCode,
          pin: "1234",
          parentCode,
        });
      }
      return jsonOut({ ok: true, results });
    }

    if (path === "/api/ms/admin/students/delete" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      await db.prepare("DELETE FROM ms_students WHERE id = ? AND school_id = ?").bind(Number(body.id || 0), schoolId).run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/admin/students/reset" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const id = Number(body.id || 0);
      const studentCode = await genUniqueCode(db, "student_code", 6);
      const parentCode = await genUniqueCode(db, "parent_code", 6);
      await db
        .prepare("UPDATE ms_students SET student_code = ?, parent_code = ?, student_pin = '1234' WHERE id = ? AND school_id = ?")
        .bind(studentCode, parentCode, id, schoolId)
        .run();
      return jsonOut({ ok: true, studentCode, parentCode, pin: "1234" });
    }

    if (path === "/api/ms/admin/points" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const sid = Number(body.studentId || 0);
      const delta = Number(body.delta || 0);
      if (!sid || !delta) return jsonOut({ error: "دانش‌آموز و مقدار امتیاز لازم است." }, 400);
      const st = await db.prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ?").bind(sid, schoolId).first();
      if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
      await db
        .prepare("INSERT INTO ms_points (school_id, class_id, student_id, delta, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(schoolId, Number(st.class_id), sid, delta, String(body.reason || "").trim(), schoolRow.admin_name || "مدیر مدرسه", nowIso())
        .run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/admin/reports" && request.method === "GET") {
      const today = todayStr();
      const classes = await db.prepare("SELECT * FROM ms_classes WHERE school_id = ? ORDER BY grade_name, class_name").bind(schoolId).all();
      const absenceToday: any[] = [];
      const attendanceWeek: any[] = [];
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekStr = weekAgo.toISOString().split("T")[0];

      for (const c of (classes.results || []) as any[]) {
        const cid = Number(c.id);
        const roster = await db.prepare("SELECT id, name FROM ms_students WHERE class_id = ? ORDER BY name").bind(cid).all();
        const att = await db
          .prepare("SELECT student_id, status FROM ms_attendance WHERE class_id = ? AND date = ?")
          .bind(cid, today)
          .all();
        const attMap: Record<number, string> = {};
        for (const a of (att.results || []) as any[]) attMap[Number(a.student_id)] = a.status;
        const notPresent = (roster.results || [])
          .map((s: any) => ({ name: s.name, status: attMap[Number(s.id)] || "ثبت‌نشده" }))
          .filter((x: any) => x.status !== "present");
        if (notPresent.length > 0) {
          absenceToday.push({ classLabel: classLabel(c), students: notPresent });
        }
        const weekAtt = await db
          .prepare("SELECT status FROM ms_attendance WHERE class_id = ? AND date >= ?")
          .bind(cid, weekStr)
          .all();
        const wRows = (weekAtt.results || []) as any[];
        const wPresent = wRows.filter((r) => r.status === "present").length;
        attendanceWeek.push({
          classLabel: classLabel(c),
          marks: wRows.length,
          pct: wRows.length ? Math.round((wPresent / wRows.length) * 100) : -1,
        });
      }

      const teachers = await db.prepare("SELECT * FROM ms_teachers WHERE school_id = ? ORDER BY name").bind(schoolId).all();
      const teacherActivity: any[] = [];
      for (const t of (teachers.results || []) as any[]) {
        const subs = parseSubjects(t.subjects);
        const cids = Object.keys(subs).map(Number);
        let students = 0;
        for (const cid of cids) {
          const cnt = (await db.prepare("SELECT COUNT(*) c FROM ms_students WHERE class_id = ?").bind(cid).first()) as any;
          students += Number(cnt?.c || 0);
        }
        const gCnt = (await db
          .prepare("SELECT COUNT(*) c FROM ms_grades WHERE school_id = ? AND created_by = ?")
          .bind(schoolId, t.name)
          .first()) as any;
        teacherActivity.push({
          name: t.name,
          classes: cids.length,
          students,
          grades: Number(gCnt?.c || 0),
          subjects: Object.values(subs).join("، "),
        });
      }

      return jsonOut({ absenceToday, attendanceWeek, teacherActivity });
    }

    if (path === "/api/ms/admin/settings" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const name = String(body.name || "").trim() || schoolRow.name;
      const city = String(body.city || "").trim();
      const adminName = String(body.adminName || "").trim();
      const botToken = String(body.telegramBotToken || "").trim();
      await db
        .prepare("UPDATE schools SET name = ?, city = ?, admin_name = ?, telegram_bot_token = ? WHERE id = ?")
        .bind(name, city, adminName, botToken, schoolId)
        .run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/admin/password" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      if (String(body.oldPass || "") !== String(schoolRow.admin_pass)) {
        return jsonOut({ error: "رمز فعلی اشتباه است." }, 401);
      }
      const newPass = String(body.newPass || "");
      if (newPass.length < 5) return jsonOut({ error: "رمز جدید حداقل ۵ کاراکتر باشد." }, 400);
      await db.prepare("UPDATE schools SET admin_pass = ? WHERE id = ?").bind(newPass, schoolId).run();
      return jsonOut({ ok: true });
    }
  }

  // ==================== اطلاعیه‌ها (خواندن برای همه نقش‌های مدرسه) ====================
  if (path === "/api/ms/announcements" && request.method === "GET") {
    let rows: any[];
    if (isTeacher) {
      rows = (await db
        .prepare("SELECT * FROM ms_announcements WHERE school_id = ? AND (audience IN ('all','teachers') OR class_id IS NOT NULL) ORDER BY id DESC LIMIT 20")
        .bind(schoolId)
        .all()).results || [];
    } else if (isAdmin) {
      rows = (await db
        .prepare("SELECT * FROM ms_announcements WHERE school_id = ? ORDER BY id DESC LIMIT 20")
        .bind(schoolId)
        .all()).results || [];
    } else {
      const cid = Number(tok.classId || 0);
      rows = (await db
        .prepare(
          `SELECT * FROM ms_announcements WHERE school_id = ? AND (class_id IS NULL OR class_id = ?) AND audience IN ('all','students') ORDER BY id DESC LIMIT 20`
        )
        .bind(schoolId, cid)
        .all()).results || [];
    }
    return jsonOut({
      announcements: rows.map((a: any) => ({
        title: a.title,
        body: a.body,
        audience: a.audience,
        classId: a.class_id,
        by: a.created_by,
        date: String(a.created_at || "").split("T")[0],
      })),
    });
  }

  // ==================== اطلاعیه (ارسال — معلم یا مدیر) ====================
  if (path === "/api/ms/announce" && request.method === "POST" && isAdmin) {
    const body = (await request.json().catch(() => ({}))) as any;
    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    if (title.length < 2) return jsonOut({ error: "عنوان اطلاعیه کوتاه است." }, 400);
    const cid = body.classId ? Number(body.classId) : null;
    const audience = ["all", "students", "teachers"].includes(body.audience) ? body.audience : "all";
    await db
      .prepare("INSERT INTO ms_announcements (school_id, class_id, audience, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(schoolId, cid, audience, title, text, schoolRow.admin_name || "مدیر مدرسه", nowIso())
      .run();
    return jsonOut({ ok: true });
  }

  // ==================== آمار اتاق‌های زنده ====================
  if (path === "/api/ms/live-stats" && request.method === "GET") {
    if (!isSuper && !isAdmin) return jsonOut({ error: "غیرمجاز" }, 403);
    const rooms = getLiveRoomsStats();
    return jsonOut({
      rooms: rooms.filter((r: any) => isSuper || r.schoolId === schoolId),
    });
  }

  // ==================== پنل مدیر ارشد ====================
  if (isSuper) {
    if (path === "/api/ms/super/schools" && request.method === "GET") {
      const rows = (await db.prepare("SELECT * FROM schools ORDER BY id DESC").all()).results || [];
      const out: any[] = [];
      for (const s of rows as any[]) {
        const sc = (await db.prepare("SELECT COUNT(*) c FROM ms_students WHERE school_id = ?").bind(Number(s.id)).first()) as any;
        const tc = (await db.prepare("SELECT COUNT(*) c FROM ms_teachers WHERE school_id = ?").bind(Number(s.id)).first()) as any;
        const cc = (await db.prepare("SELECT COUNT(*) c FROM ms_classes WHERE school_id = ?").bind(Number(s.id)).first()) as any;
        out.push({
          id: Number(s.id),
          code: s.code,
          name: s.name,
          city: s.city || "",
          adminName: s.admin_name || "",
          adminUser: s.admin_user,
          adminPass: s.admin_pass,
          plan: s.plan || "trial",
          expiresAt: s.expires_at || "",
          maxStudents: Number(s.max_students || 300),
          maxTeachers: Number(s.max_teachers || 30),
          active: Number(s.active) === 1,
          students: Number(sc?.c || 0),
          teachers: Number(tc?.c || 0),
          classes: Number(cc?.c || 0),
          botTokenSet: Boolean(String(s.telegram_bot_token || "").trim()),
        });
      }
      return jsonOut({ schools: out });
    }

    if (path === "/api/ms/super/schools" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const name = String(body.name || "").trim();
      if (name.length < 3) return jsonOut({ error: "نام مدرسه کوتاه است." }, 400);
      const adminUser = String(body.adminUser || "").trim() || `admin_${randDigits(4)}`;
      const adminPass = String(body.adminPass || "").trim() || randDigits(6);
      const code = await genUniqueCode(db, "code", 4);
      const days = Number(body.days || 30);
      const r = await db
        .prepare(
          `INSERT INTO schools (code, name, city, admin_name, admin_user, admin_pass, telegram_bot_token, plan, expires_at, max_students, max_teachers, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .bind(
          code,
          name,
          String(body.city || "").trim(),
          String(body.adminName || "").trim(),
          adminUser,
          adminPass,
          String(body.telegramBotToken || "").trim(),
          String(body.plan || "trial"),
          addDaysIso(days),
          Number(body.maxStudents || 300),
          Number(body.maxTeachers || 30),
          nowIso()
        )
        .run();
      return jsonOut({ ok: true, id: Number(r.meta?.last_row_id || 0), code, adminUser, adminPass });
    }

    if (path === "/api/ms/super/schools/update" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const id = Number(body.id || 0);
      const s = await getSchoolRow(db, id);
      if (!s) return jsonOut({ error: "مدرسه یافت نشد." }, 404);
      const plan = body.plan !== undefined ? String(body.plan) : s.plan;
      const expiresAt = body.expiresAt !== undefined ? String(body.expiresAt) : s.expires_at;
      const maxStudents = body.maxStudents !== undefined ? Number(body.maxStudents) : Number(s.max_students);
      const maxTeachers = body.maxTeachers !== undefined ? Number(body.maxTeachers) : Number(s.max_teachers);
      const active = body.active !== undefined ? (body.active ? 1 : 0) : Number(s.active);
      const name = body.name !== undefined ? String(body.name) : s.name;
      const city = body.city !== undefined ? String(body.city) : s.city;
      await db
        .prepare("UPDATE schools SET plan = ?, expires_at = ?, max_students = ?, max_teachers = ?, active = ?, name = ?, city = ? WHERE id = ?")
        .bind(plan, expiresAt, maxStudents, maxTeachers, active, name, city, id)
        .run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/super/schools/renew" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const id = Number(body.id || 0);
      const days = Number(body.days || 365);
      await db.prepare("UPDATE schools SET expires_at = ?, active = 1 WHERE id = ?").bind(addDaysIso(days), id).run();
      return jsonOut({ ok: true, expiresAt: addDaysIso(days) });
    }

    if (path === "/api/ms/super/schools/reset-admin" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const id = Number(body.id || 0);
      const newPass = String(body.newPass || "").trim() || randDigits(6);
      await db.prepare("UPDATE schools SET admin_pass = ? WHERE id = ?").bind(newPass, id).run();
      return jsonOut({ ok: true, newPass });
    }

    if (path === "/api/ms/super/announce" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const title = String(body.title || "").trim();
      const text = String(body.body || "").trim();
      if (title.length < 2) return jsonOut({ error: "عنوان اطلاعیه کوتاه است." }, 400);
      const rows = (await db.prepare("SELECT id FROM schools").all()).results || [];
      for (const s of rows as any[]) {
        await db
          .prepare("INSERT INTO ms_announcements (school_id, class_id, audience, title, body, created_by, created_at) VALUES (?, NULL, 'all', ?, ?, ?, ?)")
          .bind(Number(s.id), title, text, "مدیر ارشد سامانه", nowIso())
          .run();
      }
      return jsonOut({ ok: true, sent: rows.length });
    }
  }

  return jsonOut({ error: "مسیر یافت نشد." }, 404);
}
