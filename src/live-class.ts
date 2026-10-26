// ============================================================================
// 🎥 موتور کلاس مجازی زنده (SmartClass Live Classroom — مشابه Adobe Connect)
// پشتیبانی از: وایت‌برد چندصفحه‌ای همگام، اسلاید عکس و PDF، لیزر، پای‌تخته بردن دانش‌آموز،
// دست بلند کردن (✋)، گفتگوی زنده، نظرسنجی لحظه‌ای و سیگنالینگ WebRTC صوتی/تصویری
// ۱۰۰٪ رایگان، بدون فیلتر و بدون اشغال فضای دیتابیس Turso
// ============================================================================

export interface LiveStrokePoint {
  x: number;
  y: number;
}

export interface LiveStroke {
  seq: number;
  id: string;
  authorId: number;
  authorName: string;
  tool: "pen" | "highlighter" | "eraser" | "line" | "rect" | "circle";
  color: string;
  width: number;
  points: LiveStrokePoint[];
}

export interface LiveBoardPage {
  pageIndex: number;
  bgKind: "blank" | "grid" | "lined" | "green" | "image";
  slideId: string;
  title: string;
  rev: number;
  strokes: LiveStroke[];
}

export interface LiveParticipant {
  key: string; // "teacher" or "st_<uid>"
  role: "teacher" | "student";
  userId: number;
  name: string;
  lastSeen: number;
  handRaised: boolean;
  handRaisedAt: number;
  canSpeak: boolean;
  canDraw: boolean;
  mediaActive: "none" | "audio" | "video" | "screen";
}

export interface LiveChatMsg {
  id: number;
  senderRole: "teacher" | "student";
  senderName: string;
  text: string;
  time: string;
}

export interface LivePollState {
  id: number;
  question: string;
  options: string[];
  active: boolean;
  votes: Record<string, number>; // participantKey -> optionIndex
}

export interface RtcSignalMsg {
  id: number;
  from: string;
  to: string; // target participantKey or "*"
  kind: "offer" | "answer" | "ice" | "bye" | "renegotiate";
  payload: any;
  ts: number;
}

interface LiveClassroomMemory {
  active: boolean;
  roomId: string;
  title: string;
  startedAt: string;
  chatLocked: boolean;
  videoEngine: "webrtc" | "jitsi";
  jitsiRoomName: string;
  currentPage: number;
  strokeSeq: number;
  chatSeq: number;
  signalSeq: number;
  pollSeq: number;
  laser: { x: number; y: number; ts: number; active: boolean };
  pages: LiveBoardPage[];
  slides: Map<string, { bytes: Uint8Array; mime: string }>;
  participants: Map<string, LiveParticipant>;
  attendanceMarked: Set<number>;
  chat: LiveChatMsg[];
  signals: RtcSignalMsg[];
  poll: LivePollState | null;
}

function createFreshPage(pageIndex: number): LiveBoardPage {
  return {
    pageIndex,
    bgKind: "blank",
    slideId: "",
    title: `صفحه ${pageIndex + 1}`,
    rev: 1,
    strokes: [],
  };
}

function initMemory(): LiveClassroomMemory {
  return {
    active: false,
    roomId: "",
    title: "کلاس آنلاین هوشمند",
    startedAt: "",
    chatLocked: false,
    videoEngine: "webrtc",
    jitsiRoomName: "",
    currentPage: 0,
    strokeSeq: 0,
    chatSeq: 0,
    signalSeq: 0,
    pollSeq: 0,
    laser: { x: 500, y: 350, ts: 0, active: false },
    pages: [createFreshPage(0)],
    slides: new Map(),
    participants: new Map(),
    attendanceMarked: new Set(),
    chat: [],
    signals: [],
    poll: null,
  };
}

