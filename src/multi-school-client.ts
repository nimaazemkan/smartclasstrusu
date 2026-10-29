// ============================================================================
// 🏫 رابط کاربری «شبکه مدارس هوشمند» (سامانه چندمدرسه‌ای — /school)
// ۵ نقش: دانش‌آموز • والدین • معلم • مدیر مدرسه • مدیر ارشد
// بدون هیچ وابستگی خارجی — قابل اجرا در اندروید، آیفون و وب
// ============================================================================

import { LIVE_CLASS_CSS, LIVE_CLASS_JS } from "./live-class-client";

const SCHOOL_JS = String.raw`
    var BUILTIN_API_BASE = "";
    var session = null;
    try { session = JSON.parse(localStorage.getItem("ms_session") || "null"); } catch (e) {}
    var activeTab = "home";
    var loginRole = "student";
    var selSchool = null;
    var selClassId = 0;
    try { selClassId = Number(localStorage.getItem("ms_class") || 0); } catch (e) {}
    var msData = null;
    var tcClass = null;
    var adminAll = { students: [], classes: [], teachers: [] };
    var schoolResults = [];
    var lastBulkResults = [];

    function getApiBase() {
      var saved = (localStorage.getItem("ms_api_base") || "").trim();
      if (saved && (saved.toLowerCase().indexOf("https://") === 0 || saved.toLowerCase().indexOf("http://") === 0)) {
        return saved.replace(/\/+$/, "");
      }
      if (BUILTIN_API_BASE) return BUILTIN_API_BASE.replace(/\/+$/, "");
      return "";
    }

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function showToast(msg) {
      var el = document.getElementById("toast");
      el.textContent = msg;
      el.style.display = "block";
      clearTimeout(window._msToastTimer);
      window._msToastTimer = setTimeout(function () { el.style.display = "none"; }, 3400);
    }

    function fmtDate(iso) {
      try {
        return new Date(iso).toLocaleDateString("fa-IR-u-ca-persian");
      } catch (e) { return iso; }
    }

    // ===== تبدیل تاریخ شمسی/میلادی (الگوریتم jalaali) =====
    function jDiv(a, b) { return ~~(a / b); }
    function jMod(a, b) { return a - ~~(a / b) * b; }
    function jalCal(jy) {
      var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 1701, 1866, 2020, 2449];
      var bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump, leap, leapG, march, n, i;
      if (jy < jp || jy >= breaks[bl - 1]) return null;
      for (i = 1; i < bl; i += 1) {
        jm = breaks[i]; jump = jm - jp;
        if (jy < jm) break;
        leapJ = leapJ + jDiv(jump, 33) * 8 + jDiv(jMod(jump, 33), 4);
        jp = jm;
      }
      n = jy - jp;
      leapJ = leapJ + jDiv(n, 33) * 8 + jDiv(jMod(n, 33) + 3, 4);
      if (jMod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
      leapG = jDiv(gy, 4) - jDiv((jDiv(gy, 100) + 1) * 3, 4) - 150;
      march = 20 + leapJ - leapG;
      if (jump - n < 6) n = n - jump + jDiv(jump + 4, 33) * 33;
      leap = jMod(jMod(n + 1, 33) - 1, 4);
      if (leap === -1) leap = 4;
      return { leap: leap, gy: gy, march: march };
    }
    function g2d(gy, gm, gd) {
      var d = jDiv((gy + jDiv(gm - 8, 6) + 100100) * 1461, 4) + jDiv(153 * jMod(gm + 9, 12) + 2, 5) + gd - 34840408;
      return d - jDiv(jDiv(gy + 100100 + jDiv(gm - 8, 6), 100) * 3, 4) + 752;
    }
    function d2g(jdn) {
      var j = 4 * jdn + 139361631;
      j = j + jDiv(jDiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
      var i = jDiv(jMod(j, 1461), 4) * 5 + 308;
      var gd = jDiv(jMod(i, 153), 5) + 1;
      var gm = jMod(jDiv(i, 153), 12) + 1;
      var gy = jDiv(j, 1461) - 100100 + jDiv(8 - gm, 6);
      return { gy: gy, gm: gm, gd: gd };
    }
    function j2d(jy, jm, jd) {
      var r = jalCal(jy);
      if (!r) return null;
      return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - jDiv(jm, 7) * (jm - 7) + jd - 1;
    }
    function d2j(jdn) {
      var g = d2g(jdn), gy = g.gy, jy = gy - 621, r = jalCal(jy), jdn1f = g2d(gy, 3, r.march), k;
      k = jdn - jdn1f;
      if (k >= 0) {
        if (k <= 185) return { jy: jy, jm: 1 + jDiv(k, 31), jd: jMod(k, 31) + 1 };
        k -= 186;
      } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
      return { jy: jy, jm: 7 + jDiv(k, 30), jd: jMod(k, 30) + 1 };
    }
    function jPad(n) { return (n < 10 ? "0" : "") + n; }
    function gregorianToJalali(iso) {
      if (!iso || String(iso).length < 10) return "";
      var p = String(iso).slice(0, 10).split("-");
      if (p.length !== 3) return "";
      try {
        var j = d2j(g2d(Number(p[0]), Number(p[1]), Number(p[2])));
        return j.jy + "/" + jPad(j.jm) + "/" + jPad(j.jd);
      } catch (e) { return ""; }
    }
    function jalaliToGregorian(str) {
      var p = normDigits(String(str || "")).replace(/[\-\.\s]/g, "/").split("/").filter(Boolean);
      if (p.length !== 3) return null;
      var jy = Number(p[0]), jm = Number(p[1]), jd = Number(p[2]);
      if (!(jy > 1240 && jy < 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31)) return null;
      var d = j2d(jy, jm, jd);
      if (d === null) return null;
      var g = d2g(d);
      return g.gy + "-" + jPad(g.gm) + "-" + jPad(g.gd);
    }

    function normDigits(str) {
      return String(str || "")
        .replace(/[۰-۹]/g, function (d) { return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)); })
        .replace(/[٠-٩]/g, function (d) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); })
        .trim();
    }

    async function api(path, body, method) {
      var base = getApiBase();
      var headers = { "Content-Type": "application/json" };
      if (session && session.token) headers["Authorization"] = "Bearer " + session.token;
      var opts = { method: method || (body ? "POST" : "GET"), headers: headers };
      if (body) opts.body = JSON.stringify(body);
      var res;
      try {
        res = await fetch(base + path, opts);
      } catch (e1) {
        try {
          showToast("⏳ در حال اتصال به سرور...");
          await fetch(base + "/health", { method: "GET", cache: "no-store" }).catch(function () {});
          await new Promise(function (r) { setTimeout(r, 1600); });
          res = await fetch(base + path, opts);
        } catch (e2) {
          throw new Error("اختلال در اینترنت یا سرور — دوباره تلاش کنید.");
        }
      }
      var data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res.ok || (data && data.error)) {
        if (res.status === 401 && session && path !== "/api/ms/login" && path.indexOf("/password") === -1) {
          logout();
        }
        throw new Error((data && data.error) || ("خطای ارتباط (" + res.status + ")"));
      }
      return data;
    }

    function logout() {
      session = null;
      msData = null;
      tcClass = null;
      try { localStorage.removeItem("ms_session"); } catch (e) {}
      window.LIVE_ROOM_KEY = "";
      if (typeof stopLivePollingOnly === "function") stopLivePollingOnly();
      if (typeof cleanupAllRtc === "function") cleanupAllRtc();
      activeTab = "home";
      renderApp();
    }

    // ==================== صفحه ورود و پیدا کردن مدرسه ====================
    var loginSchools = null;
    var loginPending = null;
    var showRegister = false;

    function pickLoginSchool(code) {
      if (!loginPending) return;
      loginPending.schoolCode = code;
      loginSchools = null;
      submitLogin(loginPending);
    }

    function cancelLoginSchools() {
      loginSchools = null;
      loginPending = null;
      renderApp();
    }

    async function submitRegister() {
      try {
        var body = {
          schoolCode: ((document.getElementById("rgSchool") || {}).value || "").trim(),
          joinCode: ((document.getElementById("rgJoin") || {}).value || "").trim(),
          name: ((document.getElementById("rgName") || {}).value || "").trim(),
          nationalId: ((document.getElementById("rgNat") || {}).value || "").trim(),
          birthday: "",
          pin: ((document.getElementById("rgPin") || {}).value || "").trim(),
        };
        var rgBd = ((document.getElementById("rgBday") || {}).value || "").trim();
        if (rgBd) {
          body.birthday = jalaliToGregorian(rgBd) || "";
          if (!body.birthday) return showToast("تاریخ تولد شمسی نامعتبر است (مثال: 1404/05/12)");
        }
        if (!body.schoolCode || !body.joinCode || !body.name || !body.nationalId) return showToast("کد مدرسه، کد کلاس، نام و کد ملی لازم است");
        var r = await api("/api/ms/register/student", body);
        showRegister = false;
        renderApp();
        alert("✅ ثبت‌نام انجام شد!\n\nکد دانش‌آموزی: " + r.studentCode + "\nکد والدین: " + r.parentCode + "\nرمز: " + r.pin + "\n\nاین‌ها را نگه دارید و با کد ملی یا کد دانش‌آموزی وارد شوید.");
      } catch (e) { showToast("❌ " + e.message); }
    }

    function renderLogin(main) {
      main = main || document.getElementById("mainView");
      if (loginSchools && loginSchools.length) {
        main.innerHTML =
          '<div class="auth-wrap"><div class="auth-card">' +
            '<div class="auth-hero"><div style="font-size:38px;">🏫</div><h1>انتخاب مدرسه</h1>' +
            '<p>شما در چند مدرسه ثبت شده‌اید؛ مدرسه موردنظر را انتخاب کنید</p></div>' +
            loginSchools.map(function (s) {
              return '<button class="btn" style="width:100%;margin:6px 0;background:var(--surface-2);color:var(--text);border:1px solid var(--border);justify-content:flex-start;" onclick="pickLoginSchool(\'' + s.code + '\')">🏫 ' + esc(s.name) + (s.city ? ' — ' + esc(s.city) : '') + '</button>';
            }).join("") +
            '<button class="btn btn-ghost" style="width:100%;margin-top:10px;" onclick="cancelLoginSchools()">🔙 انصراف</button>' +
          '</div></div>';
        return;
      }
      var roleTabs = [
        { id: "student", label: "🎓 دانش‌آموز" },
        { id: "parent", label: "👪 والدین" },
        { id: "teacher", label: "👨‍🏫 معلم" },
        { id: "admin", label: "🏫 مدیر مدرسه" },
        { id: "super", label: "⭐ مدیر ارشد" }
      ];
      var credHtml = "";
      if (loginRole === "student") {
        credHtml =
          '<label>کد دانش‌آموزی</label>' +
          '<input id="msCode" class="input" inputmode="numeric" placeholder="کد ۶ رقمی" />' +
          '<label>رمز عبور</label>' +
          '<input id="msPin" class="input" type="password" placeholder="رمز (پیش‌فرض 1234)" />';
      } else if (loginRole === "parent") {
        credHtml =
          '<label>کد والدین</label>' +
          '<input id="msCode" class="input" inputmode="numeric" placeholder="کد ۶ رقمی والدین" />' +
          '<label>رمز عبور (در صورت تنظیم)</label>' +
          '<input id="msPin" class="input" type="password" placeholder="اختیاری" />';
      } else if (loginRole === "teacher" || loginRole === "admin") {
        credHtml =
          '<label>نام کاربری</label>' +
          '<input id="msUser" class="input" autocomplete="username" placeholder="مثلاً nimaazemkan" />' +
          '<label>رمز عبور</label>' +
          '<input id="msPass" class="input" type="password" autocomplete="current-password" placeholder="رمز عبور" />';
      } else {
        credHtml =
          '<label>رمز مدیر ارشد</label>' +
          '<input id="msPass" class="input" type="password" placeholder="رمز مدیر ارشد سامانه" />';
      }
      if (showRegister) {
        main.innerHTML =
          '<div class="auth-wrap"><div class="auth-card">' +
            '<div class="auth-hero" style="padding:16px 12px;"><div style="font-size:32px;">✍️</div><h1 style="font-size:17px;">ثبت‌نام دانش‌آموز</h1>' +
            '<p>کد مدرسه و کد کلاس را از معلم بگیرید</p></div>' +
            '<label>کد مدرسه</label><input id="rgSchool" class="input" inputmode="numeric" placeholder="مثلاً 4915" />' +
            '<label>کد کلاس</label><input id="rgJoin" class="input" inputmode="numeric" placeholder="کد ۶ رقمی کلاس" />' +
            '<label>نام و نام خانوادگی</label><input id="rgName" class="input" placeholder="نام کامل" />' +
            '<label>کد ملی (نام کاربری شما)</label><input id="rgNat" class="input" inputmode="numeric" placeholder="کد ملی ۱۰ رقمی" />' +
            '<label>تاریخ تولد شمسی (اختیاری)</label><input id="rgBday" class="input" dir="ltr" placeholder="۱۴۰۴/۰۵/۱۲" />' +
            '<div class="muted" style="font-size:11px;margin-top:4px;">📅 فقط به شمسی — مثال: ۱۴۰۴/۰۵/۱۲ (در همان روز تولد، پیام تبریک معلم ارسال می‌شود 🎂)</div>' +
            '<label>رمز عبور</label><input id="rgPin" class="input" inputmode="numeric" placeholder="پیش‌فرض 1234" />' +
            '<button class="btn btn-emerald" style="width:100%;margin-top:12px;" onclick="submitRegister()">ثبت‌نام</button>' +
            '<button class="btn btn-ghost" style="width:100%;margin-top:8px;" onclick="showRegister=false;renderApp()">🔙 بازگشت به صفحه ورود</button>' +
          '</div></div>';
        return;
      }

      main.innerHTML =
        '<div class="auth-wrap"><div class="auth-card">' +
          '<div class="auth-hero">' +
            '<div style="font-size:38px;">🏫</div>' +
            '<h1>شبکه مدارس هوشمند</h1>' +
            '<p>سامانه آموزشی چندمدرسه‌ای — ورود سریع فقط با نام کاربری و رمز</p>' +
          '</div>' +
          '<div class="auth-tabs">' +
            roleTabs.map(function (t) {
              return '<button class="auth-tab ' + (loginRole === t.id ? "active" : "") + '" onclick="loginRole=\'' + t.id + '\';renderApp()">' + t.label + '</button>';
            }).join("") +
          '</div>' +
          credHtml +
          '<details style="margin:10px 0;"><summary style="cursor:pointer;font-size:12px;color:var(--text-3);">کد مدرسه (فقط اگر سامانه خواست — مثلاً 4915)</summary>' +
            '<input id="msSchoolCode" class="input" inputmode="numeric" placeholder="کد مدرسه (اختیاری)" style="margin-top:8px;" />' +
          '</details>' +
          '<button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="submitLogin()">ورود</button>' +
          '<button class="btn btn-ghost" style="width:100%;margin-top:8px;" onclick="showRegister=true;renderApp()">✍️ ثبت‌نام دانش‌آموز جدید</button>' +
          '<div class="muted" style="text-align:center;font-size:11.5px;margin-top:12px;">' +
            '🔑 رمز خود را بعد از ورود از بخش «پروفایل» عوض کنید' +
          '</div>' +
        '</div></div>';
    }

    async function submitLogin(presetBody) {
      try {
        var body = presetBody || { role: loginRole };
        var scEl = document.getElementById("msSchoolCode");
        if (scEl && scEl.value.trim()) body.schoolCode = normDigits(scEl.value.trim());
        if (presetBody) {
          body = presetBody;
        } else if (loginRole === "student") {
          body.code = normDigits((document.getElementById("msCode") || {}).value || "");
          body.pin = normDigits((document.getElementById("msPin") || {}).value || "");
          if (!body.code) return showToast("کد دانش‌آموزی یا کد ملی را وارد کنید");
        } else if (loginRole === "parent") {
          body.code = normDigits((document.getElementById("msCode") || {}).value || "");
          body.pin = (document.getElementById("msPin") || {}).value || "";
          if (!body.code) return showToast("کد والدین را وارد کنید");
        } else if (loginRole === "teacher" || loginRole === "admin") {
          body.username = ((document.getElementById("msUser") || {}).value || "").trim();
          body.password = (document.getElementById("msPass") || {}).value || "";
          if (!body.username || !body.password) return showToast("نام کاربری و رمز را وارد کنید");
        } else if (loginRole === "super") {
          body.password = (document.getElementById("msPass") || {}).value || "";
          if (!body.password) return showToast("رمز مدیر ارشد را وارد کنید");
        }
        var r = await api("/api/ms/login", body);
        if (r && r.needsSchoolChoice) {
          loginSchools = r.schools || [];
          loginPending = body;
          renderApp();
          return;
        }
        session = r.session;
        localStorage.setItem("ms_session", JSON.stringify(session));
        msData = null;
        activeTab = (NAVS[session.role] && NAVS[session.role].length ? NAVS[session.role][0].id : "home");
        showToast("خوش آمدید " + (session.name || "") + " 🌟");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== مسیریاب اصلی ====================
    var NAVS = {
      student: [
        { id: "home", icon: "🏠", label: "خانه" },
        { id: "ai", icon: "❓", label: "پرسش AI" },
        { id: "lab", icon: "🧠", label: "کارگاه" },
        { id: "live", icon: "🎥", label: "کلاس آنلاین" },
        { id: "quiz", icon: "🎮", label: "رقابت" },
        { id: "history", icon: "📜", label: "سوابق" },
        { id: "pass", icon: "👤", label: "پروفایل" }
      ],
      parent: [
        { id: "report", icon: "📊", label: "کارنامه زنده" },
        { id: "att", icon: "📅", label: "حضور و تکالیف" },
        { id: "certs", icon: "🏅", label: "افتخارات" },
        { id: "chat", icon: "💬", label: "ارتباط با معلم" },
        { id: "pass", icon: "👤", label: "پروفایل" }
      ],
      teacher: [
        { id: "dash", icon: "📊", label: "داشبورد" },
        { id: "live", icon: "🎥", label: "کلاس آنلاین" },
        { id: "inbox", icon: "📥", label: "صندوق تایید" },
        { id: "att", icon: "✅", label: "حضوروغیاب" },
        { id: "ai", icon: "🤖", label: "ابزار هوش" },
        { id: "class", icon: "🏆", label: "کلاس و کدها" },
        { id: "pchat", icon: "💬", label: "پیام اولیا" },
        { id: "pass", icon: "👤", label: "پروفایل" }
      ],
      admin: [
        { id: "dash", icon: "📊", label: "داشبورد" },
        { id: "live", icon: "🎥", label: "کلاس آنلاین" },
        { id: "inbox", icon: "📥", label: "صندوق تایید" },
        { id: "att", icon: "✅", label: "حضوروغیاب" },
        { id: "ai", icon: "🤖", label: "ابزار هوش" },
        { id: "class", icon: "🏆", label: "کلاس و کدها" },
        { id: "pchat", icon: "💬", label: "پیام اولیا" },
        { id: "admin", icon: "🏫", label: "مدیریت" },
        { id: "pass", icon: "👤", label: "پروفایل" }
      ],
      super: [
        { id: "home", icon: "🏠", label: "نمای کلی" },
        { id: "schools", icon: "🏫", label: "مدارس" },
        { id: "announce", icon: "📢", label: "اطلاعیه سراسری" }
      ]
    };

    function applyTheme() {
      var t = "dark";
      try { t = localStorage.getItem("ms_theme") || "dark"; } catch (e) {}
      document.documentElement.setAttribute("data-theme", t);
    }
    function toggleTheme() {
      var cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", cur);
      try { localStorage.setItem("ms_theme", cur); } catch (e) {}
      showToast(cur === "light" ? "☀️ تم روشن فعال شد" : "🌙 تم تیره فعال شد");
    }
    applyTheme();

    async function renderProfile(main) {
      main = main || document.getElementById("mainView");
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        if (!msData) await ensureHome();
        var me = session.role === "student" ? (msData.student || {}) : (msData.teacher || {});
        var myUser = session.role === "teacher" ? ((msData.tg && msData.tg.username) || "") : (me.nationalId || me.studentCode || "");
        var myBday = me.birthday || "";
        var isStudentRole = session.role === "student";
        main.innerHTML =
          '<div class="section-title">👤 پروفایل من</div>' +
          '<div class="card">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<div style="width:52px;height:52px;border-radius:16px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:26px;">👤</div>' +
              '<div><b>' + esc(session.name || "") + '</b>' +
              '<div class="muted" style="font-size:12px;">' + (session.role === "student" ? "🎓 دانش‌آموز" : session.role === "teacher" ? "👨‍🏫 معلم" : session.role === "parent" ? "👪 والدین" : "🏫 مدیر") + ' • ' + esc(session.schoolName || "") + '</div></div>' +
            '</div>' +
            '<div class="muted" style="margin-top:10px;font-size:11.5px;">✏️ <b>نام</b> شما را فقط معلم یا مدیر مدرسه می‌تواند تغییر دهد.</div>' +
          '</div>' +
          (session.role === "parent" ? "" :
          '<div class="card">' +
            '<div class="section-title">🪪 نام کاربری (کد ملی)</div>' +
            '<input id="profUser" class="input" placeholder="کد ملی / نام کاربری جدید" value="' + esc(myUser) + '" />' +
            '<div class="section-title" style="margin-top:12px;">🎂 تاریخ تولد</div>' +
            '<input id="profBday" class="input" dir="ltr" placeholder="۱۴۰۴/۰۵/۱۲ (شمسی)" value="' + esc(gregorianToJalali(myBday)) + '" />' +
            '<div class="muted" style="font-size:11px;margin-top:4px;">📅 به شمسی — مثال: ۱۴۰۴/۰۵/۱۲ (در روز تولد، پیام تبریک از طرف معلم ارسال می‌شود 🎂)</div>' +
            '<button class="btn btn-emerald" style="width:100%;margin-top:12px;" onclick="saveProfile()">ذخیره تغییرات</button>' +
          '</div>') +
          '<div class="card">' +
            '<div class="section-title">🔑 تغییر رمز عبور</div>' +
            '<input id="oldPass" class="input" type="password" placeholder="رمز فعلی" />' +
            '<input id="newPass1" class="input" type="password" placeholder="رمز جدید (حداقل ۴ کاراکتر)" style="margin-top:10px;" />' +
            '<input id="newPass2" class="input" type="password" placeholder="تکرار رمز جدید" style="margin-top:10px;" />' +
            '<button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="savePass()">ذخیره رمز جدید</button>' +
            '<div class="muted" style="font-size:11.5px;margin-top:10px;">برای دانش‌آموزان، رمز فعلی همان PIN فعلی است (پیش‌فرض 1234).</div>' +
          '</div>' + backBtnHtml();
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    async function renameStudent(studentId, btn) {
      var row = btn && btn.closest ? btn.closest("tr") : null;
      var cur = row ? (row.querySelector("td") || {}).textContent || "" : "";
      cur = cur.replace("✏️", "").trim();
      var nn = prompt("نام جدید دانش‌آموز:", cur);
      if (nn === null) return;
      nn = (nn || "").trim();
      if (nn.length < 2) return showToast("نام جدید کوتاه است");
      try {
        await api("/api/ms/admin/students/rename", { studentId: studentId, name: nn });
        showToast("✅ نام تغییر کرد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function saveProfile() {
      try {
        var u = ((document.getElementById("profUser") || {}).value || "").trim();
        var bRaw = ((document.getElementById("profBday") || {}).value || "").trim();
        var b = "";
        if (bRaw) {
          b = jalaliToGregorian(bRaw) || "";
          if (!b) return showToast("تاریخ تولد را درست وارد کنید (مثال: 1404/05/12 به شمسی)");
        }
        await api("/api/ms/account/profile", { username: u, birthday: b });
        msData = null;
        showToast("✅ پروفایل ذخیره شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderPass(main) {
      return renderProfile(main);
    }

    async function savePass() {
      try {
        var o = (document.getElementById("oldPass") || {}).value || "";
        var n1 = (document.getElementById("newPass1") || {}).value || "";
        var n2 = (document.getElementById("newPass2") || {}).value || "";
        if (!o || !n1) return showToast("رمز فعلی و جدید را وارد کنید");
        if (n1.length < 4) return showToast("رمز جدید باید حداقل ۴ کاراکتر باشد");
        if (n1 !== n2) return showToast("تکرار رمز جدید مطابقت ندارد");
        await api("/api/ms/account/password", { oldPassword: o, newPassword: n1 });
        showToast("✅ رمز عبور با موفقیت تغییر کرد");
        back();
      } catch (e) { showToast("❌ " + e.message); }
    }

    function renderApp() {
      if (!session || !session.role) return renderLogin();
      document.getElementById("logoutBtn").style.display = "inline-flex";
      document.getElementById("brandSchool").textContent =
        session.schoolName ? "🏫 " + session.schoolName : (session.role === "super" ? "👑 مدیر ارشد سامانه" : "شبکه مدارس هوشمند");
      var nav = document.getElementById("bottomNav");
      nav.style.display = "flex";
      nav.innerHTML = '<div class="bottom-nav-inner">' + (NAVS[session.role] || []).map(function (t) {
        return '<button class="nav-item ' + (activeTab === t.id ? "active" : "") + '" onclick="goTab(\'' + t.id + '\')">' +
          '<span class="nav-ico">' + t.icon + '</span><span>' + t.label + '</span></button>';
      }).join("") + '</div>';

      var main = document.getElementById("mainView");
      if (activeTab === "live") {
        if (session.role === "teacher" || session.role === "admin") {
          main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال آماده‌سازی اتاق کلاس...</div>';
          Promise.resolve()
            .then(function () { return ensureHome(); })
            .then(function () {
              if (!resolveSelClass()) {
                main.innerHTML = session.role === "admin"
                  ? '<div class="card">⚠️ هنوز کلاسی در مدرسه تعریف نشده است؛ از بخش «مدیریت مدرسه ← کلاس‌ها» اضافه کنید.</div>'
                  : '<div class="card">⚠️ هنوز کلاسی به شما اختصاص داده نشده است؛ از مدیر مدرسه بخواهید کلاس‌های شما را تعریف کند.</div>';
                return;
              }
              window.LIVE_ROOM_KEY = myRoomKey();
              renderLiveClassroomPanel(main);
            })
            .catch(function (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; });
          return;
        }
        window.LIVE_ROOM_KEY = myRoomKey();
        renderLiveClassroomPanel(main);
        return;
      }
      if (session.role === "student" || session.role === "parent") renderStudent(main);
      else if (session.role === "teacher") renderTeacher(main);
      else if (session.role === "admin") {
        // تب‌های مدیریتی -> renderAdmin؛ بقیه تب‌ها (داشبورد/صندوق/حضور/تکالیف/...) -> renderTeacher
        if (activeTab === "home" || activeTab === "admin" || activeTab === "classes" || activeTab === "teachers" ||
            activeTab === "students" || activeTab === "reports" || activeTab === "settings" || activeTab === "announce") {
          renderAdmin(main);
        } else {
          renderTeacher(main);
        }
      }
      else if (session.role === "super") renderSuper(main);
    }

    function goTab(id) {
      if (id !== "live") {
        if (typeof stopLivePollingOnly === "function") stopLivePollingOnly();
      }
      activeTab = id;
      renderApp();
    }

    function myRoomKey() {
      if (!session || !session.schoolId) return "";
      if (session.role === "student") return "s" + session.schoolId + "c" + session.classId;
      if (session.role === "teacher" || session.role === "admin") {
        return resolveSelClass() ? "s" + session.schoolId + "c" + selClassId : "";
      }
      return "";
    }

    async function ensureHome() {
      if (!msData) {
        msData = await api("/api/ms/home");
      }
      return msData;
    }

    // ==================== پنل دانش‌آموز / والدین ====================
    async function renderStudent(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال دریافت اطلاعات...</div>';
      try {
        if (activeTab === "pass") { await renderPass(main); return; }
        var d = await ensureHome();
        if (activeTab === "home") {
          var liveBanner = session.role === "student" ? renderLiveBannerHtml(d.live) : "";
          var subjHtml = (d.subjects || []).length
            ? d.subjects.map(function (s) {
                return '<div class="stat-card" style="cursor:pointer;">' +
                  '<div class="stat-ico">📚</div>' +
                  '<div class="stat-num" style="font-size:14px;">' + esc(s.subject) + '</div>' +
                  '<div class="stat-label">👨‍🏫 ' + esc(s.teacherName) + '</div>' +
                '</div>';
              }).join("")
            : '<div class="muted">هنوز درسی برای کلاس شما تعریف نشده است.</div>';
          main.innerHTML =
            liveBanner +
            '<div class="hero" style="padding:18px 14px;">' +
              '<div class="hero-icon">🎓</div>' +
              '<h1>سلام ' + esc(d.student ? d.student.name : session.name) + '!</h1>' +
              '<p>🏫 ' + esc(d.school.name) + ' • کلاس ' + esc(d.class.label) + '</p>' +
            '</div>' +
            '<div class="stat-grid">' +
              '<div class="stat-card" style="border:1px solid rgba(245,158,11,0.45);"><div class="stat-ico">⭐</div><div class="stat-num">' + d.points.total + '</div><div class="stat-label">امتیاز من</div></div>' +
              '<div class="stat-card" style="border:1px solid rgba(249,115,22,0.5);"><div class="stat-ico">🔥</div><div class="stat-num">' + (d.streak || 0) + '</div><div class="stat-label">استریک روزها</div></div>' +
              '<div class="stat-card" style="border:1px solid rgba(234,179,8,0.5);"><div class="stat-ico">🏆</div><div class="stat-num">' + (d.classRank ? d.classRank + ' از ' + (d.classTotal || "?") : "—") + '</div><div class="stat-label">رتبه من در کلاس</div></div>' +
              '<div class="stat-card"><div class="stat-ico">📅</div><div class="stat-num">' + (d.attendance.pct) + '%</div><div class="stat-label">حضور در کلاس‌ها</div></div>' +
            '</div>' +
            '<div class="section-title">📚 درس‌های من</div>' +
            '<div class="stat-grid">' + subjHtml + '</div>' +
            '<div class="card" style="margin-top:12px;">' +
              '<div class="section-title">📚 آموزش</div>' +
              '<div class="menu-grid">' +
                '<button class="menu-item" onclick="activeTab=\'ai\';renderApp()"><span>🤖</span>پرسش و پاسخ AI</button>' +
                '<button class="menu-item" onclick="activeTab=\'quiz\';renderApp()"><span>📝</span>کوییز هوشمند</button>' +
                '<button class="menu-item" onclick="activeTab=\'lab\';renderApp()"><span>🧠</span>کارگاه یادگیری</button>' +
                '<button class="menu-item" onclick="activeTab=\'hw\';renderApp()"><span>📚</span>تکالیف من</button>' +
              '</div>' +
              '<div class="section-title">🎯 پیشرفت</div>' +
              '<div class="menu-grid">' +
                '<button class="menu-item" onclick="activeTab=\'mission\';renderApp()"><span>🎯</span>ماموریت روز</button>' +
                '<button class="menu-item" onclick="activeTab=\'report\';renderApp()"><span>📊</span>کارنامه من</button>' +
                '<button class="menu-item" onclick="activeTab=\'board\';renderApp()"><span>🏆</span>رتبه‌بندی</button>' +
                '<button class="menu-item" onclick="goTab(\'live\')"><span>🎥</span>کلاس آنلاین</button>' +
              '</div>' +
              '<div class="section-title">🎮 سرگرمی و امکانات</div>' +
              '<div class="menu-grid">' +
                '<button class="menu-item" onclick="activeTab=\'puzzle\';renderApp()"><span>🧩</span>پازل واژه روز</button>' +
                '<button class="menu-item" onclick="activeTab=\'shop\';renderApp()"><span>🛒</span>فروشگاه جوایز</button>' +
                '<button class="menu-item" onclick="activeTab=\'library\';renderApp()"><span>📂</span>کتابخانه</button>' +
                '<button class="menu-item" onclick="activeTab=\'msg\';renderApp()"><span>💬</span>پیام به معلم</button>' +
                '<button class="menu-item" onclick="activeTab=\'classchat\';renderApp()"><span>💬</span>گفتگوی کلاس</button>' +
                '<button class="menu-item" onclick="activeTab=\'history\';renderApp()"><span>📜</span>سوابق من</button>' +
                '<button class="menu-item" onclick="activeTab=\'announce\';renderApp()"><span>📢</span>اطلاعیه‌ها</button>' +
                '<button class="menu-item" onclick="activeTab=\'muddy\';renderApp()"><span>🆘</span>مباحث گنگ</button>' +
                '<button class="menu-item" onclick="activeTab=\'certs\';renderApp()"><span>🏅</span>افتخارات</button>' +
              '</div>' +
            '</div>' +
            (session.role === "student"
              ? '<div class="card" style="margin-top:12px;">' +
                  '<div class="section-title">🔑 کدهای اختصاصی من</div>' +
                  '<div class="muted">کد دانش‌آموزی: <b dir="ltr">' + esc(d.student.studentCode) + '</b> • رمز: <b dir="ltr">' + esc(d.student.pin) + '</b><br/>کد والدین: <b dir="ltr">' + esc(d.student.parentCode) + '</b></div>' +
                '<div class="muted" style="margin-top:8px;font-size:11.5px;">📲 <b>اتصال تلگرام:</b> در ربات مدرسه، دستور <b dir="ltr">/start</b> را بفرستید و بعد کد <b dir="ltr">' + esc(d.student.studentCode) + '</b> (دانش‌آموز) یا <b dir="ltr">' + esc(d.student.parentCode) + '</b> (والدین) را ارسال کنید تا اعلان‌ها و نتایج به تلگرام شما بیاید.</div>' +
                '</div>'
              : "");
        } else if (activeTab === "report") {
          var gradesHtml = (d.grades || []).length
            ? d.grades.map(function (g) {
                return '<tr><td>' + esc(g.subject) + '</td><td>' + esc(g.title) + '</td><td><b>' + g.score + '</b></td><td class="muted">' + esc(g.date) + '</td></tr>';
              }).join("")
            : '<tr><td colspan="4" class="muted">هنوز نمره‌ای ثبت نشده است.</td></tr>';
          var attHtml = (d.attendance.last || []).length
            ? d.attendance.last.map(function (a) {
                var st = a.status === "present" ? '✅ حاضر' : (a.status === "absent" ? '❌ غایب' : '⏰ تأخیر');
                return '<tr><td class="muted">' + esc(a.date) + '</td><td>' + st + '</td></tr>';
              }).join("")
            : '<tr><td colspan="2" class="muted">هنوز حضور و غیابی ثبت نشده است.</td></tr>';
          var ptsHtml = (d.points.last || []).length
            ? d.points.last.map(function (p) {
                return '<tr><td>' + (p.delta > 0 ? "➕" : "➖") + " " + Math.abs(p.delta) + '</td><td>' + esc(p.reason || "—") + '</td><td class="muted">' + esc(p.date) + '</td></tr>';
              }).join("")
            : '<tr><td colspan="3" class="muted">هنوز امتیازی ثبت نشده است.</td></tr>';
          main.innerHTML =
            '<div class="section-title">📝 نمرات</div>' +
            '<div class="card"><table class="table"><thead><tr><th>درس</th><th>عنوان</th><th>نمره</th><th>تاریخ</th></tr></thead><tbody>' + gradesHtml + '</tbody></table></div>' +
            '<div class="section-title">📅 حضور و غیاب</div>' +
            '<div class="card"><table class="table"><thead><tr><th>تاریخ</th><th>وضعیت</th></tr></thead><tbody>' + attHtml + '</tbody></table></div>' +
            '<div class="section-title">🏅 امتیازات رفتاری</div>' +
            '<div class="card"><table class="table"><thead><tr><th>امتیاز</th><th>دلیل</th><th>تاریخ</th></tr></thead><tbody>' + ptsHtml + '</tbody></table></div>';
        } else if (activeTab === "hw") {
          await renderStudentHw(main);
          return;
        } else if (activeTab === "lab" || activeTab === "labtool") {
          await renderLab(main);
          return;
        } else if (activeTab === "mission") {
          await renderMission(main);
          return;
        } else if (activeTab === "board") {
          await renderBoard(main);
          return;
        } else if (activeTab === "shop") {
          await renderShop(main);
          return;
        } else if (activeTab === "library") {
          await renderLibrary(main);
          return;
        } else if (activeTab === "msg") {
          await renderMessages(main);
          return;
        } else if (activeTab === "puzzle") {
          renderPuzzle(main);
          return;
        } else if (activeTab === "history") {
          await renderHistory(main);
          return;
        } else if (activeTab === "att" && session.role === "parent") {
          await renderParentAtt(main);
          return;
        } else if (activeTab === "certs") {
          await renderCerts(main);
          return;
        } else if (activeTab === "chat" || activeTab === "msg") {
          await renderMessages(main);
          return;
        } else if (activeTab === "muddy") {
          await renderMuddy(main);
          return;
        } else if (activeTab === "classchat") {
          renderClassChat(main);
          return;
        } else if (activeTab === "ai") {
          renderAiPanel(main);
          return;
        } else if (activeTab === "quiz") {
          renderQuizPanel(main);
          return;
        } else if (activeTab === "announce") {
          renderAnnounceList(main);
          return;
        }
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    // ==================== پنل معلم ====================
    function classSwitcherHtml() {
      if (!msData || !msData.classes || !msData.classes.length) {
        return '<div class="card" style="margin-bottom:10px;">⚠️ هنوز کلاسی به شما اختصاص داده نشده است؛ از مدیر مدرسه بخواهید کلاس‌های شما را تعریف کند.</div>';
      }
      resolveSelClass();
      return '<div class="card" style="margin-bottom:10px;padding:10px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<b>📚 کلاس فعال:</b>' +
          '<select class="input" style="flex:1;margin:0;" onchange="switchClass(this.value)">' +
            msData.classes.map(function (c) {
              return '<option value="' + c.id + '" ' + (c.id === selClassId ? "selected" : "") + '>' + esc(c.label) + ' — ' + esc(c.subject) + ' (' + c.studentCount + ' نفر)</option>';
            }).join("") +
          '</select>' +
        '</div>' +
        (function () {
          var c = msData.classes.find(function (x) { return x.id === selClassId; });
          return c && c.live && c.live.active
            ? '<div style="margin-top:8px;">' + renderLiveBannerHtml(c.live) + '</div>'
            : "";
        })() +
      '</div>';
    }

    async function switchClass(id) {
      selClassId = Number(id);
      localStorage.setItem("ms_class", String(selClassId));
      tcClass = null;
      renderApp();
    }

    // انتخاب قطعی «کلاس فعال» قبل از هر درخواستی به سرور (رفع خطای «این کلاس در اختیار شما نیست»)
    function resolveSelClass() {
      if (!msData || !msData.classes || !msData.classes.length) return 0;
      if (!selClassId || !msData.classes.some(function (c) { return c.id === selClassId; })) {
        selClassId = msData.classes[0].id;
        tcClass = null;
        try { localStorage.setItem("ms_class", String(selClassId)); } catch (e) {}
      }
      return selClassId;
    }

    async function ensureTcClass() {
      if (!resolveSelClass()) return null;
      if (!tcClass) {
        tcClass = await api("/api/ms/teacher/class?classId=" + selClassId);
      }
      return tcClass;
    }

    async function renderTeacher(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال دریافت اطلاعات...</div>';
      try {
        if (activeTab === "pass") { await renderPass(main); return; }
        if (!msData) await ensureHome();
        if (!msData.classes || !msData.classes.length) {
          main.innerHTML = classSwitcherHtml();
          return;
        }
        resolveSelClass();
        if (activeTab === "dash" || activeTab === "home") {
          await renderTcDash(main);
          return;
        } else if (activeTab === "class") {
          await renderClassCodes(main);
          return;
        } else if (activeTab === "deadlines") {
          await renderDeadlines(main);
          return;
        } else if (activeTab === "ai" || activeTab === "ait" || activeTab === "lab" || activeTab === "labtool") {
          await renderLab(main);
          return;
        } else if (activeTab === "classchat") {
          await renderClassChat(main);
          return;
        } else if (activeTab === "pchat" || activeTab === "msgm") {
          await renderMsgM(main);
          return;
        } else if (activeTab === "hw") {
          await renderTeacherHw(main);
          return;
        } else if (activeTab === "inbox") {
          await renderInbox(main);
          return;
        } else if (activeTab === "att") {

          var d2 = await ensureTcClass();
          if (!d2) { main.innerHTML = classSwitcherHtml(); return; }
          main.innerHTML =
            classSwitcherHtml() +
            '<div class="section-title">✅ حضور و غیاب — ' + esc(d2.class.label) + '</div>' +
            '<div class="card">' +
              '<div id="attRows">' +
                (d2.roster || []).map(function (s) {
                  var cur = s.todayStatus || "";
                  return '<div class="att-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">' +
                    '<b style="flex:1;">' + esc(s.name) + '</b>' +
                    '<button class="btn btn-sm ' + (cur === "present" ? "btn-emerald" : "btn-ghost") + '" onclick="markAtt(' + s.id + ',\'present\',this)">حاضر</button>' +
                    '<button class="btn btn-sm ' + (cur === "absent" ? "btn-rose" : "btn-ghost") + '" onclick="markAtt(' + s.id + ',\'absent\',this)">غایب</button>' +
                    '<button class="btn btn-sm ' + (cur === "late" ? "btn-gold" : "btn-ghost") + '" onclick="markAtt(' + s.id + ',\'late\',this)">تأخیر</button>' +
                  '</div>';
                }).join("") +
              '</div>' +
              '<button class="btn btn-emerald" style="margin-top:12px;" onclick="saveAttendance()">💾 ذخیره حضور و غیاب</button>' +
            '</div>';
        } else if (activeTab === "grades") {

          var d3 = await ensureTcClass();
          if (!d3) { main.innerHTML = classSwitcherHtml(); return; }
          main.innerHTML =
            classSwitcherHtml() +
            '<div class="section-title">📝 ثبت نمره — درس ' + esc(d3.class.subject) + '</div>' +
            '<div class="card">' +
              '<select id="grStudent" class="input">' +
                (d3.roster || []).map(function (s) {
                  return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
                }).join("") +
              '</select>' +
              '<input id="grTitle" class="input" placeholder="عنوان (مثلاً آزمون فصل ۳)" />' +
              '<input id="grScore" class="input" type="number" step="0.25" dir="ltr" placeholder="نمره (مثلاً 18.5)" />' +
              '<button class="btn btn-emerald" onclick="saveGrade()">✅ ثبت نمره</button>' +
            '</div>' +
            '<div class="section-title">📋 آخرین نمرات ثبت‌شده</div>' +
            '<div class="card"><table class="table"><thead><tr><th>دانش‌آموز</th><th>عنوان</th><th>نمره</th></tr></thead><tbody>' +
            ((d3.grades || []).length
              ? d3.grades.map(function (g) {
                  var nm = (d3.roster || []).find(function (s) { return s.id === g.studentId; });
                  return '<tr><td>' + esc(nm ? nm.name : "—") + '</td><td>' + esc(g.title) + '</td><td><b>' + g.score + '</b></td></tr>';
                }).join("")
              : '<tr><td colspan="3" class="muted">هنوز نمره‌ای ثبت نشده است.</td></tr>') +
            '</tbody></table></div>';
        } else if (activeTab === "shopm") {
          await renderShopM(main);
          return;
        } else if (activeTab === "libm") {
          await renderLibM(main);
          return;
        } else if (activeTab === "announce") {
          renderAnnounceForm(main);
          return;
        } else if (activeTab === "admin" && session.role === "admin") {
          renderAdmin(main);
          return;
        }
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    var attDraft = {};
    function markAtt(studentId, status, btn) {
      attDraft[studentId] = status;
      var row = btn.parentElement;
      var btns = row.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        btns[i].className = "btn btn-sm btn-ghost";
      }
      btn.className = "btn btn-sm " + (status === "present" ? "btn-emerald" : status === "absent" ? "btn-rose" : "btn-gold");
    }

    async function saveAttendance() {
      try {
        var entries = Object.keys(attDraft).map(function (k) {
          return { studentId: Number(k), status: attDraft[k] };
        });
        if (!entries.length) return showToast("حداقل وضعیت یک دانش‌آموز را مشخص کنید.");
        await api("/api/ms/teacher/attendance", { classId: selClassId, entries: entries });
        attDraft = {};
        tcClass = null;
        showToast("✅ حضور و غیاب ذخیره شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function saveGrade() {
      try {
        var sid = Number(document.getElementById("grStudent").value);
        var title = document.getElementById("grTitle").value.trim();
        var score = Number(document.getElementById("grScore").value);
        if (!sid) return showToast("دانش‌آموز را انتخاب کنید");
        if (!isFinite(score)) return showToast("نمره را وارد کنید");
        await api("/api/ms/teacher/grade", { classId: selClassId, studentId: sid, title: title, score: score });
        tcClass = null;
        showToast("✅ نمره ثبت شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== پنل مدیر مدرسه ====================
    async function renderAdmin(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال دریافت اطلاعات...</div>';
      try {
        if (activeTab === "pass") { await renderPass(main); return; }
        if (activeTab === "home" || activeTab === "admin") {
          var d = await api("/api/ms/home");
          msData = d;
          main.innerHTML =
            '<div class="hero" style="padding:18px 14px;">' +
              '<div class="hero-icon">🏫</div>' +
              '<h1>' + esc(d.school.name) + '</h1>' +
              '<p>کد مدرسه: <b dir="ltr">' + esc(d.school.code) + '</b> • ' + esc(d.school.city || "") + '</p>' +
              '<p class="muted" style="font-size:12px;">اشتراک: ' + esc(d.school.plan) + (d.school.expiresAt ? ' • تا ' + esc(d.school.expiresAt) : '') + '</p>' +
            '</div>' +
            '<div class="stat-grid">' +
              '<div class="stat-card"><div class="stat-ico">🎒</div><div class="stat-num">' + d.stats.students + '</div><div class="stat-label">دانش‌آموز</div></div>' +
              '<div class="stat-card"><div class="stat-ico">👨‍🏫</div><div class="stat-num">' + d.stats.teachers + '</div><div class="stat-label">معلم</div></div>' +
              '<div class="stat-card"><div class="stat-ico">🏗</div><div class="stat-num">' + d.stats.classes + '</div><div class="stat-label">کلاس</div></div>' +
              '<div class="stat-card"><div class="stat-ico">⚠️</div><div class="stat-num">' + d.stats.notPresentToday + '</div><div class="stat-label">حاضر نشده امروز</div></div>' +
            '</div>' +
            '<div class="card" style="margin-top:12px;">' +
              '<div class="section-title">⚡ مدیریت مدرسه</div>' +
              '<div class="menu-grid">' +
                '<button class="menu-item" onclick="goTab(\'students\')"><span>➕</span>ثبت‌نام دانش‌آموز جدید</button>' +
                '<button class="menu-item" onclick="goTab(\'teachers\')"><span>👨‍🏫</span>معلمان</button>' +
                '<button class="menu-item" onclick="goTab(\'classes\')"><span>🏗</span>کلاس‌ها</button>' +
                '<button class="menu-item" onclick="goTab(\'reports\')"><span>📈</span>گزارش‌ها</button>' +
                '<button class="menu-item" onclick="goTab(\'announce\')"><span>📢</span>ارسال اطلاعیه</button>' +
                '<button class="menu-item" onclick="goTab(\'settings\')"><span>⚙️</span>تنظیمات مدرسه</button>' +
              '</div>' +
            '</div>' +
            '</div>' +
            '<div class="section-title">📢 آخرین اطلاعیه‌ها</div>' +
            '<div class="card">' +
              ((d.announcements || []).length
                ? d.announcements.map(function (a) {
                    return '<div style="padding:8px 0;border-bottom:1px solid var(--border);"><b>' + esc(a.title) + '</b><div class="muted" style="font-size:12px;">' + esc(a.body || "") + ' • ' + esc(a.date) + '</div></div>';
                  }).join("")
                : '<div class="muted">اطلاعیه‌ای ثبت نشده است.</div>') +
            '</div>';
        } else if (activeTab === "classes") {
          var c = await api("/api/ms/admin/classes");
          main.innerHTML =
            adminBackHtml() +
            '<div class="section-title">🏗 کلاس‌های مدرسه</div>' +
            '<div class="card">' +
              '<div style="display:flex;gap:8px;">' +
                '<input id="newGrade" class="input" placeholder="پایه (مثلاً هشتم)" style="flex:1;" />' +
                '<input id="newClass" class="input" placeholder="نام کلاس (مثلاً ۲)" style="flex:1;" />' +
              '</div>' +
              '<button class="btn btn-emerald" style="margin-top:8px;" onclick="addClass()">➕ افزودن کلاس</button>' +
            '</div>' +
            '<div class="card" style="margin-top:10px;"><table class="table"><thead><tr><th>کلاس</th><th>دانش‌آموز</th><th></th></tr></thead><tbody>' +
            (c.classes || []).map(function (x) {
              return '<tr><td><b>' + esc(x.label) + '</b></td><td>' + x.studentCount + ' نفر</td>' +
                '<td><button class="btn btn-ghost btn-sm" onclick="delClass(' + x.id + ')">🗑</button></td></tr>';
            }).join("") +
            '</tbody></table></div>';
        } else if (activeTab === "teachers") {
          var t = await api("/api/ms/admin/teachers");
          adminAll.classes = t.classes || [];
          window._lastTeachers = t.teachers || [];
          main.innerHTML =
            adminBackHtml() +
            '<div class="section-title">👨‍🏫 معلمان مدرسه</div>' +
            '<div class="card">' +
              '<input id="tName" class="input" placeholder="نام و نام خانوادگی معلم" />' +
              '<input id="tUser" class="input" dir="ltr" placeholder="نام کاربری (لاتین)" />' +
              '<input id="tPass" class="input" type="password" dir="ltr" placeholder="رمز ورود (حداقل ۴ کاراکتر)" />' +
              '<button class="btn btn-emerald" onclick="addTeacher()">➕ افزودن معلم</button>' +
            '</div>' +
            (t.teachers || []).map(function (x) {
              var assigned = Object.keys(x.subjects || {}).map(function (cid) {
                var cl = adminAll.classes.find(function (cc) { return String(cc.id) === String(cid); });
                return (cl ? cl.label : cid) + " (" + x.subjects[cid] + ")";
              }).join("، ");
              return '<div class="card" style="margin-top:10px;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                  '<b>👨‍🏫 ' + esc(x.name) + '</b>' +
                  '<span class="muted" style="font-size:12px;" dir="ltr">' + esc(x.username) + ' / ' + esc(x.password) + '</span>' +
                '</div>' +
                '<div class="muted" style="font-size:12px;margin:6px 0;">کلاس‌ها: ' + esc(assigned || "—") + '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
                  '<button class="btn btn-sm" onclick="assignTeacher(' + x.id + ')">📚 تخصیص کلاس و درس</button>' +
                  '<button class="btn btn-ghost btn-sm" onclick="resetTeacherPass(' + x.id + ')">🔑 تغییر رمز</button>' +
                  '<button class="btn btn-ghost btn-sm" onclick="delTeacher(' + x.id + ')">🗑 حذف</button>' +
                '</div>' +
              '</div>';
            }).join("");
        } else if (activeTab === "students") {
          var sData = await api("/api/ms/admin/students");
          adminAll.students = sData.students || [];
          adminAll.classes = sData.classes || [];
          main.innerHTML =
            adminBackHtml() +
            '<div class="section-title">🎒 دانش‌آموزان مدرسه</div>' +
            '<div class="card">' +
              '<select id="stClassFilter" class="input" onchange="filterStudents(this.value)">' +
                '<option value="0">همه کلاس‌ها</option>' +
                adminAll.classes.map(function (c2) {
                  return '<option value="' + c2.id + '">' + esc(c2.label) + '</option>';
                }).join("") +
              '</select>' +
            '</div>' +
            '<div class="card" style="margin-top:10px;">' +
              '<div class="section-title">➕ ثبت‌نام تکی</div>' +
              '<input id="nsName" class="input" placeholder="نام و نام خانوادگی دانش‌آموز" />' +
              '<input id="nsNat" class="input" inputmode="numeric" placeholder="کد ملی (نام کاربری — اختیاری)" style="margin-top:8px;" />' +
              '<input id="nsBday" class="input" dir="ltr" placeholder="تولد شمسی — ۱۴۰۴/۰۵/۱۲ (اختیاری)" style="margin-top:8px;" />' +
              '<div class="muted" style="font-size:11px;margin-top:4px;">📅 به شمسی — مثال: ۱۴۰۴/۰۵/۱۲ (اختیاری)</div>' +
              '<select id="nsClass" class="input">' +
                adminAll.classes.map(function (c2) {
                  return '<option value="' + c2.id + '">' + esc(c2.label) + '</option>';
                }).join("") +
              '</select>' +
              '<button class="btn btn-emerald" onclick="addStudent()">➕ ثبت و دریافت کدها</button>' +
            '</div>' +
            '<div class="card" style="margin-top:10px;">' +
              '<div class="section-title">📥 ثبت‌نام گروهی (اکسل/CSV)</div>' +
              '<p class="muted" style="margin-top:0;">هر سطر: <b>نام دانش‌آموز, نام کلاس, کد ملی</b> (مثلاً: <span dir="ltr">علی رضایی, هشتم-۲, 0012345678</span>) — کد ملی اختیاری است.<br/>می‌توانید مستقیم از اکسل کپی و اینجا Paste کنید.</p>' +
              '<textarea id="bulkText" class="input" rows="6" placeholder="نام, کلاس"></textarea>' +
              '<button class="btn" onclick="bulkImport()">📥 ثبت گروهی و ساخت کدها</button>' +
              '<div id="bulkResults"></div>' +
            '</div>' +
            '<div class="card" style="margin-top:10px;"><table class="table"><thead><tr><th>نام</th><th>کلاس</th><th>کد دانش‌آموز</th><th>کد والدین</th><th>🪪 کد ملی</th><th></th></tr></thead><tbody id="studentsTbody">' +
            renderStudentsRows(adminAll.students) +
            '</tbody></table></div>';
        } else if (activeTab === "reports") {
          var r = await api("/api/ms/admin/reports");
          main.innerHTML =
            adminBackHtml() +
            '<div class="section-title">⚠️ غایبین / حاضر نشده‌های امروز</div>' +
            '<div class="card">' +
              ((r.absenceToday || []).length
                ? r.absenceToday.map(function (g) {
                    return '<div style="margin-bottom:10px;"><b>📚 ' + esc(g.classLabel) + '</b>' +
                      g.students.map(function (s2) {
                        return '<div style="padding:4px 0;border-bottom:1px solid var(--border);">' + esc(s2.name) + ' <span class="muted" style="font-size:12px;">(' + esc(s2.status) + ')</span></div>';
                      }).join("") + '</div>';
                  }).join("")
                : '<div class="muted">🎉 همه دانش‌آموزان امروز حاضر شده‌اند (یا هنوز ثبتی انجام نشده).</div>') +
            '</div>' +
            '<div class="section-title">📅 درصد حضور ۷ روز اخیر</div>' +
            '<div class="card"><table class="table"><thead><tr><th>کلاس</th><th>حضور</th><th>ثبت‌ها</th></tr></thead><tbody>' +
            ((r.attendanceWeek || []).length
              ? r.attendanceWeek.map(function (w) {
                  return '<tr><td>' + esc(w.classLabel) + '</td><td><b>' + (w.pct < 0 ? "—" : w.pct + "%") + '</b></td><td class="muted">' + w.marks + '</td></tr>';
                }).join("")
              : '<tr><td colspan="3" class="muted">داده‌ای نیست.</td></tr>') +
            '</tbody></table></div>' +
            '<div class="section-title">👨‍🏫 عملکرد معلمان</div>' +
            '<div class="card"><table class="table"><thead><tr><th>معلم</th><th>کلاس‌ها</th><th>دانش‌آموزان</th><th>نمرات ثبت‌شده</th></tr></thead><tbody>' +
            ((r.teacherActivity || []).length
              ? r.teacherActivity.map(function (ta) {
                  return '<tr><td>' + esc(ta.name) + '</td><td>' + ta.classes + '</td><td>' + ta.students + '</td><td>' + ta.grades + '</td></tr>';
                }).join("")
              : '<tr><td colspan="4" class="muted">معلمی ثبت نشده است.</td></tr>') +
            '</tbody></table></div>';
        } else if (activeTab === "settings") {
          var d2 = await api("/api/ms/home");
          main.innerHTML =
            '<div class="section-title">⚙️ تنظیمات مدرسه</div>' +
            '<div class="card">' +
              '<input id="setName" class="input" placeholder="نام مدرسه" value="' + esc(d2.school.name) + '" />' +
              '<input id="setCity" class="input" placeholder="شهر" value="' + esc(d2.school.city || "") + '" />' +
              '<input id="setAdminName" class="input" placeholder="نام مدیر مدرسه" value="' + esc(session.name || "") + '" />' +
              '<input id="setBot" class="input" dir="ltr" placeholder="توکن ربات تلگرام مدرسه (اختصاصی — خالی بگذارید برای ربات مرکزی)" value="" />' +
              '<button class="btn btn-emerald" onclick="saveSettings()">💾 ذخیره تنظیمات</button>' +
            '</div>' +
            '<div class="card" style="margin-top:10px;">' +
              '<div class="section-title">🔑 تغییر رمز مدیر مدرسه</div>' +
              '<input id="oldPass" class="input" type="password" dir="ltr" placeholder="رمز فعلی" />' +
              '<input id="newPass" class="input" type="password" dir="ltr" placeholder="رمز جدید (حداقل ۵ کاراکتر)" />' +
              '<button class="btn" onclick="changeAdminPass()">🔄 تغییر رمز</button>' +
            '</div>' +
            '<div style="text-align:center;margin:12px 0;">' +
              '<button class="btn btn-ghost btn-sm" onclick="goTab(\'admin\')">🔙 بازگشت به مدیریت مدرسه</button>' +
            '</div>';
        } else if (activeTab === "announce") {
          renderAnnounceForm(main);
          return;
        }
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    function renderStudentsRows(list) {
      return list.map(function (s) {
        return '<tr><td>' + esc(s.name) + '</td><td class="muted">' + esc(s.classLabel) + '</td>' +
          '<td dir="ltr">' + esc(s.studentCode) + '</td><td dir="ltr">' + esc(s.parentCode) + '</td>' +
          '<td>' +
            '<button class="btn btn-ghost btn-sm" onclick="resetStudent(' + s.id + ')">🔄</button> ' +
            '<button class="btn btn-ghost btn-sm" onclick="delStudent(' + s.id + ')">🗑</button>' +
          '</td></tr>';
      }).join("");
    }

    function filterStudents(cid) {
      var list = cid === "0" ? adminAll.students : adminAll.students.filter(function (s) { return String(s.classId) === String(cid); });
      document.getElementById("studentsTbody").innerHTML = renderStudentsRows(list);
    }

    async function addClass() {
      try {
        var grade = document.getElementById("newGrade").value.trim();
        var name = document.getElementById("newClass").value.trim();
        if (!grade || !name) return showToast("پایه و نام کلاس را وارد کنید");
        await api("/api/ms/admin/classes", { gradeName: grade, className: name });
        showToast("✅ کلاس ساخته شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function delClass(id) {
      if (!confirm("این کلاس حذف شود؟")) return;
      try {
        await api("/api/ms/admin/classes/delete", { id: id });
        showToast("🗑 کلاس حذف شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function addTeacher() {
      try {
        var name = document.getElementById("tName").value.trim();
        var username = document.getElementById("tUser").value.trim();
        var password = document.getElementById("tPass").value;
        await api("/api/ms/admin/teachers", { name: name, username: username, password: password });
        showToast("✅ معلم اضافه شد؛ اکنون کلاس‌هایش را تخصیص دهید.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function assignTeacher(teacherId) {
      var t = (window._lastTeachers || []).find(function (x) { return x.id === teacherId; });
      if (!t) return showToast("ابتدا صفحه را نوسازی کنید");
      var existing = t.subjects || {};
      var parts = [];
      adminAll.classes.forEach(function (c) {
        var cur = existing[String(c.id)] || "";
        var v = prompt("درس معلم «" + t.name + "» در کلاس " + c.label + " را وارد کنید (خالی بگذارید برای حذف):", cur);
        if (v === null) return;
        v = v.trim();
        if (v) parts.push([String(c.id), v]);
      });
      try {
        var subjects = {};
        parts.forEach(function (p) { subjects[p[0]] = p[1]; });
        await api("/api/ms/admin/teachers/assign", { teacherId: teacherId, subjects: subjects });
        showToast("✅ تخصیص کلاس‌ها ذخیره شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function resetTeacherPass(teacherId) {
      var p = prompt("رمز جدید معلم:");
      if (!p) return;
      try {
        await api("/api/ms/admin/teachers/reset", { teacherId: teacherId, password: p });
        showToast("✅ رمز معلم تغییر کرد.");
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function delTeacher(id) {
      if (!confirm("این معلم حذف شود؟")) return;
      try {
        await api("/api/ms/admin/teachers/delete", { id: id });
        showToast("🗑 معلم حذف شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function addStudent() {
      try {
        var name = document.getElementById("nsName").value.trim();
        var classId = Number(document.getElementById("nsClass").value);
        var nsBd = ((document.getElementById("nsBday") || {}).value || "").trim();
        var nsBdIso = "";
        if (nsBd) {
          nsBdIso = jalaliToGregorian(nsBd) || "";
          if (!nsBdIso) return showToast("تاریخ تولد شمسی نامعتبر است (مثال: 1404/05/12)");
        }
        var r = await api("/api/ms/admin/students", {
          name: name,
          classId: classId,
          nationalId: ((document.getElementById("nsNat") || {}).value || "").trim(),
          birthday: nsBdIso,
        });
        showToast("✅ ثبت شد — کد دانش‌آموز: " + r.studentCode + " | کد والدین: " + r.parentCode);
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function bulkImport() {
      try {
        var text = document.getElementById("bulkText").value;
        if (!text.trim()) return showToast("متنی وارد نشده است.");
        var r = await api("/api/ms/admin/students/bulk", { text: text });
        lastBulkResults = r.results || [];
        var okCount = lastBulkResults.filter(function (x) { return x.ok; }).length;
        var html = '<div style="margin-top:10px;"><b>✅ ' + okCount + ' دانش‌آموز با موفقیت ثبت شد' +
          (lastBulkResults.length - okCount > 0 ? ' — ❌ ' + (lastBulkResults.length - okCount) + ' سطر ناموفق' : '') + '</b>' +
          '<table class="table" style="margin-top:8px;"><thead><tr><th>نام</th><th>کلاس</th><th>کد دانش‌آموز</th><th>رمز</th><th>کد والدین</th></tr></thead><tbody>' +
          lastBulkResults.map(function (x) {
            if (!x.ok) return '<tr><td colspan="5" class="muted">❌ ' + esc(x.line) + ' — ' + esc(x.error) + '</td></tr>';
            return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.classLabel) + '</td><td dir="ltr">' + esc(x.studentCode) + '</td><td dir="ltr">' + esc(x.pin) + '</td><td dir="ltr">' + esc(x.parentCode) + '</td></tr>';
          }).join("") +
          '</tbody></table>' +
          '<button class="btn btn-sm" style="margin-top:8px;" onclick="downloadBulkCsv()">⬇️ دانلود لیست کدها (CSV برای چاپ و تحویل به اولیا)</button>' +
          '</div>';
        document.getElementById("bulkResults").innerHTML = html;
        showToast("✅ ثبت گروهی انجام شد.");
      } catch (e) { showToast("❌ " + e.message); }
    }

    function downloadBulkCsv() {
      var rows = [["نام", "کلاس", "کد دانش‌آموز", "رمز", "کد والدین"]];
      lastBulkResults.forEach(function (x) {
        if (x.ok) rows.push([x.name, x.classLabel, x.studentCode, x.pin, x.parentCode]);
      });
      var csv = "\uFEFF" + rows.map(function (r) { return r.join(","); }).join("\n");
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "school-codes.csv";
      a.click();
    }

    async function resetStudent(id) {
      if (!confirm("کدهای ورود این دانش‌آموز نوسازی شود؟ (کدهای قبلی باطل می‌شود)")) return;
      try {
        var r = await api("/api/ms/admin/students/reset", { id: id });
        alert("✅ کدهای جدید:\n\n🎒 کد دانش‌آموز: " + r.studentCode + "\n🔑 رمز: " + r.pin + "\n👪 کد والدین: " + r.parentCode);
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function delStudent(id) {
      if (!confirm("این دانش‌آموز حذف شود؟")) return;
      try {
        await api("/api/ms/admin/students/delete", { id: id });
        showToast("🗑 حذف شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function saveSettings() {
      try {
        await api("/api/ms/admin/settings", {
          name: document.getElementById("setName").value.trim(),
          city: document.getElementById("setCity").value.trim(),
          adminName: document.getElementById("setAdminName").value.trim(),
          telegramBotToken: document.getElementById("setBot").value.trim()
        });
        session.name = document.getElementById("setAdminName").value.trim() || session.name;
        session.schoolName = document.getElementById("setName").value.trim() || session.schoolName;
        localStorage.setItem("ms_session", JSON.stringify(session));
        showToast("✅ تنظیمات ذخیره شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function changeAdminPass() {
      try {
        await api("/api/ms/admin/password", {
          oldPass: document.getElementById("oldPass").value,
          newPass: document.getElementById("newPass").value
        });
        showToast("✅ رمز مدیر تغییر کرد.");
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== پنل مدیر ارشد ====================
    async function renderSuper(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال دریافت اطلاعات...</div>';
      try {
        if (activeTab === "home") {
          var d = await api("/api/ms/home");
          main.innerHTML =
            '<div class="hero" style="padding:18px 14px;">' +
              '<div class="hero-icon">👑</div>' +
              '<h1>پنل مدیر ارشد سامانه</h1>' +
              '<p>مدیریت تمام مدارس، اشتراک‌ها و کاربران شبکه هوشمند</p>' +
            '</div>' +
            '<div class="stat-grid">' +
              '<div class="stat-card"><div class="stat-ico">🏫</div><div class="stat-num">' + d.stats.schools + '</div><div class="stat-label">مدرسه (' + d.stats.activeSchools + ' فعال)</div></div>' +
              '<div class="stat-card"><div class="stat-ico">👨‍🏫</div><div class="stat-num">' + d.stats.teachers + '</div><div class="stat-label">معلم</div></div>' +
              '<div class="stat-card"><div class="stat-ico">🎒</div><div class="stat-num">' + d.stats.students + '</div><div class="stat-label">دانش‌آموز</div></div>' +
              '<div class="stat-card"><div class="stat-ico">🔴</div><div class="stat-num">' + d.stats.liveRooms + '</div><div class="stat-label">کلاس زنده هم‌اکنون</div></div>' +
            '</div>' +
            '<div class="card" style="margin-top:12px;">' +
              '<div class="section-title">⚡ دسترسی سریع</div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
                '<button class="btn btn-emerald btn-sm" onclick="goTab(\'schools\')">🏫 ساخت مدرسه جدید</button>' +
                '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'announce\';renderApp()">📢 اطلاعیه سراسری</button>' +
              '</div>' +
            '</div>' +
            ((d.liveRooms || []).length
              ? '<div class="section-title">🔴 کلاس‌های زنده در حال برگزاری</div>' +
                '<div class="card">' + d.liveRooms.map(function (r) {
                  return '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' + esc(r.title || r.roomKey) + ' <span class="muted" style="font-size:12px;">(' + esc(r.roomKey) + ' — ' + (r.online || 0) + ' نفر آنلاین)</span></div>';
                }).join("") + '</div>'
              : "");
        } else if (activeTab === "schools") {
          var s = await api("/api/ms/super/schools");
          main.innerHTML =
            '<div class="card">' +
              '<div class="section-title">➕ ثبت مدرسه جدید (۱۰ ثانیه‌ای!)</div>' +
              '<input id="scName" class="input" placeholder="نام مدرسه (مثلاً دبیرستان فرزانگان)" />' +
              '<input id="scCity" class="input" placeholder="شهر" />' +
              '<input id="scAdminName" class="input" placeholder="نام مدیر مدرسه" />' +
              '<div style="display:flex;gap:8px;">' +
                '<input id="scDays" class="input" type="number" dir="ltr" placeholder="روز اشتراک (مثلاً 365)" value="365" style="flex:1;" />' +
                '<select id="scPlan" class="input" style="flex:1;">' +
                  '<option value="trial">آزمایشی (دمو)</option>' +
                  '<option value="standard" selected>استاندارد</option>' +
                  '<option value="pro">حرفه‌ای</option>' +
                '</select>' +
              '</div>' +
              '<div style="display:flex;gap:8px;">' +
                '<input id="scMaxSt" class="input" type="number" dir="ltr" placeholder="سقف دانش‌آموز (300)" value="300" style="flex:1;" />' +
                '<input id="scMaxTc" class="input" type="number" dir="ltr" placeholder="سقف معلم (30)" value="30" style="flex:1;" />' +
              '</div>' +
              '<button class="btn btn-emerald" onclick="createSchool()">🏫 ساخت مدرسه و دریافت کد</button>' +
              '<div id="newSchoolResult"></div>' +
            '</div>' +
            '<div class="section-title">🏫 مدارس ثبت‌شده</div>' +
            (s.schools || []).map(function (x) {
              var status = x.active
                ? (x.expiresAt && x.expiresAt < new Date().toISOString().split("T")[0]
                    ? '<span class="badge-pill" style="background:rgba(245,158,11,0.2);color:#FCD34D;">منقضی</span>'
                    : '<span class="badge-pill" style="background:rgba(16,185,129,0.2);color:#6EE7B7;">فعال</span>')
                : '<span class="badge-pill" style="background:rgba(244,63,94,0.2);color:#FDA4AF;">معلق</span>';
              return '<div class="card" style="margin-top:10px;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
                  '<b>🏫 ' + esc(x.name) + '</b>' + status +
                '</div>' +
                '<div class="muted" style="font-size:12px;margin:6px 0;">' +
                  'کد مدرسه: <b dir="ltr">' + esc(x.code) + '</b> • ' + esc(x.city || "") + '<br/>' +
                  '👨‍🏫 ' + x.teachers + ' معلم • 🎒 ' + x.students + ' دانش‌آموز • 🏗 ' + x.classes + ' کلاس<br/>' +
                  'مدیر: ' + esc(x.adminName || "—") + ' (<span dir="ltr">' + esc(x.adminUser) + ' / ' + esc(x.adminPass) + '</span>)<br/>' +
                  'اشتراک: ' + esc(x.plan) + (x.expiresAt ? ' • تا ' + esc(x.expiresAt) : '') + ' • سقف: ' + x.maxStudents + ' دانش‌آموز' +
                  (x.botTokenSet ? ' • 🤖 ربات اختصاصی' : '') +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
                  '<button class="btn btn-sm" onclick="renewSchool(' + x.id + ')">🔄 تمدید ۱ ساله</button>' +
                  '<button class="btn btn-ghost btn-sm" onclick="toggleSchool(' + x.id + ',' + (x.active ? 'false' : 'true') + ')">' + (x.active ? '⏸ تعلیق' : '▶️ فعال‌سازی') + '</button>' +
                  '<button class="btn btn-ghost btn-sm" onclick="resetSchoolAdmin(' + x.id + ')">🔑 بازنشانی رمز مدیر</button>' +
                  '<button class="btn btn-ghost btn-sm" onclick="editSchoolLimits(' + x.id + ')">⚙️ سقف‌ها</button>' +
                '</div>' +
              '</div>';
            }).join("");
        } else if (activeTab === "announce") {
          renderAnnounceForm(main, true);
          return;
        }
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    async function createSchool() {
      try {
        var r = await api("/api/ms/super/schools", {
          name: document.getElementById("scName").value.trim(),
          city: document.getElementById("scCity").value.trim(),
          adminName: document.getElementById("scAdminName").value.trim(),
          days: Number(document.getElementById("scDays").value || 365),
          plan: document.getElementById("scPlan").value,
          maxStudents: Number(document.getElementById("scMaxSt").value || 300),
          maxTeachers: Number(document.getElementById("scMaxTc").value || 30)
        });
        document.getElementById("newSchoolResult").innerHTML =
          '<div style="margin-top:10px;padding:12px;border-radius:12px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.4);">' +
            '<b>✅ مدرسه ساخته شد! اطلاعات ورود مدیر را تحویل دهید:</b><br/>' +
            'کد مدرسه: <b dir="ltr" style="font-size:18px;">' + esc(r.code) + '</b><br/>' +
            'نام کاربری مدیر: <b dir="ltr">' + esc(r.adminUser) + '</b><br/>' +
            'رمز مدیر: <b dir="ltr">' + esc(r.adminPass) + '</b>' +
          '</div>';
        showToast("✅ مدرسه جدید ساخته شد.");
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renewSchool(id) {
      try {
        var r = await api("/api/ms/super/schools/renew", { id: id, days: 365 });
        showToast("✅ اشتراک تا " + r.expiresAt + " تمدید شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function toggleSchool(id, active) {
      try {
        await api("/api/ms/super/schools/update", { id: id, active: active });
        showToast(active ? "✅ مدرسه فعال شد." : "⏸ مدرسه معلق شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function resetSchoolAdmin(id) {
      if (!confirm("رمز مدیر این مدرسه بازنشانی شود؟")) return;
      try {
        var r = await api("/api/ms/super/schools/reset-admin", { id: id });
        alert("🔑 رمز جدید مدیر مدرسه: " + r.newPass);
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function editSchoolLimits(id) {
      var ms = prompt("سقف جدید تعداد دانش‌آموزان:", "300");
      if (ms === null) return;
      var mt = prompt("سقف جدید تعداد معلمان:", "30");
      if (mt === null) return;
      try {
        await api("/api/ms/super/schools/update", { id: id, maxStudents: Number(ms || 300), maxTeachers: Number(mt || 30) });
        showToast("✅ سقف‌ها به‌روزرسانی شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== 📚 تکالیف + 🤖 هوش مصنوعی + 📝 کوییز ====================
    var hwView = { assignmentId: -1 };
    var hwPhotos = {};
    var hwVideos = {};
    var hwFreeVideo = "";
    var aiHistory = [];
    var quizState = { topic: "", questions: [], answers: [] };

    function backBtnHtml() {
      return '<div style="text-align:center;margin:12px 0;">' +
        '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'home\';renderApp()">🔙 بازگشت به خانه</button></div>';
    }

    function adminBackHtml() {
      return '<div style="text-align:center;margin:12px 0;"><button class="btn btn-ghost btn-sm" onclick="goTab(\'admin\')">🔙 بازگشت به مدیریت مدرسه</button></div>';
    }

    // ===== بازخوردهای آماده معلم (کلیکی) =====
    var FB_PRESETS = [
      "آفرین، عالی بود! 👏",
      "خوب پیش رفتی، ادامه بده 💪",
      "قابل قبول 👍",
      "مرتب‌تر بنویس ✍️",
      "دقت بیشتری کن 🔍",
      "کامل نیست؛ دوباره ارسال کن 🔄"
    ];
    function fbPreset(inputId, text) {
      var el = document.getElementById(inputId);
      if (!el) return;
      var cur = String(el.value || "").replace(/\s+$/, "");
      el.value = cur ? (cur.indexOf(text) >= 0 ? cur : cur + " " + text) : text;
      try { el.focus(); } catch (e) {}
    }
    function fbPresetsHtml(inputId) {
      return '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;align-items:center;">' +
        '<span class="muted" style="font-size:10.5px;">⚡ بازخورد سریع:</span>' +
        FB_PRESETS.map(function (t) {
          return '<button type="button" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 9px;border-radius:999px;" onclick="fbPreset(\'' + inputId + '\',\'' + t + '\')">' + t + '</button>';
        }).join("") +
        '</div>';
    }

    function viewPhoto(src) {
      if (!src) return;
      var ov = document.getElementById("photoOverlay");
      if (!ov) {
        ov = document.createElement("div");
        ov.id = "photoOverlay";
        ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:5000;display:flex;align-items:center;justify-content:center;cursor:pointer;";
        ov.onclick = function () { ov.style.display = "none"; };
        document.body.appendChild(ov);
      }
      ov.innerHTML = '<div style="text-align:center;"><img src="' + src + '" style="max-width:96%;max-height:86vh;border-radius:12px;"/><div class="muted" style="margin-top:8px;">برای بستن، کلیک کنید</div></div>';
      ov.style.display = "flex";
    }

    function pickHwPhoto(aid, input) {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var max = 1024;
          var w = img.width, h = img.height;
          if (w > max || h > max) {
            var k = Math.min(max / w, max / h);
            w = Math.round(w * k); h = Math.round(h * k);
          }
          var cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          hwPhotos[aid] = cv.toDataURL("image/jpeg", 0.72);
          var pv = document.getElementById("hwPrev_" + aid);
          if (pv) { pv.src = hwPhotos[aid]; pv.style.display = "inline-block"; }
          showToast("📷 تصویر آماده ارسال است");
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(f);
    }

    async function renderStudentHw(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال دریافت تکالیف...</div>';
      try {
        var d = await api("/api/ms/student/assignments");
        var list = d.assignments || [];
        var free = d.freeSubs || [];
        var freeForm = session.role === "student"
          ? '<div class="card" style="border:1px solid rgba(16,185,129,0.45);">' +
              '<div class="section-title">📤 ارسال تکالیف آزاد</div>' +
              '<div class="muted" style="font-size:12px;">هر تکلیفی که انجام دادی (عکس یا متن) همین‌جا برای معلم بفرست — حتی اگر تکلیف خاصی ثبت نشده باشد.</div>' +
              '<textarea id="hwFreeText" class="input" rows="3" placeholder="متن تکلیف یا توضیح..." style="margin-top:10px;"></textarea>' +
              '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;">' +
                '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">📷 انتخاب عکس<input type="file" accept="image/*" style="display:none;" onchange="pickHwFreePhoto(this)" /></label>' +
                '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">📁 ویدیو<input type="file" accept="video/*" style="display:none;" onchange="pickHwFreeVideo(this)" /></label>' +
                '<button type="button" class="btn btn-ghost btn-sm" onclick="recordHwFreeVideo()">🎥 ضبط ویدیو</button>' +
                '<video id="hwFreeVidPrev" controls style="display:none;max-width:100%;max-height:150px;border-radius:9px;"></video>' +
                '<img id="hwFreePrev" src="" style="display:none;width:64px;height:64px;object-fit:cover;border-radius:9px;border:1px solid var(--border);cursor:pointer;" onclick="viewPhoto(this.src)" />' +
                '<button class="btn btn-emerald btn-sm" style="margin-right:auto;" onclick="submitFreeHw()">📤 ارسال به معلم</button>' +
              '</div>' +
            '</div>'
          : "";
        var freeList = free.length
          ? '<div class="section-title">🗂 ارسال‌های آزاد من</div>' +
            free.map(function (x) {
              return '<div class="card">' +
                (x.reviewed
                  ? '<div style="padding:7px 10px;border-radius:10px;background:rgba(16,185,129,0.13);border:1px solid rgba(16,185,129,0.4);margin-bottom:7px;">✅ تصحیح شد' + (x.score !== null ? ' — نمره: <b>' + x.score + '</b>' : '') + (x.feedback ? ' • 💬 ' + esc(x.feedback) : '') + '</div>'
                  : '<div style="padding:7px 10px;border-radius:10px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);margin-bottom:7px;">⏳ منتظر بررسی معلم</div>') +
                (x.text ? '<div style="padding:8px 10px;background:var(--surface-2);border-radius:11px;font-size:12.5px;">' + esc(x.text) + '</div>' : '') +
                (x.photo ? '<img src="' + x.photo + '" style="width:100%;max-height:220px;object-fit:contain;border-radius:11px;cursor:pointer;margin:6px 0;" onclick="viewPhoto(this.src)" />' : '') +
                (x.video ? '<video src="' + x.video + '" controls style="width:100%;max-height:220px;border-radius:11px;margin:6px 0;"></video>' : '') +
                '<div class="muted" style="font-size:11px;">🗓 ' + esc(x.createdAt) + '</div>' +
              '</div>';
            }).join("")
          : "";
        var asgHtml = list.length
          ? '<div class="section-title">📚 تکالیف کلاس' + (d.studentName ? ' — ' + esc(d.studentName) : '') + '</div>' +
            list.map(function (a) {
              var sub = a.mySubmission;
              var statusHtml = "";
              if (sub) {
                if (sub.reviewed) {
                  statusHtml = '<div style="margin:8px 0;padding:9px 11px;border-radius:11px;background:rgba(16,185,129,0.13);border:1px solid rgba(16,185,129,0.4);">' +
                    '✅ تصحیح شد — نمره: <b>' + sub.score + '</b>' +
                    (sub.feedback ? '<div style="margin-top:4px;font-size:12.5px;">💬 ' + esc(sub.feedback) + '</div>' : '') +
                  '</div>';
                } else {
                  statusHtml = '<div style="margin:8px 0;padding:9px 11px;border-radius:11px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);">⏳ ارسال شد — منتظر تصحیح معلم' + (sub.late ? ' (با تأخیر)' : '') + '</div>';
                }
              }
              var formHtml = "";
              if (session.role === "student" && (!sub || !sub.reviewed)) {
                formHtml =
                  '<textarea id="hwText_' + a.id + '" class="input" rows="3" placeholder="متن تکلیف یا جواب سوالات...">' + esc(sub ? sub.text : "") + '</textarea>' +
                  '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
                    '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">📷 انتخاب عکس<input type="file" accept="image/*" style="display:none;" onchange="pickHwPhoto(' + a.id + ', this)" /></label>' +
                    '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">📁 ویدیو<input type="file" accept="video/*" style="display:none;" onchange="pickHwVideo(' + a.id + ', this)" /></label>' +
                    '<button type="button" class="btn btn-ghost btn-sm" onclick="recordHwVideo(' + a.id + ')">🎥 ضبط ویدیو</button>' +
                    '<video id="hwVidPrev_' + a.id + '" controls src="' + (sub && sub.video ? sub.video : "") + '" style="display:' + (sub && sub.video ? "inline-block" : "none") + ';max-width:100%;max-height:150px;border-radius:9px;"></video>' +
                    '<img id="hwPrev_' + a.id + '" src="" style="display:' + (sub && sub.photo ? "inline-block" : "none") + ';width:64px;height:64px;object-fit:cover;border-radius:9px;border:1px solid var(--border);cursor:pointer;" onclick="viewPhoto(this.src)" />' +
                    '<button class="btn btn-emerald btn-sm" style="margin-right:auto;" onclick="submitHw(' + a.id + ')">📤 ' + (sub ? "ویرایش ارسال" : "ارسال تکلیف") + '</button>' +
                  '</div>';
                if (sub && sub.photo) {
                  formHtml = formHtml.replace('src=""', 'src="' + sub.photo + '"');
                }
              } else if (sub && (sub.photo || sub.video)) {
                formHtml = (sub.photo ? '<img src="' + sub.photo + '" style="width:100%;max-height:220px;object-fit:contain;border-radius:11px;cursor:pointer;" onclick="viewPhoto(this.src)" />' : "") +
                  (sub.video ? '<video src="' + sub.video + '" controls style="width:100%;max-height:220px;border-radius:11px;margin:6px 0;"></video>' : "");
              }
              return '<div class="card">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
                  '<b>📌 ' + esc(a.title) + '</b>' +
                  '<span class="badge-pill" style="background:rgba(99,102,241,0.18);color:#C7D2FE;">' + esc(a.subject || "درس") + '</span>' +
                '</div>' +
                (a.description ? '<div class="muted" style="font-size:12.5px;margin:6px 0;">' + esc(a.description) + '</div>' : '') +
                '<div class="muted" style="font-size:11.5px;">🗓 ثبت: ' + esc(a.createdAt) + (a.dueDate ? ' • مهلت: ' + esc(a.dueDate) : '') + '</div>' +
                statusHtml + formHtml +
              '</div>';
            }).join("")
          : '<div class="muted" style="margin:8px 0;">هنوز تکلیفی برای کلاس شما ثبت نشده — می‌توانید از فرم بالا تکالیف آزاد بفرستید.</div>';
        main.innerHTML = freeForm + freeList + asgHtml + backBtnHtml();
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    var hwFreePhoto = "";
    function pickHwFreePhoto(input) {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var max = 1024;
          var w = img.width, h = img.height;
          if (w > max || h > max) {
            var k = Math.min(max / w, max / h);
            w = Math.round(w * k); h = Math.round(h * k);
          }
          var cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          hwFreePhoto = cv.toDataURL("image/jpeg", 0.72);
          var pv = document.getElementById("hwFreePrev");
          if (pv) { pv.src = hwFreePhoto; pv.style.display = "inline-block"; }
          showToast("📷 تصویر آماده ارسال است");
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(f);
    }

    async function submitFreeHw() {
      try {
        var txt = (document.getElementById("hwFreeText") || {}).value || "";
        if (!txt.trim() && !hwFreePhoto && !hwFreeVideo) return showToast("متن یا عکس یا ویدیوی تکلیف را وارد کنید");
        await api("/api/ms/student/hw/send", { text: txt.trim(), photo: hwFreePhoto, video: hwFreeVideo });
        hwFreePhoto = "";
        hwFreeVideo = "";
        showToast("✅ تکلیف برای معلم ارسال شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function submitHw(aid) {
      try {
        var txt = (document.getElementById("hwText_" + aid) || {}).value || "";
        await api("/api/ms/student/submit", { assignmentId: aid, text: txt.trim(), photo: hwPhotos[aid] || "", video: hwVideos[aid] || "" });
        hwPhotos[aid] = "";
        hwVideos[aid] = "";
        showToast("✅ تکلیف ارسال شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    function readVideoFile(input, maxLen, cb) {
      var f = input.files && input.files[0];
      if (!f) return;
      if (f.size > 2300000) {
        showToast("حجم ویدیو زیاد است (حداکثر ۲ مگابایت) — ویدیوی کوتاه‌تری بفرستید");
        input.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var r = String(reader.result || "");
        if (r.length > maxLen) { showToast("حجم ویدیو زیاد است (حداکثر ۲ مگابایت)"); return; }
        cb(r);
      };
      reader.readAsDataURL(f);
    }

    function pickHwFreeVideo(input) {
      readVideoFile(input, 2700000, function (data) {
        hwFreeVideo = data;
        var pv = document.getElementById("hwFreeVidPrev");
        if (pv) { pv.src = data; pv.style.display = "inline-block"; }
        showToast("🎥 ویدیو آماده ارسال است");
      });
    }

    function pickHwVideo(aid, input) {
      readVideoFile(input, 2700000, function (data) {
        hwVideos[aid] = data;
        var pv = document.getElementById("hwVidPrev_" + aid);
        if (pv) { pv.src = data; pv.style.display = "inline-block"; }
        showToast("🎥 ویدیو آماده ارسال است");
      });
    }

    function recordVideoClip(cb) {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return showToast("ضبط ویدیو در این دستگاه پشتیبانی نمی‌شود");
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 } }, audio: true }).then(function (stream) {
          var chunks = [];
          var mime = "";
          if (typeof MediaRecorder !== "undefined") {
            if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) mime = "video/webm;codecs=vp8,opus";
            else if (MediaRecorder.isTypeSupported("video/webm")) mime = "video/webm";
          }
          var rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 350000, audioBitsPerSecond: 48000 } : undefined);
          var stopped = false;
          var stopAll = function () {
            if (stopped) return;
            stopped = true;
            try { rec.stop(); } catch (e) {}
            stream.getTracks().forEach(function (t) { t.stop(); });
          };
          setTimeout(stopAll, 45000);
          rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          rec.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            window._recStop = null;
            var blob = new Blob(chunks, { type: mime || "video/webm" });
            if (!blob.size) return showToast("ویدیویی ضبط نشد");
            if (blob.size > 2300000) return showToast("ویدیوی ضبط‌شده طولانی شد — کوتاه‌تر ضبط کنید");
            var reader = new FileReader();
            reader.onload = function () { cb(String(reader.result || "")); };
            reader.readAsDataURL(blob);
          };
          rec.start();
          window._recStop = stopAll;
          showToast("🔴 در حال ضبط ویدیو... (حداکثر ۴۵ ثانیه — برای پایان، دوباره همین دکمه را بزنید)");
        }).catch(function () { showToast("دسترسی به دوربین داده نشد"); });
      } catch (e) { showToast("❌ " + e.message); }
    }

    function recordHwFreeVideo() {
      if (window._recStop) { window._recStop(); return; }
      recordVideoClip(function (data) {
        hwFreeVideo = data;
        var pv = document.getElementById("hwFreeVidPrev");
        if (pv) { pv.src = data; pv.style.display = "inline-block"; }
        showToast("🎥 ویدیو آماده ارسال است");
      });
    }

    function recordHwVideo(aid) {
      if (window._recStop) { window._recStop(); return; }
      recordVideoClip(function (data) {
        hwVideos[aid] = data;
        var pv = document.getElementById("hwVidPrev_" + aid);
        if (pv) { pv.src = data; pv.style.display = "inline-block"; }
        showToast("🎥 ویدیو آماده ارسال است");
      });
    }

    async function renderTeacherHw(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        if (!msData) await ensureHome();
        resolveSelClass();
        if (hwView.assignmentId >= 0) {
          var d = await api("/api/ms/teacher/submissions?assignmentId=" + hwView.assignmentId);
          main.innerHTML =
            classSwitcherHtml() +
            '<div class="section-title">📥 تکالیف ارسالی — ' + esc(d.assignment.title) + '</div>' +
            '<div style="text-align:right;margin-bottom:10px;"><button class="btn btn-ghost btn-sm" onclick="hwView.assignmentId=-1;renderApp()">🔙 بازگشت به لیست تکالیف</button></div>' +
            (d.submissions || []).map(function (s) {
              if (!s.submitted) {
                return '<div class="card"><b>' + esc(s.name) + '</b><div class="muted" style="font-size:12px;">❌ تکلیف ارسال نکرده است</div></div>';
              }
              return '<div class="card">' +
                '<b>' + esc(s.name) + '</b>' +
                (s.late ? ' <span class="badge-pill" style="background:rgba(245,158,11,0.2);color:#FCD34D;">با تأخیر</span>' : '') +
                (s.reviewed ? ' <span class="badge-pill" style="background:rgba(16,185,129,0.2);color:#6EE7B7;">تصحیح شد</span>' : '') +
                (s.text ? '<div style="margin:7px 0;padding:9px 11px;background:var(--surface-2);border-radius:11px;font-size:13px;">' + esc(s.text) + '</div>' : '') +
                (s.photo ? '<img src="' + s.photo + '" style="width:100%;max-height:230px;object-fit:contain;border-radius:11px;cursor:pointer;margin:6px 0;" onclick="viewPhoto(this.src)" />' : '') +
                (s.video ? '<video src="' + s.video + '" controls style="width:100%;max-height:260px;border-radius:11px;margin:6px 0;"></video>' : '') +
                '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">' +
                  '<input id="revScore_' + s.submissionId + '" class="input" type="number" step="0.25" dir="ltr" placeholder="نمره" style="width:95px;margin:0;" value="' + (s.score !== null ? s.score : "") + '" />' +
                  '<input id="revFb_' + s.submissionId + '" class="input" placeholder="بازخورد معلم..." style="flex:1;min-width:150px;margin:0;" value="' + esc(s.feedback) + '" />' +
                  '<button class="btn btn-emerald btn-sm" onclick="saveReview(' + s.submissionId + ')">✅ ثبت</button>' +
                '</div>' +
                fbPresetsHtml("revFb_" + s.submissionId) +
              '</div>';
            }).join("") +
            backBtnHtml();
          return;
        }
        var list = await api("/api/ms/teacher/assignments?classId=" + selClassId);
        main.innerHTML =
          classSwitcherHtml() +
          '<div class="card">' +
            '<div class="section-title">➕ تکلیف جدید</div>' +
            '<input id="asgTitle" class="input" placeholder="عنوان تکلیف (مثلاً تمرین صفحه ۴۵)" />' +
            '<textarea id="asgDesc" class="input" rows="3" placeholder="توضیحات و سوالات..."></textarea>' +
            '<input id="asgDue" class="input" type="date" dir="ltr" placeholder="مهلت ارسال (اختیاری)" />' +
            '<button class="btn btn-emerald" onclick="createAssignment()">📤 ثبت تکلیف برای کلاس</button>' +
          '</div>' +
          '<div class="card" style="cursor:pointer;border:1px solid rgba(16,185,129,0.45);" onclick="hwView.assignmentId=0;renderApp()">' +
            '<b>📥 تکالیف آزاد ارسالی دانش‌آموزان</b>' +
            '<div class="muted" style="font-size:12px;margin-top:5px;">تکالیفی که دانش‌آموزان خارج از تکلیف مشخص فرستاده‌اند (عکس/متن) — برای مشاهده و تصحیح کلیک کنید.</div>' +
          '</div>' +
          '<div class="section-title">📚 تکالیف ثبت‌شده</div>' +
          ((list.assignments || []).length
            ? list.assignments.map(function (a) {
                return '<div class="card" style="cursor:pointer;" onclick="hwView.assignmentId=' + a.id + ';renderApp()">' +
                  '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
                    '<b>📌 ' + esc(a.title) + '</b>' +
                    '<span class="badge-pill" style="background:rgba(99,102,241,0.18);color:#C7D2FE;">' + a.submissionCount + ' ارسال / ' + a.reviewedCount + ' تصحیح</span>' +
                  '</div>' +
                  (a.dueDate ? '<div class="muted" style="font-size:11.5px;">🗓 مهلت: ' + esc(a.dueDate) + '</div>' : '') +
                  '<div style="margin-top:7px;display:flex;gap:6px;">' +
                    '<button class="btn btn-sm" onclick="event.stopPropagation();hwView.assignmentId=' + a.id + ';renderApp()">📥 بررسی تکالیف</button>' +
                    '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();delAssignment(' + a.id + ')">🗑</button>' +
                  '</div>' +
                '</div>';
              }).join("")
            : '<div class="card"><div class="muted">هنوز تکلیفی ثبت نشده است.</div></div>') +
          backBtnHtml();
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    async function createAssignment() {
      try {
        var title = document.getElementById("asgTitle").value.trim();
        if (!title) return showToast("عنوان تکلیف را بنویسید");
        await api("/api/ms/teacher/assignments", {
          classId: selClassId,
          title: title,
          description: document.getElementById("asgDesc").value.trim(),
          dueDate: document.getElementById("asgDue").value
        });
        showToast("✅ تکلیف برای کلاس ثبت شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function delAssignment(id) {
      if (!confirm("این تکلیف و همه ارسال‌های آن حذف شود؟")) return;
      try {
        await api("/api/ms/teacher/assignments/delete", { id: id });
        showToast("🗑 حذف شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function saveReview(submissionId) {
      try {
        var score = Number(document.getElementById("revScore_" + submissionId).value);
        if (!isFinite(score)) return showToast("نمره را وارد کنید");
        await api("/api/ms/teacher/review", {
          submissionId: submissionId,
          score: score,
          feedback: document.getElementById("revFb_" + submissionId).value.trim()
        });
        showToast("✅ نمره و بازخورد ثبت شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ---- 🤖 پرسش و پاسخ هوشمند ----
    // ==================== 💬 گفتگوی کلاس ====================
    var classChatTimer = null;
    var classChatDraft = "";
    var classChatData = { classId: 0, messages: [] };

    function chatInputChanged(el) { classChatDraft = el.value || ""; }

    function chatMsgsHtml() {
      if (!classChatData.messages || !classChatData.messages.length) {
        return classChatData.loaded
          ? '<div class="muted" style="text-align:center;padding:18px;">هنوز پیامی در گفتگوی کلاس نیست — اولین نفر باشید! 💬</div>'
          : '<div class="muted" style="text-align:center;padding:18px;">⏳ در حال دریافت پیام‌ها...</div>';
      }
      return classChatData.messages.map(function (m) {
        return '<div class="bubble ' + (m.mine ? "bubble-me" : "bubble-them") + '">' +
          (!m.mine ? '<div style="font-size:10.5px;opacity:.75;margin-bottom:3px;">' + esc(m.name) + (m.role === "teacher" ? " 👨‍🏫" : m.role === "admin" ? " 🏫" : "") + '</div>' : "") +
          '<div style="white-space:pre-wrap;">' + esc(m.text) + '</div>' +
          '<div style="font-size:9.5px;opacity:.65;margin-top:3px;">' + esc(m.date) + '</div>' +
          (session.role === "teacher" || session.role === "admin"
            ? '<button class="btn btn-ghost btn-sm" style="font-size:9.5px;padding:2px 7px;margin-top:4px;" onclick="delChatMsg(' + m.id + ')">🗑 حذف</button>'
            : "") +
        '</div>';
      }).join("");
    }

    async function refreshClassChat() {
      try {
        var d = await api("/api/ms/edu/chat" + (session.role !== "student" && selClassId ? "?classId=" + selClassId : ""));
        classChatData = d;
        classChatData.loaded = true;
        var box = document.getElementById("chatMsgs");
        if (box) {
          box.innerHTML = chatMsgsHtml();
          box.scrollTop = box.scrollHeight;
        }
      } catch (e) {}
    }

    async function renderClassChat(main) {
      try {
        if (!msData) await ensureHome();
        if (session.role !== "student") resolveSelClass();
        if (!classChatTimer) {
          classChatTimer = setInterval(function () {
            if (activeTab !== "classchat") { clearInterval(classChatTimer); classChatTimer = null; return; }
            refreshClassChat();
          }, 4000);
        }
        main.innerHTML =
          (session.role !== "student" ? classSwitcherHtml() : "") +
          '<div class="section-title">💬 گفتگوی کلاس' + (session.role === "student" && msData && msData.class && msData.class.label ? " — " + esc(msData.class.label) : "") + '</div>' +
          '<div class="card" style="padding:10px;">' +
            '<div class="muted" style="font-size:11px;margin-bottom:8px;">با هم‌کلاسی‌هایت گفتگو کن 🌟 — پیام‌های بی‌ادبانه توسط معلم حذف می‌شوند.</div>' +
            '<div id="chatMsgs" style="height:320px;overflow-y:auto;background:var(--surface-2);border-radius:12px;padding:10px;">' + chatMsgsHtml() + '</div>' +
            '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;">' +
              '<input id="chatInput" class="input" style="flex:1 1 auto;width:auto;min-width:0;margin:0;" placeholder="پیامت را بنویس..." value="' + esc(classChatDraft) + '" oninput="chatInputChanged(this)" onkeydown="if(event.key===\'Enter\')sendChatMsg()" />' +
              '<button class="btn btn-emerald" style="width:auto;flex:0 0 auto;padding:12px 22px;" onclick="sendChatMsg()">📤 ارسال</button>' +
            '</div>' +
          '</div>' +
          backBtnHtml();
        await refreshClassChat();
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    async function sendChatMsg() {
      var el = document.getElementById("chatInput");
      var txt = (el ? el.value : classChatDraft || "").trim();
      if (!txt) return showToast("متن پیام را بنویسید");
      try {
        await api("/api/ms/edu/chat", { classId: classChatData.classId || Number(session.classId || 0), text: txt });
        classChatDraft = "";
        if (el) el.value = "";
        await refreshClassChat();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function delChatMsg(id) {
      if (!confirm("این پیام حذف شود؟")) return;
      try {
        await api("/api/ms/edu/chat/delete", { id: id });
        await refreshClassChat();
      } catch (e) { showToast("❌ " + e.message); }
    }

    function renderAiPanel(main) {
      main.innerHTML =
        '<div class="section-title">🤖 پرسش و پاسخ هوشمند</div>' +
        '<div class="card">' +
          '<p class="muted" style="margin-top:0;">هر سوال درسی‌تان را بپرسید؛ دستیار هوش مصنوعی پاسخ کامل فارسی می‌دهد.</p>' +
          (aiHistory.length
            ? aiHistory.map(function (h) {
                return '<div style="margin-bottom:10px;">' +
                  '<div style="background:rgba(99,102,241,0.16);padding:9px 12px;border-radius:12px 12px 3px 12px;margin-bottom:6px;"><b>🙋 شما:</b> ' + esc(h.q) + '</div>' +
                  '<div style="background:var(--surface-2);padding:9px 12px;border-radius:12px 12px 12px 3px;white-space:pre-wrap;font-size:13px;">🤖 ' + esc(h.a) + '</div>' +
                  (h.photo ? '<img src="' + h.photo + '" style="max-width:100%;border-radius:11px;margin-top:6px;cursor:pointer;" onclick="viewPhoto(this.src)" />' : '') +
                '</div>';
              }).join("")
            : "") +
          '<textarea id="aiQ" class="input" rows="3" placeholder="سوالتان را بنویسید... (مثلاً: علت رنگین کمان چیست؟)"></textarea>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<button class="btn btn-gold" onclick="toggleAiVoice()">🎤 گفتن سوال با صدا</button>' +
            '<span class="muted" id="micState" style="font-size:11.5px;"></span>' +
          '</div>' +
          '<button class="btn" onclick="askAiNow()">✨ پرسیدن از هوش مصنوعی</button>' +
        '</div>' +
        backBtnHtml();
    }

    async function askAiNow() {
      var q = (document.getElementById("aiQ") || {}).value || "";
      q = q.trim();
      if (!q) return showToast("اول سوالتان را بنویسید");
      aiHistory.push({ q: q, a: "⏳ در حال فکر کردن...", photo: "" });
      renderApp();
      try {
        var r = await api("/api/ms/ai/ask", { question: q });
        aiHistory[aiHistory.length - 1] = { q: q, a: r.answer || "پاسخی دریافت نشد.", photo: r.photoUrl || "" };
      } catch (e) {
        aiHistory[aiHistory.length - 1] = { q: q, a: "❌ " + e.message, photo: "" };
      }
      renderApp();
    }

    var aiRec = null;
    var aiRecChunks = [];
    async function toggleAiVoice() {
      if (aiRec && aiRec.state === "recording") {
        try { aiRec.stop(); } catch (e) {}
        return;
      }
      if (typeof MediaRecorder === "undefined") return showToast("ضبط صدا در این دستگاه پشتیبانی نمی‌شود");
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        aiRecChunks = [];
        var mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
        aiRec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : undefined);
        aiRec.ondataavailable = function (e) { if (e.data && e.data.size) aiRecChunks.push(e.data); };
        aiRec.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          aiRec = null;
          var blob = new Blob(aiRecChunks, { type: "audio/webm" });
          var st = document.getElementById("micState");
          if (!blob.size) { if (st) st.textContent = ""; return; }
          if (blob.size > 1400000) { if (st) st.textContent = ""; return showToast("صدای ضبط‌شده خیلی طولانی است (حداکثر ۹۰ ثانیه)"); }
          if (st) st.textContent = "⏳ در حال تبدیل صدا به متن...";
          var reader = new FileReader();
          reader.onload = function () {
            api("/api/ms/edu/ai/voice", { audio: String(reader.result || "") }).then(function (r) {
              var q = document.getElementById("aiQ");
              if (q) q.value = ((q.value || "") + " " + (r.text || "")).trim();
              if (st) st.textContent = "✅ متن آماده شد — دکمه پرسیدن را بزنید";
            }).catch(function (e) {
              if (st) st.textContent = "";
              showToast("❌ " + e.message);
            });
          };
          reader.readAsDataURL(blob);
        };
        aiRec.start();
        var st2 = document.getElementById("micState");
        if (st2) st2.textContent = "🔴 در حال ضبط... (برای پایان، دوباره بزنید)";
      } catch (e) {
        showToast("دسترسی به میکروفون داده نشد");
      }
    }

    // ---- 📝 کوییز هوشمند ----
    function renderQuizPanel(main) {
      if (!quizState.questions.length) {
        main.innerHTML =
          '<div class="section-title">📝 کوییز هوشمند</div>' +
          '<div class="card">' +
            '<p class="muted" style="margin-top:0;">موضوع درسی را بنویسید تا هوش مصنوعی برایتان طرح سوال چهارگزینه‌ای بسازد:</p>' +
            '<input id="quizTopic" class="input" placeholder="مثلاً: کسرها، انقلاب اسلامی، سلول گیاهی..." />' +
            '<button class="btn btn-emerald" onclick="makeQuiz()">✨ ساخت کوییز</button>' +
          '</div>' +
          backBtnHtml();
        return;
      }
      var score = 0, answered = 0;
      main.innerHTML =
        '<div class="section-title">📝 کوییز «' + esc(quizState.topic) + '»</div>' +
        quizState.questions.map(function (q, qi) {
          var myAns = quizState.answers[qi];
          var corr = Math.min(Math.max(Math.round(q.correct), 1), 4) - 1;
          if (myAns !== undefined) { answered++; if (myAns === corr) score++; }
          return '<div class="card">' +
            '<b>' + (qi + 1) + '. ' + esc(q.question) + '</b>' +
            '<div style="margin-top:9px;display:grid;gap:7px;">' +
              (q.options || []).map(function (opt, oi) {
                var st = "";
                if (myAns !== undefined) {
                  if (oi === corr) st = "background:rgba(16,185,129,0.22);border-color:rgba(16,185,129,0.6);";
                  else if (oi === myAns) st = "background:rgba(244,63,94,0.2);border-color:rgba(244,63,94,0.55);";
                }
                return '<button class="btn btn-ghost" style="text-align:right;' + st + '" onclick="answerQuiz(' + qi + ',' + oi + ')">' + esc(opt) + '</button>';
              }).join("") +
            '</div>' +
          '</div>';
        }).join("") +
        (answered === quizState.questions.length
          ? '<div class="card" style="text-align:center;border-color:rgba(245,158,11,0.5);"><div style="font-size:22px;">🏆</div><b>نتیجه: ' + score + ' از ' + quizState.questions.length + '</b>' +
            '<div style="margin-top:9px;display:flex;gap:8px;justify-content:center;">' +
              '<button class="btn btn-sm" onclick="quizState={topic:\'\',questions:[],answers:[]};renderApp()">🔄 کوییز جدید</button>' +
            '</div></div>'
          : "") +
        backBtnHtml();
    }

    async function makeQuiz() {
      var topic = (document.getElementById("quizTopic") || {}).value || "";
      topic = topic.trim();
      if (!topic) return showToast("موضوع کوییز را بنویسید");
      showToast("⏳ هوش مصنوعی در حال طراحی سوالات...");
      try {
        var r = await api("/api/ms/ai/quiz", { topic: topic, count: 3 });
        quizState = { topic: topic, questions: r.questions || [], answers: [] };
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    function answerQuiz(qi, oi) {
      if (quizState.answers[qi] !== undefined) return;
      quizState.answers[qi] = oi;
      renderApp();
    }

    // ==================== 🧠 کارگاه یادگیری + 🎯🛒📚🎮 امکانات ادغام‌شده ====================
    var labToolState = { tool: "", result: null, science: { topic: "", step: 0, log: [] }, eng: [] };
    var labTools = [
      { key: "flashcards", icon: "🤖", title: "فلش‌کارت هوشمند", desc: "ساخت خودکار فلش‌کارت" },
      { key: "essay", icon: "✍️", title: "تصحیح انشا", desc: "ارزیابی نگارش فارسی" },
      { key: "dictation", icon: "🎙", title: "دیکته هوشمند", desc: "بررسی دیکته با AI" },
      { key: "science", icon: "🧪", title: "آزمایشگاه علوم", desc: "شبیه‌ساز تعاملی" },
      { key: "english", icon: "🎧", title: "مکالمه انگلیسی", desc: "مربی مکالمه زبان" },
      { key: "mindmap", icon: "🗺", title: "نقشه ذهنی", desc: "نقشه تصویری درس" },
      { key: "summary", icon: "📚", title: "جزوه شب امتحان", desc: "خلاصه‌ساز هوشمند" },
      { key: "exam", icon: "📄", title: "برگه امتحانی", desc: "آزمون تشریحی + پاسخنامه" },
      { key: "plan", icon: "📅", title: "برنامه هفتگی", desc: "برنامه‌ریز مطالعه" },
      { key: "quizfromtext", icon: "🎲", title: "کوییز از متن درس", desc: "طراح سوال از جزوه" },
      { key: "scientist", icon: "🗣", title: "گفتگو با دانشمند", desc: "صندلی داغ علمی" }
    ];

    async function renderLab(main) {
      if (activeTab === "labtool") { await renderLabTool(main); return; }
      main.innerHTML =
        '<div class="section-title">🧠 کارگاه هوشمند یادگیری</div>' +
        '<div class="menu-grid">' +
          labTools.map(function (t) {
            return '<button class="menu-item" onclick="openLabTool(\'' + t.key + '\')"><span>' + t.icon + '</span>' + t.title + '</button>';
          }).join("") +
        '</div>' +
        '<div class="card" style="margin-top:10px;"><div class="muted" style="font-size:12.5px;">💡 بعد از کار با هر ابزار، می‌توانید گزارش فعالیتتان را برای معلم بفرستید و پس از تایید او ⭐ امتیاز بگیرید.</div></div>' +
        '<div style="text-align:center;margin:12px 0;">' +
          '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'home\';renderApp()">🔙 بازگشت به خانه</button>' +
        '</div>';
    }

    function openLabTool(tool) {
      labToolState = { tool: tool, result: null, science: { topic: "", step: 0, log: [] }, eng: [] };
      activeTab = "labtool";
      renderApp();
    }

    function labToolForm(t) {
      if (t === "flashcards" || t === "mindmap" || t === "summary") {
        return '<input id="ltTopic" class="input" placeholder="موضوع یا متن درس (مثلاً: فصل ۳ ریاضی — مساحت)" />' +
          (t === "summary" ? '<input id="ltInfo" class="input" placeholder="پایه تحصیلی (مثلاً هشتم) — اختیاری" />' : "");
      }
      if (t === "essay") {
        return '<textarea id="ltText" class="input" rows="7" placeholder="متن انشا یا نگارش خود را اینجا بنویسید..."></textarea>';
      }
      if (t === "dictation") {
        return '<textarea id="ltExpected" class="input" rows="3" placeholder="متن اصلی دیکته (از کتاب)..."></textarea>' +
          '<textarea id="ltOcr" class="input" rows="3" placeholder="متنی که شما نوشتید (یا تایپ کردید)..."></textarea>';
      }
      if (t === "science") {
        return '<input id="ltTopic" class="input" placeholder="موضوع آزمایش (مثلاً: آزمایش فشار هوا)" />' +
          '<div id="ltScienceLog"></div>';
      }
      if (t === "english") {
        return '<textarea id="ltText" class="input" rows="3" placeholder="به انگلیسی بنویسید... (مثلاً: Hello! How are you?)"></textarea>';
      }
      if (t === "exam") {
        return '<textarea id="ltTopic" class="input" rows="5" placeholder="متن درس یا جزوه برای طراحی آزمون تشریحی..."></textarea>' +
          '<input id="ltInfo" class="input" placeholder="پایه / عنوان آزمون — اختیاری" />';
      }
      if (t === "plan") {
        return '<textarea id="ltTopic" class="input" rows="3" placeholder="اهداف هفته تو (مثلاً: جمع‌بندی ریاضی فصل ۳ و لغات انگلیسی)..."></textarea>' +
          '<input id="ltInfo" class="input" placeholder="پایه تحصیلی — اختیاری" />';
      }
      if (t === "quizfromtext") {
        return '<textarea id="ltTopic" class="input" rows="6" placeholder="متن درس یا جزوه را اینجا بچسبانید تا از آن سوال طراحی شود..."></textarea>';
      }
      if (t === "scientist") {
        return '<select id="ltSci" class="input">' +
            '<option value="avicenna">🔬 ابن سینا</option>' +
            '<option value="khayyam">📐 عمر خیام</option>' +
            '<option value="einstein">⚛️ انیشتین</option>' +
            '<option value="curie">🧪 ماری کوری</option>' +
          '</select>' +
          '<textarea id="ltText" class="input" rows="3" placeholder="سوالتان را از این دانشمند بپرسید..."></textarea>';
      }
      return "";
    }

    async function renderLabTool(main) {
      var t = labToolState.tool;
      var meta = labTools.find(function (x) { return x.key === t; }) || { icon: "🧠", title: "ابزار" };
      main.innerHTML =
        '<div class="section-title">' + meta.icon + ' ' + esc(meta.title) + '</div>' +
        '<div class="card">' +
          labToolForm(t) +
          '<button class="btn" onclick="runLabTool()">✨ اجرای هوشمند</button>' +
        '</div>' +
        '<div id="ltResult">' + (labToolState.result !== null ? renderLabResult(labToolState.result, t) : "") + '</div>' +
        (session.role === "student" && labToolState.result !== null
          ? '<div class="card" style="text-align:center;">' +
              '<button class="btn btn-emerald" onclick="submitLabReport()">📤 ارسال گزارش به معلم (دریافت امتیاز پس از تایید)</button>' +
            '</div>'
          : "") +
        '<div style="text-align:center;margin:12px 0;">' +
          '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'lab\';renderApp()">🔙 بازگشت به کارگاه</button>' +
        '</div>';
    }

    function renderLabResult(res, tool) {
      if (res === null || res === undefined) return "";
      var wrap = function (inner) { return '<div class="card">' + inner + '</div>'; };
      if (typeof res === "string") return wrap('<div style="white-space:pre-wrap;font-size:13px;">' + esc(res) + '</div>');
      if (Array.isArray(res)) {
        if (res.length && res[0] && res[0].question) {
          labToolState.quiz = res;
          return wrap('<div class="section-title">🎲 سوالات ساخته‌شده</div>' + res.map(function (q, qi) {
            return '<div style="margin-bottom:10px;"><b>' + (qi + 1) + '. ' + esc(q.question) + '</b>' +
              (q.options || []).map(function (o, oi) {
                return '<div class="muted" style="padding:5px 9px;margin-top:4px;background:var(--surface-2);border-radius:9px;">' + String.fromCharCode(1571 + oi * 0) + ' ' + esc(o) + (q.correct === oi + 1 ? ' ✅' : '') + '</div>';
              }).join("") + '</div>';
          }).join(""));
        }
        return wrap('<div class="section-title">🃏 فلش‌کارت‌ها</div>' + res.map(function (c, i) {
          return '<div style="padding:9px 11px;background:var(--surface-2);border-radius:11px;margin-bottom:7px;">' +
            '<b>' + (i + 1) + '. ' + esc(c.front || c.question || "") + '</b>' +
            '<div class="muted" style="margin-top:3px;">🔹 ' + esc(c.back || c.answer || "") + '</div></div>';
        }).join(""));
      }
      if (typeof res === "object") {
        if (res.image) {
          return wrap('<img src="' + res.image + '" style="width:100%;border-radius:12px;"/>' +
            (res.rootTitle ? '<div class="muted" style="margin-top:6px;">🗺 ' + esc(res.rootTitle) + '</div>' : "") +
            (res.text ? '<div class="muted" style="font-size:11.5px;white-space:pre-wrap;margin-top:6px;">' + esc(res.text) + '</div>' : ""));
        }
        if (res.examSheet) {
          return wrap('<div class="section-title">📄 برگه امتحانی</div><div style="white-space:pre-wrap;font-size:13px;">' + esc(res.examSheet) + '</div>' +
            '<div class="section-title">✅ پاسخنامه</div><div style="white-space:pre-wrap;font-size:13px;">' + esc(res.answerKey || "") + '</div>');
        }
        var txt = "";
        if (res.reply) txt += "🤖 " + res.reply + "\n\n";
        if (res.text && typeof res.text === "string") txt += res.text + "\n\n";
        if (res.feedback) txt += res.feedback + "\n\n";
        if (res.corrections) txt += "اصلاحات: " + res.corrections + "\n\n";
        if (res.question) txt += "❓ " + res.question + "\n";
        if (Array.isArray(res.choices)) {
          txt += res.choices.map(function (c, i) { return String.fromCharCode(1571 + 0) + " " + c; }).join("\n");
        }
        if (!txt) {
          Object.keys(res).forEach(function (k) {
            if (typeof res[k] === "string") txt += k + ": " + res[k] + "\n";
          });
        }
        return wrap('<div style="white-space:pre-wrap;font-size:13px;">' + esc(txt || JSON.stringify(res)) + '</div>');
      }
      return wrap('<div class="muted">پاسخی دریافت نشد.</div>');
    }

    async function runLabTool() {
      var t = labToolState.tool;
      var payload = { tool: t };
      if (t === "flashcards" || t === "mindmap" || t === "summary" || t === "science" || t === "exam" || t === "plan" || t === "quizfromtext") {
        payload.topic = (document.getElementById("ltTopic") || {}).value || "";
        payload.source = payload.topic;
        payload.info = (document.getElementById("ltInfo") || {}).value || "";
        payload.goals = payload.topic;
        payload.grade = payload.info;
        if (t === "science") {
          payload.topic = labToolState.science.topic || payload.topic;
          if (payload.topic) labToolState.science.topic = payload.topic;
          payload.step = labToolState.science.step;
          payload.log = labToolState.science.log;
        }
        if (t === "quizfromtext") payload.count = 3;
        if (!payload.topic.trim() && t !== "quizfromtext") return showToast("موضوع را وارد کنید");
        if (t === "quizfromtext" && !payload.source.trim()) return showToast("متن درس را وارد کنید");
      } else if (t === "essay" || t === "english" || t === "scientist") {
        payload.text = (document.getElementById("ltText") || {}).value || "";
        payload.q = payload.text;
        payload.sciKey = (document.getElementById("ltSci") || {}).value || "avicenna";
        if (!payload.text.trim()) return showToast("متن را وارد کنید");
        if (t === "english") labToolState.eng.push("شما: " + payload.text);
      } else if (t === "dictation") {
        payload.expected = (document.getElementById("ltExpected") || {}).value || "";
        payload.ocr = (document.getElementById("ltOcr") || {}).value || "";
        if (!payload.expected.trim() || !payload.ocr.trim()) return showToast("هر دو متن لازم است");
      }
      showToast("⏳ هوش مصنوعی در حال پردازش...");
      try {
        var r = await api("/api/ms/edu/ai", payload);
        labToolState.result = r.result;
        if (t === "science") labToolState.science.step++;
        if (t === "english" && r.result && r.result.reply) labToolState.eng.push("مربی: " + r.result.reply);
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function submitLabReport() {
      var summary = prompt("گزارش کوتاه فعالیتتان را بنویسید (پس از تایید معلم امتیاز می‌گیرید):");
      if (!summary || summary.trim().length < 3) return showToast("گزارش کوتاه لازم است");
      try {
        await api("/api/ms/edu/lab/submit", {
          tool: labToolState.tool,
          topic: labToolState.science.topic || labToolState.tool,
          summary: summary.trim()
        });
        showToast("✅ گزارش برای معلم ارسال شد؛ پس از تایید امتیاز می‌گیرید.");
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ---- 🎯 ماموریت روز ----
    async function renderMission(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/home");
        if (!d.mission) {
          main.innerHTML = '<div class="card">📭 ماموریت امروزی ثبت نشده است.</div>' + backBtnHtml();
          return;
        }
        var m = d.mission;
        var statusHtml = m.status === "approved"
          ? '<div style="padding:9px 11px;border-radius:11px;background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.4);">✅ تایید شد — امتیاز: <b>+' + m.points + '</b>' + (m.feedback ? '<div style="font-size:12px;margin-top:4px;">💬 ' + esc(m.feedback) + '</div>' : '') + '</div>'
          : m.status === "pending"
          ? '<div style="padding:9px 11px;border-radius:11px;background:rgba(245,158,11,0.13);border:1px solid rgba(245,158,11,0.4);">⏳ گزارش شما برای معلم ارسال شد؛ منتظر تایید بمانید.</div>'
          : m.status === "rejected"
          ? '<div style="padding:9px 11px;border-radius:11px;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.4);">❌ تایید نشد' + (m.feedback ? ' — ' + esc(m.feedback) : '') + '</div>'
          : "";
        main.innerHTML =
          '<div class="section-title">🎯 ماموریت امروز تو</div>' +
          '<div class="card">' +
            '<div style="font-size:14.5px;font-weight:700;">' + esc(m.text) + '</div>' +
            '<div style="margin:10px 0;">' + statusHtml + '</div>' +
            (session.role === "student" && m.status !== "approved" && m.status !== "pending"
              ? '<textarea id="missionProof" class="input" rows="4" placeholder="گزارش انجام ماموریت را بنویسید...">' + esc(m.proof) + '</textarea>' +
                '<button class="btn btn-emerald" onclick="submitMission()">📤 ارسال گزارش به معلم</button>'
              : "") +
          '</div>' +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function submitMission() {
      try {
        await api("/api/ms/edu/mission/submit", { proof: (document.getElementById("missionProof") || {}).value });
        showToast("✅ گزارش ماموریت ارسال شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ---- 🏆 رتبه‌بندی ----
    async function renderBoard(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/leaderboard");
        var medals = ["🥇", "🥈", "🥉"];
        main.innerHTML =
          '<div class="section-title">🏆 امتیازها و رتبه‌بندی همه دانش‌آموزان مدرسه</div>' +
          '<div class="card"><table class="table"><thead><tr><th>#</th><th>نام</th><th>⭐ امتیاز</th></tr></thead><tbody>' +
          (d.top || []).map(function (x, i) {
            return '<tr' + (x.id === (session.studentId || 0) ? ' style="background:rgba(245,158,11,0.1);"' : '') + '>' +
              '<td>' + (medals[i] || (i + 1)) + '</td><td>' + esc(x.name) + '</td><td><b>' + x.points + '</b></td></tr>';
          }).join("") +
          '</tbody></table></div>' +
          '<div class="card" style="text-align:center;">🏅 رتبه شما: <b>' + (d.myRank || "—") + '</b> از ' + ((d.top || []).length) + ' • ⭐ ' + d.myPoints + ' امتیاز</div>' +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    // ---- 🛒 فروشگاه جوایز ----
    async function renderShop(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/shop");
        main.innerHTML =
          '<div class="section-title">🛒 فروشگاه جوایز (موجودی: ' + d.points + ' ⭐)</div>' +
          '<div class="menu-grid">' +
            (d.items || []).map(function (i) {
              return '<button class="menu-item" style="flex-direction:column;align-items:flex-start;" onclick="orderShopItem(' + i.id + ')">' +
                '<span style="font-size:17px;">🎁</span><b>' + esc(i.title) + '</b>' +
                '<span class="muted" style="font-size:11.5px;">' + i.cost + ' ⭐</span></button>';
            }).join("") +
          '</div>' +
          ((d.items || []).length === 0 ? '<div class="card"><div class="muted">هنوز جایزه‌ای ثبت نشده است.</div></div>' : "") +
          '<div class="section-title">📜 سفارش‌های من</div>' +
          '<div class="card"><table class="table"><thead><tr><th>جایزه</th><th>وضعیت</th><th>تاریخ</th></tr></thead><tbody>' +
          ((d.orders || []).length
            ? d.orders.map(function (o) {
                var st = o.status === "approved" ? '✅ تحویل شد' : (o.status === "rejected" ? '❌ رد شد' : '⏳ در انتظار تایید معلم');
                return '<tr><td>' + esc(o.title) + '</td><td>' + st + '</td><td class="muted">' + esc(o.date) + '</td></tr>';
              }).join("")
            : '<tr><td colspan="3" class="muted">سفارشی ندارید.</td></tr>') +
          '</tbody></table></div>' +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function orderShopItem(itemId) {
      if (!confirm("این جایزه سفارش داده شود؟ (پس از تایید معلم از امتیاز شما کم می‌شود)")) return;
      try {
        await api("/api/ms/edu/shop/order", { itemId: itemId });
        showToast("✅ سفارش ثبت شد؛ منتظر تایید معلم بمانید.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ---- 📂 کتابخانه ----
    async function renderLibrary(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/library");
        main.innerHTML =
          '<div class="section-title">📂 کتابخانه و جزوات</div>' +
          ((d.items || []).length
            ? d.items.map(function (i) {
                return '<div class="card"><b>📖 ' + esc(i.title) + '</b>' +
                  (i.body ? '<div style="white-space:pre-wrap;font-size:12.5px;margin-top:6px;">' + esc(i.body) + '</div>' : '') +
                  '<div class="muted" style="font-size:11px;margin-top:6px;">' + esc(i.date) + (i.by ? ' • ' + esc(i.by) : '') + '</div></div>';
              }).join("")
            : '<div class="card"><div class="muted">کتابخانه خالی است.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    // ---- 💬 پیام به معلم ----
    async function renderMessages(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/messages");
        main.innerHTML =
          '<div class="section-title">💬 گفتگو با معلم</div>' +
          '<div class="card">' +
            ((d.messages || []).length
              ? d.messages.map(function (m) {
                  var isMe = m.fromRole === "student";
                  return '<div style="margin-bottom:8px;text-align:' + (isMe ? "left" : "right") + ';">' +
                    '<div style="display:inline-block;max-width:85%;padding:8px 11px;border-radius:12px;background:' + (isMe ? "rgba(99,102,241,0.18)" : "var(--surface-2)") + ';font-size:12.5px;">' +
                    (isMe ? '' : '<b>👨‍🏫 معلم:</b> ') + esc(m.text) +
                    '<div class="muted" style="font-size:10px;margin-top:3px;">' + esc(m.date) + '</div></div></div>';
                }).join("")
              : '<div class="muted">هنوز پیامی رد و بدل نشده است.</div>') +
            '<textarea id="msgText" class="input" rows="3" placeholder="پیام خود را بنویسید..."></textarea>' +
            '<button class="btn btn-emerald" onclick="sendMsg()">📤 ارسال به معلم</button>' +
          '</div>' +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function sendMsg() {
      try {
        await api("/api/ms/edu/messages", { text: (document.getElementById("msgText") || {}).value });
        showToast("✅ پیام ارسال شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ---- 🧩 پازل واژه علمی روز ----
    var PUZZLE_WORDS = [
      ["فتوسنتز", "فرایند ساخت غذا توسط گیاهان با نور خورشید"],
      ["گرانش", "نیروی جذب اجسام به سمت زمین"],
      ["مولکول", "کوچک‌ترین جزء یک ماده شیمیایی"],
      ["اقلیم", "آب‌وهوای بلندمدت یک منطقه"],
      ["بُعد", "یکی از جهت‌های طول، عرض یا ارتفاع"],
      ["تکامل", "تدریجی تغییر گونه‌های زنده در طول زمان"],
      ["اقیانوسوس", "پهنه آبی شور و گسترده روی زمین"],
      ["انرژی", "توانایی انجام کار"],
      ["سلول", "کوچک‌ترین واحد زنده بدن"],
      ["فسیل", "بازمانده جانوران و گیاهان در سنگ‌ها"],
      ["مدار", "مسیر چرخش سیاره به دور خورشید"],
      ["ویروس", "عفونت‌زن میکروسکوپی بدون سلول"],
      ["نور", "انرژی الکترومغناطیسی قابل دیدن"],
      ["آتشفشان", "کوهی که گدازه از آن خارج می‌شود"],
      ["هم‌وایی", "همکاری اجزا برای یک هدف مشترک"],
      ["بُرهان", "دلیل و استدلال منطقی"],
      ["فرسايش", "ساییده شدن خاک توسط باد و آب"],
      ["ذره‌بین", "ابزار بزرگ‌نمایی اشیاء کوچک"]
    ];
    var puzzleState = { guess: "", solved: false };

    function renderPuzzle(main) {
      var day = Math.floor(Date.now() / 86400000);
      var w = PUZZLE_WORDS[day % PUZZLE_WORDS.length];
      var scrambled = w[0].split("").sort(function () { return 0.5 - ((day * 7919) % 13) / 13; }).join("");
      main.innerHTML =
        '<div class="section-title">🧩 معمای واژه علمی روز</div>' +
        '<div class="card" style="text-align:center;">' +
          '<div class="muted" style="font-size:12.5px;">این حروف را مرتب کن:</div>' +
          '<div style="font-size:26px;font-weight:800;letter-spacing:6px;margin:10px 0;color:var(--gold-light);">' + esc(scrambled) + '</div>' +
          '<div class="muted" style="font-size:12.5px;">💡 سرنخ: ' + esc(w[1]) + '</div>' +
          (puzzleState.solved
            ? '<div style="margin-top:12px;padding:10px;border-radius:11px;background:rgba(16,185,129,0.15);">✅ آفرین! جواب: <b>' + esc(w[0]) + '</b></div>'
            : '<input id="pzGuess" class="input" style="margin-top:12px;" placeholder="پاسخ شما..." value="' + esc(puzzleState.guess) + '" />' +
              '<button class="btn btn-emerald" onclick="checkPuzzle(\'' + esc(w[0]) + '\')">بررسی پاسخ</button>') +
        '</div>' +
        backBtnHtml();
    }

    function checkPuzzle(answer) {
      var v = (document.getElementById("pzGuess") || {}).value || "";
      puzzleState.guess = v;
      if (v.trim() === answer) {
        puzzleState.solved = true;
        showToast("🎉 آفرین! درست حدس زدی!");
      } else {
        showToast("هنوز درست نیست؛ دوباره تلاش کن 💪");
      }
      renderApp();
    }

    // ---- 📜 سوابق من ----
    async function renderHistory(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var lab = await api("/api/ms/edu/lab");
        var shop = await api("/api/ms/edu/shop");
        main.innerHTML =
          '<div class="section-title">🧠 سوابق کارگاه یادگیری</div>' +
          '<div class="card"><table class="table"><thead><tr><th>ابزار</th><th>وضعیت</th><th>⭐</th></tr></thead><tbody>' +
          ((lab.items || []).length
            ? lab.items.map(function (l) {
                var st = l.status === "approved" ? '✅ تایید شد' : (l.status === "rejected" ? '❌ رد شد' : '⏳ در انتظار تایید');
                return '<tr><td>' + esc(l.tool) + '</td><td>' + st + '</td><td>' + (l.points || 0) + '</td></tr>';
              }).join("")
            : '<tr><td colspan="3" class="muted">هنوز فعالیتی ثبت نشده است.</td></tr>') +
          '</tbody></table></div>' +
          '<div class="section-title">🛒 سوابق فروشگاه</div>' +
          '<div class="card"><table class="table"><thead><tr><th>جایزه</th><th>وضعیت</th></tr></thead><tbody>' +
          ((shop.orders || []).length
            ? shop.orders.map(function (o) {
                var st = o.status === "approved" ? '✅ تحویل شد' : (o.status === "rejected" ? '❌ رد شد' : '⏳ در انتظار');
                return '<tr><td>' + esc(o.title) + '</td><td>' + st + '</td></tr>';
              }).join("")
            : '<tr><td colspan="2" class="muted">سفارشی ندارید.</td></tr>') +
          '</tbody></table></div>' +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    // ==================== 📥 پنل‌های معلم (تاییدها/فروشگاه/کتابخانه/پیام) ====================
    async function renderInbox(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        if (!msData) await ensureHome();
        resolveSelClass();
        var d = await api("/api/ms/teacher/inbox");
        var asg = await api("/api/ms/teacher/assignments?classId=" + selClassId);
        var subSections = "";
        var asgList = (asg.assignments || []).slice();
        asgList.push({ id: 0, title: "تکلیف آزاد ارسالی" });
        for (var ai = 0; ai < asgList.length; ai++) {
          var a = asgList[ai];
          var sd = await api("/api/ms/teacher/submissions?assignmentId=" + a.id).catch(function () { return { submissions: [] }; });
          var rows = (sd.submissions || []).filter(function (x) { return x.submitted && !x.reviewed; });
          if (!rows.length) continue;
          subSections += rows.map(function (x) {
            return '<div class="card">' +
              '<b>👤 ' + esc(x.name) + '</b> — 📚 ' + esc(a.title) +
              (x.reviewed ? ' <span class="badge-pill" style="background:rgba(16,185,129,0.2);color:#6EE7B7;">تصحیح شد</span>' : ' <span class="badge-pill" style="background:rgba(245,158,11,0.2);color:#FCD34D;">در انتظار تصحیح</span>') +
              (x.text ? '<div style="margin:7px 0;padding:9px 11px;background:var(--surface-2);border-radius:11px;font-size:12.5px;">' + esc(x.text) + '</div>' : '') +
              (x.photo ? '<img src="' + x.photo + '" style="width:100%;max-height:220px;object-fit:contain;border-radius:11px;cursor:pointer;margin:6px 0;" onclick="viewPhoto(this.src)" />' : '') +
              (x.video ? '<video src="' + x.video + '" controls style="width:100%;max-height:220px;border-radius:11px;margin:6px 0;"></video>' : '') +
              '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">' +
                '<input id="revScore_' + x.submissionId + '" class="input" type="number" step="0.25" dir="ltr" placeholder="نمره" style="width:95px;margin:0;" value="' + (x.score !== null ? x.score : "") + '" />' +
                '<input id="revFb_' + x.submissionId + '" class="input" placeholder="بازخورد..." style="flex:1;min-width:140px;margin:0;" value="' + esc(x.feedback) + '" />' +
                '<button class="btn btn-emerald btn-sm" onclick="saveReview(' + x.submissionId + ')">✅ ثبت نمره</button>' +
              '</div>' + fbPresetsHtml("revFb_" + x.submissionId) + '</div>';
          }).join("");
        }
        var muddy = await api("/api/ms/teacher/muddy").catch(function () { return { muddy: [] }; });
        main.innerHTML =
          classSwitcherHtml() +
          '<div class="section-title">📝 تکالیف ارسالی دانش‌آموزان (مشاهده تصویر، متن و تصحیح)</div>' +
          (subSections || '<div class="card"><div class="muted">هنوز تکلیفی ارسال نشده است.</div></div>') +
          '<div class="section-title">🎯 ماموریت‌های روز در انتظار تایید</div>' +
          ((d.missions || []).length ? d.missions.map(function (m) {
            return '<div class="card">' +
              '<b>👤 ' + esc(m.studentName) + '</b>' +
              '<div class="muted" style="font-size:12px;margin:5px 0;">🎯 ' + esc(m.mission) + '</div>' +
              '<div style="padding:8px 10px;background:var(--surface-2);border-radius:10px;font-size:12.5px;">📝 ' + esc(m.proof) + '</div>' +
              '<div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap;">' +
                '<input id="pts_mission_' + m.id + '" class="input" type="number" dir="ltr" placeholder="⭐" style="width:80px;margin:0;" value="5" />' +
                '<input id="fb_mission_' + m.id + '" class="input" placeholder="بازخورد (اختیاری)" style="flex:1;min-width:110px;margin:0;" />' +
                '<button class="btn btn-emerald btn-sm" onclick="approveInbox(\'mission\',' + m.id + ',\'approve\')">✅</button>' +
                '<button class="btn btn-rose btn-sm" onclick="approveInbox(\'mission\',' + m.id + ',\'reject\')">❌</button>' +
              '</div>' + fbPresetsHtml("fb_mission_" + m.id) + '</div>';
          }).join("") : '<div class="card"><div class="muted">موردی در انتظار نیست.</div></div>') +
          '<div class="section-title">🧠 گزارش‌های کارگاه در انتظار تایید</div>' +
          ((d.labs || []).length ? d.labs.map(function (l) {
            return '<div class="card">' +
              '<b>👤 ' + esc(l.studentName) + '</b> <span class="badge-pill" style="background:rgba(99,102,241,0.18);color:#C7D2FE;">' + esc(l.tool) + '</span>' +
              (l.topic ? '<div class="muted" style="font-size:12px;margin:5px 0;">📌 ' + esc(l.topic) + '</div>' : '') +
              '<div style="padding:8px 10px;background:var(--surface-2);border-radius:10px;font-size:12.5px;">📝 ' + esc(l.summary) + '</div>' +
              '<div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap;">' +
                '<input id="pts_lab_' + l.id + '" class="input" type="number" dir="ltr" placeholder="⭐" style="width:80px;margin:0;" value="10" />' +
                '<input id="fb_lab_' + l.id + '" class="input" placeholder="بازخورد (اختیاری)" style="flex:1;min-width:110px;margin:0;" />' +
                '<button class="btn btn-emerald btn-sm" onclick="approveInbox(\'lab\',' + l.id + ',\'approve\')">✅</button>' +
                '<button class="btn btn-rose btn-sm" onclick="approveInbox(\'lab\',' + l.id + ',\'reject\')">❌</button>' +
              '</div>' + fbPresetsHtml("fb_lab_" + l.id) + '</div>';
          }).join("") : '<div class="card"><div class="muted">موردی در انتظار نیست.</div></div>') +
          '<div class="section-title">🛒 درخواست‌های خرید فروشگاه جوایز</div>' +
          ((d.orders || []).length ? d.orders.map(function (o) {
            return '<div class="card">' +
              '<b>👤 ' + esc(o.studentName) + '</b> — 🎁 ' + esc(o.itemTitle) + ' (' + o.cost + ' ⭐)' +
              '<div style="display:flex;gap:7px;margin-top:8px;">' +
                '<button class="btn btn-emerald btn-sm" onclick="approveInbox(\'order\',' + o.id + ',\'approve\')">✅ تحویل جایزه</button>' +
                '<button class="btn btn-rose btn-sm" onclick="approveInbox(\'order\',' + o.id + ',\'reject\')">❌ رد</button>' +
              '</div></div>';
          }).join("") : '<div class="card"><div class="muted">موردی در انتظار نیست.</div></div>') +
          '<div class="section-title">🆘 مباحث گنگ گزارش‌شده توسط دانش‌آموزان (' + ((muddy.muddy || []).filter(function (m) { return m.status === "open"; }).length) + ')</div>' +
          ((muddy.muddy || []).length ? muddy.muddy.map(function (m) {
            return '<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
              '<div><b>👤 ' + esc(m.studentName) + '</b><div class="muted" style="font-size:12px;">' + esc(m.topic) + ' — ' + esc(m.date) + '</div></div>' +
              (m.status === "open"
                ? '<button class="btn btn-emerald btn-sm" onclick="resolveMuddy(' + m.id + ')">✅ حل شد</button>'
                : '<span class="badge-pill" style="background:rgba(16,185,129,0.2);color:#6EE7B7;">بررسی شد</span>') +
              '</div>';
          }).join("") : '<div class="card"><div class="muted">گزارشی ثبت نشده است.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function resolveMuddy(id) {
      try {
        await api("/api/ms/teacher/muddy/resolve", { id: id });
        showToast("✅ بررسی شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function approveInbox(kind, id, decision) {
      try {
        var pts = Number((document.getElementById("pts_" + kind + "_" + id) || {}).value || 0);
        var fb = (document.getElementById("fb_" + kind + "_" + id) || {}).value || "";
        await api("/api/ms/teacher/inbox/approve", { kind: kind, id: id, decision: decision, points: pts, feedback: fb });
        showToast(decision === "reject" ? "❌ رد شد." : "✅ تایید شد و امتیاز ثبت گردید.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderShopM(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/teacher/shop");
        main.innerHTML =
          '<div class="section-title">🛒 مدیریت فروشگاه جوایز</div>' +
          '<div class="card">' +
            '<input id="shopTitle" class="input" placeholder="عنوان جایزه (مثلاً: خودکار رنگی)" />' +
            '<input id="shopCost" class="input" type="number" dir="ltr" placeholder="قیمت به امتیاز (مثلاً 50)" />' +
            '<button class="btn btn-emerald" onclick="addShopItem()">➕ افزودن جایزه</button>' +
          '</div>' +
          ((d.items || []).length
            ? d.items.map(function (i) {
                return '<div class="card" style="display:flex;align-items:center;justify-content:space-between;">' +
                  '<div><b>🎁 ' + esc(i.title) + '</b><div class="muted" style="font-size:12px;">' + i.cost + ' ⭐</div></div>' +
                  '<button class="btn btn-ghost btn-sm" onclick="delShopItem(' + i.id + ')">🗑</button></div>';
              }).join("")
            : '<div class="card"><div class="muted">هنوز جایزه‌ای ثبت نشده است.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function addShopItem() {
      try {
        await api("/api/ms/teacher/shop", {
          title: (document.getElementById("shopTitle") || {}).value,
          cost: Number((document.getElementById("shopCost") || {}).value || 0)
        });
        showToast("✅ جایزه اضافه شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function delShopItem(id) {
      if (!confirm("این جایزه حذف شود؟")) return;
      try {
        await api("/api/ms/teacher/shop/delete", { id: id });
        showToast("🗑 حذف شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderLibM(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/library");
        main.innerHTML =
          '<div class="section-title">📂 مدیریت کتابخانه کلاس</div>' +
          '<div class="card">' +
            '<input id="libTitle" class="input" placeholder="عنوان جزوه یا نکته" />' +
            '<textarea id="libBody" class="input" rows="4" placeholder="متن جزوه..."></textarea>' +
            '<button class="btn btn-emerald" onclick="addLibItem()">➕ افزودن به کتابخانه</button>' +
          '</div>' +
          ((d.items || []).length
            ? d.items.map(function (i) {
                return '<div class="card"><b>📖 ' + esc(i.title) + '</b>' +
                  (i.body ? '<div class="muted" style="font-size:12px;white-space:pre-wrap;margin:5px 0;">' + esc(i.body) + '</div>' : '') +
                  '<button class="btn btn-ghost btn-sm" onclick="delLibItem(' + i.id + ')">🗑 حذف</button></div>';
              }).join("")
            : '<div class="card"><div class="muted">کتابخانه خالی است.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function addLibItem() {
      try {
        await api("/api/ms/teacher/library", {
          title: (document.getElementById("libTitle") || {}).value,
          body: (document.getElementById("libBody") || {}).value
        });
        showToast("✅ به کتابخانه اضافه شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function delLibItem(id) {
      if (!confirm("این جزوه حذف شود؟")) return;
      try {
        await api("/api/ms/teacher/library/delete", { id: id });
        showToast("🗑 حذف شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderMsgM(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/messages");
        main.innerHTML =
          '<div class="section-title">💬 پیام‌های دانش‌آموزان</div>' +
          ((d.messages || []).length
            ? d.messages.map(function (m) {
                return '<div class="card">' +
                  '<b>👤 ' + esc(m.studentName) + '</b>' +
                  (m.fromRole === "teacher" ? ' <span class="badge-pill" style="background:rgba(99,102,241,0.18);color:#C7D2FE;">پاسخ شما</span>' : '') +
                  '<div style="padding:8px 10px;background:var(--surface-2);border-radius:10px;font-size:12.5px;margin:6px 0;">' + esc(m.text) + '</div>' +
                  '<div style="display:flex;gap:7px;">' +
                    '<input id="reply_' + m.studentId + '" class="input" placeholder="پاسخ به ' + esc(m.studentName) + '..." style="flex:1;margin:0;" />' +
                    '<button class="btn btn-emerald btn-sm" onclick="replyMsg(' + m.studentId + ')">📤</button>' +
                  '</div></div>';
              }).join("")
            : '<div class="card"><div class="muted">پیامی وجود ندارد.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function replyMsg(studentId) {
      try {
        var el = document.getElementById("reply_" + studentId);
        await api("/api/ms/edu/messages", { studentId: studentId, text: (el || {}).value });
        showToast("✅ پاسخ ارسال شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== 📊 پنل‌های نسخه‌ای معلم/مدیر (مثل نسخه قبل) ====================
    async function renderTcDash(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        if (!msData) await ensureHome();
        resolveSelClass();
        var d = await ensureTcClass();
        if (!d) { main.innerHTML = classSwitcherHtml(); return; }
        var present = (d.roster || []).filter(function (x) { return x.todayStatus === "present"; }).length;
        var inbox = await api("/api/ms/teacher/inbox").catch(function () { return { missions: [], labs: [], orders: [] }; });
        var pendCount = (inbox.missions || []).length + (inbox.labs || []).length + (inbox.orders || []).length + Number(inbox.pendingSubs || 0);
        main.innerHTML =
          classSwitcherHtml() +
          '<div class="card hero-card">' +
            '<div style="font-size:17px;font-weight:800;color:var(--gold-light);">👨‍🏫 داشبورد زنده مدیریت کلاس</div>' +
            '<div class="muted" style="margin-top:4px;">مدرسه ' + esc((msData.school && msData.school.name) || "") + '</div>' +
            '<div class="grid-3" style="margin-top:12px;">' +
              '<div class="stat-card"><div class="stat-ico">👥</div><div class="stat-num">' + (d.roster || []).length + '</div><div class="stat-label">دانش‌آموز</div></div>' +
              '<div class="stat-card"><div class="stat-ico">✅</div><div class="stat-num">' + present + '</div><div class="stat-label">حاضر امروز</div></div>' +
              '<div class="stat-card"><div class="stat-ico">📥</div><div class="stat-num">' + pendCount + '</div><div class="stat-label">در انتظار تایید</div></div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' +
              '<button class="btn btn-emerald btn-sm" onclick="goTab(\'att\')">✅ حضور و غیاب امروز</button>' +
              '<button class="btn btn-gold btn-sm" onclick="goTab(\'live\')">🎥 شروع کلاس آنلاین</button>' +
              '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'announce\';renderApp()">📢 اطلاعیه همگانی</button>' +
            '</div>' +
          '</div>' +
          '<div class="card" style="border:1px solid rgba(59,130,246,0.5);">' +
            '<div class="section-title">📲 اتصال تلگرام معلم</div>' +
            '<div class="muted" style="font-size:12px;">برای دریافت اعلان‌ها (تکالیف، پیام‌ها، درخواست‌ها) و تایید/رد مستقیم از تلگرام، در ربات مدرسه این دستور را بفرستید:</div>' +
            '<div dir="ltr" style="margin:8px 0;padding:9px 11px;background:var(--surface-2);border-radius:10px;font-size:13px;">/start T' + esc((msData && msData.tg && msData.tg.username) || "نام‌کاربری‌تان") + '</div>' +
            (msData && msData.tg && msData.tg.linked
              ? '<div class="muted" style="font-size:11.5px;">✅ حساب تلگرام شما متصل است — روی پیام‌های دانش‌آموزان Reply کنید تا پاسخ مستقیم برایشان ارسال شود.</div>'
              : '<div class="muted" style="font-size:11.5px;">⏱ هنوز متصل نشده — بعد از ارسال دستور بالا، وضعیت این‌جا سبز می‌شود.</div>') +
          '</div>' +
          '<div class="card"><div class="section-title">📚 منوی امکانات</div>' +
            '<div class="menu-grid">' +
              '<button class="menu-item" onclick="goTab(\'inbox\')"><span>📥</span>صندوق تایید</button>' +
              '<button class="menu-item" onclick="goTab(\'grades\')"><span>📝</span>ثبت نمره</button>' +
              '<button class="menu-item" onclick="goTab(\'hw\')"><span>📚</span>تکالیف</button>' +
              '<button class="menu-item" onclick="goTab(\'ai\')"><span>🤖</span>ابزار هوش مصنوعی</button>' +
              '<button class="menu-item" onclick="goTab(\'class\')"><span>🏆</span>کلاس و کدها</button>' +
              '<button class="menu-item" onclick="goTab(\'pchat\')"><span>💬</span>پیام اولیا</button>' +
              '<button class="menu-item" onclick="activeTab=\'classchat\';renderApp()"><span>💬</span>گفتگوی کلاس</button>' +
              '<button class="menu-item" onclick="activeTab=\'shopm\';renderApp()"><span>🛒</span>فروشگاه جوایز</button>' +
              '<button class="menu-item" onclick="activeTab=\'libm\';renderApp()"><span>📂</span>کتابخانه</button>' +
              '<button class="menu-item" onclick="activeTab=\'deadlines\';renderApp()"><span>⏰</span>ددلاین و امتحان</button>' +
            '</div>' +
            (session.role === "admin"
              ? '<div class="section-title">🏫 مدیریت مدرسه</div><div class="menu-grid">' +
                '<button class="menu-item" onclick="goTab(\'admin\')"><span>🏫</span>مدیریت مدرسه</button></div>'
              : "") +
          '</div>' +
          '<div class="section-title">📚 تکالیف در انتظار تصحیح (' + Number(inbox.pendingSubs || 0) + ')</div>' +
          ((inbox.recentSubs || []).length
            ? '<div class="card">' +
                inbox.recentSubs.map(function (x) {
                  return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">' +
                    '<b style="flex:1;">' + esc(x.name) + '</b>' +
                    '<span class="muted" style="font-size:11px;">' + (x.hasVideo ? '🎥' : x.hasPhoto ? '📷' : '✍️') + ' ' + esc(x.text) + '</span>' +
                  '</div>';
                }).join("") +
                '<button class="btn btn-sm" style="margin-top:8px;width:100%;" onclick="goTab(\'inbox\')">📥 رفتن به صندوق تایید</button>' +
              '</div>'
            : '<div class="card"><div class="muted">تکلیف جدیدی در انتظار نیست ✅</div></div>') +
          '<div class="section-title">📢 اطلاعیه‌های اخیر</div>' +
          ((msData.announcements || []).length
            ? msData.announcements.slice(0, 5).map(function (a) {
                return '<div class="card"><b>📢 ' + esc(a.title) + '</b><div class="muted" style="font-size:12px;white-space:pre-wrap;">' + esc(a.body) + '</div></div>';
              }).join("")
            : '<div class="card"><div class="muted">اطلاعیه‌ای نیست.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    var teamsState = null;
    async function renderClassCodes(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        if (!msData) await ensureHome();
        resolveSelClass();
        var d = await ensureTcClass();
        if (!d) { main.innerHTML = classSwitcherHtml(); return; }
        var certs = await api("/api/ms/teacher/certificates").catch(function () { return { certificates: [] }; });
        var codeOf = function (x, k1, k2) { return x[k1] || x[k2] || "—"; };
        main.innerHTML =
          classSwitcherHtml() +
          '<div class="section-title">🏆 کلاس و کدهای ورود — ' + esc(d.class.label) + '</div>' +
          '<div class="card" style="border:1px solid rgba(16,185,129,0.45);">' +
            '<b>🔗 کد ثبت‌نام کلاس</b>' +
            '<div style="font-size:22px;font-weight:800;letter-spacing:3px;margin:8px 0;" dir="ltr">' + esc((d.class && d.class.joinCode) || "—") + '</div>' +
            '<div class="muted" style="font-size:11.5px;">این کد را به دانش‌آموزان بدهید تا خودشان از صفحه ورود → «✍️ ثبت‌نام دانش‌آموز جدید» با کد ملی ثبت‌نام کنند.</div>' +
          '</div>' +
          '<div class="card"><table class="table"><thead><tr><th>نام</th><th>🎒 کد دانش‌آموز</th><th>👪 کد والدین</th><th>🏅</th></tr></thead><tbody>' +
          (d.roster || []).map(function (x) {
            return '<tr>' +
              '<td>' + esc(x.name) + ' <button class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:11px;" onclick="renameStudent(' + (x.id || 0) + ', this)" title="تغییر نام (فقط معلم/مدیر)">✏️</button></td>' +
              '<td><b dir="ltr">' + esc(codeOf(x, "studentCode", "student_code")) + '</b><div class="muted" style="font-size:10px;">PIN: 1234</div></td>' +
              '<td><b dir="ltr">' + esc(codeOf(x, "parentCode", "parent_code")) + '</b></td>' +
              '<td><button class="btn btn-gold btn-sm" onclick="issueCert(' + x.id + ',\'' + esc(x.name) + '\')">🏅</button></td>' +
            '</tr>';
          }).join("") +
          '</tbody></table></div>' +
          '<div class="section-title">🏅 لوح‌های تقدیر صادرشده</div>' +
          ((certs.certificates || []).length
            ? certs.certificates.map(function (c) {
                return '<div class="card" style="display:flex;align-items:center;justify-content:space-between;">' +
                  '<div><b>🏅 ' + esc(c.title) + '</b> — ' + esc(c.studentName) + '<div class="muted" style="font-size:11px;">' + esc(c.date) + '</div></div></div>';
              }).join("")
            : '<div class="card"><div class="muted">هنوز لوحی صادر نشده است.</div></div>') +
          '<div class="section-title">👥 گروه‌بندی هوشمند متعادل</div>' +
          '<div class="card">' +
            '<button class="btn btn-ghost" onclick="buildTeams()">🎲 ساخت گروه‌های متعادل</button>' +
            (teamsState ? teamsState : "") +
          '</div>' +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    function issueCert(studentId, name) {
      var title = prompt("عنوان لوح تقدیر برای " + name + " (مثلاً: دانش‌آموز ماه):", "لوح تقدیر");
      if (!title) return;
      var body = prompt("متن تقدیر:", "به پاس تلاش و پیشرفت چشم‌گیر، این لوح تقدیر تقدیم می‌شود.");
      api("/api/ms/teacher/certificates", { studentId: studentId, title: title, body: body || "" }).then(function () {
        showToast("🏅 لوح تقدیر صادر شد.");
        renderApp();
      }).catch(function (e) { showToast("❌ " + e.message); });
    }

    function buildTeams() {
      var names = [];
      var rows = document.querySelectorAll("table.table tbody tr");
      rows.forEach(function (tr) {
        var tds = tr.querySelectorAll("td");
        if (tds.length && tds[0]) names.push(tds[0].textContent.trim());
      });
      if (names.length < 2) { showToast("ابتدا کلاس را باز کنید"); return; }
      names.sort(function () { return Math.random() - 0.5; });
      var teamNames = ["🌟 تیم ستاره‌ها", "🚀 تیم فضانوردان", "📚 تیم کاوشگران", "⚡ تیم رعد"];
      var n = Math.min(4, Math.max(2, Math.ceil(names.length / 3)));
      var teams = Array.from({ length: n }, function (_, i) { return []; });
      names.forEach(function (nm, i) { teams[i % n].push(nm); });
      teamsState = '<div class="grid-3" style="margin-top:10px;">' + teams.map(function (t, i) {
        return '<div style="padding:10px;background:var(--surface-2);border-radius:11px;">' +
          '<b style="color:var(--gold-light);">' + teamNames[i] + '</b>' +
          t.map(function (nm) { return '<div class="muted" style="font-size:11.5px;">• ' + esc(nm) + '</div>'; }).join("") +
          '</div>';
      }).join("") + '</div>';
      renderApp();
    }

    async function renderDeadlines(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        if (!msData) await ensureHome();
        resolveSelClass();
        var d = await api("/api/ms/teacher/deadlines?classId=" + selClassId);
        main.innerHTML =
          classSwitcherHtml() +
          '<div class="section-title">⏰ ثبت ددلاین یا تاریخ امتحان جدید</div>' +
          '<div class="card">' +
            '<input id="dlTitle" class="input" placeholder="عنوان (مثلاً: امتحان ریاضی فصل ۳)" />' +
            '<input id="dlDate" class="input" type="date" dir="ltr" />' +
            '<button class="btn btn-emerald" onclick="addDeadline()">➕ ثبت برای کلاس</button>' +
          '</div>' +
          '<div class="section-title">📅 برنامه‌های ثبت‌شده</div>' +
          ((d.deadlines || []).length
            ? d.deadlines.map(function (x) {
                return '<div class="card" style="display:flex;align-items:center;justify-content:space-between;">' +
                  '<div><b>⏰ ' + esc(x.title) + '</b><div class="muted" style="font-size:12px;">' + esc(x.date) + '</div></div>' +
                  '<button class="btn btn-ghost btn-sm" onclick="delDeadline(' + x.id + ')">🗑</button></div>';
              }).join("")
            : '<div class="card"><div class="muted">برنامه‌ای ثبت نشده است.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function addDeadline() {
      try {
        await api("/api/ms/teacher/deadlines", {
          classId: selClassId,
          title: (document.getElementById("dlTitle") || {}).value,
          date: (document.getElementById("dlDate") || {}).value
        });
        showToast("✅ ثبت شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function delDeadline(id) {
      if (!confirm("حذف شود؟")) return;
      try {
        await api("/api/ms/teacher/deadlines/delete", { id: id });
        showToast("🗑 حذف شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderCerts(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/certificates");
        main.innerHTML =
          '<div class="section-title">🏅 افتخارات و لوح‌های تقدیر</div>' +
          ((d.certificates || []).length
            ? d.certificates.map(function (c) {
                return '<div class="cert-frame">' +
                  '<div style="font-size:26px;">🏅</div>' +
                  '<div class="cert-title">' + esc(c.title) + '</div>' +
                  '<div style="font-size:13px;margin-top:8px;line-height:1.9;">' + esc(c.body) + '</div>' +
                  '<div class="muted" style="margin-top:10px;">' + esc(c.date) + '</div>' +
                '</div>';
              }).join("")
            : '<div class="card"><div class="muted">هنوز لوح تقدیری دریافت نکرده‌اید. تلاش کنید! 💪</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function renderMuddy(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/edu/muddy");
        main.innerHTML =
          '<div class="section-title">🆘 مباحث گنگ من</div>' +
          '<div class="card">' +
            '<div class="muted" style="font-size:12px;">هر مطلبی را که در کلاس متوجه نشدی اینجا بنویس تا معلم بررسی کند.</div>' +
            '<input id="muddyTopic" class="input" placeholder="مثلاً: حل معادله درجه دوم را متوجه نشدم" />' +
            '<button class="btn btn-emerald" onclick="addMuddy()">📤 ارسال به معلم</button>' +
          '</div>' +
          ((d.muddy || []).length
            ? d.muddy.map(function (m) {
                return '<div class="card" style="display:flex;align-items:center;justify-content:space-between;">' +
                  '<div>🆘 ' + esc(m.topic) + '<div class="muted" style="font-size:11px;">' + esc(m.date) + '</div></div>' +
                  (m.status === "open" ? ' <span class="badge-pill" style="background:rgba(245,158,11,0.2);color:#FCD34D;">در انتظار</span>' : ' <span class="badge-pill" style="background:rgba(16,185,129,0.2);color:#6EE7B7;">بررسی شد</span>') +
                  '</div>';
              }).join("")
            : '<div class="card"><div class="muted">گزارشی ثبت نکرده‌اید.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function addMuddy() {
      try {
        await api("/api/ms/edu/muddy", { topic: (document.getElementById("muddyTopic") || {}).value });
        showToast("✅ برای معلم ارسال شد.");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderParentAtt(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await ensureHome();
        var asg = await api("/api/ms/student/assignments").catch(function () { return { assignments: [] }; });
        var att = d.attendance || d.att || {};
        main.innerHTML =
          '<div class="section-title">📅 حضور و غیاب فرزند شما</div>' +
          '<div class="grid-3">' +
            '<div class="stat-card"><div class="stat-ico">✅</div><div class="stat-num">' + (att.present !== undefined ? att.present : (d.present || 0)) + '</div><div class="stat-label">حاضر</div></div>' +
            '<div class="stat-card"><div class="stat-ico">❌</div><div class="stat-num">' + (att.absent !== undefined ? att.absent : (d.absent || 0)) + '</div><div class="stat-label">غایب</div></div>' +
            '<div class="stat-card"><div class="stat-ico">⏰</div><div class="stat-num">' + (att.late !== undefined ? att.late : (d.late || 0)) + '</div><div class="stat-label">با تأخیر</div></div>' +
          '</div>' +
          '<div class="section-title">📚 تکالیف</div>' +
          ((asg.assignments || []).length
            ? asg.assignments.map(function (a) {
                return '<div class="card"><b>📚 ' + esc(a.title) + '</b>' +
                  (a.description ? '<div class="muted" style="font-size:12px;white-space:pre-wrap;">' + esc(a.description) + '</div>' : '') +
                  '<div class="muted" style="font-size:11px;">' + (a.submitted ? '✅ ارسال شد' : '⏳ هنوز ارسال نشده') + (a.due ? ' — مهلت: ' + esc(a.due) : '') + '</div></div>';
              }).join("")
            : '<div class="card"><div class="muted">تکلیفی ثبت نشده است.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    // ==================== اطلاعیه‌ها ====================
    async function renderAnnounceList(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ ...</div>';
      try {
        var d = await api("/api/ms/announcements");
        main.innerHTML =
          '<div class="section-title">📢 اطلاعیه‌ها</div>' +
          '<div class="card">' +
          ((d.announcements || []).length
            ? d.announcements.map(function (a) {
                return '<div style="padding:10px 0;border-bottom:1px solid var(--border);">' +
                  '<b>📌 ' + esc(a.title) + '</b>' +
                  '<div style="margin-top:3px;">' + esc(a.body || "") + '</div>' +
                  '<div class="muted" style="font-size:11.5px;margin-top:4px;">' + esc(a.date) + (a.by ? ' • ' + esc(a.by) : '') + '</div>' +
                '</div>';
              }).join("")
            : '<div class="muted">هنوز اطلاعیه‌ای ثبت نشده است.</div>') +
          '</div>';
      } catch (e) {
        main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>';
      }
    }

    function renderAnnounceForm(main, isGlobal) {
      main.innerHTML =
        '<div class="section-title">📢 ' + (isGlobal ? "اطلاعیه سراسری به همه مدارس" : "ارسال اطلاعیه") + '</div>' +
        '<div class="card">' +
          '<input id="annTitle" class="input" placeholder="عنوان اطلاعیه" />' +
          '<textarea id="annBody" class="input" rows="5" placeholder="متن اطلاعیه..."></textarea>' +
          (isGlobal ? "" :
            (session.role === "admin"
              ? '<select id="annAudience" class="input">' +
                  '<option value="all">همه (دانش‌آموزان، اولیا و معلمان)</option>' +
                  '<option value="students">فقط دانش‌آموزان و اولیا</option>' +
                  '<option value="teachers">فقط معلمان</option>' +
                '</select>'
              : "")) +
          '<button class="btn btn-emerald" onclick="sendAnnounce(' + (isGlobal ? "true" : "false") + ')">📤 ارسال اطلاعیه</button>' +
        '</div>' +
        '<div style="text-align:center;margin:12px 0;">' +
          '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'home\';renderApp()">🔙 بازگشت</button>' +
        '</div>';
    }

    async function sendAnnounce(isGlobal) {
      try {
        var title = document.getElementById("annTitle").value.trim();
        var body = document.getElementById("annBody").value.trim();
        if (isGlobal) {
          await api("/api/ms/super/announce", { title: title, body: body });
          showToast("✅ اطلاعیه سراسری برای همه مدارس ارسال شد.");
        } else {
          var payload = { title: title, body: body };
          if (session.role === "admin") {
            var aud = document.getElementById("annAudience");
            payload.audience = aud ? aud.value : "all";
            await api("/api/ms/announce", payload);
          } else {
            payload.classId = selClassId;
            await api("/api/ms/announce", payload);
          }
          showToast("✅ اطلاعیه ارسال شد.");
        }
        activeTab = "home";
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== شروع ====================
    document.addEventListener("DOMContentLoaded", function () {
      applyTheme();
      try {
        if (session && NAVS[session.role] && NAVS[session.role].length && !NAVS[session.role].some(function (t) { return t.id === activeTab; })) {
          activeTab = NAVS[session.role][0].id;
        }
      } catch (e) {}
      renderApp();
    });
`;

