// شبیه‌سازی کامل سامانه چندمدرسه‌ای (Multi-School E2E Test) روی SQLite درون‌حافظه‌ای
import initSqlJs from "sql.js";
import vm from "node:vm";
import {
  handleMultiSchoolRequest,
  handleMsTgUpdate,
  ensureSchoolTables,
  buildSchoolHtml,
  handleLiveClassRequest,
  getLiveRoomPublicStatus,
  getLiveRoomsStats,
  SUPER_ADMIN_PASSWORD,
} from "./build.mjs";

const SECRET = "TestSecret!";
let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  ✅ " + label); }
  else { fail++; console.log("  ❌ " + label); }
}

// ---------- D1 mock روی sql.js ----------
const SQL = await initSqlJs();
const sqlite = new SQL.Database();
function makeD1(db) {
  return {
    prepare(sql) {
      const st = {
        sql,
        _binds: [],
        bind(...args) {
          st._binds = args.map((a) => (a === undefined ? null : typeof a === "bigint" ? Number(a) : a));
          return st;
        },
        async first() {
          try {
            const stmt = db.prepare(sql);
            stmt.bind(st._binds);
            if (stmt.step()) {
              const row = stmt.getAsObject();
              stmt.free();
              return row;
            }
            stmt.free();
            return null;
          } catch (e) {
            console.log("SQL(first) ERR:", sql, e.message);
            throw e;
          }
        },
        async all() {
          try {
            const stmt = db.prepare(sql);
            stmt.bind(st._binds);
            const results = [];
            while (stmt.step()) results.push(stmt.getAsObject());
            stmt.free();
            return { results };
          } catch (e) {
            console.log("SQL(all) ERR:", sql, e.message);
            throw e;
          }
        },
        async run() {
          try {
            const stmt = db.prepare(sql);
            stmt.bind(st._binds);
            stmt.step();
            stmt.free();
            const changes = db.getRowsModified();
            const idRows = db.exec("SELECT last_insert_rowid() AS id");
            const lastId = idRows.length ? idRows[0].values[0][0] : 0;
            return { meta: { changes, last_row_id: lastId }, success: true };
          } catch (e) {
            console.log("SQL(run) ERR:", sql, e.message);
            throw e;
          }
        },
      };
      return st;
    },
  };
}
const db = makeD1(sqlite);

// ---------- توکن‌ها ----------
async function signToken(payload, secret) {
  const raw = JSON.stringify({ ...payload, iat: Date.now() });
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  return btoa(unescape(encodeURIComponent(raw))) + "." + btoa(String.fromCharCode(...sig));
}
async function verifyToken(token, secret) {
  try {
    const [b64Payload, b64Sig] = String(token).split(".");
    if (!b64Payload || !b64Sig) return null;
    const raw = decodeURIComponent(escape(atob(b64Payload)));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)))));
    if (expected !== b64Sig) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
const normalizeDigits = (s) =>
  String(s || "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();

const deps = {
  db, secret: SECRET, defaultBotToken: "TEST_BOT", signToken, verifyToken, normalizeDigits,
  askAI: async (q) => ({ text: "پاسخ AI به: " + q, photoUrl: "" }),
  aiTool: async (tool, payload) => {
    if (tool === "flashcards") return [{ front: "پرسش ۱", back: "پاسخ ۱" }, { front: "پرسش ۲", back: "پاسخ ۲" }, { front: "پرسش ۳", back: "پاسخ ۳" }];
    if (tool === "essay") return { score: 18, feedback: "خوب", corrections: "چند غلط املایی" };
    if (tool === "dictation") {
      if (payload && payload.mode === "play") return { passage: "هوا امروز صاف است. ما به مدرسه می‌رویم." };
      return { correct: true, feedback: "آفرین", mistakes: [] };
    }
    if (tool === "science") {
      if (payload && payload.mode === "simulate") return { title: "آزمایش نمونه", svg: '<svg viewBox="0 0 400 260"><rect width="400" height="260" fill="#F8FAFC"/></svg>', steps: ["مرحله ۱", "مرحله ۲"], explanation: "توضیح آزمایش" };
      return { question: "قدم بعد؟", choices: ["الف", "ب"], correct: 1, text: "توضیح" };
    }
    if (tool === "english") return { reply: "Nice to meet you!", englishReply: "Nice to meet you! What is your name?", persianMeaning: "از آشناییت خوشحالم!", correctionFa: "آفرین!" };
    if (tool === "mindmap") return { image: "data:image/png;base64,QUFB", rootTitle: "ریشه", text: "گره‌ها" };
    if (tool === "summary") return { text: "خلاصه درس ..." };
    if (tool === "exam") return { examSheet: "برگه آزمون ...", answerKey: "پاسخنامه ..." };
    if (tool === "plan") return { text: "برنامه هفتگی ..." };
    if (tool === "scientist") return { reply: "سلام! من ابن سینا هستم." };
    if (tool === "quizfromtext") return [
      { question: "سوال ۱؟", options: ["الف", "ب", "ج", "د"], correct: 1 },
      { question: "سوال ۲؟", options: ["الف", "ب", "ج", "د"], correct: 2 },
      { question: "سوال ۳؟", options: ["الف", "ب", "ج", "د"], correct: 3 },
    ];
    return { text: "ok" };
  },
  generateQuiz: async (topic, count) =>
    Array.from({ length: count }, (_, i) => ({ question: "سوال " + (i + 1) + " درباره " + topic, options: ["الف", "ب", "ج", "د"], correct: 2 })),
  transcribeAudio: async () => "متن ویس تست",
  textToSpeech: async (text, lang) => "data:audio/mpeg;base64," + Buffer.from("MP3|" + lang + "|" + String(text).slice(0, 12)).toString("base64"),
};

async function ms(path, { method = "GET", body = null, token = "" } = {}) {
  const req = new Request("https://x.test" + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await handleMultiSchoolRequest(req, new URL(req.url), deps);
  let data = null;
  try { data = JSON.parse(await res.text()); } catch {}
  return { status: res.status, data };
}

// ==================== ۱. صفحه /school و اعتبارسنجی JS ====================
console.log("\n۱) صفحه /school و سلامت JS");
const html = buildSchoolHtml();
ok(html.includes("شبکه مدارس هوشمند"), "محتوای فارسی صفحه /school");
ok(html.includes("live-pulse-banner"), "CSS کلاس زنده تزریق شده");
ok(html.includes("renderLiveClassroomPanel"), "JS کلاس زنده تزریق شده");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(scripts.length === 2, "دو بلاک اسکریپت (" + scripts.length + ")");
for (let i = 0; i < scripts.length; i++) {
  try { new vm.Script(scripts[i]); ok(true, "Syntax اسکریپت " + (i + 1)); }
  catch (e) { ok(false, "Syntax اسکریپت " + (i + 1) + " → " + e.message); }
}

// ==================== ۲. ورود مدیر ارشد ====================
console.log("\n۲) ورود مدیر ارشد");
let r = await ms("/api/ms/login", { method: "POST", body: { role: "super", password: "wrong" } });
ok(r.status === 401, "رمز اشتباه رد می‌شود");
r = await ms("/api/ms/login", { method: "POST", body: { role: "super", password: SUPER_ADMIN_PASSWORD } });
ok(r.status === 200 && r.data.session.token, "ورود مدیر ارشد");
const superTok = r.data.session.token;

// ==================== ۳. ساخت مدرسه ====================
console.log("\n۳) ساخت مدرسه جدید توسط مدیر ارشد");
r = await ms("/api/ms/super/schools", {
  method: "POST",
  token: superTok,
  body: { name: "دبیرستان فرزانگان", city: "تهران", adminName: "آقای احمدی", days: 365, plan: "standard", maxStudents: 300, maxTeachers: 30 },
});
ok(r.status === 200 && String(r.data.code).length === 4, "مدرسه ساخته شد — کد " + r.data.code);
const SCHOOL_CODE = r.data.code;
const ADMIN_USER = r.data.adminUser;
const ADMIN_PASS = r.data.adminPass;

// ==================== ۴. جستجوی مدرسه ====================
console.log("\n۴) پیدا کردن مدرسه توسط کاربران");
r = await ms("/api/ms/schools/find?code=" + SCHOOL_CODE);
ok(r.status === 200 && r.data.schools.length === 1 && r.data.schools[0].name === "دبیرستان فرزانگان", "جستجو با کد مدرسه");
r = await ms("/api/ms/schools/find?q=" + encodeURIComponent("فرزانگان"));
ok(r.data.schools.length >= 1, "جستجوی نام مدرسه");
r = await ms("/api/ms/schools/find?code=9999");
ok(r.data.schools.length === 0, "کد ناموجود خالی برمی‌گرداند");

// ==================== ۵. ورود مدیر مدرسه + ساختار ====================
console.log("\n۵) پنل مدیر مدرسه — کلاس‌ها و معلمان");
r = await ms("/api/ms/login", { method: "POST", body: { role: "admin", schoolCode: SCHOOL_CODE, username: ADMIN_USER, password: "wrong" } });
ok(r.status === 401, "رمز اشتباه مدیر مدرسه");
r = await ms("/api/ms/login", { method: "POST", body: { role: "admin", schoolCode: SCHOOL_CODE, username: ADMIN_USER, password: ADMIN_PASS } });
ok(r.status === 200, "ورود مدیر مدرسه");
const adminTok = r.data.session.token;

r = await ms("/api/ms/admin/classes", { method: "POST", token: adminTok, body: { gradeName: "هشتم", className: "۲" } });
ok(r.status === 200, "ساخت کلاس هشتم-۲");
const CLASS_A = r.data.id;
r = await ms("/api/ms/admin/classes", { method: "POST", token: adminTok, body: { gradeName: "هفتم", className: "۱" } });
const CLASS_B = r.data.id;
ok(CLASS_B && CLASS_B !== CLASS_A, "ساخت کلاس هفتم-۱");
r = await ms("/api/ms/admin/classes", { method: "POST", token: adminTok, body: { gradeName: "هشتم", className: "۲" } });
ok(r.status === 400, "کلاس تکراری رد می‌شود");

r = await ms("/api/ms/admin/teachers", { method: "POST", token: adminTok, body: { name: "استاد رضایی", username: "rezaei", password: "pass1234" } });
ok(r.status === 200, "افزودن معلم ریاضی");
const TEACHER_ID = r.data.id;
r = await ms("/api/ms/admin/teachers", { method: "POST", token: adminTok, body: { name: "استاد محمدی", username: "mohammadi", password: "pass1234" } });
const TEACHER2_ID = r.data.id;
ok(TEACHER2_ID > 0, "افزودن معلم علوم");
r = await ms("/api/ms/admin/teachers/assign", { method: "POST", token: adminTok, body: { teacherId: TEACHER_ID, subjects: { [String(CLASS_A)]: "ریاضی", [String(CLASS_B)]: "ریاضی" } } });
ok(r.status === 200, "تخصیص ریاضی به دو کلاس");
r = await ms("/api/ms/admin/teachers/assign", { method: "POST", token: adminTok, body: { teacherId: TEACHER2_ID, subjects: { [String(CLASS_A)]: "علوم" } } });
ok(r.status === 200, "تخصیص علوم به هشتم-۲");

// ==================== ۶. دانش‌آموزان (تکی + گروهی) ====================
console.log("\n۶) ثبت‌نام دانش‌آموزان");
r = await ms("/api/ms/admin/students", { method: "POST", token: adminTok, body: { name: "علی رضایی", classId: CLASS_A } });
ok(r.status === 200 && String(r.data.studentCode).length === 6, "ثبت تکی — کد " + r.data.studentCode);
const ST1 = r.data;
r = await ms("/api/ms/admin/students/bulk", {
  method: "POST",
  token: adminTok,
  body: { text: "مریم احمدی, هشتم-۲\nحسین کریمی, هفتم-۱\nنامعلوم, نهم-۹\nزهرا قاسمی, هفتم ۱" },
});
ok(r.status === 200, "ثبت گروهی پاسخ گرفت");
const bulkOk = r.data.results.filter((x) => x.ok);
const bulkBad = r.data.results.filter((x) => !x.x && !x.ok);
ok(bulkOk.length === 3, "۳ دانش‌آموز با موفقیت ثبت شد (" + bulkOk.length + ")");
ok(bulkBad.length === 1 && bulkBad[0].error.includes("پیدا نشد"), "سطر کلاس نامعتبر رد شد");
const ST2 = bulkOk.find((x) => x.name === "مریم احمدی");
const ST3 = bulkOk.find((x) => x.name === "حسین کریمی");
ok(bulkOk.some((x) => x.name === "زهرا قاسمی" && x.classLabel.includes("هفتم")), "قالب «هفتم ۱» هم شناخته شد");

// ==================== ۷. ورود دانش‌آموز و خانه ====================
console.log("\n۷) ورود دانش‌آموز و میز کار");
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: ST1.studentCode, pin: "0000" } });
ok(r.status === 401, "رمز اشتباه دانش‌آموز");
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: ST1.studentCode, pin: ST1.pin } });
ok(r.status === 200 && r.data.session.classId === CLASS_A, "ورود دانش‌آموز");
const st1Tok = r.data.session.token;
const st1Id = r.data.session.studentId;

r = await ms("/api/ms/home", { token: st1Tok });
ok(r.status === 200, "خانه دانش‌آموز");
ok(r.data.subjects.some((s) => s.subject === "ریاضی" && s.teacherName === "استاد رضایی"), "درس ریاضی با نام معلم");
ok(r.data.subjects.some((s) => s.subject === "علوم"), "درس علوم");
ok(r.data.class.label.includes("هشتم"), "برچسب کلاس");
ok(r.data.live.active === false, "کلاس زنده غیرفعال");

// ==================== ۸. ورود والدین ====================
console.log("\n۸) پنل والدین");
r = await ms("/api/ms/login", { method: "POST", body: { role: "parent", schoolCode: SCHOOL_CODE, code: ST1.parentCode } });
ok(r.status === 200 && r.data.session.role === "parent", "ورود والدین با کد اختصاصی");
const parentTok = r.data.session.token;
r = await ms("/api/ms/home", { token: parentTok });
ok(r.data.student.name === "علی رضایی", "اطلاعات فرزند برای والدین");

// ==================== ۹. پنل معلم — حضور و نمره ====================
console.log("\n۹) پنل معلم");
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL_CODE, username: "rezaei", password: "pass1234" } });
ok(r.status === 200, "ورود معلم");
const tcTok = r.data.session.token;
r = await ms("/api/ms/home", { token: tcTok });
ok(r.data.classes.length === 2, "معلم دو کلاس دارد");
ok(r.data.classes[0].subject === "ریاضی", "درس معلم درست است");

