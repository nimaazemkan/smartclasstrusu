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
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        subject TEXT DEFAULT '',
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        due_date TEXT DEFAULT '',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        assignment_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        text TEXT DEFAULT '',
        photo_b64 TEXT DEFAULT '',
        late INTEGER DEFAULT 0,
        score REAL,
        feedback TEXT DEFAULT '',
        reviewed_at TEXT DEFAULT '',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_missions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        mission TEXT NOT NULL,
        proof TEXT DEFAULT '',
        status TEXT DEFAULT 'open',
        points INTEGER DEFAULT 0,
        feedback TEXT DEFAULT '',
        date TEXT NOT NULL,
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_lab (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        tool TEXT NOT NULL,
        topic TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        points INTEGER DEFAULT 0,
        feedback TEXT DEFAULT '',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_shop_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        cost INTEGER NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_shop_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT DEFAULT '',
        created_by TEXT DEFAULT '',
        created_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ms_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        from_role TEXT NOT NULL,
        text TEXT NOT NULL,
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
  askAI?: (question: string) => Promise<{ text: string; photoUrl?: string } | string>;
  generateQuiz?: (topic: string, count: number) => Promise<any>;
  aiTool?: (tool: string, payload: any) => Promise<any>;
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

    // ---- 📚 تکالیف کلاس ----
    if (path === "/api/ms/teacher/assignments" && request.method === "GET") {
      const cid = Number(url.searchParams.get("classId") || 0);
      const cls = await assertClass(cid);
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      const rows = await db
        .prepare("SELECT * FROM ms_assignments WHERE school_id = ? AND class_id = ? ORDER BY id DESC")
        .bind(schoolId, cid)
        .all();
      const out: any[] = [];
      for (const a of (rows.results || []) as any[]) {
        const cnt = (await db
          .prepare("SELECT COUNT(*) c, SUM(CASE WHEN reviewed_at != '' THEN 1 ELSE 0 END) r FROM ms_submissions WHERE assignment_id = ?")
          .bind(Number(a.id))
          .first()) as any;
        out.push({
          id: Number(a.id),
          title: a.title,
          description: a.description,
          dueDate: a.due_date || "",
          subject: a.subject,
          createdAt: String(a.created_at || "").split("T")[0],
          submissionCount: Number(cnt?.c || 0),
          reviewedCount: Number(cnt?.r || 0),
        });
      }
      return jsonOut({ assignments: out });
    }

    if (path === "/api/ms/teacher/assignments" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const cid = Number(body.classId || 0);
      const cls = await assertClass(cid);
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      const title = String(body.title || "").trim();
      if (title.length < 2) return jsonOut({ error: "عنوان تکلیف کوتاه است." }, 400);
      const r = await db
        .prepare(
          "INSERT INTO ms_assignments (school_id, class_id, teacher_id, subject, title, description, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(schoolId, cid, tId, subs[String(cid)], title, String(body.description || "").trim(), String(body.dueDate || "").trim(), nowIso())
        .run();
      return jsonOut({ ok: true, id: Number(r.meta?.last_row_id || 0) });
    }

    if (path === "/api/ms/teacher/assignments/delete" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const id = Number(body.id || 0);
      const a = await db.prepare("SELECT * FROM ms_assignments WHERE id = ? AND school_id = ?").bind(id, schoolId).first();
      if (!a) return jsonOut({ error: "تکلیف یافت نشد." }, 404);
      const cls = await assertClass(Number(a.class_id));
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      await db.prepare("DELETE FROM ms_submissions WHERE assignment_id = ?").bind(id).run();
      await db.prepare("DELETE FROM ms_assignments WHERE id = ? AND school_id = ?").bind(id, schoolId).run();
      return jsonOut({ ok: true });
    }

    if (path === "/api/ms/teacher/submissions" && request.method === "GET") {
      const aid = Number(url.searchParams.get("assignmentId") || 0);
      const a: any = await db.prepare("SELECT * FROM ms_assignments WHERE id = ? AND school_id = ?").bind(aid, schoolId).first();
      if (!a) return jsonOut({ error: "تکلیف یافت نشد." }, 404);
      const cls = await assertClass(Number(a.class_id));
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      const roster = await db
        .prepare("SELECT id, name FROM ms_students WHERE school_id = ? AND class_id = ? ORDER BY name")
        .bind(schoolId, Number(a.class_id))
        .all();
      const subsRows = await db
        .prepare("SELECT * FROM ms_submissions WHERE assignment_id = ?")
        .bind(aid)
        .all();
      const subMap: Record<number, any> = {};
      for (const s of (subsRows.results || []) as any[]) subMap[Number(s.student_id)] = s;
      return jsonOut({
        assignment: { id: Number(a.id), title: a.title, description: a.description, dueDate: a.due_date || "", subject: a.subject },
        submissions: (roster.results || []).map((st: any) => {
          const s = subMap[Number(st.id)];
          return {
            submissionId: s ? Number(s.id) : 0,
            studentId: Number(st.id),
            name: st.name,
            submitted: Boolean(s),
            text: s ? s.text : "",
            photo: s ? s.photo_b64 || "" : "",
            late: s ? Number(s.late) === 1 : false,
            score: s && s.score !== null && s.score !== undefined ? Number(s.score) : null,
            feedback: s ? s.feedback || "" : "",
            reviewed: s ? Boolean(s.reviewed_at) : false,
            createdAt: s ? String(s.created_at || "").split("T")[0] : "",
          };
        }),
      });
    }

    if (path === "/api/ms/teacher/review" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const sid = Number(body.submissionId || 0);
      const s: any = await db.prepare("SELECT * FROM ms_submissions WHERE id = ? AND school_id = ?").bind(sid, schoolId).first();
      if (!s) return jsonOut({ error: "تکلیفی از دانش‌آموز یافت نشد." }, 404);
      const a: any = await db.prepare("SELECT * FROM ms_assignments WHERE id = ?").bind(Number(s.assignment_id)).first();
      if (!a) return jsonOut({ error: "تکلیف یافت نشد." }, 404);
      const cls = await assertClass(Number(a.class_id));
      if (!cls) return jsonOut({ error: "این کلاس در اختیار شما نیست." }, 403);
      const score = Number(body.score);
      if (!isFinite(score)) return jsonOut({ error: "نمره معتبر وارد کنید." }, 400);
      await db
        .prepare("UPDATE ms_submissions SET score = ?, feedback = ?, reviewed_at = ? WHERE id = ?")
        .bind(score, String(body.feedback || "").trim(), nowIso(), sid)
        .run();
      return jsonOut({ ok: true });
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

  // ==================== 📚 تکالیف دانش‌آموز / والدین ====================
  if (path === "/api/ms/student/assignments" && request.method === "GET") {
    if (!isStudent && !isParent) return jsonOut({ error: "غیرمجاز" }, 403);
    const stId = Number(tok.studentId || 0);
    const st: any = await db.prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ?").bind(stId, schoolId).first();
    if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
    const rows = await db
      .prepare("SELECT * FROM ms_assignments WHERE school_id = ? AND class_id = ? ORDER BY id DESC")
      .bind(schoolId, Number(st.class_id))
      .all();
    const subsRows = await db
      .prepare("SELECT * FROM ms_submissions WHERE student_id = ? ORDER BY id DESC")
      .bind(stId)
      .all();
    const subMap: Record<number, any> = {};
    for (const s of (subsRows.results || []) as any[]) subMap[Number(s.assignment_id)] = s;
    return jsonOut({
      studentName: st.name,
      assignments: (rows.results || []).map((a: any) => {
        const s = subMap[Number(a.id)];
        return {
          id: Number(a.id),
          title: a.title,
          description: a.description,
          dueDate: a.due_date || "",
          subject: a.subject,
          createdAt: String(a.created_at || "").split("T")[0],
          mySubmission: s
            ? {
                text: s.text,
                photo: s.photo_b64 || "",
                late: Number(s.late) === 1,
                score: s.score !== null && s.score !== undefined ? Number(s.score) : null,
                feedback: s.feedback || "",
                reviewed: Boolean(s.reviewed_at),
                createdAt: String(s.created_at || "").split("T")[0],
              }
            : null,
        };
      }),
    });
  }

  if (path === "/api/ms/student/submit" && request.method === "POST") {
    if (!isStudent) return jsonOut({ error: "فقط دانش‌آموز می‌تواند تکلیف ارسال کند." }, 403);
    const body = (await request.json().catch(() => ({}))) as any;
    const aid = Number(body.assignmentId || 0);
    const a: any = await db.prepare("SELECT * FROM ms_assignments WHERE id = ? AND school_id = ?").bind(aid, schoolId).first();
    if (!a) return jsonOut({ error: "تکلیف یافت نشد." }, 404);
    const stId = Number(tok.studentId || 0);
    const st: any = await db
      .prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ? AND class_id = ?")
      .bind(stId, schoolId, Number(a.class_id))
      .first();
    if (!st) return jsonOut({ error: "این تکلیف برای کلاس شما نیست." }, 403);
    const text = String(body.text || "").trim();
    let photo = String(body.photo || "").trim();
    if (photo && (!photo.startsWith("data:image/") || photo.length > 900000)) {
      return jsonOut({ error: "حجم یا نوع تصویر نامعتبر است (حداکثر ۷۰۰ کیلوبایت)." }, 400);
    }
    if (!text && !photo) return jsonOut({ error: "متن یا تصویر تکلیف را وارد کنید." }, 400);
    const existing: any = await db
      .prepare("SELECT * FROM ms_submissions WHERE assignment_id = ? AND student_id = ?")
      .bind(aid, stId)
      .first();
    if (existing && existing.reviewed_at) {
      return jsonOut({ error: "این تکلیف توسط معلم تصحیح شده و دیگر قابل ویرایش نیست." }, 400);
    }
    const late = a.due_date && todayStr() > String(a.due_date) ? 1 : 0;
    if (existing) {
      await db
        .prepare("UPDATE ms_submissions SET text = ?, photo_b64 = ?, late = ?, created_at = ? WHERE id = ?")
        .bind(text, photo || String(existing.photo_b64 || ""), late, nowIso(), Number(existing.id))
        .run();
    } else {
      await db
        .prepare(
          "INSERT INTO ms_submissions (school_id, assignment_id, student_id, class_id, text, photo_b64, late, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(schoolId, aid, stId, Number(a.class_id), text, photo, late, nowIso())
        .run();
    }
    return jsonOut({ ok: true, late: late === 1 });
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

  // ==================== 🤖 پرسش و پاسخ هوش مصنوعی + کوییز هوشمند ====================
  if (path === "/api/ms/ai/ask" && request.method === "POST") {
    if (!deps.askAI) return jsonOut({ error: "سرویس هوش مصنوعی در دسترس نیست." }, 503);
    const body = (await request.json().catch(() => ({}))) as any;
    const question = String(body.question || "").trim();
    if (question.length < 2) return jsonOut({ error: "سوال خود را بنویسید." }, 400);
    const res = await deps.askAI(question);
    if (typeof res === "string") return jsonOut({ answer: res, photoUrl: "" });
    return jsonOut({ answer: (res as any)?.text || "پاسخی دریافت نشد.", photoUrl: (res as any)?.photoUrl || "" });
  }

  if (path === "/api/ms/ai/quiz" && request.method === "POST") {
    if (!deps.generateQuiz) return jsonOut({ error: "سرویس هوش مصنوعی در دسترس نیست." }, 503);
    const body = (await request.json().catch(() => ({}))) as any;
    const topic = String(body.topic || "").trim();
    if (topic.length < 2) return jsonOut({ error: "موضوع کوییز را بنویسید." }, 400);
    const count = Math.min(Math.max(Number(body.count || 3), 1), 5);
    // تلاش مجدد خودکار برای پایداری خروجی هوش مصنوعی
    let q: any = null;
    let lastErr = "پاسخ نامعتبر از هوش مصنوعی.";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await deps.generateQuiz(topic, count).catch((e: any) => String(e?.message || "خطای هوش مصنوعی"));
      if (Array.isArray(res) && res.length > 0) {
        q = res;
        break;
      }
      lastErr = typeof res === "string" ? res : lastErr;
    }
    if (!q) return jsonOut({ error: lastErr }, 502);
    return jsonOut({ questions: q });
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

  // ====================================================================
  // 🎯🧠🛒📚 ادغام امکانات کامل نسخه قبلی (ماموریت، کارگاه، فروشگاه، کتابخانه، پیام)
  // ====================================================================
  const DAILY_MISSIONS_MS = [
    "امروز ۲۰ دقیقه کتاب غیردرسی بخوان و یک جمله از آن بنویس.",
    "یک درس از امروز را برای خانواده‌ات توضیح بده و بازخوردشان را بنویس.",
    "۱۰ لغت جدید انگلیسی یاد بگیر و در جمله استفاده کن.",
    "تمرین امروز ریاضی را بدون کمک حل کن و راه‌حل را عکس بگیر.",
    "یک آزمایش علمی ساده در خانه انجام بده و گزارش کوتاه بنویس.",
    "دست‌خط خود را ۱۵ دقیقه تمرین کن (رونویسی از یک متن زیبا).",
    "یک خلاصه ۵ خطی از مهم‌ترین درس امروز بنویس.",
    "به یکی از هم‌کلاسی‌هایت در یادگیری درس امروز کمک کن.",
    "۳ سوال امتحانی از درس امروز طراحی کن و جوابش را بنویس.",
    "امروز بدون گوشی، ۳۰ دقیقه مطالعه متمرکز داشته باش.",
  ];
  const isEduStudent = isStudent || isParent;

  const getStudentPoints = async (sid: number): Promise<number> => {
    const r = (await db.prepare("SELECT COALESCE(SUM(delta),0) s FROM ms_points WHERE student_id = ?").bind(sid).first()) as any;
    return Number(r?.s || 0);
  };
  const getPendingOrderCost = async (sid: number): Promise<number> => {
    const r = (await db
      .prepare(
        `SELECT COALESCE(SUM(i.cost),0) s FROM ms_shop_orders o JOIN ms_shop_items i ON i.id = o.item_id
         WHERE o.student_id = ? AND o.status = 'pending'`
      )
      .bind(sid)
      .first()) as any;
    return Number(r?.s || 0);
  };

  if (path === "/api/ms/edu/home" && request.method === "GET" && isEduStudent) {
    const stId = Number(tok.studentId || 0);
    const st: any = await db.prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ?").bind(stId, schoolId).first();
    if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
    const today = todayStr();
    let mission: any = await db
      .prepare("SELECT * FROM ms_missions WHERE student_id = ? AND date = ? ORDER BY id DESC LIMIT 1")
      .bind(stId, today)
      .first();
    if (!mission && isStudent) {
      const txt = DAILY_MISSIONS_MS[Math.floor(Math.random() * DAILY_MISSIONS_MS.length)];
      const r = await db
        .prepare("INSERT INTO ms_missions (school_id, class_id, student_id, mission, date, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(schoolId, Number(st.class_id), stId, txt, today, nowIso())
        .run();
      mission = { id: Number(r.meta?.last_row_id || 0), mission: txt, proof: "", status: "open", points: 0, feedback: "", date: today };
    }
    const points = await getStudentPoints(stId);
    const all = await db.prepare("SELECT id, name FROM ms_students WHERE school_id = ? ORDER BY id").bind(schoolId).all();
    const scored: Array<{ id: number; name: string; points: number }> = [];
    for (const s of (all.results || []) as any[]) {
      scored.push({ id: Number(s.id), name: s.name, points: await getStudentPoints(Number(s.id)) });
    }
    scored.sort((a, b) => b.points - a.points);
    const rank = scored.findIndex((x) => x.id === stId) + 1;
    return jsonOut({
      student: { id: stId, name: st.name },
      mission: mission
        ? { id: Number(mission.id), text: mission.mission, proof: mission.proof || "", status: mission.status || "open", points: Number(mission.points || 0), feedback: mission.feedback || "", date: mission.date || today }
        : null,
      points,
      rank: rank || scored.length,
      totalStudents: scored.length,
    });
  }

  if (path === "/api/ms/edu/mission/submit" && request.method === "POST" && (isStudent || isParent || isTeacher)) {
    if (!isStudent) return jsonOut({ error: "فقط دانش‌آموز می‌تواند گزارش بدهد." }, 403);
    const body = (await request.json().catch(() => ({}))) as any;
    const stId = Number(tok.studentId || 0);
    const today = todayStr();
    const mission: any = await db
      .prepare("SELECT * FROM ms_missions WHERE student_id = ? AND date = ? ORDER BY id DESC LIMIT 1")
      .bind(stId, today)
      .first();
    if (!mission) return jsonOut({ error: "ماموریت امروز یافت نشد." }, 404);
    if (mission.status === "approved") return jsonOut({ error: "این ماموریت تایید شده و قابل تغییر نیست." }, 400);
    const proof = String(body.proof || "").trim();
    if (proof.length < 3) return jsonOut({ error: "گزارش انجام ماموریت را بنویسید." }, 400);
    await db
      .prepare("UPDATE ms_missions SET proof = ?, status = 'pending' WHERE id = ?")
      .bind(proof, Number(mission.id))
      .run();
    return jsonOut({ ok: true });
  }

  if (path === "/api/ms/edu/lab" && request.method === "GET" && isEduStudent) {
    const stId = Number(tok.studentId || 0);
    const rows = await db
      .prepare("SELECT * FROM ms_lab WHERE student_id = ? ORDER BY id DESC LIMIT 20")
      .bind(stId)
      .all();
    return jsonOut({
      items: (rows.results || []).map((l: any) => ({
        id: Number(l.id),
        tool: l.tool,
        topic: l.topic,
        summary: l.summary,
        status: l.status,
        points: Number(l.points || 0),
        feedback: l.feedback || "",
        date: String(l.created_at || "").split("T")[0],
      })),
    });
  }

  if (path === "/api/ms/edu/lab/submit" && request.method === "POST" && (isStudent || isParent || isTeacher)) {
    if (!isStudent) return jsonOut({ error: "فقط دانش‌آموز می‌تواند گزارش بدهد." }, 403);
    const body = (await request.json().catch(() => ({}))) as any;
    const stId = Number(tok.studentId || 0);
    const st: any = await db.prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ?").bind(stId, schoolId).first();
    if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
    const tool = String(body.tool || "").trim();
    const summary = String(body.summary || "").trim();
    if (!tool || summary.length < 3) return jsonOut({ error: "گزارش کوتاهی از فعالیت بنویسید." }, 400);
    await db
      .prepare("INSERT INTO ms_lab (school_id, class_id, student_id, tool, topic, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(schoolId, Number(st.class_id), stId, tool, String(body.topic || "").trim(), summary, nowIso())
      .run();
    return jsonOut({ ok: true });
  }

  if (path === "/api/ms/edu/shop" && request.method === "GET" && isEduStudent) {
    const stId = Number(tok.studentId || 0);
    const items = await db
      .prepare("SELECT * FROM ms_shop_items WHERE school_id = ? AND active = 1 ORDER BY cost")
      .bind(schoolId)
      .all();
    const orders = await db
      .prepare("SELECT o.*, i.title FROM ms_shop_orders o JOIN ms_shop_items i ON i.id = o.item_id WHERE o.student_id = ? ORDER BY o.id DESC LIMIT 15")
      .bind(stId)
      .all();
    const points = await getStudentPoints(stId);
    const pendingCost = await getPendingOrderCost(stId);
    return jsonOut({
      points,
      pendingCost,
      items: (items.results || []).map((i: any) => ({ id: Number(i.id), title: i.title, cost: Number(i.cost) })),
      orders: (orders.results || []).map((o: any) => ({
        id: Number(o.id),
        title: o.title,
        status: o.status,
        date: String(o.created_at || "").split("T")[0],
      })),
    });
  }

  if (path === "/api/ms/edu/shop/order" && request.method === "POST" && isStudent) {
    const body = (await request.json().catch(() => ({}))) as any;
    const stId = Number(tok.studentId || 0);
    const item: any = await db
      .prepare("SELECT * FROM ms_shop_items WHERE id = ? AND school_id = ? AND active = 1")
      .bind(Number(body.itemId || 0), schoolId)
      .first();
    if (!item) return jsonOut({ error: "جایزه یافت نشد." }, 404);
    const points = await getStudentPoints(stId);
    const pending = await getPendingOrderCost(stId);
    if (points - pending < Number(item.cost)) {
      return jsonOut({ error: `امتیاز شما کافی نیست؛ ${(points - pending).toLocaleString("fa")} امتیاز دارید و این جایزه ${item.cost} امتیاز است.` }, 400);
    }
    await db
      .prepare("INSERT INTO ms_shop_orders (school_id, item_id, student_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(schoolId, Number(item.id), stId, nowIso())
      .run();
    return jsonOut({ ok: true });
  }

  if (path === "/api/ms/edu/leaderboard" && request.method === "GET" && isEduStudent) {
    const stId = Number(tok.studentId || 0);
    const all = await db.prepare("SELECT id, name FROM ms_students WHERE school_id = ?").bind(schoolId).all();
    const scored: Array<{ id: number; name: string; points: number }> = [];
    for (const s of (all.results || []) as any[]) {
      scored.push({ id: Number(s.id), name: s.name, points: await getStudentPoints(Number(s.id)) });
    }
    scored.sort((a, b) => b.points - a.points);
    return jsonOut({ top: scored.slice(0, 15), myRank: scored.findIndex((x) => x.id === stId) + 1, myPoints: await getStudentPoints(stId) });
  }

  if (path === "/api/ms/edu/library" && request.method === "GET") {
    const rows = await db
      .prepare("SELECT * FROM ms_library WHERE school_id = ? ORDER BY id DESC LIMIT 30")
      .bind(schoolId)
      .all();
    return jsonOut({
      items: (rows.results || []).map((l: any) => ({
        id: Number(l.id),
        title: l.title,
        body: l.body,
        by: l.created_by,
        date: String(l.created_at || "").split("T")[0],
      })),
    });
  }

  if (path === "/api/ms/edu/messages" && request.method === "GET" && (isStudent || isParent || isTeacher)) {
    if (isTeacher) {
      const rows = await db
        .prepare(
          `SELECT m.*, s.name AS student_name FROM ms_messages m JOIN ms_students s ON s.id = m.student_id
           WHERE m.school_id = ? ORDER BY m.id DESC LIMIT 40`
        )
        .bind(schoolId)
        .all();
      return jsonOut({
        messages: (rows.results || []).map((m: any) => ({
          id: Number(m.id),
          studentId: Number(m.student_id),
          studentName: m.student_name,
          fromRole: m.from_role,
          text: m.text,
          date: String(m.created_at || "").split("T")[0],
        })),
      });
    }
    const stId = Number(tok.studentId || 0);
    const rows = await db
      .prepare("SELECT * FROM ms_messages WHERE student_id = ? ORDER BY id DESC LIMIT 40")
      .bind(stId)
      .all();
    return jsonOut({
      messages: (rows.results || [])
        .map((m: any) => ({ id: Number(m.id), fromRole: m.from_role, text: m.text, date: String(m.created_at || "").split("T")[0] }))
        .reverse(),
    });
  }

  if (path === "/api/ms/edu/messages" && request.method === "POST" && (isStudent || isTeacher)) {
    const body = (await request.json().catch(() => ({}))) as any;
    const text = String(body.text || "").trim();
    if (text.length < 2) return jsonOut({ error: "متن پیام کوتاه است." }, 400);
    if (isTeacher) {
      const sid = Number(body.studentId || 0);
      const st: any = await db.prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ?").bind(sid, schoolId).first();
      if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
      await db
        .prepare("INSERT INTO ms_messages (school_id, class_id, student_id, from_role, text, created_at) VALUES (?, ?, ?, 'teacher', ?, ?)")
        .bind(schoolId, Number(st.class_id), sid, text, nowIso())
        .run();
      return jsonOut({ ok: true });
    }
    const stId = Number(tok.studentId || 0);
    const st: any = await db.prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ?").bind(stId, schoolId).first();
    if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
    await db
      .prepare("INSERT INTO ms_messages (school_id, class_id, student_id, from_role, text, created_at) VALUES (?, ?, ?, 'student', ?, ?)")
      .bind(schoolId, Number(st.class_id), stId, text, nowIso())
      .run();
    return jsonOut({ ok: true });
  }

  // ---- 🤖 ابزارهای هوشمند یادگیری (کارگاه) ----
  if (path === "/api/ms/edu/ai" && request.method === "POST") {
    if (!deps.aiTool) return jsonOut({ error: "سرویس هوش مصنوعی در دسترس نیست." }, 503);
    const body = (await request.json().catch(() => ({}))) as any;
    const tool = String(body.tool || "");
    const allowed = ["flashcards", "essay", "dictation", "science", "english", "mindmap", "summary", "exam", "plan", "scientist", "quizfromtext"];
    if (!allowed.includes(tool)) return jsonOut({ error: "ابزار نامعتبر است." }, 400);
    const result = await deps.aiTool(tool, body);
    if (result && typeof result === "object" && result.error) return jsonOut({ error: result.error }, 502);
    return jsonOut({ result });
  }

  // ==================== 📥 صندوق تایید معلم (ماموریت/کارگاه/فروشگاه) ====================
  if (path === "/api/ms/teacher/inbox" && request.method === "GET" && isTeacher) {
    const missions = await db
      .prepare(
        `SELECT m.*, s.name AS student_name FROM ms_missions m JOIN ms_students s ON s.id = m.student_id
         WHERE m.school_id = ? AND m.status = 'pending' ORDER BY m.id DESC LIMIT 30`
      )
      .bind(schoolId)
      .all();
    const labs = await db
      .prepare(
        `SELECT l.*, s.name AS student_name FROM ms_lab l JOIN ms_students s ON s.id = l.student_id
         WHERE l.school_id = ? AND l.status = 'pending' ORDER BY l.id DESC LIMIT 30`
      )
      .bind(schoolId)
      .all();
    const orders = await db
      .prepare(
        `SELECT o.*, s.name AS student_name, i.title AS item_title, i.cost FROM ms_shop_orders o
         JOIN ms_students s ON s.id = o.student_id JOIN ms_shop_items i ON i.id = o.item_id
         WHERE o.school_id = ? AND o.status = 'pending' ORDER BY o.id DESC LIMIT 30`
      )
      .bind(schoolId)
      .all();
    return jsonOut({
      missions: (missions.results || []).map((m: any) => ({
        id: Number(m.id),
        studentId: Number(m.student_id),
        studentName: m.student_name,
        mission: m.mission,
        proof: m.proof,
        date: m.date,
      })),
      labs: (labs.results || []).map((l: any) => ({
        id: Number(l.id),
        studentId: Number(l.student_id),
        studentName: l.student_name,
        tool: l.tool,
        topic: l.topic,
        summary: l.summary,
        date: String(l.created_at || "").split("T")[0],
      })),
      orders: (orders.results || []).map((o: any) => ({
        id: Number(o.id),
        studentId: Number(o.student_id),
        studentName: o.student_name,
        itemTitle: o.item_title,
        cost: Number(o.cost),
        date: String(o.created_at || "").split("T")[0],
      })),
    });
  }

  if (path === "/api/ms/teacher/inbox/approve" && request.method === "POST" && isTeacher) {
    const body = (await request.json().catch(() => ({}))) as any;
    const kind = String(body.kind || "");
    const id = Number(body.id || 0);
    const approve = body.decision !== "reject";
    const points = Math.max(0, Number(body.points || 0));
    const feedback = String(body.feedback || "").trim();
    const givePoints = async (sid: number, pts: number, reason: string) => {
      if (pts > 0) {
        await db
          .prepare("INSERT INTO ms_points (school_id, class_id, student_id, delta, reason, created_by, created_at) VALUES (?, (SELECT class_id FROM ms_students WHERE id = ?), ?, ?, ?, ?, ?)")
          .bind(schoolId, sid, sid, pts, reason, "معلم", nowIso())
          .run();
      }
    };
    if (kind === "mission") {
      const m: any = await db.prepare("SELECT * FROM ms_missions WHERE id = ? AND school_id = ?").bind(id, schoolId).first();
      if (!m) return jsonOut({ error: "ماموریت یافت نشد." }, 404);
      await db
        .prepare("UPDATE ms_missions SET status = ?, points = ?, feedback = ? WHERE id = ?")
        .bind(approve ? "approved" : "rejected", approve ? points : 0, feedback, id)
        .run();
      if (approve) await givePoints(Number(m.student_id), points, "تایید ماموریت روز");
      return jsonOut({ ok: true });
    }
    if (kind === "lab") {
      const l: any = await db.prepare("SELECT * FROM ms_lab WHERE id = ? AND school_id = ?").bind(id, schoolId).first();
      if (!l) return jsonOut({ error: "گزارش کارگاه یافت نشد." }, 404);
      await db
        .prepare("UPDATE ms_lab SET status = ?, points = ?, feedback = ? WHERE id = ?")
        .bind(approve ? "approved" : "rejected", approve ? points : 0, feedback, id)
        .run();
      if (approve) await givePoints(Number(l.student_id), points, "تایید کارگاه یادگیری");
      return jsonOut({ ok: true });
    }
    if (kind === "order") {
      const o: any = await db.prepare("SELECT * FROM ms_shop_orders WHERE id = ? AND school_id = ?").bind(id, schoolId).first();
      if (!o) return jsonOut({ error: "سفارش یافت نشد." }, 404);
      if (approve) {
        const item: any = await db.prepare("SELECT * FROM ms_shop_items WHERE id = ?").bind(Number(o.item_id)).first();
        const cost = Number(item?.cost || 0);
        await db.prepare("UPDATE ms_shop_orders SET status = 'approved' WHERE id = ?").bind(id).run();
        await db
          .prepare("INSERT INTO ms_points (school_id, class_id, student_id, delta, reason, created_by, created_at) VALUES (?, (SELECT class_id FROM ms_students WHERE id = ?), ?, ?, ?, ?, ?)")
          .bind(schoolId, Number(o.student_id), Number(o.student_id), -cost, `خرید جایزه: ${item?.title || ""}`, "فروشگاه", nowIso())
          .run();
      } else {
        await db.prepare("UPDATE ms_shop_orders SET status = 'rejected' WHERE id = ?").bind(id).run();
      }
      return jsonOut({ ok: true });
    }
    return jsonOut({ error: "نوع نامعتبر." }, 400);
  }

  if (path === "/api/ms/teacher/points" && request.method === "POST" && isTeacher) {
    const body = (await request.json().catch(() => ({}))) as any;
    const sid = Number(body.studentId || 0);
    const delta = Number(body.delta || 0);
    if (!sid || !delta) return jsonOut({ error: "دانش‌آموز و مقدار امتیاز لازم است." }, 400);
    const st: any = await db.prepare("SELECT * FROM ms_students WHERE id = ? AND school_id = ?").bind(sid, schoolId).first();
    if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
    await db
      .prepare("INSERT INTO ms_points (school_id, class_id, student_id, delta, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(schoolId, Number(st.class_id), sid, delta, String(body.reason || "").trim() || "امتیاز معلم", "معلم", nowIso())
      .run();
    return jsonOut({ ok: true });
  }

  // ---- 🛒 فروشگاه (مدیریت معلم) ----
  if (path === "/api/ms/teacher/shop" && request.method === "GET" && isTeacher) {
    const rows = await db.prepare("SELECT * FROM ms_shop_items WHERE school_id = ? AND active = 1 ORDER BY cost").bind(schoolId).all();
    return jsonOut({ items: (rows.results || []).map((i: any) => ({ id: Number(i.id), title: i.title, cost: Number(i.cost), active: Number(i.active) === 1 })) });
  }
  if (path === "/api/ms/teacher/shop" && request.method === "POST" && isTeacher) {
    const body = (await request.json().catch(() => ({}))) as any;
    const title = String(body.title || "").trim();
    const cost = Number(body.cost || 0);
    if (title.length < 2 || cost < 1) return jsonOut({ error: "عنوان و امتیاز جایزه را وارد کنید." }, 400);
    await db
      .prepare("INSERT INTO ms_shop_items (school_id, title, cost, created_at) VALUES (?, ?, ?, ?)")
      .bind(schoolId, title, cost, nowIso())
      .run();
    return jsonOut({ ok: true });
  }
  if (path === "/api/ms/teacher/shop/delete" && request.method === "POST" && isTeacher) {
    const body = (await request.json().catch(() => ({}))) as any;
    await db.prepare("UPDATE ms_shop_items SET active = 0 WHERE id = ? AND school_id = ?").bind(Number(body.id || 0), schoolId).run();
    return jsonOut({ ok: true });
  }

  // ---- 📂 کتابخانه (مدیریت معلم) ----
  if (path === "/api/ms/teacher/library" && request.method === "POST" && isTeacher) {
    const body = (await request.json().catch(() => ({}))) as any;
    const title = String(body.title || "").trim();
    if (title.length < 2) return jsonOut({ error: "عنوان جزوه کوتاه است." }, 400);
    await db
      .prepare("INSERT INTO ms_library (school_id, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(schoolId, title, String(body.body || "").trim(), "معلم", nowIso())
      .run();
    return jsonOut({ ok: true });
  }
  if (path === "/api/ms/teacher/library/delete" && request.method === "POST" && isTeacher) {
    const body = (await request.json().catch(() => ({}))) as any;
    await db.prepare("DELETE FROM ms_library WHERE id = ? AND school_id = ?").bind(Number(body.id || 0), schoolId).run();
    return jsonOut({ ok: true });
  }

  return jsonOut({ error: "مسیر یافت نشد." }, 404);
}
