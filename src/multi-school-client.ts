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
                '<button class="menu-item" onclick="goTab(\'exams\')"><span>📝</span>آزمون‌های من</button>' +
                '<button class="menu-item" onclick="goTab(\'books\')"><span>📚</span>چالش کتاب‌خوانی</button>' +
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
        } else if (activeTab === "books") {
          await renderStudentBooks(main);
          return;
        } else if (activeTab === "exams") {
          await renderStudentExams(main);
          return;
        } else if (activeTab === "examtaking") {
          await renderExamTake(main);
          return;
        } else if (activeTab === "examresult") {
          await renderExamResult(main);
          return;
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
        } else if (activeTab === "booksm") {
          await renderTeacherBooks(main);
          return;
        } else if (activeTab === "qbank") {
          await renderQBank(main);
          return;
        } else if (activeTab === "exams") {
          await renderTeacherExams(main);
          return;
        } else if (activeTab === "examres") {
          await renderExamResults(main);
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
              '<input id="grScore" class="input" type="text" inputmode="decimal" dir="ltr" placeholder="نمره (مثلاً 18.5)" />' +
              '<button class="btn btn-emerald" onclick="saveGrade()">✅ ثبت نمره + امتیاز</button>' +
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
            '<div class="card" style="margin-top:12px;">' +
              '<div class="section-title">🔑 کلیدهای رایگان هوش مصنوعی (اختیاری)</div>' +
              '<div class="muted" style="font-size:11.5px;">برای فعال‌سازی سرویس‌های بیشتر در «ساخت سوال با AI»، کلید رایگان آن‌ها را اینجا وارد کنید. (Google AI Studio / OpenRouter — هر دو رایگان)</div>' +
              '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;"><b style="width:110px;font-size:12px;">Google Gemini</b><input id="aikey_gemini" class="input" placeholder="کلید Gemini (AIza...)" style="flex:1;margin:0;" dir="ltr" /><button class="btn btn-emerald btn-sm" onclick="saveAiKey(\'gemini\')">ذخیره</button></div>' +
              '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;"><b style="width:110px;font-size:12px;">OpenRouter</b><input id="aikey_openrouter" class="input" placeholder="کلید OpenRouter (sk-or-...)" style="flex:1;margin:0;" dir="ltr" /><button class="btn btn-emerald btn-sm" onclick="saveAiKey(\'openrouter\')">ذخیره</button></div>' +
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
    var hwAudios = {};
    var hwFreeAudio = "";
    var voiceRec = { rec: null, chunks: [], scope: "", id: 0 };
    function toggleVoiceRec(scope, id) {
      try {
        if (voiceRec.rec && voiceRec.rec.state === "recording") { voiceRec.rec.stop(); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return showToast("ضبط صوت در این دستگاه پشتیبانی نمی‌شود — فایل ویس بفرستید");
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          var rec = new MediaRecorder(stream);
          voiceRec.rec = rec; voiceRec.chunks = []; voiceRec.scope = scope; voiceRec.id = id;
          rec.ondataavailable = function (e) { if (e.data && e.data.size) voiceRec.chunks.push(e.data); };
          rec.onstop = function () {
            try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
            var blob = new Blob(voiceRec.chunks, { type: "audio/webm" });
            var reader = new FileReader();
            reader.onload = function () {
              var dataUrl = String(reader.result || "");
              if (voiceRec.scope === "free") {
                hwFreeAudio = dataUrl;
                var pv = document.getElementById("hwFreeAudPrev");
                if (pv) { pv.src = dataUrl; pv.style.display = "inline-block"; }
              } else {
                hwAudios[voiceRec.id] = dataUrl;
                var pv2 = document.getElementById("hwAudPrev_" + voiceRec.id);
                if (pv2) { pv2.src = dataUrl; pv2.style.display = "inline-block"; }
              }
              showToast("✅ ویس ضبط شد — با «ارسال تکلیف» فرستاده می‌شود");
            };
            reader.readAsDataURL(blob);
          };
          rec.start();
          showToast("⏺ در حال ضبط ویس... برای پایان، دوباره بزنید");
        }).catch(function () { showToast("دسترسی به میکروفون ممکن نشد"); });
      } catch (e) { showToast("❌ " + e.message); }
    }
    function readAudioFile(input, cb) {
      var f = input.files && input.files[0];
      if (!f) return;
      if (f.size > 2300000) { showToast("حجم ویس زیاد است (حداکثر ۲ مگابایت)"); input.value = ""; return; }
      var reader = new FileReader();
      reader.onload = function () { cb(String(reader.result || "")); };
      reader.readAsDataURL(f);
    }
    function pickHwAudio(aid, input) {
      readAudioFile(input, function (r) {
        hwAudios[aid] = r;
        var pv = document.getElementById("hwAudPrev_" + aid);
        if (pv) { pv.src = r; pv.style.display = "inline-block"; }
        showToast("✅ ویس انتخاب شد");
      });
    }
    function pickHwFreeAudio(input) {
      readAudioFile(input, function (r) {
        hwFreeAudio = r;
        var pv = document.getElementById("hwFreeAudPrev");
        if (pv) { pv.src = r; pv.style.display = "inline-block"; }
        showToast("✅ ویس انتخاب شد");
      });
    }
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
                '<button type="button" class="btn btn-ghost btn-sm" onclick="toggleVoiceRec(\'free\', 0)">🎤 ضبط ویس</button>' +
                '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">🎧 فایل ویس<input type="file" accept="audio/*" style="display:none;" onchange="pickHwFreeAudio(this)" /></label>' +
                '<audio id="hwFreeAudPrev" controls style="display:none;max-width:100%;height:36px;"></audio>' +
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
              (x.audio ? '<audio src="' + x.audio + '" controls style="width:100%;height:40px;margin:6px 0;"></audio>' : '') +
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
                    '<button type="button" class="btn btn-ghost btn-sm" onclick="toggleVoiceRec(\'asg\',' + a.id + ')">🎤 ضبط ویس</button>' +
                    '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">🎧 ویس<input type="file" accept="audio/*" style="display:none;" onchange="pickHwAudio(' + a.id + ', this)" /></label>' +
                    '<audio id="hwAudPrev_' + a.id + '" controls src="' + (sub && sub.audio ? sub.audio : "") + '" style="display:' + (sub && sub.audio ? "inline-block" : "none") + ';max-width:100%;height:36px;"></audio>' +
                    '<video id="hwVidPrev_' + a.id + '" controls src="' + (sub && sub.video ? sub.video : "") + '" style="display:' + (sub && sub.video ? "inline-block" : "none") + ';max-width:100%;max-height:150px;border-radius:9px;"></video>' +
                    '<img id="hwPrev_' + a.id + '" src="" style="display:' + (sub && sub.photo ? "inline-block" : "none") + ';width:64px;height:64px;object-fit:cover;border-radius:9px;border:1px solid var(--border);cursor:pointer;" onclick="viewPhoto(this.src)" />' +
                    '<button class="btn btn-emerald btn-sm" style="margin-right:auto;" onclick="submitHw(' + a.id + ')">📤 ' + (sub ? "ویرایش ارسال" : "ارسال تکلیف") + '</button>' +
                  '</div>';
                if (sub && sub.photo) {
                  formHtml = formHtml.replace('src=""', 'src="' + sub.photo + '"');
                }
              } else if (sub && (sub.photo || sub.video || sub.audio)) {
                formHtml = (sub.photo ? '<img src="' + sub.photo + '" style="width:100%;max-height:220px;object-fit:contain;border-radius:11px;cursor:pointer;" onclick="viewPhoto(this.src)" />' : "") +
                  (sub.video ? '<video src="' + sub.video + '" controls style="width:100%;max-height:220px;border-radius:11px;margin:6px 0;"></video>' : "") +
                  (sub.audio ? '<audio src="' + sub.audio + '" controls style="width:100%;height:40px;margin:6px 0;"></audio>' : "");
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
        if (!txt.trim() && !hwFreePhoto && !hwFreeVideo && !hwFreeAudio) return showToast("متن یا عکس یا ویدیو یا ویس تکلیف را وارد کنید");
        await api("/api/ms/student/hw/send", { text: txt.trim(), photo: hwFreePhoto, video: hwFreeVideo, audio: hwFreeAudio });
        hwFreePhoto = "";
        hwFreeVideo = "";
        hwFreeAudio = "";
        showToast("✅ تکلیف برای معلم ارسال شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function submitHw(aid) {
      try {
        var txt = (document.getElementById("hwText_" + aid) || {}).value || "";
        await api("/api/ms/student/submit", { assignmentId: aid, text: txt.trim(), photo: hwPhotos[aid] || "", video: hwVideos[aid] || "", audio: hwAudios[aid] || "" });
        hwPhotos[aid] = "";
        hwVideos[aid] = "";
        hwAudios[aid] = "";
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

    // ==================== 📝 آزمون آنلاین + 🗄 بانک سوال ====================
    var QTYPE_LABELS = { mcq: "چهارگزینه‌ای", tf: "درست / نادرست", text: "تشریحی (تصحیح معلم)" };

    async function renderQBank(main) {
      try {
        var d = await api("/api/ms/teacher/questions");
        main.innerHTML =
          classSwitcherHtml() +
          '<div class="section-title">🗄 بانک سوال</div>' +
          '<div class="card">' +
            '<div class="section-title">➕ سوال جدید</div>' +
            '<select id="qb_type" class="input" onchange="qTypeChanged(this.value)">' +
              '<option value="mcq">چهارگزینه‌ای</option><option value="tf">درست / نادرست</option><option value="text">تشریحی</option>' +
            '</select>' +
            '<textarea id="qb_text" class="input" placeholder="متن سوال..." rows="2" style="margin-top:8px;"></textarea>' +
            '<div id="qb_opts">' +
              '<input id="qb_o0" class="input" placeholder="گزینه ۱" style="margin-top:6px;" />' +
              '<input id="qb_o1" class="input" placeholder="گزینه ۲" style="margin-top:6px;" />' +
              '<input id="qb_o2" class="input" placeholder="گزینه ۳" style="margin-top:6px;" />' +
              '<input id="qb_o3" class="input" placeholder="گزینه ۴" style="margin-top:6px;" />' +
            '</div>' +
            '<div id="qb_ans_wrap" style="margin-top:6px;">پاسخ درست: <select id="qb_ans" class="input">' +
              '<option value="0">گزینه ۱</option><option value="1">گزینه ۲</option><option value="2">گزینه ۳</option><option value="3">گزینه ۴</option>' +
            '</select></div>' +
            '<input id="qb_subject" class="input" placeholder="درس (مثلاً ریاضی)" style="margin-top:6px;" />' +
            '<input id="qb_chapter" class="input" placeholder="فصل یا موضوع (اختیاری)" style="margin-top:6px;" />' +
            '<button class="btn btn-emerald" style="margin-top:10px;" onclick="qbankSave()">➕ افزودن به بانک</button>' +
          '</div>' +
          '<div class="section-title">📚 سوال‌های بانک (' + (d.questions || []).length + ')</div>' +
          ((d.questions || []).length
            ? (d.questions || []).map(function (q) {
                return '<div class="card"><div style="display:flex;gap:8px;align-items:flex-start;">' +
                  '<div style="flex:1;"><b>' + esc(q.text) + '</b>' +
                  '<div class="muted" style="font-size:11px;margin-top:4px;">' + (QTYPE_LABELS[q.qtype] || q.qtype) + (q.subject ? " • " + esc(q.subject) : "") + (q.chapter ? " • " + esc(q.chapter) : "") + '</div>' +
                  (q.qtype === "mcq"
                    ? '<div class="muted" style="font-size:11px;margin-top:3px;">گزینه‌ها: ' + q.options.map(function (o, i2) { return o ? (i2 + 1) + ") " + esc(o) : ""; }).filter(Boolean).join(" | ") + ' — پاسخ درست: گزینه ' + (Number(q.answer) + 1) + '</div>'
                    : q.qtype === "tf"
                    ? '<div class="muted" style="font-size:11px;">پاسخ درست: ' + (q.answer === "true" ? "درست" : "نادرست") + '</div>'
                    : '<div class="muted" style="font-size:11px;">تصحیح دستی توسط معلم</div>') +
                  '</div>' +
                  '<button class="btn btn-ghost btn-sm" onclick="qbankDel(' + q.id + ')">🗑</button>' +
                '</div></div>';
              }).join("")
            : '<div class="card"><div class="muted">هنوز سوالی ثبت نشده — از فرم بالا اولین سوال را اضافه کنید.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    function qTypeChanged(v) {
      var o = document.getElementById("qb_opts");
      var a = document.getElementById("qb_ans_wrap");
      if (v === "mcq") {
        o.style.display = ""; a.style.display = "";
        document.getElementById("qb_ans").innerHTML = '<option value="0">گزینه ۱</option><option value="1">گزینه ۲</option><option value="2">گزینه ۳</option><option value="3">گزینه ۴</option>';
      } else if (v === "tf") {
        o.style.display = "none"; a.style.display = "";
        document.getElementById("qb_ans").innerHTML = '<option value="true">درست</option><option value="false">نادرست</option>';
      } else { o.style.display = "none"; a.style.display = "none"; }
    }

    async function qbankSave() {
      try {
        var t = document.getElementById("qb_type").value;
        var body = { qtype: t, text: document.getElementById("qb_text").value.trim(), subject: document.getElementById("qb_subject").value.trim(), chapter: document.getElementById("qb_chapter").value.trim() };
        if (t === "mcq") {
          body.options = [document.getElementById("qb_o0").value, document.getElementById("qb_o1").value, document.getElementById("qb_o2").value, document.getElementById("qb_o3").value];
          body.answer = Number(document.getElementById("qb_ans").value);
        } else if (t === "tf") {
          body.answer = document.getElementById("qb_ans").value;
        } else { body.answer = ""; }
        await api("/api/ms/teacher/questions", body);
        showToast("✅ سوال به بانک اضافه شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function qbankDel(id) {
      if (!confirm("این سوال از بانک حذف شود؟")) return;
      try { await api("/api/ms/teacher/questions/delete", { id: id }); showToast("🗑 سوال حذف شد"); renderApp(); } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderTeacherExams(main) {
      try {
        var d = await api("/api/ms/teacher/exams");
        var qd = await api("/api/ms/teacher/questions");
        var clsId = (typeof selClassId !== "undefined" && selClassId) ? selClassId : ((msData && msData.classes && msData.classes[0]) ? msData.classes[0].id : 0);
        var qBySubj = {};
        (qd.questions || []).forEach(function (q) {
          var k = q.subject || "عمومی";
          if (!qBySubj[k]) qBySubj[k] = [];
          qBySubj[k].push(q);
        });
        var pickHtml = Object.keys(qBySubj).map(function (k) {
          return '<div style="margin-top:8px;"><b style="font-size:12px;">📚 ' + esc(k) + '</b>' +
            qBySubj[k].map(function (q) {
              return '<label style="display:flex;gap:6px;align-items:flex-start;font-size:12px;margin-top:5px;cursor:pointer;">' +
                '<input type="checkbox" class="ex_q" value="' + q.id + '" style="margin-top:2px;" />' +
                '<span>' + esc(q.text) + ' <span class="muted">(' + (QTYPE_LABELS[q.qtype] || q.qtype) + ')</span></span>' +
              '</label>';
            }).join("") + '</div>';
        }).join("");
        main.innerHTML =
          classSwitcherHtml() +
          '<div class="section-title">📝 آزمون‌های کلاس</div>' +
          ((d.exams || []).length
            ? (d.exams || []).map(function (e) {
                var stTxt = e.status === "open" ? "🟢 منتشرشده" : e.status === "closed" ? "🔴 بسته‌شده" : "⚪ پیش‌نویس";
                return '<div class="card">' +
                  '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<div style="flex:1;"><b>' + esc(e.title) + '</b>' + (e.subject ? ' <span class="muted">• ' + esc(e.subject) + '</span>' : "") +
                    '<div class="muted" style="font-size:11px;margin-top:3px;">' + stTxt + ' • ⏱ ' + e.durationMin + ' دقیقه • 👥 ' + e.submitted + " از " + e.students + ' شرکت‌کننده' + (e.endAt ? " • مهلت: " + String(e.endAt).slice(0, 16).replace("T", " ") : "") + '</div></div>' +
                    '<button class="btn btn-emerald btn-sm" onclick="examResultsOpen(' + e.id + ')">📊 نتایج</button>' +
                    (e.status === "draft"
                      ? '<button class="btn btn-gold btn-sm" onclick="examPublish(' + e.id + ', 1)">📣 انتشار</button>'
                      : e.status === "open"
                      ? '<button class="btn btn-ghost btn-sm" onclick="examPublish(' + e.id + ', 0)">⏸ بستن</button>'
                      : '<button class="btn btn-ghost btn-sm" onclick="examPublish(' + e.id + ', 1)">▶️ بازگشایی</button>') +
                    '<button class="btn btn-ghost btn-sm" onclick="examDel(' + e.id + ')">🗑</button>' +
                  '</div></div>';
              }).join("")
            : '<div class="card"><div class="muted">هنوز آزمونی ساخته نشده است.</div></div>') +
          '<div class="card">' +
            '<div class="section-title">✨ ساخت سوال با هوش مصنوعی</div>' +
            '<div class="muted" style="font-size:11.5px;">سوال‌ها را هوش مصنوعی می‌سازد؛ قبل از افزودن به بانک، خودتان بررسی کنید. سرویس را انتخاب کنید:</div>' +
            '<select id="ai_prov" class="input" style="margin-top:8px;"><option value="auto">✨ هوش سامانه (رایگان — پیش‌فرض)</option></select>' +
            '<div class="muted" id="ai_note" style="font-size:10.5px;margin-top:3px;"></div>' +
            '<div style="display:flex;gap:8px;margin-top:8px;">' +
              '<input id="ai_grade" class="input" placeholder="پایه (مثلاً پنجم)" style="flex:1;" />' +
              '<input id="ai_subj" class="input" placeholder="درس" style="flex:1;" />' +
            '</div>' +
            '<input id="ai_topic" class="input" placeholder="موضوع دقیق (مثلاً کسرها یا انرژی)" style="margin-top:6px;" />' +
            '<div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap;">' +
              '<label style="display:flex;gap:5px;align-items:center;font-size:12px;cursor:pointer;"><input type="checkbox" id="ai_k_mcq" checked /> چهارگزینه‌ای</label>' +
              '<label style="display:flex;gap:5px;align-items:center;font-size:12px;cursor:pointer;"><input type="checkbox" id="ai_k_tf" checked /> درست/نادرست</label>' +
              '<span class="muted" style="font-size:11px;">تعداد:</span>' +
              '<input id="ai_cnt" class="input" style="width:60px;margin:0;" dir="ltr" value="5" />' +
              '<button class="btn btn-gold btn-sm" onclick="aiGenRun()">✨ ساخت سوال‌ها</button>' +
            '</div>' +
            '<div id="aiGenOut" style="margin-top:8px;"></div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="section-title">➕ ساخت آزمون جدید</div>' +
            '<input id="ex_title" class="input" placeholder="عنوان آزمون (مثلاً ریاضی فصل ۳)" />' +
            '<input id="ex_subject" class="input" placeholder="درس" style="margin-top:6px;" />' +
            '<div style="display:flex;gap:8px;margin-top:6px;">' +
              '<input id="ex_dur" class="input" placeholder="مدت (دقیقه)" value="20" style="flex:1;" />' +
              '<input id="ex_end" class="input" type="datetime-local" placeholder="مهلت نهایی" style="flex:2;" />' +
            '</div>' +
            '<div style="margin-top:8px;font-size:12px;"><b>انتخاب سوال از بانک:</b> (' + (qd.questions || []).length + ' سوال موجود)' +
              (pickHtml || '<div class="muted" style="margin-top:6px;">ابتدا از «بانک سوال» سوال اضافه کنید.</div>') +
            '</div>' +
            '<button class="btn btn-emerald" style="margin-top:10px;" onclick="examCreate()">➕ ساخت آزمون</button>' +
          '</div>' +
          backBtnHtml();
        try { aiGenInit(); } catch (eI) {}
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function examCreate() {
      try {
        var ids = Array.prototype.map.call(document.querySelectorAll(".ex_q:checked"), function (x) { return Number(x.value); });
        if (!ids.length) return showToast("حداقل یک سوال انتخاب کنید");
        var clsId = (typeof selClassId !== "undefined" && selClassId) ? selClassId : ((msData && msData.classes && msData.classes[0]) ? msData.classes[0].id : 0);
        var endV = document.getElementById("ex_end").value;
        await api("/api/ms/teacher/exams", {
            classId: clsId,
            title: document.getElementById("ex_title").value.trim(),
            subject: document.getElementById("ex_subject").value.trim(),
            durationMin: Number(document.getElementById("ex_dur").value || 20),
            endAt: endV ? new Date(endV).toISOString() : "",
            questionIds: ids
        });
        showToast("✅ آزمون ساخته شد — برای دانش‌آموزان منتشرش کنید");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function examPublish(id, open) {
      try {
        await api("/api/ms/teacher/exams/publish", { examId: id, open: !!open });
        showToast(open ? "📣 آزمون منتشر شد — به دانش‌آموزان اطلاع داده می‌شود" : "⏸ آزمون بسته شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function examDel(id) {
      if (!confirm("آزمون و همه‌ی پاسخ‌ها حذف شود؟")) return;
      try { await api("/api/ms/teacher/exams/delete", { examId: id }); showToast("🗑 حذف شد"); renderApp(); } catch (e) { showToast("❌ " + e.message); }
    }

    function examResultsOpen(id) {
      window._examResId = id;
      activeTab = "examres";
      renderApp();
    }

    async function renderExamResults(main) {
      try {
        var d = await api("/api/ms/teacher/exams/results?examId=" + Number(window._examResId || 0));
        var pendingRows = (d.attempts || []).filter(function (a) { return a.status === "submitted"; });
        main.innerHTML =
          '<div class="section-title">📊 نتایج آزمون «' + esc(d.exam.title) + '»</div>' +
          '<div class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;text-align:center;">' +
            '<div style="flex:1;"><div class="muted" style="font-size:11px;">شرکت‌کنندگان</div><b style="font-size:20px;">' + d.stats.submitted + " از " + d.stats.total + '</b></div>' +
            '<div style="flex:1;"><div class="muted" style="font-size:11px;">میانگین</div><b style="font-size:20px;">' + d.stats.avg + '</b></div>' +
            '<div style="flex:1;"><div class="muted" style="font-size:11px;">بیشترین</div><b style="font-size:20px;">' + d.stats.max + '</b></div>' +
            '<div style="flex:1;"><div class="muted" style="font-size:11px;">کمترین</div><b style="font-size:20px;">' + d.stats.min + '</b></div>' +
          '</div></div>' +
          '<div class="section-title">🔍 تحلیل سوال‌ها</div>' +
          (d.qStats || []).map(function (q, i2) {
            return '<div class="card" style="padding:10px;">' +
              '<div style="font-size:12px;"><b>' + (i2 + 1) + ') ' + esc(q.text) + '</b>' + (q.qtype === "text" ? ' <span class="muted">(تشریحی)</span>' : "") + '</div>' +
              (q.qtype !== "text"
                ? '<div style="margin-top:6px;background:var(--surface-2);border-radius:8px;height:10px;overflow:hidden;"><div style="width:' + q.pct + '%;height:100%;background:' + (q.pct >= 60 ? "#10b981" : q.pct >= 30 ? "#f59e0b" : "#ef4444") + ';"></div></div>' +
                  '<div class="muted" style="font-size:11px;margin-top:3px;">' + q.pct + '% پاسخ درست (' + q.correct + " از " + q.answered + ')' + (q.pct < 40 ? " — ⚠️ سوال سخت بوده" : "") + '</div>'
                : '<div class="muted" style="font-size:11px;margin-top:3px;">تصحیح دستی</div>') +
            '</div>';
          }).join("") +
          (pendingRows.length
            ? '<div class="section-title">✍️ تصحیح سوال‌های تشریحی (' + pendingRows.length + ')</div>' +
              pendingRows.map(function (a) {
                var texts = (d.questions || []).filter(function (q) { return q.qtype === "text"; });
                return '<div class="card">' +
                  '<b>' + esc(a.name) + '</b>' +
                  texts.map(function (q) {
                    return '<div style="margin-top:8px;font-size:12px;"><div class="muted">' + esc(q.text) + '</div>' +
                      '<div style="margin-top:3px;padding:8px;background:var(--surface-2);border-radius:8px;">' + esc((a.answers || {})[String(q.id)] || "—") + '</div>' +
                      '<div style="display:flex;gap:6px;align-items:center;margin-top:5px;">نمره‌ی این سوال: <input id="gt_' + a.studentId + '_' + q.id + '" class="input" style="width:80px;margin:0;" dir="ltr" placeholder="0" value="' + (a.manual && a.manual[String(q.id)] !== undefined ? a.manual[String(q.id)] : "") + '" /></div>' +
                    '</div>';
                  }).join("") +
                  '<button class="btn btn-emerald btn-sm" style="margin-top:8px;" onclick="examGradeSave(' + a.studentId + ')">✅ ثبت نمرات تشریحی</button>' +
                '</div>';
              }).join("")
            : "") +
          '<div class="section-title">📋 کارنامه‌ی کلاس</div>' +
          '<div class="card"><table style="width:100%;font-size:12px;"><thead><tr><th style="text-align:right;">دانش‌آموز</th><th>نمره</th><th>خودکار</th><th>وضعیت</th><th>زمان</th></tr></thead><tbody>' +
          ((d.attempts || []).length
            ? (d.attempts || []).map(function (a) {
                return '<tr><td>' + esc(a.name) + (a.late ? ' <span title="با تاخیر" style="font-size:10px;">⏰</span>' : "") + '</td>' +
                  '<td style="text-align:center;"><b>' + a.score + '</b> / ' + a.maxScore + '</td>' +
                  '<td style="text-align:center;">' + a.autoScore + '</td>' +
                  '<td style="text-align:center;">' + (a.status === "graded" ? "✅ تصحیح‌شده" : a.status === "submitted" ? "✍️ در انتظار تصحیح" : "—") + '</td>' +
                  '<td class="muted" style="text-align:center;font-size:10.5px;">' + esc(String(a.submittedAt || "").slice(0, 16).replace("T", " ")) + '</td></tr>';
              }).join("")
            : '<tr><td colspan="5" class="muted">هنوز کسی شرکت نکرده است.</td></tr>') +
          '</tbody></table></div>' +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function examGradeSave(studentId) {
      try {
        var d = await api("/api/ms/teacher/exams/results?examId=" + Number(window._examResId || 0));
        var texts = (d.questions || []).filter(function (q) { return q.qtype === "text"; });
        var scores = {};
        texts.forEach(function (q) {
          var el = document.getElementById("gt_" + studentId + "_" + q.id);
          if (el && el.value.trim() !== "") scores[String(q.id)] = Number(el.value);
        });
        var rv = await api("/api/ms/teacher/exams/grade", { examId: Number(window._examResId || 0), studentId: studentId, scores: scores });
        showToast("✅ نمره ثبت شد: " + (rv && rv.score !== undefined ? rv.score : "") + " — برای دانش‌آموز ارسال شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderStudentExams(main) {
      try {
        var d = await api("/api/ms/student/exams");
        main.innerHTML =
          '<div class="section-title">📝 آزمون‌های من</div>' +
          ((d.exams || []).length
            ? (d.exams || []).map(function (e) {
                var badge = e.status === "open" ? "🟢 باز" : "🔴 بسته";
                var act = "";
                if (e.myAttempt && e.myAttempt.status === "in_progress") {
                  act = '<button class="btn btn-gold btn-sm" onclick="examStart(' + e.id + ')">▶️ ادامه‌ی آزمون</button>';
                } else if (!e.myAttempt && e.status === "open") {
                  act = '<button class="btn btn-emerald btn-sm" onclick="examStart(' + e.id + ')">🚀 شروع آزمون</button>';
                } else if (e.myAttempt) {
                  act = '<button class="btn btn-ghost btn-sm" onclick="examShowResult(' + e.id + ')">📄 مشاهده‌ی نتیجه</button>';
                }
                return '<div class="card">' +
                  '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<div style="flex:1;"><b>' + esc(e.title) + '</b>' + (e.subject ? ' <span class="muted">• ' + esc(e.subject) + '</span>' : "") +
                    '<div class="muted" style="font-size:11px;margin-top:3px;">' + badge + ' • ⏱ ' + e.durationMin + ' دقیقه • ' + e.questionCount + ' سوال' +
                    (e.myAttempt && e.myAttempt.status !== "in_progress" ? ' • نمره: <b>' + e.myAttempt.score + '</b> / ' + e.myAttempt.maxScore : "") +
                    (e.myAttempt && e.myAttempt.late ? " • ⏰ با تاخیر" : "") +
                    '</div></div>' + act +
                  '</div></div>';
              }).join("")
            : '<div class="card"><div class="muted">فعلاً آزمونی برای کلاس شما منتشر نشده است.</div></div>') +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function examStart(id) {
      try {
        var d = await api("/api/ms/student/exams/start", { examId: id });
        window._examState = { exam: d.exam, questions: d.questions, deadline: d.deadline };
        activeTab = "examtaking";
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    function examShowResult(id) {
      window._examDoneId = Number(id);
      activeTab = "examresult";
      renderApp();
    }

    async function renderExamTake(main) {
      if (window._examTimer) { clearInterval(window._examTimer); window._examTimer = null; }
      var st = window._examState;
      if (!st) {
        main.innerHTML = '<div class="card">آزمونی در جریان نیست.</div>' + backBtnHtml();
        return;
      }
      main.innerHTML =
        '<div class="section-title">📝 ' + esc(st.exam.title) + '</div>' +
        '<div class="card" style="display:flex;align-items:center;gap:10px;">' +
          '<b>⏱ زمان باقی‌مانده:</b> <span id="exam_clock" style="font-size:19px;font-weight:bold;color:#f59e0b;" dir="ltr">--:--</span>' +
          '<span class="muted" style="font-size:11px;">پاسخ‌ها خودکار ذخیره نمی‌شوند — تا پایان، این صفحه را نبندید.</span>' +
        '</div>' +
        st.questions.map(function (q, i2) {
          var head = '<div style="font-size:13px;"><b>' + (i2 + 1) + ') ' + esc(q.text) + '</b></div>';
          var inp = "";
          if (q.qtype === "mcq") {
            inp = (q.options || []).map(function (o, oi) {
              return o ? '<label style="display:flex;gap:7px;align-items:center;font-size:12.5px;margin-top:6px;cursor:pointer;"><input type="radio" name="qq_' + q.id + '" value="' + oi + '" /><span>' + esc(o) + '</span></label>' : "";
            }).join("");
          } else if (q.qtype === "tf") {
            inp = '<label style="display:flex;gap:7px;align-items:center;font-size:12.5px;margin-top:6px;cursor:pointer;"><input type="radio" name="qq_' + q.id + '" value="true" /><span>درست</span></label>' +
                  '<label style="display:flex;gap:7px;align-items:center;font-size:12.5px;margin-top:6px;cursor:pointer;"><input type="radio" name="qq_' + q.id + '" value="false" /><span>نادرست</span></label>';
          } else {
            inp = '<textarea id="qt_' + q.id + '" class="input" rows="3" placeholder="پاسخ خود را بنویسید..." style="margin-top:6px;"></textarea>';
          }
          return '<div class="card">' + head + inp + '</div>';
        }).join("") +
        '<button class="btn btn-emerald" style="width:100%;margin-top:10px;" onclick="examSubmit()">📤 ثبت نهایی پاسخ‌ها</button>';
      function tick() {
        var el = document.getElementById("exam_clock");
        if (!el) { if (window._examTimer) { clearInterval(window._examTimer); window._examTimer = null; } return; }
        var ms = new Date(st.deadline).getTime() - Date.now();
        if (ms <= 0) { el.textContent = "00:00"; clearInterval(window._examTimer); window._examTimer = null; examSubmit(true); return; }
        var mm = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000);
        el.textContent = (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
      }
      tick();
      window._examTimer = setInterval(tick, 1000);
    }

    async function examSubmit(auto) {
      try {
        var st = window._examState;
        if (!st) return;
        if (!auto && !confirm("پاسخ‌ها ثبت نهایی شود؟ بعد از ثبت قابل تغییر نیست.")) return;
        var answers = {};
        st.questions.forEach(function (q) {
          if (q.qtype === "text") {
            var el = document.getElementById("qt_" + q.id);
            answers[String(q.id)] = el ? el.value : "";
          } else {
            var sel = null;
            try { if (document.querySelector) sel = document.querySelector("input[name=" + String.fromCharCode(34) + "qq_" + q.id + String.fromCharCode(34) + "]:checked"); } catch (e1) {}
            answers[String(q.id)] = sel ? sel.value : "";
          }
        });
        if (window._examTimer) { clearInterval(window._examTimer); window._examTimer = null; }
        await api("/api/ms/student/exams/submit", { examId: st.exam.id, answers: answers });
        window._examDoneId = st.exam.id;
        window._examState = null;
        activeTab = "examresult";
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderExamResult(main) {
      try {
        var d = await api("/api/ms/student/exams/result?examId=" + Number(window._examDoneId || 0));
        main.innerHTML =
          '<div class="section-title">📄 نتیجه‌ی آزمون «' + esc(d.exam.title) + '»</div>' +
          '<div class="card" style="text-align:center;">' +
            '<div class="muted" style="font-size:12px;">نمره‌ی شما</div>' +
            '<div style="font-size:34px;font-weight:bold;color:' + (d.score >= d.maxScore * 0.6 ? "#10b981" : d.score >= d.maxScore * 0.3 ? "#f59e0b" : "#ef4444") + ';">' + d.score + ' <span style="font-size:16px;opacity:.7;">از ' + d.maxScore + '</span></div>' +
            (d.status === "submitted" ? '<div class="muted" style="font-size:11.5px;margin-top:6px;">✍️ سوال‌های تشریحی هنوز توسط معلم تصحیح نشده‌اند.</div>' : "") +
            (d.late ? '<div class="muted" style="font-size:11.5px;margin-top:4px;">⏰ پاسخ شما با تاخیر ثبت شد.</div>' : "") +
          '</div>' +
          (d.questions || []).map(function (q, i2) {
            var mark = q.qtype === "text"
              ? (q.manualScore === null ? '✍️ <span class="muted">در انتظار تصحیح</span>' : '⭐ نمره: <b>' + q.manualScore + '</b>')
              : (q.isCorrect ? "✅ درست" : "❌ نادرست");
            var det = "";
            if (q.qtype !== "text" && !q.isCorrect) {
              det = '<div class="muted" style="font-size:11px;margin-top:3px;">پاسخ درست: ' + (q.qtype === "tf" ? (q.correct === "true" ? "درست" : "نادرست") : "گزینه‌ی " + (Number(q.correct) + 1) + (q.options && q.options[Number(q.correct)] ? " (" + esc(q.options[Number(q.correct)]) + ")" : "")) + '</div>';
            }
            return '<div class="card" style="padding:10px;">' +
              '<div style="font-size:12.5px;"><b>' + (i2 + 1) + ') ' + esc(q.text) + '</b></div>' +
              '<div style="margin-top:4px;font-size:12px;">' + mark + '</div>' + det +
              (q.qtype === "text" && q.mine ? '<div class="muted" style="margin-top:4px;font-size:11px;">پاسخ شما: ' + esc(q.mine) + '</div>' : "") +
            '</div>';
          }).join("") +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    // ==================== 📚 چالش کتاب‌خوانی ====================
    function bookStatusChip(st) {
      return st === "approved" ? "✅ تاییدشده" : st === "rejected" ? "❌ تاییدنشده" : "⏳ در انتظار تایید";
    }

    async function renderStudentBooks(main) {
      try {
        var d = await api("/api/ms/student/books");
        var rd = await api("/api/ms/student/read").catch(function () { return { passages: [] }; });
        main.innerHTML =
          '<div class="section-title">📚 چالش کتاب‌خوانی</div>' +
          '<div class="card">' +
            '<div class="section-title">📖 کتاب جدید خواندم!</div>' +
            '<input id="bk_title" class="input" placeholder="عنوان کتاب" />' +
            '<input id="bk_author" class="input" placeholder="نویسنده (اختیاری)" style="margin-top:6px;" />' +
            '<div style="display:flex;gap:8px;margin-top:6px;">' +
              '<input id="bk_pages" class="input" placeholder="تعداد صفحات" style="flex:1;" dir="ltr" />' +
              '<input id="bk_minutes" class="input" placeholder="زمان مطالعه (دقیقه)" style="flex:1;" dir="ltr" />' +
            '</div>' +
            '<textarea id="bk_summary" class="input" rows="2" placeholder="خلاصه‌ی کوتاه از کتاب (اختیاری)" style="margin-top:6px;"></textarea>' +
            '<button class="btn btn-emerald" style="margin-top:10px;" onclick="bookSubmit()">📚 ثبت کتاب</button>' +
            '<div class="muted" style="font-size:11px;margin-top:6px;">بعد از تایید معلم، امتیاز⭐ آن برایت ثبت می‌شود.</div>' +
          '</div>' +
          '<div class="section-title">📖 کتاب‌های من (' + (d.mine || []).length + ')</div>' +
          ((d.mine || []).length
            ? (d.mine || []).map(function (b) {
                return '<div class="card" style="padding:10px;"><div style="display:flex;gap:8px;align-items:flex-start;">' +
                  '<div style="flex:1;"><b>' + esc(b.title) + '</b>' + (b.author ? ' <span class="muted">— ' + esc(b.author) + '</span>' : "") +
                  '<div class="muted" style="font-size:11px;margin-top:3px;">' + bookStatusChip(b.status) + (b.pages ? " • " + b.pages + " صفحه" : "") + (b.points ? " • +" + b.points + " ⭐" : "") + ' • ' + esc(b.date) + '</div>' +
                  (b.feedback ? '<div class="muted" style="font-size:11px;margin-top:3px;">💬 ' + esc(b.feedback) + '</div>' : "") +
                  '</div></div></div>';
              }).join("")
            : '<div class="card"><div class="muted">هنوز کتابی ثبت نکرده‌ای — اولین خواننده باش! 📚</div></div>') +
          '<div class="section-title">🏆 برترین‌های کلاس</div>' +
          ((d.board || []).length
            ? '<div class="card"><table style="width:100%;font-size:12px;"><thead><tr><th style="text-align:right;">#</th><th style="text-align:right;">دانش‌آموز</th><th>کتاب</th><th>صفحه</th><th>⭐</th></tr></thead><tbody>' +
              (d.board || []).map(function (b, i2) {
                var medals = ["🥇", "🥈", "🥉"];
                return '<tr><td>' + (medals[i2] || (i2 + 1)) + '</td><td>' + esc(b.name) + '</td><td style="text-align:center;">' + b.books + '</td><td style="text-align:center;">' + b.pages + '</td><td style="text-align:center;">' + b.points + '</td></tr>';
              }).join("") + '</tbody></table></div>'
            : '<div class="card"><div class="muted">هنوز کسی در کلاس کتابی ثبت نکرده است.</div></div>') +
          '<div class="card" style="background:linear-gradient(135deg, rgba(245,158,11,0.12), rgba(16,185,129,0.08));border:1px solid rgba(245,158,11,0.35);">' +
            '<div class="section-title">✨ کتاب پیشنهادی هوش مصنوعی</div>' +
            '<div class="muted" style="font-size:11.5px;line-height:1.9;">هوش مصنوعی خودش یک کتاب مناسب انتخاب می‌کند، خلاصه‌اش را می‌نویسد (با نام کتاب، مؤلف و مترجم) و تو آن را می‌خوانی و آزمون می‌دهی!</div>' +
            '<button class="btn btn-gold" style="margin-top:9px;width:100%;" onclick="readAiBook()">📚 یک کتاب به من معرفی کن</button>' +
            '<div id="aiBookOut" style="margin-top:8px;"></div>' +
          '</div>' +
          '<div class="section-title">📖 خلاصه‌های خواندنی</div>' +
          ((rd.passages || []).length
            ? (rd.passages || []).map(function (x) {
                return '<div class="card">' +
                  '<b>📖 ' + esc(x.title) + '</b>' + (x.author ? ' <span class="muted">— ' + esc(x.author) + '</span>' : "") +
                  (x.translator ? '<div class="muted" style="font-size:11px;margin-top:2px;">🖊 ترجمه: ' + esc(x.translator) + '</div>' : "") +
                  '<div class="muted" style="font-size:11px;margin-top:4px;line-height:1.8;">' + esc(x.excerpt) + ' ...</div>' +
                  '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">' +
                    (x.myQuiz && x.myQuiz.finished
                      ? '<span style="background:rgba(16,185,129,0.16);color:#6EE7B7;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800;">✅ ' + x.myQuiz.score + ' از ' + x.myQuiz.total + '</span>'
                      : "") +
                    '<button class="btn btn-gold btn-sm" onclick="readQuizStart(' + x.id + ')">' + (x.myQuiz && x.myQuiz.finished ? "📝 آزمون دوباره" : "📝 آزمون خواندن") + '</button>' +
                  '</div>' +
                  '<div class="muted" style="font-size:10.5px;margin-top:5px;">ارسال‌کننده: ' + esc(x.addedBy || "معلم") + '</div>' +
                '</div>';
              }).join("")
            : '<div class="card"><div class="muted">هنوز خلاصه‌ای ثبت نشده — به‌زودی معلم یا دوستانت خلاصه‌ی کتاب می‌گذارند.</div></div>') +
          ((d.shelf || []).length
            ? '<div class="section-title">📚 قفسه‌ی معلم‌ها</div>' + (d.shelf || []).map(function (b) {
                return '<div class="card" style="padding:9px;"><b>' + esc(b.title) + '</b> <span class="muted">— ' + esc(b.author || "") + '</span><div class="muted" style="font-size:11px;">👨‍🏫 ' + esc(b.name) + (b.pages ? " • " + b.pages + " صفحه" : "") + '</div></div>';
              }).join("")
            : "") +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function bookSubmit() {
      try {
        await api("/api/ms/student/books", {
          title: document.getElementById("bk_title").value.trim(),
          author: document.getElementById("bk_author").value.trim(),
          pages: Number(document.getElementById("bk_pages").value || 0),
          minutes: Number(document.getElementById("bk_minutes").value || 0),
          summary: document.getElementById("bk_summary").value.trim()
        });
        showToast("📚 کتاب ثبت شد — بعد از تایید معلم امتیاز می‌گیری!");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function renderTeacherBooks(main) {
      try {
        var d = await api("/api/ms/teacher/books");
        var rd = await api("/api/ms/teacher/read").catch(function () { return { passages: [], results: [] }; });
        main.innerHTML =
          '<div class="section-title">📚 چالش کتاب‌خوانی</div>' +
          ((d.pending || []).length
            ? '<div class="section-title">⏳ کتاب‌های در انتظار تایید (' + (d.pending || []).length + ')</div>' +
              (d.pending || []).map(function (b) {
                return '<div class="card">' +
                  '<b>📖 ' + esc(b.title) + '</b> ' + (b.author ? '<span class="muted">— ' + esc(b.author) + '</span>' : "") +
                  '<div class="muted" style="font-size:11px;margin-top:3px;">👤 ' + esc(b.userName) + (b.pages ? " • " + b.pages + " صفحه" : "") + (b.minutes ? " • " + b.minutes + " دقیقه" : "") + '</div>' +
                  (b.summary ? '<div class="muted" style="font-size:11.5px;margin-top:4px;">' + esc(b.summary) + '</div>' : "") +
                  '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;">' +
                    '<span class="muted" style="font-size:11px;">امتیاز:</span>' +
                    '<input id="bkpts_' + b.id + '" class="input" style="width:70px;margin:0;" dir="ltr" value="5" />' +
                    '<input id="bkfb_' + b.id + '" class="input" placeholder="بازخورد (اختیاری)" style="flex:1;min-width:120px;margin:0;" />' +
                    '<button class="btn btn-emerald btn-sm" onclick="bookApprove(' + b.id + ', 1)">✅ تایید</button>' +
                    '<button class="btn btn-ghost btn-sm" onclick="bookApprove(' + b.id + ', 0)">❌ رد</button>' +
                  '</div></div>';
              }).join("")
            : "") +
          '<div class="card">' +
            '<div class="section-title">➕ کتابی که خودم خوانده‌ام</div>' +
            '<input id="tbk_title" class="input" placeholder="عنوان کتاب" />' +
            '<input id="tbk_author" class="input" placeholder="نویسنده" style="margin-top:6px;" />' +
            '<div style="display:flex;gap:8px;margin-top:6px;">' +
              '<input id="tbk_pages" class="input" placeholder="صفحات" style="flex:1;" dir="ltr" />' +
              '<input id="tbk_minutes" class="input" placeholder="زمان (دقیقه)" style="flex:1;" dir="ltr" />' +
            '</div>' +
            '<textarea id="tbk_summary" class="input" rows="2" placeholder="خلاصه (اختیاری)" style="margin-top:6px;"></textarea>' +
            '<button class="btn btn-gold" style="margin-top:10px;" onclick="bookTeacherAdd()">📚 ثبت در قفسه‌ی معلم‌ها</button>' +
          '</div>' +
          ((d.mine || []).length
            ? '<div class="section-title">📚 قفسه‌ی من</div>' + (d.mine || []).map(function (b) {
                return '<div class="card" style="padding:9px;display:flex;gap:8px;align-items:center;">' +
                  '<div style="flex:1;"><b>' + esc(b.title) + '</b> <span class="muted">' + esc(b.author || "") + '</span><div class="muted" style="font-size:11px;">' + esc(b.date) + (b.pages ? " • " + b.pages + " صفحه" : "") + '</div></div>' +
                  '<button class="btn btn-ghost btn-sm" onclick="bookDelete(' + b.id + ')">🗑</button>' +
                '</div>';
              }).join("")
            : "") +
          ((d.board || []).length
            ? '<div class="section-title">🏆 برترین‌های کتاب‌خوان</div><div class="card"><table style="width:100%;font-size:12px;"><thead><tr><th style="text-align:right;">#</th><th style="text-align:right;">دانش‌آموز</th><th>کتاب</th><th>صفحه</th></tr></thead><tbody>' +
              (d.board || []).map(function (b, i2) {
                var medals = ["🥇", "🥈", "🥉"];
                return '<tr><td>' + (medals[i2] || (i2 + 1)) + '</td><td>' + esc(b.name) + '</td><td style="text-align:center;">' + b.books + '</td><td style="text-align:center;">' + b.pages + '</td></tr>';
              }).join("") + '</tbody></table></div>'
            : "") +
          '<div class="card" style="background:linear-gradient(135deg, rgba(245,158,11,0.12), rgba(16,185,129,0.08));border:1px solid rgba(245,158,11,0.35);">' +
            '<div class="section-title">✨ کتاب پیشنهادی هوش مصنوعی</div>' +
            '<div class="muted" style="font-size:11.5px;line-height:1.9;">هوش مصنوعی خودش یک کتاب مناسب انتخاب می‌کند و با نام کتاب، مؤلف و مترجم، خلاصه می‌نویسد. می‌توانید بخوانید، آزمونش را ببینید و به کلاس معرفی کنید.</div>' +
            '<button class="btn btn-gold" style="margin-top:9px;width:100%;" onclick="readAiBook()">📚 یک کتاب به من معرفی کن</button>' +
            '<div id="aiBookOut" style="margin-top:8px;"></div>' +
          '</div>' +
          '<div class="section-title">📖 خلاصه‌های چالش خواندن (آزمون هوش مصنوعی)</div>' +
          '<div class="card">' +
            '<div class="section-title">➕ خلاصه‌ی جدید</div>' +
            '<div class="muted" style="font-size:11px;">این متن را دانش‌آموزان می‌خوانند و هوش مصنوعی از آن سوال چهارگزینه‌ای می‌سازد. (خلاصه‌ی کتاب‌های تاییدشده‌ی دانش‌آموزان هم خودکار به اینجا اضافه می‌شود)</div>' +
            '<input id="rq_title" class="input" placeholder="عنوان کتاب" style="margin-top:8px;" />' +
            '<input id="rq_author" class="input" placeholder="نویسنده" style="margin-top:6px;" />' +
            '<input id="rq_translator" class="input" placeholder="مترجم (اختیاری)" style="margin-top:6px;" />' +
            '<textarea id="rq_text" class="input" rows="4" placeholder="متن خلاصه (حداقل ۶۰ حرف)" style="margin-top:6px;"></textarea>' +
            '<button class="btn btn-gold" style="margin-top:8px;" onclick="readPassageAdd()">📖 ثبت خلاصه</button>' +
          '</div>' +
          ((rd.passages || []).length
            ? (rd.passages || []).map(function (x) {
                var res = (rd.results || []).filter(function (q) { return q.passageId === x.id; });
                var avg = res.length ? (res.reduce(function (a2, b2) { return a2 + b2.score; }, 0) / res.length).toFixed(1) : "-";
                return '<div class="card" style="padding:10px;display:flex;gap:8px;align-items:flex-start;">' +
                  '<div style="flex:1;"><b>📖 ' + esc(x.title) + '</b> <span class="muted">' + esc(x.author || "") + '</span>' +
                  '<div class="muted" style="font-size:11px;margin-top:3px;">' + (x.translator ? 'ترجمه: ' + esc(x.translator) + ' • ' : '') + esc(x.addedBy || "") + ' • ' + (x.plen || 0) + ' حرف • ' + res.length + ' آزمون • میانگین ' + avg + '</div></div>' +
                  '<button class="btn btn-ghost btn-sm" onclick="readPassageDelete(' + x.id + ')">🗑</button>' +
                '</div>';
              }).join("")
            : "") +
          ((rd.results || []).length
            ? '<div class="section-title">📊 آخرین نتایج آزمون خواندن</div><div class="card"><table style="width:100%;font-size:12px;"><thead><tr><th style="text-align:right;">دانش‌آموز</th><th style="text-align:right;">خلاصه</th><th>نمره</th></tr></thead><tbody>' +
              (rd.results || []).slice(0, 12).map(function (q) {
                var pz = (rd.passages || []).find(function (x) { return x.id === q.passageId; });
                return '<tr><td>' + esc(q.studentName) + '</td><td>' + esc(pz ? pz.title : "") + '</td><td style="text-align:center;">' + q.score + '/' + q.total + '</td></tr>';
              }).join("") + '</tbody></table></div>'
            : "") +
          backBtnHtml();
      } catch (e) { main.innerHTML = '<div class="card">❌ ' + esc(e.message) + '</div>'; }
    }

    async function bookApprove(id, okFlag) {
      try {
        var ptsEl = document.getElementById("bkpts_" + id);
        var fbEl = document.getElementById("bkfb_" + id);
        await api("/api/ms/teacher/books/approve", {
          id: id,
          approve: !!okFlag,
          points: ptsEl ? Number(normDigitsC(ptsEl.value) || 0) : 0,
          feedback: fbEl ? fbEl.value.trim() : ""
        });
        showToast(okFlag ? "✅ کتاب تایید و امتیاز ثبت شد" : "📗 کتاب تایید نشد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function bookTeacherAdd() {
      try {
        await api("/api/ms/teacher/books", {
          title: document.getElementById("tbk_title").value.trim(),
          author: document.getElementById("tbk_author").value.trim(),
          pages: Number(document.getElementById("tbk_pages").value || 0),
          minutes: Number(document.getElementById("tbk_minutes").value || 0),
          summary: document.getElementById("tbk_summary").value.trim()
        });
        showToast("📚 کتاب شما در قفسه‌ی معلم‌ها ثبت شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function bookDelete(id) {
      if (!confirm("این کتاب حذف شود؟")) return;
      try { await api("/api/ms/teacher/books/delete", { id: id }); showToast("🗑 حذف شد"); renderApp(); } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== ✨ ساخت سوال با هوش مصنوعی ====================
    var _aiGenQs = [];

    async function aiGenInit() {
      try {
        var d = await api("/api/ms/teacher/ai/providers");
        var sel = document.getElementById("ai_prov");
        if (sel) {
          sel.innerHTML = (d.providers || []).map(function (pr) {
            return '<option value="' + pr.id + '" ' + (pr.available ? "" : "disabled") + '>' + esc(pr.name) + (pr.available ? "" : " (کلید تنظیم نشده)") + '</option>';
          }).join("");
        }
        var nt = document.getElementById("ai_note");
        if (nt && d.note) nt.textContent = d.note;
      } catch (e) {}
    }

    async function aiGenRun() {
      try {
        var kinds = [];
        if ((document.getElementById("ai_k_mcq") || {}).checked) kinds.push("mcq");
        if ((document.getElementById("ai_k_tf") || {}).checked) kinds.push("tf");
        if (!kinds.length) kinds = ["mcq", "tf"];
        showToast("⏳ هوش مصنوعی در حال طراحی سوال...");
        var d = await api("/api/ms/teacher/exams/ai-generate", {
          provider: (document.getElementById("ai_prov") || {}).value || "auto",
          grade: (document.getElementById("ai_grade") || {}).value || "",
          subject: (document.getElementById("ai_subj") || {}).value || "",
          topic: (document.getElementById("ai_topic") || {}).value || "",
          count: Number((document.getElementById("ai_cnt") || {}).value || 5),
          kinds: kinds
        });
        _aiGenQs = d.questions || [];
        var out = document.getElementById("aiGenOut");
        if (out) {
          out.innerHTML = _aiGenQs.length
            ? '<div class="section-title">✨ سوال‌های ساخته‌شده (قبل از افزودن بررسی کنید)</div>' +
              _aiGenQs.map(function (q, i2) {
                return '<div class="card" style="padding:9px;">' +
                  '<label style="display:flex;gap:7px;align-items:flex-start;cursor:pointer;">' +
                    '<input type="checkbox" class="aiq" value="' + i2 + '" checked style="margin-top:2px;" />' +
                    '<span style="font-size:12.5px;"><b>' + esc(q.text) + '</b>' +
                    (q.qtype === "mcq"
                      ? '<div class="muted" style="font-size:11px;margin-top:3px;">' + q.options.map(function (o, oi) { return o ? (oi + 1) + ") " + esc(o) : ""; }).filter(Boolean).join(" | ") + ' — پاسخ: ' + (Number(q.answer) + 1) + '</div>'
                      : '<div class="muted" style="font-size:11px;margin-top:3px;">درست/نادرست — پاسخ: ' + (q.answer === "true" ? "درست" : "نادرست") + '</div>') +
                    '</span>' +
                  '</label></div>';
              }).join("") +
              '<button class="btn btn-emerald" style="width:100%;" onclick="aiGenAddAll()">➕ افزودن سوال‌های انتخاب‌شده به بانک</button>'
            : '<div class="muted">سوالی ساخته نشد.</div>';
        }
        showToast("✨ " + _aiGenQs.length + " سوال ساخته شد");
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function aiGenAddAll() {
      try {
        var picked = Array.prototype.filter.call(document.querySelectorAll(".aiq:checked"), function (x) { return true; });
        var idxs = Array.prototype.map.call(picked, function (x) { return Number(x.value); });
        if (!idxs.length) return showToast("هیچ سوالی انتخاب نشده است");
        var added = 0;
        for (var i2 = 0; i2 < idxs.length; i2++) {
          var q = _aiGenQs[idxs[i2]];
          if (!q) continue;
          await api("/api/ms/teacher/questions", {
            qtype: q.qtype, text: q.text, options: q.options, answer: q.answer,
            subject: (document.getElementById("ai_subj") || {}).value || "",
            chapter: (document.getElementById("ai_topic") || {}).value || "",
            createdBy: "هوش مصنوعی"
          });
          added++;
        }
        showToast("✅ " + added + " سوال به بانک اضافه شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function saveAiKey(prov) {
      try {
        var el = document.getElementById("aikey_" + prov);
        await api("/api/ms/super/ai-keys", { provider: prov, key: (el || {}).value || "" });
        showToast("✅ کلید ذخیره شد — معلمان اکنون می‌توانند این سرویس را انتخاب کنند");
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== 📝 آزمون خواندن (خلاصه + سوال AI) ====================
    var _readQuizState = null;

    function readBackBtn() {
      return '<button class="btn btn-ghost" style="width:100%;margin-top:10px;" onclick="goTab(' + Q + 'books' + Q + ')">↩️ بازگشت به کتاب‌خوانی</button>';
    }

    function withTimeout(promise, ms, msg) {
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error(msg)); }, ms);
        promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
      });
    }

    async function readQuizStart(pid) {
      var main = document.getElementById("mainView");
      if (!main) return;
      main.innerHTML = '<div class="card" style="text-align:center;padding:30px;">⏳ در حال آماده‌سازی آزمون... (معمولاً چند ثانیه)</div>';
      try {
        var pp = await withTimeout(api("/api/ms/student/read/passage?id=" + pid), 30000, "پاسخ سرور طول کشید");
        var z = await withTimeout(api("/api/ms/student/read/start", { passageId: pid }), 80000, "ساخت سوال‌ها طول کشید");
        _readQuizState = { passageId: pid, passage: pp.passage, questions: z.questions || [], total: z.total };
        var sQ = _readQuizState;
        main.innerHTML =
          '<div class="section-title">📖 ' + esc(sQ.passage.title) + '</div>' +
          '<div class="card">' +
            '<div class="muted" style="font-size:11px;margin-bottom:7px;">' + esc(sQ.passage.author || "") + (sQ.passage.translator ? ' — ترجمه: ' + esc(sQ.passage.translator) : '') + ' — ارسال‌کننده: ' + esc(sQ.passage.addedBy || "") + '</div>' +
            '<div style="font-size:13px;line-height:2.1;background:rgba(148,163,184,0.08);padding:11px;border-radius:10px;max-height:240px;overflow:auto;">' + esc(sQ.passage.passage) + '</div>' +
          '</div>' +
          '<div class="section-title">📝 سوال‌ها (' + sQ.total + ')</div>' +
          sQ.questions.map(function (q, i2) {
            return '<div class="card">' +
              '<b style="font-size:13px;">' + (i2 + 1) + ') ' + esc(q.text) + '</b>' +
              '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">' +
                q.options.map(function (o, oi) {
                  return '<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;cursor:pointer;background:rgba(148,163,184,0.08);padding:8px 10px;border-radius:9px;"><input type="radio" name="rq_' + i2 + '" value="' + oi + '" />' + esc(o) + '</label>';
                }).join("") +
              '</div>' +
            '</div>';
          }).join("") +
          '<button class="btn btn-emerald" style="width:100%;" onclick="readQuizSubmit()">📤 ثبت پاسخ‌ها</button>' +
          readBackBtn();
      } catch (e) {
        main.innerHTML = '<div class="card" style="text-align:center;padding:22px;">❌ ' + esc(e.message) +
          '<div class="muted" style="font-size:11.5px;margin-top:6px;">ممکن است سرویس هوش مصنوعی لحظه‌ای شلوغ باشد.</div>' +
          '<button class="btn btn-gold" style="margin-top:10px;" onclick="readQuizStart(' + pid + ')">🔄 تلاش مجدد</button>' +
          '</div>' + readBackBtn();
      }
    }

    async function readQuizSubmit() {
      try {
        var sQ = _readQuizState;
        if (!sQ) return;
        var answers = [];
        for (var i2 = 0; i2 < sQ.questions.length; i2++) {
          var sel = null;
          try { sel = document.querySelector('input[name="rq_' + i2 + '"]:checked'); } catch (e) {}
          answers.push(sel ? Number(sel.value) : -1);
        }
        if (answers.indexOf(-1) >= 0 && !confirm("به همه‌ی سوال‌ها پاسخ نداده‌ای؛ با این حال ثبت شود؟")) return;
        var r = await api("/api/ms/student/read/submit", { passageId: sQ.passageId, answers: answers });
        var main = document.getElementById("mainView");
        if (!main) return;
        var pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
        main.innerHTML =
          '<div class="card" style="text-align:center;padding:24px;">' +
            '<div style="font-size:46px;">' + (pct >= 75 ? "🏆" : pct >= 50 ? "👏" : "📚") + '</div>' +
            '<div class="stat-num" style="font-size:36px;margin-top:6px;">' + r.score + ' <span style="font-size:17px;color:var(--text-muted);">از ' + r.total + '</span></div>' +
            '<div class="muted">امتیاز خواندن شما</div>' +
          '</div>' +
          '<div class="section-title">📝 بررسی پاسخ‌ها</div>' +
          (r.review || []).map(function (q, i2) {
            return '<div class="card" style="border-right:4px solid ' + (q.isCorrect ? "#10B981" : "#EF4444") + ';">' +
              '<b style="font-size:12.5px;">' + (i2 + 1) + ') ' + esc(q.text) + '</b>' +
              '<div style="font-size:11.5px;margin-top:5px;">پاسخ شما: ' + (q.chosen >= 0 ? esc(q.options[q.chosen] || "") : "بدون پاسخ") + (q.isCorrect ? " ✅" : " ❌") + '</div>' +
              (q.isCorrect ? "" : '<div style="font-size:11.5px;margin-top:3px;color:#6EE7B7;">پاسخ درست: ' + esc(q.options[q.answer] || "") + '</div>') +
            '</div>';
          }).join("") +
          readBackBtn();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function readPassageAdd() {
      try {
        await api("/api/ms/teacher/read/add", {
          title: document.getElementById("rq_title").value.trim(),
          author: document.getElementById("rq_author").value.trim(),
          translator: (document.getElementById("rq_translator") || {}).value ? document.getElementById("rq_translator").value.trim() : "",
          passage: document.getElementById("rq_text").value.trim()
        });
        showToast("📖 خلاصه ثبت شد و به دانش‌آموزان اطلاع داده شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function readPassageDelete(id) {
      if (!confirm("این خلاصه و آزمون‌هایش حذف شود؟")) return;
      try { await api("/api/ms/teacher/read/delete", { id: id }); showToast("🗑 حذف شد"); renderApp(); } catch (e) { showToast("❌ " + e.message); }
    }

    async function readAiBook() {
      var out = document.getElementById("aiBookOut");
      if (out) out.innerHTML = '<div class="muted" style="text-align:center;padding:12px;">⏳ هوش مصنوعی در حال انتخاب یک کتاب و نوشتن خلاصه...</div>';
      try {
        var r = await withTimeout(api("/api/ms/student/read/ai-book", {}), 110000, "معرفی کتاب طول کشید");
        var b = r.book || {};
        if (out) {
          out.innerHTML =
            '<div style="background:rgba(2,6,23,0.25);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:11px;">' +
              '<div style="font-size:15px;font-weight:900;">📕 ' + esc(b.title || "") + '</div>' +
              '<div class="muted" style="font-size:11.5px;margin-top:3px;">✍️ مؤلف: ' + esc(b.author || "") + (b.translator ? ' &nbsp;|&nbsp; 🖊 ترجمه: ' + esc(b.translator) : "") + '</div>' +
              '<div style="font-size:12.5px;line-height:2;margin-top:8px;max-height:260px;overflow:auto;background:rgba(148,163,184,0.08);padding:10px;border-radius:9px;">' + esc(b.passage || "") + '</div>' +
              '<div class="muted" style="font-size:10px;margin-top:6px;">✨ معرفی و خلاصه توسط هوش مصنوعی ساخته شده است' + (r.isNew ? " — به فهرست کلاس هم اضافه شد" : "") + '</div>' +
              '<button class="btn btn-emerald" style="width:100%;margin-top:9px;" onclick="readQuizStart(' + b.id + ')">📝 آزمون خواندن این کتاب</button>' +
              '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px;" onclick="readAiBook()">📚 کتاب بعدی را معرفی کن</button>' +
            '</div>';
        }
      } catch (e) {
        if (out) out.innerHTML = '<div class="muted" style="text-align:center;padding:10px;">❌ ' + esc(e.message) + '<button class="btn btn-gold btn-sm" style="margin-top:8px;width:100%;" onclick="readAiBook()">🔄 تلاش مجدد</button></div>';
      }
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
                (s.audio ? '<audio src="' + s.audio + '" controls style="width:100%;height:40px;margin:6px 0;"></audio>' : '') +
                '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">' +
                  '<input id="revScore_' + s.submissionId + '" class="input" type="text" inputmode="decimal" dir="ltr" placeholder="نمره / امتیاز⭐" style="width:95px;margin:0;" value="' + (s.score !== null ? s.score : "") + '" />' +
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

    function normDigitsC(v) {
      return String(v == null ? "" : v).replace(/[\u06F0-\u06F9]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48); }).replace(/[\u0660-\u0669]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48); }).replace(/\u066B/g, ".").trim();
    }

    async function saveReview(submissionId) {
      try {
        var rawScore = normDigitsC((document.getElementById("revScore_" + submissionId) || {}).value);
        if (!rawScore) return showToast("نمره را وارد کنید");
        var score = Number(rawScore);
        if (!isFinite(score)) return showToast("نمره نامعتبر است");
        var asgSelEl = document.getElementById("asgSel_" + submissionId);
        var rv = await api("/api/ms/teacher/review", {
          submissionId: submissionId,
          score: score,
          feedback: document.getElementById("revFb_" + submissionId).value.trim(),
          assignStudentId: asgSelEl ? Number(asgSelEl.value || 0) : 0
        });
        var pa = Number(rv && typeof rv.pointsAdded === "number" ? rv.pointsAdded : 0);
        showToast("✅ نمره و بازخورد ثبت شد." + (pa > 0 ? " ⭐ +" + pa + " به مجموع امتیازات اضافه شد" : pa < 0 ? " ⭐ " + pa + " امتیاز (تعدیل نمره قبلی)" : ""));
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
    var labToolState = { tool: "", result: null, science: { topic: "", step: 0, log: [] }, eng: [], engEnded: false, dict: { mode: "", passage: "", typed: "", checked: false, diffHtml: "" }, sim: null };
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
      labToolState = { tool: tool, result: null, science: { topic: "", step: 0, log: [] }, eng: [], engEnded: false, dict: { mode: "", passage: "", typed: "", checked: false, diffHtml: "" }, sim: null };
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
      if (t === "english") return renderEnglishLab(main, meta);
      if (t === "dictation") return renderDictationLab(main, meta);
      if (t === "science") return renderScienceLab(main, meta);
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

    // ==================== 🔊 پخش صدا (TTS رایگان) ====================
    function playClips(clips) {
      return new Promise(function (resolve) {
        var i = 0;
        function next() {
          if (i >= clips.length) return resolve();
          try {
            var a = new Audio(clips[i++]);
            a.onended = next;
            a.onerror = next;
            a.play().catch(next);
          } catch (e) { resolve(); }
        }
        next();
      });
    }
    var ttsCache = {};
    async function speakText(text, lang) {
      var key = (lang || "fa") + "|" + text;
      if (ttsCache[key] && ttsCache[key].length) return ttsCache[key];
      var r = await api("/api/ms/edu/tts", { text: text, lang: lang || "fa" });
      var clips = (r && r.clips) || [];
      if (clips.length) { ttsCache[key] = clips; return clips; }
      throw new Error("صدا ساخته نشد");
    }
    async function speakNow(text, lang) {
      if (!text) return;
      try {
        var clips = await speakText(text, lang);
        await playClips(clips);
      } catch (e) {
        try {
          if (window.speechSynthesis) {
            var u = new SpeechSynthesisUtterance(text);
            u.lang = (lang === "en") ? "en-US" : "fa-IR";
            window.speechSynthesis.speak(u);
            return;
          }
        } catch (e2) {}
        showToast("پخش صدا در دسترس نیست");
      }
    }

    // ==================== 🎤 ضبط صوت عمومی ====================
    var gRec = null;
    var gRecChunks = [];
    function startVoiceInput(cb) {
      if (gRec && gRec.state === "recording") { try { gRec.stop(); } catch (e) {} return; }
      if (typeof MediaRecorder === "undefined") return showToast("ضبط صدا در این دستگاه پشتیبانی نمی‌شود");
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        gRecChunks = [];
        var mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
        gRec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : undefined);
        gRec.ondataavailable = function (e) { if (e.data && e.data.size) gRecChunks.push(e.data); };
        gRec.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          gRec = null;
          var blob = new Blob(gRecChunks, { type: "audio/webm" });
          if (!blob.size) return;
          if (blob.size > 1400000) return showToast("صدای ضبط‌شده خیلی طولانی است (حداکثر ۹۰ ثانیه)");
          showToast("⏳ در حال تبدیل صدا به متن...");
          var reader = new FileReader();
          reader.onload = function () {
            var dataUrl = String(reader.result || "");
            api("/api/ms/edu/ai/voice", { audio: dataUrl }).then(function (r) {
              cb(r.text || "", dataUrl);
            }).catch(function (e) { showToast("❌ " + e.message); });
          };
          reader.readAsDataURL(blob);
        };
        gRec.start();
        showToast("🔴 در حال ضبط... (برای پایان، دوباره بزنید)");
      }).catch(function () { showToast("دسترسی به میکروفون داده نشد"); });
    }

    // ==================== 🎧 مکالمه انگلیسی صوتی (دوطرفه) ====================
    function renderEnglishLab(main, meta) {
      var msgs = labToolState.eng || [];
      var head = '<div class="section-title">' + meta.icon + ' ' + esc(meta.title) + ' — مربی صوتی</div>';
      var bubbles = msgs.map(function (m, mi) {
        if (m.who === "user") {
          return '<div style="display:flex;justify-content:flex-end;margin:8px 0;">' +
            '<div style="max-width:84%;background:rgba(59,130,246,0.16);border:1px solid rgba(59,130,246,0.35);border-radius:14px 14px 4px 14px;padding:9px 12px;">' +
              (m.audio ? '<button class="btn btn-ghost btn-sm" style="padding:4px 9px;margin-bottom:5px;" onclick="playEngUserAudio(' + mi + ')">▶️ پیام صوتی شما</button>' : "") +
              '<div style="font-size:13.5px;">' + esc(m.text) + '</div>' +
            '</div></div>';
        }
        return '<div style="display:flex;justify-content:flex-start;margin:8px 0;">' +
          '<div style="max-width:88%;background:var(--surface-2);border:1px solid var(--border);border-radius:14px 14px 14px 4px;padding:9px 12px;">' +
            '<div style="font-size:13.5px;font-weight:600;">🤖 ' + esc(m.text) + '</div>' +
            '<div style="margin-top:6px;">' +
              '<button class="btn btn-gold btn-sm" style="padding:4px 9px;" onclick="playEngAiAudio(' + mi + ')">🔊 گوش دادن</button>' +
            '</div>' +
            (m.fa ? '<div class="muted" style="font-size:11.5px;margin-top:5px;">🇮🇷 ' + esc(m.fa) + '</div>' : "") +
            (m.fix ? '<div class="muted" style="font-size:11.5px;margin-top:3px;">✏️ ' + esc(m.fix) + '</div>' : "") +
          '</div></div>';
      }).join("");
      var userTurns = msgs.filter(function (m) { return m.who === "user"; }).length;
      var words = 0;
      msgs.forEach(function (m) { if (m.who === "user") words += (m.text.split(/\s+/).filter(Boolean)).length; });
      var inputHtml = labToolState.engEnded
        ? '<div class="card" style="text-align:center;border:1px solid rgba(16,185,129,0.45);">' +
            '<div style="font-size:15px;font-weight:800;">🏁 مکالمه به پایان رسید</div>' +
            '<div class="muted" style="margin-top:6px;">نوبت‌های شما: <b>' + userTurns + '</b> • کلمات انگلیسی تمرین‌شده: <b>' + words + '</b></div>' +
            (session.role === "student" ? '<button class="btn btn-emerald" style="margin-top:9px;" onclick="submitLabReport()">📤 ارسال گزارش به معلم</button> ' : "") +
            '<button class="btn btn-ghost" style="margin-top:9px;" onclick="restartEngConversation()">🔄 شروع مکالمه جدید</button>' +
          '</div>'
        : '<div class="card">' +
            '<textarea id="engText" class="input" rows="2" placeholder="به انگلیسی بنویسید... (مثلاً: Hello! How are you?)"></textarea>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
              '<button class="btn btn-emerald" onclick="sendEngTurnBtn()">📤 ارسال</button>' +
              '<button class="btn btn-gold" onclick="toggleEngVoice()">🎤 گفتن با صدا</button>' +
              '<button class="btn btn-rose" onclick="endEngConversation()">⏹ پایان مکالمه</button>' +
            '</div>' +
            '<div class="muted" id="micState" style="font-size:11px;margin-top:5px;">💡 هر وقت خواستید، مکالمه را با «⏹ پایان مکالمه» تمام کنید.</div>' +
          '</div>';
      main.innerHTML = head +
        '<div class="card" style="padding:8px 10px;">' +
          (msgs.length ? bubbles : '<div class="muted" style="text-align:center;padding:12px 0;">💬 برای شروع مکالمه، به انگلیسی بنویسید یا 🎤 را بزنید و صحبت کنید.</div>') +
        '</div>' +
        inputHtml +
        '<div style="text-align:center;margin:12px 0;">' +
          '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'lab\';renderApp()">🔙 بازگشت به کارگاه</button>' +
        '</div>';
    }
    function sendEngTurnBtn() {
      var el = document.getElementById("engText");
      var txt = ((el && el.value) || "").trim();
      if (!txt) return showToast("متن را بنویسید یا با 🎤 صحبت کنید");
      if (el) el.value = "";
      sendEngTurn(txt, "");
    }
    async function sendEngTurn(text, voiceDataUrl) {
      if (labToolState.engEnded) return showToast("مکالمه تمام شده — «شروع مکالمه جدید» را بزنید");
      if (!text || !text.trim()) return showToast("متنی دریافت نشد؛ دوباره تلاش کنید");
      var history = labToolState.eng.map(function (m) { return (m.who === "user" ? "Student: " : "Tutor: ") + m.text; });
      labToolState.eng.push({ who: "user", text: text.trim(), audio: voiceDataUrl || "", fa: "", fix: "", clips: [] });
      renderApp();
      showToast("⏳ مربی در حال آماده کردن پاسخ...");
      try {
        var r = await api("/api/ms/edu/ai", { tool: "english", text: text.trim(), history: history });
        var res = r.result || {};
        var msg = { who: "ai", text: res.englishReply || res.reply || "Nice! Tell me more.", fa: res.persianMeaning || "", fix: res.correctionFa || "", clips: [] };
        labToolState.eng.push(msg);
        renderApp();
        try {
          var clips = await speakText(msg.text, "en");
          msg.clips = clips;
          playClips(clips);
        } catch (e) {}
      } catch (e) { showToast("❌ " + e.message); }
    }
    async function playEngAiAudio(mi) {
      var m = labToolState.eng[mi];
      if (!m) return;
      try {
        var clips = await speakText(m.text, "en");
        m.clips = clips;
        playClips(clips);
      } catch (e) { speakNow(m.text, "en"); }
    }
    function playEngUserAudio(mi) {
      var m = labToolState.eng[mi];
      if (m && m.audio) { try { var a = new Audio(m.audio); a.play().catch(function () {}); } catch (e) {} }
    }
    function toggleEngVoice() {
      if (labToolState.engEnded) return showToast("مکالمه تمام شده است");
      startVoiceInput(function (text, dataUrl) { sendEngTurn(text, dataUrl); });
    }
    function endEngConversation() {
      labToolState.engEnded = true;
      renderApp();
      showToast("✅ مکالمه به پایان رسید — آفرین!");
    }
    function restartEngConversation() {
      labToolState.eng = [];
      labToolState.engEnded = false;
      renderApp();
    }

    // ==================== 🎙 دیکته هوشمند صوتی ====================
    function renderDictationLab(main, meta) {
      var st = labToolState.dict;
      var head = '<div class="section-title">' + meta.icon + ' ' + esc(meta.title) + '</div>';
      if (!st.mode) {
        main.innerHTML = head +
          '<div class="card">' +
            '<div class="muted" style="margin-top:0;">یکی از دو روش را انتخاب کنید:</div>' +
            '<button class="btn btn-gold" onclick="dictSetMode(\'voice\')">🎙 دیکته صوتی با هوش مصنوعی</button>' +
            '<button class="btn btn-ghost" onclick="dictSetMode(\'check\')">✍️ بررسی دیکته‌ای که نوشته‌ام</button>' +
          '</div>' +
          '<div style="text-align:center;margin:12px 0;"><button class="btn btn-ghost btn-sm" onclick="activeTab=\'lab\';renderApp()">🔙 بازگشت به کارگاه</button></div>';
        return;
      }
      if (st.mode === "check") {
        main.innerHTML = head +
          '<div class="card">' + labToolForm("dictation") +
            '<button class="btn" onclick="runLabTool()">✨ اجرای هوشمند</button>' +
          '</div>' +
          '<div id="ltResult">' + (labToolState.result !== null ? renderLabResult(labToolState.result, "dictation") : "") + '</div>' +
          '<div style="text-align:center;margin:12px 0;"><button class="btn btn-ghost btn-sm" onclick="dictSetMode(\'\')">🔙 بازگشت</button></div>';
        return;
      }
      if (!st.passage) {
        main.innerHTML = head +
          '<div class="card">' +
            '<input id="ltTopic" class="input" placeholder="موضوع دیکته (اختیاری) — مثلاً: طبیعت، مدرسه..." />' +
            '<button class="btn btn-gold" onclick="dictMake()">✨ ساخت و پخش دیکته</button>' +
            '<div class="muted" style="font-size:11.5px;margin-top:6px;">صدای هوش مصنوعی متن دیکته را می‌خواند؛ شما گوش می‌دهید و تایپ می‌کنید.</div>' +
          '</div>' +
          '<div style="text-align:center;margin:12px 0;"><button class="btn btn-ghost btn-sm" onclick="dictSetMode(\'\')">🔙 بازگشت</button></div>';
        return;
      }
      var sents = dictSents();
      main.innerHTML = head +
        '<div class="card" style="border:1px solid rgba(245,158,11,0.45);">' +
          '<b>🔊 دیکته آماده است</b>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">' +
            '<button class="btn btn-gold btn-sm" onclick="dictPlayAll()">▶️ پخش همه</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="dictPlayAll()">🔁 پخش دوباره</button>' +
            sents.map(function (x, xi) { return '<button class="btn btn-ghost btn-sm" onclick="dictPlaySent(' + xi + ')">جمله ' + (xi + 1) + '</button>'; }).join("") +
          '</div>' +
          (st.checked
            ? '<div style="background:var(--surface-2);border-radius:10px;padding:8px 10px;"><b>📝 متن دیکته:</b><div style="white-space:pre-wrap;font-size:13px;margin-top:5px;">' + esc(st.passage) + '</div></div>'
            : '<div class="muted" style="font-size:11.5px;">متن دیکته پس از «بررسی» نمایش داده می‌شود.</div>') +
        '</div>' +
        '<div class="card">' +
          '<textarea id="ltOcr" class="input" rows="5" placeholder="دیکته را اینجا تایپ کنید...">' + esc(st.typed) + '</textarea>' +
          '<button class="btn btn-emerald" onclick="dictCheck()">✅ بررسی دیکته</button>' +
        '</div>' +
        (st.checked && labToolState.result !== null ? '<div id="ltResult">' + renderLabResult(labToolState.result, "dictation") + '</div>' : "") +
        (st.checked && st.diffHtml ? '<div class="card"><b>🔎 مقایسه‌ی کلمات</b><div style="margin-top:6px;line-height:2.2;">' + st.diffHtml + '</div></div>' : "") +
        '<div style="text-align:center;margin:12px 0;">' +
          (session.role === "student" && st.checked ? '<button class="btn btn-emerald btn-sm" onclick="submitLabReport()">📤 ارسال گزارش به معلم</button> ' : "") +
          '<button class="btn btn-ghost btn-sm" onclick="dictReset()">🔄 دیکته جدید</button>' +
        '</div>';
    }
    function dictSents() {
      var p = labToolState.dict.passage || "";
      return (p.match(/[^.!؟]+[.!؟]*/g) || [p]).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    function dictSetMode(m) {
      labToolState.dict = { mode: m, passage: "", typed: "", checked: false, diffHtml: "" };
      labToolState.result = null;
      renderApp();
    }
    async function dictMake() {
      var topic = ((document.getElementById("ltTopic") || {}).value) || "";
      showToast("⏳ در حال ساخت دیکته...");
      try {
        var r = await api("/api/ms/edu/ai", { tool: "dictation", mode: "play", topic: topic.trim() });
        var passage = (r.result && r.result.passage) || "";
        if (!passage) return showToast("دیکته ساخته نشد؛ دوباره تلاش کنید");
        labToolState.dict.passage = passage;
        renderApp();
        speakNow(passage, "fa");
      } catch (e) { showToast("❌ " + e.message); }
    }
    function dictPlayAll() { speakNow(labToolState.dict.passage || "", "fa"); }
    function dictPlaySent(i) { var s = dictSents()[i]; if (s) speakNow(s, "fa"); }
    function dictReset() {
      labToolState.dict = { mode: "voice", passage: "", typed: "", checked: false, diffHtml: "" };
      labToolState.result = null;
      renderApp();
    }
    async function dictCheck() {
      var typed = ((document.getElementById("ltOcr") || {}).value) || "";
      if (!typed.trim()) return showToast("ابتدا دیکته را تایپ کنید");
      labToolState.dict.typed = typed;
      showToast("⏳ در حال تصحیح...");
      try {
        var r = await api("/api/ms/edu/ai", { tool: "dictation", expected: labToolState.dict.passage, ocr: typed });
        labToolState.result = r.result;
        labToolState.dict.checked = true;
        labToolState.dict.diffHtml = dictDiffHtml(labToolState.dict.passage, typed);
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }
    function dictNorm(w) {
      return String(w || "")
        .replace(/[\u200c\u200d]/g, "")
        .replace(/[يئ]/g, "ی").replace(/ك/g, "ک").replace(/ة/g, "ه")
        .replace(/[\u064B-\u0652\u0640]/g, "")
        .replace(/[.!؟،,؛;:"'()«»]/g, "")
        .toLowerCase().trim();
    }
    function dictDiffHtml(expected, typed) {
      var ew = String(expected || "").split(/\s+/).filter(Boolean);
      var tw = String(typed || "").split(/\s+/).filter(Boolean);
      var used = {};
      var out = tw.map(function (w) {
        var nw = dictNorm(w);
        var j = -1;
        for (var k = 0; k < ew.length; k++) { if (!used[k] && dictNorm(ew[k]) === nw) { j = k; break; } }
        if (j >= 0) { used[j] = 1; return '<span style="color:#34D399;">✅ ' + esc(w) + '</span>'; }
        return '<span style="color:#F87171;">❌ ' + esc(w) + '</span>';
      });
      var missing = ew.filter(function (w, k) { return !used[k]; }).map(function (w) { return '<span style="color:#FBBF24;">➕ ' + esc(w) + '</span>'; });
      return out.join(" ") + (missing.length ? '<div style="margin-top:6px;">کلمات جاافتاده: ' + missing.join(" ") + '</div>' : "");
    }

    // ==================== 🧪 آزمایشگاه علوم — شبیه‌سازی تصویری ====================
    function renderScienceLab(main, meta) {
      var head = '<div class="section-title">' + meta.icon + ' ' + esc(meta.title) + ' — شبیه‌ساز تعاملی</div>';
      var sim = labToolState.sim;
      main.innerHTML = head +
        '<div class="card">' +
          '<input id="ltTopic" class="input" placeholder="موضوع آزمایش را بنویسید یا با 🎤 بگویید (مثلاً: آزمایش فشار هوا)" value="' + esc(labToolState.science.topic || "") + '" />' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button class="btn btn-emerald" onclick="runScienceSim()">🔬 شبیه‌سازی تصویری آزمایش</button>' +
            '<button class="btn btn-gold" onclick="scienceVoiceTopic()">🎤 گفتن موضوع با صدا</button>' +
            '<button class="btn btn-ghost" onclick="runLabTool()">🧭 راهنمای گام‌به‌گام</button>' +
          '</div>' +
          '<div class="muted" id="micState" style="font-size:11px;margin-top:5px;">💡 موضوع آزمایش را بگویید تا هوش مصنوعی آن را تصویری شبیه‌سازی کند.</div>' +
        '</div>' +
        (sim ? renderScienceSim(sim) : "") +
        '<div id="ltResult">' + (labToolState.result !== null ? renderLabResult(labToolState.result, "science") : "") + '</div>' +
        (session.role === "student" && (sim || labToolState.result !== null)
          ? '<div class="card" style="text-align:center;"><button class="btn btn-emerald" onclick="submitLabReport()">📤 ارسال گزارش به معلم (دریافت امتیاز پس از تایید)</button></div>'
          : "") +
        '<div style="text-align:center;margin:12px 0;"><button class="btn btn-ghost btn-sm" onclick="activeTab=\'lab\';renderApp()">🔙 بازگشت به کارگاه</button></div>';
    }
    function renderScienceSim(sim) {
      var svgHtml = sim.svg
        ? '<div style="background:#F8FAFC;border-radius:12px;padding:6px;overflow:hidden;">' + sanitizeSvg(sim.svg) + '</div>'
        : '<div class="muted">تصویر شبیه‌سازی ساخته نشد؛ مراحل و توضیحات زیر را بخوانید.</div>';
      return '<div class="card" style="border:1px solid rgba(59,130,246,0.45);">' +
          '<div style="font-size:15px;font-weight:800;">🧪 ' + esc(sim.title || "شبیه‌سازی آزمایش") + '</div>' +
          '<div style="margin:8px 0;">' + svgHtml + '</div>' +
          ((sim.steps || []).length
            ? '<div style="margin-top:8px;"><b>📋 مراحل آزمایش</b>' + sim.steps.map(function (x, i) {
                return '<div style="padding:7px 10px;margin-top:5px;background:var(--surface-2);border-radius:9px;font-size:12.5px;"><b>' + (i + 1) + '.</b> ' + esc(x) + '</div>';
              }).join("") + '</div>'
            : "") +
          (sim.explanation
            ? '<div style="margin-top:9px;"><b>📝 توضیح علمی</b><div style="white-space:pre-wrap;font-size:13px;margin-top:5px;">' + esc(sim.explanation) + '</div>' +
              '<button class="btn btn-gold btn-sm" style="margin-top:7px;" onclick="speakSimExplanation()">🔊 گوش دادن به توضیحات</button></div>'
            : "") +
        '</div>';
    }
    function sanitizeSvg(sv) {
      return String(sv || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
        .replace(/javascript:/gi, "");
    }
    function speakSimExplanation() {
      var sim = labToolState.sim;
      if (sim && sim.explanation) speakNow(sim.explanation, "fa");
    }
    async function runScienceSim() {
      var topic = ((document.getElementById("ltTopic") || {}).value) || labToolState.science.topic || "";
      if (!topic.trim()) return showToast("موضوع آزمایش را وارد کنید");
      labToolState.science.topic = topic.trim();
      showToast("⏳ در حال ساخت شبیه‌سازی تصویری...");
      try {
        var r = await api("/api/ms/edu/ai", { tool: "science", mode: "simulate", topic: topic.trim() });
        labToolState.sim = r.result || null;
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }
    function scienceVoiceTopic() {
      startVoiceInput(function (text) {
        var el = document.getElementById("ltTopic");
        if (el && text) el.value = text.trim();
        showToast("✅ موضوع ثبت شد — «شبیه‌سازی تصویری» را بزنید");
      });
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
        var basicFetch = await Promise.all([
          api("/api/ms/teacher/inbox"),
          api("/api/ms/teacher/assignments?classId=" + selClassId),
          api("/api/ms/teacher/muddy").catch(function () { return { muddy: [] }; }),
          api("/api/ms/teacher/class?classId=" + selClassId).catch(function () { return { roster: [] }; }),
        ]);
        var d = basicFetch[0];
        var asg = basicFetch[1];
        var muddy = basicFetch[2];
        var rdata = basicFetch[3] || { roster: [] };
        var subSections = "";
        var asgList = (asg.assignments || []).slice();
        asgList.push({ id: 0, title: "تکلیف آزاد ارسالی" });
        var subsAll = await Promise.all(asgList.map(function (aa) {
          return api("/api/ms/teacher/submissions?assignmentId=" + aa.id).catch(function () { return { submissions: [] }; });
        }));
        for (var ai = 0; ai < asgList.length; ai++) {
          var a = asgList[ai];
          var sd = subsAll[ai] || { submissions: [] };
          var rows = (sd.submissions || []).filter(function (x) { return x.submitted; }).sort(function (p2, q2) { return (p2.reviewed === q2.reviewed) ? 0 : (p2.reviewed ? 1 : -1); }).slice(0, 14);
          if (!rows.length) continue;
          subSections += rows.map(function (x) {
            return '<div class="card">' +
              '<b>👤 ' + esc(x.name) + '</b> — 📚 ' + esc(a.title) +
              (x.reviewed ? ' <span class="badge-pill" style="background:rgba(16,185,129,0.2);color:#6EE7B7;">تصحیح شد</span>' : ' <span class="badge-pill" style="background:rgba(245,158,11,0.2);color:#FCD34D;">در انتظار تصحیح</span>') +
              (x.text ? '<div style="margin:7px 0;padding:9px 11px;background:var(--surface-2);border-radius:11px;font-size:12.5px;">' + esc(x.text) + '</div>' : '') +
              (x.photo ? '<img src="' + x.photo + '" style="width:100%;max-height:220px;object-fit:contain;border-radius:11px;cursor:pointer;margin:6px 0;" onclick="viewPhoto(this.src)" />' : '') +
              (x.video ? '<video src="' + x.video + '" controls style="width:100%;max-height:220px;border-radius:11px;margin:6px 0;"></video>' : '') +
              (x.audio ? '<audio src="' + x.audio + '" controls style="width:100%;height:40px;margin:6px 0;"></audio>' : '') +
              (Number(x.studentId) === 0 ? '<div style="margin:8px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span class="muted" style="font-size:11.5px;">👤 این تکلیف به دانش‌آموزی وصل نیست — انتخاب کنید:</span><select id="asgSel_' + x.submissionId + '" class="input" style="flex:1;min-width:170px;margin:0;"><option value="0">— انتخاب دانش‌آموز —</option>' + (rdata.roster || []).map(function (rr) { return '<option value="' + rr.id + '">' + esc(rr.name) + '</option>'; }).join("") + '</select></div>' : '') +
              '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">' +
                '<input id="revScore_' + x.submissionId + '" class="input" type="text" inputmode="decimal" dir="ltr" placeholder="نمره / امتیاز⭐" style="width:95px;margin:0;" value="' + (x.score !== null ? x.score : "") + '" />' +
                '<input id="revFb_' + x.submissionId + '" class="input" placeholder="بازخورد..." style="flex:1;min-width:140px;margin:0;" value="' + esc(x.feedback) + '" />' +
                '<button class="btn btn-emerald btn-sm" onclick="saveReview(' + x.submissionId + ')">✅ ثبت نمره + امتیاز</button>' +
              '</div>' + fbPresetsHtml("revFb_" + x.submissionId) + '</div>';
          }).join("");
        }
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
                '<input id="pts_mission_' + m.id + '" class="input" type="text" inputmode="decimal" dir="ltr" placeholder="⭐" style="width:80px;margin:0;" value="5" />' +
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
                '<input id="pts_lab_' + l.id + '" class="input" type="text" inputmode="decimal" dir="ltr" placeholder="⭐" style="width:80px;margin:0;" value="10" />' +
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
        var pts = Number(normDigitsC((document.getElementById("pts_" + kind + "_" + id) || {}).value) || 0);
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
                '<button class="menu-item" onclick="goTab(\'qbank\')"><span>🗄</span>بانک سوال</button>' +
                '<button class="menu-item" onclick="goTab(\'exams\')"><span>📝</span>آزمون‌ها</button>' +
                '<button class="menu-item" onclick="goTab(\'booksm\')"><span>📚</span>چالش کتاب‌خوانی</button>' +
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
          '<div class="section-title">⭐ امتیاز دانش‌آموزان</div>' +
          '<div class="card">' +
            ((d.roster || []).length
              ? d.roster.slice().sort(function (a, b) { return Number(b.points || 0) - Number(a.points || 0); }).map(function (x, xi) {
                  var pts = Number(x.points || 0);
                  var rankIco = ["🥇", "🥈", "🥉"][xi] || ((xi + 1) + ".");
                  return '<div style="display:flex;align-items:center;gap:5px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">' +
                    '<b style="flex:1;min-width:80px;">' + rankIco + ' ' + esc(x.name) + '</b>' +
                    '<span class="badge-pill" style="background:rgba(245,158,11,0.18);color:#FCD34D;">⭐ ' + pts + '</span>' +
                    '<button class="btn btn-emerald btn-sm" style="padding:5px 9px;" onclick="setPoints(' + x.id + ', 1)">+۱</button>' +
                    '<button class="btn btn-emerald btn-sm" style="padding:5px 9px;" onclick="setPoints(' + x.id + ', 5)">+۵</button>' +
                    '<button class="btn btn-rose btn-sm" style="padding:5px 9px;" onclick="setPoints(' + x.id + ', -1)">−۱</button>' +
                    '<button class="btn btn-rose btn-sm" style="padding:5px 9px;" onclick="setPoints(' + x.id + ', -5)">−۵</button>' +
                    '<button class="btn btn-ghost btn-sm" style="padding:5px 9px;" onclick="setPointsCustom(' + x.id + ')">⚙️</button>' +
                  '</div>';
                }).join("")
              : '<div class="muted">دانش‌آموزی در کلاس نیست.</div>') +
            '<div class="muted" style="font-size:11px;margin-top:8px;">⚙️ برای مقدار دلخواه (مثلاً +۱۰ یا −۳) و دلیل امتیاز، دکمه‌ی ⚙️ کنار هر دانش‌آموز را بزنید.</div>' +
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

    async function setPoints(studentId, delta, reason) {
      try {
        await api("/api/ms/teacher/points", { studentId: studentId, delta: delta, reason: reason || "" });
        showToast((delta > 0 ? "⭐ +" + delta + " امتیاز ثبت شد" : "🔻 " + delta + " امتیاز ثبت شد") + " — 📲 در تلگرام دانش‌آموز هم اعمال شد");
        tcClass = null;
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    function setPointsCustom(studentId) {
      var v = prompt("مقدار امتیاز (مثلاً 10 یا -3):", "10");
      if (v === null) return;
      var n = Number(normDigitsC(v));
      if (!isFinite(n) || !n) return showToast("مقدار نامعتبر است");
      var r = prompt("دلیل امتیاز (اختیاری):", n > 0 ? "فعالیت عالی" : "کسر امتیاز");
      setPoints(studentId, n, r || "");
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
  <footer style="text-align:center;padding:10px 14px 14px;font-size:11px;color:#94A3B8;">© سازنده: <b>نیما آزمکان</b> <span style="opacity:.6;">| نسخه‌ی ۳٫۳٫۴ب</span> — کلیه حقوق مادی و معنوی این سامانه (نرم‌افزار، طراحی، محتوا و برند) متعلق به ایشان است.</footer>
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