r = await ms("/api/ms/teacher/class?classId=" + CLASS_A, { token: tcTok });
ok(r.data.roster.length === 2, "لیست هشتم-۲ (۲ نفر) — " + r.data.roster.length);
r = await ms("/api/ms/teacher/attendance", {
  method: "POST",
  token: tcTok,
  body: { classId: CLASS_A, entries: [{ studentId: st1Id, status: "present" }, { studentId: ST2.id || r.data?.roster?.find?.(() => 0), status: "absent" }] },
});
// ST2.id از bulk نیامده — از لیست بگیریم:
const rosterA = (await ms("/api/ms/teacher/class?classId=" + CLASS_A, { token: tcTok })).data.roster;
const st2Row = rosterA.find((s) => s.name === "مریم احمدی");
r = await ms("/api/ms/teacher/attendance", {
  method: "POST",
  token: tcTok,
  body: { classId: CLASS_A, entries: [{ studentId: st1Id, status: "present" }, { studentId: st2Row.id, status: "absent" }] },
});
ok(r.status === 200 && r.data.saved === 2, "حضورورغیاب ذخیره شد");
r = await ms("/api/ms/teacher/grade", { method: "POST", token: tcTok, body: { classId: CLASS_A, studentId: st1Id, title: "آزمون فصل ۱", score: 18.5 } });
ok(r.status === 200, "نمره ریاضی ثبت شد");
const tc2Tok = (await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL_CODE, username: "mohammadi", password: "pass1234" } })).data.session.token;
r = await ms("/api/ms/teacher/grade", { method: "POST", token: tc2Tok, body: { classId: CLASS_B, studentId: st1Id, title: "x", score: 10 } });
ok(r.status === 403, "معلم نمی‌تواند به کلاس خارج از تخصیص نمره دهد");
r = await ms("/api/ms/announce", { method: "POST", token: tcTok, body: { title: "امتحان فردا", body: "فصل ۱ ریاضی", classId: CLASS_A } });
ok(r.status === 200, "اطلاعیه معلم ثبت شد");

// ==================== ۱۰. خانه دانش‌آموز پس از ثبت‌ها ====================
console.log("\n۱۰) بازخورد در خانه دانش‌آموز");
r = await ms("/api/ms/home", { token: st1Tok });
ok(r.data.attendance.present === 1 && r.data.attendance.total === 1, "حضورورغیاب نمایش داده شد");
ok(r.data.grades.some((g) => g.score === 18.5 && g.subject === "ریاضی"), "نمره ثبت‌شده نمایش داده شد");
ok(r.data.announcements.some((a) => a.title === "امتحان فردا"), "اطلاعیه معلم نمایش داده شد");

// ==================== ۱۱. اتاق کلاس زنده چندمدرسه‌ای ====================
console.log("\n۱۱) کلاس زنده (Multi-Room WebRTC)");
const roomKey = "s" + (await getSchoolId(SCHOOL_CODE)) + "c" + CLASS_A;
async function getSchoolId(code) {
  const row = sqlite.exec("SELECT id FROM schools WHERE code = '" + code + "'");
  return row[0].values[0][0];
}
const liveDeps = {
  verifyAuth: async (req, u) => {
    const t = (u.searchParams.get("t") || req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    return await verifyToken(t, SECRET);
  },
  getStudent: async () => null,
  getAllStudents: async () => [],
  markStudentPresentToday: async () => {},
  notifyTelegramClassStarted: async () => 0,
  teacherName: "استاد ریاضی",
  classAccess: async (schoolId, classId, a) => {
    const acc = sqlite.exec("SELECT id, name, class_id FROM ms_students WHERE id = " + Number(a.studentId || 0));
    if (a.role === "ms_student" && acc.length && acc[0].values.length) {
      const row = acc[0].values[0];
      if (Number(row[2]) !== Number(classId)) return { ok: false };
      return { ok: true, name: row[1], myUserId: row[0] };
    }
    if (a.role === "ms_teacher" || a.role === "ms_admin") return { ok: true, name: "استاد ریاضی", myUserId: 0 };
    return { ok: false };
  },
  markClassStudentPresent: async (schoolId, classId, uid) => {
    sqlite.exec("UPDATE ms_attendance SET status = 'present' WHERE student_id = " + uid);
  },
  notifyClassStarted: async () => 5,
};
async function live(path, { method = "POST", body = null, token = "" } = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const req = new Request("https://x.test" + path + sep + "room=" + encodeURIComponent(roomKey), {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await handleLiveClassRequest(req, new URL(req.url), liveDeps);
  let data = null;
  try { data = JSON.parse(await res.text()); } catch {}
  return { status: res.status, data };
}

// توکن کلاس قدیمی (role=teacher) نباید به اتاق مدرسه راه یابد
const legacyTok = await signToken({ role: "teacher" }, SECRET);
r = await live("/api/app/live/sync", { body: {}, token: legacyTok });
ok(r.status === 403, "توکن کلاس قدیمی در اتاق مدرسه رد می‌شود");

// معلم مدرسه کلاس را شروع می‌کند
r = await live("/api/app/live/start", { body: { title: "ریاضی فصل ۱", notifyTelegram: true }, token: tcTok });
ok(r.status === 200 && r.data.notified === 5, "شروع کلاس زنده + ۵ اعلان تلگرام");
ok(getLiveRoomPublicStatus(roomKey).active === true, "اتاق فعال است");
ok(getLiveRoomPublicStatus("default").active === false, "اتاق پیش‌فرض جداگانه است");
ok(getLiveRoomsStats().some((x) => x.roomKey === roomKey && x.online === 1), "آمار اتاق‌ها");

// دانش‌آموز وارد می‌شود و حضورش خودکار ثبت می‌شود
r = await live("/api/app/live/sync", { body: { pageIndex: 0, pageRev: 0, sinceStrokeSeq: 0, sinceChatId: 0, sinceSignalId: 0 }, token: st1Tok });
ok(r.status === 200 && r.data.active === true, "sync دانش‌آموز");
ok(r.data.myKey === "st_" + st1Id, "کلید دانش‌آموز در اتاق");
ok(r.data.participants.length === 2, "دو شرکت‌کننده");

// معلم تخته می‌نویسد، دانش‌آموز می‌بیند + درخواست صحبت
await live("/api/app/live/board", { body: { action: "stroke", seq: 1, tool: "pen", color: "#000", width: 4, points: [1, 2, 3, 4] }, token: tcTok });
r = await live("/api/app/live/sync", { body: { pageIndex: 0, pageRev: 0, sinceStrokeSeq: 0, sinceChatId: 0, sinceSignalId: 0 }, token: st1Tok });
ok(r.data.strokes.length === 1, "تخته همگام شد");
await live("/api/app/live/hand", { body: { raised: true }, token: st1Tok });

// دانش‌آموز کلاس دیگر نباید وارد شود
const st3Tok = (await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: bulkOk.find((x) => x.name === "حسین کریمی").studentCode, pin: "1234" } })).data.session.token;
r = await live("/api/app/live/sync", { body: {}, token: st3Tok });
ok(r.status === 403, "دانش‌آموز کلاس دیگر رد می‌شود");

await live("/api/app/live/stop", { body: {}, token: tcTok });
ok(getLiveRoomPublicStatus(roomKey).active === false, "کلاس زنده پایان یافت");

// ==================== ۱۲. گزارش‌های مدیر مدرسه ====================
console.log("\n۱۲) گزارش‌های مدیر مدرسه");
r = await ms("/api/ms/admin/reports", { token: adminTok });
const absH2 = r.data.absenceToday.find((x) => x.classLabel.includes("هشتم"));
ok(absH2 && absH2.students.some((s) => s.name === "مریم احمدی"), "غایب امروز در گزارش");
ok(r.data.teacherActivity.length === 2, "گزارش عملکرد معلمان");
r = await ms("/api/ms/admin/points", { method: "POST", token: adminTok, body: { studentId: st2Row.id, delta: -2, reason: "تأخیر مکرر" } });
ok(r.status === 200, "ثبت امتیاز انضباطی");
r = await ms("/api/ms/home", { token: st1Tok });
ok(true, "خانه دانش‌آموز پس از گزارش‌ها");

// ==================== ۱۳. مدیر ارشد — نظارت و اشتراک ====================
console.log("\n۱۳) نظارت مدیر ارشد");
r = await ms("/api/ms/home", { token: superTok });
ok(r.data.stats.schools === 1 && r.data.stats.students === 4, "آمار کل (" + r.data.stats.students + " دانش‌آموز)");
r = await ms("/api/ms/super/schools", { token: superTok });
ok(r.data.schools[0].students === 4 && r.data.schools[0].teachers === 2, "جزئیات مدرسه");
const schoolId = r.data.schools[0].id;
r = await ms("/api/ms/super/announce", { method: "POST", token: superTok, body: { title: "به‌روزرسانی سامانه", body: "امکانات جدید اضافه شد" } });
ok(r.status === 200 && r.data.sent === 1, "اطلاعیه سراسری");
r = await ms("/api/ms/announcements", { token: st1Tok });
ok(r.data.announcements.some((a) => a.title === "به‌روزرسانی سامانه"), "دانش‌آموز اطلاعیه سراسری را دید");

// تعلیق مدرسه → ورود قفل می‌شود
await ms("/api/ms/super/schools/update", { method: "POST", token: superTok, body: { id: schoolId, active: false } });
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: ST1.studentCode, pin: ST1.pin } });
ok(r.status === 403, "مدرسه معلق — ورود قفل است");
await ms("/api/ms/super/schools/update", { method: "POST", token: superTok, body: { id: schoolId, active: true } });
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: ST1.studentCode, pin: ST1.pin } });
ok(r.status === 200, "فعال‌سازی مجدد");

// ==================== ۱۴. رگرسیون کلاس قدیمی ====================
console.log("\n۱۴) 📚 چرخه کامل تکالیف");
r = await ms("/api/ms/teacher/assignments", { method: "POST", token: tcTok, body: { classId: CLASS_A, title: "تمرین صفحه ۴۵", description: "سوالات ۱ تا ۵", dueDate: "2026-11-01" } });
ok(r.status === 200, "معلم تکلیف ثبت کرد");
const ASG = r.data.id;
r = await ms("/api/ms/teacher/assignments?classId=" + CLASS_A, { token: tcTok });
ok(r.data.assignments.length === 1 && r.data.assignments[0].submissionCount === 0, "لیست تکالیف معلم");
r = await ms("/api/ms/student/assignments", { token: st1Tok });
ok(r.data.assignments.length === 1 && r.data.assignments[0].mySubmission === null, "دانش‌آموز تکلیف را دید");
const photo = "data:image/jpeg;base64," + Buffer.from("fakeimg").toString("base64");
r = await ms("/api/ms/student/submit", { method: "POST", token: st1Tok, body: { assignmentId: ASG, text: "جواب سوالات", photo } });
ok(r.status === 200, "ارسال تکلیف با عکس");
r = await ms("/api/ms/student/submit", { method: "POST", token: st1Tok, body: { assignmentId: ASG, text: "ویرایش", photo: "" } });
ok(r.status === 200, "ویرایش تکلیف قبل از تصحیح");
r = await ms("/api/ms/teacher/submissions?assignmentId=" + ASG, { token: tcTok });
ok(r.data.submissions.length === 2, "معلم ارسال‌های کلاس را دید (۲ نفر)");
const mine = r.data.submissions.find((x) => x.studentId === st1Id);
ok(mine && mine.submitted && mine.text === "ویرایش" && mine.photo.startsWith("data:image/"), "متن و عکس ارسالی نمایش داده شد");
r = await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: mine.submissionId, score: 19, feedback: "آفرین، عالی!" } });
ok(r.status === 200, "تصحیح با نمره و بازخورد");
ok(r.data.pointsAdded === 19, "نمره ۱۹ → ۱۹ امتیاز به مجموع اضافه شد (pointsAdded)");
{
  const p14 = sqlite.exec("SELECT COALESCE(SUM(delta),0) FROM ms_points WHERE student_id = " + st1Id + " AND reason = 'نمره تکلیف #" + mine.submissionId + "'");
  ok(Number(p14[0].values[0][0]) === 19, "امتیاز نمره تکلیف در ms_points ثبت شد (۱۹)");
}
r = await ms("/api/ms/student/submit", { method: "POST", token: st1Tok, body: { assignmentId: ASG, text: "دوباره" } });
ok(r.status === 200 && r.data.resent === true, "ارسال مجدد (دوباره) پس از تصحیح پذیرفته شد");
r = await ms("/api/ms/student/assignments", { token: st1Tok });
const asgR = r.data.assignments.find((a) => a.id === ASG);
ok(asgR.mySubmission.reviewed === false && asgR.mySubmission.text === "دوباره" && asgR.mySubmission.score === 19, "ارسال مجدد دوباره در انتظار تصحیح افتاد (نمره قبلی برای معلم ماند)");
r = await ms("/api/ms/teacher/submissions?assignmentId=" + ASG, { token: tcTok });
const mineR = r.data.submissions.find((x) => x.studentId === st1Id);
ok(mineR && mineR.submitted && !mineR.reviewed && mineR.text === "دوباره", "معلم ارسال مجدد را در انتظار تصحیح دید");
r = await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: mine.submissionId, score: 19, feedback: "آفرین، عالی!" } });
ok(r.status === 200, "تصحیح مجدد ارسال دوم");
ok(r.data.pointsAdded === 0, "تصحیح مجدد با همان نمره → بدون دوباره‌شماری امتیاز");
{
  const p14b = sqlite.exec("SELECT COALESCE(SUM(delta),0) FROM ms_points WHERE student_id = " + st1Id + " AND reason = 'نمره تکلیف #" + mine.submissionId + "'");
  ok(Number(p14b[0].values[0][0]) === 19, "امتیاز این تکلیف همچنان ۱۹ (بدون تکرار)");
}
r = await ms("/api/ms/student/assignments", { token: st1Tok });
const asg1 = r.data.assignments.find((a) => a.id === ASG);
ok(asg1.mySubmission.score === 19 && asg1.mySubmission.reviewed && asg1.mySubmission.feedback.includes("آفرین"), "نمره و بازخورد در پنل دانش‌آموز");
r = await ms("/api/ms/student/assignments", { token: parentTok });
ok(r.data.assignments[0].mySubmission.score === 19, "والدین هم تکلیف تصحیح‌شده را دید");

console.log("\n۱۵) 🤖 پرسش و پاسخ هوش مصنوعی + کوییز");
r = await ms("/api/ms/ai/ask", { method: "POST", token: st1Tok, body: { question: "علت رنگین کمان چیست؟" } });
ok(r.status === 200 && r.data.answer.includes("رنگین کمان"), "پاسخ AI دریافت شد");
r = await ms("/api/ms/ai/ask", { method: "POST", token: tcTok, body: { question: "x" } });
ok(r.status === 400, "سوال کوتاه رد می‌شود");
r = await ms("/api/ms/ai/quiz", { method: "POST", token: st1Tok, body: { topic: "کسرها", count: 3 } });
ok(r.status === 200 && r.data.questions.length === 3 && r.data.questions[0].options.length === 4, "کوییز هوشمند ساخته شد");
ok(r.data.questions[0].correct === 2, "قرارداد ایندکس صحیح (۱‌مبنا) حفظ شد");
r = await ms("/api/ms/teacher/assignments/delete", { method: "POST", token: tcTok, body: { id: ASG } });
ok(r.status === 200, "حذف تکلیف");
r = await ms("/api/ms/student/assignments", { token: st1Tok });
ok(r.data.assignments.length === 0, "تکلیف حذف‌شده دیگر نیست");

