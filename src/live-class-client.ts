// ============================================================================
// 🎨 رابط کاربری و موتور کلاینت کلاس مجازی زنده (وایت‌برد + PDF + WebRTC + نظرسنجی)
// طراحی‌شده بدون هیچگونه وابستگی خارجی فیلترشده — قابل اجرا در اندروید، آیفون و وب
// ============================================================================

export const LIVE_CLASS_CSS = `
  .live-pulse-banner {
    background: linear-gradient(135deg, rgba(220,38,38,0.24), rgba(79,70,229,0.28));
    border: 1.5px solid rgba(248,113,113,0.65);
    border-radius: 18px;
    padding: 14px;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-shadow: 0 8px 24px rgba(220,38,38,0.18);
  }
  .live-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #EF4444; display: inline-block;
    box-shadow: 0 0 0 0 rgba(239,68,68,0.8);
    animation: livePulseAnim 1.5s infinite;
  }
  @keyframes livePulseAnim {
    0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.8); }
    70% { box-shadow: 0 0 0 9px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .live-top-bar {
    background: linear-gradient(135deg, #1E1B4B, #0F172A);
    border: 1px solid rgba(99,102,241,0.35);
    border-radius: 16px;
    padding: 10px 12px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .live-video-stage {
    background: #060B16;
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 10px;
    margin-bottom: 10px;
  }
  .live-video-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .live-video-grid.has-two {
    grid-template-columns: 1.4fr 1fr;
  }
  .live-video-tile {
    position: relative;
    background: #0F172A;
    border-radius: 12px;
    overflow: hidden;
    min-height: 155px;
    max-height: 250px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(148,163,184,0.2);
  }
  .live-video-tile video {
    width: 100%;
    height: 100%;
    max-height: 250px;
    object-fit: contain;
    background: #020617;
  }
  .live-video-badge {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(15,23,42,0.82);
    color: #F8FAFC;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
  }
  .wb-shell {
    background: #111827;
    border: 1.5px solid rgba(99,102,241,0.35);
    border-radius: 16px;
    padding: 8px;
    margin-bottom: 10px;
  }
  .wb-shell.wb-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 1200;
    border-radius: 0;
    margin: 0;
    background: #0B1120;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 8px;
  }
  .wb-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
    margin-bottom: 7px;
    background: #1E293B;
    padding: 6px;
    border-radius: 12px;
  }
  .wb-tool-btn {
    border: 1px solid rgba(148,163,184,0.22);
    background: #0F172A;
    color: #E2E8F0;
    border-radius: 9px;
    padding: 6px 9px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .wb-tool-btn.active {
    background: var(--primary);
    border-color: #818CF8;
    color: #FFFFFF;
    box-shadow: 0 2px 10px rgba(99,102,241,0.45);
  }
  .wb-color-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.25);
    cursor: pointer;
    padding: 0;
  }
  .wb-color-dot.active {
    border: 3px solid #FDE68A;
    transform: scale(1.14);
  }
  .wb-canvas-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 10 / 7;
    background: #FFFFFF;
    border-radius: 12px;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
  }
  .wb-shell.wb-fullscreen .wb-canvas-stage {
    max-height: calc(100vh - 128px);
    margin: 0 auto;
    width: auto;
    max-width: 100%;
  }
  .wb-canvas-stage canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  .wb-page-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 7px;
    font-size: 12px;
  }
  .live-pod-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 8px;
  }
`;