const gAny = globalThis as any;
const MAX_LIVE_ROOMS = 40;
function getRoomsMap(): Map<string, LiveClassroomMemory> {
  if (!gAny.__smartClassLiveRooms) {
    gAny.__smartClassLiveRooms = new Map<string, LiveClassroomMemory>();
  }
  return gAny.__smartClassLiveRooms as Map<string, LiveClassroomMemory>;
}
function getRoom(roomKey: string): LiveClassroomMemory {
  const map = getRoomsMap();
  let room = map.get(roomKey);
  if (!room) {
    // نگهداری حداکثر ۴۰ اتاق هم‌زمان — اتاق‌های پایان‌یافته اولویت حذف دارند
    if (map.size >= MAX_LIVE_ROOMS) {
      for (const [k, v] of map) {
        if (!v.active && k !== roomKey) {
          map.delete(k);
          if (map.size < MAX_LIVE_ROOMS) break;
        }
      }
    }
    room = initMemory();
    map.set(roomKey, room);
  }
  return room;
}
function findSlideInAnyRoom(id: string): { bytes: Uint8Array; mime: string } | null {
  for (const room of getRoomsMap().values()) {
    const item = room.slides.get(id);
    if (item) return item;
  }
  return null;
}

export function getLiveRoomsStats(): Array<{ roomKey: string; active: boolean; title: string; online: number; schoolId: number; classId: number }> {
  const out: Array<{ roomKey: string; active: boolean; title: string; online: number; schoolId: number; classId: number }> = [];
  for (const [k, v] of getRoomsMap()) {
    const m = /^s(\d+)c(\d+)$/.exec(k);
    out.push({
      roomKey: k,
      active: v.active,
      title: v.title,
      online: v.participants.size,
      schoolId: m ? Number(m[1]) : 0,
      classId: m ? Number(m[2]) : 0,
    });
  }
  return out;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonOut(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  try {
    let mime = "image/jpeg";
    let b64 = dataUrl;
    if (dataUrl.includes(",")) {
      const [hdr, rest] = dataUrl.split(",");
      b64 = rest;
      const m = hdr.match(/data:([^;]+)/i);
      if (m && m[1]) mime = m[1];
    }
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { bytes: out, mime };
  } catch {
    return null;
  }
}

function nowHHMM(): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(11, 16);
  }
}

function pruneStale(room: LiveClassroomMemory) {
  const cutoff = Date.now() - 25000;
  for (const [k, p] of room.participants.entries()) {
    if (p.lastSeen < cutoff) {
      room.participants.delete(k);
    }
  }
  const sigCutoff = Date.now() - 30000;
  if (room.signals.length > 300) {
    room.signals = room.signals.filter((s) => s.ts >= sigCutoff).slice(-200);
  }
}

function buildPollSummary(poll: LivePollState | null) {
  if (!poll) return null;
  const counts = poll.options.map(() => 0);
  let total = 0;
  for (const optIdx of Object.values(poll.votes)) {
    if (optIdx >= 0 && optIdx < counts.length) {
      counts[optIdx]++;
      total++;
    }
  }
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options,
    active: poll.active,
    counts,
    total,
  };
}

export function getLiveRoomPublicStatus(roomKey: string = "default") {
  const room = getRoom(roomKey);
  pruneStale(room);
  return {
    active: room.active,
    roomId: room.roomId,
    title: room.title,
    startedAt: room.startedAt,
    onlineCount: room.participants.size,
    roomKey,
  };
}

export interface LiveClassDeps {
  verifyAuth: (req: Request, url: URL) => Promise<{ role: string; userId?: number; studentId?: number; schoolId?: number; classId?: number; teacherId?: number; name?: string } | null>;
  getStudent: (userId: number) => Promise<{ user_id: number; name: string } | null>;
  getAllStudents: () => Promise<Array<{ user_id: number; name: string }>>;
  markStudentPresentToday: (userId: number, name: string) => Promise<void>;
  notifyTelegramClassStarted: (title: string) => Promise<number>;
  teacherName: string;
  // ---- پشتیبانی چندمدرسه‌ای (اختیاری) ----
  classAccess?: (schoolId: number, classId: number, auth: { role: string; teacherId?: number; studentId?: number }) => Promise<{ ok: boolean; name?: string; myUserId?: number }>;
  classRoster?: (schoolId: number, classId: number) => Promise<Array<{ user_id: number; name: string }>>;
  markClassStudentPresent?: (schoolId: number, classId: number, uid: number, name: string) => Promise<void>;
  notifyClassStarted?: (schoolId: number, classId: number, title: string) => Promise<number>;
}