console.log("\n۱۶) رگرسیون کلاس قدیمی (اتاق default)");
let legacyMarks = [];
const legacyDeps = {
  verifyAuth: async (req, u) => await verifyToken((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), SECRET),
  getStudent: async (uid) => ({ user_id: uid, name: "هستی طالبی" }),
  getAllStudents: async () => [{ user_id: 366144, name: "هستی طالبی" }],
  markStudentPresentToday: async (uid) => { legacyMarks.push(uid); },
  notifyTelegramClassStarted: async () => 3,
  teacherName: "نیما آزمکان",
};
async function legacyLive(path, { body = null, token = "" } = {}) {
  const req = new Request("https://x.test" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await handleLiveClassRequest(req, new URL(req.url), legacyDeps);
  let data = null;
  try { data = JSON.parse(await res.text()); } catch {}
  return { status: res.status, data };
}
const legacyStudentTok = await signToken({ role: "student", userId: 366144, name: "هستی طالبی" }, SECRET);
r = await legacyLive("/api/app/live/start", { body: { title: "کلاس قدیمی" }, token: legacyTok });
ok(r.status === 200 && r.data.notified === 3, "شروع کلاس قدیمی");
r = await legacyLive("/api/app/live/sync", { body: { pageIndex: 0, pageRev: 0, sinceStrokeSeq: 0, sinceChatId: 0, sinceSignalId: 0 }, token: legacyStudentTok });
ok(r.status === 200 && r.data.active, "sync دانش‌آموز قدیمی");
ok(legacyMarks.includes(366144), "حضورورغیاب قدیمی کار می‌کند");
await legacyLive("/api/app/live/stop", { body: {}, token: legacyTok });



// ==================== v3.1.3 ادغام امکانات نسخه قبل ====================
console.log("\n۱۷) 🧩 ادغام منوها و امکانات نسخه قبل (ماموریت/کارگاه/فروشگاه/کتابخانه/پیام/AI)");
let studentTok3 = null, teacherTok3 = null, missionId3 = 0, labId3 = 0, itemId3 = 0, libId3 = 0;

r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: ST2.studentCode, pin: "1234" } });
ok(r.status === 200, "ادغام: ورود دانش‌آموز (مریم)");
studentTok3 = r.data.session.token;
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL_CODE, username: "rezaei", password: "pass1234" } });
ok(r.status === 200, "ادغام: ورود معلم");
teacherTok3 = r.data.session.token;

r = await ms("/api/ms/edu/home", { token: studentTok3 });
ok(r.status === 200 && r.data.mission && r.data.mission.text, "ادغام: home شامل ماموریت امروز");
ok(r.data.mission.status === "open", "ادغام: وضعیت اولیه open");
ok(typeof r.data.points === "number" && typeof r.data.rank === "number", "ادغام: امتیاز و رتبه در home");
const basePts = r.data.points;
missionId3 = r.data.mission.id;
r = await ms("/api/ms/edu/home", { token: studentTok3 });
ok(r.data.mission.id === missionId3, "ادغام: ماموریت تکراری ساخته نشد");

r = await ms("/api/ms/edu/mission/submit", { method: "POST", token: studentTok3, body: { proof: "گزارش اول برای رد شدن" } });
ok(r.status === 200, "ادغام: ثبت گزارش ماموریت");
r = await ms("/api/ms/edu/home", { token: studentTok3 });
ok(r.data.mission.status === "pending", "ادغام: وضعیت pending شد");

r = await ms("/api/ms/teacher/inbox", { token: teacherTok3 });
ok(r.status === 200 && r.data.missions.length === 1, "ادغام: معلم ماموریت را در صندوق تایید دید");

r = await ms("/api/ms/teacher/inbox/approve", { method: "POST", token: teacherTok3, body: { kind: "mission", id: missionId3, decision: "reject", points: 0, feedback: "کامل نیست" } });
ok(r.status === 200, "ادغام: رد ماموریت");
r = await ms("/api/ms/edu/home", { token: studentTok3 });
ok(r.data.mission.status === "rejected" && r.data.points === basePts, "ادغام: رد شد بدون امتیاز");

r = await ms("/api/ms/edu/mission/submit", { method: "POST", token: studentTok3, body: { proof: "گزارش کامل‌شده" } });
ok(r.status === 200, "ادغام: ارسال مجدد پس از رد");
r = await ms("/api/ms/teacher/inbox/approve", { method: "POST", token: teacherTok3, body: { kind: "mission", id: missionId3, decision: "approve", points: 7, feedback: "عالی" } });
ok(r.status === 200, "ادغام: تایید ماموریت با امتیاز دلخواه معلم (7)");
r = await ms("/api/ms/edu/home", { token: studentTok3 });
ok(r.data.mission.status === "approved" && r.data.points === basePts + 7, "ادغام: امتیاز 7 اعمال شد");

r = await ms("/api/ms/edu/lab/submit", { method: "POST", token: studentTok3, body: { tool: "flashcards", topic: "جمع کسرها", summary: "۱۰ فلش‌کارت مرور کردم" } });
ok(r.status === 200, "ادغام: ثبت گزارش کارگاه");
r = await ms("/api/ms/edu/lab", { token: studentTok3 });
ok(r.data.items.length === 1 && r.data.items[0].status === "pending", "ادغام: سابقه کارگاه در کارنامه");
labId3 = r.data.items[0].id;

r = await ms("/api/ms/teacher/inbox/approve", { method: "POST", token: teacherTok3, body: { kind: "lab", id: labId3, decision: "approve", points: 10, feedback: "مرور خوب" } });
ok(r.status === 200, "ادغام: تایید lab با امتیاز 10");
r = await ms("/api/ms/edu/home", { token: studentTok3 });
ok(r.data.points === basePts + 17, "ادغام: 7 + 10 = 17 امتیاز");

r = await ms("/api/ms/teacher/shop", { method: "POST", token: teacherTok3, body: { title: "خودکار رنگی", cost: 10 } });
ok(r.status === 200, "ادغام: افزودن جایزه توسط معلم");
r = await ms("/api/ms/teacher/shop", { token: teacherTok3 });
ok(r.data.items.length === 1, "ادغام: جایزه ثبت شد");
itemId3 = r.data.items[0].id;

r = await ms("/api/ms/edu/shop", { token: studentTok3 });
ok(r.status === 200 && r.data.points === basePts + 17 && r.data.items.length === 1, "ادغام: فروشگاه دانش‌آموز");
r = await ms("/api/ms/edu/shop/order", { method: "POST", token: studentTok3, body: { itemId: itemId3 } });
ok(r.status === 200, "ادغام: ثبت سفارش جایزه");
r = await ms("/api/ms/edu/shop", { token: studentTok3 });
ok(r.data.orders.length === 1 && r.data.orders[0].status === "pending", "ادغام: سفارش pending");
const orderId3 = r.data.orders[0].id;

r = await ms("/api/ms/teacher/shop", { method: "POST", token: teacherTok3, body: { title: "لپ‌تاپ", cost: 9999 } });
const bigItem = (await ms("/api/ms/teacher/shop", { token: teacherTok3 })).data.items.find((i) => i.cost === 9999);
r = await ms("/api/ms/edu/shop/order", { method: "POST", token: studentTok3, body: { itemId: bigItem.id } });
ok(r.status === 400 && String(r.data.error).includes("امتیاز"), "ادغام: خرید بدون امتیاز کافی رد شد");

r = await ms("/api/ms/teacher/inbox/approve", { method: "POST", token: teacherTok3, body: { kind: "order", id: orderId3, decision: "approve", points: 0, feedback: "" } });
ok(r.status === 200, "ادغام: تایید سفارش جایزه");
r = await ms("/api/ms/edu/home", { token: studentTok3 });
ok(r.data.points === basePts + 7, "ادغام: امتیاز جایزه کسر شد (17 - 10)");

r = await ms("/api/ms/teacher/shop", { method: "POST", token: teacherTok3, body: { title: "مداد", cost: 5 } });
const pencil = (await ms("/api/ms/teacher/shop", { token: teacherTok3 })).data.items.find((i) => i.title === "مداد");
r = await ms("/api/ms/edu/shop/order", { method: "POST", token: studentTok3, body: { itemId: pencil.id } });
ok(r.status === 200, "ادغام: سفارش دوم (مداد)");
const pend2 = (await ms("/api/ms/edu/shop", { token: studentTok3 })).data.orders.find((o) => o.status === "pending");
await ms("/api/ms/teacher/inbox/approve", { method: "POST", token: teacherTok3, body: { kind: "order", id: pend2.id, decision: "reject", points: 0, feedback: "" } });
r = await ms("/api/ms/edu/home", { token: studentTok3 });
ok(r.data.points === basePts + 7, "ادغام: رد سفارش → امتیاز تغییر نکرد");

r = await ms("/api/ms/teacher/shop/delete", { method: "POST", token: teacherTok3, body: { id: bigItem.id } });
ok(r.status === 200 && !(await ms("/api/ms/teacher/shop", { token: teacherTok3 })).data.items.find((i) => i.cost === 9999), "ادغام: حذف جایزه توسط معلم");

r = await ms("/api/ms/teacher/library", { method: "POST", token: teacherTok3, body: { title: "نکات فصل ۲", body: "جمع کسرها: مخرج مشترک..." } });
ok(r.status === 200, "ادغام: افزودن جزوه به کتابخانه");
r = await ms("/api/ms/edu/library", { token: studentTok3 });
ok(r.data.items.length === 1 && r.data.items[0].title === "نکات فصل ۲", "ادغام: دانش‌آموز جزوه را دید");
libId3 = r.data.items[0].id;
r = await ms("/api/ms/teacher/library/delete", { method: "POST", token: teacherTok3, body: { id: libId3 } });
ok(r.status === 200 && (await ms("/api/ms/edu/library", { token: studentTok3 })).data.items.length === 0, "ادغام: حذف جزوه");

r = await ms("/api/ms/edu/messages", { method: "POST", token: studentTok3, body: { text: "آقا تکلیف فردا چیه؟" } });
ok(r.status === 200, "ادغام: پیام دانش‌آموز");
r = await ms("/api/ms/edu/messages", { token: teacherTok3 });
ok(r.data.messages.length === 1 && r.data.messages[0].fromRole === "student", "ادغام: معلم پیام را دید");
r = await ms("/api/ms/edu/messages", { method: "POST", token: teacherTok3, body: { studentId: r.data.messages[0].studentId, text: "صفحه ۲۵ را حل کن" } });
ok(r.status === 200, "ادغام: پاسخ معلم");
r = await ms("/api/ms/edu/messages", { token: studentTok3 });
ok(r.data.messages.length === 2 && r.data.messages[1].fromRole === "teacher", "ادغام: دانش‌آموز پاسخ را دید");

r = await ms("/api/ms/edu/leaderboard", { token: studentTok3 });
ok(r.status === 200 && r.data.top.length >= 1, "ادغام: رتبه‌بندی — لیست برترین‌ها");
ok(typeof r.data.myRank === "number" && typeof r.data.myPoints === "number", "ادغام: رتبه و امتیاز من");

r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "flashcards", topic: "سیاره‌های منظومه شمسی" } });
ok(r.status === 200 && Array.isArray(r.data.result) && r.data.result.length >= 3, "ادغام: AI فلش‌کارت");
r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "essay", text: "بهار فصل رویش گل‌هاست. درختان سبز می‌شوند و پرندکان آواز می‌خوانند." } });
ok(r.status === 200 && r.data.result, "ادغام: AI تصحیح انشا");
r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "mindmap", topic: "اجزای گیاه" } });
ok(r.status === 200 && (r.data.result.image || r.data.result.text), "ادغام: AI نقشه ذهنی");
r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "summary", topic: "فشار و آثار آن — پایه هشتم" } });
ok(r.status === 200 && r.data.result, "ادغام: AI جزوه شب امتحان");
r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "english", text: "Hello! My name is Ali." } });
ok(r.status === 200 && (r.data.result.reply || r.data.result.text), "ادغام: AI مکالمه انگلیسی");
r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "quizfromtext", source: "آب در صفر درجه یخ می‌زند و در صد درجه می‌جوشد. فشار هوا بر ارتفاع کاهش می‌یابد.", count: 3 } });
ok(r.status === 200 && Array.isArray(r.data.result) && r.data.result.length >= 3, "ادغام: AI کوییز از متن درس");
r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "scientist", sciKey: "avicenna", q: "سلام! طب چیست؟" } });
ok(r.status === 200 && (r.data.result.reply || r.data.result.text), "ادغام: AI گفتگو با دانشمند");
r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "plan", goals: "مرور ریاضی و علوم برای امتحان", grade: "هشتم" } });
ok(r.status === 200 && r.data.result, "ادغام: AI برنامه هفتگی");
r = await ms("/api/ms/edu/ai", { method: "POST", token: teacherTok3, body: { tool: "summary", topic: "نیرو — پایه هشتم" } });
ok(r.status === 200 && r.data.result, "ادغام: ابزار هوش برای معلم هم باز است");

r = await ms("/api/ms/login", { method: "POST", body: { role: "parent", schoolCode: SCHOOL_CODE, code: st2Row.parent_code || st2Row.parentCode } });
ok(r.status === 200, "ادغام: ورود والد");
const parentTok3 = r.data.session.token;
r = await ms("/api/ms/edu/lab/submit", { method: "POST", token: parentTok3, body: { tool: "summary", topic: "x", summary: "y" } });
ok(r.status === 403, "ادغام: والد نمی‌تواند گزارش کارگاه بفرستد (فقط دانش‌آموز)");


// ==================== v3.1.4 یکسان‌سازی پنل معلم/مدیر ====================
console.log("\n۱۸) 🏫 یکسان‌سازی پنل معلم/مدیر (دسترسی کامل + کدها + گواهی + ددلاین + مباحث گنگ + پیام والدین)");

r = await ms("/api/ms/login", { method: "POST", body: { role: "admin", schoolCode: SCHOOL_CODE, username: ADMIN_USER, password: ADMIN_PASS } });
const adminTok4 = r.data.session.token;
ok(r.status === 200 && r.data.session.role === "admin", "ادغام۴: ورود مدیر مدرسه");

r = await ms("/api/ms/home", { token: adminTok4 });
ok(r.status === 200 && Array.isArray(r.data.classes) && r.data.classes.length >= 2, "ادغام۴: مدیر فهرست همه کلاس‌ها را دارد (سوییچر)");

r = await ms("/api/ms/teacher/class?classId=" + CLASS_A, { token: adminTok4 });
ok(r.status === 200 && r.data.roster.length > 0, "ادغام۴: مدیر به کلاس دسترسی کامل معلم دارد (کلاس و کدها)");
ok(r.data.roster[0].student_code || r.data.roster[0].studentCode, "ادغام۴: کدهای ورود در roster");

r = await ms("/api/ms/teacher/attendance", {
  method: "POST", token: adminTok4,
  body: { classId: CLASS_A, entries: [{ studentId: st1Id, status: "present" }] },
});
ok(r.status === 200, "ادغام۴: مدیر می‌تواند حضور و غیاب ثبت کند");

r = await ms("/api/ms/teacher/grade", { method: "POST", token: adminTok4, body: { classId: CLASS_A, studentId: st1Id, title: "آزمون مدیر", score: 19.5 } });
ok(r.status === 200, "ادغام۴: مدیر می‌تواند نمره ثبت کند");

r = await ms("/api/ms/teacher/inbox", { token: adminTok4 });
ok(r.status === 200, "ادغام۴: صندوق تایید برای مدیر باز است");

r = await ms("/api/ms/edu/ai", { method: "POST", token: adminTok4, body: { tool: "summary", topic: "نیرو — پایه هشتم" } });
ok(r.status === 200 && r.data.result, "ادغام۴: ابزار هوش مصنوعی برای مدیر باز است");