export const LIVE_CLASS_JS = String.raw`
    // ==================== 🎥 موتور کلاس مجازی زنده (v3.0) ====================
    var liveState = {
      timer: null,
      initedRoomId: "",
      active: false,
      title: "",
      startedAt: "",
      myKey: "",
      myPerms: { canSpeak: false, canDraw: false, handRaised: false },
      chatLocked: false,
      videoEngine: "webrtc",
      jitsiRoomName: "",
      currentPage: 0,
      totalPages: 1,
      pageMeta: { pageIndex: 0, bgKind: "blank", slideId: "", title: "صفحه ۱", rev: 0 },
      strokes: [],
      sinceStrokeSeq: 0,
      sinceChatId: 0,
      sinceSignalId: 0,
      laser: { active: false, x: 500, y: 350 },
      participants: [],
      chats: [],
      poll: null,
      myPollVote: -1,
      podTab: "users", // users | chat | poll
      tool: "pen", // pen | highlighter | eraser | line | rect | circle | laser
      color: "#1E293B",
      width: 4,
      fullscreen: false,
      drawing: false,
      curPoints: [],
      slideImagesCache: {},
      lastLaserSentAt: 0,
      // WebRTC
      localStream: null,
      localMediaKind: "none", // none | audio | video | screen
      facingMode: "user",
      outPeers: {}, // targetKey -> RTCPeerConnection
      inPeers: {},  // senderKey -> RTCPeerConnection
      remoteStreams: {}, // senderKey -> MediaStream
      syncBusy: false
    };

    var LIVE_ICE_CONFIG = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:openrelay.metered.ca:80" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turns:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
      ]
    };

    function stopLivePollingOnly() {
      if (liveState.timer) {
        clearInterval(liveState.timer);
        liveState.timer = null;
      }
    }

    function cleanupAllRtc() {
      try {
        if (liveState.localStream) {
          liveState.localStream.getTracks().forEach(function(t) { t.stop(); });
        }
      } catch (e) {}
      liveState.localStream = null;
      liveState.localMediaKind = "none";
      Object.keys(liveState.outPeers).forEach(function(k) {
        try { liveState.outPeers[k].close(); } catch (e) {}
      });
      Object.keys(liveState.inPeers).forEach(function(k) {
        try { liveState.inPeers[k].close(); } catch (e) {}
      });
      liveState.outPeers = {};
      liveState.inPeers = {};
      liveState.remoteStreams = {};
    }

    function renderLiveBannerHtml(liveInfo) {
      if (!liveInfo || !liveInfo.active) return "";
      return '<div class="live-pulse-banner">' +
        '<div>' +
          '<div style="display:flex;align-items:center;gap:7px;font-weight:800;color:#FCA5A5;font-size:14px;">' +
            '<span class="live-dot"></span> 🔴 کلاس آنلاین زنده در حال برگزاری است!' +
          '</div>' +
          '<div style="font-size:13px;color:#F8FAFC;margin-top:3px;font-weight:700;">' + esc(liveInfo.title || "کلاس آنلاین") + ' • 👥 ' + (liveInfo.onlineCount || 1) + ' نفر آنلاین</div>' +
        '</div>' +
        '<button class="btn btn-emerald btn-sm" style="width:auto;padding:9px 14px;" onclick="activeTab=\'live\';renderApp()">🎥 ورود به کلاس</button>' +
      '</div>';
    }

    async function renderLiveClassroomPanel(main) {
      stopLivePollingOnly();
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال اتصال به اتاق کلاس مجازی...</div>';
      await pollLiveClassroomOnce(true);
      if (!liveState.timer) {
        liveState.timer = setInterval(function() {
          if (activeTab !== "live") {
            stopLivePollingOnly();
            return;
          }
          pollLiveClassroomOnce(false);
        }, 1200);
      }
    }

    async function startLiveClassByTeacher() {
      var titleEl = document.getElementById("liveClassTitleInp");
      var tgChk = document.getElementById("liveNotifyTgChk");
      var title = (titleEl && titleEl.value.trim()) || "کلاس آنلاین هوشمند";
      var notifyTelegram = tgChk ? tgChk.checked : true;
      try {
        showToast("⏳ در حال افتتاح اتاق کلاس آنلاین...");
        var r = await api("/api/app/live/start", { title: title, notifyTelegram: notifyTelegram });
        liveState.initedRoomId = "";
        liveState.strokes = [];
        liveState.chats = [];
        liveState.sinceStrokeSeq = 0;
        liveState.sinceChatId = 0;
        liveState.sinceSignalId = 0;
        showToast("🟢 کلاس زنده آغاز شد! (" + (r.notified || 0) + " اعلان تلگرام ارسال گردید)");
        await pollLiveClassroomOnce(true);
      } catch (e) {
        showToast("❌ " + e.message);
      }
    }

    async function stopLiveClassByTeacher() {
      if (!confirm("آیا از پایان دادن به جلسه کلاس آنلاین مطمئن هستید؟")) return;
      try {
        cleanupAllRtc();
        await api("/api/app/live/stop", {});
        liveState.active = false;
        liveState.fullscreen = false;
        showToast("🔴 جلسه کلاس آنلاین پایان یافت.");
        await pollLiveClassroomOnce(true);
      } catch (e) {
        showToast("❌ " + e.message);
      }
    }

    async function pollLiveClassroomOnce(forceDomRebuild) {
      if (liveState.syncBusy && !forceDomRebuild) return;
      liveState.syncBusy = true;
      try {
        var reqBody = {
          pageIndex: liveState.currentPage,
          pageRev: liveState.pageMeta.rev,
          sinceStrokeSeq: liveState.sinceStrokeSeq,
          sinceChatId: liveState.sinceChatId,
          sinceSignalId: liveState.sinceSignalId,
          mediaActive: liveState.localMediaKind
        };
        var d = await api("/api/app/live/sync", reqBody);

        if (!d.active) {
          var wasActive = liveState.active;
          liveState.active = false;
          cleanupAllRtc();
          if (forceDomRebuild || wasActive || !document.getElementById("liveInactiveCard")) {
            renderLiveInactiveView();
          }
          liveState.syncBusy = false;
          return;
        }

        var roomChanged = liveState.initedRoomId !== d.roomId;
        if (roomChanged) {
          cleanupAllRtc();
          liveState.initedRoomId = d.roomId;
          liveState.strokes = [];
          liveState.chats = [];
          liveState.sinceStrokeSeq = 0;
          liveState.sinceChatId = 0;
          liveState.sinceSignalId = 0;
        }

        var prevCanSpeak = liveState.myPerms.canSpeak;
        var prevCanDraw = liveState.myPerms.canDraw;
        var prevEngine = liveState.videoEngine;

        liveState.active = true;
        liveState.title = d.title;
        liveState.startedAt = d.startedAt;
        liveState.myKey = d.myKey;
        liveState.myPerms = d.myPermissions || { canSpeak: false, canDraw: false, handRaised: false };
        liveState.chatLocked = Boolean(d.chatLocked);
        liveState.videoEngine = d.videoEngine || "webrtc";
        liveState.jitsiRoomName = d.jitsiRoomName || "";
        liveState.currentPage = d.currentPage || 0;
        liveState.totalPages = d.totalPages || 1;
        liveState.participants = d.participants || [];
        liveState.laser = d.laser || { active: false };
        liveState.poll = d.poll || null;
        liveState.myPollVote = typeof d.myPollVote === "number" ? d.myPollVote : -1;

        // اگر مجوز صحبت دانش‌آموز توسط معلم بسته شد، میکروفونش را ببند
        if (session && session.role === "student" && prevCanSpeak && !liveState.myPerms.canSpeak && liveState.localStream) {
          stopMyLiveMedia();
          showToast("🔇 میکروفون شما توسط معلم بسته شد.");
        }
        if (session && session.role === "student" && !prevCanSpeak && liveState.myPerms.canSpeak) {
          showToast("🎙 معلم اجازه صحبت به شما داد! دکمه روشن کردن میکروفون را بزنید.");
        }
        if (session && session.role === "student" && !prevCanDraw && liveState.myPerms.canDraw) {
          showToast("✏️ معلم شما را پای تخته صدا زد! اکنون می‌توانید روی تخته بنویسید.");
        }

        var needBoardRedraw = false;
        if (d.fullBoard || !liveState.pageMeta || liveState.pageMeta.rev !== d.pageMeta.rev || liveState.pageMeta.pageIndex !== d.pageMeta.pageIndex) {
          liveState.pageMeta = d.pageMeta;
          liveState.strokes = d.strokes || [];
          needBoardRedraw = true;
        } else if (Array.isArray(d.strokes) && d.strokes.length > 0) {
          var existingIds = {};
          for (var i = 0; i < liveState.strokes.length; i++) existingIds[liveState.strokes[i].id] = true;
          for (var j = 0; j < d.strokes.length; j++) {
            if (!existingIds[d.strokes[j].id]) {
              liveState.strokes.push(d.strokes[j]);
            }
          }
          needBoardRedraw = true;
        }
        if (typeof d.latestStrokeSeq === "number") {
          liveState.sinceStrokeSeq = d.latestStrokeSeq;
        }

        var chatUpdated = false;
        if (Array.isArray(d.chats) && d.chats.length > 0) {
          for (var c = 0; c < d.chats.length; c++) {
            liveState.chats.push(d.chats[c]);
            if (d.chats[c].id > liveState.sinceChatId) liveState.sinceChatId = d.chats[c].id;
          }
          if (liveState.chats.length > 100) liveState.chats = liveState.chats.slice(-100);
          chatUpdated = true;
        }

        if (typeof d.latestSignalId === "number" && d.latestSignalId > liveState.sinceSignalId) {
          liveState.sinceSignalId = d.latestSignalId;
        }

        if (forceDomRebuild || roomChanged || !document.getElementById("wbBgCanvas") || prevCanDraw !== liveState.myPerms.canDraw || prevCanSpeak !== liveState.myPerms.canSpeak || prevEngine !== liveState.videoEngine) {
          buildActiveClassroomDom();
          needBoardRedraw = true;
          chatUpdated = true;
        } else {
          updateClassroomDynamicWidgets(chatUpdated);
        }

        if (needBoardRedraw) {
          redrawWhiteboardBase();
        }
        if (!liveState.drawing) {
          redrawWhiteboardOverlay();
        }

        // پردازش پیام‌های سیگنالینگ WebRTC و حفظ اتصال خودکار
        if (liveState.videoEngine === "webrtc") {
          if (Array.isArray(d.signals) && d.signals.length > 0) {
            for (var sIdx = 0; sIdx < d.signals.length; sIdx++) {
              await handleIncomingRtcSignal(d.signals[sIdx]);
            }
          }
          await ensureOutboundConnectionsToListeners();
        }
      } catch (e) {
        // در صورت قطع لحظه‌ای، در تیک بعدی ادامه می‌دهیم
      }
      liveState.syncBusy = false;
    }

    function renderLiveInactiveView() {
      var main = document.getElementById("mainView");
      if (!main) return;
      if (session && session.role === "teacher") {
        main.innerHTML =
          '<div class="card hero-card" id="liveInactiveCard">' +
            '<div style="font-size:34px;margin-bottom:6px;">🎥🎨</div>' +
            '<div style="font-size:18px;font-weight:900;color:var(--gold-light);">اتاق کلاس مجازی زنده (مشابه Adobe Connect)</div>' +
            '<p class="muted" style="color:#E2E8F0;line-height:1.75;margin:8px 0 14px;">ارتباط صوتی و تصویری زنده، وایت‌برد هوشمند چندصفحه‌ای، نمایش و خط‌کشی روی PDF و عکس کتاب، بردن دانش‌آموز پای تخته، اجازه صحبت با دست بلند کردن و نظرسنجی لحظه‌ای!</p>' +
            '<label class="muted" style="display:block;margin-bottom:5px;color:#CBD5E1;">📌 عنوان جلسه امروز:</label>' +
            '<input id="liveClassTitleInp" class="input" value="کلاس آنلاین درس امروز" placeholder="مثلاً: ریاضی — حل نمونه سوالات امتحانی فصل ۴" />' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:8px 0 14px;cursor:pointer;">' +
              '<input type="checkbox" id="liveNotifyTgChk" checked style="width:18px;height:18px;" />' +
              '<span>📣 ارسال پیام خودکار شروع کلاس در تلگرام برای همه دانش‌آموزان</span>' +
            '</label>' +
            '<button class="btn btn-emerald" style="font-size:15px;padding:13px;" onclick="startLiveClassByTeacher()">🟢 شروع کلاس مجازی زنده</button>' +
          '</div>';
      } else {
        main.innerHTML =
          '<div class="card" id="liveInactiveCard" style="text-align:center;padding:30px 16px;">' +
            '<div style="font-size:44px;margin-bottom:8px;">🎥⏳</div>' +
            '<div style="font-size:17px;font-weight:800;color:var(--gold-light);margin-bottom:6px;">در حال حاضر کلاس زنده‌ای فعال نیست</div>' +
            '<p class="muted" style="line-height:1.8;">به محض اینکه استاد کلاس آنلاین را شروع کنند، این صفحه به‌صورت خودکار باز می‌شود و در تلگرام هم پیام دریافت می‌کنی!</p>' +
          '</div>';
      }
    }

    function buildActiveClassroomDom() {
      var main = document.getElementById("mainView");
      if (!main) return;
      var isTeacher = session && session.role === "teacher";
      var canDraw = isTeacher || liveState.myPerms.canDraw;
      var canSpeak = isTeacher || liveState.myPerms.canSpeak;
      var supportsScreen = Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

      var topRightBtn = isTeacher
        ? '<button class="btn btn-rose btn-sm" style="width:auto;" onclick="stopLiveClassByTeacher()">🔴 پایان کلاس</button>'
        : '<button id="liveHandBtn" class="btn ' + (liveState.myPerms.handRaised ? 'btn-gold' : 'btn-ghost') + ' btn-sm" style="width:auto;" onclick="toggleStudentHand()">' +
            (liveState.myPerms.handRaised ? '✋ دست شما بالاست (لغو)' : '✋ اجازه صحبت') +
          '</button>';

      // نوار کنترل صدا و تصویر
      var mediaControlsHtml = "";
      if (liveState.videoEngine === "jitsi") {
        var displayName = encodeURIComponent((session && session.name) || "کاربر کلاس");
        var jitsiUrl = "https://meet.jit.si/" + encodeURIComponent(liveState.jitsiRoomName) + "#userInfo.displayName=%22" + displayName + "%22&config.prejoinPageEnabled=false";
        mediaControlsHtml =
          '<div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">' +
            '<span style="font-size:12px;color:#38BDF8;font-weight:700;">🌐 حالت اتاق کنفرانس گروهی فعال است</span>' +
            '<div style="display:flex;gap:6px;">' +
              '<a class="btn btn-ghost btn-sm" style="width:auto;" target="_blank" href="' + jitsiUrl + '">↗️ باز کردن تمام‌صفحه</a>' +
              (isTeacher ? '<button class="btn btn-ghost btn-sm" style="width:auto;" onclick="switchVideoEngine(\'webrtc\')">بازگشت به پخش مستقیم داخلی</button>' : '') +
            '</div>' +
          '</div>' +
          '<iframe src="' + jitsiUrl + '" allow="camera; microphone; fullscreen; display-capture; autoplay" style="width:100%;height:260px;border:none;border-radius:12px;background:#020617;"></iframe>';
      } else {
        var myMediaBtns = "";
        if (canSpeak) {
          myMediaBtns =
            '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">' +
              '<button class="btn ' + (liveState.localMediaKind === 'video' ? 'btn-emerald' : '') + ' btn-sm" style="width:auto;" onclick="startMyLiveMedia(\'video\')">📹 دوربین و صدا</button>' +
              '<button class="btn ' + (liveState.localMediaKind === 'audio' ? 'btn-emerald' : 'btn-gold') + ' btn-sm" style="width:auto;" onclick="startMyLiveMedia(\'audio\')">🎙 فقط صدا</button>' +
              '<button class="btn btn-ghost btn-sm" style="width:auto;" onclick="flipMyCamera()">🔄 چرخش دوربین</button>' +
              (supportsScreen && isTeacher ? '<button class="btn btn-ghost btn-sm" style="width:auto;" onclick="startMyLiveMedia(\'screen\')">🖥 اشتراک صفحه</button>' : '') +
              (liveState.localMediaKind !== 'none' ? '<button class="btn btn-rose btn-sm" style="width:auto;" onclick="stopMyLiveMedia()">🔇 قطع پخش من</button>' : '') +
              (isTeacher ? '<button class="btn btn-ghost btn-sm" style="width:auto;margin-right:auto;" onclick="switchVideoEngine(\'jitsi\')" title="مناسب جلسات بالای ۲۰ دوربین هم‌زمان">🌐 اتاق کنفرانس پرجمعیت</button>' : '') +
            '</div>';
        }
        mediaControlsHtml =
          myMediaBtns +
          '<div id="liveVideoTiles" class="live-video-grid">' +
            '<div class="live-video-tile" id="primaryVideoSlot">' +
              '<div class="muted" style="text-align:center;padding:14px;">🎙 در انتظار فعال شدن صدا یا تصویر استاد...<br><span style="font-size:11px;">(وایت‌برد و اسلایدها در پایین کاملاً زنده و فعال هستند)</span></div>' +
            '</div>' +
          '</div>';
      }

      // نوار ابزار وایت‌برد (برای معلم یا دانش‌آموزی که پای تخته صدا زده شده)
      var colors = [
        { c: "#1E293B", lbl: "مشکی" },
        { c: "#2563EB", lbl: "آبی" },
        { c: "#DC2626", lbl: "قرمز" },
        { c: "#059669", lbl: "سبز" },
        { c: "#9333EA", lbl: "بنفش" },
        { c: "#D97706", lbl: "نارنجی" }
      ];
      var colorDotsHtml = colors.map(function(it) {
        return '<button data-wbcolor="' + it.c + '" class="wb-color-dot ' + (liveState.color === it.c ? 'active' : '') + '" style="background:' + it.c + ';" title="' + it.lbl + '" onclick="setWbColor(\'' + it.c + '\')"></button>';
      }).join("");

      var wbToolbarHtml = "";
      if (canDraw) {
        wbToolbarHtml =
          '<div class="wb-toolbar" id="wbDrawBar">' +
            (!isTeacher ? '<span class="badge-pill" style="background:rgba(16,185,129,0.2);color:#6EE7B7;">✏️ شما پای تخته هستید!</span>' : '') +
            '<button data-wbtool="pen" class="wb-tool-btn ' + (liveState.tool === 'pen' ? 'active' : '') + '" onclick="setWbTool(\'pen\')">✏️ قلم</button>' +
            '<button data-wbtool="highlighter" class="wb-tool-btn ' + (liveState.tool === 'highlighter' ? 'active' : '') + '" onclick="setWbTool(\'highlighter\')">🖍 هایلایت</button>' +
            '<button data-wbtool="line" class="wb-tool-btn ' + (liveState.tool === 'line' ? 'active' : '') + '" onclick="setWbTool(\'line\')">📏 خط</button>' +
            '<button data-wbtool="rect" class="wb-tool-btn ' + (liveState.tool === 'rect' ? 'active' : '') + '" onclick="setWbTool(\'rect\')">⬜ کادر</button>' +
            '<button data-wbtool="circle" class="wb-tool-btn ' + (liveState.tool === 'circle' ? 'active' : '') + '" onclick="setWbTool(\'circle\')">⭕ دایره</button>' +
            (isTeacher ? '<button data-wbtool="laser" class="wb-tool-btn ' + (liveState.tool === 'laser' ? 'active' : '') + '" onclick="setWbTool(\'laser\')">🔴 لیزر</button>' : '') +
            '<button data-wbtool="eraser" class="wb-tool-btn ' + (liveState.tool === 'eraser' ? 'active' : '') + '" onclick="setWbTool(\'eraser\')">🧽 پاک‌کن</button>' +
            (isTeacher ? '<button class="wb-tool-btn" onclick="wbAction(\'undo\')">↩️ واگرد</button>' : '') +
            (isTeacher ? '<button class="wb-tool-btn" onclick="if(confirm(\'نوشته‌های این صفحه پاک شود؟\'))wbAction(\'clear\')">🗑 پاک‌کردن</button>' : '') +
            '<button class="wb-tool-btn" style="margin-right:auto;" onclick="toggleWbFullscreen()">⛶ تمام‌صفحه</button>' +
          '</div>' +
          '<div class="wb-toolbar" style="justify-content:space-between;">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
              colorDotsHtml +
              '<select id="wbWidthSel" class="wb-tool-btn" onchange="liveState.width=parseInt(this.value,10)||4">' +
                '<option value="2" ' + (liveState.width === 2 ? 'selected' : '') + '>قلم ریز</option>' +
                '<option value="4" ' + (liveState.width === 4 ? 'selected' : '') + '>قلم متوسط</option>' +
                '<option value="8" ' + (liveState.width === 8 ? 'selected' : '') + '>قلم درشت</option>' +
              '</select>' +
            '</div>' +
            (isTeacher ? (
              '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">' +
                '<label class="wb-tool-btn" style="background:rgba(16,185,129,0.2);border-color:#10B981;color:#A7F3D0;">' +
                  '📄 افزودن PDF / عکس روی تخته' +
                  '<input type="file" accept="image/*,.pdf" multiple style="display:none;" onchange="handleWbFileUpload(this)" />' +
                '</label>' +
                '<select class="wb-tool-btn" onchange="wbAction(\'bg\', { bgKind: this.value })">' +
                  '<option value="blank" ' + (liveState.pageMeta.bgKind === 'blank' ? 'selected' : '') + '>⬜ صفحه سفید</option>' +
                  '<option value="grid" ' + (liveState.pageMeta.bgKind === 'grid' ? 'selected' : '') + '>📏 شطرنجی ریاضی</option>' +
                  '<option value="lined" ' + (liveState.pageMeta.bgKind === 'lined' ? 'selected' : '') + '>📝 خط‌دار تحریری</option>' +
                  '<option value="green" ' + (liveState.pageMeta.bgKind === 'green' ? 'selected' : '') + '>🟩 تخته سبز کلاس</option>' +
                '</select>' +
              '</div>'
            ) : '') +
          '</div>';
      } else {
        wbToolbarHtml =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<span class="muted">🎨 تخته هوشمند زنده استاد (در حال نمایش هم‌زمان)</span>' +
            '<button class="wb-tool-btn" onclick="toggleWbFullscreen()">⛶ بزرگ‌نمایی تمام‌صفحه تخته</button>' +
          '</div>';
      }

      var pageNavHtml =
        '<div class="wb-page-bar">' +
          '<div style="display:flex;align-items:center;gap:5px;">' +
            (isTeacher ? '<button class="wb-tool-btn" onclick="changeWbPage(-1)">◀ قبلی</button>' : '') +
            '<span id="wbPageIndicator" class="badge-pill">📄 صفحه ' + (liveState.currentPage + 1) + ' از ' + liveState.totalPages + '</span>' +
            (isTeacher ? '<button class="wb-tool-btn" onclick="changeWbPage(1)">بعدی ▶</button>' : '') +
            (isTeacher ? '<button class="wb-tool-btn" onclick="wbAction(\'new-page\')">➕ صفحه جدید</button>' : '') +
          '</div>' +
          '<button class="wb-tool-btn" onclick="downloadWbSnapshot()">💾 ذخیره عکس تخته</button>' +
        '</div>';

      main.innerHTML =
        '<div class="live-top-bar">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:7px;font-weight:900;font-size:15px;color:#F8FAFC;">' +
              '<span class="live-dot"></span> <span id="liveRoomTitleTxt">' + esc(liveState.title) + '</span>' +
            '</div>' +
            '<div class="muted" style="margin-top:2px;">⏰ شروع: ' + esc(liveState.startedAt) + ' • 👥 آنلاین: <b id="liveOnlineCountTxt" style="color:#6EE7B7;">' + liveState.participants.length + ' نفر</b></div>' +
          '</div>' +
          topRightBtn +
        '</div>' +

        '<div class="live-video-stage">' + mediaControlsHtml + '</div>' +

        '<div id="wbShellBox" class="wb-shell ' + (liveState.fullscreen ? 'wb-fullscreen' : '') + '">' +
          wbToolbarHtml +
          '<div class="wb-canvas-stage" id="wbStageBox">' +
            '<canvas id="wbBgCanvas" width="1000" height="700"></canvas>' +
            '<canvas id="wbOverlayCanvas" width="1000" height="700"></canvas>' +
          '</div>' +
          pageNavHtml +
        '</div>' +

        '<div class="card">' +
          '<div class="live-pod-tabs">' +
            '<button id="podBtnUsers" class="role-tab ' + (liveState.podTab === 'users' ? 'active' : '') + '" onclick="switchLivePod(\'users\')">👥 حاضرین (' + liveState.participants.length + ')</button>' +
            '<button id="podBtnChat" class="role-tab ' + (liveState.podTab === 'chat' ? 'active' : '') + '" onclick="switchLivePod(\'chat\')">💬 چت کلاسی</button>' +
            '<button id="podBtnPoll" class="role-tab ' + (liveState.podTab === 'poll' ? 'active' : '') + '" onclick="switchLivePod(\'poll\')">📊 نظرسنجی زنده</button>' +
          '</div>' +
          '<div id="livePodContent"></div>' +
        '</div>';

      bindWhiteboardPointerEvents();
      renderLivePodBody();
      refreshVideoTilesDom();
    }

    function updateClassroomDynamicWidgets(chatUpdated) {
      var cntEl = document.getElementById("liveOnlineCountTxt");
      if (cntEl) cntEl.textContent = liveState.participants.length + " نفر";
      var pBtn = document.getElementById("podBtnUsers");
      var raisedCount = liveState.participants.filter(function(p) { return p.handRaised; }).length;
      if (pBtn) {
        pBtn.textContent = "👥 حاضرین (" + liveState.participants.length + ")" + (raisedCount > 0 ? " ✋" + raisedCount : "");
      }
      var pgEl = document.getElementById("wbPageIndicator");
      if (pgEl) {
        pgEl.textContent = "📄 صفحه " + (liveState.currentPage + 1) + " از " + liveState.totalPages + (liveState.pageMeta.title ? " (" + liveState.pageMeta.title + ")" : "");
      }
      var handBtn = document.getElementById("liveHandBtn");
      if (handBtn) {
        handBtn.className = "btn " + (liveState.myPerms.handRaised ? "btn-gold" : "btn-ghost") + " btn-sm";
        handBtn.textContent = liveState.myPerms.handRaised ? "✋ دست شما بالاست (لغو)" : "✋ اجازه صحبت";
      }
      if (liveState.podTab === "users" || liveState.podTab === "poll" || chatUpdated) {
        // اگر کاربر در حال تایپ در باکس چت است، فوکوس و متن او را حفظ کن
        var chatInp = document.getElementById("liveChatInp");
        var draft = chatInp ? chatInp.value : "";
        var hadFocus = document.activeElement === chatInp;
        renderLivePodBody();
        var newChatInp = document.getElementById("liveChatInp");
        if (newChatInp && draft) {
          newChatInp.value = draft;
          if (hadFocus) newChatInp.focus();
        }
      }
    }

    function switchLivePod(tab) {
      liveState.podTab = tab;
      ["Users", "Chat", "Poll"].forEach(function(nm) {
        var b = document.getElementById("podBtn" + nm);
        if (b) b.classList.toggle("active", nm.toLowerCase() === tab);
      });
      renderLivePodBody();
    }

    function renderLivePodBody() {
      var box = document.getElementById("livePodContent");
      if (!box) return;
      var isTeacher = session && session.role === "teacher";

      if (liveState.podTab === "users") {
        var muteAllBtn = isTeacher
          ? '<div style="margin-bottom:8px;display:flex;justify-content:flex-end;">' +
              '<button class="btn btn-ghost btn-sm" style="width:auto;" onclick="teacherHandCmd(\'\', \'mute-all\')">🔇 بستن میکروفون همه دانش‌آموزان</button>' +
            '</div>'
          : '';
        var rows = liveState.participants.map(function(p) {
          var badges = [];
          if (p.role === "teacher") badges.push('<span class="badge-pill" style="color:var(--gold-light);">👨‍🏫 استاد</span>');
          if (p.handRaised) badges.push('<span class="badge-pill" style="background:rgba(245,158,11,0.25);color:#FDE68A;">✋ اجازه صحبت</span>');
          if (p.mediaActive !== "none") badges.push('<span class="badge-pill" style="background:rgba(16,185,129,0.2);color:#6EE7B7;">🎙 در حال پخش</span>');
          if (p.role === "student" && p.canDraw) badges.push('<span class="badge-pill" style="color:#38BDF8;">✏️ پای تخته</span>');

          var ctrl = "";
          if (isTeacher && p.role === "student") {
            ctrl =
              '<div style="display:flex;gap:5px;flex-wrap:wrap;">' +
                '<button class="btn ' + (p.canSpeak ? 'btn-emerald' : (p.handRaised ? 'btn-gold' : 'btn-ghost')) + ' btn-sm" style="width:auto;" onclick="teacherHandCmd(\'' + p.key + '\', \'toggle-speak\')">' +
                  (p.canSpeak ? '🔇 قطع میکروفون' : '🎙 دادن میکروفون') +
                '</button>' +
                '<button class="btn ' + (p.canDraw ? 'btn-emerald' : 'btn-ghost') + ' btn-sm" style="width:auto;" onclick="teacherHandCmd(\'' + p.key + '\', \'toggle-draw\')">' +
                  (p.canDraw ? '🚫 پایان تخته' : '✏️ پای تخته') +
                '</button>' +
              '</div>';
          }
          return '<div class="att-row" style="flex-wrap:wrap;">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><b>' + esc(p.name) + '</b> ' + badges.join(" ") + '</div>' +
            ctrl +
          '</div>';
        }).join("");
        box.innerHTML = muteAllBtn + (rows || '<div class="muted">هنوز کسی وارد نشده است.</div>');
        return;
      }

      if (liveState.podTab === "chat") {
        var lockBar = isTeacher
          ? '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
              '<button class="btn btn-ghost btn-sm" style="width:auto;" onclick="sendLiveChatCmd(\'toggle-lock\')">' + (liveState.chatLocked ? '🔓 باز کردن چت کلاس' : '🔒 قفل کردن چت') + '</button>' +
              '<button class="btn btn-ghost btn-sm" style="width:auto;" onclick="sendLiveChatCmd(\'clear\')">🗑 پاکسازی پیام‌ها</button>' +
            '</div>'
          : (liveState.chatLocked ? '<div class="muted" style="margin-bottom:6px;color:#FCA5A5;">🔒 گفتگوی متنی فعلاً توسط استاد قفل شده است.</div>' : '');

        var msgsHtml = liveState.chats.length === 0
          ? '<div class="muted" style="text-align:center;padding:18px;">پیامی ارسال نشده است. اولین سوال یا پیام را بنویسید!</div>'
          : liveState.chats.map(function(m) {
              var isT = m.senderRole === "teacher";
              return '<div style="margin-bottom:7px;padding:8px 10px;border-radius:12px;background:' + (isT ? 'rgba(99,102,241,0.22)' : '#0B1120') + ';border:1px solid ' + (isT ? 'rgba(129,140,248,0.4)' : 'var(--border)') + ';">' +
                '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">' +
                  '<b style="color:' + (isT ? 'var(--gold-light)' : '#38BDF8') + ';">' + (isT ? '👨‍🏫 ' : '👤 ') + esc(m.senderName) + '</b>' +
                  '<span class="muted">' + esc(m.time) + '</span>' +
                '</div>' +
                '<div style="font-size:13px;white-space:pre-wrap;">' + esc(m.text) + '</div>' +
              '</div>';
            }).join("");

        var inpHtml = (!isTeacher && liveState.chatLocked) ? '' :
          '<div style="display:flex;gap:6px;margin-top:8px;">' +
            '<input id="liveChatInp" class="input" style="margin:0;flex:1;" placeholder="پیام یا سوال کلاسی..." onkeydown="if(event.key===\'Enter\')sendLiveChatMsg()" />' +
            '<button class="btn btn-sm" style="width:auto;padding:0 16px;" onclick="sendLiveChatMsg()">ارسال</button>' +
          '</div>';

        box.innerHTML = lockBar + '<div id="liveChatScroll" style="max-height:220px;overflow-y:auto;padding:4px;">' + msgsHtml + '</div>' + inpHtml;
        var sc = document.getElementById("liveChatScroll");
        if (sc) sc.scrollTop = sc.scrollHeight;
        return;
      }

      if (liveState.podTab === "poll") {
        var poll = liveState.poll;
        var pollHtml = "";
        if (poll) {
          var optsHtml = poll.options.map(function(opt, idx) {
            var cnt = poll.counts[idx] || 0;
            var pct = poll.total > 0 ? Math.round((cnt * 100) / poll.total) : 0;
            var voted = liveState.myPollVote === idx;
            return '<div style="margin-bottom:8px;">' +
              '<button class="btn ' + (voted ? 'btn-emerald' : 'btn-ghost') + ' btn-sm" style="justify-content:space-between;width:100%;" ' + (!poll.active ? 'disabled' : '') + ' onclick="voteLivePoll(' + idx + ')">' +
                '<span>' + (voted ? '✅ ' : '') + esc(opt) + '</span>' +
                '<span>' + cnt + ' رای (' + pct + '٪)</span>' +
              '</button>' +
              '<div class="progress-bar" style="height:6px;margin-top:4px;"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
            '</div>';
          }).join("");

          pollHtml =
            '<div style="background:#0B1120;padding:12px;border-radius:14px;border:1px solid var(--border);margin-bottom:10px;">' +
              '<div style="font-weight:800;margin-bottom:8px;color:var(--gold-light);">📊 ' + esc(poll.question) + ' <span class="muted">(' + poll.total + ' پاسخ)</span></div>' +
              optsHtml +
              (isTeacher ? (
                '<div style="display:flex;gap:6px;margin-top:8px;">' +
                  (poll.active ? '<button class="btn btn-gold btn-sm" onclick="teacherPollCmd(\'close\')">⏹ بستن رای‌گیری</button>' : '') +
                  '<button class="btn btn-rose btn-sm" onclick="teacherPollCmd(\'clear\')">🗑 حذف نظرسنجی</button>' +
                '</div>'
              ) : '') +
            '</div>';
        } else {
          pollHtml = '<div class="muted" style="margin-bottom:10px;">نظرسنجی فعالی در جریان نیست.</div>';
        }

        var teacherCreateHtml = isTeacher
          ? '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
              '<button class="btn btn-emerald btn-sm" style="margin-bottom:8px;" onclick="createQuickUnderstandingPoll()">⚡ نظرسنجی فوری یک‌کلیکی: «آیا این مبحث را متوجه شدید؟»</button>' +
              '<input id="customPollQ" class="input" placeholder="یا سوال چهارگزینه‌ای دلخواه بنویسید..." />' +
              '<input id="customPollOpts" class="input" placeholder="گزینه‌ها با کاما ، جدا شوند (مثلاً: گزینه ۱، گزینه ۲، گزینه ۳، گزینه ۴)" />' +
              '<button class="btn btn-sm" onclick="createCustomLivePoll()">📊 انتشار سوال زنده روی صفحه دانش‌آموزان</button>' +
            '</div>'
          : '';

        box.innerHTML = pollHtml + teacherCreateHtml;
      }
    }

    // ==================== عملیات وایت‌برد، فایل عکس و PDF ====================
    function setWbTool(t) {
      liveState.tool = t;
      document.querySelectorAll("[data-wbtool]").forEach(function(btn) {
        btn.classList.toggle("active", btn.getAttribute("data-wbtool") === t);
      });
    }
    function setWbColor(c) {
      liveState.color = c;
      if (liveState.tool === "eraser" || liveState.tool === "laser") {
        liveState.tool = "pen";
      }
      document.querySelectorAll("[data-wbtool]").forEach(function(btn) {
        btn.classList.toggle("active", btn.getAttribute("data-wbtool") === liveState.tool);
      });
      document.querySelectorAll("[data-wbcolor]").forEach(function(dot) {
        dot.classList.toggle("active", dot.getAttribute("data-wbcolor") === c);
      });
    }
    function toggleWbFullscreen() {
      liveState.fullscreen = !liveState.fullscreen;
      var sh = document.getElementById("wbShellBox");
      if (sh) sh.classList.toggle("wb-fullscreen", liveState.fullscreen);
    }

    async function wbAction(action, extra) {
      var payload = Object.assign({ action: action }, extra || {});
      try {
        await api("/api/app/live/board", payload);
        await pollLiveClassroomOnce(false);
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function changeWbPage(delta) {
      var next = liveState.currentPage + delta;
      if (next < 0 || next >= liveState.totalPages) return;
      await wbAction("set-page", { pageIndex: next });
    }

    function downloadWbSnapshot() {
      var bg = document.getElementById("wbBgCanvas");
      if (!bg) return;
      var url = bg.toDataURL("image/png");
      var a = document.createElement("a");
      a.href = url;
      a.download = "smartclass-board-page-" + (liveState.currentPage + 1) + ".png";
      a.click();
    }

    function getWbCoords(ev, canvas) {
      var rect = canvas.getBoundingClientRect();
      var cx = ev.clientX;
      var cy = ev.clientY;
      if (ev.touches && ev.touches.length > 0) {
        cx = ev.touches[0].clientX;
        cy = ev.touches[0].clientY;
      } else if (ev.changedTouches && ev.changedTouches.length > 0) {
        cx = ev.changedTouches[0].clientX;
        cy = ev.changedTouches[0].clientY;
      }
      var x = ((cx - rect.left) / Math.max(1, rect.width)) * 1000;
      var y = ((cy - rect.top) / Math.max(1, rect.height)) * 700;
      return {
        x: Math.max(0, Math.min(1000, x)),
        y: Math.max(0, Math.min(700, y))
      };
    }

    function bindWhiteboardPointerEvents() {
      var ov = document.getElementById("wbOverlayCanvas");
      if (!ov) return;

      var canUseBoard = (session && session.role === "teacher") || liveState.myPerms.canDraw;
      if (!canUseBoard) return;

      var onStart = function(ev) {
        if (ev.touches && ev.touches.length > 1) return; // اجازه زوم دو انگشتی در صورت نیاز
        if (ev.cancelable) ev.preventDefault();
        var pt = getWbCoords(ev, ov);
        if (liveState.tool === "laser") {
          liveState.drawing = true;
          sendLaserPos(pt.x, pt.y, true);
          return;
        }
        liveState.drawing = true;
        liveState.curPoints = [pt];
        redrawWhiteboardOverlay();
      };

      var onMove = function(ev) {
        if (!liveState.drawing) return;
        if (ev.cancelable) ev.preventDefault();
        var pt = getWbCoords(ev, ov);
        if (liveState.tool === "laser") {
          liveState.laser = { active: true, x: pt.x, y: pt.y };
          redrawWhiteboardOverlay();
          if (Date.now() - liveState.lastLaserSentAt > 180) {
            liveState.lastLaserSentAt = Date.now();
            sendLaserPos(pt.x, pt.y, true);
          }
          return;
        }
        if (liveState.tool === "line" || liveState.tool === "rect" || liveState.tool === "circle") {
          liveState.curPoints = [liveState.curPoints[0], pt];
        } else {
          var last = liveState.curPoints[liveState.curPoints.length - 1];
          var dx = pt.x - last.x;
          var dy = pt.y - last.y;
          if (dx * dx + dy * dy >= 3.5) {
            liveState.curPoints.push(pt);
          }
        }
        redrawWhiteboardOverlay();
      };

      var onEnd = async function(ev) {
        if (!liveState.drawing) return;
        liveState.drawing = false;
        if (liveState.tool === "laser") {
          liveState.laser = { active: false, x: 0, y: 0 };
          redrawWhiteboardOverlay();
          sendLaserPos(0, 0, false);
          return;
        }
        var pts = liveState.curPoints.slice();
        liveState.curPoints = [];
        if (pts.length === 0) return;
        if (pts.length === 1) pts.push({ x: pts[0].x + 0.5, y: pts[0].y + 0.5 });

        var strokeObj = {
          id: "loc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          tool: liveState.tool,
          color: liveState.pageMeta.bgKind === "green" && liveState.color === "#1E293B" ? "#FFFFFF" : liveState.color,
          width: liveState.tool === "highlighter" ? 20 : (liveState.tool === "eraser" ? 26 : liveState.width),
          points: pts
        };
        liveState.strokes.push(strokeObj);
        redrawWhiteboardBase();
        redrawWhiteboardOverlay();

        try {
          await api("/api/app/live/board", Object.assign({ action: "stroke" }, strokeObj));
        } catch (e) {}
      };

      ov.onmousedown = onStart;
      ov.onmousemove = onMove;
      ov.onmouseup = onEnd;
      ov.onmouseleave = onEnd;
      ov.addEventListener("touchstart", onStart, { passive: false });
      ov.addEventListener("touchmove", onMove, { passive: false });
      ov.addEventListener("touchend", onEnd, { passive: false });
    }

    function sendLaserPos(x, y, active) {
      api("/api/app/live/board", { action: "laser", x: Math.round(x), y: Math.round(y), active: active }).catch(function() {});
    }

    function drawSingleStrokeOnCtx(ctx, s, bgFillColor) {
      if (!s || !s.points || s.points.length === 0) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (s.tool === "highlighter") {
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = s.color === "#1E293B" ? "#FACC15" : s.color;
        ctx.lineWidth = s.width || 20;
      } else if (s.tool === "eraser") {
        ctx.strokeStyle = bgFillColor || "#FFFFFF";
        ctx.lineWidth = s.width || 26;
      } else {
        ctx.strokeStyle = s.color || "#1E293B";
        ctx.lineWidth = s.width || 4;
      }

      var p0 = s.points[0];
      var pLast = s.points[s.points.length - 1];

      if (s.tool === "line") {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(pLast.x, pLast.y);
        ctx.stroke();
      } else if (s.tool === "rect") {
        ctx.strokeRect(p0.x, p0.y, pLast.x - p0.x, pLast.y - p0.y);
      } else if (s.tool === "circle") {
        var rx = Math.abs(pLast.x - p0.x) / 2;
        var ry = Math.abs(pLast.y - p0.y) / 2;
        var cx = (p0.x + pLast.x) / 2;
        var cy = (p0.y + pLast.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (var i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawPaperBackground(ctx, bgKind) {
      var baseColor = bgKind === "green" ? "#064E3B" : "#FFFFFF";
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, 1000, 700);

      if (bgKind === "grid") {
        ctx.strokeStyle = "#E2E8F0";
        ctx.lineWidth = 1;
        for (var x = 0; x <= 1000; x += 35) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 700); ctx.stroke();
        }
        for (var y = 0; y <= 700; y += 35) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke();
        }
      } else if (bgKind === "lined") {
        ctx.strokeStyle = "#CBD5E1";
        ctx.lineWidth = 1.2;
        for (var ly = 55; ly < 700; ly += 42) {
          ctx.beginPath(); ctx.moveTo(40, ly); ctx.lineTo(960, ly); ctx.stroke();
        }
      }
      return baseColor;
    }

    function redrawWhiteboardBase() {
      var canvas = document.getElementById("wbBgCanvas");
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      var meta = liveState.pageMeta || { bgKind: "blank", slideId: "" };
      var bgFill = drawPaperBackground(ctx, meta.bgKind);

      var paintStrokes = function() {
        for (var i = 0; i < liveState.strokes.length; i++) {
          drawSingleStrokeOnCtx(ctx, liveState.strokes[i], bgFill);
        }
      };

      if (meta.bgKind === "image" && meta.slideId) {
        var cached = liveState.slideImagesCache[meta.slideId];
        if (cached && cached.complete && cached.naturalWidth > 0) {
          drawContainedImage(ctx, cached);
          paintStrokes();
        } else {
          var img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = function() {
            liveState.slideImagesCache[meta.slideId] = img;
            drawPaperBackground(ctx, "blank");
            drawContainedImage(ctx, img);
            paintStrokes();
          };
          img.src = getApiBase() + "/api/app/live/slide-img?id=" + encodeURIComponent(meta.slideId);
          paintStrokes();
        }
      } else {
        paintStrokes();
      }
    }

    function drawContainedImage(ctx, img) {
      var iw = img.naturalWidth || img.width || 1000;
      var ih = img.naturalHeight || img.height || 700;
      var scale = Math.min(1000 / iw, 700 / ih);
      var dw = iw * scale;
      var dh = ih * scale;
      var dx = (1000 - dw) / 2;
      var dy = (700 - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    function redrawWhiteboardOverlay() {
      var ov = document.getElementById("wbOverlayCanvas");
      if (!ov) return;
      var ctx = ov.getContext("2d");
      ctx.clearRect(0, 0, 1000, 700);

      if (liveState.drawing && liveState.curPoints.length > 0 && liveState.tool !== "laser") {
        var bgFill = liveState.pageMeta.bgKind === "green" ? "#064E3B" : "#FFFFFF";
        drawSingleStrokeOnCtx(ctx, {
          tool: liveState.tool,
          color: liveState.pageMeta.bgKind === "green" && liveState.color === "#1E293B" ? "#FFFFFF" : liveState.color,
          width: liveState.tool === "highlighter" ? 20 : (liveState.tool === "eraser" ? 26 : liveState.width),
          points: liveState.curPoints
        }, bgFill);
      }

      if (liveState.laser && liveState.laser.active) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(liveState.laser.x, liveState.laser.y, 13, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239, 68, 68, 0.32)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(liveState.laser.x, liveState.laser.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#EF4444";
        ctx.fill();
        ctx.restore();
      }
    }

    // بارگذاری عکس‌ها یا صفحات کامل فایل PDF روی تخته هوشمند
    async function handleWbFileUpload(inputEl) {
      var files = inputEl.files ? Array.from(inputEl.files) : [];
      if (files.length === 0) return;

      try {
        for (var fIdx = 0; fIdx < files.length; fIdx++) {
          var file = files[fIdx];
          var lower = String(file.name || "").toLowerCase();
          var isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");

          if (isPdf) {
            showToast("📄 در حال بارگذاری موتور رندر PDF روی تخته...");
            var pdfUrl = (getApiBase() || window.location.origin) + "/api/app/live/pdfjs.mjs";
            var pdfjs = await import(pdfUrl);
            var ab = await file.arrayBuffer();
            var loadingTask = pdfjs.getDocument({ data: new Uint8Array(ab) });
            var pdfDoc = await loadingTask.promise;
            var maxPages = Math.min(pdfDoc.numPages, 15);

            for (var p = 1; p <= maxPages; p++) {
              showToast("⏳ در حال افزودن صفحه " + p + " از " + maxPages + " فایل PDF به تخته...");
              var page = await pdfDoc.getPage(p);
              var baseVp = page.getViewport({ scale: 1 });
              var scale = Math.min(1600 / Math.max(1, baseVp.width), 1600 / Math.max(1, baseVp.height), 2.2);
              var vp = page.getViewport({ scale: scale });
              var cnv = document.createElement("canvas");
              cnv.width = Math.round(vp.width);
              cnv.height = Math.round(vp.height);
              var c2d = cnv.getContext("2d");
              c2d.fillStyle = "#FFFFFF";
              c2d.fillRect(0, 0, cnv.width, cnv.height);
              await page.render({ canvasContext: c2d, viewport: vp }).promise;
              var pageB64 = cnv.toDataURL("image/jpeg", 0.82);

              await api("/api/app/live/slide", {
                imageB64: pageB64,
                mode: p === 1 && fIdx === 0 && liveState.strokes.length === 0 ? "current" : "append",
                jumpTo: p === 1 && fIdx === 0,
                title: "PDF ص " + p
              });
            }
            showToast("✅ " + maxPages + " صفحه PDF با موفقیت روی تخته قرار گرفت! با دکمه «بعدی ▶» ورق بزنید.");
          } else {
            showToast("🖼 در حال قرار دادن تصویر روی تخته...");
            var imgB64 = await fileToBase64(file);
            await api("/api/app/live/slide", {
              imageB64: imgB64,
              mode: fIdx === 0 ? "current" : "append",
              jumpTo: fIdx === 0,
              title: "اسلاید تصویری"
            });
            showToast("✅ تصویر روی تخته قرار گرفت! می‌توانید رویش بنویسید.");
          }
        }
        inputEl.value = "";
        await pollLiveClassroomOnce(false);
      } catch (e) {
        inputEl.value = "";
        showToast("❌ خطا در بارگذاری فایل روی تخته: " + (e.message || e));
      }
    }

    // ==================== دست بلند کردن، چت و نظرسنجی ====================
    async function toggleStudentHand() {
      try {
        var next = !liveState.myPerms.handRaised;
        await api("/api/app/live/hand", { raised: next });
        liveState.myPerms.handRaised = next;
        showToast(next ? "✋ دست شما بلند شد! استاد مطلع شدند." : "دست شما پایین آمد.");
        updateClassroomDynamicWidgets(false);
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function teacherHandCmd(targetKey, cmd) {
      try {
        await api("/api/app/live/hand", { targetKey: targetKey, cmd: cmd });
        await pollLiveClassroomOnce(false);
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function switchVideoEngine(engine) {
      cleanupAllRtc();
      await api("/api/app/live/hand", { cmd: "video-engine", engine: engine });
      await pollLiveClassroomOnce(true);
    }

    async function sendLiveChatMsg() {
      var inp = document.getElementById("liveChatInp");
      if (!inp) return;
      var txt = inp.value.trim();
      if (!txt) return;
      inp.value = "";
      try {
        await api("/api/app/live/chat", { text: txt });
        await pollLiveClassroomOnce(false);
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function sendLiveChatCmd(action) {
      try {
        await api("/api/app/live/chat", { action: action });
        await pollLiveClassroomOnce(false);
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function createQuickUnderstandingPoll() {
      await api("/api/app/live/poll", {
        action: "create",
        question: "آیا مبحث تدریس‌شده تا این لحظه برایتان کاملاً روشن و مفهوم بود؟",
        options: ["✅ بله، کاملاً یاد گرفتم!", "🤔 یک مثال دیگر هم حل کنید", "❓ متوجه نشدم، نیاز به توضیح دوباره دارم"]
      });
      showToast("📊 نظرسنجی فوری برای همه دانش‌آموزان نمایش داده شد!");
      await pollLiveClassroomOnce(false);
    }

    async function createCustomLivePoll() {
      var q = (document.getElementById("customPollQ")?.value || "").trim();
      var rawOpts = (document.getElementById("customPollOpts")?.value || "").trim();
      if (!q) return showToast("متن سوال نظرسنجی را بنویسید");
      var opts = rawOpts
        ? rawOpts.split("،").join(",").split(",").map(function(s) { return s.trim(); }).filter(Boolean)
        : ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"];
      if (opts.length < 2) opts = ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"];
      await api("/api/app/live/poll", { action: "create", question: q, options: opts });
      showToast("📊 سوال زنده برای کلاس منتشر شد!");
      await pollLiveClassroomOnce(false);
    }

    async function teacherPollCmd(action) {
      await api("/api/app/live/poll", { action: action });
      await pollLiveClassroomOnce(false);
    }

    async function voteLivePoll(optionIndex) {
      try {
        await api("/api/app/live/poll", { action: "vote", optionIndex: optionIndex });
        liveState.myPollVote = optionIndex;
        await pollLiveClassroomOnce(false);
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== 📹🎙 موتور WebRTC همتا‌به‌همتا (صدا، دوربین و اشتراک صفحه) ====================
    async function startMyLiveMedia(kind) {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          return showToast("مرورگر یا دسترسی دوربین/میکروفون پشتیبانی نمی‌شود.");
        }
        stopMyLiveMedia(true);

        var stream = null;
        if (kind === "screen" && navigator.mediaDevices.getDisplayMedia) {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else if (kind === "video") {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: liveState.facingMode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 18 } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        }

        liveState.localStream = stream;
        liveState.localMediaKind = kind;
        stream.getTracks().forEach(function(t) {
          t.onended = function() {
            if (liveState.localStream === stream) stopMyLiveMedia();
          };
        });

        buildActiveClassroomDom();
        redrawWhiteboardBase();
        refreshVideoTilesDom();
        await ensureOutboundConnectionsToListeners();
        showToast(kind === "audio" ? "🎙 صدای شما برای کلاس فعال شد!" : "📹 تصویر و صدای زنده شما فعال شد!");
      } catch (e) {
        showToast("❌ اجازه دسترسی به میکروفون/دوربین داده نشد: " + (e.message || ""));
      }
    }

    async function flipMyCamera() {
      liveState.facingMode = liveState.facingMode === "user" ? "environment" : "user";
      if (liveState.localMediaKind === "video") {
        await startMyLiveMedia("video");
      } else {
        showToast("دوربین روی حالت " + (liveState.facingMode === "user" ? "سلفی (جلو)" : "پشت (مناسب نمایش کتاب/جزوه)") + " تنظیم شد.");
      }
    }

    function stopMyLiveMedia(silent) {
      if (liveState.localStream) {
        try { liveState.localStream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
      }
      liveState.localStream = null;
      liveState.localMediaKind = "none";
      Object.keys(liveState.outPeers).forEach(function(k) {
        try { liveState.outPeers[k].close(); } catch (e) {}
      });
      liveState.outPeers = {};
      if (!silent) {
        api("/api/app/live/signal", { to: "*", kind: "bye", payload: {} }).catch(function() {});
        buildActiveClassroomDom();
        redrawWhiteboardBase();
        refreshVideoTilesDom();
      }
    }

    async function ensureOutboundConnectionsToListeners() {
      if (!liveState.localStream || liveState.localMediaKind === "none") return;
      for (var i = 0; i < liveState.participants.length; i++) {
        var p = liveState.participants[i];
        if (!p.key || p.key === liveState.myKey) continue;
        var existing = liveState.outPeers[p.key];
        if (existing && existing.connectionState !== "failed" && existing.connectionState !== "closed" && existing.iceConnectionState !== "failed") {
          continue;
        }
        if (existing) {
          try { existing.close(); } catch (e) {}
        }
        await createOutboundOfferTo(p.key);
      }
    }

    async function createOutboundOfferTo(targetKey) {
      try {
        var pc = new RTCPeerConnection(LIVE_ICE_CONFIG);
        liveState.outPeers[targetKey] = pc;

        liveState.localStream.getTracks().forEach(function(track) {
          var sender = pc.addTrack(track, liveState.localStream);
          // بهینه‌سازی نرخ بیت ویدیو برای روانی کامل روی اینترنت موبایل ایران
          if (track.kind === "video" && sender.getParameters && sender.setParameters) {
            try {
              var params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
              params.encodings[0].maxBitrate = 280000;
              sender.setParameters(params).catch(function() {});
            } catch (e) {}
          }
        });

        pc.onicecandidate = function(ev) {
          if (ev.candidate) {
            api("/api/app/live/signal", {
              to: targetKey,
              kind: "ice",
              payload: { dir: "from-broadcaster", candidate: ev.candidate }
            }).catch(function() {});
          }
        };

        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await api("/api/app/live/signal", {
          to: targetKey,
          kind: "offer",
          payload: { sdp: pc.localDescription }
        });
      } catch (e) {}
    }

    async function handleIncomingRtcSignal(sig) {
      if (!sig || !sig.from) return;
      try {
        if (sig.kind === "bye") {
          if (liveState.inPeers[sig.from]) {
            try { liveState.inPeers[sig.from].close(); } catch (e) {}
            delete liveState.inPeers[sig.from];
          }
          delete liveState.remoteStreams[sig.from];
          refreshVideoTilesDom();
          return;
        }

        if (sig.kind === "offer" && sig.payload && sig.payload.sdp) {
          if (liveState.inPeers[sig.from]) {
            try { liveState.inPeers[sig.from].close(); } catch (e) {}
          }
          var pc = new RTCPeerConnection(LIVE_ICE_CONFIG);
          liveState.inPeers[sig.from] = pc;

          pc.ontrack = function(ev) {
            var stream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
            liveState.remoteStreams[sig.from] = stream;
            refreshVideoTilesDom();
          };

          pc.onicecandidate = function(ev) {
            if (ev.candidate) {
              api("/api/app/live/signal", {
                to: sig.from,
                kind: "ice",
                payload: { dir: "from-listener", candidate: ev.candidate }
              }).catch(function() {});
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
          var answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await api("/api/app/live/signal", {
            to: sig.from,
            kind: "answer",
            payload: { sdp: pc.localDescription }
          });
          return;
        }

        if (sig.kind === "answer" && sig.payload && sig.payload.sdp) {
          var outPc = liveState.outPeers[sig.from];
          if (outPc && outPc.signalingState === "have-local-offer") {
            await outPc.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
          }
          return;
        }

        if (sig.kind === "ice" && sig.payload && sig.payload.candidate) {
          if (sig.payload.dir === "from-broadcaster") {
            var inPc = liveState.inPeers[sig.from];
            if (inPc && inPc.remoteDescription) {
              await inPc.addIceCandidate(new RTCIceCandidate(sig.payload.candidate)).catch(function() {});
            }
          } else {
            var oPc = liveState.outPeers[sig.from];
            if (oPc && oPc.remoteDescription) {
              await oPc.addIceCandidate(new RTCIceCandidate(sig.payload.candidate)).catch(function() {});
            }
          }
        }
      } catch (e) {}
    }

    function refreshVideoTilesDom() {
      var grid = document.getElementById("liveVideoTiles");
      if (!grid) return;

      var tiles = [];
      if (liveState.localStream && liveState.localMediaKind !== "none") {
        tiles.push({
          key: "local_self",
          label: (session && session.role === "teacher" ? "👨‍🏫 شما (استاد)" : "🙋 شما"),
          stream: liveState.localStream,
          muted: true,
          kind: liveState.localMediaKind
        });
      }

      Object.keys(liveState.remoteStreams).forEach(function(senderKey) {
        var st = liveState.remoteStreams[senderKey];
        if (!st) return;
        var found = liveState.participants.find(function(x) { return x.key === senderKey; });
        var nm = found ? (found.role === "teacher" ? "👨‍🏫 استاد " + found.name : "🗣 " + found.name) : (senderKey === "teacher" ? "👨‍🏫 استاد کلاس" : "دانش‌آموز");
        var hasVid = st.getVideoTracks && st.getVideoTracks().length > 0;
        tiles.push({
          key: "rem_" + senderKey,
          label: nm,
          stream: st,
          muted: false,
          kind: hasVid ? "video" : "audio"
        });
      });

      grid.classList.toggle("has-two", tiles.length >= 2);

      if (tiles.length === 0) {
        grid.innerHTML =
          '<div class="live-video-tile">' +
            '<div class="muted" style="text-align:center;padding:14px;">🎙 زمانی که استاد میکروفون یا دوربین را روشن کنند، تصویر و صدای زنده اینجا پخش می‌شود.</div>' +
          '</div>';
        return;
      }

      var sigKeys = tiles.map(function(t) { return t.key + ":" + t.kind; }).join("|");
      if (grid.dataset.tileSig !== sigKeys) {
        grid.dataset.tileSig = sigKeys;
        grid.innerHTML = tiles.map(function(t) {
          var audioPlaceholder = t.kind === "audio"
            ? '<div style="text-align:center;padding:24px;"><div style="font-size:34px;">🎙🔊</div><div style="font-weight:800;margin-top:6px;color:#6EE7B7;">پخش زنده صوتی فعال</div></div>'
            : '';
          return '<div class="live-video-tile">' +
            audioPlaceholder +
            '<video id="vid_' + t.key + '" autoplay playsinline ' + (t.muted ? 'muted' : '') + ' style="' + (t.kind === 'audio' ? 'width:1px;height:1px;opacity:0;position:absolute;' : '') + '"></video>' +
            '<div class="live-video-badge" id="vbadge_' + t.key + '">' + esc(t.label) + '</div>' +
          '</div>';
        }).join("");
      }

      tiles.forEach(function(t) {
        var bEl = document.getElementById("vbadge_" + t.key);
        if (bEl) bEl.textContent = t.label;
        var vEl = document.getElementById("vid_" + t.key);
        if (vEl && vEl.srcObject !== t.stream) {
          vEl.srcObject = t.stream;
          vEl.play().catch(function() {});
        }
      });
    }
`;