export async function handleLiveClassRequest(
  request: Request,
  url: URL,
  deps: LiveClassDeps
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/app/live/")) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // ۱. سرو تصویر اسلاید تخته (با کش مرورگر برای مصرف نزدیک به صفر اینترنت)
  if (path === "/api/app/live/slide-img" && request.method === "GET") {
    const id = (url.searchParams.get("id") || "").trim();
    const item = findSlideInAnyRoom(id);
    if (!item) return jsonOut({ error: "اسلاید یافت نشد" }, 404);
    return new Response(item.bytes as any, {
      status: 200,
      headers: {
        "Content-Type": item.mime,
        "Cache-Control": "public, max-age=7200",
        ...CORS_HEADERS,
      },
    });
  }

  // احراز هویت معلم یا دانش‌آموز (تک‌مدرسه‌ای قدیمی یا چندمدرسه‌ای)
  const auth = await deps.verifyAuth(request, url);
  const role = String((auth as any)?.role || "");
  const isLegacyTeacher = role === "teacher";
  const isLegacyStudent = role === "student";
  const isMs = role.startsWith("ms_");
  if (!auth || (!isLegacyTeacher && !isLegacyStudent && !isMs)) {
    return jsonOut({ error: "لطفاً وارد حساب کاربری خود شوید." }, 401);
  }
  if (role === "ms_parent") {
    return jsonOut({ error: "والدین به اتاق کلاس زنده دسترسی ندارند." }, 403);
  }

  // کلید اتاق: «default» برای کلاس قبلی | «s{schoolId}c{classId}» برای مدارس
  const roomKeyRaw = (url.searchParams.get("room") || "").trim();
  const roomKey = roomKeyRaw || "default";
  const mKey = /^s(\d+)c(\d+)$/.exec(roomKey);
  const roomSchoolId = mKey ? Number(mKey[1]) : 0;
  const roomClassId = mKey ? Number(mKey[2]) : 0;

  let isTeacher = isLegacyTeacher;
  let myKey = "teacher";
  let myUserId = 0;
  let myName = deps.teacherName || "استاد کلاس";

  if (isMs) {
    if (!mKey) return jsonOut({ error: "اتاق کلاس نامعتبر است." }, 403);
    if (Number((auth as any).schoolId || 0) !== roomSchoolId) {
      return jsonOut({ error: "شما به این کلاس دسترسی ندارید." }, 403);
    }
    isTeacher = role === "ms_teacher" || role === "ms_admin" || role === "ms_super";
    if (deps.classAccess) {
      const acc = await deps.classAccess(roomSchoolId, roomClassId, {
        role,
        teacherId: Number((auth as any).teacherId || 0),
        studentId: Number((auth as any).studentId || 0),
      });
      if (!acc.ok) return jsonOut({ error: "شما به این کلاس دسترسی ندارید." }, 403);
      myName = acc.name || myName;
      if (!isTeacher) {
        myUserId = Number(acc.myUserId || (auth as any).studentId || 0);
        myKey = `st_${myUserId}`;
      }
    } else if (!isTeacher) {
      myUserId = Number((auth as any).studentId || 0);
      myKey = `st_${myUserId}`;
      myName = (auth as any).name || myName;
    }
  } else {
    // کلاس قبلی (تک‌مدرسه‌ای) فقط در اتاق default
    if (mKey) return jsonOut({ error: "شما به این کلاس دسترسی ندارید." }, 403);
    if (!isTeacher) {
      myUserId = Number(auth.userId || 0);
      const st = await deps.getStudent(myUserId);
      if (!st) return jsonOut({ error: "دانش‌آموز یافت نشد." }, 404);
      myKey = `st_${myUserId}`;
      myName = st.name;
    }
  }

  const room = getRoom(roomKey);

  const markPresent = async () => {
    try {
      if (mKey) {
        if (deps.markClassStudentPresent) {
          await deps.markClassStudentPresent(roomSchoolId, roomClassId, myUserId, myName);
        }
      } else {
        await deps.markStudentPresentToday(myUserId, myName);
      }
    } catch {}
  };
  const notifyStart = async (title: string): Promise<number> => {
    if (mKey && deps.notifyClassStarted) {
      return await deps.notifyClassStarted(roomSchoolId, roomClassId, title);
    }
    return await deps.notifyTelegramClassStarted(title);
  };

  // ۲. شروع کلاس آنلاین توسط معلم
  if (path === "/api/app/live/start" && request.method === "POST") {
    if (!isTeacher) return jsonOut({ error: "فقط معلم می‌تواند کلاس را شروع کند." }, 403);
    const body = (await request.json().catch(() => ({}))) as any;
    const title = String(body.title || "کلاس آنلاین هوشمند").trim() || "کلاس آنلاین هوشمند";
    const notifyTelegram = body.notifyTelegram !== false;

    const randSuffix = Math.random().toString(36).slice(2, 8);
    room.active = true;
    room.roomId = `room_${Date.now()}_${randSuffix}`;
    room.title = title;
    room.startedAt = nowHHMM();
    room.chatLocked = false;
    room.videoEngine = "webrtc";
    room.jitsiRoomName = `SmartClassIran_${Date.now().toString(36)}_${randSuffix}`;
    room.currentPage = 0;
    room.strokeSeq = 0;
    room.chatSeq = 0;
    room.signalSeq = 0;
    room.laser = { x: 500, y: 350, ts: 0, active: false };
    room.pages = [createFreshPage(0)];
    room.slides.clear();
    room.participants.clear();
    room.attendanceMarked.clear();
    room.chat = [
      {
        id: ++room.chatSeq,
        senderRole: "teacher",
        senderName: myName,
        text: `🟢 کلاس «${title}» آغاز شد! خوش آمدید 🌟`,
        time: nowHHMM(),
      },
    ];
    room.signals = [];
    room.poll = null;

    room.participants.set("teacher", {
      key: "teacher",
      role: "teacher",
      userId: 0,
      name: myName,
      lastSeen: Date.now(),
      handRaised: false,
      handRaisedAt: 0,
      canSpeak: true,
      canDraw: true,
      mediaActive: "none",
    });

    let notified = 0;
    if (notifyTelegram) {
      notified = await notifyStart(title).catch(() => 0);
    }

    return jsonOut({ ok: true, roomId: room.roomId, notified });
  }

  // ۳. پایان کلاس آنلاین توسط معلم
  if (path === "/api/app/live/stop" && request.method === "POST") {
    if (!isTeacher) return jsonOut({ error: "غیرمجاز" }, 403);
    room.active = false;
    room.slides.clear();
    room.signals = [];
    room.participants.clear();
    room.poll = null;
    return jsonOut({ ok: true });
  }

  // ۴. همگام‌سازی لحظه‌ای وضعیت کلاس، تخته، چت، حاضرین و سیگنالینگ WebRTC
  if (path === "/api/app/live/sync") {
    pruneStale(room);

    if (!room.active) {
      return jsonOut({ active: false });
    }

    let body: any = {};
    if (request.method === "POST") {
      body = await request.json().catch(() => ({}));
    }

    // ثبت حضور لحظه‌ای کاربر در اتاق + ثبت خودکار حاضری امروز در دیتابیس
    let me = room.participants.get(myKey);
    if (!me) {
      me = {
        key: myKey,
        role: isTeacher ? "teacher" : "student",
        userId: myUserId,
        name: myName,
        lastSeen: Date.now(),
        handRaised: false,
        handRaisedAt: 0,
        canSpeak: isTeacher,
        canDraw: isTeacher,
        mediaActive: "none",
      };
      room.participants.set(myKey, me);
    } else {
      me.lastSeen = Date.now();
      me.name = myName;
    }

    if (typeof body.mediaActive === "string") {
      if (isTeacher || me.canSpeak || body.mediaActive === "none") {
        me.mediaActive = body.mediaActive as any;
      } else {
        me.mediaActive = "none";
      }
    }

    // ثبت خودکار حضور دانش‌آموز در جدول حضوروغیاب امروز (فقط یک‌بار در هر جلسه)
    if (!isTeacher && myUserId > 0 && !room.attendanceMarked.has(myUserId)) {
      room.attendanceMarked.add(myUserId);
      markPresent();
    }

    // دریافت حرکات لیزر از معلم (در صورت ارسال همراه sync یا جداگانه)
    if (isTeacher && body.laser && typeof body.laser.x === "number") {
      room.laser = {
        x: body.laser.x,
        y: body.laser.y,
        ts: Date.now(),
        active: Boolean(body.laser.active),
      };
    }

    const clientPage = Number(body.pageIndex ?? -1);
    const clientPageRev = Number(body.pageRev ?? 0);
    const sinceStrokeSeq = Number(body.sinceStrokeSeq ?? 0);
    const sinceChatId = Number(body.sinceChatId ?? 0);
    const sinceSignalId = Number(body.sinceSignalId ?? 0);

    const curPage = room.pages[room.currentPage] || room.pages[0];
    const needFullBoard = clientPage !== room.currentPage || clientPageRev !== curPage.rev;

    const deltaStrokes = needFullBoard
      ? curPage.strokes
      : curPage.strokes.filter((s) => s.seq > sinceStrokeSeq);

    const newChats =
      sinceChatId === 0
        ? room.chat.slice(-40)
        : room.chat.filter((c) => c.id > sinceChatId);

    const mySignals = room.signals.filter(
      (s) => s.id > sinceSignalId && s.from !== myKey && (s.to === myKey || s.to === "*")
    );
    const maxSigId = room.signals.length > 0 ? room.signals[room.signals.length - 1].id : sinceSignalId;

    const participantsList = Array.from(room.participants.values()).sort((a, b) => {
      if (a.role === "teacher") return -1;
      if (b.role === "teacher") return 1;
      if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
      return a.name.localeCompare(b.name, "fa");
    });

    const laserActive = room.laser.active && Date.now() - room.laser.ts < 4500;

    return jsonOut({
      active: true,
      roomId: room.roomId,
      title: room.title,
      startedAt: room.startedAt,
      myKey,
      myPermissions: {
        canSpeak: isTeacher || me.canSpeak,
        canDraw: isTeacher || me.canDraw,
        handRaised: me.handRaised,
      },
      chatLocked: room.chatLocked,
      videoEngine: room.videoEngine,
      jitsiRoomName: room.jitsiRoomName,
      currentPage: room.currentPage,
      totalPages: room.pages.length,
      pageMeta: {
        pageIndex: curPage.pageIndex,
        bgKind: curPage.bgKind,
        slideId: curPage.slideId,
        title: curPage.title,
        rev: curPage.rev,
      },
      fullBoard: needFullBoard,
      strokes: deltaStrokes,
      latestStrokeSeq: room.strokeSeq,
      laser: laserActive ? { x: room.laser.x, y: room.laser.y, active: true } : { active: false },
      participants: participantsList,
      chats: newChats,
      signals: mySignals,
      latestSignalId: maxSigId,
      poll: buildPollSummary(room.poll),
      myPollVote: room.poll ? (room.poll.votes[myKey] ?? -1) : -1,
    });
  }

  if (!room.active) {
    return jsonOut({ error: "کلاس آنلاین در حال حاضر فعال نیست." }, 400);
  }

  const me = room.participants.get(myKey);

  // ۵. عملیات وایت‌برد (رسم خط، شکل، پاک‌کن، واگرد، تغییر صفحه، پس‌زمینه و لیزر)
  if (path === "/api/app/live/board" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;
    const action = String(body.action || "");
    const curPage = room.pages[room.currentPage] || room.pages[0];

    if (action === "laser" && isTeacher) {
      room.laser = {
        x: Number(body.x || 500),
        y: Number(body.y || 350),
        ts: Date.now(),
        active: Boolean(body.active),
      };
      return jsonOut({ ok: true });
    }

    if (action === "stroke") {
      if (!isTeacher && !me?.canDraw) {
        return jsonOut({ error: "اجازه نوشتن روی تخته فعال نیست." }, 403);
      }
      const rawPts = Array.isArray(body.points) ? body.points : [];
      if (rawPts.length === 0) return jsonOut({ ok: true });
      const cleanPts: LiveStrokePoint[] = rawPts.slice(0, 600).map((p: any) => ({
        x: Math.round(Number(p.x || 0) * 10) / 10,
        y: Math.round(Number(p.y || 0) * 10) / 10,
      }));
      const stItem: LiveStroke = {
        seq: ++room.strokeSeq,
        id: String(body.id || `st_${room.strokeSeq}`),
        authorId: myUserId,
        authorName: myName,
        tool: body.tool || "pen",
        color: String(body.color || "#1E293B"),
        width: Math.max(1, Math.min(42, Number(body.width || 4))),
        points: cleanPts,
      };
      curPage.strokes.push(stItem);
      if (curPage.strokes.length > 800) {
        curPage.strokes = curPage.strokes.slice(-800);
      }
      return jsonOut({ ok: true, seq: stItem.seq });
    }

    if (!isTeacher) {
      return jsonOut({ error: "فقط معلم می‌تواند تنظیمات صفحات تخته را تغییر دهد." }, 403);
    }

    if (action === "undo") {
      curPage.strokes.pop();
      curPage.rev++;
      return jsonOut({ ok: true });
    }

    if (action === "clear") {
      curPage.strokes = [];
      curPage.rev++;
      return jsonOut({ ok: true });
    }

    if (action === "bg") {
      const bgKind = body.bgKind || "blank";
      curPage.bgKind = bgKind;
      if (bgKind !== "image") curPage.slideId = "";
      curPage.rev++;
      return jsonOut({ ok: true });
    }

    if (action === "set-page") {
      const target = Number(body.pageIndex ?? 0);
      if (target >= 0 && target < room.pages.length) {
        room.currentPage = target;
      }
      return jsonOut({ ok: true, currentPage: room.currentPage });
    }

    if (action === "new-page") {
      if (room.pages.length >= 35) {
        return jsonOut({ error: "حداکثر ۳۵ صفحه در هر جلسه قابل ایجاد است." }, 400);
      }
      const nextIdx = room.pages.length;
      room.pages.push(createFreshPage(nextIdx));
      room.currentPage = nextIdx;
      return jsonOut({ ok: true, currentPage: room.currentPage, totalPages: room.pages.length });
    }

    return jsonOut({ ok: true });
  }

  // ۶. بارگذاری اسلاید عکس یا صفحات PDF روی تخته توسط معلم
  if (path === "/api/app/live/slide" && request.method === "POST") {
    if (!isTeacher) return jsonOut({ error: "فقط معلم می‌تواند فایل روی تخته قرار دهد." }, 403);
    const body = (await request.json().catch(() => ({}))) as any;
    const decoded = decodeDataUrl(String(body.imageB64 || ""));
    if (!decoded) return jsonOut({ error: "فرمت تصویر اسلاید معتبر نیست." }, 400);

    if (room.slides.size >= 40) {
      const oldestKey = room.slides.keys().next().value;
      if (oldestKey) room.slides.delete(oldestKey);
    }

    const slideId = `sl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    room.slides.set(slideId, decoded);

    const mode = String(body.mode || "current"); // "current" | "append"
    const slideTitle = String(body.title || "").trim();

    if (mode === "append" && room.pages.length < 35) {
      const idx = room.pages.length;
      const p = createFreshPage(idx);
      p.bgKind = "image";
      p.slideId = slideId;
      if (slideTitle) p.title = slideTitle;
      room.pages.push(p);
      if (body.jumpTo === true) room.currentPage = idx;
      return jsonOut({ ok: true, slideId, pageIndex: idx, totalPages: room.pages.length });
    } else {
      const curPage = room.pages[room.currentPage] || room.pages[0];
      curPage.bgKind = "image";
      curPage.slideId = slideId;
      if (slideTitle) curPage.title = slideTitle;
      curPage.rev++;
      return jsonOut({ ok: true, slideId, pageIndex: curPage.pageIndex, totalPages: room.pages.length });
    }
  }

  // ۷. دست بلند کردن دانش‌آموز و مدیریت مجوز میکروفون / تخته توسط معلم
  if (path === "/api/app/live/hand" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;

    if (!isTeacher) {
      if (me) {
        me.handRaised = Boolean(body.raised);
        me.handRaisedAt = me.handRaised ? Date.now() : 0;
      }
      return jsonOut({ ok: true, handRaised: me?.handRaised || false });
    }

    // دستورات مدیریتی معلم روی دانش‌آموزان یا موتور ویدیو
    const targetKey = String(body.targetKey || "");
    const cmd = String(body.cmd || "");

    if (cmd === "video-engine") {
      room.videoEngine = body.engine === "jitsi" ? "jitsi" : "webrtc";
      return jsonOut({ ok: true, videoEngine: room.videoEngine });
    }

    if (cmd === "mute-all") {
      for (const p of room.participants.values()) {
        if (p.role === "student") {
          p.canSpeak = false;
          p.handRaised = false;
          p.mediaActive = "none";
        }
      }
      room.signals.push({
        id: ++room.signalSeq,
        from: "teacher",
        to: "*",
        kind: "bye",
        payload: { reason: "mute-all" },
        ts: Date.now(),
      });
      return jsonOut({ ok: true });
    }

    const target = room.participants.get(targetKey);
    if (!target) return jsonOut({ error: "دانش‌آموز در کلاس آنلاین نیست." }, 404);

    if (cmd === "toggle-speak") {
      target.canSpeak = !target.canSpeak;
      if (target.canSpeak) target.handRaised = false;
      else {
        target.mediaActive = "none";
        room.signals.push({
          id: ++room.signalSeq,
          from: "teacher",
          to: targetKey,
          kind: "bye",
          payload: { reason: "muted-by-teacher" },
          ts: Date.now(),
        });
      }
    } else if (cmd === "toggle-draw") {
      target.canDraw = !target.canDraw;
    } else if (cmd === "lower-hand") {
      target.handRaised = false;
    }

    return jsonOut({
      ok: true,
      canSpeak: target.canSpeak,
      canDraw: target.canDraw,
      handRaised: target.handRaised,
    });
  }

  // ۸. گفتگوی متنی زنده کلاس (با قابلیت قفل و پاکسازی توسط معلم)
  if (path === "/api/app/live/chat" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;

    if (isTeacher && body.action === "toggle-lock") {
      room.chatLocked = !room.chatLocked;
      return jsonOut({ ok: true, chatLocked: room.chatLocked });
    }
    if (isTeacher && body.action === "clear") {
      room.chat = [];
      return jsonOut({ ok: true });
    }

    if (!isTeacher && room.chatLocked) {
      return jsonOut({ error: "گفتگوی کلاس در حال حاضر توسط معلم قفل شده است." }, 403);
    }

    const txt = String(body.text || "").trim().slice(0, 500);
    if (!txt) return jsonOut({ ok: true });

    const msg: LiveChatMsg = {
      id: ++room.chatSeq,
      senderRole: isTeacher ? "teacher" : "student",
      senderName: myName,
      text: txt,
      time: nowHHMM(),
    };
    room.chat.push(msg);
    if (room.chat.length > 120) room.chat = room.chat.slice(-120);
    return jsonOut({ ok: true, msg });
  }

  // ۹. نظرسنجی و پرسش چهارگزینه‌ای لحظه‌ای وسط تدریس (Live Poll)
  if (path === "/api/app/live/poll" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;
    const action = String(body.action || "");

    if (action === "create" && isTeacher) {
      const q = String(body.question || "آیا این مبحث را کامل متوجه شدید؟").trim();
      const opts = Array.isArray(body.options) && body.options.length >= 2
        ? body.options.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 5)
        : ["✅ بله، کاملاً متوجه شدم", "🤔 نیاز به یک مثال دیگر دارم", "❓ متوجه نشدم، لطفاً دوباره توضیح دهید"];
      room.poll = {
        id: ++room.pollSeq,
        question: q,
        options: opts,
        active: true,
        votes: {},
      };
      return jsonOut({ ok: true, poll: buildPollSummary(room.poll) });
    }

    if (action === "close" && isTeacher) {
      if (room.poll) room.poll.active = false;
      return jsonOut({ ok: true });
    }

    if (action === "clear" && isTeacher) {
      room.poll = null;
      return jsonOut({ ok: true });
    }

    if (action === "vote") {
      if (!room.poll || !room.poll.active) {
        return jsonOut({ error: "نظرسنجی فعال نیست." }, 400);
      }
      const optIdx = Number(body.optionIndex ?? -1);
      if (optIdx >= 0 && optIdx < room.poll.options.length) {
        room.poll.votes[myKey] = optIdx;
      }
      return jsonOut({ ok: true, poll: buildPollSummary(room.poll) });
    }
  }

  // ۱۰. پیام‌رسان سیگنالینگ WebRTC (Offer / Answer / ICE Candidate)
  if (path === "/api/app/live/signal" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;
    const to = String(body.to || "").trim();
    const kind = body.kind;
    if (!to || !kind) return jsonOut({ error: "پارامتر ناقص" }, 400);

    room.signals.push({
      id: ++room.signalSeq,
      from: myKey,
      to,
      kind,
      payload: body.payload ?? null,
      ts: Date.now(),
    });
    return jsonOut({ ok: true, id: room.signalSeq });
  }

  return jsonOut({ error: "مسیر نامعتبر" }, 404);
}