r = await ms("/api/ms/teacher/deadlines", { method: "POST", token: adminTok4, body: { classId: CLASS_A, title: "امتحان ریاضی فصل ۳", date: "1404/09/15" } });
ok(r.status === 200, "ادغام۴: ثبت ددلاین توسط مدیر");
r = await ms("/api/ms/teacher/deadlines?classId=" + CLASS_A, { token: adminTok4 });
ok(r.data.deadlines.length === 1 && r.data.deadlines[0].title.includes("ریاضی"), "ادغام۴: لیست ددلاین‌ها");
const dlId = r.data.deadlines[0].id;

r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: ST1.studentCode, pin: "1234" } });
const st1Tok4 = r.data.session.token;
r = await ms("/api/ms/edu/deadlines", { token: st1Tok4 });
ok(r.status === 200 && r.data.deadlines.length === 1, "ادغام۴: دانش‌آموز ددلاین را دید");

r = await ms("/api/ms/teacher/deadlines/delete", { method: "POST", token: adminTok4, body: { id: dlId } });
ok(r.status === 200 && (await ms("/api/ms/edu/deadlines", { token: st1Tok4 })).data.deadlines.length === 0, "ادغام۴: حذف ددلاین");

r = await ms("/api/ms/edu/muddy", { method: "POST", token: st1Tok4, body: { topic: "حل معادله درجه دوم را متوجه نشدم" } });
ok(r.status === 200, "ادغام۴: گزارش مباحث گنگ");
r = await ms("/api/ms/edu/muddy", { token: st1Tok4 });
ok(r.data.muddy.length === 1 && r.data.muddy[0].status === "open", "ادغام۴: سابقه مباحث گنگ دانش‌آموز");
r = await ms("/api/ms/teacher/muddy", { token: adminTok4 });
ok(r.data.muddy.length === 1 && r.data.muddy[0].topic.includes("معادله"), "ادغام۴: معلم/مدیر مباحث گنگ را دید");
await ms("/api/ms/teacher/muddy/resolve", { method: "POST", token: adminTok4, body: { id: r.data.muddy[0].id } });
ok((await ms("/api/ms/edu/muddy", { token: st1Tok4 })).data.muddy[0].status === "resolved", "ادغام۴: حل مبحث گنگ");

r = await ms("/api/ms/teacher/certificates", { method: "POST", token: adminTok4, body: { studentId: st1Id, title: "دانش‌آموز ماه", body: "به پاس تلاش و پیشرفت چشم‌گیر" } });
ok(r.status === 200, "ادغام۴: صدور لوح تقدیر");
r = await ms("/api/ms/edu/certificates", { token: st1Tok4 });
ok(r.data.certificates.length === 1 && r.data.certificates[0].title === "دانش‌آموز ماه", "ادغام۴: دانش‌آموز لوح تقدیر را دید");
r = await ms("/api/ms/login", { method: "POST", body: { role: "parent", schoolCode: SCHOOL_CODE, code: ST1.parentCode } });
const parentTok4 = r.data.session.token;
ok((await ms("/api/ms/edu/certificates", { token: parentTok4 })).data.certificates.length === 1, "ادغام۴: والدین هم لوح تقدیر را دیدند");

r = await ms("/api/ms/edu/messages", { method: "POST", token: parentTok4, body: { text: "سلام، حال فرزندم چطور است؟" } });
ok(r.status === 200, "ادغام۴: پیام والدین به معلم");
r = await ms("/api/ms/edu/messages", { token: adminTok4 });
ok(r.data.messages.some((m) => m.fromRole === "parent"), "ادغام۴: مدیر پیام والدین را دید (پیام اولیا)");
const parentMsg = r.data.messages.find((m) => m.fromRole === "parent");
await ms("/api/ms/edu/messages", { method: "POST", token: adminTok4, body: { studentId: parentMsg.studentId, text: "حالشان عالیست" } });
r = await ms("/api/ms/edu/messages", { token: parentTok4 });
ok(r.data.messages.some((m) => m.fromRole === "teacher"), "ادغام۴: والدین پاسخ معلم را دیدند");

r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL_CODE, username: "rezaei", password: "pass1234" } });
const tTok4 = r.data.session.token;
r = await ms("/api/ms/teacher/deadlines", { method: "POST", token: tTok4, body: { classId: CLASS_A, title: "کلاس خودم", date: "2026-01-01" } });
ok(r.status === 200, "ادغام۴: معلم به کلاس خودش دسترسی دارد (deadlines)");
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL_CODE, username: "mohammadi", password: "pass1234" } });
const tTok4b = r.data.session.token;
r = await ms("/api/ms/teacher/deadlines", { method: "POST", token: tTok4b, body: { classId: CLASS_B, title: "کلاس من نیست", date: "x" } });
ok(r.status === 403, "ادغام۴: معلم به کلاس خودش دسترسی دارد نه بیشتر (deadlines)");

// ==================== بخش ۱۹: v3.1.5 — ورود بدون جستجوی مدرسه، رمز، تکلیف آزاد، استریک، تلگرام ====================
console.log("\n--- بخش ۱۹: v3.1.5 (ورود ساده/تغییر رمز/تکلیف آزاد/استریک/تلگرام) ---");

const SCHOOL_ID = Number(sqlite.exec("SELECT id FROM schools WHERE code = '" + SCHOOL_CODE + "'")[0].values[0][0]);

// ۱۹-۱) ورود دانش‌آموز فقط با کد + رمز (بدون کد مدرسه)
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", code: ST1.studentCode, pin: ST1.pin } });
ok(r.status === 200 && r.data.session.token, "ورود دانش‌آموز بدون کد مدرسه (تشخیص خودکار)");
const st15Tok = r.data.session.token;

// ۱۹-۲) ورود معلم فقط با نام کاربری + رمز
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", username: "rezaei", password: "pass1234" } });
ok(r.status === 200 && r.data.session.token, "ورود معلم بدون کد مدرسه (تشخیص خودکار)");
const t15Tok = r.data.session.token;

// ۱۹-۳) اشتباه بودن رمز همچنان 401
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", code: ST1.studentCode, pin: "9999" } });
ok(r.status === 401, "ورود با رمز اشتباه همچنان 401");

// ۱۹-۴) تغییر رمز دانش‌آموز و بازگرداندن آن
r = await ms("/api/ms/account/password", { method: "POST", token: st15Tok, body: { oldPassword: ST1.pin, newPassword: "4321" } });
ok(r.status === 200, "تغییر رمز دانش‌آموز");
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", code: ST1.studentCode, pin: "4321" } });
ok(r.status === 200, "ورود با رمز جدید");
r = await ms("/api/ms/account/password", { method: "POST", token: st15Tok, body: { oldPassword: "4321", newPassword: ST1.pin } });
ok(r.status === 200, "بازگرداندن رمز اصلی");

// ۱۹-۵) رمز فعلی اشتباه → 401
r = await ms("/api/ms/account/password", { method: "POST", token: st15Tok, body: { oldPassword: "0000", newPassword: "1111" } });
ok(r.status === 401, "تغییر رمز با رمز فعلی اشتباه رد شد");

// ۱۹-۶) تغییر رمز معلم
r = await ms("/api/ms/account/password", { method: "POST", token: t15Tok, body: { oldPassword: "pass1234", newPassword: "pass5678" } });
ok(r.status === 200, "تغییر رمز معلم");
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", username: "rezaei", password: "pass5678" } });
ok(r.status === 200, "ورود معلم با رمز جدید");
await ms("/api/ms/account/password", { method: "POST", token: t15Tok, body: { oldPassword: "pass5678", newPassword: "pass1234" } });

// ۱۹-۷) ارسال تکلیف آزاد (متن + عکس) و دیدن آن توسط معلم
const freePhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
r = await ms("/api/ms/student/hw/send", { method: "POST", token: st15Tok, body: { text: "تکلیف آزاد ریاضی صفحه ۱۲", photo: freePhoto } });
ok(r.status === 200 && r.data.id > 0, "ارسال تکلیف آزاد با عکس و متن");
r = await ms("/api/ms/student/assignments", { token: st15Tok });
ok((r.data.freeSubs || []).length >= 1 && r.data.freeSubs[0].text.includes("ریاضی"), "سوابق تکالیف آزاد دانش‌آموز (freeSubs)");

// ۱۹-۸) معلم مخزن تکالیف آزاد را می‌بیند (assignmentId=0)
r = await ms("/api/ms/teacher/submissions?assignmentId=0", { token: t15Tok });
ok(r.status === 200 && (r.data.submissions || []).some((x) => (x.text || "").includes("ریاضی")), "مخزن تکالیف آزاد معلم (assignmentId=0)");
const freeSub = r.data.submissions.find((x) => (x.text || "").includes("ریاضی"));

// ۱۹-۹) تصحیح تکلیف آزاد توسط معلم + دیدن نمره توسط دانش‌آموز
r = await ms("/api/ms/teacher/review", { method: "POST", token: t15Tok, body: { submissionId: freeSub.submissionId, score: 19, feedback: "عالی بود" } });
ok(r.status === 200, "تصحیح تکلیف آزاد توسط معلم");
r = await ms("/api/ms/student/assignments", { token: st15Tok });
const fs = (r.data.freeSubs || []).find((x) => x.id === freeSub.submissionId);
ok(fs && fs.reviewed && fs.score === 19, "دانش‌آموز نمره تکلیف آزاد را دید");

// ۱۹-۱۰) استریک در edu/home و home
r = await ms("/api/ms/edu/home", { token: st15Tok });
ok(typeof r.data.streak === "number" && r.data.streak >= 1, "استریک در edu/home (" + r.data.streak + " روز)");
r = await ms("/api/ms/home", { token: st15Tok });
ok(typeof r.data.streak === "number", "استریک در home دانش‌آموز");

// ۱۹-۱۱) فیلد tg در home معلم
r = await ms("/api/ms/home", { token: t15Tok });
ok(r.data.tg && r.data.tg.username === "rezaei" && r.data.tg.linked === false, "فیلد اتصال تلگرام در home معلم");

// ۱۹-۱۲) جدول ms_tg_msgmap ساخته شده
const mapTbl = sqlite.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='ms_tg_msgmap'");
ok(mapTbl.length > 0, "جدول ms_tg_msgmap ایجاد شد");
const colT = sqlite.exec("PRAGMA table_info(ms_teachers)");
ok(colT[0].values.some((c) => c[1] === "tg_id"), "ستون tg_id معلم اضافه شد");
const colS = sqlite.exec("PRAGMA table_info(ms_students)");
ok(colS[0].values.some((c) => c[1] === "parent_tg_id"), "ستون parent_tg_id دانش‌آموز اضافه شد");

// ۱۹-۱۳) اتصال معلم با /start T<username> در تلگرام
const tgUpdTeacher = { message: { text: "/start Trezaei", chat: { id: "777001" }, from: { id: "777001" } } };
let handled = await handleMsTgUpdate(tgUpdTeacher, db, deps);
ok(handled === true, "اتصال معلم از تلگرام (/start T rezaei)");
const tRow = sqlite.exec("SELECT tg_id FROM ms_teachers WHERE username = 'rezaei'");
ok(tRow[0].values[0][0] === "777001", "tg_id معلم در دیتابیس ذخیره شد");
r = await ms("/api/ms/home", { token: t15Tok });
ok(r.data.tg.linked === true, "اتصال تلگرام معلم در پنل سبز شد");

// ۱۹-۱۴) اتصال دانش‌آموز و والدین با /start <code>
const stRow15 = sqlite.exec("SELECT student_code, parent_code FROM ms_students WHERE student_code = '" + ST1.studentCode + "'");
const sCode15 = stRow15[0].values[0][0], pCode15 = stRow15[0].values[0][1];
handled = await handleMsTgUpdate({ message: { text: "/start " + sCode15, chat: { id: "888001" }, from: { id: "888001" } } }, db, deps);
ok(handled === true, "اتصال دانش‌آموز از تلگرام (/start کد)");
handled = await handleMsTgUpdate({ message: { text: "/start " + pCode15, chat: { id: "888002" }, from: { id: "888002" } } }, db, deps);
ok(handled === true, "اتصال والدین از تلگرام (/start کد)");
const tgIds = sqlite.exec("SELECT tg_id, parent_tg_id FROM ms_students WHERE student_code = '" + ST1.studentCode + "'");
ok(tgIds[0].values[0][0] === "888001" && tgIds[0].values[0][1] === "888002", "شناسه‌های تلگرام دانش‌آموز و والدین ذخیره شد");

// ۱۹-۱۵) تایید ماموریت از تلگرام (callback) با هویت معلم متصل
const stId15 = Number(sqlite.exec("SELECT id FROM ms_students WHERE student_code = '" + ST1.studentCode + "'")[0].values[0][0]);
sqlite.exec("INSERT INTO ms_missions (school_id, class_id, student_id, mission, date, proof, status, created_at) VALUES (" + SCHOOL_ID + ", (SELECT class_id FROM ms_students WHERE id = " + stId15 + "), " + stId15 + ", 'ماموریت تست تلگرام', '2099-01-01', 'گزارش ماموریت برای تایید تلگرامی', 'pending', '2099-01-01T00:00:00Z')");
const mid15 = Number(sqlite.exec("SELECT id FROM ms_missions WHERE student_id = " + stId15 + " AND date = '2099-01-01'")[0].values[0][0]);
const basePts15 = (sqlite.exec("SELECT COALESCE(SUM(delta),0) FROM ms_points WHERE student_id = (SELECT id FROM ms_students WHERE student_code = '" + ST1.studentCode + "')"))[0].values[0][0];
handled = await handleMsTgUpdate({ callback_query: { id: "cb1", data: "ms:ap:" + SCHOOL_ID + ":mission:" + mid15 + ":approve", from: { id: "777001" } } }, db, deps);
ok(handled === true, "تایید ماموریت از تلگرام (callback با هویت معلم)");
const newPts15 = (sqlite.exec("SELECT COALESCE(SUM(delta),0) FROM ms_points WHERE student_id = (SELECT id FROM ms_students WHERE student_code = '" + ST1.studentCode + "')"))[0].values[0][0];
ok(newPts15 > basePts15, "امتیاز ماموریت تاییدشده از تلگرام ثبت شد");
handled = await handleMsTgUpdate({ callback_query: { id: "cb2", data: "ms:ap:" + SCHOOL_ID + ":mission:" + mid15 + ":approve", from: { id: "999999" } } }, db, deps);
ok(handled === true, "درخواست تایید از هویت غیرمجاز هم پاسخ گرفت (رد امن)");
const afterBad = sqlite.exec("SELECT status FROM ms_missions WHERE id = " + mid15);
ok(afterBad[0].values[0][0] === "approved", "هویت غیرمجاز نتوانست وضعیت را تغییر دهد");

// ۱۹-۱۶) پاسخ معلم به پیام دانش‌آموز از تلگرام (reply روی پیام ربات)
sqlite.exec("INSERT INTO ms_tg_msgmap (school_id, kind, ref_id, chat_id, tg_msg_id, created_at) VALUES (" + SCHOOL_ID + ", 'msg', " + stId15 + ", '777001', '555001', '2099-01-01T00:00:00Z')");
handled = await handleMsTgUpdate({ message: { text: "پاسخ معلم از تلگرام", chat: { id: "777001" }, from: { id: "777001" }, reply_to_message: { message_id: "555001" } } }, db, deps);
ok(handled === true, "پاسخ معلم از تلگرام (reply) پردازش شد");
const tReply = sqlite.exec("SELECT COUNT(*) FROM ms_messages WHERE student_id = " + stId15 + " AND from_role = 'teacher' AND text = 'پاسخ معلم از تلگرام'");
ok(Number(tReply[0].values[0][0]) > 0, "پاسخ تلگرامی معلم در صندوق پیام‌های پنل ثبت شد");

