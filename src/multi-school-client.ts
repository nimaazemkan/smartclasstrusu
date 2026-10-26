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
        if (res.status === 401 && session && path !== "/api/ms/login") {
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
    function renderLogin() {
      var nav = document.getElementById("bottomNav");
      nav.style.display = "none";
      var main = document.getElementById("mainView");
      var schoolBlock = "";
      if (loginRole !== "super") {
        if (!selSchool) {
          schoolBlock =
            '<div class="card" style="margin-bottom:12px;">' +
              '<div class="section-title">🔍 مدرسه‌ام را پیدا کن</div>' +
              '<p class="muted" style="margin-top:0;">کد ۴ رقمی مدرسه‌تان را وارد کنید (از مدیر مدرسه بگیرید) یا نام مدرسه را جستجو کنید:</p>' +
              '<div style="display:flex;gap:8px;">' +
                '<input id="fSchoolCode" class="input" type="tel" dir="ltr" placeholder="کد مدرسه (مثلاً 1024)" style="flex:1;" />' +
                '<button class="btn btn-emerald" style="width:auto;padding:10px 16px;" onclick="findSchool(true)">بررسی</button>' +
              '</div>' +
              '<div style="display:flex;gap:8px;margin-top:8px;">' +
                '<input id="fSchoolQ" class="input" placeholder="یا نام مدرسه را بنویسید..." style="flex:1;" />' +
                '<button class="btn btn-ghost" style="width:auto;padding:10px 16px;" onclick="findSchool(false)">🔎 جستجو</button>' +
              '</div>' +
              (schoolResults.length
                ? '<div style="margin-top:10px;">' + schoolResults.map(function (s) {
                    return '<button class="card" style="width:100%;text-align:right;cursor:pointer;margin-bottom:8px;padding:12px;" onclick="pickSchool(\'' + esc(s.code) + '\',\'' + esc(s.name) + '\',\'' + esc(s.city) + '\')">' +
                      '<div style="font-weight:800;">🏫 ' + esc(s.name) + (s.usable ? '' : ' <span class="badge-pill" style="background:rgba(244,63,94,0.2);color:#FDA4AF;">غیرفعال</span>') + '</div>' +
                      '<div class="muted" style="font-size:12px;">' + esc(s.city || "") + ' • کد: ' + esc(s.code) + '</div>' +
                    '</button>';
                  }).join("") + '</div>'
                : "")
            + '</div>';
        } else {
          schoolBlock =
            '<div class="card" style="margin-bottom:12px;border-color:rgba(16,185,129,0.5);">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
                '<div>' +
                  '<div style="font-weight:800;color:#6EE7B7;">🏫 ' + esc(selSchool.name) + '</div>' +
                  '<div class="muted" style="font-size:12px;">' + esc(selSchool.city || "") + ' • کد مدرسه: ' + esc(selSchool.code) + '</div>' +
                '</div>' +
                '<button class="btn btn-ghost btn-sm" onclick="clearSchool()">تغییر مدرسه</button>' +
              '</div>' +
            '</div>';
        }
      }

      var credBlock = "";
      if (loginRole === "student") {
        credBlock =
          '<input id="msCode" class="input" type="tel" dir="ltr" placeholder="کد دانش‌آموزی ۶ رقمی" />' +
          '<input id="msPin" class="input" type="password" dir="ltr" placeholder="رمز عبور (پیش‌فرض: 1234)" />' +
          '<button class="btn" onclick="submitLogin()">🚀 ورود به میز کار دانش‌آموز</button>';
      } else if (loginRole === "parent") {
        credBlock =
          '<input id="msCode" class="input" type="tel" dir="ltr" placeholder="کد اختصاصی والدین" />' +
          '<button class="btn btn-gold" onclick="submitLogin()">👪 ورود به پنل اولیا</button>';
      } else if (loginRole === "teacher") {
        credBlock =
          '<input id="msUser" class="input" dir="ltr" placeholder="نام کاربری معلم" />' +
          '<input id="msPass" class="input" type="password" dir="ltr" placeholder="رمز معلم" />' +
          '<button class="btn" onclick="submitLogin()">👨‍🏫 ورود به پنل معلم</button>';
      } else if (loginRole === "admin") {
        credBlock =
          '<input id="msUser" class="input" dir="ltr" placeholder="نام کاربری مدیر مدرسه" />' +
          '<input id="msPass" class="input" type="password" dir="ltr" placeholder="رمز مدیر مدرسه" />' +
          '<button class="btn btn-emerald" onclick="submitLogin()">🏫 ورود به پنل مدیر مدرسه</button>';
      } else if (loginRole === "super") {
        credBlock =
          '<input id="msPass" class="input" type="password" dir="ltr" placeholder="رمز مدیر ارشد سامانه" />' +
          '<button class="btn btn-gold" onclick="submitLogin()">👑 ورود به پنل مدیر ارشد</button>';
      }

      main.innerHTML =
        '<div class="hero">' +
          '<div class="hero-icon">🏫</div>' +
          '<h1>شبکه مدارس هوشمند</h1>' +
          '<p>سامانه یکپارچه آموزشی برای تمام مدارس ایران<br/>کلاس آنلاین، تکالیف، حضوروغیاب و کارنامه — ۱۰۰٪ رایگان</p>' +
        '</div>' +
        '<div class="card">' +
          '<div class="role-tabs">' +
            '<button class="role-tab ' + (loginRole === "student" ? "active" : "") + '" onclick="setLoginRole(\'student\')">🎒 دانش‌آموز</button>' +
            '<button class="role-tab ' + (loginRole === "parent" ? "active" : "") + '" onclick="setLoginRole(\'parent\')">👪 والدین</button>' +
            '<button class="role-tab ' + (loginRole === "teacher" ? "active" : "") + '" onclick="setLoginRole(\'teacher\')">👨‍🏫 معلم</button>' +
            '<button class="role-tab ' + (loginRole === "admin" ? "active" : "") + '" onclick="setLoginRole(\'admin\')">🏫 مدیر مدرسه</button>' +
            '<button class="role-tab ' + (loginRole === "super" ? "active" : "") + '" onclick="setLoginRole(\'super\')">👑 مدیر ارشد</button>' +
          '</div>' +
          schoolBlock +
          credBlock +
          '<div style="text-align:center;margin-top:14px;">' +
            '<a href="/app" class="btn btn-ghost btn-sm" style="text-decoration:none;">🎓 کلاس هوشمند استاد آزمکان (نسخه کلاس خصوصی)</a>' +
          '</div>' +
        '</div>';
    }

    function setLoginRole(r) {
      loginRole = r;
      selSchool = null;
      schoolResults = [];
      renderLogin();
    }

    async function findSchool(byCode) {
      try {
        var code = byCode ? normDigits(document.getElementById("fSchoolCode").value) : "";
        var q = byCode ? "" : (document.getElementById("fSchoolQ").value || "").trim();
        if (byCode && !code) return showToast("کد مدرسه را وارد کنید");
        if (!byCode && q.length < 2) return showToast("حداقل ۲ حرف از نام مدرسه را بنویسید");
        var d = await api("/api/ms/schools/find?code=" + encodeURIComponent(code) + "&q=" + encodeURIComponent(q));
        schoolResults = d.schools || [];
        if (schoolResults.length === 0) {
          showToast("مدرسه‌ای پیدا نشد؛ کد را بررسی کنید یا با مدیر مدرسه تماس بگیرید.");
        }
        renderLogin();
      } catch (e) { showToast("❌ " + e.message); }
    }

    function pickSchool(code, name, city) {
      selSchool = { code: code, name: name, city: city };
      schoolResults = [];
      renderLogin();
    }

    function clearSchool() {
      selSchool = null;
      renderLogin();
    }

    async function submitLogin() {
      try {
        var body = { role: loginRole };
        if (loginRole !== "super") {
          if (!selSchool) return showToast("ابتدا مدرسه خود را پیدا کنید.");
          body.schoolCode = selSchool.code;
        }
        if (loginRole === "student") {
          body.code = normDigits(document.getElementById("msCode").value);
          body.pin = normDigits(document.getElementById("msPin").value);
          if (!body.code) return showToast("کد دانش‌آموزی را وارد کنید");
        } else if (loginRole === "parent") {
          body.code = normDigits(document.getElementById("msCode").value);
          if (!body.code) return showToast("کد والدین را وارد کنید");
        } else if (loginRole === "teacher" || loginRole === "admin") {
          body.username = (document.getElementById("msUser").value || "").trim();
          body.password = document.getElementById("msPass").value;
          if (!body.username || !body.password) return showToast("نام کاربری و رمز را وارد کنید");
        } else if (loginRole === "super") {
          body.password = document.getElementById("msPass").value;
          if (!body.password) return showToast("رمز مدیر ارشد را وارد کنید");
        }
        var r = await api("/api/ms/login", body);
        session = r.session;
        localStorage.setItem("ms_session", JSON.stringify(session));
        msData = null;
        activeTab = "home";
        showToast("خوش آمدید " + (session.name || "") + " 🌟");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== مسیریاب اصلی ====================
    var NAVS = {
      student: [
        { id: "home", icon: "🏠", label: "خانه" },
        { id: "live", icon: "🎥", label: "کلاس آنلاین" },
        { id: "report", icon: "📊", label: "کارنامه من" },
        { id: "announce", icon: "📢", label: "اطلاعیه‌ها" }
      ],
      parent: [
        { id: "home", icon: "🏠", label: "خانه" },
        { id: "report", icon: "📊", label: "کارنامه فرزندم" },
        { id: "announce", icon: "📢", label: "اطلاعیه‌ها" }
      ],
      teacher: [
        { id: "home", icon: "👥", label: "کلاس من" },
        { id: "att", icon: "✅", label: "حضورورغیاب" },
        { id: "grades", icon: "📝", label: "نمرات" },
        { id: "live", icon: "🎥", label: "کلاس آنلاین" },
        { id: "announce", icon: "📢", label: "اطلاعیه" }
      ],
      admin: [
        { id: "home", icon: "🏠", label: "داشبورد" },
        { id: "students", icon: "🎒", label: "دانش‌آموزان" },
        { id: "teachers", icon: "👨‍🏫", label: "معلمان" },
        { id: "classes", icon: "🏗", label: "کلاس‌ها" },
        { id: "reports", icon: "📊", label: "گزارش‌ها" }
      ],
      super: [
        { id: "home", icon: "🏠", label: "نمای کلی" },
        { id: "schools", icon: "🏫", label: "مدارس" },
        { id: "announce", icon: "📢", label: "اطلاعیه سراسری" }
      ]
    };

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
        window.LIVE_ROOM_KEY = myRoomKey();
        renderLiveClassroomPanel(main);
        return;
      }
      if (session.role === "student" || session.role === "parent") renderStudent(main);
      else if (session.role === "teacher") renderTeacher(main);
      else if (session.role === "admin") renderAdmin(main);
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
      if (session.role === "teacher") return selClassId ? "s" + session.schoolId + "c" + selClassId : "";
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
              '<div class="stat-card"><div class="stat-ico">📅</div><div class="stat-num">' + (d.attendance.pct) + '%</div><div class="stat-label">حضور در کلاس‌ها</div></div>' +
              '<div class="stat-card"><div class="stat-ico">🏅</div><div class="stat-num">' + d.points.total + '</div><div class="stat-label">امتیاز رفتاری</div></div>' +
              '<div class="stat-card"><div class="stat-ico">✅</div><div class="stat-num">' + d.attendance.present + '</div><div class="stat-label">حاضر</div></div>' +
              '<div class="stat-card"><div class="stat-ico">❌</div><div class="stat-num">' + d.attendance.absent + '</div><div class="stat-label">غایب</div></div>' +
            '</div>' +
            '<div class="section-title">📚 درس‌های من</div>' +
            '<div class="stat-grid">' + subjHtml + '</div>' +
            (session.role === "student"
              ? '<div class="card" style="margin-top:12px;">' +
                  '<div class="section-title">🔑 کدهای اختصاصی من</div>' +
                  '<div class="muted">کد دانش‌آموزی: <b dir="ltr">' + esc(d.student.studentCode) + '</b> • رمز: <b dir="ltr">' + esc(d.student.pin) + '</b><br/>کد والدین: <b dir="ltr">' + esc(d.student.parentCode) + '</b></div>' +
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
      if (!selClassId || !msData.classes.some(function (c) { return c.id === selClassId; })) {
        selClassId = msData.classes[0].id;
        localStorage.setItem("ms_class", String(selClassId));
      }
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

    async function ensureTcClass() {
      if (!tcClass) {
        tcClass = await api("/api/ms/teacher/class?classId=" + selClassId);
      }
      return tcClass;
    }

    async function renderTeacher(main) {
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال دریافت اطلاعات...</div>';
      try {
        if (!msData) await ensureHome();
        if (!msData.classes || !msData.classes.length) {
          main.innerHTML = classSwitcherHtml();
          return;
        }
        if (activeTab === "home") {
          var d = await ensureTcClass();
          main.innerHTML =
            classSwitcherHtml() +
            '<div class="section-title">👥 دانش‌آموزان کلاس ' + esc(d.class.label) + '</div>' +
            '<div class="card"><table class="table"><thead><tr><th>#</th><th>نام</th><th>امروز</th></tr></thead><tbody>' +
            (d.roster || []).map(function (s, i) {
              var st = s.todayStatus === "present" ? '✅' : (s.todayStatus === "absent" ? '❌' : (s.todayStatus === "late" ? '⏰' : '—'));
              return '<tr><td>' + (i + 1) + '</td><td>' + esc(s.name) + '</td><td>' + st + '</td></tr>';
            }).join("") +
            '</tbody></table></div>' +
            '<div class="card" style="margin-top:10px;">' +
              '<div class="section-title">⚡ دسترسی سریع</div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
                '<button class="btn btn-emerald btn-sm" onclick="goTab(\'att\')">✅ حضور و غیاب امروز</button>' +
                '<button class="btn btn-sm" onclick="goTab(\'grades\')">📝 ثبت نمره</button>' +
                '<button class="btn btn-ghost btn-sm" onclick="goTab(\'live\')">🎥 شروع کلاس آنلاین</button>' +
              '</div>' +
            '</div>';
        } else if (activeTab === "att") {
          var d2 = await ensureTcClass();
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
        } else if (activeTab === "announce") {
          renderAnnounceForm(main);
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
        if (activeTab === "home") {
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
              '<div class="section-title">⚡ دسترسی سریع</div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
                '<button class="btn btn-sm" onclick="goTab(\'students\')">🎒 ثبت‌نام دانش‌آموز</button>' +
                '<button class="btn btn-sm" onclick="goTab(\'teachers\')">👨‍🏫 تعریف معلم</button>' +
                '<button class="btn btn-sm" onclick="goTab(\'classes\')">🏗 ساخت کلاس</button>' +
                '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'settings\';renderApp()">⚙️ تنظیمات مدرسه</button>' +
                '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'announce\';renderApp()">📢 ارسال اطلاعیه</button>' +
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
              '<select id="nsClass" class="input">' +
                adminAll.classes.map(function (c2) {
                  return '<option value="' + c2.id + '">' + esc(c2.label) + '</option>';
                }).join("") +
              '</select>' +
              '<button class="btn btn-emerald" onclick="addStudent()">➕ ثبت و دریافت کدها</button>' +
            '</div>' +
            '<div class="card" style="margin-top:10px;">' +
              '<div class="section-title">📥 ثبت‌نام گروهی (اکسل/CSV)</div>' +
              '<p class="muted" style="margin-top:0;">هر سطر: <b>نام دانش‌آموز, نام کلاس</b> (مثلاً: <span dir="ltr">علی رضایی, هشتم-۲</span>)<br/>می‌توانید مستقیم از اکسل کپی و اینجا Paste کنید.</p>' +
              '<textarea id="bulkText" class="input" rows="6" placeholder="نام, کلاس"></textarea>' +
              '<button class="btn" onclick="bulkImport()">📥 ثبت گروهی و ساخت کدها</button>' +
              '<div id="bulkResults"></div>' +
            '</div>' +
            '<div class="card" style="margin-top:10px;"><table class="table"><thead><tr><th>نام</th><th>کلاس</th><th>کد دانش‌آموز</th><th>کد والدین</th><th></th></tr></thead><tbody id="studentsTbody">' +
            renderStudentsRows(adminAll.students) +
            '</tbody></table></div>';
        } else if (activeTab === "reports") {
          var r = await api("/api/ms/admin/reports");
          main.innerHTML =
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
              '<button class="btn btn-ghost btn-sm" onclick="activeTab=\'home\';renderApp()">🔙 بازگشت به داشبورد</button>' +
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
        var r = await api("/api/ms/admin/students", { name: name, classId: classId });
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