export function buildSchoolHtml(): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes, viewport-fit=cover" />
  <meta name="theme-color" content="#0F172A" />
  <link rel="icon" type="image/svg+xml" href="/app-icon.svg" />
  <title>شبکه مدارس هوشمند</title>
  <style>
    :root {
      --bg: #0B1120; --surface: #151F32; --surface-2: #1E293B;
      --border: rgba(148, 163, 184, 0.16);
      --primary: #6366F1; --primary-dark: #4F46E5;
      --gold: #F59E0B; --gold-light: #FDE68A;
      --emerald: #10B981; --rose: #F43F5E; --sky: #0EA5E9;
      --text: #F8FAFC; --muted: #94A3B8; --radius: 18px;
      --safe-bottom: env(safe-area-inset-bottom, 0px);
    }
    [data-theme="light"] {
      --bg: #EEF2F7; --surface: #FFFFFF; --surface-2: #F1F5F9;
      --border: rgba(15, 23, 42, 0.12);
      --primary: #4F46E5; --primary-dark: #4338CA;
      --gold: #D97706; --gold-light: #A16207;
      --emerald: #059669; --rose: #E11D48; --sky: #0284C7;
      --text: #0F172A; --muted: #5B6B7F;
    }
    [data-theme="light"] .topbar { background: rgba(255, 255, 255, 0.93); box-shadow: 0 2px 14px rgba(15, 23, 42, 0.06); }
    [data-theme="light"] .bottom-nav { background: rgba(255, 255, 255, 0.96); box-shadow: 0 -2px 14px rgba(15, 23, 42, 0.06); }
    [data-theme="light"] .card, [data-theme="light"] .auth-card { box-shadow: 0 4px 18px rgba(15, 23, 42, 0.07); }
    [data-theme="light"] .stat-card { background: var(--surface); }
    [data-theme="light"] .menu-item { background: var(--surface-2); color: var(--text); }
    [data-theme="light"] .input { background: var(--surface); color: var(--text); border-color: var(--border); }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0; padding: 0; background: var(--bg); color: var(--text);
      font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
      font-size: 14.5px; line-height: 1.65; overflow-x: hidden; min-height: 100vh;
    }
    button, input, textarea, select { font-family: inherit; font-size: 14px; }
    .app-shell {
      max-width: 540px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column;
      padding-bottom: calc(78px + var(--safe-bottom));
    }
    .topbar {
      position: sticky; top: 0; z-index: 50;
      background: rgba(15, 23, 42, 0.92); backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--border); padding: 12px 16px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-logo {
      width: 38px; height: 38px; border-radius: 12px;
      background: linear-gradient(135deg, #0EA5E9, #6366F1);
      display: flex; align-items: center; justify-content: center; font-size: 20px;
      box-shadow: 0 4px 14px rgba(14,165,233,0.35);
    }
    .brand-title { font-weight: 800; font-size: 15px; color: #fff; }
    .brand-school { font-size: 11px; color: var(--gold-light); }
    .icon-btn {
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
      border-radius: 11px; padding: 7px 11px; cursor: pointer; font-size: 12.5px;
    }
    .container { padding: 14px; flex: 1; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px; margin-bottom: 12px;
    }
    .hero {
      text-align: center; padding: 30px 18px 22px;
      background: radial-gradient(circle at 30% 20%, rgba(99,102,241,0.18), transparent 60%);
      border-radius: var(--radius); margin-bottom: 14px;
    }
    .hero-icon {
      width: 76px; height: 76px; margin: 0 auto 12px; border-radius: 22px;
      background: linear-gradient(135deg, #0EA5E9, #6366F1);
      display: flex; align-items: center; justify-content: center; font-size: 38px;
      box-shadow: 0 10px 30px rgba(99,102,241,0.4);
    }
    .hero h1 { margin: 0 0 6px; font-size: 21px; }
    .hero p { margin: 0; color: var(--muted); font-size: 13px; }
    .role-tabs {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin-bottom: 14px;
    }
    .role-tab {
      background: var(--surface-2); border: 1px solid var(--border); color: var(--muted);
      border-radius: 12px; padding: 9px 4px; cursor: pointer; font-size: 11px; font-weight: 700;
    }
    .role-tab.active {
      background: linear-gradient(135deg, var(--primary-dark), var(--primary));
      color: #fff; border-color: transparent;
    }
    .input {
      width: 100%; background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px 14px; color: var(--text); margin-bottom: 10px; outline: none;
    }
    .input:focus { border-color: var(--primary); }
    textarea.input { resize: vertical; }
    .btn {
      width: 100%; background: linear-gradient(135deg, var(--primary-dark), var(--primary));
      color: #fff; border: none; border-radius: 13px; padding: 13px 18px;
      font-size: 14.5px; font-weight: 800; cursor: pointer;
    }
    .btn:active { transform: scale(0.98); }
    .btn-emerald { background: linear-gradient(135deg, #059669, var(--emerald)); }
    .btn-gold { background: linear-gradient(135deg, #D97706, var(--gold)); }
    .btn-rose { background: linear-gradient(135deg, #BE123C, var(--rose)); }
    .btn-ghost {
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font-weight: 700;
    }
    .btn-sm { width: auto; padding: 8px 12px; font-size: 12px; border-radius: 10px; }
    .section-title {
      font-weight: 800; font-size: 14px; margin: 16px 2px 10px;
      display: flex; align-items: center; gap: 7px;
    }
    .muted { color: var(--muted); }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 15px; padding: 14px; text-align: center;
    }
    .stat-ico { font-size: 24px; margin-bottom: 5px; }
    .stat-num { font-size: 19px; font-weight: 800; }
    .stat-label { font-size: 11.5px; color: var(--muted); }
    .table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .table th {
      text-align: right; color: var(--muted); font-weight: 700; font-size: 11.5px;
      padding: 7px 6px; border-bottom: 1px solid var(--border);
    }
    .table td { padding: 8px 6px; border-bottom: 1px solid rgba(148,163,184,0.08); }
    .badge-pill {
      display: inline-block; padding: 3px 9px; border-radius: 999px;
      font-size: 10.5px; font-weight: 800;
    }
    .bottom-nav {
      position: fixed; bottom: 0; right: 0; left: 0; z-index: 60;
      background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(16px);
      border-top: 1px solid var(--border); display: none;
      padding: 8px 6px calc(8px + var(--safe-bottom));
    }
    .bottom-nav-inner {
      max-width: 540px; margin: 0 auto; display: flex; justify-content: space-around;
    }
    .nav-item {
      background: none; border: none; color: var(--muted); cursor: pointer;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      font-size: 10px; font-weight: 700; padding: 4px 6px; border-radius: 10px;
    }
    .nav-item.active { color: var(--gold-light); background: rgba(245,158,11,0.12); }
    .nav-ico { font-size: 19px; }
    #toast {
      display: none; position: fixed; bottom: 92px; right: 50%; transform: translateX(50%);
      background: #1E293B; color: #fff; padding: 11px 18px; border-radius: 13px;
      font-size: 13px; z-index: 3000; max-width: 92%; text-align: center;
      border: 1px solid rgba(148,163,184,0.25); box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    .hero-card { background: linear-gradient(135deg, #1E1B4B 0%, #312E81 55%, #1E293B 100%); border: 1px solid var(--border); border-radius: 18px; padding: 16px; margin-bottom: 14px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
    .stat-ico { font-size: 21px; }
    .cert-frame {
      border: 7px solid var(--gold); border-radius: 14px; padding: 20px 16px; margin: 12px 0;
      background: linear-gradient(135deg, #1E293B, #0F172A); text-align: center;
    }
    .cert-title { font-size: 19px; font-weight: 900; color: var(--gold-light); }
    .bubble { border-radius: 14px; padding: 9px 12px; margin-bottom: 8px; max-width: 88%; font-size: 12.5px; }
    .bubble-me { background: var(--primary-dark); color: #fff; margin-left: auto; border-bottom-right-radius: 4px; }
    .bubble-them { background: var(--surface-2); color: var(--text); margin-right: auto; border-bottom-left-radius: 4px; }
    .menu-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .menu-item {
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 13px;
      padding: 12px 6px; cursor: pointer; color: var(--text); font-size: 11.5px; font-weight: 700;
      display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center;
    }
    .menu-item span { font-size: 21px; }
    .menu-item:active { transform: scale(0.96); }
    ${LIVE_CLASS_CSS}
  </style>
</head>
<body>
  <div class="app-shell">
    <div class="topbar">
      <div class="brand">
        <div class="brand-logo">🏫</div>
        <div>
          <div class="brand-title">شبکه مدارس هوشمند</div>
          <div class="brand-school" id="brandSchool">سامانه یکپارچه آموزشی</div>
        </div>
      </div>
      <button id="themeBtn" class="icon-btn" onclick="toggleTheme()" title="تغییر تم">🌓</button>
      <button id="logoutBtn" class="icon-btn" style="display:none;" onclick="logout()">خروج</button>
    </div>
    <div class="container" id="mainView"></div>
    <nav class="bottom-nav" id="bottomNav"><div class="bottom-nav-inner"></div></nav>
  </div>
  <div id="toast"></div>
  <script>
${SCHOOL_JS}
  </script>
  <script>
${LIVE_CLASS_JS}
  </script>
</body>
</html>`;
}