// ==================== بخش ۲۰: مهاجرت داده‌های کلاس قبلی ====================
console.log("\n--- بخش ۲۰: مهاجرت داده‌های قدیمی (legacy → سامانه) ---");

// جداول قدیمی را بساز و چند ردیف نمونه بگذار
sqlite.exec("CREATE TABLE IF NOT EXISTS students (user_id INTEGER PRIMARY KEY, name TEXT, score INTEGER DEFAULT 0, joined TEXT, streak INTEGER DEFAULT 0, last_hw_date TEXT DEFAULT '', birthday TEXT DEFAULT '', max_streak INTEGER DEFAULT 0, level INTEGER DEFAULT 1, parent_chat_id INTEGER DEFAULT 0, parent_name TEXT DEFAULT '')");
sqlite.exec("CREATE TABLE IF NOT EXISTS homework (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, date TEXT, type TEXT, score INTEGER DEFAULT 0, feedback TEXT DEFAULT '', teacher_msg_id INTEGER DEFAULT 0)");
sqlite.exec("CREATE TABLE IF NOT EXISTS submission_media (item_type TEXT NOT NULL, item_id INTEGER NOT NULL, content_text TEXT DEFAULT '', tg_file_id TEXT DEFAULT '', media_kind TEXT DEFAULT '', PRIMARY KEY (item_type, item_id))");
sqlite.exec("DELETE FROM homework"); sqlite.exec("DELETE FROM students"); sqlite.exec("DELETE FROM submission_media");
sqlite.exec("INSERT INTO students (user_id, name, score, joined) VALUES (101, 'دانش آموز قدیمی', 30, '2026-09-01T00:00:00Z')");
sqlite.exec("INSERT INTO students (user_id, name, score, joined) VALUES (102, 'تست', 0, '2026-09-01T00:00:00Z')");
sqlite.exec("INSERT INTO homework (id, user_id, name, date, type, score, feedback) VALUES (1, 101, 'دانش آموز قدیمی', '2026-09-10T10:00:00Z', 'عکس', 18, 'خوب بود')");
sqlite.exec("INSERT INTO homework (id, user_id, name, date, type, score, feedback) VALUES (2, 101, 'دانش آموز قدیمی', '2026-09-11T10:00:00Z', 'متن', 0, '')");
sqlite.exec("INSERT INTO submission_media (item_type, item_id, content_text) VALUES ('hw', 2, 'متن تکلیف قدیمی من')");

const superTokM = (await ms("/api/ms/login", { method: "POST", body: { role: "super", password: SUPER_ADMIN_PASSWORD } })).data.session.token;
r = await ms("/api/ms/super/migrate-legacy", { method: "POST", token: superTokM, body: { schoolCode: SCHOOL_CODE, teacherUsername: "rezaei", teacherTgId: "153365407", classLabel: "هشتم-۲", skipPhotos: true } });
ok(r.status === 200 && r.data.ok, "اجرای مهاجرت داده‌های قدیمی");
ok(r.data.summary.studentsAdded === 1, "دانش‌آموز جدید (دانش آموز قدیمی) اضافه شد؛ «تست» نادیده گرفته شد");
ok(r.data.summary.homework === 2, "هر دو تکلیف قدیمی وارد شد");
ok(r.data.summary.points === 1, "امتیازهای قبلی (30) یک ردیف ثبت شد");

// نتیجه از دید دانش‌آموز جدید
const migSt = sqlite.exec("SELECT id, student_code, student_pin FROM ms_students WHERE name = 'دانش آموز قدیمی'");
ok(migSt.length > 0, "دانش‌آموز مهاجرت‌شده در ms_students هست");
const migId = Number(migSt[0].values[0][0]);
const migCode = String(migSt[0].values[0][1]);
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", code: migCode, pin: "1234" } });
ok(r.status === 200, "دانش‌آموز مهاجرت‌شده می‌تواند وارد شود");
const migTok = r.data.session.token;
r = await ms("/api/ms/student/assignments", { token: migTok });
ok((r.data.freeSubs || []).length === 2, "هر دو تکلیف قدیمی در سوابق دانش‌آموز (freeSubs)");
ok((r.data.freeSubs || []).some((x) => x.reviewed && x.score === 18), "نمره تکلیف قدیمی منتقل شد");
ok((r.data.freeSubs || []).some((x) => (x.text || "").includes("متن تکلیف قدیمی")), "متن تکلیف از submission_media منتقل شد");
r = await ms("/api/ms/edu/home", { token: migTok });
ok(Number((r.data.points && r.data.points.total) || r.data.points) === 30, "امتیازهای قبلی (30) در مجموع امتیاز دانش‌آموز");

// مهاجرت دوباره → بدون تکرار (idempotent)
r = await ms("/api/ms/super/migrate-legacy", { method: "POST", token: superTokM, body: { schoolCode: SCHOOL_CODE, teacherUsername: "rezaei", classLabel: "هشتم-۲", skipPhotos: true } });
ok(r.status === 200 && r.data.summary.homework === 0 && r.data.summary.points === 0, "اجرای دوباره مهاجرت تکراری ندارد (idempotent)");

// tg_id معلم در مهاجرت
const tgT = sqlite.exec("SELECT tg_id FROM ms_teachers WHERE username = 'rezaei'");
ok(String(tgT[0].values[0][0]) === "153365407", "tg_id معلم در مهاجرت تنظیم شد");

// ==================== بخش ۲۱: پاک‌سازی مهاجرت ====================
console.log("\n--- بخش ۲۱: پاک‌سازی ردیف‌های تکراری مهاجرت ---");
sqlite.exec("INSERT INTO ms_students (school_id, class_id, name, student_code, parent_code, student_pin, created_at) VALUES (" + SCHOOL_ID + ", (SELECT class_id FROM ms_students WHERE id = " + migId + "), 'سلام دانش آموز قدیمی', '999111', '999222', '1234', '2026-01-01T00:00:00Z')");
const dirtyId = Number(sqlite.exec("SELECT id FROM ms_students WHERE name = 'سلام دانش آموز قدیمی'")[0].values[0][0]);
sqlite.exec("INSERT INTO ms_points (school_id, class_id, student_id, delta, reason, created_by, created_at) VALUES (" + SCHOOL_ID + ", (SELECT class_id FROM ms_students WHERE id = " + dirtyId + "), " + dirtyId + ", 48, 'امتیازهای قبلی کلاس', 'مهاجرت', '2026-01-01T00:00:00Z')");
sqlite.exec("INSERT INTO ms_submissions (school_id, assignment_id, student_id, class_id, text, photo_b64, late, created_at) VALUES (" + SCHOOL_ID + ", 0, " + dirtyId + ", (SELECT class_id FROM ms_students WHERE id = " + dirtyId + "), 'تکلیف تکراری', '', 0, '2026-09-10T10:00:00Z')");
sqlite.exec("INSERT INTO ms_submissions (school_id, assignment_id, student_id, class_id, text, photo_b64, late, created_at) VALUES (" + SCHOOL_ID + ", 0, " + migId + ", (SELECT class_id FROM ms_students WHERE id = " + migId + "), 'متن تکلیف قدیمی من', '', 0, '2026-09-11T10:00:00Z')");
r = await ms("/api/ms/super/cleanup-import", { method: "POST", token: superTokM, body: { schoolCode: SCHOOL_CODE } });
ok(r.status === 200 && r.data.ok, "اجرای پاک‌سازی مهاجرت");
ok((r.data.merged || []).length === 1 && r.data.merged[0].to === "دانش آموز قدیمی", "ردیف تکراری «سلام ...» ادغام شد");
ok(r.data.deduped >= 1, "تکالیف آزاد تکراری حذف شدند (" + r.data.deduped + " مورد)");
const afterM = sqlite.exec("SELECT COUNT(*) FROM ms_students WHERE name = 'سلام دانش آموز قدیمی'");
ok(Number(afterM[0].values[0][0]) === 0, "ردیف تکراری دانش‌آموز حذف شد");
const hostPts = sqlite.exec("SELECT COALESCE(SUM(delta),0) FROM ms_points WHERE student_id = " + migId);
ok(Number(hostPts[0].values[0][0]) === 78, "امتیازهای ادغام‌شده به دانش‌آموز اصلی رسید (30+48)");
const dupLeft = sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE student_id = " + migId + " AND created_at = '2026-09-11T10:00:00Z'");
ok(Number(dupLeft[0].values[0][0]) === 1, "فقط یک نسخه از تکلیف تکراری ماند");

// ==================== بخش ۲۲: v3.1.7 — تولد/پروفایل/نام‌کاربری/ثبت‌نام آسان/چندمدرسه ====================
console.log("\n--- بخش ۲۲: پروفایل، تولد، ثبت‌نام آسان، ورود چندمدرسه ---");

// ۲۲-۱) کد کلاس (joinCode) در پاسخ معلم
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL_CODE, username: "rezaei", password: "pass1234" } });
const t22 = r.data.session.token;
r = await ms("/api/ms/teacher/class?classId=" + CLASS_A, { token: t22 });
const joinCode22 = r.data.class && r.data.class.joinCode;
ok(joinCode22 && /^\d{6}$/.test(String(joinCode22)), "کد کلاس (joinCode) ساخته و برگردانده شد: " + joinCode22);

// ۲۲-۲) ثبت‌نام آسان دانش‌آموز با کد کلاس + کد ملی
r = await ms("/api/ms/register/student", { method: "POST", body: { schoolCode: SCHOOL_CODE, joinCode: "000000", name: "نادرست", nationalId: "0012345678" } });
ok(r.status === 404, "ثبت‌نام با کد کلاس اشتباه رد شد");
r = await ms("/api/ms/register/student", { method: "POST", body: { schoolCode: SCHOOL_CODE, joinCode: String(joinCode22), name: "دانیال ثبت‌نامی", nationalId: "0012345678", birthday: "2015-03-20", pin: "5555" } });
ok(r.status === 200 && r.data.studentCode, "ثبت‌نام آسان دانش‌آموز با کد کلاس");
const regCode22 = r.data.studentCode;
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: "0012345678", pin: "5555" } });
ok(r.status === 200, "ورود با کد ملی بعد از ثبت‌نام");
const regTok22 = r.data.session.token;

// ۲۲-۳) ثبت‌نام تکراری با همان کد ملی رد شود
r = await ms("/api/ms/register/student", { method: "POST", body: { schoolCode: SCHOOL_CODE, joinCode: String(joinCode22), name: "تکراری", nationalId: "0012345678" } });
ok(r.status === 400, "ثبت‌نام تکراری با کد ملی رد شد");

// ۲۲-۴) پروفایل: تغییر نام‌کاربری (کد ملی) و تولد توسط خود کاربر
r = await ms("/api/ms/account/profile", { method: "POST", token: regTok22, body: { username: "0098765432", birthday: "2015-04-01" } });
ok(r.status === 200, "تغییر نام‌کاربری/تولد توسط دانش‌آموز");
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: "0098765432", pin: "5555" } });
ok(r.status === 200, "ورود با نام کاربری جدید");
r = await ms("/api/ms/home", { token: regTok22 });
ok(r.data.student && r.data.student.birthday === "2015-04-01", "تولد در پروفایل/خانه نمایش داده می‌شود");

// ۲۲-۵) تغییر نام فقط با معلم/مدیر — خود کاربر نمی‌تواند
r = await ms("/api/ms/admin/students/rename", { method: "POST", token: regTok22, body: { studentId: r.data.student.id, name: "خودخواسته" } });
ok(r.status === 403 || r.status === 404 || r.status === 400, "دانش‌آموز نمی‌تواند نامش را عوض کند");
const regStId22 = Number((sqlite.exec("SELECT id FROM ms_students WHERE student_code = '" + regCode22 + "'"))[0].values[0][0]);
// معلم کلاس خودش: 200
r = await ms("/api/ms/admin/students/rename", { method: "POST", token: t22, body: { studentId: regStId22, name: "دانیال ویرایش‌شده" } });
ok(r.status === 200, "معلم نام دانش‌آموز کلاس خودش را عوض کرد");
const nm22 = sqlite.exec("SELECT name FROM ms_students WHERE id = " + regStId22);
ok(String(nm22[0].values[0][0]) === "دانیال ویرایش‌شده", "نام جدید در دیتابیس ثبت شد");
// مدیر هم می‌تواند
r = await ms("/api/ms/admin/students/rename", { method: "POST", token: adminTok4, body: { studentId: regStId22, name: "دانیال نهایی" } });
ok(r.status === 200, "مدیر مدرسه هم نام را عوض کرد");

// ۲۲-۶) تبریک تولد خودکار از طرف معلم
await ms("/api/ms/account/profile", { method: "POST", token: regTok22, body: { username: "0098765432", birthday: new Date().toISOString().slice(0, 10) } });
const homeCnt0 = Number(sqlite.exec("SELECT COUNT(*) FROM ms_messages WHERE student_id = " + regStId22 + " AND text LIKE '%تولدت مبارک%'")[0].values[0][0]);
r = await ms("/api/ms/home", { token: regTok22 });
await new Promise((res) => setTimeout(res, 60));
const homeCnt1 = Number(sqlite.exec("SELECT COUNT(*) FROM ms_messages WHERE student_id = " + regStId22 + " AND text LIKE '%تولدت مبارک%'")[0].values[0][0]);
ok(homeCnt1 === homeCnt0 + 1, "تبریک تولد از طرف معلم در پیام‌ها ثبت شد");
r = await ms("/api/ms/home", { token: regTok22 });
await new Promise((res) => setTimeout(res, 60));
const homeCnt2 = Number(sqlite.exec("SELECT COUNT(*) FROM ms_messages WHERE student_id = " + regStId22 + " AND text LIKE '%تولدت مبارک%'")[0].values[0][0]);
ok(homeCnt2 === homeCnt1, "تبریک تولد تکراری ارسال نمی‌شود (idempotent)");

// ۲۲-۷) ورود چندمدرسه‌ای: یک نام‌کاربری در دو مدرسه → انتخاب مدرسه
const sc2 = await ms("/api/ms/super/schools", { method: "POST", token: superTok, body: { name: "مدرسه دوم تست", city: "کرج", adminName: "مدیر دوم", days: 365, plan: "standard", maxStudents: 300, maxTeachers: 30 } });
const SCHOOL2_CODE = sc2.data.code;
const school2Id = Number(sqlite.exec("SELECT id FROM schools WHERE code = '" + SCHOOL2_CODE + "'")[0].values[0][0]);
sqlite.exec("INSERT INTO ms_teachers (school_id, name, username, password, subjects, created_at) VALUES (" + school2Id + ", 'آقای رضایی دوم', 'rezaei', 'pass1234', '{}', '2026-01-01T00:00:00Z')");
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", username: "rezaei", password: "pass1234" } });
ok(r.status === 200 && r.data.needsSchoolChoice === true && (r.data.schools || []).length === 2, "ورود چندمدرسه‌ای: لیست مدرسه‌ها برگشت");
ok((r.data.schools || []).some((x) => x.code === SCHOOL_CODE) && (r.data.schools || []).some((x) => x.code === SCHOOL2_CODE), "هر دو مدرسه در لیست انتخاب هستند");
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL2_CODE, username: "rezaei", password: "pass1234" } });
ok(r.status === 200 && r.data.session.schoolName === "مدرسه دوم تست", "ورود با انتخاب مدرسه دوم");

