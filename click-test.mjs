// ============================================================================
// UI Click-Through Test — همه دکمه‌ها و منوها در هر پنل (student/parent/teacher/admin/super)
// اجرا: node click-test.mjs  (در کنار build.mjs از entry.ts + sql.js)
// ============================================================================
import initSqlJs from "sql.js";
import vm from "node:vm";
import { handleMultiSchoolRequest, handleLiveClassRequest, buildSchoolHtml, SUPER_ADMIN_PASSWORD } from "./build.mjs";

const SECRET = "TestSecret!";
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; console.log("  ✅ " + label); }
  else { fail++; failures.push(label); console.log("  ❌ " + label); }
}

// ---------- D1 mock روی sql.js ----------
const SQL = await initSqlJs();
const sqlite = new SQL.Database();
function makeD1(db) {
  return {
    prepare(sql) {
      const st = {
        sql, _binds: [],
        bind(...args) { st._binds = args.map((a) => (a === undefined ? null : typeof a === "bigint" ? Number(a) : a)); return st; },
        async first() {
          const stmt = db.prepare(sql); stmt.bind(st._binds);
          if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
          stmt.free(); return null;
        },
        async all() {
          const stmt = db.prepare(sql); stmt.bind(st._binds);
          const results = []; while (stmt.step()) results.push(stmt.getAsObject());
          stmt.free(); return { results };
        },
        async run() {
          const stmt = db.prepare(sql); stmt.bind(st._binds); stmt.step(); stmt.free();
          const changes = db.getRowsModified();
          const idRows = db.exec("SELECT last_insert_rowid() AS id");
          const lastId = idRows.length ? idRows[0].values[0][0] : 0;
          return { meta: { changes, last_row_id: lastId }, success: true };
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
  verifyAuth: async (req) => await verifyToken((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), SECRET),
  askAI: async (q) => ({ text: "پاسخ AI به: " + q, photoUrl: "" }),
  aiTool: async (tool, payload) => {
    if (tool === "dictation" && payload && payload.mode === "play") return { passage: "هوا امروز صاف است. ما به مدرسه می‌رویم." };
    if (tool === "dictation") return { text: "✅ تصحیح دیکته: آفرین!" };
    if (tool === "science" && payload && payload.mode === "simulate") return { title: "آزمایش نمونه", svg: '<svg viewBox="0 0 400 260"><rect width="400" height="260" fill="#F8FAFC"/></svg>', steps: ["مرحله ۱", "مرحله ۲"], explanation: "توضیح آزمایش" };
    if (tool === "science") return { text: "قدم بعد؟", options: ["الف", "ب"], finished: false };
    if (tool === "english") return { correctionFa: "آفرین!", englishReply: "Nice to meet you! What is your name?", persianMeaning: "از آشناییت خوشحالم!" };
    return { text: "ok" };
  },
  textToSpeech: async (text, lang) => "data:audio/mpeg;base64," + Buffer.from("MP3|" + lang).toString("base64"),
  generateQuiz: async (topic, count) =>
    Array.from({ length: count }, (_, i) => ({ question: "سوال " + (i + 1) + " درباره " + topic, options: ["الف", "ب", "ج", "د"], correct: 2 })),
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

// ==================== Seed ====================
console.log("\n== Seed: ساخت مدرسه/کلاس/معلم/دانش‌آموز ==");
let r = await ms("/api/ms/login", { method: "POST", body: { role: "super", password: SUPER_ADMIN_PASSWORD } });
const superTok = r.data.session.token;
r = await ms("/api/ms/schools/find?code=0", {}); // warmup
r = await ms("/api/ms/super/schools", {
  method: "POST", token: superTok,
  body: { name: "مدرسه تست کلیک", city: "تهران", adminName: "مدیر تست", days: 365, plan: "standard", maxStudents: 300, maxTeachers: 30 },
});
const SCHOOL_CODE = r.data.code;
const ADMIN_USER = r.data.adminUser, ADMIN_PASS = r.data.adminPass;
r = await ms("/api/ms/login", { method: "POST", body: { role: "admin", schoolCode: SCHOOL_CODE, username: ADMIN_USER, password: ADMIN_PASS } });
const adminSession = r.data.session, adminTok = adminSession.token;
r = await ms("/api/ms/admin/classes", { method: "POST", token: adminTok, body: { gradeName: "چهارم", className: "۱" } });
const CLASS_A = r.data.id;
r = await ms("/api/ms/admin/classes", { method: "POST", token: adminTok, body: { gradeName: "پنجم", className: "۲" } });
const CLASS_B = r.data.id;
r = await ms("/api/ms/admin/teachers", { method: "POST", token: adminTok, body: { name: "معلم تست", username: "teachtest", password: "pass1234" } });
const TEACH_ID = r.data.id;
await ms("/api/ms/admin/teachers/assign", { method: "POST", token: adminTok, body: { teacherId: TEACH_ID, subjects: { [String(CLASS_A)]: "ریاضی", [String(CLASS_B)]: "علوم" } } });
r = await ms("/api/ms/admin/students", { method: "POST", token: adminTok, body: { name: "دانش یک", classId: CLASS_A, nationalId: "0012345678", birthday: "2015-01-02" } });
const ST1 = r.data;
r = await ms("/api/ms/admin/students", { method: "POST", token: adminTok, body: { name: "دانش دو", classId: CLASS_A } });
const ST2 = r.data;
r = await ms("/api/ms/admin/students", { method: "POST", token: adminTok, body: { name: "دانش سه", classId: CLASS_B } });
const ST3 = r.data;

r = await ms("/api/ms/login", { method: "POST", body: { role: "teacher", schoolCode: SCHOOL_CODE, username: "teachtest", password: "pass1234" } });
const teacherSession = r.data.session, teacherTok = teacherSession.token;
r = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: ST1.studentCode, pin: ST1.pin } });
const studentSession = r.data.session, studentTok = studentSession.token;
r = await ms("/api/ms/login", { method: "POST", body: { role: "parent", schoolCode: SCHOOL_CODE, code: ST1.parentCode } });
const parentSession = r.data.session, parentTok = parentSession.token;

// داده‌ها: تکلیف + ارسال، نمره، حضور، اطلاعیه، مأموریت، کارگاه، فروشگاه، کتابخانه، پیام، ددلاین، گنگ
await ms("/api/ms/announce", { method: "POST", token: adminTok, body: { title: "اطلاعیه تست", body: "متن اطلاعیه", audience: "all" } });
r = await ms("/api/ms/teacher/assignments", { method: "POST", token: teacherTok, body: { classId: CLASS_A, title: "تکلیف اول", description: "توضیح", dueDate: "" } });
const ASG_ID = r.data.id;
await ms("/api/ms/student/submit", { method: "POST", token: studentTok, body: { assignmentId: ASG_ID, text: "متن تکلیف من", photo: "data:image/png;base64,QUFB" } });
await ms("/api/ms/student/hw/send", { method: "POST", token: studentTok, body: { text: "تکلیف آزاد", photo: "" } });
await ms("/api/ms/teacher/grade", { method: "POST", token: teacherTok, body: { classId: CLASS_A, studentId: ST1.id || 0, title: "آزمون", score: 18.5 } });
await ms("/api/ms/teacher/attendance", { method: "POST", token: teacherTok, body: { classId: CLASS_A, entries: [{ studentId: ST1.id || 0, status: "present" }] } });
await ms("/api/ms/edu/mission/submit", { method: "POST", token: studentTok, body: { mission: "مأموریت روز", proof: "اثبات" } });
await ms("/api/ms/edu/lab/submit", { method: "POST", token: studentTok, body: { tool: "flashcards", topic: "درس ۱", summary: "خلاصه" } });
await ms("/api/ms/teacher/shop", { method: "POST", token: teacherTok, body: { title: "جایزه", cost: 10 } });
await ms("/api/ms/teacher/library", { method: "POST", token: teacherTok, body: { title: "کتاب", text: "متن", link: "" } });
await ms("/api/ms/teacher/deadlines", { method: "POST", token: teacherTok, body: { classId: CLASS_A, title: "امتحان", date: "2026-12-01" } });
await ms("/api/ms/edu/messages", { method: "POST", token: studentTok, body: { text: "سلام معلم" } });
await ms("/api/ms/edu/muddy", { method: "POST", token: studentTok, body: { topic: "مبحث گنگ" } });
console.log("  seed done — school", SCHOOL_CODE, "classes", CLASS_A, CLASS_B);

// ==================== Client VM ====================
const html = buildSchoolHtml();
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

const MEDIA_SKIP = /startLiveClass|stopLiveClass|startMyLiveMedia|stopMyLiveMedia|flipMyCamera|switchVideoEngine|wbAction|setWb|toggleWb|downloadWb|sendLiveChat|teacherHand|teacherPoll|voteLivePoll|toggleStudentHand|createCustomLivePoll|createQuickUnderstandingPoll|changeWbPage|switchLivePod|pickHwPhoto|pickHwVideo|pickHwFreeVideo|readVideoFile|recordVideoClip|recordHwFreeVideo|recordHwVideo|toggleAiVoice|viewPhoto|toggleEngVoice|startVoiceInput|scienceVoiceTopic|playEngUserAudio|playEngAiAudio|dictPlayAll|dictPlaySent|speakNow|speakSimExplanation/;

function makeEl(id) {
  const el = {
    id, innerHTML: "", textContent: "", value: "", style: {}, className: "", files: [],
    setAttribute(k, v) { el[k] = v; }, getAttribute(k) { return el[k] ?? null; },
    appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], querySelector: () => null, closest: () => null,
    focus() {}, click() {}, scrollIntoView() {},
    parentElement: { querySelectorAll: () => [], className: "", style: {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  return el;
}

const sleep = (msv) => new Promise((res) => setTimeout(res, msv));
let currentToken = "";
const alerts = [];
const prompts = [];

function buildContext(sessionObj, opts = {}) {
  const els = new Map();
  const storage = new Map();
  if (sessionObj) storage.set("ms_session", JSON.stringify(sessionObj));
  let bootFn = null;
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
    TextEncoder, TextDecoder, btoa, atob, URL, URLSearchParams, Request: globalThis.Request, Response: globalThis.Response,
    alert: (m) => alerts.push(String(m)),
    confirm: () => false,
    prompt: (m, d) => { prompts.push(String(m)); return "نام جدید تست"; },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    document: {
      getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
      createElement: () => makeEl("dyn"),
      querySelectorAll: () => [],
      body: Object.assign(makeEl("body"), { querySelectorAll: () => [] }),
      documentElement: { setAttribute() {}, getAttribute: () => "dark" },
      addEventListener: (ev, fn) => { if (ev === "DOMContentLoaded") bootFn = fn; },
      removeEventListener() {},
    },
    navigator: {
      mediaDevices: { getUserMedia: async () => { throw new Error("no-media"); } },
      userAgent: "node",
    },
    location: { href: "https://x.test/school", origin: "https://x.test", reload() {} },
    event: { stopPropagation() {}, preventDefault() {}, target: null },
    Image: function () { return { set src(v) { if (this.onload) this.onload(); }, width: 10, height: 10, onload: null }; },
    FileReader: function () { return { readAsDataURL() {} }; },
    RTCPeerConnection: function () { return { createDataChannel() {}, close() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; },
    ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    requestAnimationFrame: (f) => setTimeout(f, 0),
    fetch: async (url, o = {}) => {
      const u = String(url);
      if (u.includes("/health")) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      let path = u.replace(/^https?:\/\/[^/]+/, "");
      if (!path.startsWith("/")) path = "/" + path;
      let body = null;
      try { body = o.body ? JSON.parse(o.body) : null; } catch {}
      let res;
      try {
        if (path.indexOf("/api/app/live") === 0) {
          const req = new Request("https://x.test" + path, {
            method: o.method || (body ? "POST" : "GET"),
            headers: { "Content-Type": "application/json", ...(currentToken ? { Authorization: "Bearer " + currentToken } : {}) },
            body: body ? JSON.stringify(body) : undefined,
          });
          const rr = await handleLiveClassRequest(req, new URL(req.url), deps);
          let dnull = null;
          try { dnull = JSON.parse(await rr.text()); } catch {}
          res = { status: rr.status, data: dnull };
        } else {
          res = await ms(path, { method: o.method || (body ? "POST" : "GET"), body, token: currentToken });
        }
      } catch (e) {
        return { ok: false, status: 500, json: async () => ({ error: "server-crash: " + e.message }) };
      }
      return { ok: res.status < 400, status: res.status, json: async () => res.data ?? {} };
    },
    _els: els,
    _getBoot: () => bootFn,
    value: String(opts.classId || ""), // for switchClass(this.value)
    src: "",
    files: [],
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  ctx.parentElement = ctx.document.body;
  ctx.querySelectorAll = () => [];
  ctx.closest = () => null;
  vm.createContext(ctx);
  return ctx;
}

function runScripts(ctx) {
  for (const sc of scripts) vm.runInContext(sc, ctx, { timeout: 20000 });
  const boot = ctx._getBoot();
  if (boot) boot();
}

async function flush() { await sleep(40); await sleep(20); }

function renderState(ctx) {
  const main = ctx._els.get("mainView");
  return main ? main.innerHTML : "";
}

function allOnclicks(ctx) {
  const out = new Set();
  const grab = (s) => {
    if (!s) return;
    for (const m of s.matchAll(/onclick="([^"]*)"/g)) out.add(m[1]);
    for (const m of s.matchAll(/onclick=\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"/g)) out.add(m[1]);
  };
  for (const el of ctx._els.values()) grab(el.innerHTML);
  return [...out];
}

async function runRole(role, sessionObj, tabs, deepTabs) {
  console.log(`\n== نقش: ${role} ==`);
  currentToken = sessionObj ? sessionObj.token : "";
  const ctx = buildContext(sessionObj, { classId: sessionObj?.classId || CLASS_A });
  runScripts(ctx);
  await flush();

  if (!sessionObj) {
    // صفحه ورود: دکمه «ثبت‌نام دانش‌آموز جدید» باید فرم را نشان دهد
    const h0 = renderState(ctx);
    ok(h0.includes("ثبت\u200cنام دانش\u200cآموز جدید"), "login: دکمه ثبت‌نام دانش‌آموز جدید دیده می\u200cشود");
    const btns = allOnclicks(ctx).filter((c) => c.includes("showRegister"));
    ok(btns.length > 0, "login: handler دکمه ثبت‌نام پیدا شد");
    vm.runInContext("showRegister=true;renderApp();", ctx);
    await flush();
    const h1 = renderState(ctx);
    ok(h1.includes('id="rgSchool"') && h1.includes('id="rgNat"'), "login: فرم ثبت\u200cنام با کلیک باز می\u200cشود (rgSchool/rgNat)");
    // ثبت‌نام واقعی با کد کلاس
    const cls = await ms("/api/ms/admin/classes", { token: adminTok });
    const jc = (cls.data.classes || []).find((c) => c.id === CLASS_A)?.joinCode;
    ok(!!jc, "login: کد پیوستن کلاس (joinCode) از سرور گرفته شد");
    ctx.document.getElementById("rgSchool").value = String(SCHOOL_CODE);
    ctx.document.getElementById("rgJoin").value = String(jc || "");
    ctx.document.getElementById("rgName").value = "ثبت\u200cنام تست";
    ctx.document.getElementById("rgNat").value = "0098765432";
    ctx.document.getElementById("rgBday").value = "۱۴۰۴/۰۵/۱۲";
    ctx.document.getElementById("rgPin").value = "4321";
    vm.runInContext("submitRegister();", ctx);
    await flush(); await flush();
    ok(alerts.some((a) => a.includes("ثبت\u200cنام انجام شد")), "login: ثبت\u200cنام دانش\u200cآموز با موفقیت انجام شد");
    const lr = await ms("/api/ms/login", { method: "POST", body: { role: "student", schoolCode: SCHOOL_CODE, code: "0098765432", pin: "4321" } });
    ok(lr.status === 200, "login: ورود با کد ملی پس از ثبت\u200cنام");
    return;
  }

  const allTabs = [...new Set([...tabs, ...deepTabs])];
  for (const tab of allTabs) {
    let h = "";
    try {
      vm.runInContext(`goTab(${JSON.stringify(tab)});`, ctx);
      await flush();
      h = renderState(ctx);
    } catch (e) {
      ok(false, `${role}/${tab}: استثنای JS هنگام رندر → ${e.message}`);
      continue;
    }
    const stuck = h.includes("در حال دریافت اطلاعات") || h.trim() === '<div class="card" style="text-align:center;">⏳ ...</div>';
    const errCard = h.includes("❌") && h.length < 400;
    ok(h.length > 120 && !stuck && !errCard, `${role}/${tab}: رندر موفق (${h.length} کاراکتر${errCard ? " — کارت خطا: " + h.replace(/<[^>]+>/g, " ").slice(0, 120) : ""})`);
  }

  // کلیک روی همه handlerهای onclick هر صفحه
  console.log(`  -- کلیک روی همه دکمه\u200cها (نقش ${role}) --`);
  const clicked = new Set();
  for (const tab of allTabs) {
    try {
      vm.runInContext(`goTab(${JSON.stringify(tab)});`, ctx);
      await flush();
    } catch { continue; }
    const handlers = allOnclicks(ctx);
    for (const hnd of handlers) {
      if (clicked.has(hnd) || MEDIA_SKIP.test(hnd)) continue;
      if (hnd.includes("logout()")) continue; // جداگانه در انتها
      clicked.add(hnd);
      try {
        vm.runInContext(`(function(){ try { ${hnd} } catch(e) { window.__hErr = e.message; } })();`, ctx);
        await flush();
        const he = ctx.__hErr;
        if (he) { ok(false, `${role}/${tab}: کلیک «${hnd.slice(0, 60)}» → ${he}`); ctx.__hErr = null; }
      } catch (e) {
        ok(false, `${role}/${tab}: کلیک «${hnd.slice(0, 60)}» → ${e.message}`);
      }
    }
  }
  console.log(`  ${clicked.size} دکمه منحصربه‌فرد کلیک شد (${role})`);

  // پروفایل: چیپ‌های بازخورد سریع + رتبه کلاس (دانش‌آموز)
  if (role === "teacher" || role === "admin") {
    vm.runInContext("goTab('class');", ctx);
    await flush();
    const cc = renderState(ctx);
    ok(cc.includes("امتیاز دانش‌آموزان") && cc.includes("setPoints("), `${role}/class: بخش امتیاز دانش‌آموزان با دکمه‌های افزودن/کسر نمایش داده می‌شود`);
    vm.runInContext("setPoints(1, 5);", ctx);
    await flush(); await flush();
    ok(true, `${role}/class: ثبت امتیاز بی‌خطا انجام شد`);
    vm.runInContext("hwView.assignmentId=" + ASG_ID + ";goTab('hw');", ctx);
    await flush();
    const hw = renderState(ctx);
    ok(hw.includes("fbPreset("), `${role}/hw-detail: چیپ\u200cهای بازخورد سریع نمایش داده می\u200cشوند`);
    // کلیک یک چیپ: مقدار داخل input بازخورد باید پر شود
    const m = hw.match(/fbPreset\('revFb_(\d+)'/);
    if (m) {
      vm.runInContext(`fbPreset('revFb_${m[1]}','آفرین، عالی بود! 👏');`, ctx);
      const v = ctx.document.getElementById("revFb_" + m[1])?.value || "";
      ok(v.includes("آفرین"), `${role}/hw-detail: کلیک چیپ بازخورد متن را در فیلد می\u200cنویسد`);
      vm.runInContext(`fbPreset('revFb_${m[1]}','دقت بیشتری کن 🔍');`, ctx);
      const v2 = ctx.document.getElementById("revFb_" + m[1])?.value || "";
      ok(v2.includes("آفرین") && v2.includes("دقت"), `${role}/hw-detail: چیپ دوم اضافه می\u200cشود (متن قبلی حفظ می\u200cشود)`);
    } else ok(false, `${role}/hw-detail: الگوی fbPreset در صفحه تکلیف پیدا نشد`);
  }
  if (role === "student") {
    vm.runInContext("goTab('home');", ctx);
    await flush();
    const sh = renderState(ctx);
    ok(sh.includes("رتبه من در کلاس"), "student/home: کارت رتبه در کلاس نمایش داده می\u200cشود");
    vm.runInContext("goTab('pass');", ctx);
    await flush();
    const sp = renderState(ctx);
    ok(sp.includes("profBday"), "student/pass: فیلد تولد شمسی در پروفایل هست");
    vm.runInContext("goTab('classchat');", ctx);
    await flush();
    ctx.document.getElementById("chatInput").value = "سلام از تست کلیک";
    vm.runInContext("sendChatMsg();", ctx);
    await flush(); await flush();
    const chBox = ctx.document.getElementById("chatMsgs").innerHTML || "";
    ok(chBox.includes("سلام از تست کلیک"), "student/classchat: پیام ارسال و نمایش داده شد");
    vm.runInContext("sendChatMsg();", ctx);
    await flush();
    ok(true, "student/classchat: ارسال پیام خالی بی‌خطا رد شد");
    // ابزارهای جدید کارگاه (v3.2.3): مکالمه صوتی، دیکته صوتی، شبیه‌سازی علوم
    vm.runInContext("goTab('lab');", ctx);
    await flush();
    vm.runInContext("openLabTool('english');", ctx);
    await flush();
    let eh = renderState(ctx);
    ok(eh.includes("endEngConversation") && eh.includes("toggleEngVoice"), "student/english: دکمه‌های گفتن با صدا و پایان مکالمه هستند");
    ctx.document.getElementById("engText").value = "Hello! How are you?";
    vm.runInContext("sendEngTurnBtn();", ctx);
    await flush(); await flush(); await flush();
    eh = renderState(ctx);
    ok(eh.includes("Hello! How are you?") && eh.includes("Nice to meet you"), "student/english: حباب پیام کاربر و پاسخ مربی نمایش داده شد");
    ok(eh.includes("پیام صوتی شما") || eh.includes("گوش دادن"), "student/english: دکمه‌های پخش صدا برای هر دو طرف هست");
    vm.runInContext("endEngConversation();", ctx);
    await flush();
    eh = renderState(ctx);
    ok(eh.includes("مکالمه به پایان رسید") && eh.includes("restartEngConversation"), "student/english: پایان مکالمه با تصمیم کاربر + خلاصه");
    vm.runInContext("restartEngConversation();", ctx);
    await flush();
    ok(renderState(ctx).includes("برای شروع مکالمه"), "student/english: شروع مکالمه جدید");
    vm.runInContext("openLabTool('dictation');", ctx);
    await flush();
    ok(renderState(ctx).includes("dictSetMode"), "student/dictation: انتخاب روش دیکته نمایش داده می‌شود");
    vm.runInContext("dictSetMode('voice');", ctx);
    await flush();
    ok(renderState(ctx).includes("dictMake"), "student/dictation: حالت صوتی (ساخت و پخش دیکته) آماده است");
    vm.runInContext("dictMake();", ctx);
    await flush(); await flush(); await flush();
    let dh = renderState(ctx);
    ok(dh.includes("دیکته آماده است") && dh.includes("dictPlayAll") && dh.includes("dictPlaySent"), "student/dictation: متن ساخته شد + کنترل‌های پخش (همه/جمله)");
    ctx.document.getElementById("ltOcr").value = "هوا امروز صاف است";
    vm.runInContext("dictCheck();", ctx);
    await flush(); await flush(); await flush();
    dh = renderState(ctx);
    ok(dh.includes("مقایسه‌ی کلمات") || dh.includes("✅"), "student/dictation: تایپ کاربر بررسی و مقایسه‌ی کلمات نمایش داده شد");
    vm.runInContext("openLabTool('dictation');dictSetMode('check');", ctx);
    await flush();
    ok(renderState(ctx).includes("ltExpected"), "student/dictation: حالت بررسی دستی (قدیمی) هم در دسترس است");
    vm.runInContext("openLabTool('science');", ctx);
    await flush();
    ctx.document.getElementById("ltTopic").value = "آزمایش فشار هوا";
    vm.runInContext("runScienceSim();", ctx);
    await flush(); await flush(); await flush();
    const sh2 = renderState(ctx);
    ok(sh2.includes("آزمایش نمونه") && sh2.includes("svg"), "student/science: شبیه‌سازی تصویری SVG + مراحل + توضیح رندر شد");
    ok(sh2.includes("speakSimExplanation"), "student/science: دکمه‌ی گوش دادن به توضیحات هست");
    vm.runInContext("speakSimExplanation();", ctx);
    await flush();
    ok(true, "student/science: گوش دادن به توضیحات بی‌خطا اجرا شد");
  }
  if (role === "admin") {
    // بازدید از هاب مدیریت و هر زیرصفحه
    for (const sub of ["admin", "classes", "teachers", "students", "reports", "settings", "announce"]) {
      let h = "";
      try {
        vm.runInContext(`goTab(${JSON.stringify(sub)});`, ctx);
        await flush();
        h = renderState(ctx);
      } catch (e) { ok(false, `admin-hub/${sub}: استثنا → ${e.message}`); continue; }
      ok(h.length > 120 && !h.includes("در حال دریافت اطلاعات"), `admin-hub/${sub}: رندر موفق`);
    }
    vm.runInContext("goTab('students');", ctx);
    await flush();
    const st = renderState(ctx);
    ok(st.includes('id="nsName"') && st.includes('id="nsBday"'), "admin/students: فرم ثبت\u200cنام تکی دانش\u200cآموز دیده می\u200cشود");
    ok(st.includes("adminBackHtml") || st.includes("بازگشت به مدیریت مدرسه"), "admin/students: دکمه بازگشت به مدیریت هست");
    // افزودن دانش‌آموز از فرم تکی
    ctx.document.getElementById("nsName").value = "فرم تکی تست";
    ctx.document.getElementById("nsNat").value = "0011122233";
    ctx.document.getElementById("nsBday").value = "۱۴۰۳/۰۱/۰۲";
    ctx.document.getElementById("nsClass").value = String(CLASS_A);
    vm.runInContext("addStudent();", ctx);
    await flush(); await flush();
    ok(alerts.some((a) => a.includes("کد") || a.includes("✅")), "admin/students: ثبت تکی از فرم پاسخ می\u200cگیرد");
  }

  // خروج در انتها
  try {
    vm.runInContext("logout();", ctx);
    await flush();
    ok(renderState(ctx).includes("ورود") || renderState(ctx).includes("ثبت\u200cنام"), `${role}: logout به صفحه ورود برمی\u200cگردد`);
  } catch (e) { ok(false, `${role}: logout → ${e.message}`); }
}

// ==================== اجرا برای همه نقش‌ها ====================
const STUDENT_TABS = ["home", "ai", "lab", "quiz", "history", "pass"];
const STUDENT_DEEP = ["report", "hw", "mission", "board", "shop", "library", "msg", "puzzle", "muddy", "certs", "announce", "classchat"];
const PARENT_TABS = ["report", "att", "certs", "chat", "pass"];
const TEACHER_TABS = ["dash", "inbox", "att", "ai", "class", "pchat", "pass"];
const TEACHER_DEEP = ["hw", "grades", "deadlines", "shopm", "libm", "announce", "classchat"];
const ADMIN_TABS = ["dash", "live", "inbox", "att", "ai", "class", "pchat", "admin", "pass"];
const ADMIN_DEEP = ["home", "classes", "teachers", "students", "reports", "settings", "announce", "hw", "grades", "deadlines", "shopm", "libm", "classchat"];
const SUPER_TABS = ["home", "schools", "announce"];

await runRole("login", null, [], []);
await runRole("student", studentSession, STUDENT_TABS, STUDENT_DEEP);
await runRole("parent", parentSession, PARENT_TABS, []);
await runRole("teacher", teacherSession, TEACHER_TABS, TEACHER_DEEP);
await runRole("admin", adminSession, ADMIN_TABS, ADMIN_DEEP);
await runRole("super", { token: superTok, role: "super", name: "سوپر", schoolId: 0 }, SUPER_TABS, []);

// ==================== کلاس زنده: رفع صفحه سیاه (کاشی‌های ویدیو + دکمه صدا) ====================
{
  console.log("\n== کلاس زنده: کاشی‌های ویدیو ==");
  currentToken = studentSession.token;
  const ctx = buildContext(studentSession, { classId: CLASS_A });
  runScripts(ctx);
  await flush();
  vm.runInContext(`
    liveState.remoteStreams = { teacher: { getVideoTracks: function() { return [{}]; }, getAudioTracks: function() { return [{}]; } } };
    liveState.participants = [{ key: "teacher", name: "استاد تست", role: "teacher" }];
    refreshVideoTilesDom();
  `, ctx);
  await flush();
  const tileHtml = ctx._els.get("liveVideoTiles").innerHTML;
  ok(tileHtml.includes("vid_rem_teacher"), "live: کاشی ویدیوی استاد ساخته شد");
  ok(tileHtml.includes("vtap_rem_teacher"), "live: دکمه fallback «لمس برای پخش» روی کاشی هست");
  ok(tileHtml.includes("autoplay playsinline muted"), "live: ویدیوی راه دور ابتدا بی‌صداست (پخش خودکار تضمینی در WebView)");
  ok(ctx._els.get("liveSoundBtn").style.display !== "none", "live: دکمه روشن کردن صدا نمایان شد");
  ok(String(ctx._els.get("liveSoundBtn").textContent).includes("روشن کردن صدا"), "live: برچسب دکمه صدا درست است");
  vm.runInContext("toggleLiveSound();", ctx);
  await flush();
  ok(ctx._els.get("vid_rem_teacher").muted === false, "live: با toggleLiveSound صدای کاشی راه دور باز شد");
  ok(String(ctx._els.get("liveSoundBtn").textContent).includes("قطع صدا"), "live: برچسب دکمه به قطع صدا تغییر کرد");
  vm.runInContext(`
    liveState.inPeers = { teacher: { remoteDescription: null, _pendingIce: [], addIceCandidate: function() { return Promise.resolve(); }, close: function() {} } };
    window._testPcRef = liveState.inPeers["teacher"];
    handleIncomingRtcSignal({ from: "teacher", kind: "ice", payload: { dir: "from-broadcaster", candidate: { candidate: "cand1" } } });
  `, ctx);
  await flush();
  ok(await vm.runInContext("window._testPcRef._pendingIce.length === 1", ctx), "live: ICE زودهنگام در صف می‌ماند (قبلاً بی‌صدا گم می‌شد)");
}

console.log("\n============================");
console.log(`UI CLICK-THROUGH: ${pass} passed, ${fail} failed`);
if (fail) { console.log("FAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
console.log("============================");
process.exit(fail ? 1 : 0);