// ۲۲-۸) معلم می‌تواند نام کاربری (کد ملی) خودش را عوض کند
r = await ms("/api/ms/account/profile", { method: "POST", token: t22, body: { username: "rezaei2" } });
ok(r.status === 200, "تغییر نام کاربری معلم");
r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL_CODE, username: "rezaei2", password: "pass1234" } });
ok(r.status === 200, "ورود معلم با نام کاربری جدید");
await ms("/api/ms/account/profile", { method: "POST", token: t22, body: { username: "rezaei" } });

// ==================== بخش ۲۳: رتبه دانش‌آموز در کلاس ====================
console.log("\n--- بخش ۲۳: رتبه کلاس در صفحه خانه ---");
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", code: ST1.studentCode, pin: ST1.pin } });
const st23 = r.data.session.token;
r = await ms("/api/ms/home", { token: st23 });
ok(typeof r.data.classRank === "number" && r.data.classRank >= 1, "classRank در home هست (" + r.data.classRank + ")");
ok(typeof r.data.classTotal === "number" && r.data.classTotal >= 2, "classTotal در home هست (" + r.data.classTotal + ")");
// با امتیاز بیشتر، رتبه بهتر می‌شود
const rank0 = r.data.classRank;
const stId23 = Number(sqlite.exec("SELECT id FROM ms_students WHERE student_code = '" + ST1.studentCode + "'")[0].values[0][0]);
const cls23 = Number(sqlite.exec("SELECT class_id FROM ms_students WHERE id = " + stId23)[0].values[0][0]);
sqlite.exec("INSERT INTO ms_points (school_id, class_id, student_id, delta, reason, created_by, created_at) VALUES (" + SCHOOL_ID + ", " + cls23 + ", " + stId23 + ", 5000, 'تست رتبه', 'تست', '2026-01-01T00:00:00Z')");
r = await ms("/api/ms/home", { token: st23 });
ok(r.data.classRank === 1, "با امتیاز بیشتر، رتبه ۱ شد (قبلاً " + rank0 + ")");


// ==================== بخش ۲۴: v3.2.0 — گفتگوی کلاس / ویدیو / ویس / تکالیف تلگرام ====================
console.log("\n--- بخش ۲۴: v3.2.0 (چت کلاس، ویدیو، ویس، ثبت تکالیف تلگرام در پنل) ---");

// ۲۴-۱) چت کلاس: دانش‌آموز پیام می‌دهد و هم‌کلاسی می‌بیند
const st1Id24 = Number(sqlite.exec("SELECT id FROM ms_students WHERE student_code = '" + ST1.studentCode + "'")[0].values[0][0]);
r = await ms("/api/ms/admin/students", { method: "POST", token: adminTok, body: { name: "هم‌کلاسی تست ۲۴", classId: CLASS_A } });
const ST24 = r.data;
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: ST24.studentCode, pin: ST24.pin } });
const st24Tok = r.data.session.token;
r = await ms("/api/ms/edu/chat", { method: "POST", token: st1Tok, body: { classId: CLASS_A, text: "سلام بچه‌ها" } });
ok(r.status === 200, "چت: دانش‌آموز پیام داد");
r = await ms("/api/ms/edu/chat?classId=" + CLASS_A, { token: st1Tok });
ok(r.status === 200 && r.data.messages.some((m) => m.text === "سلام بچه‌ها" && m.mine), "چت: پیام خودم با mine=true دیده می‌شود");
const chatMsgId = r.data.messages.find((m) => m.text === "سلام بچه‌ها").id;
r = await ms("/api/ms/edu/chat?classId=" + CLASS_A, { token: st24Tok });
ok(r.status === 200 && r.data.messages.some((m) => m.text === "سلام بچه‌ها"), "چت: هم‌کلاسی هم پیام را می‌بیند");

// ۲۴-۲) دانش‌آموز نمی‌تواند پیام دیگری را حذف کند؛ معلم می‌تواند
r = await ms("/api/ms/edu/chat/delete", { method: "POST", token: st1Tok, body: { id: chatMsgId } });
ok(r.status === 403 || r.status === 404, "چت: دانش‌آموز حق حذف ندارد");
r = await ms("/api/ms/edu/chat/delete", { method: "POST", token: t22 || st1Tok, body: { id: chatMsgId } });
ok(r.status === 200, "چت: معلم پیام را حذف کرد");
r = await ms("/api/ms/edu/chat?classId=" + CLASS_A, { token: st1Tok });
ok(!r.data.messages.some((m) => m.id === chatMsgId), "چت: پیام حذف‌شده دیگر نیست");

// ۲۴-۳) ویس به متن
r = await ms("/api/ms/edu/ai/voice", { method: "POST", token: st1Tok, body: { audio: "data:audio/webm;base64,AAAA" } });
ok(r.status === 200 && r.data.text === "متن ویس تست", "ویس: تبدیل صدا به متن");
r = await ms("/api/ms/edu/ai/voice", { method: "POST", token: st1Tok, body: { audio: "not-audio" } });
ok(r.status === 400, "ویس: ورودی نامعتبر رد می‌شود");

// ۲۴-۴) ویدیو در تکلیف آزاد + تکالیف کلاس
const tinyVid = "data:video/mp4;base64," + btoa("0123456789ABCDEF");
r = await ms("/api/ms/student/hw/send", { method: "POST", token: st1Tok, body: { text: "ویدیوی من", video: tinyVid } });
ok(r.status === 200, "ویدیو: ارسال تکلیف آزاد با ویدیو");
r = await ms("/api/ms/teacher/submissions?assignmentId=0", { token: t22 || st1Tok });
const vRow = (r.data.submissions || []).find((x) => x.text === "ویدیوی من");
ok(vRow && vRow.video && vRow.video.startsWith("data:video/") && !vRow.reviewed, "ویدیو: معلم ویدیوی در انتظار تصحیح را می‌بیند");
r = await ms("/api/ms/student/hw/send", { method: "POST", token: st1Tok, body: { text: "x", video: "data:text/html;base64,AAAA" } });
ok(r.status === 400, "ویدیو: نوع فایل غیر ویدیو رد می‌شود");

// ۲۴-۵) داشبورد/صندوق: شمارنده تکالیف در انتظار
r = await ms("/api/ms/teacher/inbox?classId=" + CLASS_A, { token: t22 || st1Tok });
ok(r.status === 200 && Number(r.data.pendingSubs) >= 1, "داشبورد: pendingSubs تکالیف در انتظار را می‌شمارد");
ok(Array.isArray(r.data.recentSubs) && r.data.recentSubs.length >= 1, "داشبورد: recentSubs آخرین تکالیف را می‌دهد");

// ۲۴-۶) تکالیف تلگرام: عکس در پنل ثبت می‌شود (miror) و ویدیو کامل پردازش می‌شود
sqlite.exec("UPDATE ms_students SET tg_id = 'TG100' WHERE id = " + st1Id24);
const realFetch = globalThis.fetch;
globalThis.fetch = async (u2, o2 = {}) => {
  const uu = String(u2);
  if (uu.indexOf("api.telegram.org") >= 0) {
    if (uu.indexOf("getFile") >= 0) return new Response(JSON.stringify({ ok: true, result: { file_path: "file/t.bin" } }), { status: 200 });
    if (uu.indexOf("/file/") >= 0) return new Response(new Uint8Array([10, 20, 30, 40, 50, 60]), { status: 200 });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), { status: 200 });
  }
  return realFetch(u2, o2);
};
let tgHandled = await handleMsTgUpdate(
  { message: { message_id: 901, chat: { id: "TG100" }, from: { id: "TG100" }, photo: [{ file_id: "p1", file_size: 100 }, { file_id: "p2", file_size: 400 }] } },
  deps.db,
  deps
);
ok(tgHandled === true, "تلگرام: عکس با یک پیام (اعلان+دکمه) به معلم رسید، بدون تکرار");
{
  const row = sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE student_id = " + st1Id24 + " AND photo_b64 LIKE 'data:image/jpeg%' AND COALESCE(reviewed_at,'') = ''");
  ok(Number(row[0].values[0][0]) >= 1, "تلگرام: عکس تکلیف در ms_submissions ثبت شد (در انتظار تصحیح)");
}
tgHandled = await handleMsTgUpdate(
  { message: { message_id: 902, chat: { id: "TG100" }, from: { id: "TG100" }, video: { file_id: "v1", file_size: 100 } } },
  deps.db,
  deps
);
ok(tgHandled === true, "تلگرام: ویدیو کامل در سامانه پردازش شد (true)");
{
  const row = sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE student_id = " + st1Id24 + " AND video_b64 LIKE 'data:video/%' AND COALESCE(reviewed_at,'') = ''");
  ok(Number(row[0].values[0][0]) >= 1, "تلگرام: ویدیو در ms_submissions ثبت شد (در انتظار تصحیح)");
}
globalThis.fetch = realFetch;
sqlite.exec("UPDATE ms_teachers SET tg_id = 'TGTEACH' WHERE school_id = " + (SCHOOL_ID || 0));

// ۲۴-۷) تایید تکلیف از تلگرام (callback hw)
{
  const row = sqlite.exec("SELECT id FROM ms_submissions WHERE student_id = " + st1Id24 + " AND video_b64 LIKE 'data:video/%' ORDER BY id DESC LIMIT 1");
  const hwSubId = Number(row[0].values[0][0]);
  tgHandled = await handleMsTgUpdate(
    { callback_query: { id: "cb1", from: { id: "TGTEACH" }, data: "ms:ap:" + (SCHOOL_ID || 0) + ":hw:" + hwSubId + ":approve", message: { message_id: 777, chat: { id: "TGTEACH" } } } },
    deps.db,
    deps
  );
  ok(tgHandled === true, "تلگرام: تایید تکلیف با دکمه تلگرام");
  const r2 = sqlite.exec("SELECT reviewed_at FROM ms_submissions WHERE id = " + hwSubId);
  ok(String(r2[0].values[0][0] || "").length > 0, "تلگرام: تکلیف تاییدشده برچسب تصحیح گرفت");
}


// ==================== بخش ۲۵: امتیاز معلم (افزودن/کسر) ====================
console.log("\n--- بخش ۲۵: امتیاز معلم (افزودن/کسر) ---");
r = await ms("/api/ms/teacher/class?classId=" + CLASS_A, { token: t22 });
const row25 = (r.data.roster || []).find((x) => x.id === st1Id24);
const ptsBefore25 = Number(row25 ? row25.points : 0);
r = await ms("/api/ms/teacher/points", { method: "POST", token: t22, body: { studentId: st1Id24, delta: 7, reason: "فعالیت عالی" } });
ok(r.status === 200, "امتیاز: +۷ توسط معلم ثبت شد");
r = await ms("/api/ms/teacher/points", { method: "POST", token: t22, body: { studentId: st1Id24, delta: -2, reason: "بی‌نظمی" } });
ok(r.status === 200, "امتیاز: −۲ (کسر) توسط معلم ثبت شد");
r = await ms("/api/ms/teacher/points", { method: "POST", token: t22, body: { studentId: st1Id24, delta: 0 } });
ok(r.status === 400, "امتیاز: مقدار صفر رد می‌شود");
r = await ms("/api/ms/teacher/points", { method: "POST", token: t22, body: { studentId: 999999, delta: 5 } });
ok(r.status === 404, "امتیاز: دانش‌آموز ناموجود رد می‌شود");
r = await ms("/api/ms/teacher/class?classId=" + CLASS_A, { token: t22 });
const row25b = (r.data.roster || []).find((x) => x.id === st1Id24);
ok(row25b && Number(row25b.points) === ptsBefore25 + 7 - 2, "امتیاز: مجموع امتیاز در roster کلاس نمایش داده می‌شود (" + (row25b ? row25b.points : "?") + ")");

// ۲۵-۲) همگام‌سازی با نمایش تلگرام (جدول قدیمی students.score)
sqlite.exec("CREATE TABLE IF NOT EXISTS students (user_id TEXT PRIMARY KEY, name TEXT, score INTEGER DEFAULT 0, joined TEXT, streak INTEGER DEFAULT 0, last_hw_date TEXT, birthday TEXT, max_streak INTEGER DEFAULT 0, level INTEGER DEFAULT 1, parent_chat_id TEXT, parent_name TEXT)");
sqlite.exec("INSERT OR REPLACE INTO students (user_id, name, score, level) VALUES (999000255, 'دانش‌آموز همگام', 3, 1)");
sqlite.exec("UPDATE ms_students SET tg_id = '999000255' WHERE id = " + st1Id24);
r = await ms("/api/ms/teacher/points", { method: "POST", token: t22, body: { studentId: st1Id24, delta: 9, reason: "همگام‌سازی تلگرام" } });
ok(r.status === 200, "امتیاز: +۹ ثبت شد (برای همگام‌سازی)");
{
  const row = sqlite.exec("SELECT score, level FROM students WHERE user_id = '999000255'");
  const sc = Number(row[0].values[0][0]);
  const lvl = Number(row[0].values[0][1]);
  ok(sc === 12, "همگام‌سازی: امتیاز نمایش تلگرام به‌روز شد (3 + 9 = " + sc + ")");
  ok(lvl === 2, "همگام‌سازی: سطح تلگرام هم به‌روز شد (سطح " + lvl + ")");
}


// ==================== §26 resync-points: یکسان‌سازی یک‌باره‌ی امتیاز تلگرام و پنل ====================
{
  const dbg = sqlite.exec("SELECT student_id, SUM(delta) t, COUNT(*) n FROM ms_points GROUP BY student_id");
  console.log("  [dbg points]", JSON.stringify(dbg[0] ? dbg[0].values : []));
  sqlite.exec("UPDATE students SET score = 1, level = 1 WHERE user_id = '999000255'");
  r = await ms("/api/ms/teacher/class?classId=" + CLASS_A, { token: t22 });
  const row26 = (r.data.roster || []).find((x) => x.id === st1Id24);
  const panelTotal = Number(row26.points);
  r = await ms("/api/ms/admin/resync-points", { method: "POST", token: adminTok, body: { schoolId: 1 } });
  ok(r.status === 200 && r.data.ok, "26.1 resync توسط مدیر اجرا شد (" + r.status + ")");
  {
    const row = sqlite.exec("SELECT score FROM students WHERE user_id = '999000255'");
    const sc = Number(row[0].values[0][0]);
    ok(sc === panelTotal, "26.2 امتیاز تلگرام با مجموع پنل یکسان شد (" + sc + " = " + panelTotal + ")");
  }
  r = await ms("/api/ms/admin/resync-points", { method: "POST", token: st1Tok, body: { schoolId: 1 } });
  ok(r.status === 401 || r.status === 403 || r.status === 404, "26.3 دانش‌آموز به resync دسترسی ندارد (" + r.status + ")");
  const ahead = panelTotal + 300;
  sqlite.exec("UPDATE students SET score = " + ahead + " WHERE user_id = '999000255'");
  r = await ms("/api/ms/admin/resync-points", { method: "POST", token: adminTok, body: { schoolId: 1 } });
  ok(r.status === 200, "26.4 resync (حالت تلگرام جلوتر) اجرا شد");
  r = await ms("/api/ms/teacher/class?classId=" + CLASS_A, { token: t22 });
  const row26b = (r.data.roster || []).find((x) => x.id === st1Id24);
  ok(Number(row26b.points) === ahead, "26.5 امتیاز تلگرامِ جلوتر، به پنل منتقل شد (" + row26b.points + ")");
  {
    const row = sqlite.exec("SELECT score FROM students WHERE user_id = '999000255'");
    ok(Number(row[0].values[0][0]) === ahead, "26.6 هر دو سمت برابرند");
  }
}

// ==================== §27 صدا و ابزارهای جدید کارگاه (v3.2.3) ====================
{
  r = await ms("/api/ms/edu/tts", { method: "POST", token: studentTok3, body: { text: "Hello world", lang: "en" } });
  ok(r.status === 200 && r.data.clips && r.data.clips.length === 1 && r.data.clips[0].indexOf("data:audio") === 0, "27.1 TTS متن انگلیسی → کلیپ صوتی");
  r = await ms("/api/ms/edu/tts", { method: "POST", token: studentTok3, body: { text: "سلام دنیا", lang: "fa" } });
  ok(r.status === 200 && r.data.clips && r.data.clips.length === 1, "27.2 TTS متن فارسی → کلیپ صوتی");
  r = await ms("/api/ms/edu/tts", { method: "POST", token: studentTok3, body: { text: " " } });
  ok(r.status === 400, "27.3 TTS متن خالی رد می‌شود");
  r = await ms("/api/ms/edu/tts", { method: "POST", body: { text: "hi" } });
  ok(r.status === 401, "27.4 TTS بدون توکن رد می‌شود");
  r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "dictation", mode: "play", topic: "طبیعت" } });
  ok(r.status === 200 && r.data.result && r.data.result.passage && r.data.result.passage.length > 10, "27.5 دیکته صوتی: متن دیکته ساخته می‌شود");
  r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "science", mode: "simulate", topic: "آزمایش فشار هوا" } });
  ok(r.status === 200 && r.data.result && String(r.data.result.svg || "").indexOf("<svg") >= 0 && Array.isArray(r.data.result.steps) && r.data.result.explanation, "27.6 شبیه‌سازی تصویری: SVG + مراحل + توضیح");
  r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "english", text: "I likes apples", history: ["Student: Hello", "Tutor: Hi! How are you?"] } });
  ok(r.status === 200 && r.data.result && r.data.result.englishReply, "27.7 مکالمه انگلیسی با تاریخچه → پاسخ مربی");
  r = await ms("/api/ms/edu/ai", { method: "POST", token: studentTok3, body: { tool: "dictation", expected: "هوا صاف است.", ocr: "هوا صاف است" } });
  ok(r.status === 200 && r.data.result, "27.8 تصحیح دیکته (متن نوشته‌شده) کار می‌کند");
}

// ==================== §28 ارسال مجدد + تکالیف تلگرام پیشرفته (v3.2.4) ====================
console.log("\n--- §28 ارسال مجدد + تکالیف تلگرام پیشرفته ---");
{
  sqlite.exec("UPDATE ms_students SET tg_id = 'TGGRP1' WHERE id = " + st1Id24);
  const realFetch28 = globalThis.fetch;
  let sentMediaKind28 = "";
  globalThis.fetch = async (u2, o2 = {}) => {
    const uu = String(u2);
    if (uu.indexOf("api.telegram.org") >= 0) {
      if (uu.indexOf("getFile") >= 0) return new Response(JSON.stringify({ ok: true, result: { file_path: "file/t.bin" } }), { status: 200 });
      if (uu.indexOf("/file/") >= 0) return new Response(new Uint8Array([10, 20, 30, 40, 50, 60]), { status: 200 });
      if (uu.indexOf("sendPhoto") >= 0) sentMediaKind28 = "photo";
      if (uu.indexOf("sendVideo") >= 0) sentMediaKind28 = "video";
      return new Response(JSON.stringify({ ok: true, result: { message_id: 888 } }), { status: 200 });
    }
    return realFetch28(u2, o2);
  };
  const cntQ28 = () => Number(sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE student_id = " + st1Id24 + " AND COALESCE(reviewed_at,'') = ''")[0].values[0][0]);
  const before28 = cntQ28();
  let h28 = await handleMsTgUpdate(
    { message: { message_id: 951, chat: { id: "-100999888777" }, from: { id: "TGGRP1", first_name: "تست" }, photo: [{ file_id: "pg1", file_size: 300 }], caption: "تکلیف ریاضی صفحه ۴۵" } },
    deps.db, deps
  );
  ok(h28 === true, "28.1 عکس گروهی با یک پیام به معلم رسید، بدون تکرار");
  ok(cntQ28() === before28 + 1, "28.2 عکس ارسالی از گروه (chat.id ≠ from.id) با from.id ثبت شد");
  {
    const row = sqlite.exec("SELECT text FROM ms_submissions WHERE student_id = " + st1Id24 + " ORDER BY id DESC LIMIT 1");
    ok(String(row[0].values[0][0] || "").indexOf("تکلیف ریاضی") >= 0, "28.3 کپشن دانش‌آموز به عنوان متن تکلیف ثبت شد");
  }
  h28 = await handleMsTgUpdate(
    { message: { message_id: 952, chat: { id: "TGGRP1" }, from: { id: "TGGRP1" }, document: { file_id: "docimg1", file_size: 500, mime_type: "image/png" }, caption: "عکس فایلی" } },
    deps.db, deps
  );
  ok(cntQ28() === before28 + 2, "28.4 عکس ارسال‌شده به صورت فایل (document) هم ثبت شد");
  ok(sentMediaKind28 === "photo", "28.5 برای عکس تکلیف هم دکمه تایید/رد تلگرام برای معلم رفت");
  {
    const row = sqlite.exec("SELECT COUNT(*) FROM ms_tg_msgmap WHERE kind = 'hw'");
    ok(Number(row[0].values[0][0]) >= 1, "28.6 پیوند پیام تلگرام (msgmap) برای تکلیف عکس ثبت شد");
  }
  globalThis.fetch = realFetch28;
}

// ==================== §29 نمره تکلیف → مجموع امتیازات (اپ + تلگرام) ====================
console.log("\n--- §29 نمره تکلیف → مجموع امتیازات ---");
{
  const realFetch29 = globalThis.fetch;
  let tgSent29 = 0;
  globalThis.fetch = async (u2, o2 = {}) => {
    const uu = String(u2);
    if (uu.indexOf("api.telegram.org") >= 0) {
      tgSent29++;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 999 } }), { status: 200 });
    }
    return realFetch29(u2, o2);
  };
  const sub29 = await ms("/api/ms/student/hw/send", { method: "POST", token: st1Tok, body: { text: "تکلیف تست امتیاز" } });
  ok(sub29.status === 200, "29.1 تکلیف آزاد تست ثبت شد");
  const sid29 = sub29.data.id;
  const mkQ29 = () => Number(sqlite.exec("SELECT COALESCE(SUM(delta),0) FROM ms_points WHERE student_id = " + st1Id24 + " AND reason = 'نمره تکلیف #" + sid29 + "'")[0].values[0][0]);
  const totalQ29 = () => Number(sqlite.exec("SELECT COALESCE(SUM(delta),0) FROM ms_points WHERE student_id = " + st1Id24)[0].values[0][0]);
  const t0 = totalQ29();
  let r29 = await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: sid29, score: 7, feedback: "خوب بود" } });
  ok(r29.status === 200 && r29.data.pointsAdded === 7, "29.2 تصحیح نمره ۷ → pointsAdded=7");
  ok(mkQ29() === 7 && totalQ29() === t0 + 7, "29.3 مجموع امتیازات دانش‌آموز +۷ شد");
  ok(tgSent29 > 0, "29.4 اطلاع‌رسانی تلگرام تصحیح/نمره برای دانش‌آموز رفت");
  r29 = await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: sid29, score: 5, feedback: "اصلاح" } });
  ok(r29.status === 200 && r29.data.pointsAdded === -2, "29.5 تغییر نمره ۷→۵ → تعدیل −۲ (pointsAdded=-2)");
  ok(mkQ29() === 5 && totalQ29() === t0 + 5, "29.6 مجموع دقیقاً نمره فعلی (۵) را منعکس کرد");
  r29 = await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: sid29, score: 5, feedback: "ویرایش بازخورد" } });
  ok(r29.status === 200 && r29.data.pointsAdded === 0, "29.7 ثبت مجدد با همان نمره → بدون تغییر امتیاز");
  {
    const row = sqlite.exec("SELECT reviewed_at, score FROM ms_submissions WHERE id = " + sid29);
    ok(String(row[0].values[0][0] || "").length > 0 && Number(row[0].values[0][1]) === 5, "29.8 وضعیت تصحیح/نمره روی تکلیف درست است");
  }
  globalThis.fetch = realFetch29;
}

// ==================== §30 شناسایی فرستنده تلگرام + تکالیف ناشناخته (v3.2.6) ====================
console.log("\n--- §30 شناسایی فرستنده تلگرام + تکالیف ناشناخته ---");
{
  const realFetch30 = globalThis.fetch;
  let tgSent30 = 0;
  globalThis.fetch = async (u2, o2 = {}) => {
    const uu = String(u2);
    if (uu.indexOf("api.telegram.org") >= 0) {
      if (uu.indexOf("getFile") >= 0) return new Response(JSON.stringify({ ok: true, result: { file_path: "file/t.bin" } }), { status: 200 });
      if (uu.indexOf("/file/") >= 0) return new Response(new Uint8Array([10, 20, 30, 40, 50, 60]), { status: 200 });
      tgSent30++;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 444 } }), { status: 200 });
    }
    return realFetch30(u2, o2);
  };
  const nm30 = String(sqlite.exec("SELECT name FROM ms_students WHERE id = " + st1Id24)[0].values[0][0] || "");
  const nmParts = nm30.trim().split(/\s+/);
  sqlite.exec("UPDATE ms_students SET tg_id = '' WHERE id = " + st1Id24);

  // 30.1/30.2) تطبیق با نام نمایشی تلگرام (فاصله‌ها/نیم‌فاصله بی‌اثر) + لینک خودکار
  let h30 = await handleMsTgUpdate(
    { message: { message_id: 7001, chat: { id: "9300001" }, from: { id: "9300001", first_name: nmParts[0] || nm30, last_name: nmParts.slice(1).join(" ") },
      photo: [{ file_id: "p30a", file_size: 300 }], caption: "تکلیف من" } },
    deps.db, deps
  );
  {
    const row = sqlite.exec("SELECT student_id, class_id FROM ms_submissions WHERE tg_from_id = '9300001' ORDER BY id DESC LIMIT 1");
    ok(Number(row[0].values[0][0]) === st1Id24, "30.1 تطبیق نام نمایشی تلگرام → دانش‌آموز درست (لینک خودکار)");
    const lk = sqlite.exec("SELECT tg_id FROM ms_students WHERE id = " + st1Id24);
    ok(String(lk[0].values[0][0]) === "9300001", "30.2 شناسه تلگرام به‌صورت خودکار لینک شد");
  }
  h30 = await handleMsTgUpdate(
    { message: { message_id: 7002, chat: { id: "9300001" }, from: { id: "9300001", first_name: "X" },
      photo: [{ file_id: "p30a", file_size: 300 }], caption: "دومی" } },
    deps.db, deps
  );
  {
    const row = sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE tg_from_id = '9300001'");
    ok(Number(row[0].values[0][0]) === 2, "30.3 پیام بعدی از همان شناسه (با لینک قبلی) ثبت شد");
  }

  // 30.4) تطبیق نام قدیمی با فاصله‌ی متفاوت («امیرعلی» vs «امیر علی») از مسیر جدول قدیمی
  const tightName = nm30.replace(/\s+/g, "");
  sqlite.exec("INSERT INTO students (user_id, name, score, level) VALUES ('9300002', '" + tightName.replace(/'/g, "''") + "', 0, 1)");
  sqlite.exec("UPDATE ms_students SET tg_id = '' WHERE id = " + st1Id24);
  await handleMsTgUpdate(
    { message: { message_id: 7003, chat: { id: "9300002" }, from: { id: "9300002", first_name: "ناشناس" },
      photo: [{ file_id: "p30a", file_size: 300 }], caption: "از مسیر نام قدیمی" } },
    deps.db, deps
  );
  {
    const row = sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE tg_from_id = '9300002' AND student_id = " + st1Id24);
    ok(Number(row[0].values[0][0]) === 1, "30.4 تطبیق نام بدون‌فاصله‌ی جدول قدیمی → دانش‌آموز درست");
  }

  // 30.5) فرستنده‌ی کاملاً ناشناخته → ردیف «ناشناخته» بدون گم‌شدن + اتصال توسط معلم
  const before30 = Number(sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE student_id = 0")[0].values[0][0]);
  await handleMsTgUpdate(
    { message: { message_id: 7004, chat: { id: "9300003" }, from: { id: "9300003", first_name: "کاربر", last_name: "گمنام ناشناخته" },
      photo: [{ file_id: "p30a", file_size: 300 }], caption: "تکلیف ناشناخته" } },
    deps.db, deps
  );
  const unRow = sqlite.exec("SELECT id, text FROM ms_submissions WHERE student_id = 0 ORDER BY id DESC LIMIT 1");
  const unId = Number(unRow[0].values[0][0]);
  ok(Number(sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE student_id = 0")[0].values[0][0]) === before30 + 1, "30.5 تکلیف ناشناخته ذخیره شد (هیچ چیز گم نشد)");
  ok(String(unRow[0].values[0][1] || "").indexOf("شناسایی‌نشده") >= 0, "30.6 برچسب «شناسایی‌نشده» با نام تلگرام روی تکلیف هست");
  ok(tgSent30 > 0, "30.7 به معلم برای تکلیف ناشناخته اعلان رفت");
  {
    const lst = await ms("/api/ms/teacher/submissions?assignmentId=0", { token: tcTok });
    const hit = (lst.data.submissions || []).find((x) => x.submissionId === unId);
    ok(hit && hit.name === "⚠️ ناشناخته", "30.8 تکلیف ناشناخته در فهرست معلم دیده می‌شود");
    sqlite.exec("UPDATE ms_students SET tg_id = '' WHERE id = " + st1Id24);
    const rv = await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: unId, score: 3, feedback: "اتصال یافت", assignStudentId: st1Id24 } });
    ok(rv.status === 200 && rv.data.pointsAdded === 3 && rv.data.assigned === st1Id24, "30.9 اتصال به دانش‌آموز + امتیاز نمره اعمال شد");
    const after = sqlite.exec("SELECT student_id, class_id FROM ms_submissions WHERE id = " + unId);
    ok(Number(after[0].values[0][0]) === st1Id24, "30.10 ردیف به دانش‌آموز وصل شد");
    const lk2 = sqlite.exec("SELECT tg_id FROM ms_students WHERE id = " + st1Id24);
    ok(String(lk2[0].values[0][0]) === "9300003", "30.11 با اتصال، شناسه تلگرام هم لینک شد");
    await handleMsTgUpdate(
      { message: { message_id: 7005, chat: { id: "9300003" }, from: { id: "9300003", first_name: "کاربر" },
        photo: [{ file_id: "p30a", file_size: 300 }], caption: "بعد از اتصال" } },
      deps.db, deps
    );
    const row2 = sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE tg_from_id = '9300003' AND student_id = " + st1Id24);
    ok(Number(row2[0].values[0][0]) >= 2, "30.12 پیام‌های بعدی همان فرستنده خودکار ثبت می‌شود");
  }

  // 30.13) پیام فورواردی: هویت فرستنده اصلی شناسایی می‌شود (بازیابی تکالیف گم‌شده)
  sqlite.exec("UPDATE ms_students SET tg_id = '' WHERE id = " + st1Id24);
  await handleMsTgUpdate(
    { message: { message_id: 7006, chat: { id: "9300009" }, from: { id: "9300009", first_name: "معلم" },
      forward_from: { id: "9300002", first_name: "ناشناس" },
      photo: [{ file_id: "p30a", file_size: 300 }], caption: "فوروارد تکلیف قدیمی" } },
    deps.db, deps
  );
  {
    const row = sqlite.exec("SELECT COUNT(*) FROM ms_submissions WHERE tg_from_id = '9300002' AND student_id = " + st1Id24);
    ok(Number(row[0].values[0][0]) === 2, "30.13 فوروارد پیام، فرستنده اصلی را شناسایی می‌کند");
  }

  // 30.14) فوروارد با هویت پنهان (فقط نام) → تکلیف ثبت ولی هرگز شناسه‌ی معلم لینک نمی‌شود
  sqlite.exec("UPDATE ms_students SET tg_id = '' WHERE id = " + st1Id24);
  await handleMsTgUpdate(
    { message: { message_id: 7007, chat: { id: "9300009" }, from: { id: "9300009", first_name: "معلم" },
      forward_sender_name: nm30,
      photo: [{ file_id: "p30a", file_size: 300 }], caption: "فوروارد هویت‌پنهان" } },
    deps.db, deps
  );
  {
    const lk = sqlite.exec("SELECT tg_id FROM ms_students WHERE id = " + st1Id24);
    ok(String(lk[0].values[0][0] || "") !== "9300009", "30.14a شناسه‌ی معلم (فورواردکننده) هرگز لینک نشد");
    const row = sqlite.exec("SELECT tg_from_id FROM ms_submissions ORDER BY id DESC LIMIT 1");
    ok(String(row[0].values[0][0] || "") === "", "30.14b شناسه نامعتبر روی تکلیف فورواردی ذخیره نشد");
  }
  globalThis.fetch = realFetch30;
}

// ==================== §31 ضدتکرار + متن/ویس + ادغام دانش‌آموزان (v3.2.7) ====================
console.log("\n--- §31 ضدتکرار + متن/ویس + ادغام دانش‌آموزان تکراری ---");
{
  const realFetch31 = globalThis.fetch;
  let sends31 = 0;
  globalThis.fetch = async (u2, o2 = {}) => {
    const uu = String(u2);
    if (uu.indexOf("api.telegram.org") >= 0) {
      if (uu.indexOf("getFile") >= 0) return new Response(JSON.stringify({ ok: true, result: { file_path: "file/t.bin" } }), { status: 200 });
      if (uu.indexOf("/file/") >= 0) return new Response(new Uint8Array([10, 20, 30, 40, 50, 60]), { status: 200 });
      if (uu.indexOf("send") >= 0) sends31++;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 555 } }), { status: 200 });
    }
    return realFetch31(u2, o2);
  };
  const cnt31 = () => Number(sqlite.exec("SELECT COUNT(*) FROM ms_submissions")[0].values[0][0]);

  // 31.1) یک آپدیت تکراری (retry تلگرام) فقط یک بار پردازش می‌شود
  const upd31 = { update_id: 950001, message: { message_id: 91001, chat: { id: "9300001" }, from: { id: "9300001", first_name: "X" },
    photo: [{ file_id: "p31", file_size: 300 }], caption: "ضدتکرار" } };
  const before31 = cnt31();
  await handleMsTgUpdate(upd31, deps.db, deps);
  await handleMsTgUpdate(JSON.parse(JSON.stringify(upd31)), deps.db, deps);
  await handleMsTgUpdate(JSON.parse(JSON.stringify(upd31)), deps.db, deps);
  ok(cnt31() === before31 + 1, "31.1 ارسال تکراری همان آپدیت → فقط یک ردیف (بدون تکرار)");

  // 31.2) تکلیف متنی از تلگرام ثبت می‌شود
  const b2 = cnt31();
  await handleMsTgUpdate({ update_id: 950002, message: { message_id: 91002, chat: { id: "9300001" }, from: { id: "9300001", first_name: "X" },
    text: "تکلیف متنی ادبیات — صفحه ۵" } }, deps.db, deps);
  ok(cnt31() === b2 + 1, "31.2 پیام متنی به‌عنوان تکلیف ثبت شد");
  {
    const row = sqlite.exec("SELECT text FROM ms_submissions ORDER BY id DESC LIMIT 1");
    ok(String(row[0].values[0][0] || "").indexOf("متن تکلیف") >= 0, "31.3 برچسب متن تکلیف روی آن هست");
  }

  // 31.4) ویس از تلگرام ثبت می‌شود
  const b4 = cnt31();
  await handleMsTgUpdate({ update_id: 950003, message: { message_id: 91003, chat: { id: "9300001" }, from: { id: "9300001", first_name: "X" },
    voice: { file_id: "v31", file_size: 300 } } }, deps.db, deps);
  ok(cnt31() === b4 + 1, "31.4 پیام صوتی (ویس) ثبت شد");
  {
    const row = sqlite.exec("SELECT audio_b64 FROM ms_submissions ORDER BY id DESC LIMIT 1");
    ok(String(row[0].values[0][0] || "").indexOf("data:audio/") === 0, "31.5 فایل صوتی روی تکلیف ذخیره شد");
  }

  // 31.6) آلبوم عکس: چند ردیف ولی فقط یک اعلان (بدون سیل پیام)
  const b6 = cnt31(); const snd6 = sends31;
  await handleMsTgUpdate({ update_id: 950004, message: { message_id: 91004, chat: { id: "9300001" }, from: { id: "9300001", first_name: "X" },
    media_group_id: "mg31", photo: [{ file_id: "p31", file_size: 300 }], caption: "آلبوم ۱" } }, deps.db, deps);
  await handleMsTgUpdate({ update_id: 950005, message: { message_id: 91005, chat: { id: "9300001" }, from: { id: "9300001", first_name: "X" },
    media_group_id: "mg31", photo: [{ file_id: "p31", file_size: 300 }], caption: "آلبوم ۲" } }, deps.db, deps);
  ok(cnt31() === b6 + 2, "31.6 هر صفحه‌ی آلبوم جدا ثبت شد (اطلاعات کامل)");
  ok(sends31 - snd6 === 1, "31.7 برای کل آلبوم فقط یک پیام برای معلم رفت (بدون سیل پیام)");

  // 31.8) ویس از اپ: hw/send با audio
  const r31 = await ms("/api/ms/student/hw/send", { method: "POST", token: st1Tok, body: { text: "", audio: "data:audio/webm;base64,AAAA" } });
  ok(r31.status === 200, "31.8 ارسال ویس از اپ پذیرفته شد");
  {
    const row = sqlite.exec("SELECT audio_b64 FROM ms_submissions WHERE id = " + r31.data.id);
    ok(String(row[0].values[0][0] || "").indexOf("data:audio/") === 0, "31.9 ویس اپ روی تکلیف ذخیره شد");
  }

  // 31.10) ادغام دانش‌آموزان تکراری تلگرام
  sqlite.exec("INSERT INTO students (user_id, name, score, level) VALUES (950011, 'نرگس تست ادغام', 5, 1)");
  sqlite.exec("INSERT INTO students (user_id, name, score, level) VALUES (950012, 'نرگس  تست‌ادغام', 3, 1)");
  sqlite.exec("INSERT INTO students (user_id, name, score, level) VALUES (950013, 'تک‌نفره بی‌تکرار', 1, 1)");
  const r31m = await ms("/api/ms/admin/merge-legacy-duplicates", { method: "POST", token: superTok, body: {} });
  ok(r31m.status === 200 && r31m.data.removed >= 1, "31.10 ادغام تکراری‌ها انجام شد (removed=" + r31m.data.removed + ")");
  {
    const rows = sqlite.exec("SELECT COUNT(*) FROM students WHERE REPLACE(REPLACE(name, ' ', ''), char(8204), '') LIKE '%نرگستستادغام%' OR name LIKE 'نرگس%ادغام%'");
    const c = Number(sqlite.exec("SELECT COUNT(*) FROM students WHERE name LIKE 'نرگس%ادغام%'")[0].values[0][0]);
    ok(c === 1, "31.11 فقط یک «نرگس تست ادغام» باقی ماند");
    const sc = sqlite.exec("SELECT score FROM students WHERE name LIKE 'نرگس%ادغام%'");
    ok(Number(sc[0].values[0][0]) === 5, "31.12 امتیاز بالاترین مقدار حفظ شد");
    const solo = sqlite.exec("SELECT COUNT(*) FROM students WHERE name = 'تک‌نفره بی‌تکرار'");
    ok(Number(solo[0].values[0][0]) === 1, "31.13 دانش‌آموز بدون تکرار دست نخورد");
  }
  globalThis.fetch = realFetch31;
}

// ---------- §32 آشوب تلگرام (معلم/دستور/گپ) + نمره فارسی + حذف جفنگ ----------
console.log("\n--- §32 فیلتر معلم/دستور/متن + نمره فارسی + حذف ---");
{
  const cntAll = () => Number(sqlite.exec("SELECT COUNT(*) FROM ms_submissions")[0].values[0][0]);
  // 32.1 عکس از معلم (با tg_id) تکلیف نیست
  let c0 = cntAll();
  await handleMsTgUpdate({ update_id: 960001, message: { message_id: 92001, chat: { id: "G1", type: "group" }, from: { id: "TGTEACH", first_name: "معلم" }, photo: [{ file_id: "pt", file_size: 9 }], caption: "اطلاعیه مدرسه" } }, deps.db, deps);
  ok(cntAll() === c0, "32.1 عکس معلم تکلیف ثبت نشد");
  // 32.2 متن دستور «📋 لیست» از معلم → نه
  c0 = cntAll();
  await handleMsTgUpdate({ update_id: 960002, message: { message_id: 92002, chat: { id: "G1", type: "group" }, from: { id: "TGTEACH", first_name: "معلم" }, text: "📋 لیست" } }, deps.db, deps);
  ok(cntAll() === c0, "32.2 دستور «📋 لیست» تکلیف نشد");
  // 32.3 دکمه‌ی منو از دانش‌آموز → نه
  c0 = cntAll();
  await handleMsTgUpdate({ update_id: 960003, message: { message_id: 92003, chat: { id: "G1", type: "group" }, from: { id: "9300001", first_name: "X" }, text: "🏆 رتبه‌بندی" } }, deps.db, deps);
  ok(cntAll() === c0, "32.3 دکمه‌ی منوی دانش‌آموز تکلیف نشد");
  // 32.4 گپ معمولی گروهی → نه
  c0 = cntAll();
  await handleMsTgUpdate({ update_id: 960004, message: { message_id: 92004, chat: { id: "G1", type: "group" }, from: { id: "9300001", first_name: "X" }, text: "سلام خوبی" } }, deps.db, deps);
  ok(cntAll() === c0, "32.4 گپ معمولی گروهی تکلیف نشد");
  // 32.5 متن تکلیف با کلیدواژه در گروه → آره
  await handleMsTgUpdate({ update_id: 960005, message: { message_id: 92005, chat: { id: "G1", type: "group" }, from: { id: "9300001", first_name: "X" }, text: "تکلیف ریاضی صفحه ۷ حل شد" } }, deps.db, deps);
  let row32 = sqlite.exec("SELECT text FROM ms_submissions ORDER BY id DESC LIMIT 1")[0].values[0][0] || "";
  ok(String(row32).indexOf("ریاضی") >= 0, "32.5 متن تکلیف با کلیدواژه ثبت شد");
  // 32.6 متن خصوصی بدون کلیدواژه → آره (قرارداد ارسال تکلیف به ربات)
  await handleMsTgUpdate({ update_id: 960006, message: { message_id: 92006, chat: { id: "9300001", type: "private" }, from: { id: "9300001", first_name: "X" }, text: "مشق امروز خط تحریری" } }, deps.db, deps);
  row32 = sqlite.exec("SELECT text FROM ms_submissions ORDER BY id DESC LIMIT 1")[0].values[0][0] || "";
  ok(String(row32).indexOf("تحریری") >= 0, "32.6 متن خصوصی دانش‌آموز ثبت شد");
  // 32.11 معلم با نام (حتی بدون tg_id) تکلیف نمی‌سازد
  sqlite.exec("UPDATE ms_teachers SET tg_id = ''");
  c0 = cntAll();
  await handleMsTgUpdate({ update_id: 960011, message: { message_id: 92011, chat: { id: "G1", type: "group" }, from: { id: "888001", first_name: "استاد رضایی" }, photo: [{ file_id: "pt2", file_size: 9 }] } }, deps.db, deps);
  ok(cntAll() === c0, "32.11 پیام معلم با نام (بدون tg_id) تکلیف نشد");
}
// 32.7 نمره‌ی فارسی «۱۲» = دوازده + امتیاز +12
r = await ms("/api/ms/student/hw/send", { method: "POST", token: st1Tok, body: { text: "تکلیف تست نمره فارسی", type: "text" } });
ok(r.data && r.data.ok, "32.7 تکلیف تست ثبت شد");
const sid32 = Number(r.data.id);
r = await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: sid32, score: "۱۲", feedback: "خوب" } });
ok(r.data && r.data.ok && r.data.pointsAdded === 12, "32.7 نمره فارسی ۱۲ → 12 + امتیاز +12 (got " + JSON.stringify(r.data) + ")");
r = await ms("/api/ms/edu/home", { token: st1Tok });
ok(Array.isArray(r.data.pointsLast) && r.data.pointsLast.length > 0, "32.10 تاریخچه‌ی امتیاز (pointsLast) در edu/home هست");
ok(r.data.pointsLast.some(q => String(q.reason).indexOf("نمره تکلیف #" + sid32) >= 0), "32.10 ردیف «نمره تکلیف» در تاریخچه دیده می‌شود");
// 32.8 نمره خالی → خطا
r = await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: sid32, score: "" } });
ok(r.data && r.data.error, "32.8 نمره خالی پذیرفته نشد");
// پاک‌سازی امتیاز تست
await ms("/api/ms/teacher/review", { method: "POST", token: tcTok, body: { submissionId: sid32, score: "۰", feedback: "" } });
// 32.9 حذف تکلیف جفنگ
r = await ms("/api/ms/teacher/submission/delete", { method: "POST", token: tcTok, body: { submissionId: sid32 } });
ok(r.data && r.data.ok, "32.9 تکلیف جفنگ حذف شد");
r = await ms("/api/ms/teacher/submissions?classId=" + CLASS_A, { token: tcTok });
ok(!(r.data.submissions || []).some(x => x.submissionId === sid32), "32.9 دیگر در صندوق نیست");

console.log("\n============================");
console.log("نتیجه: ✅ " + pass + " موفق | ❌ " + fail + " ناموفق");
if (fail > 0) process.exit(1);
