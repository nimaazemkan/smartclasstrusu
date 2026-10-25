import type { D1Database } from "./turso-d1";
import { Bot, Context, webhookCallback, InputFile, Keyboard, InlineKeyboard } from "grammy";
import * as jalaali from "jalaali-js";

// پلی‌فیل Iterator برای سازگاری کامل unpdf در تمام نسخه‌های V8 و Node
if (typeof (globalThis as any).Iterator === "undefined") {
  const iterProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  (globalThis as any).Iterator = function Iterator() {};
  (globalThis as any).Iterator.prototype = iterProto;
}

// ==================== تنظیمات ====================
export const SCHOOL_NAME = process.env.SCHOOL_NAME || "کلاس هوشمند";
export const BOT_TOKEN = process.env.BOT_TOKEN || "8896172756:AAF-KYUEPl_Eaaf9fUSbWWUfOuJdt8kI-XA";
export const TEACHER_ID = Number(process.env.TEACHER_ID || 153365407);
export const TEACHER_NAME = process.env.TEACHER_NAME || "نیما آزمکان";
export const PANEL_PASSWORD = process.env.PANEL_PASSWORD || "Mina1362@";

const LEVELS = [
  { level: 1, name: "🌱 تازه‌کار", minScore: 0 },
  { level: 2, name: "📚 مبتدی", minScore: 10 },
  { level: 3, name: "⭐ فعال", minScore: 25 },
  { level: 4, name: "🌟 ماهر", minScore: 50 },
  { level: 5, name: "💫 حرفه‌ای", minScore: 100 },
  { level: 6, name: "🏆 استاد", minScore: 200 },
  { level: 7, name: "👑 افسانه", minScore: 400 },
];

const MOTIVATIONS = ["💪 ادامه بده، داری عالی پیش می‌ری!", "🌟 هر تلاشی که می‌کنی، تو رو قوی‌تر می‌کنه!", "🚀 موفقیت از همین قدم‌های کوچیک شروع می‌شه!", "🎯 هدفت رو یادت باشه، تو می‌تونی!", "📚 یادگیری یه سفر هیجان‌انگیزه!"];
const BIRTHDAY_MESSAGES = ["🎂 امیدوارم امسال پر از موفقیت، شادی و لحظه‌های قشنگ باشه!", "🌟 تولدت مبارک! امیدوارم بهترین سال زندگی‌ات باشه!", "🎉 امروز روز توئه! جشن بگیر و خوشحال باش!", "🎁 امیدوارم امسال همه آرزوهای قشنگت برآورده بشه!"];

const waitingBroadcast: Record<number, boolean> = {};
const waitingAiQuestion: Record<number, boolean> = {};

export interface Env {
  telegram_bot_db: D1Database;
  GROQ_API_KEY: string;
  PUBLIC_APP_URL?: string;
  AI?: any;
}

interface Student { user_id: number; name: string; score: number; joined: string; streak: number; last_hw_date: string; birthday: string; max_streak: number; level: number; parent_chat_id: number; parent_name: string; grade: string; }
interface Homework { id: number; user_id: number; name: string; date: string; type: string; score: number; feedback: string; teacher_msg_id: number; }
interface Deadline { id: number; title: string; due_date: string; created: string; }
interface Badge { id: number; user_id: number; badge: string; date: string; }
interface Quiz { id: number; question: string; options: string; correct: number; points: number; created: string; }
interface QuizAnswer { id: number; quiz_id: number; user_id: number; name: string; answer: number; is_correct: number; date: string; }

// ==================== دیتابیس ====================
async function getStudent(db: D1Database, userId: number): Promise<Student | null> { return await db.prepare("SELECT * FROM students WHERE user_id = ?").bind(userId).first<Student>(); }
async function saveStudent(db: D1Database, userId: number, name: string, grade: string) {
  const joined = new Date().toISOString();
  await db.prepare("INSERT INTO students (user_id, name, score, joined, level, grade) VALUES (?, ?, 0, ?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, grade = excluded.grade").bind(userId, name, joined, grade).run();
}
async function updateScore(db: D1Database, userId: number, delta: number): Promise<Student | null> { await db.prepare("UPDATE students SET score = score + ? WHERE user_id = ?").bind(delta, userId).run(); await updateLevel(db, userId); return await getStudent(db, userId); }
async function getStudentByName(db: D1Database, name: string): Promise<Student | null> { return await db.prepare("SELECT * FROM students WHERE name = ?").bind(name).first<Student>(); }
async function getAllStudents(db: D1Database): Promise<Student[]> { return (await db.prepare("SELECT * FROM students WHERE name != '' ORDER BY score DESC").all<Student>()).results; }
async function resetScores(db: D1Database) { await db.prepare("UPDATE students SET score = 0, level = 1").run(); }
async function setBirthday(db: D1Database, userId: number, birthday: string) { await db.prepare("UPDATE students SET birthday = ? WHERE user_id = ?").bind(birthday, userId).run(); }
async function setParent(db: D1Database, userId: number, parentChatId: number) { await db.prepare("UPDATE students SET parent_chat_id = ? WHERE user_id = ?").bind(parentChatId, userId).run(); }
async function updateLevel(db: D1Database, userId: number): Promise<number> {
  const student = await getStudent(db, userId); if (!student) return 1;
  let newLevel = 1; for (const l of LEVELS) { if (student.score >= l.minScore) newLevel = l.level; }
  if (newLevel !== student.level) await db.prepare("UPDATE students SET level = ? WHERE user_id = ?").bind(newLevel, userId).run();
  return newLevel;
}
function getLevelInfo(level: number) { return LEVELS.find((l) => l.level === level) || LEVELS[0]; }
function getNextLevelInfo(level: number) { return LEVELS.find((l) => l.level === level + 1) || null; }
async function updateStreak(db: D1Database, userId: number): Promise<{ streak: number; isNew: boolean }> {
  const student = await getStudent(db, userId); if (!student) return { streak: 0, isNew: false };
  const today = new Date().toISOString().split("T")[0]; const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  let newStreak = student.streak || 0; let isNew = false;
  if (student.last_hw_date === today) return { streak: newStreak, isNew: false };
  else if (student.last_hw_date === yesterday) { newStreak += 1; isNew = true; } else { newStreak = 1; isNew = true; }
  const maxStreak = Math.max(student.max_streak || 0, newStreak);
  await db.prepare("UPDATE students SET streak = ?, last_hw_date = ?, max_streak = ? WHERE user_id = ?").bind(newStreak, today, maxStreak, userId).run();
  return { streak: newStreak, isNew };
}
async function addHomework(db: D1Database, userId: number, name: string, type: string): Promise<number> { return (await db.prepare("INSERT INTO homework (user_id, name, date, type) VALUES (?, ?, ?, ?)").bind(userId, name, new Date().toISOString(), type).run()).meta.last_row_id as number; }
async function setTeacherMsgId(db: D1Database, hwId: number, msgId: number) { await db.prepare("UPDATE homework SET teacher_msg_id = ? WHERE id = ?").bind(msgId, hwId).run(); }
async function getHomework(db: D1Database, userId: number): Promise<Homework[]> { return (await db.prepare("SELECT * FROM homework WHERE user_id = ? ORDER BY date DESC").bind(userId).all<Homework>()).results; }
async function getAllHomework(db: D1Database, limit: number = 20): Promise<Homework[]> { return (await db.prepare("SELECT * FROM homework ORDER BY date DESC LIMIT ?").bind(limit).all<Homework>()).results; }
async function getHomeworkById(db: D1Database, id: number): Promise<Homework | null> { return await db.prepare("SELECT * FROM homework WHERE id = ?").bind(id).first<Homework>(); }
async function setHomeworkFeedback(db: D1Database, id: number, score: number, feedback: string) { await db.prepare("UPDATE homework SET score = ?, feedback = ? WHERE id = ?").bind(score, feedback, id).run(); }
async function deleteHomework(db: D1Database, id: number) { await db.prepare("DELETE FROM homework WHERE id = ?").bind(id).run(); }
async function getAbsentStudents(db: D1Database, date: string): Promise<Student[]> { return (await db.prepare("SELECT * FROM students WHERE name != '' AND user_id NOT IN (SELECT DISTINCT user_id FROM homework WHERE date LIKE ?)").bind(`${date}%`).all<Student>()).results; }
async function addDeadline(db: D1Database, title: string, dueDate: string): Promise<number> { return (await db.prepare("INSERT INTO deadlines (title, due_date, created) VALUES (?, ?, ?)").bind(title, dueDate, new Date().toISOString()).run()).meta.last_row_id as number; }
async function getAllDeadlines(db: D1Database): Promise<Deadline[]> { return (await db.prepare("SELECT * FROM deadlines ORDER BY due_date DESC LIMIT 10").all<Deadline>()).results; }
async function getActiveDeadlines(db: D1Database): Promise<Deadline[]> { return (await db.prepare("SELECT * FROM deadlines ORDER BY due_date ASC LIMIT 5").all<Deadline>()).results; }
async function deleteDeadline(db: D1Database, id: number) { await db.prepare("DELETE FROM deadlines WHERE id = ?").bind(id).run(); }
async function addBadge(db: D1Database, userId: number, badge: string) { await db.prepare("INSERT INTO badges (user_id, badge, date) VALUES (?, ?, ?)").bind(userId, badge, new Date().toISOString()).run(); }
async function getBadges(db: D1Database, userId: number): Promise<Badge[]> { return (await db.prepare("SELECT * FROM badges WHERE user_id = ? ORDER BY date DESC").bind(userId).all<Badge>()).results; }
async function hasBadge(db: D1Database, userId: number, badge: string): Promise<boolean> { return ((await db.prepare("SELECT COUNT(*) as c FROM badges WHERE user_id = ? AND badge = ?").bind(userId, badge).first<{ c: number }>())?.c || 0) > 0; }
async function checkAndAwardBadges(db: D1Database, userId: number): Promise<string[]> {
  const hw = await getHomework(db, userId); const student = await getStudent(db, userId); if (!student) return [];
  const newBadges: string[] = [];
  if (hw.length >= 10 && !(await hasBadge(db, userId, "🎯 تکلیف‌کوش"))) { await addBadge(db, userId, "🎯 تکلیف‌کوش"); newBadges.push("🎯 تکلیف‌کوش"); }
  if (hw.filter((h) => h.score >= 20).length >= 5 && !(await hasBadge(db, userId, "🌟 نابغه"))) { await addBadge(db, userId, "🌟 نابغه"); newBadges.push("🌟 نابغه"); }
  if (student.score >= 50 && !(await hasBadge(db, userId, "👑 سلطان کلاس"))) { await addBadge(db, userId, "👑 سلطان کلاس"); newBadges.push("👑 سلطان کلاس"); }
  const streak = student.streak || 0;
  if (streak >= 3 && !(await hasBadge(db, userId, "🔥 ۳ روزه"))) { await addBadge(db, userId, "🔥 ۳ روزه"); newBadges.push("🔥 ۳ روزه"); }
  if (streak >= 7 && !(await hasBadge(db, userId, "🔥 ۷ روزه"))) { await addBadge(db, userId, "🔥 ۷ روزه"); newBadges.push("🔥 ۷ روزه"); }
  return newBadges;
}

// ---- کوییز ----
async function addQuiz(db: D1Database, question: string, options: string[], correct: number, points: number): Promise<number> { return (await db.prepare("INSERT INTO quizzes (question, options, correct, points, created) VALUES (?, ?, ?, ?, ?)").bind(question, JSON.stringify(options), correct, points, new Date().toISOString()).run()).meta.last_row_id as number; }
async function getQuizById(db: D1Database, id: number): Promise<Quiz | null> { return await db.prepare("SELECT * FROM quizzes WHERE id = ?").bind(id).first<Quiz>(); }
async function getLatestQuiz(db: D1Database): Promise<Quiz | null> { return await db.prepare("SELECT * FROM quizzes ORDER BY id DESC LIMIT 1").first<Quiz>(); }
async function answerQuiz(db: D1Database, quizId: number, userId: number, name: string, answer: number, isCorrect: number) { await db.prepare("INSERT INTO quiz_answers (quiz_id, user_id, name, answer, is_correct, date) VALUES (?, ?, ?, ?, ?, ?)").bind(quizId, userId, name, answer, isCorrect, new Date().toISOString()).run(); }
async function hasAnsweredQuiz(db: D1Database, quizId: number, userId: number): Promise<boolean> { return ((await db.prepare("SELECT COUNT(*) as c FROM quiz_answers WHERE quiz_id = ? AND user_id = ?").bind(quizId, userId).first<{ c: number }>())?.c || 0) > 0; }
async function getQuizResults(db: D1Database, quizId: number): Promise<QuizAnswer[]> { return (await db.prepare("SELECT * FROM quiz_answers WHERE quiz_id = ? ORDER BY is_correct DESC, date ASC").bind(quizId).all<QuizAnswer>()).results; }

const DAILY_MISSIONS = ["📚 یک کتاب غیردرسی بخون", "✍️ یک تمرین اضافی حل کن", "🎥 یک ویدیو آموزشی ببین", "❓ یک سوال از معلم بپرس", "👥 به یک همکلاسی کمک کن", "📝 یک خلاصه از درس بنویس"];
async function getTodayMission(db: D1Database, userId: number): Promise<any> { return await db.prepare("SELECT * FROM missions WHERE user_id = ? AND date LIKE ?").bind(userId, `${new Date().toISOString().split("T")[0]}%`).first(); }
async function getMissionById(db: D1Database, id: number): Promise<any> { return await db.prepare("SELECT * FROM missions WHERE id = ?").bind(id).first(); }
async function createMission(db: D1Database, userId: number, name: string, mission: string): Promise<number> { return (await db.prepare("INSERT INTO missions (user_id, name, mission, date, done) VALUES (?, ?, ?, ?, 0)").bind(userId, name, mission, new Date().toISOString()).run()).meta.last_row_id as number; }
async function setMissionStatus(db: D1Database, id: number, status: number) { await db.prepare("UPDATE missions SET done = ? WHERE id = ?").bind(status, id).run(); }
async function completeMission(db: D1Database, id: number) { await setMissionStatus(db, id, 1); }
async function getMissionStats(db: D1Database, userId: number): Promise<{ total: number; done: number }> {
  const res = await db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as done FROM missions WHERE user_id = ?").bind(userId).first<{ total: number; done: number }>();
  return { total: res?.total || 0, done: res?.done || 0 };
}

// ==================== ذخیره وضعیت پایدار در دیتابیس D1 ====================
async function ensureBotStateTable(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS bot_state (key TEXT PRIMARY KEY, value TEXT, updated TEXT)").run();
}
async function setBotState(db: D1Database, key: string, value: any) {
  await ensureBotStateTable(db);
  await db
    .prepare("INSERT INTO bot_state (key, value, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated")
    .bind(key, JSON.stringify(value), new Date().toISOString())
    .run();
}
async function getBotState<T = any>(db: D1Database, key: string): Promise<T | null> {
  try {
    await ensureBotStateTable(db);
    const row = await db.prepare("SELECT value FROM bot_state WHERE key = ?").bind(key).first<{ value: string }>();
    return row?.value ? (JSON.parse(row.value) as T) : null;
  } catch {
    return null;
  }
}
async function deleteBotState(db: D1Database, key: string) {
  try {
    await ensureBotStateTable(db);
    await db.prepare("DELETE FROM bot_state WHERE key = ?").bind(key).run();
  } catch {}
}

// ==================== جداول خودکار امکانات پیشرفته کلاس (بدون نیاز به SQL دستی) ====================
const initializedExtraDbs = new WeakSet<object>();
async function ensureExtraTables(db: D1Database) {
  if (initializedExtraDbs.has(db as unknown as object)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shop_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        cost INTEGER NOT NULL,
        description TEXT DEFAULT '',
        active INTEGER DEFAULT 1
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shop_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        student_name TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        item_title TEXT NOT NULL,
        cost INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS duels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenger_id INTEGER NOT NULL,
        challenger_name TEXT NOT NULL,
        opponent_id INTEGER NOT NULL,
        opponent_name TEXT NOT NULL,
        topic TEXT NOT NULL,
        questions_json TEXT NOT NULL,
        c_step INTEGER DEFAULT 0,
        c_correct INTEGER DEFAULT 0,
        c_time_ms INTEGER DEFAULT 0,
        c_q_start INTEGER DEFAULT 0,
        o_step INTEGER DEFAULT 0,
        o_correct INTEGER DEFAULT 0,
        o_time_ms INTEGER DEFAULT 0,
        o_q_start INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS flashcards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        box INTEGER DEFAULT 1,
        next_review TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        student_name TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        UNIQUE(user_id, date)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS study_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        student_name TEXT NOT NULL,
        subject TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS lab_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        student_name TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        minutes INTEGER DEFAULT 0,
        meta_note TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        points INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS library_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content_type TEXT NOT NULL,
        file_id TEXT DEFAULT '',
        text_body TEXT DEFAULT '',
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS class_teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_name TEXT NOT NULL,
        members_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS muddy_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_name TEXT NOT NULL,
        topic_detail TEXT NOT NULL,
        is_anonymous INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS app_accounts (
        user_id INTEGER PRIMARY KEY,
        student_code TEXT UNIQUE NOT NULL,
        student_pin TEXT NOT NULL DEFAULT '1234',
        parent_code TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS parent_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        student_name TEXT NOT NULL,
        sender_role TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS app_certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        student_name TEXT NOT NULL,
        award_title TEXT NOT NULL,
        image_b64 TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    ),
  ]);

  // بارگذاری جوایز پیش‌فرض فروشگاه در اولین اجرا
  const seeded = await getBotState<boolean>(db, "shop_default_seeded");
  if (!seeded) {
    const cnt = await db.prepare("SELECT COUNT(*) as c FROM shop_items").first<{ c: number }>();
    if (!cnt?.c) {
      await db.batch([
        db.prepare("INSERT INTO shop_items (title, cost, description, active) VALUES (?, ?, ?, 1)").bind("🎟 معافیت از یک تکلیف روزانه", 50, "استفاده برای یک نوبت تکلیف عادی با هماهنگی معلم"),
        db.prepare("INSERT INTO shop_items (title, cost, description, active) VALUES (?, ?, ?, 1)").bind("➕ ۱ نمره تشویقی کلاسی", 80, "افزودن ۱ نمره تشویقی به فعالیت کلاسی"),
        db.prepare("INSERT INTO shop_items (title, cost, description, active) VALUES (?, ?, ?, 1)").bind("👑 لقب قهرمان هفته در کلاس", 40, "معرفی ویژه در اعلان هفتگی کلاس"),
        db.prepare("INSERT INTO shop_items (title, cost, description, active) VALUES (?, ?, ?, 1)").bind("🎲 انتخاب موضوع کوییز بعدی", 60, "پیشنهاد موضوع کوییز بعدی کلاس به معلم"),
      ]);
    }
    await setBotState(db, "shop_default_seeded", true);
  }
  initializedExtraDbs.add(db as unknown as object);
}

// ---- فروشگاه جوایز ----
interface ShopItem { id: number; title: string; cost: number; description: string; active: number; }
interface ShopOrder { id: number; user_id: number; student_name: string; item_id: number; item_title: string; cost: number; status: string; created_at: string; }

async function getActiveShopItems(db: D1Database): Promise<ShopItem[]> {
  await ensureExtraTables(db);
  return (await db.prepare("SELECT * FROM shop_items WHERE active = 1 ORDER BY cost ASC").all<ShopItem>()).results;
}
async function getShopItemById(db: D1Database, id: number): Promise<ShopItem | null> {
  await ensureExtraTables(db);
  return await db.prepare("SELECT * FROM shop_items WHERE id = ?").bind(id).first<ShopItem>();
}
async function addShopItem(db: D1Database, title: string, cost: number, description: string): Promise<number> {
  await ensureExtraTables(db);
  return (await db.prepare("INSERT INTO shop_items (title, cost, description, active) VALUES (?, ?, ?, 1)").bind(title, cost, description).run()).meta.last_row_id as number;
}
async function deleteShopItem(db: D1Database, id: number) {
  await ensureExtraTables(db);
  await db.prepare("UPDATE shop_items SET active = 0 WHERE id = ?").bind(id).run();
}
async function getPendingCostForStudent(db: D1Database, userId: number): Promise<number> {
  await ensureExtraTables(db);
  const r = await db.prepare("SELECT COALESCE(SUM(cost), 0) as s FROM shop_orders WHERE user_id = ? AND status = 'pending'").bind(userId).first<{ s: number }>();
  return r?.s || 0;
}
async function createShopOrder(db: D1Database, userId: number, studentName: string, item: ShopItem): Promise<number> {
  await ensureExtraTables(db);
  return (
    await db
      .prepare("INSERT INTO shop_orders (user_id, student_name, item_id, item_title, cost, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
      .bind(userId, studentName, item.id, item.title, item.cost, new Date().toISOString())
      .run()
  ).meta.last_row_id as number;
}
async function getShopOrderById(db: D1Database, id: number): Promise<ShopOrder | null> {
  await ensureExtraTables(db);
  return await db.prepare("SELECT * FROM shop_orders WHERE id = ?").bind(id).first<ShopOrder>();
}
async function setShopOrderStatus(db: D1Database, id: number, status: string) {
  await ensureExtraTables(db);
  await db.prepare("UPDATE shop_orders SET status = ? WHERE id = ?").bind(status, id).run();
}
async function getPendingShopOrders(db: D1Database): Promise<ShopOrder[]> {
  await ensureExtraTables(db);
  return (await db.prepare("SELECT * FROM shop_orders WHERE status = 'pending' ORDER BY id DESC LIMIT 20").all<ShopOrder>()).results;
}

// ---- دوئل علمی دو نفره ----
interface DuelRecord {
  id: number;
  challenger_id: number;
  challenger_name: string;
  opponent_id: number;
  opponent_name: string;
  topic: string;
  questions_json: string;
  c_step: number;
  c_correct: number;
  c_time_ms: number;
  c_q_start: number;
  o_step: number;
  o_correct: number;
  o_time_ms: number;
  o_q_start: number;
  status: string;
  created_at: string;
}
async function createDuel(
  db: D1Database,
  challengerId: number,
  challengerName: string,
  opponentId: number,
  opponentName: string,
  topic: string,
  questions: { question: string; options: string[]; correct: number }[]
): Promise<number> {
  await ensureExtraTables(db);
  return (
    await db
      .prepare(
        "INSERT INTO duels (challenger_id, challenger_name, opponent_id, opponent_name, topic, questions_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)"
      )
      .bind(challengerId, challengerName, opponentId, opponentName, topic, JSON.stringify(questions), new Date().toISOString())
      .run()
  ).meta.last_row_id as number;
}
async function getDuelById(db: D1Database, id: number): Promise<DuelRecord | null> {
  await ensureExtraTables(db);
  return await db.prepare("SELECT * FROM duels WHERE id = ?").bind(id).first<DuelRecord>();
}

// ---- جعبه لایتنر ۵ خانه‌ای ----
interface Flashcard { id: number; user_id: number; front: string; back: string; box: number; next_review: string; created_at: string; }
const LEITNER_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 15 };

async function addFlashcard(db: D1Database, userId: number, front: string, back: string) {
  await ensureExtraTables(db);
  const today = new Date().toISOString().split("T")[0];
  await db
    .prepare("INSERT INTO flashcards (user_id, front, back, box, next_review, created_at) VALUES (?, ?, ?, 1, ?, ?)")
    .bind(userId, front.trim(), back.trim(), today, new Date().toISOString())
    .run();
}
async function getDueFlashcard(db: D1Database, userId: number): Promise<Flashcard | null> {
  await ensureExtraTables(db);
  const today = new Date().toISOString().split("T")[0];
  return await db
    .prepare("SELECT * FROM flashcards WHERE user_id = ? AND next_review <= ? ORDER BY box ASC, id ASC LIMIT 1")
    .bind(userId, today)
    .first<Flashcard>();
}
async function getFlashcardById(db: D1Database, id: number): Promise<Flashcard | null> {
  await ensureExtraTables(db);
  return await db.prepare("SELECT * FROM flashcards WHERE id = ?").bind(id).first<Flashcard>();
}
async function updateFlashcardReview(db: D1Database, id: number, knewIt: boolean): Promise<number> {
  await ensureExtraTables(db);
  const card = await getFlashcardById(db, id);
  if (!card) return 1;
  const newBox = knewIt ? Math.min((card.box || 1) + 1, 5) : 1;
  const days = knewIt ? (LEITNER_INTERVAL_DAYS[newBox] || 1) : 0;
  const nextDate = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
  await db.prepare("UPDATE flashcards SET box = ?, next_review = ? WHERE id = ?").bind(newBox, nextDate, id).run();
  return newBox;
}
async function getFlashcardStats(db: D1Database, userId: number): Promise<{ total: number; due: number; mastered: number }> {
  await ensureExtraTables(db);
  const today = new Date().toISOString().split("T")[0];
  const r = await db
    .prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN next_review <= ? THEN 1 ELSE 0 END) as due, SUM(CASE WHEN box >= 4 THEN 1 ELSE 0 END) as mastered FROM flashcards WHERE user_id = ?"
    )
    .bind(today, userId)
    .first<{ total: number; due: number; mastered: number }>();
  return { total: r?.total || 0, due: r?.due || 0, mastered: r?.mastered || 0 };
}

// ---- حضور و غیاب تک‌کلیکی ----
interface AttendanceRow { user_id: number; student_name: string; date: string; status: "present" | "absent" | "late"; }
async function getAttendanceByDate(db: D1Database, dateStr: string): Promise<Record<number, "present" | "absent" | "late">> {
  await ensureExtraTables(db);
  const rows = (await db.prepare("SELECT * FROM attendance WHERE date = ?").bind(dateStr).all<AttendanceRow>()).results;
  const map: Record<number, "present" | "absent" | "late"> = {};
  rows.forEach((r) => { map[r.user_id] = r.status; });
  return map;
}
async function setAttendanceStatus(db: D1Database, userId: number, studentName: string, dateStr: string, status: "present" | "absent" | "late") {
  await ensureExtraTables(db);
  await db
    .prepare(
      "INSERT INTO attendance (user_id, student_name, date, status) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status, student_name = excluded.student_name"
    )
    .bind(userId, studentName, dateStr, status)
    .run();
}

// ---- تایمر مطالعه پومودورو و لیگ مطالعه ----
async function recordStudySession(db: D1Database, userId: number, studentName: string, subject: string, minutes: number) {
  await ensureExtraTables(db);
  await db
    .prepare("INSERT INTO study_sessions (user_id, student_name, subject, minutes, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, studentName, subject, minutes, new Date().toISOString())
    .run();
}
async function getWeeklyStudyLeaderboard(db: D1Database): Promise<{ user_id: number; student_name: string; total_min: number; sessions: number }[]> {
  await ensureExtraTables(db);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  return (
    await db
      .prepare(
        "SELECT user_id, student_name, SUM(minutes) as total_min, COUNT(*) as sessions FROM study_sessions WHERE created_at >= ? GROUP BY user_id ORDER BY total_min DESC LIMIT 10"
      )
      .bind(weekAgo)
      .all<{ user_id: number; student_name: string; total_min: number; sessions: number }>()
  ).results;
}
async function getStudentWeeklyStudyMinutes(db: D1Database, userId: number): Promise<number> {
  await ensureExtraTables(db);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const r = await db
    .prepare("SELECT COALESCE(SUM(minutes), 0) as m FROM study_sessions WHERE user_id = ? AND created_at >= ?")
    .bind(userId, weekAgo)
    .first<{ m: number }>();
  return r?.m || 0;
}

// ---- مستندات کارگاه یادگیری با تایید و امتیازدهی معلم ----
type LabCategory =
  | "study"
  | "leitner"
  | "english"
  | "essay"
  | "dictation"
  | "scientist"
  | "plan"
  | "scilab"
  | "word_puzzle";

interface LabSubmission {
  id: number;
  user_id: number;
  student_name: string;
  category: LabCategory;
  title: string;
  minutes: number;
  meta_note: string;
  status: string;
  points: number;
  created_at: string;
}
interface LabProofWaitState {
  category: LabCategory;
  title: string;
  minutes: number;
  metaNote: string;
}

async function createLabSubmission(
  db: D1Database,
  userId: number,
  studentName: string,
  wait: LabProofWaitState
): Promise<number> {
  await ensureExtraTables(db);
  return (
    await db
      .prepare(
        "INSERT INTO lab_submissions (user_id, student_name, category, title, minutes, meta_note, status, points, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)"
      )
      .bind(userId, studentName, wait.category, wait.title, wait.minutes || 0, wait.metaNote || "", new Date().toISOString())
      .run()
  ).meta.last_row_id as number;
}
async function getLabSubmissionById(db: D1Database, id: number): Promise<LabSubmission | null> {
  await ensureExtraTables(db);
  return await db.prepare("SELECT * FROM lab_submissions WHERE id = ?").bind(id).first<LabSubmission>();
}
async function updateLabSubmissionDecision(db: D1Database, id: number, status: string, points: number = 0) {
  await ensureExtraTables(db);
  await db.prepare("UPDATE lab_submissions SET status = ?, points = ? WHERE id = ?").bind(status, points, id).run();
}

// ---- کتابخانه شیشه‌ای کلاس (آرشیو جزوات، نمونه سوالات و فایل‌های معلم) ----
interface LibraryItem {
  id: number;
  category: string;
  title: string;
  content_type: "text" | "document" | "photo" | "voice" | "video" | "audio";
  file_id: string;
  text_body: string;
  created_at: string;
}
async function addLibraryItem(
  db: D1Database,
  category: string,
  title: string,
  contentType: LibraryItem["content_type"],
  fileId: string,
  textBody: string
): Promise<number> {
  await ensureExtraTables(db);
  return (
    await db
      .prepare(
        "INSERT INTO library_items (category, title, content_type, file_id, text_body, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(category, title, contentType, fileId || "", textBody || "", new Date().toISOString())
      .run()
  ).meta.last_row_id as number;
}
async function getLibraryItems(db: D1Database, category?: string): Promise<LibraryItem[]> {
  await ensureExtraTables(db);
  if (category && category !== "all") {
    return (
      await db
        .prepare("SELECT * FROM library_items WHERE category = ? ORDER BY id DESC LIMIT 30")
        .bind(category)
        .all<LibraryItem>()
    ).results;
  }
  return (await db.prepare("SELECT * FROM library_items ORDER BY id DESC LIMIT 30").all<LibraryItem>()).results;
}
async function getLibraryItemById(db: D1Database, id: number): Promise<LibraryItem | null> {
  await ensureExtraTables(db);
  return await db.prepare("SELECT * FROM library_items WHERE id = ?").bind(id).first<LibraryItem>();
}
async function deleteLibraryItem(db: D1Database, id: number) {
  await ensureExtraTables(db);
  await db.prepare("DELETE FROM library_items WHERE id = ?").bind(id).run();
}

// ---- گروه‌بندی هوشمند کلاسی و پروژه‌های تیمی ----
interface TeamMemberInfo { user_id: number; name: string; score: number; }
interface ClassTeamRow { id: number; team_name: string; members_json: string; created_at: string; }

async function saveClassTeams(db: D1Database, teams: { teamName: string; members: TeamMemberInfo[] }[]) {
  await ensureExtraTables(db);
  await db.prepare("DELETE FROM class_teams").run();
  if (teams.length === 0) return;
  const now = new Date().toISOString();
  await db.batch(
    teams.map((t) =>
      db
        .prepare("INSERT INTO class_teams (team_name, members_json, created_at) VALUES (?, ?, ?)")
        .bind(t.teamName, JSON.stringify(t.members), now)
    )
  );
}
async function getClassTeams(db: D1Database): Promise<{ id: number; teamName: string; members: TeamMemberInfo[] }[]> {
  await ensureExtraTables(db);
  const rows = (await db.prepare("SELECT * FROM class_teams ORDER BY id ASC").all<ClassTeamRow>()).results;
  return rows.map((r) => {
    let members: TeamMemberInfo[] = [];
    try { members = JSON.parse(r.members_json); } catch {}
    return { id: r.id, teamName: r.team_name, members };
  });
}
function generateSmartClassTeams(
  students: Student[],
  groupSize: number,
  mode: "balanced" | "random"
): { teamName: string; members: TeamMemberInfo[] }[] {
  if (students.length === 0) return [];
  const teamCount = Math.max(1, Math.ceil(students.length / Math.max(2, groupSize)));
  const teamLabels = ["گروه ۱ (ستارگان)", "گروه ۲ (پیشگامان)", "گروه ۳ (اندیشمندان)", "گروه ۴ (کاوشگران)", "گروه ۵ (نوابغ)", "گروه ۶ (آینده‌سازان)", "گروه ۷ (قهرمانان)", "گروه ۸ (نوآوران)"];
  const buckets: TeamMemberInfo[][] = Array.from({ length: teamCount }, () => []);

  const pool = [...students];
  if (mode === "balanced") {
    pool.sort((a, b) => b.score - a.score);
  } else {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }

  // توزیع ماری (Snake Draft) برای تعادل کامل علمی بین گروه‌ها
  pool.forEach((st, idx) => {
    const round = Math.floor(idx / teamCount);
    const pos = idx % teamCount;
    const bucketIdx = round % 2 === 0 ? pos : teamCount - 1 - pos;
    buckets[bucketIdx].push({ user_id: st.user_id, name: st.name, score: st.score });
  });

  return buckets
    .filter((b) => b.length > 0)
    .map((members, i) => ({
      teamName: teamLabels[i] || `گروه ${i + 1}`,
      members,
    }));
}

// ---- بازخورد محترمانه/ناشناس «کجای درس امروز گنگ بود؟» ----
interface MuddyFeedbackRow { id: number; student_name: string; topic_detail: string; is_anonymous: number; created_at: string; }
async function addMuddyFeedback(db: D1Database, studentName: string, topicDetail: string, isAnonymous: boolean) {
  await ensureExtraTables(db);
  await db
    .prepare("INSERT INTO muddy_feedback (student_name, topic_detail, is_anonymous, created_at) VALUES (?, ?, ?, ?)")
    .bind(studentName, topicDetail, isAnonymous ? 1 : 0, new Date().toISOString())
    .run();
}
async function getRecentMuddyFeedback(db: D1Database): Promise<MuddyFeedbackRow[]> {
  await ensureExtraTables(db);
  return (await db.prepare("SELECT * FROM muddy_feedback ORDER BY id DESC LIMIT 30").all<MuddyFeedbackRow>()).results;
}
async function clearMuddyFeedback(db: D1Database) {
  await ensureExtraTables(db);
  await db.prepare("DELETE FROM muddy_feedback").run();
}

// ==================== توابع کمکی ====================
function toJalali(iso: string): string { try { return new Date(iso).toLocaleDateString("fa-IR"); } catch { return iso.split("T")[0]; } }
function formatDateTime(iso: string): string { return new Date(iso).toLocaleString("fa-IR"); }
function formatJalaliBirthday(birthday: string): string {
  if (!birthday) return ""; const parts = birthday.split("-"); if (parts.length !== 3) return birthday;
  const months = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  return `${parts[2]} ${months[parseInt(parts[1]) - 1] || parts[1]} ${parts[0]}`;
}
function isBirthdayToday(birthday: string): boolean {
  if (!birthday) return false;
  try {
    const jToday = (jalaali as any).toJalaali(new Date());
    const todayJMMDD = `${String(jToday.jm).padStart(2, "0")}-${String(jToday.jd).padStart(2, "0")}`;
    if (birthday.length === 10 && birthday.includes("-")) return `${birthday.split("-")[1]}-${birthday.split("-")[2]}` === todayJMMDD;
    if (birthday.length === 5 && birthday.includes("-")) return birthday === todayJMMDD;
  } catch (e) {} return false;
}
function getRandomMotivation(): string { return MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)]; }
function getRandomBirthdayMessage(): string { return BIRTHDAY_MESSAGES[Math.floor(Math.random() * BIRTHDAY_MESSAGES.length)]; }

async function processBirthday(ctx: any, env: Env, userId: number, input: string): Promise<void> {
  input = input.replace(/[-\/\s]/g, "");
  if (!/^\d{8}$/.test(input)) return void (await ctx.reply("❌ فرمت درست نیست.\n\n📅 YYYYMMDD\nمثال: 13670317"));
  const year = parseInt(input.substring(0, 4)), month = parseInt(input.substring(4, 6)), day = parseInt(input.substring(6, 8));
  if (year < 1300 || year > 1420 || month < 1 || month > 12 || day < 1 || day > 31) return void (await ctx.reply("❌ تاریخ معتبر نیست."));
  let isValid = true; try { isValid = (jalaali as any).isValidJalaaliDate(year, month, day); } catch (e) {}
  if (!isValid) return void (await ctx.reply("❌ تاریخ معتبر نیست."));
  const formatted = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  await setBirthday(env.telegram_bot_db, userId, formatted);
  await ctx.reply(`🎂 تولدت ثبت شد: ${formatJalaliBirthday(formatted)}\n\n📅 هر سال این روز بهت تبریک می‌گیم! 🎉`);
}

// ==================== نمودار و گزارش ====================
function buildChartUrl(config: object, width = 800, height = 500): string { return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=${width}&h=${height}&bkg=white&v=2`; }
function buildClassChart(students: Student[]): string {
  const top = students.slice(0, 10);
  return buildChartUrl({ type: "horizontalBar", data: { labels: top.map((s) => s.name), datasets: [{ label: "امتیاز", data: top.map((s) => s.score), backgroundColor: ["#FFD700", "#C0C0C0", "#CD7F32", "#4CAF50", "#2196F3", "#9C27B0", "#FF5722", "#00BCD4", "#795548", "#607D8B"] }] }, options: { plugins: { title: { display: true, text: "امتیازات کلاس", font: { size: 20 } }, legend: { display: false } } } });
}
function buildStudentChart(scores: number[]): string {
  return buildChartUrl({ type: "line", data: { labels: scores.map((_, i) => `#${i + 1}`), datasets: [{ label: "نمره", data: scores, borderColor: "#2196F3", backgroundColor: "rgba(33,150,243,0.2)", fill: true, tension: 0.3 }] }, options: { plugins: { title: { display: true, text: "نمودار پیشرفت", font: { size: 20 } } }, scales: { y: { beginAtZero: true, max: 20 } } } }, 800, 400);
}
function buildStreakChart(students: Student[]): string {
  const top = students.filter((s) => (s.streak || 0) > 0).sort((a, b) => (b.streak || 0) - (a.streak || 0)).slice(0, 10);
  return buildChartUrl({ type: "bar", data: { labels: top.map((s) => s.name), datasets: [{ label: "روزهای پیوسته", data: top.map((s) => s.streak || 0), backgroundColor: "#FF5722" }] }, options: { plugins: { title: { display: true, text: "🔥 استریک‌ها", font: { size: 20 } }, legend: { display: false } } } });
}
async function buildWeeklyReport(db: D1Database): Promise<string> {
  const all = await getAllStudents(db); if (all.length === 0) return "📊 هنوز کسی ثبت‌نام نکرده.";
  const hwWeek = (await db.prepare("SELECT * FROM homework WHERE date > ?").bind(new Date(Date.now() - 7 * 86400000).toISOString()).all<Homework>()).results;
  const activeUserIds = new Set(hwWeek.map((h) => h.user_id)); const inactive = all.filter((s) => !activeUserIds.has(s.user_id));
  const userHwCount: Record<number, number> = {}; hwWeek.forEach((h) => (userHwCount[h.user_id] = (userHwCount[h.user_id] || 0) + 1));
  const topActive = Object.entries(userHwCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([uid, count]) => ({ name: all.find((st) => st.user_id === Number(uid))?.name || "ناشناس", count }));
  const graded = hwWeek.filter((h) => h.score > 0); const avgScore = graded.length > 0 ? (graded.reduce((sum, h) => sum + h.score, 0) / graded.length).toFixed(1) : "—";
  let text = `📊 گزارش هفتگی کلاس\n📅 ${toJalali(new Date().toISOString())}\n\n👥 آمار کلی:\n• کل: ${all.length}\n• فعال: ${activeUserIds.size} ✅\n• غیرفعال: ${inactive.length} ⚠️\n\n📝 تکالیف:\n• مجموع: ${hwWeek.length}\n• میانگین: ${avgScore}\n\n`;
  if (topActive.length > 0) { text += `🏆 فعال‌ترین‌ها:\n`; topActive.forEach((s, i) => text += `${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i]} ${s.name}: ${s.count}\n`); }
  return text;
}
async function broadcastToAll(ctx: any, env: Env, bot: Bot, content: any): Promise<void> {
  const all = await getAllStudents(env.telegram_bot_db); if (all.length === 0) return void (await ctx.reply("❌ کسی نیست."));
  let sent = 0; const prog = await ctx.reply(`📤 در حال ارسال...`);
  for (const s of all) {
    try {
      if (content.type === "text") await bot.api.sendMessage(s.user_id, `📢 اعلان:\n\n${content.text}`);
      else if (content.type === "photo") await bot.api.sendPhoto(s.user_id, content.fileId, { caption: content.text });
      else if (content.type === "video") await bot.api.sendVideo(s.user_id, content.fileId, { caption: content.text });
      else if (content.type === "voice") await bot.api.sendVoice(s.user_id, content.fileId, { caption: content.text });
      else if (content.type === "document") await bot.api.sendDocument(s.user_id, content.fileId, { caption: content.text });
      sent++;
    } catch (e) {}
  }
  try { await bot.api.deleteMessage(ctx.chat.id, prog.message_id); } catch {}
  await ctx.reply(`✅ به ${sent} نفر ارسال شد.`);
}

// ==================== کیبوردها ====================
function teacherKeyboard(): Keyboard {
  return new Keyboard()
    .text("❓ پرسش و پاسخ").text("👨‍🏫 ابزارهای هوشمند کلاس").row()
    .text("📋 لیست").text("🏆 رتبه‌بندی").row()
    .text("📅 تکالیف").text("📋 غایبین").row()
    .text("⏰ ددلاین‌ها").text("📊 اکسل").row()
    .text("📈 نمودار").text("🎁 برنده").row()
    .text("🔥 استریک‌ها").text("🎂 تولدها").row()
    .text("📊 گزارش هفتگی").text("🎲 کوییز").row()
    .text("🤖 کوییز AI").text("📝 کوییز چندتایی").row()
    .text("📄 کوییز از PDF/متن").text("🎰 قرعه‌کشی").row()
    .text("📣 ارسال همگانی").text("💡 انگیزشی").row()
    .text("♻️ ریست").text("📖 راهنما").resized().persistent();
}
function studentKeyboard(): Keyboard {
  return new Keyboard()
    .text("❓ پرسش و پاسخ").row()
    .text("🎮 رقابت و جوایز").text("🧠 کارگاه یادگیری").row()
    .text("🌟 امتیاز من").text("🏆 رتبه من").row()
    .text("📤 ارسال تکلیف").text("📅 تاریخچه من").row()
    .text("🏅 نشان‌های من").text("🔥 استریک من").row()
    .text("📈 نمودار من").text("🎂 تولد من").row()
    .text("🎯 ماموریت روز").text("🏅 سطح من").row()
    .text("🖥 پنل من").text("📖 راهنما")
    .resized().persistent();
}

// ==================== هوش مصنوعی ====================
async function generateQuizWithAI(env: Env, topic: string): Promise<{ question: string; options: string[]; correct: number } | string> {
  const prompt = `You are an expert teacher. Create ONE multiple-choice question about "${topic}" in PERSIAN (Farsi).
The question MUST be in Persian. The options MUST be in Persian.
Return ONLY a JSON object in this exact format:
{
  "question": "متن سوال به فارسی",
  "options": ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم"],
  "correct": 1
}
Rules:
- The question should be clear and educational.
- All 4 options must be plausible and in Persian.
- The "correct" field must be the index (1-4) of the correct answer.
- Do NOT write anything else. ONLY the JSON.`;

  try {
    const url = `https://api.groq.com/openai/v1/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: "شما یک دستیار هوش مصنوعی هستید که فقط به زبان فارسی پاسخ می‌دهد و خروجی را دقیقاً به فرمت JSON می‌دهد." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7, max_tokens: 1200,
      }),
    });

    if (!response.ok) { const err = await response.text(); console.error("Groq API Error:", err); return `❌ خطا در ارتباط با هوش مصنوعی.`; }
    const data = await response.json() as any;
    const text = stripThinkTags(data.choices?.[0]?.message?.content || "");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return "❌ خطا: پاسخ نامعتبر بود.";
    const quizData = JSON.parse(jsonMatch[0]);
    if (!quizData.question || !Array.isArray(quizData.options) || quizData.options.length !== 4 || typeof quizData.correct !== 'number') return "❌ خطا: ساختار نامعتبر.";
    return { question: quizData.question, options: quizData.options, correct: Math.min(Math.max(quizData.correct, 1), 4) };
  } catch (e: any) {
    console.error("AI Error:", e.message);
    return `❌ خطای غیرمنتظره: ${e.message}`;
  }
}

// ==================== هوش مصنوعی (چند سوال) ====================
async function generateMultipleQuizzesWithAI(env: Env, topic: string, count: number): Promise<{ question: string; options: string[]; correct: number }[] | string> {
  const prompt = `You are an expert teacher. Create ${count} multiple-choice questions about "${topic}" in PERSIAN (Farsi).
All questions MUST be in Persian. All options MUST be in Persian.
Return ONLY a JSON array in this exact format:
[
  {
    "question": "متن سوال اول به فارسی",
    "options": ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم"],
    "correct": 1
  }
]
Rules:
- Create exactly ${count} questions.
- All questions should be clear and educational.
- All options must be plausible and in Persian.
- The "correct" field must be the index (1-4) of the correct answer.
- Do NOT write anything else. ONLY the JSON array.`;

  try {
    const url = `https://api.groq.com/openai/v1/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: "شما یک دستیار هوش مصنوعی هستید که فقط به زبان فارسی پاسخ می‌دهد و خروجی را دقیقاً به فرمت JSON Array می‌دهد." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7, max_tokens: 4000,
      }),
    });

    if (!response.ok) { const err = await response.text(); console.error("Groq API Error:", err); return `❌ خطا در ارتباط با هوش مصنوعی.`; }
    const data = await response.json() as any;
    const text = stripThinkTags(data.choices?.[0]?.message?.content || "");
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return "❌ خطا: پاسخ نامعتبر بود.";
    const quizzesData = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(quizzesData)) return "❌ خطا: ساختار آرایه نامعتبر است.";
    const validQuizzes = quizzesData.filter(q => q.question && Array.isArray(q.options) && q.options.length === 4 && typeof q.correct === 'number').map(q => ({ question: q.question, options: q.options, correct: Math.min(Math.max(q.correct, 1), 4) }));
    if (validQuizzes.length === 0) return "❌ خطا: هیچ سوال معتبری تولید نشد.";
    return validQuizzes.slice(0, count);
  } catch (e: any) {
    console.error("AI Error:", e.message);
    return `❌ خطای غیرمنتظره: ${e.message}`;
  }
}

// ==================== ابزارهای پایه سرویس‌های آنلاین رایگان ====================
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(options.headers || {});
    if (!headers.has("User-Agent")) {
      headers.set("User-Agent", "Mozilla/5.0 (compatible; ClassSmartBot/2.0; Educational)");
    }
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

// ==================== ۱. سرویس رایگان آب‌وهوا (Open-Meteo - بدون کلید) ====================
const WEATHER_CODES_FA: Record<number, string> = {
  0: "صاف و آفتابی ☀️",
  1: "غالبأ صاف 🌤",
  2: "نیمه‌ابری ⛅",
  3: "ابری ☁️",
  45: "مه‌آلود 🌫",
  48: "مه غلیظ و شبنم یخ‌زده 🌫",
  51: "نم‌نم باران خفیف 🌦",
  53: "نم‌نم باران متوسط 🌦",
  55: "نم‌نم باران شدید 🌧",
  61: "باران خفیف 🌧",
  63: "باران متوسط 🌧",
  65: "باران شدید 🌧",
  66: "باران یخ‌زده خفیف 🌨",
  67: "باران یخ‌زده شدید 🌨",
  71: "بارش برف خفیف ❄️",
  73: "بارش برف متوسط ❄️",
  75: "بارش برف سنگین ❄️",
  77: "دانه‌های برف ❄️",
  80: "رگبار باران خفیف 🌦",
  81: "رگبار باران متوسط 🌧",
  82: "رگبار شدید باران ⛈",
  85: "رگبار برف خفیف 🌨",
  86: "رگبار برف سنگین ❄️",
  95: "رعدوبرق ⛈",
  96: "رعدوبرق همراه با تگرگ خفیف ⛈",
  99: "رعدوبرق همراه با تگرگ شدید ⛈",
};

async function fetchWeatherOnline(cityFa: string, cityEn?: string): Promise<string> {
  const candidates = [cityFa, cityEn].filter((c): c is string => Boolean(c && c.trim()));
  let geo: any = null;

  for (const name of candidates) {
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=1&language=fa&format=json`;
      const res = await fetchWithTimeout(geoUrl, {}, 5000);
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data?.results?.length > 0) {
          geo = data.results[0];
          break;
        }
      }
    } catch {}
  }

  if (!geo) {
    return `اطلاعات مکانی برای شهر «${cityFa || cityEn}» پیدا نشد.`;
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=3`;

  const fRes = await fetchWithTimeout(forecastUrl, {}, 5000);
  if (!fRes.ok) return `خطا در دریافت داده‌های هواشناسی برای ${geo.name}.`;
  const fData = (await fRes.json()) as any;
  const cur = fData.current || {};
  const daily = fData.daily || {};

  const condition = WEATHER_CODES_FA[cur.weather_code] || "معمولی 🌤";
  let report = `🌤 وضعیت لحظه‌ای آب‌وهوای ${geo.name}${geo.country ? ` (${geo.country})` : ""}:\n`;
  report += `• وضعیت هوا: ${condition}\n`;
  report += `• دمای فعلی: ${cur.temperature_2m}°C (دمای احساسی: ${cur.apparent_temperature}°C)\n`;
  report += `• رطوبت هوا: ${cur.relative_humidity_2m}%\n`;
  report += `• سرعت باد: ${cur.wind_speed_10m} کیلومتر بر ساعت\n`;

  if (Array.isArray(daily.time) && daily.time.length > 0) {
    const labels = ["امروز", "فردا", "پس‌فردا"];
    report += `\n📅 پیش‌بینی ۳ روز آینده:\n`;
    daily.time.slice(0, 3).forEach((dateStr: string, idx: number) => {
      const dCond = WEATHER_CODES_FA[daily.weather_code?.[idx]] || "";
      const tMin = daily.temperature_2m_min?.[idx];
      const tMax = daily.temperature_2m_max?.[idx];
      const rainProb = daily.precipitation_probability_max?.[idx] ?? 0;
      report += `• ${labels[idx] || dateStr} (${toJalali(dateStr)}): ${dCond} | کمینه ${tMin}°C، بیشینه ${tMax}°C | احتمال بارش: ${rainProb}%\n`;
    });
  }
  return report;
}

// ==================== ۲. سرویس رایگان سرخط خبرها (RSS چندمنبعی - بدون کلید) ====================
interface NewsItem {
  title: string;
  summary: string;
  source: string;
}

function parseRssItems(xml: string, sourceLabel: string, limit = 5): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const rawTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : "";
    const rawDesc = descMatch ? decodeXmlEntities(descMatch[1]).slice(0, 180) : "";
    if (rawTitle && rawTitle.length > 5) {
      items.push({ title: rawTitle, summary: rawDesc, source: sourceLabel });
    }
  }
  return items;
}

async function fetchNewsOnline(category: string = "general", topicEn?: string): Promise<string> {
  const feedsByCategory: Record<string, { label: string; url: string; limit: number }[]> = {
    general: [
      { label: "اخبار جهان (یورونیوز)", url: "https://per.euronews.com/rss?format=mrss&level=theme&name=news", limit: 3 },
      { label: "سرخط روز (بی‌بی‌سی فارسی)", url: "https://feeds.bbci.co.uk/persian/rss.xml", limit: 3 },
      { label: "علم و فناوری (یورونیوز)", url: "https://per.euronews.com/rss?format=mrss&level=vertical&name=next", limit: 3 },
      { label: "ورزشی (یورونیوز)", url: "https://per.euronews.com/rss?format=mrss&level=theme&name=sport", limit: 3 },
    ],
    scitech: [
      { label: "علم و فناوری (یورونیوز فارسی)", url: "https://per.euronews.com/rss?format=mrss&level=vertical&name=next", limit: 7 },
    ],
    sport: [
      { label: "ورزشی (یورونیوز فارسی)", url: "https://per.euronews.com/rss?format=mrss&level=theme&name=sport", limit: 7 },
    ],
    culture: [
      { label: "فرهنگ و هنر (یورونیوز فارسی)", url: "https://per.euronews.com/rss?format=mrss&level=vertical&name=culture", limit: 7 },
    ],
    business: [
      { label: "اقتصاد (یورونیوز فارسی)", url: "https://per.euronews.com/rss?format=mrss&level=theme&name=business", limit: 7 },
    ],
  };

  const selectedFeeds = [...(feedsByCategory[category] || feedsByCategory.general)];
  if (topicEn && topicEn.trim().length > 1) {
    selectedFeeds.unshift({
      label: `اخبار تخصصی (${topicEn})`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(topicEn.trim())}&hl=en-US&gl=US&ceid=US:en`,
      limit: 5,
    });
  }

  const settled = await Promise.allSettled(
    selectedFeeds.map(async (f) => {
      const res = await fetchWithTimeout(f.url, {}, 5000);
      if (!res.ok) return [];
      const xml = await res.text();
      return parseRssItems(xml, f.label, f.limit);
    })
  );

  const allItems: NewsItem[] = [];
  const seenTitles = new Set<string>();
  for (const r of settled) {
    if (r.status === "fulfilled") {
      for (const item of r.value) {
        const key = item.title.slice(0, 40);
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          allItems.push(item);
        }
      }
    }
  }

  if (allItems.length === 0) {
    return "در حال حاضر امکان دریافت آنلاین سرخط خبرها فراهم نشد.";
  }

  let out = `📰 آخرین سرخط خبرهای آنلاین (${toJalali(new Date().toISOString())}):\n\n`;
  allItems.slice(0, 12).forEach((it, idx) => {
    out += `${idx + 1}. [${it.source}] ${it.title}${it.summary ? `\n   خلاصه: ${it.summary}` : ""}\n`;
  });
  return out;
}

// ==================== ۳. سرویس رایگان دانشنامه و کتاب (Wikipedia + OpenLibrary - بدون کلید) ====================
async function searchWikipediaLang(lang: "fa" | "en", query: string): Promise<{ title: string; extract: string; url: string } | null> {
  if (!query || !query.trim()) return null;
  try {
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query.trim())}&utf8=1&format=json&srlimit=2`;
    const sRes = await fetchWithTimeout(searchUrl, {}, 5000);
    if (!sRes.ok) return null;
    const sData = (await sRes.json()) as any;
    const hit = sData?.query?.search?.[0];
    if (!hit?.title) return null;

    const extractUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(hit.title)}&format=json`;
    const eRes = await fetchWithTimeout(extractUrl, {}, 5000);
    if (!eRes.ok) return null;
    const eData = (await eRes.json()) as any;
    const pages = eData?.query?.pages || {};
    const firstPage = Object.values(pages)[0] as any;
    const extract = (firstPage?.extract || "").trim();
    if (!extract) return null;

    return {
      title: firstPage.title || hit.title,
      extract: extract.slice(0, 1600),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent((firstPage.title || hit.title).replace(/\s+/g, "_"))}`,
    };
  } catch {
    return null;
  }
}

async function fetchWikiOnline(queryFa: string, queryEn?: string): Promise<string> {
  const [faWiki, enWiki] = await Promise.all([
    searchWikipediaLang("fa", queryFa),
    queryEn ? searchWikipediaLang("en", queryEn) : Promise.resolve(null),
  ]);

  let result = "";
  if (faWiki) {
    result += `📖 دانشنامه ویکی‌پدیای فارسی — «${faWiki.title}»:\n${faWiki.extract}\n🔗 منبع: ${faWiki.url}\n\n`;
  }
  if (enWiki && (!faWiki || faWiki.extract.length < 350)) {
    result += `🌐 اطلاعات تکمیلی از ویکی‌پدیای انگلیسی — «${enWiki.title}»:\n${enWiki.extract}\n`;
  }
  return result || `نتیجه دقیقی در ویکی‌پدیا برای «${queryFa || queryEn}» یافت نشد.`;
}

async function fetchBookOnline(queryFa: string, queryEn?: string): Promise<string> {
  const olQuery = (queryEn && queryEn.trim()) ? queryEn.trim() : queryFa.trim();
  const [olResSettled, faBookWiki, faDirectWiki] = await Promise.allSettled([
    (async () => {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(olQuery)}&limit=4&fields=title,author_name,first_publish_year,edition_count,ratings_average,subject`;
      const r = await fetchWithTimeout(url, {}, 6000);
      if (!r.ok) return null;
      return (await r.json()) as any;
    })(),
    searchWikipediaLang("fa", `${queryFa} کتاب`),
    searchWikipediaLang("fa", queryFa),
  ]);

  let out = "";
  const wikiArticle =
    (faBookWiki.status === "fulfilled" && faBookWiki.value) ||
    (faDirectWiki.status === "fulfilled" && faDirectWiki.value) ||
    null;

  if (wikiArticle) {
    out += `📚 اطلاعات دانشنامه‌ای کتاب «${wikiArticle.title}»:\n${wikiArticle.extract}\n\n`;
  }

  if (olResSettled.status === "fulfilled" && olResSettled.value?.docs?.length > 0) {
    out += `🏛 نتایج کتابخانه جهانی OpenLibrary:\n`;
    olResSettled.value.docs.slice(0, 4).forEach((b: any, i: number) => {
      const authors = Array.isArray(b.author_name) ? b.author_name.slice(0, 2).join("، ") : "نامشخص";
      const year = b.first_publish_year || "نامشخص";
      const rating = b.ratings_average ? ` | امتیاز: ${Number(b.ratings_average).toFixed(1)}/5` : "";
      const subjects = Array.isArray(b.subject) ? ` | موضوعات: ${b.subject.slice(0, 4).join(", ")}` : "";
      out += `${i + 1}. عنوان: ${b.title} | نویسنده: ${authors} | سال انتشار اول: ${year}${rating}${subjects}\n`;
    });
  }

  return out || `اطلاعات آنلاین برای کتاب «${queryFa || queryEn}» پیدا نشد.`;
}

// ==================== ۴. سرویس رایگان ریاضی، تبدیل واحد و ارز (MathJS + موتور دقیق داخلی) ====================
interface UnitDef {
  category: string;
  toBase: number;
  labelFa: string;
}

const UNIT_TABLE: Record<string, UnitDef> = {
  // طول (پایه: متر)
  mm: { category: "length", toBase: 0.001, labelFa: "میلی‌متر" },
  millimeter: { category: "length", toBase: 0.001, labelFa: "میلی‌متر" },
  cm: { category: "length", toBase: 0.01, labelFa: "سانتی‌متر" },
  centimeter: { category: "length", toBase: 0.01, labelFa: "سانتی‌متر" },
  m: { category: "length", toBase: 1, labelFa: "متر" },
  meter: { category: "length", toBase: 1, labelFa: "متر" },
  km: { category: "length", toBase: 1000, labelFa: "کیلومتر" },
  kilometer: { category: "length", toBase: 1000, labelFa: "کیلومتر" },
  inch: { category: "length", toBase: 0.0254, labelFa: "اینچ" },
  in: { category: "length", toBase: 0.0254, labelFa: "اینچ" },
  ft: { category: "length", toBase: 0.3048, labelFa: "فوت" },
  foot: { category: "length", toBase: 0.3048, labelFa: "فوت" },
  feet: { category: "length", toBase: 0.3048, labelFa: "فوت" },
  yd: { category: "length", toBase: 0.9144, labelFa: "یارد" },
  yard: { category: "length", toBase: 0.9144, labelFa: "یارد" },
  mile: { category: "length", toBase: 1609.344, labelFa: "مایل" },
  miles: { category: "length", toBase: 1609.344, labelFa: "مایل" },
  mi: { category: "length", toBase: 1609.344, labelFa: "مایل" },
  nmi: { category: "length", toBase: 1852, labelFa: "مایل دریایی" },
  farsakh: { category: "length", toBase: 6240, labelFa: "فرسنگ" },

  // جرم و وزن (پایه: کیلوگرم)
  mg: { category: "mass", toBase: 1e-6, labelFa: "میلی‌گرم" },
  g: { category: "mass", toBase: 0.001, labelFa: "گرم" },
  gram: { category: "mass", toBase: 0.001, labelFa: "گرم" },
  kg: { category: "mass", toBase: 1, labelFa: "کیلوگرم" },
  kilogram: { category: "mass", toBase: 1, labelFa: "کیلوگرم" },
  ton: { category: "mass", toBase: 1000, labelFa: "تن" },
  tonne: { category: "mass", toBase: 1000, labelFa: "تن" },
  oz: { category: "mass", toBase: 0.028349523125, labelFa: "اونس" },
  ounce: { category: "mass", toBase: 0.028349523125, labelFa: "اونس" },
  lb: { category: "mass", toBase: 0.45359237, labelFa: "پوند" },
  lbs: { category: "mass", toBase: 0.45359237, labelFa: "پوند" },
  pound: { category: "mass", toBase: 0.45359237, labelFa: "پوند" },
  mesghal: { category: "mass", toBase: 0.0046083, labelFa: "مثقال" },
  seer: { category: "mass", toBase: 0.075, labelFa: "سیر" },

  // مساحت (پایه: متر مربع)
  mm2: { category: "area", toBase: 1e-6, labelFa: "میلی‌متر مربع" },
  cm2: { category: "area", toBase: 1e-4, labelFa: "سانتی‌متر مربع" },
  m2: { category: "area", toBase: 1, labelFa: "متر مربع" },
  km2: { category: "area", toBase: 1e6, labelFa: "کیلومتر مربع" },
  hectare: { category: "area", toBase: 10000, labelFa: "هکتار" },
  ha: { category: "area", toBase: 10000, labelFa: "هکتار" },
  acre: { category: "area", toBase: 4046.8564224, labelFa: "جریب فرنگی (Acre)" },
  ft2: { category: "area", toBase: 0.09290304, labelFa: "فوت مربع" },

  // حجم (پایه: لیتر)
  ml: { category: "volume", toBase: 0.001, labelFa: "میلی‌لیتر (سی‌سی)" },
  cc: { category: "volume", toBase: 0.001, labelFa: "سی‌سی" },
  l: { category: "volume", toBase: 1, labelFa: "لیتر" },
  liter: { category: "volume", toBase: 1, labelFa: "لیتر" },
  litre: { category: "volume", toBase: 1, labelFa: "لیتر" },
  m3: { category: "volume", toBase: 1000, labelFa: "متر مکعب" },
  cup: { category: "volume", toBase: 0.24, labelFa: "پیمانه" },
  gallon: { category: "volume", toBase: 3.785411784, labelFa: "گالن" },
  gal: { category: "volume", toBase: 3.785411784, labelFa: "گالن" },

  // سرعت (پایه: متر بر ثانیه)
  "m/s": { category: "speed", toBase: 1, labelFa: "متر بر ثانیه" },
  "km/h": { category: "speed", toBase: 1 / 3.6, labelFa: "کیلومتر بر ساعت" },
  kmh: { category: "speed", toBase: 1 / 3.6, labelFa: "کیلومتر بر ساعت" },
  mph: { category: "speed", toBase: 0.44704, labelFa: "مایل بر ساعت" },
  knot: { category: "speed", toBase: 0.514444, labelFa: "گره دریایی" },

  // زمان (پایه: ثانیه)
  ms: { category: "time", toBase: 0.001, labelFa: "میلی‌ثانیه" },
  s: { category: "time", toBase: 1, labelFa: "ثانیه" },
  sec: { category: "time", toBase: 1, labelFa: "ثانیه" },
  second: { category: "time", toBase: 1, labelFa: "ثانیه" },
  min: { category: "time", toBase: 60, labelFa: "دقیقه" },
  minute: { category: "time", toBase: 60, labelFa: "دقیقه" },
  h: { category: "time", toBase: 3600, labelFa: "ساعت" },
  hr: { category: "time", toBase: 3600, labelFa: "ساعت" },
  hour: { category: "time", toBase: 3600, labelFa: "ساعت" },
  day: { category: "time", toBase: 86400, labelFa: "روز" },
  week: { category: "time", toBase: 604800, labelFa: "هفته" },
  year: { category: "time", toBase: 31536000, labelFa: "سال" },

  // حافظه دیجیتال (پایه: بایت)
  bit: { category: "data", toBase: 0.125, labelFa: "بیت" },
  b: { category: "data", toBase: 1, labelFa: "بایت" },
  byte: { category: "data", toBase: 1, labelFa: "بایت" },
  kb: { category: "data", toBase: 1024, labelFa: "کیلوبایت" },
  mb: { category: "data", toBase: 1048576, labelFa: "مگابایت" },
  gb: { category: "data", toBase: 1073741824, labelFa: "گیگابایت" },
  tb: { category: "data", toBase: 1099511627776, labelFa: "ترابایت" },

  // زاویه (پایه: درجه)
  deg: { category: "angle", toBase: 1, labelFa: "درجه" },
  degree: { category: "angle", toBase: 1, labelFa: "درجه" },
  rad: { category: "angle", toBase: 180 / Math.PI, labelFa: "رادیان" },
  radian: { category: "angle", toBase: 180 / Math.PI, labelFa: "رادیان" },

  // انرژی (پایه: ژول)
  j: { category: "energy", toBase: 1, labelFa: "ژول" },
  kj: { category: "energy", toBase: 1000, labelFa: "کیلوژول" },
  cal: { category: "energy", toBase: 4.184, labelFa: "کالری" },
  kcal: { category: "energy", toBase: 4184, labelFa: "کیلوکالری" },
  wh: { category: "energy", toBase: 3600, labelFa: "وات‌ساعت" },
  kwh: { category: "energy", toBase: 3600000, labelFa: "کیلووات‌ساعت" },

  // فشار (پایه: پاسکال)
  pa: { category: "pressure", toBase: 1, labelFa: "پاسکال" },
  kpa: { category: "pressure", toBase: 1000, labelFa: "کیلوپاسکال" },
  bar: { category: "pressure", toBase: 100000, labelFa: "بار" },
  atm: { category: "pressure", toBase: 101325, labelFa: "اتمسفر" },
  psi: { category: "pressure", toBase: 6894.757, labelFa: "PSI" },
};

function convertTemperature(val: number, fromU: string, toU: string): string | null {
  const norm = (u: string) => {
    const s = u.toLowerCase().trim();
    if (["c", "degc", "celsius", "سانتیگراد", "سلسیوس"].includes(s)) return "C";
    if (["f", "degf", "fahrenheit", "فارنهایت"].includes(s)) return "F";
    if (["k", "kelvin", "کلوین"].includes(s)) return "K";
    return null;
  };
  const f = norm(fromU), t = norm(toU);
  if (!f || !t) return null;
  let celsius = val;
  if (f === "F") celsius = ((val - 32) * 5) / 9;
  else if (f === "K") celsius = val - 273.15;

  let res = celsius;
  if (t === "F") res = (celsius * 9) / 5 + 32;
  else if (t === "K") res = celsius + 273.15;

  const names: Record<string, string> = { C: "درجه سلسیوس (°C)", F: "درجه فارنهایت (°F)", K: "کلوین (K)" };
  return `${val} ${names[f]} برابر است با ${Number(res.toFixed(4))} ${names[t]}`;
}

function convertLocalUnit(val: number, fromUnit: string, toUnit: string): string | null {
  const tempRes = convertTemperature(val, fromUnit, toUnit);
  if (tempRes) return tempRes;

  const fKey = fromUnit.toLowerCase().trim();
  const tKey = toUnit.toLowerCase().trim();
  const fDef = UNIT_TABLE[fKey];
  const tDef = UNIT_TABLE[tKey];
  if (!fDef || !tDef || fDef.category !== tDef.category) return null;

  const result = (val * fDef.toBase) / tDef.toBase;
  const formatted = Number.isInteger(result) ? String(result) : Number(result.toPrecision(8)).toString();
  return `${val} ${fDef.labelFa} (${fromUnit}) = ${formatted} ${tDef.labelFa} (${toUnit})`;
}

async function fetchMathUnitOnline(
  mathExpr?: string,
  fromValue?: number,
  fromUnit?: string,
  toUnit?: string
): Promise<string> {
  const results: string[] = [];

  // ۱. تبدیل ارز آنلاین رایگان در صورت وجود کد ارز (USD, EUR, GBP, TRY, AED, CAD, JPY...)
  const currencyRegex = /^[A-Za-z]{3}$/;
  const knownCurrencies = new Set(["USD", "EUR", "GBP", "AED", "TRY", "CAD", "AUD", "JPY", "CHF", "CNY", "SAR", "IQD", "RUB"]);
  if (
    typeof fromValue === "number" &&
    !isNaN(fromValue) &&
    fromUnit &&
    toUnit &&
    currencyRegex.test(fromUnit.trim()) &&
    currencyRegex.test(toUnit.trim()) &&
    (knownCurrencies.has(fromUnit.trim().toUpperCase()) || knownCurrencies.has(toUnit.trim().toUpperCase()))
  ) {
    try {
      const base = fromUnit.trim().toUpperCase();
      const target = toUnit.trim().toUpperCase();
      const cRes = await fetchWithTimeout(`https://open.er-api.com/v6/latest/${base}`, {}, 4000);
      if (cRes.ok) {
        const cData = (await cRes.json()) as any;
        const rate = cData?.rates?.[target];
        if (typeof rate === "number") {
          results.push(`💱 نرخ آنلاین ارز: ${fromValue} ${base} = ${(fromValue * rate).toFixed(4)} ${target} (نرخ واحد: ${rate})`);
        }
      }
    } catch {}
  }

  // ۲. تبدیل واحد دقیق داخلی
  if (typeof fromValue === "number" && !isNaN(fromValue) && fromUnit && toUnit) {
    const localConv = convertLocalUnit(fromValue, fromUnit, toUnit);
    if (localConv) results.push(`📏 محاسبه دقیق تبدیل واحد: ${localConv}`);
  }

  // ۳. وب‌سرویس رایگان MathJS برای عبارات ریاضی، مشتق، ساده‌سازی و تبدیل واحد
  if (mathExpr && mathExpr.trim()) {
    const cleanExpr = normalizeDigits(mathExpr.trim());
    try {
      const mRes = await fetchWithTimeout(`https://api.mathjs.org/v4/?expr=${encodeURIComponent(cleanExpr)}`, {}, 3500);
      if (mRes.ok) {
        const ans = (await mRes.text()).trim();
        if (ans && !ans.startsWith("Error")) {
          results.push(`🔢 خروجی وب‌سرویس MathJS برای عبارت (${cleanExpr}): ${ans}`);
        }
      }
    } catch {}
  }

  return results.join("\n") || "محاسبه از طریق موتور ریاضی هوش مصنوعی انجام شود.";
}

// ==================== ۵. سرویس رایگان ترجمه (MyMemory API + Cloudflare AI) ====================
async function fetchTranslationOnline(env: Env, text: string, sourceLang: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) return "";
  const sl = (sourceLang || (/[\u0600-\u06FF]/.test(text) ? "fa" : "en")).toLowerCase().slice(0, 2);
  const tl = (targetLang || (sl === "fa" ? "en" : "fa")).toLowerCase().slice(0, 2);
  const outputs: string[] = [];

  // ۱. سرویس رایگان MyMemory Translation API
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${sl}|${tl}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    if (res.ok) {
      const data = (await res.json()) as any;
      const translated = data?.responseData?.translatedText;
      if (translated && typeof translated === "string" && !translated.includes("MYMEMORY WARNING")) {
        outputs.push(`🌐 ترجمه آنلاین MyMemory (${sl} ⬅️ ${tl}):\n${translated}`);
      }
    }
  } catch {}

  // ۲. پشتیبان رایگان Cloudflare Workers AI (مدل ترجمه چندزبانه M2M100)
  if (outputs.length === 0 && env.AI) {
    try {
      const cfRes = await env.AI.run("@cf/meta/m2m100-1.2b", {
        text: text.slice(0, 800),
        source_lang: sl,
        target_lang: tl,
      });
      if (cfRes?.translated_text) {
        outputs.push(`🌐 ترجمه موتور عصبی Cloudflare (${sl} ⬅️ ${tl}):\n${cfRes.translated_text}`);
      }
    } catch {}
  }

  return outputs.join("\n\n");
}

// ==================== ۶. ادبیات فارسی، شعر و گنجور (Ganjoor API - بدون کلید) ====================
const GANJOOR_POET_IDS: Record<string, number> = {
  "حافظ": 2,
  "خیام": 3,
  "فردوسی": 4,
  "مولانا": 5,
  "مولوی": 5,
  "نظامی": 6,
  "سعدی": 7,
  "پروین": 8,
  "پروین اعتصامی": 8,
  "عطار": 9,
  "ابوسعید": 11,
  "رودکی": 12,
  "صائب": 22,
  "باباطاهر": 28,
  "شهریار": 35,
};

function resolveGanjoorPoetId(poetFa?: string): number {
  if (!poetFa) return 0;
  const p = poetFa.trim();
  for (const [name, id] of Object.entries(GANJOOR_POET_IDS)) {
    if (p.includes(name)) return id;
  }
  return 0;
}

async function fetchPoetryOnline(poetFa?: string, keywordFa?: string, isFaal?: boolean): Promise<string> {
  const poetId = resolveGanjoorPoetId(poetFa);
  try {
    if (isFaal || (poetId === 2 && !keywordFa)) {
      const fRes = await fetchWithTimeout("https://api.ganjoor.net/api/ganjoor/hafez/faal", {}, 6000);
      if (fRes.ok) {
        const fData = (await fRes.json()) as any;
        if (fData?.plainText) {
          return `📜 ${fData.fullTitle || "غزل حافظ"}:\n\n${fData.plainText.slice(0, 1800)}\n\n🔗 منبع: https://ganjoor.net${fData.fullUrl || ""}`;
        }
      }
    }

    if (keywordFa && keywordFa.trim().length >= 2) {
      const poetParam = poetId > 0 ? `&poetId=${poetId}` : "";
      const sUrl = `https://api.ganjoor.net/api/ganjoor/poems/search?term=${encodeURIComponent(keywordFa.trim())}${poetParam}&PageNumber=1&PageSize=5`;
      const sRes = await fetchWithTimeout(sUrl, {}, 6500);
      if (sRes.ok) {
        const poems = (await sRes.json()) as any[];
        if (Array.isArray(poems) && poems.length > 0 && poems[0]?.plainText) {
          const matched = poems[0];
          return `📜 ${matched.fullTitle}:\n\n${String(matched.plainText).slice(0, 1800)}\n\n🔗 منبع: https://ganjoor.net${matched.fullUrl || ""}`;
        }
      }
    }

    const rUrl = poetId > 0
      ? `https://api.ganjoor.net/api/ganjoor/poem/random?poetId=${poetId}`
      : "https://api.ganjoor.net/api/ganjoor/poem/random";
    const rRes = await fetchWithTimeout(rUrl, {}, 6000);
    if (rRes.ok) {
      const rData = (await rRes.json()) as any;
      if (rData?.plainText) {
        return `📜 ${rData.fullTitle}:\n\n${String(rData.plainText).slice(0, 1800)}\n\n🔗 منبع: https://ganjoor.net${rData.fullUrl || ""}`;
      }
    }
  } catch (e) {
    console.error("Ganjoor API error:", e);
  }
  return "شعری از وب‌سرویس گنجور دریافت نشد؛ لطفاً بر اساس دانش ادبی پاسخ دهید.";
}

// ==================== ۷. قرآن کریم، ترجمه فارسی و تلاوت صوتی (AlQuran Cloud - بدون کلید) ====================
async function fetchQuranOnline(
  surahNum?: number,
  ayahNum?: number
): Promise<{ context: string; audioUrl?: string; audioTitle?: string }> {
  const sNum = surahNum && surahNum >= 1 && surahNum <= 114 ? surahNum : 1;
  try {
    if (ayahNum && ayahNum >= 1) {
      const url = `https://api.alquran.cloud/v1/ayah/${sNum}:${ayahNum}/editions/quran-uthmani,fa.makarem,ar.alafasy`;
      const res = await fetchWithTimeout(url, {}, 6000);
      if (res.ok) {
        const json = (await res.json()) as any;
        const d = json?.data;
        if (Array.isArray(d) && d.length >= 2) {
          const ar = d[0];
          const fa = d[1];
          const aud = d[2];
          const surahName = ar?.surah?.name || `سوره ${sNum}`;
          const text =
            `📖 ${surahName} — آیه ${ayahNum}:\n\n` +
            `🕋 متن آیه:\n${ar.text}\n\n` +
            `🇮🇷 ترجمه فارسی (آیت‌الله مکارم شیرازی):\n${fa.text}`;
          return {
            context: text,
            audioUrl: aud?.audio || undefined,
            audioTitle: `${surahName} - آیه ${ayahNum}`,
          };
        }
      }
    } else {
      const url = `https://api.alquran.cloud/v1/surah/${sNum}/editions/quran-uthmani,fa.makarem,ar.alafasy`;
      const res = await fetchWithTimeout(url, {}, 7000);
      if (res.ok) {
        const json = (await res.json()) as any;
        const d = json?.data;
        if (Array.isArray(d) && d.length >= 2) {
          const arSurah = d[0];
          const faSurah = d[1];
          const audSurah = d[2];
          const totalAyahs = arSurah.numberOfAyahs || 0;
          const maxShow = Math.min(totalAyahs, 8);
          let lines = `📖 ${arSurah.name} (${arSurah.englishName}) — تعداد کل آیات: ${totalAyahs}\n\n`;
          for (let i = 0; i < maxShow; i++) {
            lines += `(${i + 1}) ${arSurah.ayahs?.[i]?.text || ""}\nترجمه: ${faSurah.ayahs?.[i]?.text || ""}\n\n`;
          }
          if (totalAyahs > maxShow) {
            lines += `...(نمایش ${maxShow} آیه نخست از ${totalAyahs} آیه)`;
          }
          const audioUrl =
            totalAyahs <= 35
              ? `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${sNum}.mp3`
              : audSurah?.ayahs?.[0]?.audio || undefined;
          return {
            context: lines,
            audioUrl,
            audioTitle: totalAyahs <= 35 ? `تلاوت کامل ${arSurah.name}` : `تلاوت آیه اول ${arSurah.name}`,
          };
        }
      }
    }
  } catch (e) {
    console.error("Quran API error:", e);
  }
  return { context: "آیه مورد نظر از وب‌سرویس قرآن دریافت نشد." };
}

// ==================== ۸. نجوم، تصاویر فضایی ناسا و ایستگاه فضایی (NASA + ISS - بدون کلید) ====================
async function fetchSpaceOnline(
  queryEn: string,
  isIssRequest?: boolean
): Promise<{ context: string; photoUrl?: string }> {
  if (isIssRequest || /iss|space\s*station|astronaut/i.test(queryEn)) {
    try {
      const [issRes, astRes] = await Promise.allSettled([
        fetchWithTimeout("https://api.wheretheiss.at/v1/satellites/25544", {}, 5000),
        fetchWithTimeout("http://api.open-notify.org/astros.json", {}, 5000),
      ]);

      let out = `🛰 وضعیت لحظه‌ای ایستگاه فضایی بین‌المللی (ISS):\n`;
      if (issRes.status === "fulfilled" && issRes.value.ok) {
        const iss = (await issRes.value.json()) as any;
        const lat = Number(iss.latitude).toFixed(2);
        const lon = Number(iss.longitude).toFixed(2);
        const alt = Math.round(Number(iss.altitude));
        const vel = Math.round(Number(iss.velocity));
        let locationFa = "";
        try {
          const rgRes = await fetchWithTimeout(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${iss.latitude}&longitude=${iss.longitude}&localityLanguage=fa`,
            {},
            4000
          );
          if (rgRes.ok) {
            const rg = (await rgRes.json()) as any;
            locationFa = rg.countryName || rg.localityInfo?.informative?.[0]?.name || "اقیانوس‌های زمین";
          }
        } catch {}
        out += `• موقعیت فعلی بر فراز: ${locationFa || "مدار زمین"} (عرض جغرافیایی ${lat}°، طول جغرافیایی ${lon}°)\n`;
        out += `• ارتفاع از سطح زمین: حدود ${alt} کیلومتر\n`;
        out += `• سرعت حرکت در مدار: ${vel.toLocaleString("en-US")} کیلومتر بر ساعت!\n`;
      }

      if (astRes.status === "fulfilled" && astRes.value.ok) {
        const ast = (await astRes.value.json()) as any;
        if (Array.isArray(ast?.people)) {
          out += `\n👨‍🚀 تعداد انسان‌های حاضر در فضا در این لحظه: ${ast.number} نفر\n`;
          out += `• فضانوردان: ${ast.people.map((p: any) => `${p.name} (${p.craft})`).join("، ")}\n`;
        }
      }
      return { context: out };
    } catch (e) {
      console.error("ISS error:", e);
    }
  }

  try {
    const q = (queryEn && queryEn.trim()) ? queryEn.trim() : "james webb nebula galaxy";
    const nasaUrl = `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image`;
    const res = await fetchWithTimeout(nasaUrl, {}, 6500);
    if (res.ok) {
      const json = (await res.json()) as any;
      const items = json?.collection?.items || [];
      const firstWithImg = items.find((it: any) => it?.links?.[0]?.href && it?.data?.[0]);
      if (firstWithImg) {
        const meta = firstWithImg.data[0];
        const imgUrl = firstWithImg.links[0].href;
        const desc = String(meta.description || "").replace(/<[^>]+>/g, " ").slice(0, 1200);
        return {
          context:
            `🌌 داده رسمی آرشیو فضایی ناسا (NASA):\n` +
            `• عنوان تصویر: ${meta.title}\n` +
            `• تاریخ ثبت: ${(meta.date_created || "").split("T")[0]}\n` +
            `• توضیحات علمی ناسا: ${desc}`,
          photoUrl: imgUrl,
        };
      }
    }
  } catch (e) {
    console.error("NASA API error:", e);
  }

  return { context: `اطلاعات نجومی درباره ${queryEn}` };
}

// ==================== ۹. آزمایشگاه شیمی و لرزه‌نگار زمین‌شناسی (PubChem + USGS - بدون کلید) ====================
async function fetchChemistryOnline(compoundEn: string, queryFa: string): Promise<string> {
  const parts: string[] = [];
  const cleanEn = (compoundEn || "").trim();

  const [pubPropSettled, pubDescSettled, faWikiSettled] = await Promise.allSettled([
    cleanEn
      ? fetchWithTimeout(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cleanEn)}/property/MolecularFormula,MolecularWeight,IUPACName/JSON`,
          {},
          5500
        )
      : Promise.reject("no_en"),
    cleanEn
      ? fetchWithTimeout(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cleanEn)}/description/JSON`,
          {},
          5500
        )
      : Promise.reject("no_en"),
    searchWikipediaLang("fa", queryFa || cleanEn),
  ]);

  if (pubPropSettled.status === "fulfilled" && pubPropSettled.value.ok) {
    try {
      const pJson = (await pubPropSettled.value.json()) as any;
      const prop = pJson?.PropertyTable?.Properties?.[0];
      if (prop) {
        parts.push(
          `🧪 مشخصات آزمایشگاهی از پایگاه ملی شیمی (PubChem):\n` +
          `• فرمول شیمیایی: ${prop.MolecularFormula || "—"}\n` +
          `• جرم مولی (وزن مولکولی): ${prop.MolecularWeight || "—"} g/mol\n` +
          `• نام علمی آیوپاک (IUPAC): ${prop.IUPACName || cleanEn}`
        );
      }
    } catch {}
  }

  if (pubDescSettled.status === "fulfilled" && pubDescSettled.value.ok) {
    try {
      const dJson = (await pubDescSettled.value.json()) as any;
      const infos = dJson?.InformationList?.Information || [];
      const descObj = infos.find((x: any) => typeof x.Description === "string" && x.Description.length > 30);
      if (descObj) {
        parts.push(`🔬 توضیحات علمی PubChem:\n${String(descObj.Description).slice(0, 800)}`);
      }
    } catch {}
  }

  if (faWikiSettled.status === "fulfilled" && faWikiSettled.value) {
    parts.push(`📖 دانشنامه فارسی («${faWikiSettled.value.title}»):\n${faWikiSettled.value.extract.slice(0, 1000)}`);
  }

  return parts.join("\n\n") || `جستجوی شیمی برای «${queryFa || compoundEn}».`;
}

async function fetchEarthquakeOnline(scope: "iran" | "world" = "iran"): Promise<string> {
  try {
    const url =
      scope === "world"
        ? "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=6&minmagnitude=4.8"
        : "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=24&maxlatitude=40&minlongitude=44&maxlongitude=64&limit=6&minmagnitude=2.5";

    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return "اطلاعات لحظه‌ای زلزله دریافت نشد.";
    const data = (await res.json()) as any;
    const features = data?.features || [];
    if (features.length === 0) {
      return scope === "iran"
        ? "خوشبختانه زمین‌لرزه قابل‌توجهی در روزهای اخیر در محدوده ایران در سامانه جهانی ثبت نشده است."
        : "زمین‌لرزه بزرگی در ساعات اخیر ثبت نشده است.";
    }

    let out = `🌍 آخرین زمین‌لرزه‌های ثبت‌شده در سامانه لرزه‌نگاری جهانی USGS (${scope === "iran" ? "ایران و مناطق اطراف" : "جهان"}):\n\n`;
    features.slice(0, 6).forEach((f: any, idx: number) => {
      const p = f.properties || {};
      const depth = f.geometry?.coordinates?.[2] ?? "—";
      const timeFa = p.time ? formatDateTime(new Date(p.time).toISOString()) : "نامشخص";
      out += `${idx + 1}. بزرگی: ${p.mag} ریشتر | مکان: ${p.place} | عمق: ${depth} کیلومتر | زمان: ${timeFa}\n`;
    });
    return out;
  } catch (e) {
    console.error("USGS error:", e);
    return "خطا در دریافت داده‌های لرزه‌نگاری.";
  }
}

// ==================== ۱۰. رسم بصری نمودار توابع ریاضی (بدون eval — سازگار با کلودفلر) ====================
function evalMathFunctionSafe(rawExpr: string, xVal: number): number {
  let s = normalizeDigits(rawExpr)
    .toLowerCase()
    .replace(/^[yf]\s*(\(\s*x\s*\))?\s*=\s*/i, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/\s+/g, "");

  // درج ضرب ضمنی مثل 2x -> 2*x یا 3(x+1) -> 3*(x+1) یا 2sin(x) -> 2*sin(x)
  s = s
    .replace(/(\d)(x|\(|pi|e|sin|cos|tan|sqrt|cbrt|abs|log|ln|exp)/g, "$1*$2")
    .replace(/(x|\))(\d|x|\(|pi|e|sin|cos|tan|sqrt|cbrt|abs|log|ln|exp)/g, "$1*$2");

  let pos = 0;
  const peek = () => s[pos] || "";

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek() === "+" || peek() === "-") {
      const op = s[pos++];
      const right = parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parseUnary();
    while (peek() === "*" || peek() === "/") {
      const op = s[pos++];
      const right = parseUnary();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseUnary(): number {
    if (peek() === "-") {
      pos++;
      return -parseUnary();
    }
    if (peek() === "+") {
      pos++;
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parseAtom();
    if (peek() === "^") {
      pos++;
      const exp = parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseAtom(): number {
    if (peek() === "(") {
      pos++;
      const v = parseAddSub();
      if (peek() === ")") pos++;
      return v;
    }
    const numMatch = s.slice(pos).match(/^\d+(\.\d+)?/);
    if (numMatch) {
      pos += numMatch[0].length;
      return parseFloat(numMatch[0]);
    }
    const idMatch = s.slice(pos).match(/^[a-z]+/);
    if (idMatch) {
      const name = idMatch[0];
      pos += name.length;
      if (name === "x") return xVal;
      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;
      if (peek() === "(") {
        pos++;
        const arg = parseAddSub();
        if (peek() === ")") pos++;
        if (name === "sin") return Math.sin(arg);
        if (name === "cos") return Math.cos(arg);
        if (name === "tan") return Math.tan(arg);
        if (name === "sqrt") return Math.sqrt(arg);
        if (name === "cbrt") return Math.cbrt(arg);
        if (name === "abs") return Math.abs(arg);
        if (name === "ln") return Math.log(arg);
        if (name === "log") return Math.log10(arg);
        if (name === "exp") return Math.exp(arg);
        if (name === "floor") return Math.floor(arg);
        if (name === "ceil") return Math.ceil(arg);
        if (name === "round") return Math.round(arg);
      }
    }
    return NaN;
  }

  return parseAddSub();
}

function buildMathPlotOnline(funcExpr: string, xMin = -10, xMax = 10): { context: string; photoUrl?: string } {
  const cleanLabel = normalizeDigits(funcExpr).replace(/^[yf]\s*(\(\s*x\s*\))?\s*=\s*/i, "").trim();
  const lo = typeof xMin === "number" && isFinite(xMin) ? xMin : -10;
  const hi = typeof xMax === "number" && isFinite(xMax) && xMax > lo ? xMax : 10;
  const steps = 80;
  const dx = (hi - lo) / steps;

  const xs: number[] = [];
  const ys: (number | null)[] = [];
  let validCount = 0;

  for (let i = 0; i <= steps; i++) {
    const x = Number((lo + i * dx).toFixed(3));
    xs.push(x);
    const y = evalMathFunctionSafe(cleanLabel, x);
    if (typeof y === "number" && isFinite(y) && Math.abs(y) <= 1000) {
      ys.push(Number(y.toFixed(4)));
      validCount++;
    } else {
      ys.push(null);
    }
  }

  if (validCount < 3) {
    return { context: `امکان نمونه‌برداری عددی از تابع y = ${cleanLabel} فراهم نشد؛ لطفاً ویژگی‌های تابع را تشریحی توضیح دهید.` };
  }

  const chartConfig = {
    type: "line",
    data: {
      labels: xs,
      datasets: [
        {
          label: `y = ${cleanLabel}`,
          data: ys,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          fill: false,
          pointRadius: 0,
          borderWidth: 3,
          spanGaps: false,
        },
      ],
    },
    options: {
      title: { display: true, text: `y = ${cleanLabel}`, fontSize: 18 },
      legend: { display: true },
      scales: {
        xAxes: [{ scaleLabel: { display: true, labelString: "x" }, ticks: { maxTicksLimit: 11 } }],
        yAxes: [{ scaleLabel: { display: true, labelString: "y" } }],
      },
    },
  };

  const photoUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=750&h=480&bkg=white`;
  const yAtZero = evalMathFunctionSafe(cleanLabel, 0);
  const sampleInfo = `📐 نمودار تابع y = ${cleanLabel} در بازه [${lo}, ${hi}] رسم شد.${isFinite(yAtZero) ? ` مقدار عرض از مبدأ (در x=0): y = ${Number(yAtZero.toFixed(4))}` : ""}`;
  return { context: sampleInfo, photoUrl };
}

// ==================== ۱۱. ساخت تصویر هوشمند با هوش مصنوعی (Cloudflare AI Flux - رایگان) ====================
async function generateImageWithCloudflareAI(
  env: Env,
  promptEn: string
): Promise<{ context: string; imageBytes?: Uint8Array; photoUrl?: string }> {
  const safePrompt = `${promptEn.trim()}, educational clean illustration, high quality, detailed, safe for school students, vibrant colors`;
  if (!env.AI && process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) {
    try {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: safePrompt.slice(0, 1800), steps: 4 }),
        }
      );
      const cfJson = (await cfRes.json()) as any;
      const b64 = cfJson?.result?.image;
      if (b64 && typeof b64 === "string") {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { context: `🎨 تصویر هوش مصنوعی با موضوع «${promptEn}» تولید شد.`, imageBytes: bytes };
      }
    } catch {}
  }
  if (!env.AI) {
    try {
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(promptEn)}&gsrlimit=5&prop=imageinfo&iiprop=url|mime&iiurlwidth=900&format=json&origin=*`;
      const wr = await fetch(wikiUrl, { headers: { "User-Agent": "SmartClassBot/2.0 (Educational)" } });
      const wj = (await wr.json()) as any;
      const pages = Object.values(wj?.query?.pages || {}) as any[];
      for (const p of pages) {
        const info = p?.imageinfo?.[0];
        const u = info?.thumburl || info?.url;
        if (u && /\.(jpg|jpeg|png)$/i.test(u)) {
          const imgR = await fetch(u, { headers: { "User-Agent": "SmartClassBot/2.0" } });
          if (imgR.ok) {
            const bytes = new Uint8Array(await imgR.arrayBuffer());
            return { context: `🖼 تصویر آموزشی مرتبط با «${promptEn}» یافت و ارسال شد.`, imageBytes: bytes };
          }
        }
      }
    } catch {}
    return { context: "تصویر مرتبط یافت نشد، اما توضیح علمی موضوع را ارائه بده." };
  }
  try {
    const res = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
      prompt: safePrompt.slice(0, 1800),
      steps: 4,
    });
    if (res?.image && typeof res.image === "string") {
      const bin = atob(res.image);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return {
        context: `🎨 تصویر درخواستی با موضوع «${promptEn}» با موفقیت توسط هوش مصنوعی تولید و ارسال شد.`,
        imageBytes: bytes,
      };
    }
  } catch (e: any) {
    console.error("Flux Image Gen Error:", e?.message || e);
  }
  return { context: "خطا در تولید تصویر با هوش مصنوعی کلودفلر." };
}

// ==================== ۱۲. تقویم سه‌گانه، اوقات شرعی و رویدادهای تاریخی امروز (Aladhan + Wiki) ====================
async function fetchCalendarAndHistoryOnline(
  cityFa = "تهران",
  cityEn = "Tehran",
  includeHistory = false
): Promise<string> {
  const now = new Date();
  const jNow = (jalaali as any).toJalaali(now);
  const jMonths = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  const weekDays = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه"];

  let out =
    `🗓 اطلاعات تقویم امروز:\n` +
    `• روز هفته: ${weekDays[now.getDay()]}\n` +
    `• تاریخ خورشیدی (شمسی): ${jNow.jd} ${jMonths[jNow.jm - 1]} ${jNow.jy} (${jNow.jy}/${String(jNow.jm).padStart(2, "0")}/${String(jNow.jd).padStart(2, "0")})\n` +
    `• تاریخ میلادی: ${now.toISOString().split("T")[0]}\n`;

  const [prayerSettled, historySettled] = await Promise.allSettled([
    fetchWithTimeout(
      `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(cityEn || "Tehran")}&country=Iran&method=7`,
      {},
      5500
    ),
    includeHistory
      ? fetchWithTimeout(
          `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}`,
          {},
          5500
        )
      : Promise.resolve(null),
  ]);

  if (prayerSettled.status === "fulfilled" && prayerSettled.value?.ok) {
    try {
      const pJson = (await prayerSettled.value.json()) as any;
      const t = pJson?.data?.timings;
      const hijri = pJson?.data?.date?.hijri;
      if (hijri) {
        out += `• تاریخ قمری: ${hijri.day} ${hijri.month?.ar || ""} ${hijri.year} هجری قمری\n`;
      }
      if (t) {
        out +=
          `\n🕌 اوقات شرعی به افق ${cityFa || "تهران"} (روش موسسه ژئوفیزیک دانشگاه تهران):\n` +
          `• اذان صبح: ${t.Fajr}\n` +
          `• طلوع آفتاب: ${t.Sunrise}\n` +
          `• اذان ظهر: ${t.Dhuhr}\n` +
          `• غروب آفتاب: ${t.Sunset}\n` +
          `• اذان مغرب: ${t.Maghrib}\n` +
          `• نیمه‌شب شرعی: ${t.Midnight}\n`;
      }
    } catch {}
  }

  if (includeHistory && historySettled.status === "fulfilled" && historySettled.value && (historySettled.value as Response).ok) {
    try {
      const hJson = (await (historySettled.value as Response).json()) as any;
      const selected = hJson?.selected || [];
      if (Array.isArray(selected) && selected.length > 0) {
        out += `\n🏛 رویدادهای مهم ثبت‌شده در چنین روزی در تاریخ جهان (لطفاً به فارسی روان ترجمه و بازگو شود):\n`;
        selected.slice(0, 6).forEach((ev: any) => {
          out += `• سال ${ev.year}: ${ev.text}\n`;
        });
      }
    } catch {}
  }

  return out;
}

// ==================== ۱۳. شناسنامه جغرافیایی کشورها و تصویر پرچم (WorldBank + FlagCDN + Wiki) ====================
async function fetchCountryGeographyOnline(
  countryFa: string,
  countryEn: string
): Promise<{ context: string; photoUrl?: string }> {
  let iso2 = "";
  let wbText = "";

  const [geoSettled, faWikiSettled] = await Promise.allSettled([
    fetchWithTimeout(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(countryEn || countryFa)}&count=3&language=fa&format=json`,
      {},
      5000
    ),
    searchWikipediaLang("fa", countryFa || countryEn),
  ]);

  if (geoSettled.status === "fulfilled" && geoSettled.value.ok) {
    try {
      const gData = (await geoSettled.value.json()) as any;
      const countryHit =
        (gData?.results || []).find((r: any) => String(r.feature_code || "").startsWith("PCL")) ||
        gData?.results?.[0];
      if (countryHit?.country_code) {
        iso2 = String(countryHit.country_code).toUpperCase();
      }
    } catch {}
  }

  if (iso2) {
    try {
      const wbRes = await fetchWithTimeout(`https://api.worldbank.org/v2/country/${iso2.toLowerCase()}?format=json`, {}, 5000);
      if (wbRes.ok) {
        const wbJson = (await wbRes.json()) as any;
        const cInfo = wbJson?.[1]?.[0];
        if (cInfo) {
          wbText =
            `🗺 مشخصات جغرافیایی رسمی (بانک جهانی):\n` +
            `• نام بین‌المللی: ${cInfo.name} (${cInfo.iso2Code})\n` +
            `• پایتخت: ${cInfo.capitalCity || "—"}\n` +
            `• منطقه جغرافیایی: ${cInfo.region?.value || "—"}\n` +
            `• سطح درآمدی: ${cInfo.incomeLevel?.value || "—"}\n`;
        }
      }
    } catch {}
  }

  let context = wbText;
  if (faWikiSettled.status === "fulfilled" && faWikiSettled.value) {
    context += `\n📖 دانشنامه جغرافیایی فارسی («${faWikiSettled.value.title}»):\n${faWikiSettled.value.extract.slice(0, 1300)}`;
  }
  const flagUrl = iso2 ? `https://flagcdn.com/w640/${iso2.toLowerCase()}.png` : undefined;
  return {
    context: context || `اطلاعات جغرافیایی کشور ${countryFa || countryEn}`,
    photoUrl: flagUrl,
  };
}

// ==================== ۱۴. موزه‌گردی جهانی و آثار باستانی با عکس HD (Cleveland Museum + Wiki) ====================
async function fetchMuseumOnline(
  queryEn: string,
  queryFa: string
): Promise<{ context: string; photoUrl?: string }> {
  let photoUrl: string | undefined;
  const parts: string[] = [];

  const [cmaSettled, faWikiSettled] = await Promise.allSettled([
    fetchWithTimeout(
      `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(queryEn || "ancient iran persepolis")}&has_image=1&limit=3`,
      {},
      6500
    ),
    searchWikipediaLang("fa", queryFa || queryEn),
  ]);

  if (cmaSettled.status === "fulfilled" && cmaSettled.value.ok) {
    try {
      const cmaJson = (await cmaSettled.value.json()) as any;
      const art = cmaJson?.data?.find((x: any) => x?.images?.web?.url);
      if (art) {
        photoUrl = art.images.web.url;
        parts.push(
          `🏛 اثر باستانی / هنری از کلکسیون آزاد موزه کلیولند:\n` +
          `• نام اثر: ${art.title || "—"}\n` +
          `• قدمت و دوره تاریخی: ${art.creation_date || "—"}\n` +
          `• تمدن / خاستگاه: ${Array.isArray(art.culture) ? art.culture.join("، ") : art.culture || "—"}\n` +
          `• جنس و تکنیک: ${art.technique || "—"}\n` +
          `• توضیحات موزه: ${String(art.description || art.wall_description || "").replace(/<[^>]+>/g, " ").slice(0, 900)}`
        );
      }
    } catch {}
  }

  if (faWikiSettled.status === "fulfilled" && faWikiSettled.value) {
    parts.push(`📖 دانشنامه تاریخی فارسی («${faWikiSettled.value.title}»):\n${faWikiSettled.value.extract.slice(0, 1100)}`);
    if (!photoUrl) {
      try {
        const sumRes = await fetchWithTimeout(
          `https://fa.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(faWikiSettled.value.title)}`,
          {},
          4500
        );
        if (sumRes.ok) {
          const sumJson = (await sumRes.json()) as any;
          if (sumJson?.thumbnail?.source) photoUrl = sumJson.thumbnail.source;
        }
      } catch {}
    }
  }

  return {
    context: parts.join("\n\n") || `اطلاعات تاریخی و موزه‌ای درباره ${queryFa || queryEn}`,
    photoUrl,
  };
}

// ==================== ۱۵. دانشنامه تصویری حیات‌وحش، گیاهان و زیست‌شناسی (iNaturalist + Wiki) ====================
async function fetchWildlifeOnline(
  queryEn: string,
  queryFa: string
): Promise<{ context: string; photoUrl?: string }> {
  let photoUrl: string | undefined;
  const parts: string[] = [];

  const [inatSettled, faWikiSettled] = await Promise.allSettled([
    fetchWithTimeout(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(queryEn || queryFa)}&per_page=3`,
      {},
      6500
    ),
    searchWikipediaLang("fa", queryFa || queryEn),
  ]);

  if (inatSettled.status === "fulfilled" && inatSettled.value.ok) {
    try {
      const inatJson = (await inatSettled.value.json()) as any;
      const taxon = inatJson?.results?.find((t: any) => t?.default_photo?.medium_url) || inatJson?.results?.[0];
      if (taxon) {
        photoUrl = taxon?.default_photo?.medium_url || taxon?.default_photo?.url;
        parts.push(
          `🦁 شناسنامه علمی زیست‌شناسی (پایگاه جهانی iNaturalist):\n` +
          `• نام علمی دوجمله‌ای: ${taxon.name || "—"}\n` +
          `• نام رایج انگلیسی: ${taxon.preferred_common_name || "—"}\n` +
          `• رده زیستی: ${taxon.iconic_taxon_name || "—"} (${taxon.rank || ""})\n` +
          (taxon.wikipedia_summary ? `• خلاصه علمی: ${String(taxon.wikipedia_summary).replace(/<[^>]+>/g, " ").slice(0, 700)}` : "")
        );
      }
    } catch {}
  }

  if (faWikiSettled.status === "fulfilled" && faWikiSettled.value) {
    parts.push(`📖 دانشنامه زیست‌شناسی فارسی («${faWikiSettled.value.title}»):\n${faWikiSettled.value.extract.slice(0, 1200)}`);
    if (!photoUrl) {
      try {
        const sumRes = await fetchWithTimeout(
          `https://fa.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(faWikiSettled.value.title)}`,
          {},
          4500
        );
        if (sumRes.ok) {
          const sumJson = (await sumRes.json()) as any;
          if (sumJson?.thumbnail?.source) photoUrl = sumJson.thumbnail.source;
        }
      } catch {}
    }
  }

  return {
    context: parts.join("\n\n") || `اطلاعات زیستی درباره ${queryFa || queryEn}`,
    photoUrl,
  };
}

// ==================== ۱۶. دیکشنری تخصصی انگلیسی با تلفظ صوتی انسانی + مترادف و متضاد ====================
async function fetchEnglishDictionaryOnline(
  rawWordEn: string
): Promise<{ context: string; audioUrl?: string; audioTitle?: string; audioPerformer?: string }> {
  const cleanWord = rawWordEn
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .split(/\s+/)[0] || "learn";

  const parts: string[] = [];
  let audioUrl: string | undefined;

  const [dictSettled, synSettled, antSettled, usAudioSettled] = await Promise.allSettled([
    fetchWithTimeout(`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(cleanWord)}`, {}, 5500),
    fetchWithTimeout(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(cleanWord)}&max=6`, {}, 4500),
    fetchWithTimeout(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(cleanWord)}&max=6`, {}, 4500),
    fetchWithTimeout(
      `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(cleanWord)}--_us_1.mp3`,
      { method: "HEAD" },
      4000
    ),
  ]);

  if (usAudioSettled.status === "fulfilled" && usAudioSettled.value.ok) {
    audioUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(cleanWord)}--_us_1.mp3`;
  } else {
    try {
      const gbCheck = await fetchWithTimeout(
        `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(cleanWord)}--_gb_1.mp3`,
        { method: "HEAD" },
        3500
      );
      if (gbCheck.ok) {
        audioUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(cleanWord)}--_gb_1.mp3`;
      }
    } catch {}
  }

  const synSet = new Set<string>();
  const antSet = new Set<string>();

  if (dictSettled.status === "fulfilled" && dictSettled.value.ok) {
    try {
      const dJson = (await dictSettled.value.json()) as any;
      const entries = dJson?.entries || [];
      if (entries.length > 0) {
        const ipa = entries[0]?.pronunciations?.find((p: any) => p.text)?.text || "";
        let entryLines = `📕 دیکشنری تخصصی انگلیسی برای واژه «${cleanWord}»${ipa ? ` | تلفظ آوانگاری (IPA): ${ipa}` : ""}:\n`;
        entries.slice(0, 3).forEach((ent: any) => {
          const pos = ent.partOfSpeech || "";
          (ent.synonyms || []).slice(0, 5).forEach((s: string) => synSet.add(s));
          (ent.antonyms || []).slice(0, 5).forEach((a: string) => antSet.add(a));
          const senses = (ent.senses || []).slice(0, 2);
          senses.forEach((sn: any) => {
            entryLines += `• (${pos}) تعریف انگلیسی: ${sn.definition}\n`;
            const ex = sn.examples?.[0] || sn.quotes?.[0]?.text;
            if (ex) entryLines += `  مثال: "${String(ex).slice(0, 180)}"\n`;
            (sn.synonyms || []).slice(0, 4).forEach((s: string) => synSet.add(s));
            (sn.antonyms || []).slice(0, 4).forEach((a: string) => antSet.add(a));
          });
        });
        parts.push(entryLines);
      }
    } catch {}
  }

  if (synSettled.status === "fulfilled" && synSettled.value.ok) {
    try {
      const sArr = (await synSettled.value.json()) as any[];
      sArr.forEach((x) => x?.word && synSet.add(x.word));
    } catch {}
  }
  if (antSettled.status === "fulfilled" && antSettled.value.ok) {
    try {
      const aArr = (await antSettled.value.json()) as any[];
      aArr.forEach((x) => x?.word && antSet.add(x.word));
    } catch {}
  }

  if (synSet.size > 0) parts.push(`🔄 مترادف‌ها (Synonyms): ${Array.from(synSet).slice(0, 7).join(", ")}`);
  if (antSet.size > 0) parts.push(`↔️ متضادها (Antonyms): ${Array.from(antSet).slice(0, 7).join(", ")}`);

  return {
    context: parts.join("\n\n") || `بررسی تخصصی واژه انگلیسی "${cleanWord}"`,
    audioUrl,
    audioTitle: `Pronunciation: ${cleanWord}`,
    audioPerformer: "Oxford Dictionary Audio",
  };
}

// ==================== مسیریاب هوشمند سوالات دانش‌آموز (Smart AI Router) ====================
interface RoutedIntent {
  tool:
    | "weather"
    | "news"
    | "book"
    | "wiki"
    | "math_unit"
    | "translate"
    | "poetry"
    | "quran"
    | "space"
    | "chemistry"
    | "earthquake"
    | "math_plot"
    | "image_gen"
    | "calendar"
    | "country"
    | "museum"
    | "wildlife"
    | "dictionary"
    | "none";
  city_fa?: string;
  city_en?: string;
  news_category?: "general" | "scitech" | "sport" | "culture" | "business";
  news_topic_en?: string;
  query_fa?: string;
  query_en?: string;
  math_expr?: string;
  from_value?: number;
  from_unit?: string;
  to_unit?: string;
  translate_text?: string;
  source_lang?: string;
  target_lang?: string;
  // ادبیات و قرآن
  poet_fa?: string;
  poem_keyword_fa?: string;
  is_faal?: boolean;
  quran_surah?: number;
  quran_ayah?: number;
  // فضا، شیمی و زلزله
  is_iss?: boolean;
  quake_scope?: "iran" | "world";
  // رسم نمودار و ساخت تصویر
  plot_expr?: string;
  plot_xmin?: number;
  plot_xmax?: number;
  image_prompt_en?: string;
  // تقویم و تاریخ
  include_history?: boolean;
  // واژه دیکشنری انگلیسی
  dict_word_en?: string;
}

interface AskAiResult {
  text: string;
  photoUrl?: string;
  imageBytes?: Uint8Array;
  audioUrl?: string;
  audioTitle?: string;
  audioPerformer?: string;
  skipTts?: boolean;
}

function fallbackDetectIntent(rawQuestion: string): RoutedIntent {
  const q = normalizeDigits(rawQuestion.trim());
  if (/(دیکشنری|تلفظ\s+کلمه|مترادف\s+و\s+متضاد|معنی\s+تخصصی\s+لغت)/i.test(q)) {
    const m = q.match(/[a-zA-Z]{2,25}/);
    if (m) return { tool: "dictionary", dict_word_en: m[0] };
  }
  if (/(موزه|اثر\s*باستانی|کتیبه|تخت\s*جمشید|هخامنشی|اشکانی|ساسانی|مصر\s*باستان)/.test(q)) {
    return { tool: "museum", query_fa: q, query_en: "ancient iran persepolis" };
  }
  if (/(حیات\s*وحش|نام\s*علمی\s+جانور|گونه\s*جانوری|یوزپلنگ|پلنگ\s*ایرانی)/.test(q)) {
    return { tool: "wildlife", query_fa: q, query_en: q };
  }
  if (/(فال\s*حافظ|شعر\s+از|غزل\s+|رباعی|بیت\s+شعر|شعری\s+درباره|حکایت\s+سعدی)/.test(q)) {
    return { tool: "poetry", is_faal: /فال\s*حافظ/.test(q), poem_keyword_fa: q };
  }
  if (/(آیه\s*\d+|سوره\s+|آیت\s*الکرسی|آیه\s*الکرسی|قرآن)/.test(q)) {
    if (/(آیت\s*الکرسی|آیه\s*الکرسی)/.test(q)) return { tool: "quran", quran_surah: 2, quran_ayah: 255 };
    return { tool: "quran", quran_surah: 1 };
  }
  if (/(ایستگاه\s*فضایی|فضانوردان\s*در\s*فضا|عکس\s*ناسا|تلسکوپ\s*جیمز\s*وب|تصویر\s*فضایی)/.test(q)) {
    return { tool: "space", is_iss: /ایستگاه\s*فضایی|فضانورد/.test(q), query_en: "james webb galaxy" };
  }
  if (/(زلزله|زمین\s*لرزه)/.test(q)) {
    return { tool: "earthquake", quake_scope: /جهان|دنیا/.test(q) ? "world" : "iran" };
  }
  if (/(رسم\s*نمودار|نمودار\s*تابع|نمودار\s*معادله)/.test(q)) {
    const m = q.match(/y\s*=\s*([0-9xX+\-*/^().\s]+)/);
    return { tool: "math_plot", plot_expr: m ? m[1] : "x^2" };
  }
  if (/(تصویر.*بساز|عکس.*بساز|نقاشی.*بکش|تصویر.*بکش|تولید\s*تصویر)/.test(q)) {
    return { tool: "image_gen", image_prompt_en: q };
  }
  if (/(اوقات\s*شرعی|اذان\s*صبح|اذان\s*ظهر|اذان\s*مغرب|امروز\s*چندمه|تاریخ\s*امروز|در\s*چنین\s*روزی)/.test(q)) {
    return { tool: "calendar", city_fa: "تهران", city_en: "Tehran", include_history: /در\s*چنین\s*روزی|رویدادهای\s*تاریخی/.test(q) };
  }
  if (/(آب\s*و\s*هوا|وضعیت\s*هوا|هوای\s+\S+|دمای\s*هوا|بارون\s*میاد|برف\s*میاد)/.test(q)) {
    const m = q.match(/(?:هوای|آب\s*و\s*هوای|در\s*شهر|شهر)\s+([آ-یa-zA-Z\s]{2,20})/);
    const city = m ? m[1].replace(/(چطوره|چطور\s*است|چنده|امروز|فردا|الان).*/g, "").trim() : "تهران";
    return { tool: "weather", city_fa: city || "تهران" };
  }
  if (/(سرخط\s*خبر|اخبار|خبرهای\s*امروز|چه\s*خبر|تازه\s*ترین\s*خبر)/.test(q)) {
    let cat: RoutedIntent["news_category"] = "general";
    if (/(علمی|فناوری|تکنولوژی|هوش\s*مصنوعی|فضا|نجوم)/.test(q)) cat = "scitech";
    else if (/(ورزش|فوتبال|المپیک|والیبال|کشتی)/.test(q)) cat = "sport";
    else if (/(فرهنگ|هنر|سینما|کتاب)/.test(q)) cat = "culture";
    else if (/(اقتصاد|بورس|تورم|بازار)/.test(q)) cat = "business";
    return { tool: "news", news_category: cat };
  }
  if (/(ترجمه\s*کن|به\s*انگلیسی\s*چی\s*می|به\s*فارسی\s*چی\s*می|معنی\s*کلمه|معنی\s*عبارت|translate)/i.test(q)) {
    return { tool: "translate", translate_text: q };
  }
  if (/(کتاب\s+|نویسنده\s*کتاب|رمان\s+|معرفی\s*کتاب)/.test(q)) {
    const cleaned = q.replace(/(کتاب|نویسنده|درباره|معرفی|خلاصه|کیست|کیه|چیست|چیه)/g, "").trim();
    return { tool: "book", query_fa: cleaned || q };
  }
  if (/(چند\s*(کیلومتر|متر|سانتی|گرم|کیلو|پوند|مایل|لیتر|گیگ|مگابایت|درجه|سلسیوس|فارنهایت)|تبدیل\s*واحد)/.test(q)) {
    return { tool: "math_unit", math_expr: q };
  }
  if (/(کیست|کی\s*بود|کجاست|پایتخت\s+|زندگینامه|بیوگرافی|تاریخچه\s+)/.test(q)) {
    const cleaned = q.replace(/(کیست|کی\s*بود|کجاست|بگو|توضیح\s*بده|\؟|\?)/g, "").trim();
    return { tool: "wiki", query_fa: cleaned || q };
  }
  return { tool: "none" };
}

async function routeStudentQuestion(env: Env, question: string): Promise<RoutedIntent> {
  const routerPrompt = `Analyze the student's Persian/English message and pick the single best LIVE online tool:
1. "weather": current weather, temperature, rain/snow, or forecast of a city (default city: Tehran).
2. "news": latest news, headlines (سرخط خبرها), sports/science/tech/world news.
3. "book": specific book info, author, book summary, or book recommendations.
4. "poetry": Persian poetry (حافظ، سعدی، فردوسی، مولانا، خیام، پروین اعتصامی...), فال حافظ, verses about a topic.
5. "quran": Quran surahs, ayahs (e.g. آیه‌الکرسی = surah 2 ayah 255), Quranic verse translation or audio recitation.
6. "space": NASA space photos (planets, nebulae, galaxies, James Webb, Mars, black holes) OR live International Space Station (ISS) / astronauts in space.
7. "chemistry": chemical elements, periodic table, compounds, molecular formula/weight (e.g. glucose, sulfuric acid, iron, gold, H2O).
8. "earthquake": recent live earthquakes in Iran or the world (زلزله).
9. "math_plot": plotting/drawing a 2D mathematical function graph y = f(x) (رسم نمودار تابع ریاضی).
10. "math_unit": numerical math calculations, derivatives, OR unit/currency conversions (miles to km, F to C, مثقال به گرم, USD to EUR).
11. "image_gen": student asks to generate/draw/paint an AI picture or illustration (ساخت عکس / نقاشی بکش / تصویر بساز).
12. "calendar": today's Jalali/Hijri/Gregorian date, prayer times (اوقات شرعی / اذان), OR "on this day in history" (در چنین روزی در تاریخ).
13. "country": country geography profile, capital city, flag, continent/population (شناسنامه کشور و پرچم).
14. "museum": ancient history artifacts, museum artworks, Persepolis/Achaemenid/Egyptian/Greek antiquities with museum photo (آثار باستانی و موزه).
15. "wildlife": animals, birds, insects, marine life, plants, trees, species taxonomy with real nature photo (حیات‌وحش، جانوران و گیاهان).
16. "dictionary": single English word lookup asking for English dictionary definition, phonetic pronunciation audio, synonyms, or antonyms (دیکشنری تخصصی انگلیسی، تلفظ صوتی، مترادف و متضاد یک لغت انگلیسی).
17. "translate": translating full sentences/phrases or non-English words between languages.
18. "wiki": other general knowledge / encyclopedia facts about biographies, inventions, cities, etc.
19. "none": general school tutoring/problem-solving/greeting that needs no external API.

Return ONLY a valid JSON object:
{
  "tool": "weather"|"news"|"book"|"poetry"|"quran"|"space"|"chemistry"|"earthquake"|"math_plot"|"math_unit"|"image_gen"|"calendar"|"country"|"museum"|"wildlife"|"dictionary"|"translate"|"wiki"|"none",
  "city_fa": "نام شهر یا کشور به فارسی",
  "city_en": "City or Country name in English",
  "news_category": "general"|"scitech"|"sport"|"culture"|"business",
  "news_topic_en": "English news topic keywords if specific, else empty",
  "query_fa": "عبارت کلیدی فارسی",
  "query_en": "Exact English scientific/museum/species/search term (e.g. 'Persepolis Achaemenid', 'Persian leopard', 'glucose', 'Japan')",
  "math_expr": "Valid MathJS expression e.g. '50 miles to km'",
  "from_value": 0,
  "from_unit": "unit code e.g. mile, km, kg, lb, C, F, GB, MB, mesghal, USD",
  "to_unit": "target unit code",
  "translate_text": "exact text to translate",
  "source_lang": "fa",
  "target_lang": "en",
  "poet_fa": "نام شاعر فارسی مثل حافظ، سعدی، فردوسی، مولانا (اگر ذکر شده)",
  "poem_keyword_fa": "کلیدواژه موضوع شعر به فارسی (مثل علم، محبت، بهار)",
  "is_faal": false,
  "quran_surah": 1,
  "quran_ayah": 0,
  "is_iss": false,
  "quake_scope": "iran",
  "plot_expr": "clean function of x in ASCII e.g. 'x^2 - 4' or 'sin(x)'",
  "plot_xmin": -10,
  "plot_xmax": 10,
  "image_prompt_en": "Detailed safe English prompt describing the requested image/illustration",
  "include_history": false,
  "dict_word_en": "single English word for dictionary lookup e.g. 'resilient'"
}

STUDENT MESSAGE:
${normalizeDigits(question)}`;

  try {
    const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: "Output ONLY raw valid JSON. Do not include thinking steps or markdown." },
          { role: "user", content: routerPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    }, 8500);

    if (!response.ok) return fallbackDetectIntent(question);
    const data = (await response.json()) as any;
    const raw = stripThinkTags(data.choices?.[0]?.message?.content || "");
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallbackDetectIntent(question);
    const parsed = JSON.parse(match[0]) as RoutedIntent;
    if (!parsed.tool) return fallbackDetectIntent(question);
    return parsed;
  } catch {
    return fallbackDetectIntent(question);
  }
}

// ==================== هوش مصنوعی + ۱۸ سرویس آنلاین رایگان (پاسخ به سوال دانش‌آموز و معلم) ====================
async function askAI(
  env: Env,
  question: string,
  onStatus?: (statusText: string) => Promise<void>
): Promise<AskAiResult> {
  let liveContext = "";
  let photoUrl: string | undefined;
  let imageBytes: Uint8Array | undefined;
  let audioUrl: string | undefined;
  let audioTitle: string | undefined;
  let audioPerformer: string | undefined;
  let skipTts = false;
  let intent: RoutedIntent = { tool: "none" };

  try {
    intent = await routeStudentQuestion(env, question);

    if (intent.tool === "weather") {
      if (onStatus) await onStatus("🌤 در حال دریافت آنلاین وضعیت آب‌وهوا...");
      liveContext = await fetchWeatherOnline(intent.city_fa || "تهران", intent.city_en || "Tehran");
    } else if (intent.tool === "news") {
      if (onStatus) await onStatus("📰 در حال دریافت آخرین سرخط خبرهای روز...");
      liveContext = await fetchNewsOnline(intent.news_category || "general", intent.news_topic_en);
    } else if (intent.tool === "book") {
      if (onStatus) await onStatus("📚 در حال جستجوی آنلاین در منابع کتاب و دانشنامه...");
      liveContext = await fetchBookOnline(intent.query_fa || question, intent.query_en);
    } else if (intent.tool === "poetry") {
      if (onStatus) await onStatus("📜 در حال جستجوی شعر در گنجینه گنجور...");
      liveContext = await fetchPoetryOnline(intent.poet_fa, intent.poem_keyword_fa, intent.is_faal);
    } else if (intent.tool === "quran") {
      if (onStatus) await onStatus("🕋 در حال دریافت آیات، ترجمه و صوت تلاوت قرآن کریم...");
      const qRes = await fetchQuranOnline(
        intent.quran_surah || 1,
        intent.quran_ayah && intent.quran_ayah > 0 ? intent.quran_ayah : undefined
      );
      liveContext = qRes.context;
      audioUrl = qRes.audioUrl;
      audioTitle = qRes.audioTitle;
      audioPerformer = "مشاری العفاسی";
      if (audioUrl) skipTts = true;
    } else if (intent.tool === "space") {
      if (onStatus) await onStatus("🌌 در حال اتصال به پایگاه فضایی ناسا و ایستگاه فضایی...");
      const sp = await fetchSpaceOnline(intent.query_en || "galaxy nebula", intent.is_iss);
      liveContext = sp.context;
      photoUrl = sp.photoUrl;
    } else if (intent.tool === "chemistry") {
      if (onStatus) await onStatus("🧪 در حال استعلام از آزمایشگاه جهانی شیمی (PubChem)...");
      liveContext = await fetchChemistryOnline(intent.query_en || "", intent.query_fa || question);
    } else if (intent.tool === "earthquake") {
      if (onStatus) await onStatus("🌍 در حال دریافت آخرین داده‌های لرزه‌نگاری جهانی (USGS)...");
      liveContext = await fetchEarthquakeOnline(intent.quake_scope || "iran");
    } else if (intent.tool === "math_plot") {
      if (onStatus) await onStatus("📐 در حال رسم نمودار دقیق تابع روی محور مختصات...");
      const mp = buildMathPlotOnline(
        intent.plot_expr || intent.math_expr || "x^2",
        intent.plot_xmin ?? -10,
        intent.plot_xmax ?? 10
      );
      liveContext = mp.context;
      photoUrl = mp.photoUrl;
    } else if (intent.tool === "image_gen") {
      if (onStatus) await onStatus("🎨 در حال طراحی و ساخت تصویر هوشمند با هوش مصنوعی...");
      const im = await generateImageWithCloudflareAI(env, intent.image_prompt_en || intent.query_en || question);
      liveContext = im.context;
      imageBytes = im.imageBytes;
    } else if (intent.tool === "calendar") {
      if (onStatus) await onStatus("🗓 در حال دریافت تقویم، اوقات شرعی و رویدادهای تاریخی امروز...");
      liveContext = await fetchCalendarAndHistoryOnline(
        intent.city_fa || "تهران",
        intent.city_en || "Tehran",
        Boolean(intent.include_history)
      );
    } else if (intent.tool === "country") {
      if (onStatus) await onStatus("🗺 در حال دریافت شناسنامه جغرافیایی و پرچم کشور...");
      const co = await fetchCountryGeographyOnline(intent.city_fa || intent.query_fa || "", intent.city_en || intent.query_en || "");
      liveContext = co.context;
      photoUrl = co.photoUrl;
    } else if (intent.tool === "museum") {
      if (onStatus) await onStatus("🏛 در حال جستجو در کلکسیون موزه‌های جهانی و تاریخ باستان...");
      const mu = await fetchMuseumOnline(intent.query_en || "Persepolis Achaemenid", intent.query_fa || question);
      liveContext = mu.context;
      photoUrl = mu.photoUrl;
    } else if (intent.tool === "wildlife") {
      if (onStatus) await onStatus("🦁 در حال دریافت تصویر و شناسنامه علمی گونه زیستی...");
      const wl = await fetchWildlifeOnline(intent.query_en || "", intent.query_fa || question);
      liveContext = wl.context;
      photoUrl = wl.photoUrl;
    } else if (intent.tool === "dictionary") {
      if (onStatus) await onStatus("📕 در حال استعلام از دیکشنری تخصصی انگلیسی و دریافت صوت تلفظ...");
      const dc = await fetchEnglishDictionaryOnline(intent.dict_word_en || intent.query_en || question);
      liveContext = dc.context;
      audioUrl = dc.audioUrl;
      audioTitle = dc.audioTitle;
      audioPerformer = dc.audioPerformer;
      if (audioUrl) skipTts = true;
    } else if (intent.tool === "wiki") {
      if (onStatus) await onStatus("🌍 در حال جستجوی آنلاین اطلاعات عمومی در دانشنامه...");
      liveContext = await fetchWikiOnline(intent.query_fa || question, intent.query_en);
    } else if (intent.tool === "math_unit") {
      if (onStatus) await onStatus("🔢 در حال محاسبه دقیق ریاضی و تبدیل واحد...");
      liveContext = await fetchMathUnitOnline(intent.math_expr, intent.from_value, intent.from_unit, intent.to_unit);
    } else if (intent.tool === "translate") {
      if (onStatus) await onStatus("🌐 در حال ترجمه آنلاین متن...");
      liveContext = await fetchTranslationOnline(
        env,
        intent.translate_text || question,
        intent.source_lang || "",
        intent.target_lang || ""
      );
    }
  } catch (e: any) {
    console.error("Online Tool Router Error:", e?.message || e);
  }

  const prompt = liveContext
    ? `You are a warm, knowledgeable, and patient Persian teacher.
Answer the student's question in fluent PERSIAN (Farsi) using the LIVE ONLINE DATA provided below.

Rules:
- Rely strictly on the real numbers, verses, poems, chemical properties, coordinates, prayer times, museum/wildlife/dictionary entries, weather values, headlines, book details, unit conversions, or translations in LIVE ONLINE DATA.
- Format cleanly with relevant emojis and short paragraphs/bullet points suitable for Telegram (plain text, avoid complex Markdown tables).
- If it is Persian poetry (شعر گنجور), quote the poem cleanly and then explain its meaning and message in simple, inspiring Persian.
- If it is Quran (قرآن), include the exact Arabic verse(s) and Persian translation from LIVE ONLINE DATA, plus a brief, warm educational takeaway.
- If it is an English Dictionary lookup (دیکشنری تخصصی انگلیسی), present the exact Persian meanings, IPA pronunciation, part of speech, 2 clear English example sentences with Persian translation, and the Synonyms/Antonyms cleanly.
- If it is a math function plot or unit conversion, explain the mathematical properties step-by-step.
- If an AI image, NASA space photo, museum artifact, wildlife photo, or country flag was attached, briefly describe and teach something fascinating about it!

LIVE ONLINE DATA:
${liveContext}

STUDENT'S QUESTION:
${question}`
    : `You are a helpful and patient teacher. Answer the following question from a student in PERSIAN (Farsi).
If it's a math or science problem, explain step-by-step how to solve it.
Be encouraging and friendly.
Return ONLY the answer text in plain, clean Persian.

STUDENT'S QUESTION:
${question}`;

  try {
    const url = `https://api.groq.com/openai/v1/chat/completions`;
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [
          {
            role: "system",
            content:
              "شما یک معلم دلسوز، دقیق و صبور هستید که فقط به زبان فارسی روان پاسخ می‌دهید و از اطلاعات آنلاین دریافت‌شده برای پاسخ دقیق استفاده می‌کنید.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 2200,
      }),
    }, 15000);

    if (!response.ok) {
      const err = await response.text();
      console.error("Groq API Error:", err);
      return {
        text: liveContext ? `📡 اطلاعات آنلاین دریافت‌شده:\n\n${liveContext}` : `❌ خطا در ارتباط با هوش مصنوعی.`,
        photoUrl,
        imageBytes,
        audioUrl,
        audioTitle,
        audioPerformer,
        skipTts,
      };
    }
    const data = (await response.json()) as any;
    const content = stripThinkTags(data.choices?.[0]?.message?.content || "");
    return {
      text: content || (liveContext ? `📡 اطلاعات آنلاین دریافت‌شده:\n\n${liveContext}` : "❌ پاسخی دریافت نشد."),
      photoUrl,
      imageBytes,
      audioUrl,
      audioTitle,
      audioPerformer,
      skipTts,
    };
  } catch (e: any) {
    console.error("AI Error:", e.message);
    return {
      text: liveContext ? `📡 اطلاعات آنلاین دریافت‌شده:\n\n${liveContext}` : `❌ خطای غیرمنتظره: ${e.message}`,
      photoUrl,
      imageBytes,
      audioUrl,
      audioTitle,
      audioPerformer,
      skipTts,
    };
  }
}

async function sendRichAiAnswer(
  ctx: Context,
  env: Env,
  bot: Bot,
  userId: number,
  questionText: string,
  result: AskAiResult,
  isVoiceInput = false
): Promise<void> {
  // ۱. ارسال تصویر تولیدی هوش مصنوعی یا تصویر آنلاین (نمودار ریاضی / عکس ناسا / پرچم / موزه / حیات‌وحش)
  if (result.imageBytes) {
    try {
      await ctx.replyWithPhoto(new InputFile(result.imageBytes, "ai_image.jpg"), {
        caption: "🎨 تصویر ساخته‌شده با هوش مصنوعی",
      });
    } catch (e) {
      console.error("AI Image send error:", e);
    }
  } else if (result.photoUrl) {
    try {
      await ctx.replyWithPhoto(result.photoUrl);
    } catch {
      try {
        const imgRes = await fetchWithTimeout(result.photoUrl, {}, 8000);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          await ctx.replyWithPhoto(new InputFile(new Uint8Array(buf), "online_photo.png"));
        }
      } catch (e2) {
        console.error("Photo fallback error:", e2);
      }
    }
  }

  // ۲. ارسال پاسخ متنی فارسی
  const finalText = (result.text || "").trim() || "❌ پاسخی دریافت نشد.";
  await ctx.reply(`💬 پاسخ:\n\n${finalText}`.slice(0, 4050));

  // ۳. ارسال صوت تلاوت قرآن / تلفظ دیکشنری (در صورت وجود) یا صدای خوانش پاسخ فارسی (TTS)
  if (result.audioUrl) {
    const perf = result.audioPerformer || "مشاری العفاسی";
    const ttl = result.audioTitle || "فایل صوتی آموزشی";
    try {
      await ctx.replyWithAudio(result.audioUrl, {
        title: ttl,
        performer: perf,
      });
    } catch {
      try {
        const audRes = await fetchWithTimeout(result.audioUrl, {}, 9000);
        if (audRes.ok) {
          const abuf = await audRes.arrayBuffer();
          await ctx.replyWithAudio(new InputFile(new Uint8Array(abuf), "audio.mp3"), {
            title: ttl,
            performer: perf,
          });
        }
      } catch (e2) {
        console.error("Audio fallback error:", e2);
      }
    }
  } else if (!result.skipTts) {
    const voiceBuffer = await textToVoice(finalText, "fa");
    if (voiceBuffer) {
      try {
        await ctx.replyWithVoice(new InputFile(new Uint8Array(voiceBuffer), "response.ogg"));
      } catch (e) {
        console.error("Voice send error:", e);
      }
    }
  }

  // ۴. ارسال گزارش به معلم (فقط زمانی که سوال از طرف دانش‌آموز باشد)
  if (userId !== TEACHER_ID) {
    const stName = (await getStudent(env.telegram_bot_db, userId))?.name || "ناشناس";
    const header = isVoiceInput ? "📥 سوال صوتی از هوش مصنوعی" : "📥 سوال از هوش مصنوعی";
    const qLabel = isVoiceInput ? "📝 متن پیاده‌شده" : "❓ سوال";
    const teacherLog = `${header}\n\n👤 دانش‌آموز: ${stName}\n\n${qLabel}: ${questionText}\n\n💬 پاسخ: ${finalText}`;
    try {
      await bot.api.sendMessage(TEACHER_ID, teacherLog.slice(0, 4000));
    } catch {}
  }

  // ۵. پرسیدن سوال بعدی
  const kb = new InlineKeyboard().text("✅ بله", `ai_continue_yes_${userId}`).text("❌ خیر", `ai_continue_no`);
  await ctx.reply("❓ آیا سوال دیگه‌ای داری؟", { reply_markup: kb });
}

// ==================== تبدیل ویس به متن (Groq Whisper) ====================
async function voiceToText(env: Env, audioBuffer: ArrayBuffer, lang: "fa" | "en" = "fa"): Promise<string> {
  try {
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "voice.ogg");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", lang);

    const url = `https://api.groq.com/openai/v1/audio/transcriptions`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}` },
      body: formData,
    });

    if (!response.ok) { const err = await response.text(); console.error("Whisper API Error:", err); return ""; }
    const data = await response.json() as any;
    return data.text || "";
  } catch (e: any) {
    console.error("Voice Error:", e);
    return "";
  }
}

// ==================== تبدیل متن به ویس (Google Translate TTS - فارسی و انگلیسی) ====================
async function textToVoice(text: string, lang: "fa" | "en" = "fa"): Promise<ArrayBuffer | null> {
  try {
    // پاکسازی لینک‌ها و کاراکترهای اضافه برای خوانش طبیعی صوتی (حداکثر ۲۰۰ کاراکتر)
    const cleanText = text
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[*_`#~|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const limitedText = cleanText.substring(0, 200);
    if (!limitedText) return null;
    const encodedText = encodeURIComponent(limitedText);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.arrayBuffer();
  } catch (e: any) {
    console.error("TTS Error:", e);
    return null;
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ==================== تحلیل عکس تکلیف با Cloudflare AI (Vision) ====================
async function analyzeHomeworkImage(env: Env, imageBuffer: ArrayBuffer): Promise<string> {
  try {
    const base64Image = uint8ToBase64(new Uint8Array(imageBuffer));

    const prompt = `You are a strict but kind teacher. Look at this homework image from a student.
Check if the answers are correct.
If there are mistakes, explain them step-by-step in PERSIAN (Farsi).
If everything is correct, praise the student.
Return ONLY the text response in Persian.`;

    const response = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ]
        }
      ],
      max_tokens: 1000,
    });

    return (response as any).response || "❌ متأسفانه نتونستم عکس رو تحلیل کنم.";
  } catch (e: any) {
    console.error("Vision Error:", e);
    return `❌ خطا در تحلیل عکس: ${e.message}`;
  }
}

// ==================== موتور هوشمند استخراج متن فارسی از PDF / اسکن / عکس و ساخت کوییز ====================
const PNG_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function pngCrc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, pngCrc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

async function rawPdfImageToPngBase64(img: { width: number; height: number; channels: number; data: Uint8ClampedArray | Uint8Array }): Promise<string> {
  const { width, height, channels, data } = img;
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 1200));
  const outW = Math.floor(width / step);
  const outH = Math.floor(height / step);

  const rowStride = 1 + outW * channels;
  const rawScanlines = new Uint8Array(outH * rowStride);
  for (let y = 0; y < outH; y++) {
    const rowOffset = y * rowStride;
    rawScanlines[rowOffset] = 0;
    const srcY = y * step;
    for (let x = 0; x < outW; x++) {
      const srcIdx = (srcY * width + x * step) * channels;
      const dstIdx = rowOffset + 1 + x * channels;
      for (let c = 0; c < channels; c++) rawScanlines[dstIdx + c] = data[srcIdx + c];
    }
  }

  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(rawScanlines);
  writer.close();
  const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, outW, false);
  dv.setUint32(4, outH, false);
  ihdr[8] = 8;
  ihdr[9] = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const cIHDR = buildPngChunk("IHDR", ihdr);
  const cIDAT = buildPngChunk("IDAT", compressed);
  const cIEND = buildPngChunk("IEND", new Uint8Array(0));

  const png = new Uint8Array(sig.length + cIHDR.length + cIDAT.length + cIEND.length);
  let off = 0;
  for (const part of [sig, cIHDR, cIDAT, cIEND]) {
    png.set(part, off);
    off += part.length;
  }
  return uint8ToBase64(png);
}

function isVisuallyReversedRtlToken(s: string): boolean {
  const chars = [...s].filter((ch) => /[\uFB50-\uFDFF\uFE70-\uFEFF\u0600-\u06FF]/.test(ch));
  if (chars.length < 2) return false;
  const hasPres = chars.some((c) => {
    const cp = c.codePointAt(0) || 0;
    return (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff);
  });
  if (!hasPres) return false;

  const initialSet = new Set([
    0xfe91, 0xfb58, 0xfe97, 0xfe9b, 0xfe9f, 0xfb7c, 0xfea3, 0xfea7, 0xfeb3, 0xfeb7, 0xfebb, 0xfebf,
    0xfec3, 0xfec7, 0xfecb, 0xfecf, 0xfed3, 0xfed7, 0xfb90, 0xfb94, 0xfedf, 0xfee3, 0xfee7, 0xfeeb, 0xfef3, 0xfbfe,
  ]);
  const finalSet = new Set([
    0xfe8e, 0xfe90, 0xfb57, 0xfe96, 0xfe9a, 0xfe9e, 0xfb7b, 0xfea2, 0xfea6, 0xfeaa, 0xfeac, 0xfeae, 0xfeb0, 0xfb8b,
    0xfeb2, 0xfeb6, 0xfeba, 0xfebe, 0xfec2, 0xfec6, 0xfeca, 0xfece, 0xfed2, 0xfed6, 0xfb8f, 0xfb93, 0xfede, 0xfee2,
    0xfee6, 0xfeea, 0xfe94, 0xfef0, 0xfef2, 0xfbfd, 0xfbfc,
  ]);
  const firstCp = chars[0].codePointAt(0) || 0;
  const lastCp = chars[chars.length - 1].codePointAt(0) || 0;
  return finalSet.has(firstCp) || initialSet.has(lastCp);
}

function normalizeExtractedPersian(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200B/g, "");
}

function reconstructPdfPageText(items: any[]): string {
  const raw = items
    .filter((it) => it && typeof it.str === "string" && it.str.length > 0 && Array.isArray(it.transform))
    .map((it) => ({
      str: it.str as string,
      x: Number(it.transform[4]) || 0,
      y: Number(it.transform[5]) || 0,
      w: Number(it.width) || 0,
      h: Math.hypot(Number(it.transform[2]) || 0, Number(it.transform[3]) || 0) || 10,
      dir: String(it.dir || ""),
    }));

  if (raw.length === 0) return "";
  raw.sort((a, b) => b.y - a.y);

  const lines: { y: number; items: typeof raw }[] = [];
  for (const item of raw) {
    const tol = Math.max(3, item.h * 0.45);
    let line = lines.find((l) => Math.abs(l.y - item.y) <= tol);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  lines.sort((a, b) => b.y - a.y);

  const outLines: string[] = [];
  for (const line of lines) {
    const lineHasRtl = line.items.some(
      (it) => it.dir === "rtl" || /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(it.str)
    );

    if (!lineHasRtl) {
      line.items.sort((a, b) => a.x - b.x);
      let s = "";
      let prevRight: number | null = null;
      for (const it of line.items) {
        if (prevRight !== null && it.x - prevRight > Math.max(2, it.h * 0.22) && !s.endsWith(" ") && !it.str.startsWith(" ")) {
          s += " ";
        }
        s += it.str;
        prevRight = it.x + it.w;
      }
      outLines.push(normalizeExtractedPersian(s).trim());
    } else {
      line.items.sort((a, b) => b.x + b.w - (a.x + a.w) || b.x - a.x);

      const tokens: { text: string; left: number; right: number; h: number }[] = [];
      let ltrRun: typeof raw = [];
      const flushLtr = () => {
        if (ltrRun.length > 0) {
          ltrRun.sort((a, b) => a.x - b.x);
          tokens.push({
            text: ltrRun.map((x) => x.str).join(""),
            left: ltrRun[0].x,
            right: ltrRun[ltrRun.length - 1].x + ltrRun[ltrRun.length - 1].w,
            h: ltrRun[0].h,
          });
          ltrRun = [];
        }
      };

      for (const it of line.items) {
        const isPureLtrChar = /^[A-Za-z0-9۰-۹٠-٩.,٫٬:/+\-%=()]+$/.test(it.str);
        if (isPureLtrChar) {
          ltrRun.push(it);
        } else {
          flushLtr();
          let txt = it.str;
          if ([...txt].length > 1 && isVisuallyReversedRtlToken(txt)) {
            txt = [...txt].reverse().join("");
          }
          tokens.push({ text: txt, left: it.x, right: it.x + it.w, h: it.h });
        }
      }
      flushLtr();

      let s = "";
      let prevLeft: number | null = null;
      for (const tok of tokens) {
        if (prevLeft !== null) {
          const gap = prevLeft - tok.right;
          if (gap > Math.max(2.2, tok.h * 0.22) && !s.endsWith(" ") && !tok.text.startsWith(" ")) {
            s += " ";
          }
        }
        s += tok.text;
        prevLeft = tok.left;
      }
      outLines.push(normalizeExtractedPersian(s).replace(/\s+/g, " ").trim());
    }
  }

  return outLines.filter(Boolean).join("\n");
}

function parsePageRangeFromCaption(caption: string, totalPages: number): number[] | null {
  if (!caption || !caption.trim()) return null;
  const norm = normalizeDigits(caption).trim();
  const rangeMatch = norm.match(/(\d+)\s*(?:-+|تا|الی|to)\s*(\d+)/i);
  if (rangeMatch) {
    const start = Math.max(1, Math.min(totalPages, parseInt(rangeMatch[1], 10)));
    const end = Math.max(start, Math.min(totalPages, parseInt(rangeMatch[2], 10)));
    const pages: number[] = [];
    for (let p = start; p <= end && pages.length < 15; p++) pages.push(p);
    return pages.length > 0 ? pages : null;
  }
  const nums = norm.match(/\d+/g);
  if (nums && nums.length > 0) {
    const pages = nums
      .map((n) => parseInt(n, 10))
      .filter((p) => p >= 1 && p <= totalPages)
      .slice(0, 15);
    return pages.length > 0 ? Array.from(new Set(pages)) : null;
  }
  return null;
}

function isReadableLessonText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 60) return false;
  const validLetters = (trimmed.match(/[\u0600-\u06FFa-zA-Z]/g) || []).length;
  const persianLetters = (trimmed.match(/[\u0600-\u06FF]/g) || []).length;
  const weirdMojibake = (trimmed.match(/[\u00A0-\u00FF\uE000-\uF8FF]/g) || []).length;
  if (validLetters < 45) return false;
  if (weirdMojibake > validLetters * 0.4 && persianLetters < 30) return false;
  return validLetters / trimmed.length > 0.35;
}

function isBoilerplateTextbookPage(text: string): boolean {
  const dots = (text.match(/\.{4,}/g) || []).length;
  if (dots >= 4) return true; // فهرست مطالب پر از نقطه‌چین
  if (/(کلیه حقوق مادی و معنوی|دفتر تألیف کتاب|چاپ و توزیع کتاب|شابک|ISBN)/i.test(text) && text.length < 1200) {
    return true;
  }
  return false;
}

async function extractTextFromImagesWithVision(env: Env, dataUrls: string[]): Promise<string> {
  if (dataUrls.length === 0) return "";
  const content: any[] = [
    {
      type: "text",
      text:
        "این تصویر(ها) صفحات یک کتاب درسی یا جزوه آموزشی به زبان فارسی است. " +
        "تمام متن درسی، تعاریف، فرمول‌ها و نکات آموزشی موجود در تصویر را با دقت بالا و کاملاً به زبان فارسی بازنویسی و استخراج کن. " +
        "فقط متن خالص درس را برگردان و توضیح اضافه‌ای از خودت ننویس.",
    },
    ...dataUrls.slice(0, 3).map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "user", content }],
        temperature: 0.1,
        max_tokens: 3500,
      }),
    },
    25000
  );

  if (!res.ok) {
    console.error("Vision OCR Error:", await res.text());
    return "";
  }
  const data = (await res.json()) as any;
  return stripThinkTags(data.choices?.[0]?.message?.content || "").trim();
}

async function extractLessonFromPdf(
  env: Env,
  pdfBuffer: ArrayBuffer,
  captionHint: string = "",
  onProgress?: (msg: string) => Promise<void>
): Promise<{ ok: boolean; text: string; info: string }> {
  try {
    const { getDocumentProxy, extractImages } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const totalPages = pdf.numPages;

    const explicitPages = parsePageRangeFromCaption(captionHint, totalPages);
    const candidatePages: number[] = explicitPages
      ? explicitPages
      : Array.from({ length: Math.min(totalPages, 25) }, (_, i) => i + 1);

    if (onProgress) {
      await onProgress(`📖 فایل PDF باز شد (${totalPages} صفحه). در حال استخراج متن فارسی...`);
    }

    const collectedPages: { page: number; text: string }[] = [];
    let totalChars = 0;

    for (const pNum of candidatePages) {
      const page = await pdf.getPage(pNum);
      const tc = await page.getTextContent();
      const pageText = reconstructPdfPageText(tc.items);

      if (!explicitPages && totalPages > 3 && isBoilerplateTextbookPage(pageText)) {
        continue;
      }
      if (pageText.trim().length >= 30) {
        collectedPages.push({ page: pNum, text: pageText });
        totalChars += pageText.length;
      }
      if (!explicitPages && (collectedPages.length >= 12 || totalChars >= 22000)) {
        break;
      }
    }

    const mergedText = collectedPages.map((p) => `[صفحه ${p.page}]\n${p.text}`).join("\n\n");

    if (isReadableLessonText(mergedText)) {
      const usedPagesLabel =
        collectedPages.length === 1
          ? `صفحه ${collectedPages[0].page}`
          : `صفحات ${collectedPages[0].page} تا ${collectedPages[collectedPages.length - 1].page}`;
      return {
        ok: true,
        text: mergedText.slice(0, 24000),
        info: `فایل PDF (${usedPagesLabel} از ${totalPages} صفحه)`,
      };
    }

    // اگر PDF اسکن‌شده یا با فونت قدیمی غیریونیکد بود -> استخراج تصویر صفحات و OCR بینایی رایگان
    if (onProgress) {
      await onProgress("🔍 این PDF اسکن‌شده یا تصویری است؛ در حال خواندن صفحات با هوش مصنوعی بینایی (OCR)...");
    }

    const ocrTargetPages = (explicitPages || [1, 2, 3]).filter((p) => p >= 1 && p <= totalPages).slice(0, 3);
    const imageUrls: string[] = [];

    for (const pNum of ocrTargetPages) {
      try {
        const imgs = await extractImages(pdf, pNum);
        const bigImgs = imgs
          .filter((im: any) => im.width >= 150 && im.height >= 150)
          .sort((a: any, b: any) => b.width * b.height - a.width * a.height);
        if (bigImgs.length > 0) {
          const b64 = await rawPdfImageToPngBase64(bigImgs[0]);
          imageUrls.push(`data:image/png;base64,${b64}`);
        }
      } catch (e) {
        console.error("PDF Image extract error on page", pNum, e);
      }
    }

    if (imageUrls.length > 0) {
      const ocrText = await extractTextFromImagesWithVision(env, imageUrls);
      if (ocrText.length >= 40) {
        return {
          ok: true,
          text: ocrText.slice(0, 24000),
          info: `فایل PDF اسکن‌شده (خوانده‌شده با OCR بینایی — ${imageUrls.length} صفحه)`,
        };
      }
    }

    return {
      ok: false,
      text: "",
      info: "❌ متن قابل خواندنی در این فایل PDF پیدا نشد (احتمالاً فایل رمزگذاری‌شده یا اسکن خاص است). لطفاً از صفحه مورد نظر اسکرین‌شات/عکس بگیرید و همین‌جا بفرستید تا با دوربین هوش مصنوعی خوانده شود!",
    };
  } catch (e: any) {
    console.error("PDF Parse Error:", e);
    return {
      ok: false,
      text: "",
      info: `❌ خطا در باز کردن فایل PDF: ${e.message}`,
    };
  }
}

function shuffleQuizOptions(q: { question: string; options: string[]; correct: number }) {
  const cleanOptions = q.options.map((o) => String(o).trim());
  const safeCorrectIdx = Math.min(Math.max(Math.round(q.correct), 1), 4) - 1;
  const rightAnswerText = cleanOptions[safeCorrectIdx];

  const shuffled = [...cleanOptions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const newCorrect = shuffled.indexOf(rightAnswerText) + 1;
  return {
    question: String(q.question).trim(),
    options: shuffled,
    correct: newCorrect >= 1 && newCorrect <= 4 ? newCorrect : 1,
  };
}

async function generateQuizzesFromSourceText(
  env: Env,
  sourceText: string,
  count: number
): Promise<{ question: string; options: string[]; correct: number }[] | string> {
  const trimmedSource = sourceText.slice(0, 22000).trim();
  const prompt = `شما یک طراح سوال استاندارد آموزشی هستید.
بر اساس و **فقط و منحصراً** از روی «متن درس» زیر، دقیقاً ${count} سوال چهارگزینه‌ای آموزشی به زبان فارسی روان و سلیس طراحی کنید.

قوانین بسیار مهم (حتمی):
1. تمام سوالات و پاسخ صحیح آن‌ها باید ۱۰۰٪ مستقیماً در متن درس زیر وجود داشته باشد. به هیچ عنوان از اطلاعات خارج از متن سوال نپرسید و مطلبی از خودتان اضافه نکنید.
2. از پرسیدن سوالات بی‌اهمیت مثل شماره صفحه، نام ناشر، نویسنده کتاب یا عنوان کلی فصل خودداری کنید؛ فقط از مفاهیم علمی، تعاریف، نکات و مطالب آموزشیِ خودِ درس سوال طرح کنید.
3. هر سوال باید دقیقاً ۴ گزینه منطقی و واضح به زبان فارسی داشته باشد که فقط یکی از آن‌ها درست است.
4. فیلد "correct" باید عدد گزینه درست بین 1 تا 4 باشد.
5. خروجی باید **فقط و فقط یک آرایه JSON معتبر** با ساختار زیر باشد و هیچ متن اضافه‌ای قبل یا بعد آن ننویسید:

[
  {
    "question": "صورت سوال به فارسی؟",
    "options": ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم"],
    "correct": 1
  }
]

<lesson_text>
${trimmedSource}
</lesson_text>`;

  try {
    const res = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages: [
            {
              role: "system",
              content:
                "شما یک معلم خبره ایرانی هستید که فقط از روی متن ارائه‌شده سوال چهارگزینه‌ای دقیق طراحی می‌کنید و خروجی را منحصراً به صورت JSON Array برمی‌گردانید.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 4500,
        }),
      },
      25000
    );

    if (!res.ok) {
      console.error("Source Quiz API Error:", await res.text());
      return "❌ خطا در ارتباط با هوش مصنوعی هنگام طراحی سوال.";
    }

    const data = (await res.json()) as any;
    const raw = stripThinkTags(data.choices?.[0]?.message?.content || "");
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (!objMatch) return "❌ خطا: قالب خروجی هوش مصنوعی معتبر نبود. لطفاً دوباره امتحان کنید.";
      const single = JSON.parse(objMatch[0]);
      if (single.question && Array.isArray(single.options) && single.options.length === 4) {
        return [shuffleQuizOptions(single)];
      }
      return "❌ خطا: سوال معتبری تولید نشد.";
    }

    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed)) return "❌ خطا: ساختار سوالات نامعتبر بود.";

    const valid = parsed
      .filter(
        (q: any) =>
          q &&
          typeof q.question === "string" &&
          q.question.trim().length > 4 &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correct === "number"
      )
      .slice(0, count)
      .map((q: any) => shuffleQuizOptions(q));

    if (valid.length === 0) return "❌ هیچ سوال معتبری از متن استخراج نشد.";
    return valid;
  } catch (e: any) {
    console.error("Source Quiz Exception:", e);
    return `❌ خطا در طراحی سوال از متن: ${e.message}`;
  }
}

function buildSourceQuizCountKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("1 سوال (5 امتیاز)", "srcq_1_5")
    .text("3 سوال (5 امتیاز)", "srcq_3_5")
    .text("5 سوال (5 امتیاز)", "srcq_5_5")
    .row()
    .text("5 سوال (10 امتیاز)", "srcq_5_10")
    .text("10 سوال (5 امتیاز)", "srcq_10_5")
    .row()
    .text("✏️ تعداد و امتیاز دلخواه", "srcq_custom")
    .text("❌ انصراف", "srcq_cancel");
}

async function createAndPreviewSourceQuizzes(
  ctx: any,
  env: Env,
  bot: Bot,
  sourceText: string,
  sourceInfo: string,
  count: number,
  points: number
) {
  const waitMsg = await ctx.reply(`🤖 در حال طراحی ${count} سوال دقیق و استاندارد از «${sourceInfo}»...\n⏳ لطفاً چند ثانیه صبر کنید.`);
  const quizzes = await generateQuizzesFromSourceText(env, sourceText, count);
  try {
    if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
  } catch {}

  if (typeof quizzes === "string") {
    await ctx.reply(quizzes);
    return;
  }

  const quizIds: number[] = [];
  for (const q of quizzes) {
    const id = await addQuiz(env.telegram_bot_db, q.question, q.options, q.correct, points);
    quizIds.push(id);
  }

  let preview = `📄 ${quizzes.length} سوال طراحی‌شده از: ${sourceInfo}\n💰 امتیاز هر سوال: ${points}\n\n`;
  quizzes.forEach((q, idx) => {
    preview += `📝 سوال ${idx + 1}: ${q.question}\n`;
    q.options.forEach((opt, j) => {
      preview += `${j === q.correct - 1 ? "✅" : "⚪"} ${j + 1}. ${opt}\n`;
    });
    preview += `\n`;
  });

  if (preview.length > 3950) {
    preview = preview.slice(0, 3950) + "\n...(ادامه سوالات ثبت شد)";
  }

  const kb =
    quizIds.length === 1
      ? new InlineKeyboard()
          .text("✅ تایید و ارسال به کلاس", `approve_ai_${quizIds[0]}`)
          .row()
          .text("❌ لغو", `reject_ai_${quizIds[0]}`)
      : new InlineKeyboard()
          .text(`✅ تایید و ارسال همه ${quizIds.length} سوال`, `approve_multi_${quizIds.join(",")}`)
          .row()
          .text("❌ لغو همه", `reject_multi_${quizIds.join(",")}`);

  await ctx.reply(preview, { reply_markup: kb });
}

// ==================== موتور هوش مصنوعی امکانات جامع (جزوه‌ساز، امتحان‌ساز، لایتنر، انشا، مکالمه، کارنامه، دوئل، حضوروغیاب) ====================
async function callGroqText(
  env: Env,
  systemContent: string,
  userContent: string,
  maxTokens = 2600,
  temperature = 0.4
): Promise<string> {
  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    },
    22000
  );
  if (!res.ok) throw new Error("خطا در ارتباط با سرور هوش مصنوعی");
  const data = (await res.json()) as any;
  return stripThinkTags(data.choices?.[0]?.message?.content || "");
}

// ۱. جزوه‌ساز هوشمند شب امتحان
async function generateLessonSummaryWithAI(env: Env, sourceText: string, sourceInfo: string): Promise<string> {
  const prompt = `بر اساس متن یا موضوع درسی زیر (${sourceInfo})، یک «جزوه خلاصه، استاندارد و فوق‌العاده مرتب شب امتحان» به زبان فارسی روان بنویس.
ساختار جزوه حتماً شامل این بخش‌ها باشد (متن ساده و تمیز تلگرامی با ایموجی، بدون جدول پیچیده):
📚 عنوان درس / مبحث
📌 ۱. مفاهیم و تعاریف کلیدی (بولت‌پوینت دقیق)
💡 ۲. نکات طلایی و امتحانی (فرمول‌ها، دسته‌بندی‌ها یا نکات مهم)
❓ ۳. سه نمونه سوال مهم امتحانی همراه با پاسخ کوتاه

متن/موضوع منبع:
"""
${sourceText.slice(0, 18000)}
"""`;
  return await callGroqText(
    env,
    "شما یک دبیر باتجربه ایرانی هستید که بهترین و خلاصه‌ترین جزوه‌های امتحانی را فقط به زبان فارسی روان طراحی می‌کنید.",
    prompt,
    2600,
    0.35
  );
}

// ۲. طراح برگه امتحانی تشریحی ۲۰ نمره‌ای + کلید پاسخنامه جداگانه
async function generateDescriptiveExamWithAI(
  env: Env,
  sourceText: string,
  sourceInfo: string
): Promise<{ examSheet: string; answerKey: string }> {
  const prompt = `بر اساس محتوای درسی زیر (${sourceInfo})، یک «برگه امتحانی استاندارد ۲۰ نمره‌ای مدرسه» به زبان فارسی طراحی کن.
حتماً خروجی را دقیقاً در دو بخش مجزا با جداکننده دقیق ===ANSWER_KEY=== تولید کن:

در بخش اول (فقط سوالات بدون جواب، مناسب چاپ یا ارسال به دانش‌آموز):
📄 آزمون کلاسی (بارم کل: ۲۰ نمره)
• بخش اول — عبارات صحیح یا غلط (۲ نمره - ۴ مورد هرکدام ۰/۵ نمره)
• بخش دوم — کامل کردن جاهای خالی (۳ نمره - ۳ مورد هرکدام ۱ نمره)
• بخش سوم — سوالات کوتاه‌پاسخ (۵ نمره - ۵ سوال هرکدام ۱ نمره)
• بخش چهارم — سوالات تشریحی و مفهومی (۱۰ نمره - ۴ سوال هرکدام ۲/۵ نمره)

سپس دقیقاً عبارت ===ANSWER_KEY=== را در یک خط جداگانه بگذار و در بخش دوم:
🔑 پاسخنامه تشریحی و راهنمای تصحیح (ویژه معلم) شامل پاسخ دقیق تک‌تک بخش‌ها را بنویس.

متن/موضوع منبع:
"""
${sourceText.slice(0, 18000)}
"""`;

  const full = await callGroqText(
    env,
    "شما طراح رسمی سوالات امتحانی مدارس ایران هستید. دقیقاً جمع بارم ۲۰ نمره را رعایت کنید و بین برگه سوال و پاسخنامه علامت ===ANSWER_KEY=== قرار دهید.",
    prompt,
    3400,
    0.35
  );
  const parts = full.split(/===+\s*ANSWER_KEY\s*===+/i);
  if (parts.length >= 2) {
    return { examSheet: parts[0].trim(), answerKey: parts.slice(1).join("\n").trim() };
  }
  return { examSheet: full.trim(), answerKey: "پاسخنامه در انتهای برگه درج شده است." };
}

// ۳. تولید خودکار فلش‌کارت‌های جعبه لایتنر با هوش مصنوعی
async function generateFlashcardsWithAI(
  env: Env,
  topicOrText: string
): Promise<{ front: string; back: string }[]> {
  const prompt = `بر اساس موضوع یا متن درسی زیر، دقیقاً ۵ فلش‌کارت آموزشی (مناسب جعبه لایتنر دانش‌آموز) طراحی کن.
اگر موضوع درباره زبان انگلیسی است، روی کارت (front) لغت/عبارت انگلیسی و پشت کارت (back) معنی فارسی + یک مثال کوتاه باشد.
اگر موضوع درسی دیگر (علوم، ریاضی، ادبیات، تاریخ و...) است، روی کارت یک پرسش/اصطلاح کوتاه و پشت کارت پاسخ دقیق و خلاصه باشد.

فقط و فقط یک آرایه JSON معتبر برگردان:
[
  { "front": "متن روی کارت (سوال یا لغت)", "back": "متن پشت کارت (پاسخ یا معنی و مثال)" }
]

موضوع یا متن:
${topicOrText.slice(0, 6000)}`;

  const raw = await callGroqText(
    env,
    "Output ONLY a valid JSON array of 5 objects with 'front' and 'back' string fields.",
    prompt,
    1500,
    0.4
  );
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x: any) => x && typeof x.front === "string" && typeof x.back === "string")
      .slice(0, 6);
  } catch {
    return [];
  }
}

// ۴. تصحیح هوشمند انشا و نگارش فارسی
async function evaluatePersianEssayWithAI(env: Env, essayText: string): Promise<string> {
  const prompt = `شما دبیر ادبیات و نگارش فارسی هستید. انشای دانش‌آموز زیر را با دقت، محبت و حوصله بررسی و تصحیح کنید:

ساختار بازخورد به فارسی روان:
🌟 ۱. نقاط قوت و زیبایی‌های نوشته
🔍 ۲. اصلاح غلط‌های املایی، دستوری و علائم نگارشی (موردبه‌مورد اگر وجود دارد)
✨ ۳. پیشنهاد واژگان، تشبیه‌ها یا ضرب‌المثل‌های زیباتر برای غنی‌تر شدن متن
✍️ ۴. بازنویسی پیشنهادی یک بخش کوتاه از انشا به قلم ادبی‌تر
📊 ۵. نمره پیشنهادی از ۲۰ نمره + پیام تشویقی

متن انشای دانش‌آموز:
"""
${essayText.slice(0, 8000)}
"""`;
  return await callGroqText(
    env,
    "شما یک معلم مهربان و ادیب ادبیات فارسی هستید که انشای دانش‌آموزان را دقیق، سازنده و انگیزه‌بخش تصحیح می‌کنید.",
    prompt,
    2200,
    0.45
  );
}

// ۵. مربی تمرین مکالمه زبان انگلیسی (ویس‌به‌ویس و متنی)
async function runEnglishConversationTurn(
  env: Env,
  userUtterance: string
): Promise<{ correctionFa: string; englishReply: string; persianMeaning: string }> {
  const prompt = `You are a friendly English speaking tutor for an Iranian student.
The student just said (in English or Finglish/Persian):
"${userUtterance}"

Respond ONLY in valid JSON with these exact 3 fields:
{
  "correction_fa": "در یک یا دو جمله کوتاه فارسی، اگر جمله دانش‌آموز اشتباه گرامری یا واژگانی داشت شکل درست انگلیسی‌اش را مهربانانه بگو؛ و اگر کاملاً درست بود به فارسی تشویقش کن",
  "english_reply": "A natural, clear, friendly 1-3 sentence English response that continues the conversation and ends with a simple engaging follow-up question in English (under 180 characters so TTS reads it smoothly)",
  "persian_meaning": "ترجمه فارسی روان پاسخ انگلیسی بالا"
}`;

  const raw = await callGroqText(
    env,
    "Output ONLY raw valid JSON with keys correction_fa, english_reply, persian_meaning.",
    prompt,
    900,
    0.5
  );
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const p = JSON.parse(m[0]);
      return {
        correctionFa: p.correction_fa || "آفرین! تلفظ و جمله‌بندی خوبی داشتی.",
        englishReply: p.english_reply || "That sounds wonderful! Could you tell me a little more about your favorite hobby?",
        persianMeaning: p.persianMeaning || p.persian_meaning || "عالی به نظر می‌رسه! می‌تونی کمی بیشتر درباره سرگرمی مورد علاقه‌ت بگی؟",
      };
    } catch {}
  }
  return {
    correctionFa: "آفرین، ادامه بده!",
    englishReply: "Great job practicing English today! What did you learn at school today?",
    persianMeaning: "آفرین که امروز انگلیسی تمرین می‌کنی! امروز در مدرسه چه چیزی یاد گرفتی؟",
  };
}

// ۶. کارنامه هوشمند هفتگی ویژه والدین
async function buildSmartParentReportCard(db: D1Database, student: Student): Promise<string> {
  await ensureExtraTables(db);
  const all = await getAllStudents(db);
  const rank = all.findIndex((s) => s.user_id === student.user_id) + 1;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekDatePrefix = weekAgo.split("T")[0];

  const [hwWeekRes, quizRes, studyMin, attRes] = await Promise.all([
    db.prepare("SELECT * FROM homework WHERE user_id = ? AND date >= ?").bind(student.user_id, weekAgo).all<Homework>(),
    db
      .prepare(
        "SELECT COUNT(*) as total, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as ok FROM quiz_answers WHERE user_id = ? AND date >= ?"
      )
      .bind(student.user_id, weekAgo)
      .first<{ total: number; ok: number }>(),
    getStudentWeeklyStudyMinutes(db, student.user_id),
    db
      .prepare(
        "SELECT status, COUNT(*) as c FROM attendance WHERE user_id = ? AND date >= ? GROUP BY status"
      )
      .bind(student.user_id, weekDatePrefix)
      .all<{ status: string; c: number }>(),
  ]);

  const hwList = hwWeekRes.results || [];
  const graded = hwList.filter((h) => h.score > 0);
  const avgHw = graded.length > 0 ? (graded.reduce((a, b) => a + b.score, 0) / graded.length).toFixed(1) : "ثبت‌نشده";
  const qTotal = quizRes?.total || 0;
  const qOk = quizRes?.ok || 0;
  const qPct = qTotal > 0 ? `${Math.round((qOk / qTotal) * 100)}% (${qOk} از ${qTotal})` : "شرکت نکرده";

  const attCounts: Record<string, number> = { present: 0, absent: 0, late: 0 };
  (attRes.results || []).forEach((r) => { attCounts[r.status] = r.c; });

  return (
    `📬 کارنامه عملکرد هفتگی دانش‌آموز\n` +
    `📅 تاریخ گزارش: ${toJalali(new Date().toISOString())}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 نام دانش‌آموز: ${student.name}${student.grade ? ` (پایه ${student.grade})` : ""}\n` +
    `🌟 امتیاز کل: ${student.score} امتیاز | سطح: ${getLevelInfo(student.level || 1).name}\n` +
    `🏆 رتبه فعلی در کلاس: ${rank} از ${all.length} نفر\n` +
    `🔥 پیوستگی فعالیت (استریک): ${student.streak || 0} روز\n\n` +
    `📊 عملکرد ۷ روز گذشته:\n` +
    `• 📝 تکالیف ارسالی هفته: ${hwList.length} مورد (میانگین نمره: ${avgHw})\n` +
    `• 🎯 دقت در کوییزهای کلاسی: ${qPct}\n` +
    `• ⏱ زمان مطالعه ثبت‌شده در تایمر: ${studyMin} دقیقه\n` +
    `• ✅ وضعیت حضوروغیاب هفته: ${attCounts.present} حاضر | ${attCounts.late} تاخیر | ${attCounts.absent} غیبت\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💐 با سپاس از همراهی صمیمانه اولیای گرامی\n` +
    `👨‍🏫 معلم کلاس: ${TEACHER_NAME}`
  );
}

// ۷. پنل شیشه‌ای حضور و غیاب تک‌کلیکی
async function buildAttendancePanel(
  db: D1Database,
  dateStr: string
): Promise<{ text: string; kb: InlineKeyboard }> {
  const students = await getAllStudents(db);
  const attMap = await getAttendanceByDate(db, dateStr);
  const kb = new InlineKeyboard();

  let presentCnt = 0;
  let absentCnt = 0;
  let lateCnt = 0;

  students.forEach((s, idx) => {
    const st = attMap[s.user_id] || "present";
    if (st === "present") presentCnt++;
    else if (st === "absent") absentCnt++;
    else lateCnt++;

    const icon = st === "present" ? "✅" : st === "absent" ? "❌" : "⏰";
    const label = st === "present" ? "حاضر" : st === "absent" ? "غایب" : "تاخیر";
    kb.text(`${icon} ${s.name} (${label})`, `att_t_${s.user_id}_${dateStr}`);
    if (idx % 2 === 1) kb.row();
  });
  if (students.length % 2 === 1) kb.row();

  kb.text("✔️ ثبت همه حاضر", `att_all_${dateStr}`)
    .row()
    .text("📨 پیام به والدین غایبین/تاخیری‌ها", `att_notify_${dateStr}`)
    .row()
    .text("🔙 بازگشت به ابزارهای معلم", "thub_main");

  const text =
    `✅ *پنل حضور و غیاب تک‌کلیکی کلاس*\n` +
    `📅 تاریخ: ${toJalali(dateStr + "T12:00:00Z")}\n\n` +
    `📊 آمار لحظه‌ای: ✅ حاضر: ${presentCnt} | ❌ غایب: ${absentCnt} | ⏰ تاخیر: ${lateCnt}\n\n` +
    `💡 با هر ضربه روی نام دانش‌آموز، وضعیت بین «✅ حاضر ← ❌ غایب ← ⏰ تاخیر» تغییر می‌کند:`;

  return { text, kb };
}

// ۸. موتور دوئل علمی دو نفره هم‌زمان
async function sendDuelQuestionToPlayer(bot: Bot, db: D1Database, duelId: number, userId: number) {
  const duel = await getDuelById(db, duelId);
  if (!duel || duel.status === "finished") return;

  const isChallenger = userId === duel.challenger_id;
  const step = isChallenger ? duel.c_step : duel.o_step;
  const questions = JSON.parse(duel.questions_json) as { question: string; options: string[]; correct: number }[];

  if (step >= questions.length) return;
  const q = questions[step];
  const nowMs = Date.now();

  if (isChallenger) {
    await db.prepare("UPDATE duels SET c_q_start = ? WHERE id = ?").bind(nowMs, duelId).run();
  } else {
    await db.prepare("UPDATE duels SET o_q_start = ? WHERE id = ?").bind(nowMs, duelId).run();
  }

  const kb = new InlineKeyboard()
    .text(`1️⃣ ${q.options[0]}`, `duel_ans_${duelId}_${step}_1`).row()
    .text(`2️⃣ ${q.options[1]}`, `duel_ans_${duelId}_${step}_2`).row()
    .text(`3️⃣ ${q.options[2]}`, `duel_ans_${duelId}_${step}_3`).row()
    .text(`4️⃣ ${q.options[3]}`, `duel_ans_${duelId}_${step}_4`);

  await bot.api.sendMessage(
    userId,
    `⚔️ دوئل علمی «${duel.topic}» — سوال ${step + 1} از ${questions.length}\n` +
    `⏱ سرعت پاسخگویی هم محاسبه می‌شود!\n\n` +
    `❓ ${q.question}`,
    { reply_markup: kb }
  );
}

async function checkAndFinishDuel(bot: Bot, db: D1Database, duelId: number) {
  const duel = await getDuelById(db, duelId);
  if (!duel || duel.status === "finished") return;
  const questions = JSON.parse(duel.questions_json) as any[];
  if (duel.c_step < questions.length || duel.o_step < questions.length) return;

  await db.prepare("UPDATE duels SET status = 'finished' WHERE id = ?").bind(duelId).run();

  let winnerId = 0;
  let loserId = 0;
  let winnerName = "";
  if (duel.c_correct > duel.o_correct) {
    winnerId = duel.challenger_id; loserId = duel.opponent_id; winnerName = duel.challenger_name;
  } else if (duel.o_correct > duel.c_correct) {
    winnerId = duel.opponent_id; loserId = duel.challenger_id; winnerName = duel.opponent_name;
  } else {
    // تساوی در تعداد پاسخ درست -> برنده کسی است که سریع‌تر جواب داده!
    if (duel.c_time_ms <= duel.o_time_ms) {
      winnerId = duel.challenger_id; loserId = duel.opponent_id; winnerName = duel.challenger_name;
    } else {
      winnerId = duel.opponent_id; loserId = duel.challenger_id; winnerName = duel.opponent_name;
    }
  }

  await updateScore(db, winnerId, 10);
  await updateScore(db, loserId, 2);

  const cSec = (duel.c_time_ms / 1000).toFixed(1);
  const oSec = (duel.o_time_ms / 1000).toFixed(1);

  const summary =
    `🏁 *نتیجه نهایی دوئل علمی (${duel.topic})*\n\n` +
    `👤 ${duel.challenger_name}: ${duel.c_correct} درست از ${questions.length} (زمان: ${cSec} ثانیه)\n` +
    `👤 ${duel.opponent_name}: ${duel.o_correct} درست از ${questions.length} (زمان: ${oSec} ثانیه)\n\n` +
    `🏆 برنده دوئل: *${winnerName}* (+۱۰ امتیاز جایزه! 🎉)\n` +
    `👏 امتیاز مشارکت اخلاقی نفر دوم: +۲ امتیاز`;

  try { await bot.api.sendMessage(duel.challenger_id, summary, { parse_mode: "Markdown" }); } catch {}
  try { await bot.api.sendMessage(duel.opponent_id, summary, { parse_mode: "Markdown" }); } catch {}
}

// ==================== موتورهای فاز ۶ (۱۰ قابلیت تکمیلی ۱۰۰٪ رایگان) ====================

// ۱. موتور رندر گرافیکی فارسی با پشتیبانی کامل HarfBuzz (Kroki Graphviz -> PNG)
function escapeGraphvizHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeGraphvizDotStr(s: string): string {
  return String(s || "")
    .replace(/\\/g, "")
    .replace(/"/g, "«")
    .replace(/\r?\n/g, " ")
    .trim();
}

async function renderKrokiGraphvizPng(dotSource: string): Promise<Uint8Array | null> {
  try {
    const res = await fetchWithTimeout(
      "https://kroki.io/graphviz/png",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "User-Agent": "Mozilla/5.0 (ClassroomBot/6.0)",
        },
        body: dotSource,
      },
      12000
    );
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

// ۲. صدور لوح تقدیر تصویری اختصاصی با نام دانش‌آموز و امضای معلم (🏅)
async function generateCertificatePng(
  studentName: string,
  grade: string,
  score: number,
  awardTitle: string
): Promise<Uint8Array | null> {
  const safeName = escapeGraphvizHtml(studentName) + (grade ? ` (پایه ${escapeGraphvizHtml(grade)})` : "");
  const safeAward = escapeGraphvizHtml(awardTitle);
  const safeTeacher = escapeGraphvizHtml(TEACHER_NAME);
  const safeDate = escapeGraphvizHtml(toJalali(new Date().toISOString()));
  const safeScore = escapeGraphvizHtml(String(score));

  const dot = `digraph Cert {
  bgcolor="#0F172A";
  pad="0.35";
  dpi=150;
  cert [
    shape=plain,
    fontname="DejaVu Sans",
    label=<
      <TABLE BORDER="4" CELLBORDER="0" CELLSPACING="8" CELLPADDING="12" BGCOLOR="#1E1B4B" COLOR="#F59E0B" STYLE="ROUNDED">
        <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="28" COLOR="#FDE68A"><B>★ لوح تقدیر و افتخار کلاسی ★</B></FONT></TD></TR>
        <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="15" COLOR="#E2E8F0">بدین‌وسیله از تلاش مستمر، نظم، پشتکار درسی و درخشش علمی دانش‌آموز عزیز</FONT></TD></TR>
        <TR><TD ALIGN="CENTER" BGCOLOR="#0F172A" BORDER="2" COLOR="#F59E0B" STYLE="ROUNDED"><FONT POINT-SIZE="24" COLOR="#FDE68A"><B>${safeName}</B></FONT></TD></TR>
        <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="16" COLOR="#F8FAFC">به پاس کسب عنوان «${safeAward}» با مجموع ${safeScore} امتیاز</FONT></TD></TR>
        <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="14" COLOR="#CBD5E1">صمیمانه قدردانی شده و آرزوی موفقیت‌های روزافزون در مسیر علم و دانایی دارد.</FONT></TD></TR>
        <HR/>
        <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="15" COLOR="#FDE68A"><B>معلم کلاس: ${safeTeacher}   |   تاریخ صدور: ${safeDate}</B></FONT></TD></TR>
      </TABLE>
    >
  ];
}`;
  return await renderKrokiGraphvizPng(dot);
}

// ۳. تبدیل خودکار درس یا مبحث به «نقشه ذهنی تصویری» (🗺 Mind Map PNG)
async function generateMindMapPngWithAI(
  env: Env,
  topicOrText: string
): Promise<{ png: Uint8Array | null; rootTitle: string; textFallback: string }> {
  const prompt = `موضوع یا متن درس زیر را به یک ساختار درختی «نقشه ذهنی (Mind Map)» آموزشی به زبان فارسی تبدیل کن:
«${topicOrText.slice(0, 8000)}»

فقط یک شیء JSON معتبر با این فرمت دقیق برگردان (بدون هیچ توضیح اضافه):
{
  "root": "عنوان کوتاه مرکزی (حداکثر ۴ کلمه)",
  "branches": [
    {
      "title": "شاخه اصلی ۱ (حداکثر ۴ کلمه)",
      "items": ["زیرمجموعه ۱ (حداکثر ۵ کلمه)", "زیرمجموعه ۲ (حداکثر ۵ کلمه)"]
    }
  ]
}
قوانین: بین ۳ تا ۵ شاخه اصلی و برای هر شاخه ۲ یا ۳ زیرمجموعه کوتاه و کلیدی بنویس.`;

  const raw = await callGroqText(
    env,
    "فقط JSON خام و معتبر با کلیدهای root و branches به زبان فارسی تولید کن.",
    prompt,
    1200,
    0.3
  );

  let rootTitle = topicOrText.trim().slice(0, 35) || "نقشه ذهنی درس";
  let branches: { title: string; items: string[] }[] = [];
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed.root) rootTitle = String(parsed.root).slice(0, 45);
      if (Array.isArray(parsed.branches)) {
        branches = parsed.branches.slice(0, 5).map((b: any) => ({
          title: String(b.title || "").slice(0, 45),
          items: Array.isArray(b.items) ? b.items.slice(0, 3).map((x: any) => String(x).slice(0, 50)) : [],
        })).filter((b: any) => b.title);
      }
    } catch {}
  }

  if (branches.length === 0) {
    branches = [
      { title: "تعریف و مفهوم اصلی", items: ["ویژگی‌های پایه", "اهمیت در درس"] },
      { title: "اجزا و دسته‌بندی", items: ["بخش اول", "بخش دوم"] },
      { title: "نکات امتحانی", items: ["فرمول و روابط", "کاربردهای مهم"] },
    ];
  }

  const branchColors = ["#DBEAFE", "#FCE7F3", "#DCFCE7", "#FEF3C7", "#EDE9FE"];
  const borderColors = ["#2563EB", "#DB2777", "#16A34A", "#D97706", "#7C3AED"];

  let dot = `digraph MindMap {
  rankdir=RL;
  bgcolor="#F8FAFC";
  pad="0.3";
  nodesep="0.35";
  ranksep="0.65";
  dpi=145;
  node [shape=box, style="rounded,filled", fontname="DejaVu Sans", fontsize=13, margin="0.18,0.12"];
  edge [penwidth=2.0, dir=forward];
  root [label="${escapeGraphvizDotStr(rootTitle)}", fillcolor="#1E1B4B", fontcolor="#FDE68A", color="#F59E0B", penwidth=2.5, fontsize=16];\n`;

  let textFallback = `🗺 *نقشه ذهنی: ${rootTitle}*\n\n`;
  branches.forEach((b, bi) => {
    const bg = branchColors[bi % branchColors.length];
    const bd = borderColors[bi % borderColors.length];
    const bId = `b_${bi}`;
    dot += `  ${bId} [label="${escapeGraphvizDotStr(b.title)}", fillcolor="${bg}", color="${bd}", fontcolor="#0F172A", fontsize=14];\n`;
    dot += `  root -> ${bId} [color="${bd}"];\n`;
    textFallback += `🔹 *${b.title}*\n`;
    b.items.forEach((it, ii) => {
      const iId = `i_${bi}_${ii}`;
      dot += `  ${iId} [label="${escapeGraphvizDotStr(it)}", fillcolor="#FFFFFF", color="${bd}", fontcolor="#1E293B", fontsize=12];\n`;
      dot += `  ${bId} -> ${iId} [color="${bd}"];\n`;
      textFallback += `   • ${it}\n`;
    });
    textFallback += "\n";
  });
  dot += "}\n";

  const png = await renderKrokiGraphvizPng(dot);
  return { png, rootTitle, textFallback };
}

// ۴. آزمون دیکته و املای هوشمند از روی عکس دست‌نویس (🎙)
const DEFAULT_DICTATION_TEXTS: { title: string; text: string; voiceFileId?: string }[] = [
  {
    title: "املای ادبی و واژگان مهم فارسی",
    text: "دانش‌آموزان کوشا با پشتکار، خردورزی و سپاسگزاری از آموزگار خویش، قله‌های باابهت دانش و معرفت را فتح می‌کنند و در مسیر پژوهش و خودباوری گام برمی‌دارند.",
  },
  {
    title: "املای واژگان علمی و زیستی",
    text: "فرآیند فتوسنتز در کلروپلاست یاخته‌های گیاهی با جذب انرژی خورشید انجام می‌شود و موجودات ذره‌بینی و زیست‌بوم‌های گوناگون به این چرخه حیاتی وابسته‌اند.",
  },
];

async function evaluateDictationWithAI(
  env: Env,
  expectedText: string,
  studentOcrText: string
): Promise<string> {
  const prompt = `متن اصلی دیکته که دانش‌آموز باید می‌نوشت:
«${expectedText}»

متن خوانده‌شده از روی عکس دست‌نویس برگه املای دانش‌آموز:
«${studentOcrText}»

به‌عنوان معلم دقیق ادبیات فارسی:
۱. تمام غلط‌های املایی یا جاافتادگی کلمات را به صورت «❌ شکل نوشته‌شده ⬅️ ✅ املای صحیح» فهرست کن.
۲. نمره پیشنهادی از ۲۰ بده.
۳. یک جمله تشویقی کوتاه بنویس.`;
  const res = await callGroqText(
    env,
    "شما معلم ادبیات فارسی هستید و برگه املای دانش‌آموز را دقیق و مهربانانه تصحیح می‌کنید.",
    prompt,
    1200,
    0.3
  );
  return res || "✅ بررسی اولیه انجام شد.";
}

// ۵. تحلیل هوشمند گزارش‌های «کجای درس امروز گنگ بود؟» ویژه معلم (🆘)
async function summarizeMuddyPointsWithAI(env: Env, rows: MuddyFeedbackRow[]): Promise<string> {
  const list = rows
    .slice(0, 25)
    .map((r, i) => `${i + 1}. ${r.topic_detail}`)
    .join("\n");
  const prompt = `دانش‌آموزان کلاس درباره مباحثی از درس که برایشان گنگ و مبهم بوده این بازخوردها را ثبت کرده‌اند:
${list}

لطفاً در قالب دستیار هوشمند معلم:
۱. پرتکرارترین و مهم‌ترین گره‌های ذهنی کلاس را در ۲ تا ۴ محور دسته‌بندی کن.
۲. یک پیشنهاد عملی ۵ دقیقه‌ای برای رفع اشکال در ابتدای جلسه آینده به معلم ارائه بده.`;
  return (
    (await callGroqText(
      env,
      "شما مشاور آموزشی معلم هستید و خلاصه تحلیلی کوتاه و کاربردی به فارسی ارائه می‌دهید.",
      prompt,
      1100,
      0.4
    )) || "پرتکرارترین مباحث ثبت‌شده در لیست بالا قابل مشاهده است."
  );
}

// ۶. صندلی داغ گفتگو با دانشمندان و مفاخر بزرگ تاریخ (🗣)
const SCIENTIST_PERSONAS: Record<string, { name: string; role: string; intro: string }> = {
  avicenna: {
    name: "🩺 ابوعلی سینا",
    role: "حکیم، پزشک و فیلسوف بزرگ ایرانی، نویسنده کتاب قانون در طب و شفا",
    intro: "درود بر تو جوینده جوان دانش! من حسین بن عبدالله بن سینا هستم. از پزشکی، کارکرد بدن، فلسفه یا روش درس خواندنم هر چه می‌خواهی بپرس!",
  },
  khwarizmi: {
    name: "🔢 محمد بن موسی خوارزمی",
    role: "پدر علم جبر و الگوریتم، ریاضی‌دان و ستاره‌شناس بزرگ ایرانی در بیت‌الحکمه",
    intro: "سلام بر تو دانش‌پژوه باهوش! من خوارزمی هستم؛ کسی که واژه «جبر» و «الگوریتم» از آثار او به جهان راه یافت. درباره معادلات، اعداد یا تاریخ ریاضی چه کنجکاوی‌ای داری؟",
  },
  ferdowsi: {
    name: "📜 حکیم ابوالقاسم فردوسی",
    role: "حماسه‌سرای بزرگ توس و سراینده شاهنامه، نگاهبان زبان پارسی",
    intro: "به نام خداوند جان و خرد! درود فرزندم؛ من فردوسی توسی هستم که سی سال برای زنده‌داشت زبان پارسی رنج بردم. از داستان‌های شاهنامه، پهلوانان و ادب پارسی بپرس!",
  },
  newton: {
    name: "🍎 آیزاک نیوتن",
    role: "فیزیک‌دان و ریاضی‌دان، کاشف قانون گرانش عمومی و قوانین سه‌گانه حرکت و نورشناسی",
    intro: "درود دوست کنجکاو من! من آیزاک نیوتن هستم. از قوانین حرکت، نیرو، جاذبه، منشور نور یا کشف قوانین طبیعت هر سوالی داری بپرس!",
  },
  einstein: {
    name: "🌌 آلبرت انیشتین",
    role: "فیزیک‌دان نظری، بنیان‌گذار نظریه نسبیت و برنده جایزه نوبل فیزیک (پدیده فوتوالکتریک)",
    intro: "سلام دانش‌آموز خلاق! من آلبرت انیشتین هستم. تخیل از دانش هم مهم‌تر است! درباره نور، زمان، فضا، اتم و انرژی چه سوالی در ذهن داری؟",
  },
  curie: {
    name: "🧪 ماری کوری",
    role: "فیزیک‌دان و شیمی‌دان پیشگام پرتوزایی، تنها برنده دو جایزه نوبل در دو رشته علمی متفاوت (فیزیک و شیمی)",
    intro: "درود بر تو پژوهشگر پرتلاش! من ماری کوری هستم. در آزمایشگاهم عنصرهای پولونیوم و رادیوم را کشف کردم. از شیمی، اتم‌ها و پشتکار در علم بپرس!",
  },
};

async function runScientistChatTurn(
  env: Env,
  scientistKey: string,
  studentQuestion: string
): Promise<string> {
  const persona = SCIENTIST_PERSONAS[scientistKey] || SCIENTIST_PERSONAS.avicenna;
  const sys = `تو دقیقاً در نقش تاریخی و علمی «${persona.name}» (${persona.role}) هستی و با یک دانش‌آموز مدرسه به زبان فارسی صمیمی، الهام‌بخش، علمی و متناسب با شخصیت تاریخی خودت گفتگو می‌کنی. پاسخ تو باید حداکثر ۶ تا ۸ خط باشد، یک نکته علمی/تاریخی واقعی یاد بدهد و در پایان یک سوال فکری جذاب از دانش‌آموز بپرسد.`;
  return (
    (await callGroqText(env, sys, studentQuestion, 900, 0.6)) ||
    "پرسش بسیار هوشمندانه‌ای پرسیدی! بیا کمی عمیق‌تر به علت علمی این پدیده فکر کنیم..."
  );
}

// ۷. بازی «کلمه‌چین و معمای واژه علمی روزانه» (🧩)
interface WordPuzzleItem {
  word: string;
  category: string;
  hint1: string;
  hint2: string;
  fact: string;
}
const DAILY_WORD_PUZZLES: WordPuzzleItem[] = [
  { word: "فتوسنتز", category: "🌱 زیست‌شناسی", hint1: "فرآیند غذاسازی در گیاهان سبز با کمک نور خورشید", hint2: "در کلروپلاست انجام می‌شود و اکسیژن آزاد می‌کند", fact: "بیش از نیمی از اکسیژن کره زمین توسط فتوسنتز گیاهان و جلبک‌های دریایی تولید می‌شود!" },
  { word: "الگوریتم", category: "🔢 ریاضی و رایانه", hint1: "مجموعه‌ای از گام‌های دقیق و مرحله‌به‌مرحله برای حل یک مسئله", hint2: "نام آن از نام دانشمند بزرگ ایرانی «خوارزمی» گرفته شده است", fact: "واژه Algorithm تلفظ اروپایی نام «الخوارزمی» است!" },
  { word: "میتوکندری", category: "🔬 علوم تجربی", hint1: "اندامکی در سلول که به آن «نیروگاه یاخته» می‌گویند", hint2: "انرژی شیمیایی غذا را برای فعالیت‌های سلول آزاد می‌کند", fact: "میتوکندری حتی DNA مستقل مخصوص به خودش را در درون سلول دارد!" },
  { word: "استعاره", category: "📖 ادبیات فارسی", hint1: "آرایه‌ای ادبی که در آن تشبیه خلاصه شده و فقط مشبه‌به یا مشبه می‌آید", hint2: "مثلاً وقتی به جای «سرباز مانند شیر است» بگوییم «شیران میدان»", fact: "استعاره از زیباترین پایه‌های خیال‌انگیزی در شعر حافظ، سعدی و فردوسی است." },
  { word: "گرانش", category: "🍎 فیزیک", hint1: "نیرویی که اجسام دارای جرم را به سمت یکدیگر می‌کشد", hint2: "باعث گردش زمین به دور خورشید و سقوط سیب به زمین می‌شود", fact: "شتاب گرانش در سطح کره زمین حدود ۹٫۸ متر بر مجذور ثانیه است." },
  { word: "تبخیر", category: "🧪 شیمی و فیزیک", hint1: "تبدیل حالت ماده از مایع به گاز در اثر دریافت گرما", hint2: "پایه اصلی تشکیل ابرها از آب دریاها در چرخه آب است", fact: "تبخیر سطحی حتی در دماهای پایین‌تر از نقطه جوش هم رخ می‌دهد و باعث خنک شدن سطح می‌شود!" },
  { word: "منشور", category: "🌈 نورشناسی و هندسه", hint1: "جسم شفاف هندسی که نور سفید را به هفت رنگ رنگین‌کمان تجزیه می‌کند", hint2: "آیزاک نیوتن با کمک آن ثابت کرد نور سفید ترکیبی از رنگ‌هاست", fact: "بنفش بیشترین شکست و قرمز کمترین شکست را هنگام عبور از منشور دارد." },
  { word: "هموگلوبین", category: "🩸 زیست‌شناسی", hint1: "پروتئین آهن‌دار درون گلبول‌های قرمز خون", hint2: "وظیفه حمل اکسیژن از شش‌ها به بافت‌های بدن را بر عهده دارد", fact: "رنگ قرمز خون انسان به دلیل وجود اتم‌های آهن در مولکول هموگلوبین است." },
  { word: "کبالت", category: "⚛️ جدول تناوبی شیمی", hint1: "عنصری فلزی و فرومغناطیس که در ساخت باتری‌ها و آهنرباهای قوی کاربرد دارد", hint2: "رنگ آبی لاجوردی کاشی‌های سنتی ایرانی اغلب از ترکیبات این فلز است", fact: "عدد اتمی کبالت ۲۷ است و در ویتامین B12 نیز وجود دارد!" },
  { word: "تلسکوپ", category: "🔭 نجوم و فضا", hint1: "ابزار نوری برای رصد سیارات، سحابی‌ها و کهکشان‌های دوردست", hint2: "گالیله برای نخستین بار با آن قمرهای سیاره مشتری را دید", fact: "تلسکوپ فضایی جیمز وب در فاصله ۱٫۵ میلیون کیلومتری زمین قرار دارد!" },
];

function getTodayWordPuzzle(): { index: number; dayKey: string; puzzle: WordPuzzleItem; scrambled: string } {
  const dayKey = new Date().toISOString().split("T")[0];
  const dayNum = Math.floor(Date.now() / 86400000);
  const index = dayNum % DAILY_WORD_PUZZLES.length;
  const puzzle = DAILY_WORD_PUZZLES[index];
  const chars = [...puzzle.word];
  // به‌هم‌ریختن قطعی حروف بدون یکسان ماندن با خود کلمه
  const shifted = chars.map((_, i) => chars[(i * 3 + 1) % chars.length]);
  if (shifted.join("") === puzzle.word && shifted.length > 1) {
    shifted.reverse();
  }
  return { index, dayKey, puzzle, scrambled: shifted.join(" - ") };
}

// ۸. برنامه‌ریز هوشمند هفتگی شخصی دانش‌آموز (📅)
async function generateWeeklyStudyPlanWithAI(
  env: Env,
  userGoals: string,
  grade: string
): Promise<string> {
  const prompt = `یک دانش‌آموز ${grade ? `پایه ${grade}` : ""} شرایط، امتحانات و زمان آزاد خود را این‌گونه توضیح داده است:
«${userGoals}»

یک برنامه مطالعاتی ۷ روزه (شنبه تا جمعه) بسیار منظم، واقع‌بینانه، قابل اجرا و انگیزشی به فارسی برایش طراحی کن که شامل:
• تفکیک روزانه با باکس‌های مطالعه ۲۰ تا ۴۵ دقیقه‌ای و زمان استراحت
• مرور و تست/حل تمرین شب امتحان
• یک توصیه طلایی برای جلوگیری از خستگی و استرس`;
  return (
    (await callGroqText(
      env,
      "شما مشاور تحصیلی دلسوز و حرفه‌ای دانش‌آموزان هستید و برنامه هفتگی تمیز و کاربردی می‌نویسید.",
      prompt,
      1800,
      0.4
    )) || "❌ خطا در ساخت برنامه مطالعاتی."
  );
}

// ۹. شبیه‌ساز تعاملی آزمایشگاه علوم (🧪 ۳ مرحله فرضیه و مشاهده)
interface ScienceLabState {
  topic: string;
  step: number;
  log: string[];
  lastQuestion: string;
  options: string[];
}
const SCIENCE_LAB_TOPICS: Record<string, string> = {
  circuit: "⚡ مدار الکتریکی، مقاومت و قانون اهم",
  acid: "🧪 اسیدها، بازها و تغییر رنگ شناساگرها",
  photo: "🌱 اثر شدت نور و دما بر سرعت فتوسنتز",
  states: "🧊 گرما، تغییر حالت ماده و نقطه جوش آب",
};

async function runScienceLabStepWithAI(
  env: Env,
  topic: string,
  step: number,
  historyLog: string[],
  chosenOption?: string
): Promise<{ text: string; options: string[]; finished: boolean }> {
  if (step >= 3) {
    const endPrompt = `موضوع آزمایشگاه مجازی علوم: «${topic}»
مراحل طی‌شده توسط دانش‌آموز:
${historyLog.join("\n")}
انتخاب مرحله آخر دانش‌آموز: «${chosenOption || ""}»

نتیجه علمی نهایی آزمایش را به زبان ساده و جذاب در ۴ تا ۶ خط توضیح بده و یک نتیجه‌گیری علمی کلیدی برای گزارش‌کار دانش‌آموز بنویس.`;
    const finalTxt =
      (await callGroqText(
        env,
        "شما استاد آزمایشگاه علوم هستید و نتیجه نهایی آزمایش را روشن و جذاب به فارسی بیان می‌کنید.",
        endPrompt,
        900,
        0.4
      )) || "آزمایش با موفقیت به پایان رسید و رابطه متغیرهای علمی مشاهده شد.";
    return { text: finalTxt, options: [], finished: true };
  }

  const stepPrompt = `آزمایشگاه مجازی علوم در موضوع: «${topic}» — مرحله ${step + 1} از ۳.
${chosenOption ? `دانش‌آموز در مرحله قبل گزینه «${chosenOption}» را انتخاب کرد. ابتدا در ۲ خط بگو چه اتفاقی در آزمایشگاه مشاهده شد، سپس موقعیت مرحله بعد را مطرح کن.` : "وسایل روی میز آزمایشگاه را در ۲ خط توصیف کن و اولین چالش آزمایش را مطرح کن."}

فقط یک شیء JSON معتبر با فرمت زیر برگردان:
{
  "observation_and_question": "مشاهده علمی و پرسش مرحله جدید به فارسی",
  "choices": [
    "اقدام یا فرضیه اول (حداکثر ۶ کلمه)",
    "اقدام یا فرضیه دوم (حداکثر ۶ کلمه)",
    "اقدام یا فرضیه سوم (حداکثر ۶ کلمه)"
  ]
}`;
  const raw = await callGroqText(
    env,
    "فقط JSON خام و معتبر با کلیدهای observation_and_question و choices به فارسی خروجی بده.",
    stepPrompt,
    900,
    0.5
  );
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const p = JSON.parse(m[0]);
      if (p.observation_and_question && Array.isArray(p.choices) && p.choices.length >= 2) {
        return {
          text: String(p.observation_and_question),
          options: p.choices.slice(0, 3).map((c: any) => String(c).slice(0, 45)),
          finished: false,
        };
      }
    } catch {}
  }
  return {
    text: `🔬 در آزمایش «${topic}» متغیر اصلی را تغییر می‌دهیم؛ به نظر تو چه اقدامی انجام دهیم؟`,
    options: ["افزایش مقدار متغیر اول", "کاهش مقدار و ثبت تغییرات", "نگه‌داشتن شرایط کنترل"],
    finished: false,
  };
}

// ۱۰. منوهای شیشه‌ای دسته‌بندی‌شده (تمیز، منظم و کامل روی موبایل)
function buildCompetitionMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚔️ دوئل علمی دو نفره", "hub_duel")
    .text("🧩 معمای واژه علمی روز", "hub_word_game")
    .row()
    .text("🛒 فروشگاه جوایز کلاس", "hub_shop")
    .text("🏆 جدول لیگ مطالعه هفته", "hub_study_league");
}

function buildLearningLabMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📂 کتابخانه و جزوات کلاس", "hub_library")
    .text("⏱ تایمر مطالعه (پومودورو)", "hub_pomo")
    .row()
    .text("🃏 جعبه لایتنر (فلش‌کارت)", "hub_leitner")
    .text("🗺 نقشه ذهنی درس (MindMap)", "hub_mindmap")
    .row()
    .text("🎧 تمرین مکالمه انگلیسی", "hub_eng_chat")
    .text("✍️ تصحیح هوشمند انشا", "hub_essay")
    .row()
    .text("🎙 آزمون دیکته و املا", "hub_dictation")
    .text("🧪 آزمایشگاه مجازی علوم", "hub_scilab")
    .row()
    .text("🗣 گفتگو با دانشمندان", "hub_scientist")
    .text("📅 برنامه‌ریز هفتگی من", "hub_planner")
    .row()
    .text("🆘 کجای درس امروز گنگ بود؟", "hub_muddy");
}

function buildTeacherHubMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ حضور و غیاب تک‌کلیکی", "thub_attendance")
    .text("📬 کارنامه هوشمند والدین", "thub_parent_cards")
    .row()
    .text("📚 جزوه‌ساز شب امتحان", "thub_summary")
    .text("📄 طراح امتحان ۲۰ نمره‌ای", "thub_exam")
    .row()
    .text("🗺 ساخت نقشه ذهنی درس", "thub_mindmap")
    .text("🏅 صدور لوح تقدیر تصویری", "thub_cert")
    .row()
    .text("📂 مدیریت کتابخانه کلاس", "thub_library")
    .text("👥 گروه‌بندی و امتیاز تیمی", "thub_teams")
    .row()
    .text("🎙 ثبت دیکته جدید کلاس", "thub_dictation")
    .text("🆘 گزارش مباحث گنگ کلاس", "thub_muddy_admin")
    .row()
    .text("🛒 مدیریت فروشگاه جوایز", "thub_shop_admin")
    .text("🧠 کارگاه یادگیری (تست)", "thub_lab_preview")
    .row()
    .text("📱 کدهای ورود اپلیکیشن اندروید و وب", "thub_app_codes");
}

async function deliverSummaryOrExam(
  ctx: Context,
  env: Env,
  bot: Bot,
  mode: "teacher_summary_wait" | "teacher_exam_wait",
  sourceText: string,
  sourceInfo: string
) {
  await deleteBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`);
  if (mode === "teacher_summary_wait") {
    const wait = await ctx.reply(`📚 در حال نگارش جزوه خلاصه شب امتحان از «${sourceInfo}»...`);
    try {
      const summary = await generateLessonSummaryWithAI(env, sourceText, sourceInfo);
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      await setBotState(env.telegram_bot_db, "saved_bcast_summary", `📚 جزوه آموزشی کلاس:\n\n${summary}`);
      await setBotState(env.telegram_bot_db, "saved_lib_draft_summary", {
        category: "جزوه و درسنامه",
        title: `جزوه ${sourceInfo}`.slice(0, 60),
        body: summary,
      });
      const kb = new InlineKeyboard()
        .text("📢 ارسال این جزوه برای کل کلاس", "bcast_doc_summary").row()
        .text("📂 ذخیره در کتابخانه کلاس", "save_lib_summary");
      await ctx.reply(summary.slice(0, 4050), { reply_markup: kb });
    } catch (e: any) {
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      await ctx.reply(`❌ خطا در ساخت جزوه: ${e.message}`);
    }
  } else {
    const wait = await ctx.reply(`📄 در حال طراحی برگه امتحانی ۲۰ نمره‌ای + پاسخنامه از «${sourceInfo}»...`);
    try {
      const { examSheet, answerKey } = await generateDescriptiveExamWithAI(env, sourceText, sourceInfo);
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      await setBotState(env.telegram_bot_db, "saved_bcast_exam", examSheet);
      await setBotState(env.telegram_bot_db, "saved_lib_draft_exam", {
        category: "نمونه سوال امتحانی",
        title: `نمونه سوال ${sourceInfo}`.slice(0, 60),
        body: examSheet,
      });
      const kb = new InlineKeyboard()
        .text("📢 ارسال برگه سوال (بدون پاسخنامه) به کل کلاس", "bcast_doc_exam").row()
        .text("📂 ذخیره برگه سوال در کتابخانه کلاس", "save_lib_exam");
      await ctx.reply(examSheet.slice(0, 4050), { reply_markup: kb });
      await ctx.reply(`🔑 پاسخنامه تشریحی ویژه معلم (محرمانه — برای دانش‌آموزان ارسال نمی‌شود):\n\n${answerKey}`.slice(0, 4050));
    } catch (e: any) {
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      await ctx.reply(`❌ خطا در طراحی امتحان: ${e.message}`);
    }
  }
}

async function recordLabPracticeLog(db: D1Database, stateKey: string, sampleText: string) {
  const cur = (await getBotState<{ count: number; samples: string[] }>(db, stateKey)) || { count: 0, samples: [] };
  cur.count += 1;
  const cleanSample = sampleText.replace(/\s+/g, " ").trim().slice(0, 90);
  if (cleanSample && cur.samples.length < 5 && !cur.samples.includes(cleanSample)) {
    cur.samples.push(cleanSample);
  }
  await setBotState(db, stateKey, cur);
}

async function submitLabProofToTeacher(
  ctx: Context,
  env: Env,
  bot: Bot,
  userId: number,
  waitState: LabProofWaitState,
  mediaLabel: string
) {
  await deleteBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`);
  await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
  if (waitState.category === "leitner") await deleteBotState(env.telegram_bot_db, `fc_session_${userId}`);
  if (waitState.category === "english") await deleteBotState(env.telegram_bot_db, `eng_session_${userId}`);

  if (userId === TEACHER_ID) {
    await ctx.reply(
      `👨‍🏫 *تست معلم:* در حالت واقعی، این مستندات (${mediaLabel}) برای بخش «${waitState.title}» همراه با دکمه‌های تایید و امتیازدهی برای شما ارسال می‌شود.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const student = await getStudent(env.telegram_bot_db, userId);
  if (!student) {
    await ctx.reply("ابتدا با /start ثبت‌نام کن.");
    return;
  }

  const subId = await createLabSubmission(env.telegram_bot_db, userId, student.name, waitState);
  await ctx.forwardMessage(TEACHER_ID);

  const kb = new InlineKeyboard()
    .text("✅ +2", `lab_ok_${subId}_2`)
    .text("✅ +3", `lab_ok_${subId}_3`)
    .text("✅ +5", `lab_ok_${subId}_5`)
    .text("✅ +10", `lab_ok_${subId}_10`)
    .row()
    .text("✏️ تایید با امتیاز دلخواه", `lab_custom_${subId}`)
    .text("❌ رد کردن", `lab_rej_${subId}`);

  await bot.api.sendMessage(
    TEACHER_ID,
    `🧠 گزارش و مستندات کارگاه یادگیری (${mediaLabel})\n` +
    `👤 دانش‌آموز: ${student.name}\n` +
    `📌 فعالیت: ${waitState.title}\n` +
    (waitState.metaNote ? `📊 جزئیات ثبت‌شده:\n${waitState.metaNote}\n` : "") +
    `🕐 ${formatDateTime(new Date().toISOString())}\n\n` +
    `👇 پس از بررسی مستندات بالا، در صورت تایید امتیاز مورد نظر را انتخاب کنید:`,
    { reply_markup: kb }
  );

  await ctx.reply(
    `✅ آفرین! خلاصه و مستندات فعالیتت در بخش «${waitState.title}» برای معلم ارسال شد.\n` +
    `⏳ پس از بررسی و تایید معلم، امتیازت` +
    (waitState.category === "study" ? " و دقایق مطالعه‌ات در لیگ کلاس" : "") +
    ` ثبت می‌شه و بهت خبر می‌دم! 🌟`
  );
}

async function approveLabSubmissionAndNotify(
  ctx: Context,
  env: Env,
  bot: Bot,
  subId: number,
  pts: number,
  fromCallback: boolean
) {
  const sub = await getLabSubmissionById(env.telegram_bot_db, subId);
  if (!sub) {
    if (fromCallback) await ctx.answerCallbackQuery({ text: "❌ گزارش پیدا نشد." });
    else await ctx.reply("❌ گزارش پیدا نشد.");
    return;
  }
  if (sub.status === "approved") {
    if (fromCallback) {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.answerCallbackQuery({ text: "قبلاً تایید شده است." });
    } else {
      await ctx.reply("ℹ️ این گزارش قبلاً تایید شده است.");
    }
    return;
  }

  await updateLabSubmissionDecision(env.telegram_bot_db, sub.id, "approved", pts);
  const up = await updateScore(env.telegram_bot_db, sub.user_id, pts);
  const newBadges = await checkAndAwardBadges(env.telegram_bot_db, sub.user_id);

  let studyExtraTeacher = "";
  let studyExtraStudent = "";
  if (sub.category === "study" && sub.minutes > 0) {
    await recordStudySession(env.telegram_bot_db, sub.user_id, sub.student_name, sub.title, sub.minutes);
    const weekTotal = await getStudentWeeklyStudyMinutes(env.telegram_bot_db, sub.user_id);
    studyExtraTeacher = `\n⏱ ${sub.minutes} دقیقه در لیگ مطالعه ثبت شد.`;
    studyExtraStudent = `\n⏱ همچنین ${sub.minutes} دقیقه مطالعه‌ات در جدول لیگ مطالعه هفته ثبت شد (مجموع هفته: ${weekTotal} دقیقه)!`;
  }

  if (fromCallback) {
    await ctx.answerCallbackQuery({ text: `✅ +${pts} امتیاز ثبت شد` });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  }
  await ctx.reply(
    `✅ مستندات کارگاه یادگیری «${sub.student_name}» (${sub.title}) تایید شد و +${pts} امتیاز به او تعلق گرفت (مجموع: ${up?.score}).${studyExtraTeacher}`
  );

  try {
    let stMsg =
      `🎉 تبریک ${sub.student_name} عزیز!\n` +
      `✅ معلم مستندات فعالیتت در بخش «${sub.title}» رو بررسی و تایید کرد و +${pts} امتیاز گرفتی! 🌟` +
      studyExtraStudent +
      `\n📊 مجموع امتیازت: ${up?.score}`;
    if (newBadges.length > 0) stMsg += `\n\n🏅 نشان جدید باز شد:\n${newBadges.map((b) => `• ${b}`).join("\n")}`;
    await bot.api.sendMessage(sub.user_id, stMsg);
  } catch {}
}

async function handleSharedUserModeText(
  ctx: Context,
  env: Env,
  bot: Bot,
  userId: number,
  text: string
): Promise<boolean> {
  const uMode = await getBotState<{
    mode: string;
    oppId?: number;
    category?: string;
    targetUid?: number;
    anon?: boolean;
    sciKey?: string;
    tries?: number;
    expectedText?: string;
    dictTitle?: string;
  }>(env.telegram_bot_db, `user_mode_${userId}`);
  if (!uMode?.mode) return false;

  if (uMode.mode === "teacher_summary_wait" || uMode.mode === "teacher_exam_wait") {
    if (text.trim().length < 5) {
      await ctx.reply("⚠️ لطفاً موضوع یا متن کامل‌تری بفرستید (یا فایل PDF / عکس / ویس ارسال کنید).");
      return true;
    }
    await deliverSummaryOrExam(ctx, env, bot, uMode.mode, text, "متن ارسالی معلم");
    return true;
  }

  if (uMode.mode === "shop_add_item" && userId === TEACHER_ID) {
    const parts = normalizeDigits(text).split("|").map((s) => s.trim());
    if (parts.length < 2) {
      await ctx.reply("❌ فرمت نامعتبر است. به صورت `عنوان جایزه | امتیاز | توضیح` بنویسید.", { parse_mode: "Markdown" });
      return true;
    }
    const cost = parseInt(parts[1], 10);
    if (isNaN(cost) || cost < 1) {
      await ctx.reply("❌ عدد امتیاز معتبر نیست.");
      return true;
    }
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    await addShopItem(env.telegram_bot_db, parts[0], cost, parts[2] || "");
    await ctx.reply(`✅ جایزه جدید «${parts[0]}» با هزینه ${cost} امتیاز به فروشگاه کلاس اضافه شد!`);
    return true;
  }

  if (uMode.mode === "fc_ai_topic") {
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    const wait = await ctx.reply("🤖 در حال طراحی ۵ فلش‌کارت هوشمند برای جعبه لایتنرت...");
    try {
      const cards = await generateFlashcardsWithAI(env, text);
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      if (cards.length === 0) {
        await ctx.reply("❌ نتونستم کارت بسازم؛ لطفاً موضوع رو واضح‌تر بنویس.");
        return true;
      }
      for (const c of cards) {
        await addFlashcard(env.telegram_bot_db, userId, c.front, c.back);
      }
      const kb = new InlineKeyboard().text("📖 شروع مرور کارت‌ها", "fc_review");
      let preview = `✅ *${cards.length} فلش‌کارت جدید به خانه ۱ جعبه لایتنرت اضافه شد!*\n\n`;
      cards.forEach((c, i) => {
        preview += `${i + 1}. ❓ ${c.front}\n   💡 ${c.back}\n\n`;
      });
      await ctx.reply(preview.slice(0, 4000), { parse_mode: "Markdown", reply_markup: kb });
    } catch {
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      await ctx.reply("❌ خطا در ساخت فلش‌کارت.");
    }
    return true;
  }

  if (uMode.mode === "fc_manual_add") {
    const parts = text.split("|").map((s) => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      await ctx.reply("❌ لطفاً روی کارت و پشت کارت را با علامت `|` جدا کن (مثال: `Brave | شجاع`).", { parse_mode: "Markdown" });
      return true;
    }
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    await addFlashcard(env.telegram_bot_db, userId, parts[0], parts[1]);
    const kb = new InlineKeyboard()
      .text("➕ افزودن کارت دیگر", "fc_manual_btn")
      .text("📖 مرور کارت‌ها", "fc_review");
    await ctx.reply(`✅ فلش‌کارت جدید ثبت شد!\n❓ روی کارت: ${parts[0]}\n💡 پشت کارت: ${parts[1]}`, { reply_markup: kb });
    return true;
  }

  if (uMode.mode === "english_chat") {
    const wait = await ctx.reply("🎧 Checking your English...");
    try {
      await recordLabPracticeLog(env.telegram_bot_db, `eng_session_${userId}`, text);
      const turn = await runEnglishConversationTurn(env, text);
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      const kb = new InlineKeyboard()
        .text("📤 ارسال مستندات مکالمه به معلم (امتیاز)", "lab_req_english").row()
        .text("🏁 پایان مکالمه انگلیسی", "eng_stop");
      await ctx.reply(
        `✏️ نکته آموزشی: ${turn.correctionFa}\n\n🗣 Teacher: ${turn.englishReply}\n🇮🇷 معنی: ${turn.persianMeaning}`,
        { reply_markup: kb }
      );
      const vBuf = await textToVoice(turn.englishReply, "en");
      if (vBuf) {
        try { await ctx.replyWithVoice(new InputFile(new Uint8Array(vBuf), "english_reply.ogg")); } catch {}
      }
    } catch {
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      await ctx.reply("❌ خطا در پردازش مکالمه انگلیسی.");
    }
    return true;
  }

  if (uMode.mode === "essay_review") {
    if (text.trim().length < 25) {
      await ctx.reply("⚠️ متن انشا خیلی کوتاه است؛ لطفاً حداقل چند جمله بنویس یا عکس انشات رو بفرست.");
      return true;
    }
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    const wait = await ctx.reply("✍️ در حال خواندن و تصحیح دقیق انشای تو...");
    try {
      const review = await evaluatePersianEssayWithAI(env, text);
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      const kb = new InlineKeyboard().text("📤 ارسال انشای نهایی به معلم (دریافت امتیاز)", "lab_req_essay");
      await ctx.reply(`📝 نتیجه تصحیح و بازخورد انشا:\n\n${review}`.slice(0, 4050), { reply_markup: kb });
    } catch {
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      await ctx.reply("❌ خطا در بررسی انشا.");
    }
    return true;
  }

  if (uMode.mode === "duel_custom_topic" && uMode.oppId) {
    const me = await getStudent(env.telegram_bot_db, userId);
    const opp = await getStudent(env.telegram_bot_db, uMode.oppId);
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    if (!me || !opp) {
      await ctx.reply("❌ اطلاعات دوئل پیدا نشد.");
      return true;
    }
    const topic = text.trim().slice(0, 80);
    const wait = await ctx.reply(`⚔️ در حال طراحی ۳ سوال دوئل در موضوع «${topic}»...`);
    const qList = await generateMultipleQuizzesWithAI(env, `${topic} مناسب پایه ${me.grade || "متوسطه"}`, 3);
    try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
    if (typeof qList === "string" || qList.length === 0) {
      await ctx.reply("❌ خطا در ساخت سوالات دوئل. لطفاً موضوع واضح‌تری انتخاب کن.");
      return true;
    }
    const shuffled = qList.map((q) => shuffleQuizOptions(q));
    const duelId = await createDuel(env.telegram_bot_db, userId, me.name, opp.user_id, opp.name, topic, shuffled);
    const invKb = new InlineKeyboard()
      .text("🔥 قبول دوئل و شروع!", `duel_acc_${duelId}`)
      .text("🏳️ انصراف", `duel_dec_${duelId}`);
    try {
      await bot.api.sendMessage(
        opp.user_id,
        `⚔️ *دعوت به دوئل علمی!*\n\nهم‌کلاسی‌ت *${me.name}* تو رو به یک رقابت ۳ سوالی در موضوع «*${topic}*» دعوت کرده!\n🏆 جایزه برنده: **+۱۰ امتیاز**`,
        { parse_mode: "Markdown", reply_markup: invKb }
      );
    } catch {}
    await ctx.reply(`✅ دعوت‌نامه دوئل برای «${opp.name}» ارسال شد!\n🚀 نوبت تو شروع شد:`);
    await sendDuelQuestionToPlayer(bot, env.telegram_bot_db, duelId, userId);
    return true;
  }

  // ---- فاز ۶: افزودن منبع متنی به کتابخانه کلاس توسط معلم ----
  if (uMode.mode === "library_add_wait" && userId === TEACHER_ID) {
    const parts = text.split("|");
    const title = (parts.length >= 2 ? parts[0].trim() : text.trim().slice(0, 40)) || "جزوه آموزشی";
    const body = parts.length >= 2 ? parts.slice(1).join("|").trim() : text.trim();
    const cat = uMode.category || "جزوه و درسنامه";
    await deleteBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`);
    await addLibraryItem(env.telegram_bot_db, cat, title.slice(0, 70), "text", "", body);
    await ctx.reply(`✅ منبع متنی «${title}» در دسته «${cat}» کتابخانه کلاس ذخیره شد!`);
    return true;
  }

  // ---- فاز ۶: عنوان دلخواه لوح تقدیر تصویری ----
  if (uMode.mode === "cert_custom_title" && userId === TEACHER_ID && uMode.targetUid) {
    await deleteBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`);
    const st = await getStudent(env.telegram_bot_db, uMode.targetUid);
    if (!st) {
      await ctx.reply("❌ دانش‌آموز پیدا نشد.");
      return true;
    }
    const awardTitle = text.trim().slice(0, 55);
    const wait = await ctx.reply("🎨 در حال طراحی گرافیکی لوح تقدیر اختصاصی...");
    const png = await generateCertificatePng(st.name, st.grade || "", st.score, awardTitle);
    try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
    if (!png) {
      await ctx.reply("❌ خطا در رندر لوح تقدیر.");
      return true;
    }
    try { await saveCertificateInAppDb(env.telegram_bot_db, st.user_id, st.name, awardTitle, png, uint8ToBase64); } catch {}
    const kb = new InlineKeyboard().text("📤 ارسال لوح به خود دانش‌آموز", `cert_send_st_${st.user_id}`).row();
    if (st.parent_chat_id) kb.text("📬 ارسال لوح به تلگرام والدین", `cert_send_par_${st.user_id}`).row();
    kb.text("📢 تشویق و نمایش در کل کلاس", `cert_bcast_${st.user_id}`);
    const sentPhoto = await ctx.replyWithPhoto(new InputFile(png, "certificate.png"), {
      caption: `🏅 لوح تقدیر آماده شد!\n👤 دانش‌آموز: ${st.name}\n🌟 عنوان: ${awardTitle}`,
      reply_markup: kb,
    });
    const fid = sentPhoto.photo?.[sentPhoto.photo.length - 1]?.file_id || "";
    await setBotState(env.telegram_bot_db, `saved_cert_${st.user_id}`, { fileId: fid, awardTitle, name: st.name });
    return true;
  }

  // ---- فاز ۶: ساخت نقشه ذهنی تصویری درس (Mind Map PNG) ----
  if (uMode.mode === "mindmap_wait") {
    if (text.trim().length < 3) {
      await ctx.reply("⚠️ لطفاً عنوان درس یا مبحث را کامل‌تر بنویسید.");
      return true;
    }
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    const wait = await ctx.reply("🗺 در حال تحلیل مبحث و ترسیم گرافیکی نقشه ذهنی فارسی...");
    const mm = await generateMindMapPngWithAI(env, text);
    try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
    if (mm.png) {
      if (userId === TEACHER_ID) {
        const kb = new InlineKeyboard().text("📢 ارسال نقشه ذهنی برای کل کلاس", "mmap_bcast");
        const sent = await ctx.replyWithPhoto(new InputFile(mm.png, "mindmap.png"), {
          caption: `🗺 نقشه ذهنی درس: «${mm.rootTitle}»`,
          reply_markup: kb,
        });
        const fid = sent.photo?.[sent.photo.length - 1]?.file_id || "";
        if (fid) await setBotState(env.telegram_bot_db, "saved_mindmap_bcast", { fileId: fid, title: mm.rootTitle });
      } else {
        await ctx.replyWithPhoto(new InputFile(mm.png, "mindmap.png"), {
          caption: `🗺 نقشه ذهنی درس: «${mm.rootTitle}»`,
        });
      }
    } else {
      await ctx.reply(mm.textFallback, { parse_mode: "Markdown" });
    }
    return true;
  }

  // ---- فاز ۶: ثبت متن دیکته جدید توسط معلم ----
  if (uMode.mode === "dictation_teacher_set" && userId === TEACHER_ID) {
    if (text.trim().length < 15) {
      await ctx.reply("⚠️ متن دیکته کوتاه است؛ لطفاً حداقل یک یا دو جمله بنویسید یا ویس دیکته بفرستید.");
      return true;
    }
    await deleteBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`);
    const parts = text.split("|");
    const title = parts.length >= 2 ? parts[0].trim() : `دیکته کلاسی (${toJalali(new Date().toISOString())})`;
    const body = parts.length >= 2 ? parts.slice(1).join("|").trim() : text.trim();
    await setBotState(env.telegram_bot_db, "active_dictation", { title, text: body });
    await ctx.reply(`✅ دیکته جدید کلاس با عنوان «${title}» ثبت شد!\nاکنون دانش‌آموزان در بخش «🧠 کارگاه یادگیری ⬅️ 🎙 آزمون دیکته» می‌توانند آن را بنویسند و عکس برگه‌شان را بفرستند.`);
    return true;
  }

  if (uMode.mode === "dictation_student_photo") {
    await ctx.reply("📸 برای تصحیح املا، لطفاً روی کاغذ بنویس و **عکس واضح از برگه دست‌نویس املایت** را بفرست! (برای انصراف /cancel)", { parse_mode: "Markdown" });
    return true;
  }

  // ---- فاز ۶: ثبت بازخورد محترمانه/ناشناس «کجای درس گنگ بود؟» ----
  if (uMode.mode === "muddy_wait") {
    if (text.trim().length < 5) {
      await ctx.reply("⚠️ لطفاً کمی دقیق‌تر بنویس کدام مبحث برایت گنگ بود.");
      return true;
    }
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    const st = await getStudent(env.telegram_bot_db, userId);
    const stName = st?.name || "دانش‌آموز";
    const isAnon = Boolean(uMode.anon);
    await addMuddyFeedback(env.telegram_bot_db, stName, text.trim().slice(0, 400), isAnon);
    try {
      await bot.api.sendMessage(
        TEACHER_ID,
        `🆘 گزارش جدید «مبحث گنگ درس»\n👤 فرستنده: ${isAnon ? "🔒 ناشناس" : stName}\n📌 مبحث: ${text.trim().slice(0, 400)}`
      );
    } catch {}
    await ctx.reply("✅ ممنون که گفتی! بازخوردت با موفقیت برای معلم ثبت شد تا در کلاس مرور و رفع اشکال بشه 🌟");
    return true;
  }

  // ---- فاز ۶: گفتگو با مفاخر و دانشمندان بزرگ تاریخ ----
  if (uMode.mode === "scientist_chat" && uMode.sciKey) {
    const persona = SCIENTIST_PERSONAS[uMode.sciKey] || SCIENTIST_PERSONAS.avicenna;
    const wait = await ctx.reply(`⏳ ${persona.name} در حال اندیشیدن به پرسش توست...`);
    await recordLabPracticeLog(env.telegram_bot_db, `sci_session_${userId}`, text);
    const replyTxt = await runScientistChatTurn(env, uMode.sciKey, text);
    try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
    const kb = new InlineKeyboard()
      .text("📤 ارسال خلاصه مصاحبه به معلم (امتیاز)", "lab_req_scientist").row()
      .text("🏁 پایان گفتگو", "sci_stop");
    await ctx.reply(`${persona.name}:\n\n${replyTxt}`, { reply_markup: kb });
    return true;
  }

  // ---- فاز ۶: حدس واژه علمی روزانه (🧩 کلمه‌چین) ----
  if (uMode.mode === "word_guess_wait") {
    const todayData = getTodayWordPuzzle();
    const cleanGuess = text.replace(/[\s\u200c\-]/g, "").trim();
    const cleanTarget = todayData.puzzle.word.replace(/[\s\u200c\-]/g, "").trim();

    if (cleanGuess === cleanTarget) {
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await setBotState(env.telegram_bot_db, `word_solved_${todayData.dayKey}_${userId}`, true);
      const kb = new InlineKeyboard().text("📤 جمله‌سازی علمی با این واژه و ارسال به معلم (امتیاز)", "lab_req_word");
      await ctx.reply(
        `🎉👏 *آفرین! کاملاً درست حدس زدی!*\n\n` +
        `🔑 واژه علمی امروز: *${todayData.puzzle.word}* (${todayData.puzzle.category})\n` +
        `💡 *آیا می‌دانستی؟* ${todayData.puzzle.fact}\n\n` +
        `🌟 برای دریافت امتیاز تشویقی، روی دکمه زیر بزن و یک جمله علمی با این واژه برای معلم بفرست:`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return true;
    }

    const tries = (uMode.tries || 0) + 1;
    if (tries >= 5) {
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await ctx.reply(
        `😅 ۵ نوبت حدست تموم شد! واژه علمی امروز «*${todayData.puzzle.word}*» بود.\n💡 نکته علمی: ${todayData.puzzle.fact}`,
        { parse_mode: "Markdown" }
      );
      return true;
    }

    await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "word_guess_wait", tries });
    const kb = new InlineKeyboard().text("💡 راهنمایی بیشتر", "word_hint2");
    await ctx.reply(`❌ نه، «${text.trim()}» نبود! (تلاش ${tries} از ۵)\nدوباره دقت کن: \`${todayData.scrambled}\``, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
    return true;
  }

  // ---- فاز ۶: برنامه‌ریز هوشمند هفتگی شخصی ----
  if (uMode.mode === "planner_wait") {
    if (text.trim().length < 8) {
      await ctx.reply("⚠️ لطفاً امتحان‌ها یا درس‌های هفته آینده و ساعت آزاد روزانه‌ت رو کمی کامل‌تر بنویس.");
      return true;
    }
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    const st = await getStudent(env.telegram_bot_db, userId);
    const wait = await ctx.reply("📅 در حال چیدن برنامه مطالعاتی ۷ روزه اختصاصی برای تو...");
    const plan = await generateWeeklyStudyPlanWithAI(env, text, st?.grade || "");
    try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
    await setBotState(env.telegram_bot_db, `study_plan_${userId}`, plan);
    const kb = new InlineKeyboard()
      .text("📤 ارسال گزارش اجرای برنامه امروز به معلم (امتیاز)", "lab_req_plan").row()
      .text("🔄 طراحی برنامه جدید", "plan_new");
    await ctx.reply(`📅 برنامه مطالعاتی هفتگی اختصاصی تو آماده شد:\n\n${plan}`.slice(0, 4000), { reply_markup: kb });
    return true;
  }

  // ---- فاز ۶: آزمایش دلخواه در شبیه‌ساز آزمایشگاه علوم ----
  if (uMode.mode === "scilab_custom_topic") {
    await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
    const topic = text.trim().slice(0, 70);
    const wait = await ctx.reply(`🧪 در حال آماده‌سازی آزمایشگاه مجازی برای «${topic}»...`);
    const stepRes = await runScienceLabStepWithAI(env, topic, 0, []);
    try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
    const simState: ScienceLabState = {
      topic,
      step: 1,
      log: [`مرحله ۱: ${stepRes.text}`],
      lastQuestion: stepRes.text,
      options: stepRes.options,
    };
    await setBotState(env.telegram_bot_db, `scilab_state_${userId}`, simState);
    const kb = new InlineKeyboard();
    stepRes.options.forEach((opt, i) => kb.text(`🔹 ${opt}`, `scilab_ch_${i}`).row());
    await ctx.reply(`🧪 *${topic}* (مرحله ۱ از ۳)\n\n${stepRes.text}`, { parse_mode: "Markdown", reply_markup: kb });
    return true;
  }

  return false;
}

// ==================== ساخت ربات ====================
function createBot(env: Env) {
  const bot = new Bot(BOT_TOKEN);

  // پاکسازی خودکار وضعیت‌های معلق در صورت جابه‌جایی بین دکمه‌های منو
  const otherStudentMenuButtons = new Set([
    "❓ پرسش و پاسخ", "🎮 رقابت و جوایز", "🧠 کارگاه یادگیری",
    "🌟 امتیاز من", "🏆 رتبه من", "📤 ارسال تکلیف",
    "📅 تاریخچه من", "🏅 نشان‌های من", "🔥 استریک من", "📈 نمودار من",
    "🎂 تولد من", "🏅 سطح من", "🖥 پنل من", "📖 راهنما",
  ]);
  const otherTeacherMenuButtons = new Set([
    "❓ پرسش و پاسخ", "👨‍🏫 ابزارهای هوشمند کلاس",
    "📋 لیست", "🏆 رتبه‌بندی", "📅 تکالیف", "📋 غایبین",
    "⏰ ددلاین‌ها", "📊 اکسل", "📈 نمودار", "🎁 برنده",
    "🔥 استریک‌ها", "🎂 تولدها", "📊 گزارش هفتگی", "🎲 کوییز",
    "🤖 کوییز AI", "📝 کوییز چندتایی", "📄 کوییز از PDF/متن", "🎰 قرعه‌کشی",
    "📣 ارسال همگانی", "💡 انگیزشی", "♻️ ریست", "📖 راهنما",
  ]);

  bot.use(async (ctx, next) => {
    await ensureExtraTables(env.telegram_bot_db);
    const uid = ctx.from?.id;
    const txt = ctx.message?.text;
    if (uid && txt) {
      if (uid !== TEACHER_ID && (otherStudentMenuButtons.has(txt) || txt === "/start" || txt === "🎯 ماموریت روز")) {
        if (txt !== "🎯 ماموریت روز") await deleteBotState(env.telegram_bot_db, `mission_wait_${uid}`);
        await deleteBotState(env.telegram_bot_db, `lab_proof_wait_${uid}`);
        await deleteBotState(env.telegram_bot_db, `user_mode_${uid}`);
        if (txt !== "❓ پرسش و پاسخ") waitingAiQuestion[uid] = false;
      } else if (uid === TEACHER_ID && (otherTeacherMenuButtons.has(txt) || txt === "/start")) {
        if (txt !== "📄 کوییز از PDF/متن") {
          await deleteBotState(env.telegram_bot_db, "teacher_pdf_quiz");
        }
        await deleteBotState(env.telegram_bot_db, "teacher_mission_score");
        await deleteBotState(env.telegram_bot_db, "teacher_lab_score");
        await deleteBotState(env.telegram_bot_db, `lab_proof_wait_${TEACHER_ID}`);
        await deleteBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`);
        if (txt !== "❓ پرسش و پاسخ") {
          waitingAiQuestion[TEACHER_ID] = false;
        } else {
          waitingBroadcast[TEACHER_ID] = false;
        }
      }
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    if ((globalThis as any).waitingBirthday) delete (globalThis as any).waitingBirthday[userId];
    waitingBroadcast[userId] = false;
    waitingAiQuestion[userId] = false;
    if (userId === TEACHER_ID) return void (await ctx.reply("👨‍🏫 سلام معلم عزیز! 👇", { reply_markup: teacherKeyboard() }));

    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student || !student.name) {
      (globalThis as any).regStep = (globalThis as any).regStep || {};
      (globalThis as any).regStep[userId] = "name";
      await ctx.reply("سلام! به کلاس خوش آمدی 👋\n\nلطفاً اسم و فامیلت را بنویس:");
      return;
    }
    if (isBirthdayToday(student.birthday)) await ctx.reply(`🎂🎉 تولدت مبارک ${student.name}! 🎉🎂\n\n${getRandomBirthdayMessage()}\n\n💐 از طرف معلمت و دوست دارت\n✨ ${TEACHER_NAME}`);
    await ctx.reply("🌟 از منوی پایین انتخاب کن. 👇", { reply_markup: studentKeyboard() });
  });

  // ------------------- دکمه‌های دانش‌آموز -------------------
  bot.hears("🌟 امتیاز من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول /start ثبت‌نام کن."));
    const levelInfo = getLevelInfo(student.level || 1), next = getNextLevelInfo(student.level || 1);
    let text = `🌟 امتیاز تو: ${student.score}\n🏅 سطح: ${levelInfo.name}\n`;
    if (next) text += `📈 تا سطح بعدی: ${next.minScore - student.score} امتیاز\n`;
    if (student.streak > 0) text += `🔥 استریک: ${student.streak} روز\n`;
    text += `\n💬 ${getRandomMotivation()}`;
    await ctx.reply(text);
  });

  bot.hears("🏆 رتبه من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const all = await getAllStudents(env.telegram_bot_db);
    const rank = all.findIndex((s) => s.user_id === userId) + 1;
    if (rank === 0) return void (await ctx.reply("ثبت‌نام نکردی."));
    await ctx.reply(`🏆 رتبه تو: ${rank} از ${all.length}`);
  });

  bot.hears("📤 ارسال تکلیف", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    waitingAiQuestion[userId] = false;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    await ctx.reply("📎 تکلیفت رو بفرست (عکس، ویدیو، ویس، فایل یا متن):");
  });

  bot.hears("📅 تاریخچه من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    const hw = await getHomework(env.telegram_bot_db, userId);
    if (hw.length === 0) return void (await ctx.reply("📅 هنوز تکلیفی نفرستادی."));
    let text = `📅 تاریخچه ${student.name}:\n\n`;
    hw.slice(0, 10).forEach((h) => { text += `• ${toJalali(h.date)} (${h.type}) ${h.score > 0 ? `| نمره: ${h.score}` : ""} ${h.feedback ? `| 💬 ${h.feedback}` : ""}\n`; });
    text += `\n📊 مجموع: ${hw.length} تکلیف`;
    await ctx.reply(text);
  });

  bot.hears("🏅 نشان‌های من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    const badges = await getBadges(env.telegram_bot_db, userId);
    if (badges.length === 0) return void (await ctx.reply("🏅 هنوز نشانی نگرفتی.\n\n🎯 ۱۰ تکلیف = تکلیف‌کوش\n🌟 ۵ نمره ۲۰ = نابغه\n👑 ۵۰ امتیاز = سلطان\n🔥 ۳ روز = ۳ روزه"));
    let text = `🏅 نشان‌های ${student.name}:\n\n`; badges.forEach((b) => text += `• ${b.badge} (${toJalali(b.date)})\n`);
    await ctx.reply(text);
  });

  bot.hears("🔥 استریک من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    await ctx.reply(`🔥 استریک تو: ${student.streak || 0} روز پیوسته\n📈 بیشترین: ${student.max_streak || 0} روز`);
  });

  bot.hears("🎂 تولد من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    if (student.birthday) await ctx.reply(`🎂 تولد تو: ${formatJalaliBirthday(student.birthday)}\n\nبرای تغییر، عدد جدید رو بفرست:\nYYYYMMDD`);
    else await ctx.reply(`🎂 تاریخ تولدت رو بفرست:\n\n📅 YYYYMMDD (مثال: 13670317)`);
    (globalThis as any).waitingBirthday = (globalThis as any).waitingBirthday || {};
    (globalThis as any).waitingBirthday[userId] = true;
  });

  bot.hears("📈 نمودار من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    const hw = await getHomework(env.telegram_bot_db, userId);
    if (hw.length === 0) return void (await ctx.reply("📊 هنوز داده‌ای نداری."));
    const scores = hw.slice(0, 10).reverse().map((h) => h.score || 0);
    await ctx.replyWithPhoto(buildStudentChart(scores), { caption: `📈 پیشرفت ${student.name}` });
  });

  bot.hears("🎯 ماموریت روز", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    waitingAiQuestion[userId] = false;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));

    let mission = await getTodayMission(env.telegram_bot_db, userId);
    if (!mission) {
      const m = DAILY_MISSIONS[Math.floor(Math.random() * DAILY_MISSIONS.length)];
      const mid = await createMission(env.telegram_bot_db, userId, student.name, m);
      mission = { id: mid, user_id: userId, name: student.name, mission: m, date: new Date().toISOString(), done: 0 };
    }
    const stats = await getMissionStats(env.telegram_bot_db, userId);

    if (mission.done === 1) {
      return void (await ctx.reply(
        `🎯 ماموریت امروز:\n\n✅ ${mission.mission}\n\n👏 آفرین! فعالیتت توسط معلم تایید شد و امتیاز گرفتی.\n📊 ماموریت‌های تاییدشده: ${stats.done} از ${stats.total}`
      ));
    }

    if (mission.done === 2) {
      const kb = new InlineKeyboard().text("🔄 ارسال گزارش جدید / تکمیلی", `mission_resubmit_${mission.id}`);
      return void (await ctx.reply(
        `🎯 ماموریت امروز:\n\n⏳ ${mission.mission}\n\n📨 گزارشت برای معلم ارسال شده و منتظر بررسی و امتیازدهی معلمه!\n📊 ماموریت‌های تاییدشده: ${stats.done} از ${stats.total}`,
        { reply_markup: kb }
      ));
    }

    await setBotState(env.telegram_bot_db, `mission_wait_${userId}`, { missionId: mission.id });
    const kb = new InlineKeyboard().text("❌ انصراف", `mission_cancel_${mission.id}`);
    await ctx.reply(
      `🎯 ماموریت امروز تو:\n\n📌 ${mission.mission}\n\n` +
      `📤 لطفاً فعالیتی که برای این ماموریت انجام دادی رو همین‌جا بفرست (متن توضیح، عکس، ویس، ویدیو یا فایل) تا برای معلم ارسال بشه و در صورت تایید بهت امتیاز بده!\n\n` +
      `📊 ماموریت‌های تاییدشده: ${stats.done} از ${stats.total}`,
      { reply_markup: kb }
    );
  });

  bot.hears("🏅 سطح من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    const curr = getLevelInfo(student.level || 1), next = getNextLevelInfo(student.level || 1);
    let text = `🏅 سطح تو:\n\n${curr.name}\n📊 امتیاز: ${student.score}\n\n`;
    if (next) text += `📈 تا سطح بعدی (${next.name}):\n💪 ${next.minScore - student.score} امتیاز دیگه!\n\n`;
    else text += `🎉 تو به بالاترین سطح رسیدی!\n\n`;
    text += `📋 همه سطوح:\n`; LEVELS.forEach((l) => { text += `${(student.level || 1) >= l.level ? "✅" : "🔒"} ${l.name} (${l.minScore}+)\n`; });
    await ctx.reply(text);
  });

  // ========== ❓ پرسش و پاسخ (دانش‌آموز و معلم) ==========
  bot.hears("❓ پرسش و پاسخ", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    if (userId !== TEACHER_ID) {
      const student = await getStudent(env.telegram_bot_db, userId);
      if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    } else {
      waitingBroadcast[TEACHER_ID] = false;
      await deleteBotState(env.telegram_bot_db, "teacher_pdf_quiz");
      await deleteBotState(env.telegram_bot_db, "teacher_mission_score");
    }
    
    await ctx.reply(
      "❓ *پرسش و پاسخ هوشمند و آنلاین*\n\n" +
      "سلام! هر سوالی داری به صورت **متن**، **ویس** یا **عکس تکلیف** بفرست تا آنلاین بهت جواب بدم:\n\n" +
      "• 📚 حل تمرین و سوالات درسی + تحلیل عکس تکلیف\n" +
      "• 📜 شعر فارسی، معنی شعر و فال حافظ (گنجور)\n" +
      "• 🕋 آیات و سوره‌های قرآن با ترجمه فارسی + صوت تلاوت\n" +
      "• 🌌 عکس‌های فضایی ناسا، ایستگاه فضایی (ISS) و نجوم\n" +
      "• 🧪 آزمایشگاه شیمی، جدول تناوبی و آخرین زلزله‌ها\n" +
      "• 🏛 موزه‌گردی باستان، 🦁 حیات‌وحش و گیاهان (با تصویر واقعی)\n" +
      "• 📕 دیکشنری تخصصی انگلیسی با صوت تلفظ، مترادف و متضاد\n" +
      "• 📐 رسم نمودار توابع ریاضی و 🎨 ساخت تصویر هوشمند\n" +
      "• 🗓 تقویم، اوقات شرعی، 🗺 کشورها و پرچم، آب‌وهوا، اخبار و ترجمه\n\n" +
      "⏳ لطفاً سوالت رو بفرست:",
      { parse_mode: "Markdown" }
    );
    waitingAiQuestion[userId] = true;
  });

  // ========== 🎮 رقابت و جوایز (منوی دسته‌بندی‌شده دانش‌آموز) ==========
  bot.hears("🎮 رقابت و جوایز", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    if (userId !== TEACHER_ID) {
      const student = await getStudent(env.telegram_bot_db, userId);
      if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    }
    await ctx.reply(
      "🎮 *باشگاه رقابت و جوایز کلاس*\n\n" +
      "• ⚔️ *دوئل علمی دو نفره*: رقابت هم‌زمان ۳ سوالی با هم‌کلاسی + جایزه برنده\n" +
      "• 🧩 *معمای واژه علمی روز*: کشف کلمه علمی به‌هم‌ریخته + جمله‌سازی برای امتیاز\n" +
      "• 🛒 *فروشگاه جوایز*: خرید جایزه‌های جذاب کلاسی با تایید معلم\n" +
      "• 🏆 *لیگ مطالعه هفته*: جدول قهرمانان مطالعه تاییدشده هفته!\n\n" +
      "👇 یکی از بخش‌های زیر رو انتخاب کن:",
      { parse_mode: "Markdown", reply_markup: buildCompetitionMenuKeyboard() }
    );
  });

  // ========== 🧠 کارگاه یادگیری (منوی دسته‌بندی‌شده مهارت‌افزایی) ==========
  bot.hears("🧠 کارگاه یادگیری", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    if (userId !== TEACHER_ID) {
      const student = await getStudent(env.telegram_bot_db, userId);
      if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    }
    await ctx.reply(
      "🧠 *کارگاه هوشمند یادگیری و مهارت‌افزایی*\n\n" +
      "• 📂 *کتابخانه کلاس*: دسترسی همیشگی به جزوات، PDFها و نمونه سوالات معلم\n" +
      "• ⏱ *تایمر مطالعه (پومودورو)* و 🃏 *جعبه لایتنر ۵ خانه‌ای*\n" +
      "• 🗺 *نقشه ذهنی تصویری (MindMap)* و 📅 *برنامه‌ریز هفتگی شخصی*\n" +
      "• 🎧 *مکالمه انگلیسی ویس‌به‌ویس*، ✍️ *تصحیح انشا* و 🎙 *آزمون دیکته از عکس برگه*\n" +
      "• 🧪 *آزمایشگاه مجازی علوم*، 🗣 *گفتگو با دانشمندان* و 🆘 *ثبت مباحث گنگ درس*\n\n" +
      "💡 *نکته امتیازدهی:* با ارسال خلاصه/مستندات هر فعالیت و **تایید معلم**، امتیاز می‌گیری! 🌟\n\n" +
      "👇 یکی از ابزارهای زیر رو انتخاب کن:",
      { parse_mode: "Markdown", reply_markup: buildLearningLabMenuKeyboard() }
    );
  });

  // ========== 👨‍🏫 ابزارهای هوشمند کلاس (ویژه معلم) ==========
  bot.hears("👨‍🏫 ابزارهای هوشمند کلاس", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply(
      "👨‍🏫 *دستیار هوشمند مدیریت کلاس و طراحی درس*\n\n" +
      "• ✅ *حضور و غیاب تک‌کلیکی* + 📬 *کارنامه هوشمند هفتگی والدین*\n" +
      "• 📚 *جزوه‌ساز شب امتحان* + 📄 *طراح امتحان ۲۰ نمره‌ای با پاسخنامه*\n" +
      "• 🗺 *ساخت نقشه ذهنی تصویری* + 🏅 *صدور لوح تقدیر گرافیکی اختصاصی*\n" +
      "• 📂 *مدیریت کتابخانه کلاس* + 👥 *گروه‌بندی هوشمند و امتیاز تیمی*\n" +
      "• 🎙 *ثبت دیکته کلاس* + 🆘 *گزارش مباحث گنگ* + 🛒 *مدیریت فروشگاه*\n\n" +
      "👇 ابزار مورد نظر را انتخاب کنید:",
      { parse_mode: "Markdown", reply_markup: buildTeacherHubMenuKeyboard() }
    );
  });

  bot.hears("🖥 پنل من", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    await ensureExtraTables(env.telegram_bot_db);
    const cred = await ensureStudentAppCredentials(env.telegram_bot_db, userId);
    const appUrl = env.PUBLIC_APP_URL || `https://smartclass.vercel.app/app`;
    const legacyLink = `https://class-dashboard1.pages.dev/student.html?id=${userId}`;
    await ctx.reply(
      `📱 *اپلیکیشن و پنل هوشمند کلاس (اندروید و وب)*\n\n` +
      `🔗 *لینک ورود مستقیم به اپ:*\n${appUrl}\n\n` +
      `🎒 *اطلاعات ورود پنل دانش‌آموز:*\n` +
      `• کد دانش‌آموزی: \`${cred.student_code}\`\n` +
      `• رمز عبور: \`${cred.student_pin}\`\n\n` +
      `👪 *کد اختصاصی ورود پنل والدین:*\n` +
      `• کد اولیا: \`${cred.parent_code}\`\n` +
      `_(این کد ۶ رقمی را به پدر یا مادرت بده تا کارنامه و وضعیت درسی‌ات را در اپلیکیشن ببینند)_\n\n` +
      `🖥 داشبورد وب قبلی:\n${legacyLink}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.hears("📖 راهنما", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === TEACHER_ID) await ctx.reply("📖 راهنمای معلم:\n\n👨‍🏫 دکمه «ابزارهای هوشمند کلاس» (حضوروغیاب تک‌کلیکی، کارنامه والدین، جزوه‌ساز شب امتحان، طراح امتحان تشریحی ۲۰ نمره‌ای، مدیریت فروشگاه جوایز)\n❓ دکمه «پرسش و پاسخ» (چت هوشمند + ۱۸ سرویس آنلاین، ساخت تصویر، رسم نمودار، موزه، حیات‌وحش، دیکشنری صوتی، قرآن، گنجور، ناسا و...)\n📄 دکمه «کوییز از PDF/متن» (ارسال فایل PDF، عکس صفحه کتاب یا متن درس)\n➕ /add | ➖ /remove | 💬 /grade | ⏰ /deadline | 📢 /announce | 📣 /broadcast | 💡 /motivate | 📞 /parent | 📤 /send_parent | 🎲 /quiz | 📊 /report");
    else await ctx.reply("📖 راهنمای دانش‌آموز:\n\n❓ پرسش و پاسخ آنلاین (درسی، ۱۸ سرویس آنلاین، شعر، قرآن، ناسا، موزه، حیات‌وحش، دیکشنری صوتی، رسم نمودار، ساخت تصویر و...)\n🎮 رقابت و جوایز (دوئل علمی دو نفره، فروشگاه جوایز کلاسی، لیگ مطالعه هفته)\n🧠 کارگاه یادگیری (جعبه لایتنر هوشمند، تایمر پومودورو، تمرین مکالمه انگلیسی ویس‌به‌ویس، تصحیح انشا)\n🎯 ماموریت روز | 🌟 امتیاز من | 🏆 رتبه من | 📤 ارسال تکلیف | 📅 تاریخچه | 🏅 نشان‌ها | 🔥 استریک | 📈 نمودار | 🎂 تولد | 🖥 پنل من");
  });

  // ------------------- دکمه‌های معلم -------------------
  bot.hears("📋 لیست", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db);
    if (all.length === 0) return void (await ctx.reply("هنوز کسی ثبت‌نام نکرده."));
    let text = "📋 لیست:\n\n"; all.forEach((s, i) => text += `${i + 1}. ${s.name}: ${s.score} امتیاز\n`);
    await ctx.reply(text);
  });
  bot.hears("🏆 رتبه‌بندی", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db); const medals = ["🥇", "🥈", "🥉"];
    let text = "🏆 رتبه‌بندی:\n\n"; all.forEach((s, i) => text += `${i < 3 ? medals[i] : `${i + 1}.`} ${s.name}: ${s.score}\n`);
    await ctx.reply(text);
  });
  bot.hears("📅 تکالیف", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const hw = await getAllHomework(env.telegram_bot_db, 20);
    let text = "📅 تکالیف:\n\n"; hw.forEach((h) => text += `${h.score > 0 ? "✅" : h.feedback ? "💬" : "⏳"} ${toJalali(h.date)} — ${h.name} (ID: ${h.id})\n`);
    await ctx.reply(text);
  });
  bot.hears("📋 غایبین", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const absent = await getAbsentStudents(env.telegram_bot_db, new Date().toISOString().split("T")[0]);
    if (absent.length === 0) return void (await ctx.reply("🎉 امروز همه بودن!"));
    let text = `📋 غایبین امروز:\n\n`; absent.forEach((s, i) => text += `${i + 1}. ${s.name}\n`);
    await ctx.reply(text);
  });
  bot.hears("⏰ ددلاین‌ها", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const dl = await getAllDeadlines(env.telegram_bot_db);
    let text = "⏰ ددلاین‌ها:\n\n"; dl.forEach((d) => text += `• 🆔 ${d.id} — ${d.title} (${d.due_date})\n`);
    await ctx.reply(text);
  });
  bot.hears("📊 اکسل", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db);
    let csv = "\uFEFFرتبه,نام,پایه,امتیاز,سطح\n"; all.forEach((s, i) => csv += `${i + 1},${s.name},${s.grade},${s.score},${getLevelInfo(s.level).name}\n`);
    await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(csv), `emtiazat.csv`), { caption: "📊 اکسل" });
  });
  bot.hears("📈 نمودار", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db);
    await ctx.replyWithPhoto(buildClassChart(all), { caption: "📈 نمودار کلاس" });
  });
  bot.hears("🎁 برنده", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db); const top = all[0].score; const win = all.filter(s => s.score === top);
    let text = "🎉 برنده‌ها:\n\n"; win.forEach(s => text += `🏆 ${s.name} با ${s.score}\n`);
    let ann = "🎊 اعلام نتایج!\n\n"; all.slice(0, 3).forEach((s, i) => ann += `${["🥇", "🥈", "🥉"][i]} ${s.name}: ${s.score}\n`);
    for (const s of all) try { await bot.api.sendMessage(s.user_id, ann); } catch {}
    await ctx.reply(text + "\n✅ ارسال شد.");
  });
  bot.hears("🔥 استریک‌ها", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db);
    await ctx.replyWithPhoto(buildStreakChart(all), { caption: "🔥 استریک‌ها" });
  });
  bot.hears("🎂 تولدها", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db); const withB = all.filter(s => s.birthday);
    let text = "🎂 تولدها:\n\n"; withB.forEach(s => text += `• ${s.name}: ${formatJalaliBirthday(s.birthday)}${isBirthdayToday(s.birthday) ? " 🎉 امروز!" : ""}\n`);
    await ctx.reply(text);
  });
  bot.hears("📊 گزارش هفتگی", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply(await buildWeeklyReport(env.telegram_bot_db));
  });
  bot.hears("🎲 کوییز", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply("🎲 /quiz سوال | گزینه1 | گزینه2 | گزینه3 | گزینه4 | پاسخ");
  });

  // ========== 🤖 کوییز AI (تک سوال) ==========
  bot.hears("🤖 کوییز AI", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply("🤖 *کوییز با هوش مصنوعی (تک سوال)*\n\nموضوع یا متن درس رو بنویس:\n\nمثال: `/ai_quiz علوم فصل ۳`\n\n⏳ هوش مصنوعی سوال رو طراحی می‌کنه.", { parse_mode: "Markdown" });
  });

  bot.command("ai_quiz", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const topic = ctx.match?.trim() || "";
    if (!topic) return void (await ctx.reply("استفاده: /ai_quiz موضوع\nمثال: /ai_quiz علوم فصل ۳"));

    const waitMsg = await ctx.reply("🤖 در حال طراحی سوال...");
    let quiz: { question: string; options: string[]; correct: number } | string;
    try { quiz = await generateQuizWithAI(env, topic); } catch (e: any) { quiz = `خطای غیرمنتظره: ${e.message}`; }
    try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}

    if (typeof quiz === "string") return void (await ctx.reply(quiz));

    const quizId = await addQuiz(env.telegram_bot_db, quiz.question, quiz.options, quiz.correct, 5);

    let text = `🤖 *سوال تولید شده توسط AI*\n\n📝 موضوع: ${topic}\n\n❓ ${quiz.question}\n\n`;
    quiz.options.forEach((opt, i) => { text += `${i === quiz.correct - 1 ? "✅" : "⚪"} ${i + 1}. ${opt}\n`; });
    text += `\n💡 پاسخ درست: گزینه ${quiz.correct}\n\nآیا این سوال رو تایید می‌کنی؟`;

    const kb = new InlineKeyboard().text("✅ تایید و ارسال", `approve_ai_${quizId}`).row().text("❌ لغو", `reject_ai_${quizId}`);
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  });

  // ========== 🚀 کوییز چندتایی AI (با امتیاز سفارشی) ==========
  bot.hears("📝 کوییز چندتایی", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply(
      "🚀 *ساخت چند سوال با هوش مصنوعی*\n\n" +
      "فرمت: `/multi_quiz تعداد | امتیاز هر سوال | موضوع`\n\n" +
      "مثال‌ها:\n" +
      "`/multi_quiz 5 | 10 | کسرها در ریاضی چهارم`\n" +
      "`/multi_quiz 10 | 5 | جمع و تفریق اعداد سه رقمی`\n\n" +
      "⏳ هوش مصنوعی سوالات رو طراحی می‌کنه.",
      { parse_mode: "Markdown" }
    );
  });

  bot.command("multi_quiz", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const input = ctx.match?.trim() || "";
    const parts = input.split("|").map(s => s.trim());
    
    if (parts.length !== 3) {
      return void (await ctx.reply("❌ فرمت درست نیست.\n\nاستفاده: `/multi_quiz تعداد | امتیاز | موضوع`\nمثال: `/multi_quiz 5 | 10 | کسرها در ریاضی چهارم`", { parse_mode: "Markdown" }));
    }

    const count = parseInt(parts[0]);
    const points = parseInt(parts[1]);
    const topic = parts[2];

    if (isNaN(count) || count < 1 || count > 20) return void (await ctx.reply("❌ تعداد باید بین ۱ تا ۲۰ باشد."));
    if (isNaN(points) || points < 1 || points > 100) return void (await ctx.reply("❌ امتیاز باید بین ۱ تا ۱۰۰ باشد."));
    if (!topic) return void (await ctx.reply("❌ موضوع را وارد کنید."));

    const waitMsg = await ctx.reply(`🤖 در حال طراحی ${count} سوال درباره "${topic}"...\n\n⏳ این ممکنه چند ثانیه طول بکشه.`);

    let quizzes: { question: string; options: string[]; correct: number }[] | string;
    try { quizzes = await generateMultipleQuizzesWithAI(env, topic, count); } catch (e: any) { quizzes = `خطای غیرمنتظره: ${e.message}`; }
    try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}

    if (typeof quizzes === "string") return void (await ctx.reply(quizzes));
    if (quizzes.length === 0) return void (await ctx.reply("❌ هیچ سوالی تولید نشد. لطفاً دوباره تلاش کن."));

    const quizIds: number[] = [];
    for (const q of quizzes) {
      const id = await addQuiz(env.telegram_bot_db, q.question, q.options, q.correct, points);
      quizIds.push(id);
    }

    let text = `🚀 *${quizzes.length} سوال تولید شده درباره:* ${topic}\n💰 *امتیاز هر سوال:* ${points}\n\n`;
    quizzes.forEach((q, i) => {
      text += `📝 *سوال ${i + 1}:*\n❓ ${q.question}\n`;
      q.options.forEach((opt, j) => { text += `${j === q.correct - 1 ? "✅" : "⚪"} ${j + 1}. ${opt}\n`; });
      text += `💡 پاسخ: ${q.correct}\n\n`;
    });

    if (text.length > 4000) text = text.substring(0, 4000) + "\n\n...(بقیه سوالات)";

    const kb = new InlineKeyboard()
      .text(`✅ تایید و ارسال همه ${quizzes.length} سوال`, `approve_multi_${quizIds.join(",")}`).row()
      .text("❌ لغو همه", `reject_multi_${quizIds.join(",")}`);

    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
  });

  // ========== 📄 کوییز هوشمند از روی فایل PDF، عکس کتاب یا متن درس ==========
  const startSourceQuizWizard = async (ctx: any) => {
    waitingBroadcast[TEACHER_ID] = false;
    await deleteBotState(env.telegram_bot_db, "teacher_mission_score");
    await setBotState(env.telegram_bot_db, "teacher_pdf_quiz", { step: "await_source" });
    await ctx.reply(
      "📄 ساخت کوییز هوشمند از PDF، عکس درس یا متن\n\n" +
      "لطفاً یکی از موارد زیر را همین‌جا بفرستید:\n" +
      "1️⃣ فایل PDF کتاب درسی یا جزوه (حتی PDF اسکن‌شده!)\n" +
      "2️⃣ عکس از صفحه کتاب یا جزوه\n" +
      "3️⃣ یا متن درس را کپی و ارسال کنید\n\n" +
      "💡 نکته برای فایل‌های PDF چندصفحه‌ای:\n" +
      "اگر می‌خواهید فقط از صفحات خاصی سوال طرح شود، شماره صفحات را در کپشن فایل PDF بنویسید (مثلاً: 5-8 یا ۵ تا ۸).\n\n" +
      "(برای انصراف /cancel بزنید)"
    );
  };

  bot.hears("📄 کوییز از PDF/متن", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await startSourceQuizWizard(ctx);
  });

  bot.command(["text_quiz", "pdf_quiz"], async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const inlineText = ctx.match?.trim() || "";
    if (!inlineText) {
      await startSourceQuizWizard(ctx);
      return;
    }
    if (inlineText.length < 40) {
      return void (await ctx.reply("⚠️ متن درس خیلی کوتاه است. لطفاً حداقل یک پاراگراف از متن درس را بفرستید یا دستور /text_quiz را خالی بزنید و فایل PDF/عکس بفرستید."));
    }
    await setBotState(env.telegram_bot_db, "teacher_pdf_quiz", {
      step: "pick_params",
      sourceText: inlineText.slice(0, 24000),
      sourceInfo: `متن ارسالی (${inlineText.length} کاراکتر)`,
    });
    const previewSnippet = inlineText.slice(0, 180).replace(/\s+/g, " ");
    await ctx.reply(
      `✅ متن درس دریافت شد (${inlineText.length} کاراکتر).\n🔍 پیش‌نمایش: «${previewSnippet}...»\n\n📊 چند سوال و با چه امتیازی طراحی کنم؟`,
      { reply_markup: buildSourceQuizCountKeyboard() }
    );
  });

  // ------------------- سایر دکمه‌های معلم -------------------
  bot.hears("🎰 قرعه‌کشی", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db);
    const winner = all[Math.floor(Math.random() * all.length)];
    if (!winner) return void (await ctx.reply("کسی نیست."));
    const upd = await updateScore(env.telegram_bot_db, winner.user_id, 5);
    for (const s of all) try { await bot.api.sendMessage(s.user_id, `🎰 قرعه‌کشی!\n🏆 برنده: ${winner.name}\n🎁 +5 امتیاز`); } catch {}
    await ctx.reply(`🎰 برنده: ${winner.name} (+5)`);
  });
  bot.hears("🏅 سطح‌ها", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const all = await getAllStudents(env.telegram_bot_db);
    let text = "🏅 سطح‌ها:\n\n"; LEVELS.forEach((l) => text += `${l.name} (${l.minScore}+): ${all.filter(s => s.level === l.level).length} نفر\n`);
    await ctx.reply(text);
  });
  bot.hears("💡 انگیزشی", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply("💡 /motivate متن پیام");
  });
  bot.hears("📣 ارسال همگانی", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply("📢 محتوای خود را بفرستید (متن، عکس، ویدیو...):\nبرای لغو /cancel");
    waitingBroadcast[TEACHER_ID] = true;
  });
  bot.hears("📢 اعلان", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply("📢 /announce متن پیام");
  });
  bot.hears("♻️ ریست", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await resetScores(env.telegram_bot_db);
    await ctx.reply("✅ صفر شد.");
  });

  // ------------------- دستورات متنی -------------------
  bot.command("broadcast", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    await ctx.reply("📢 محتوا را بفرستید:\nبرای لغو /cancel");
    waitingBroadcast[TEACHER_ID] = true;
  });
  bot.command("cancel", async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    waitingAiQuestion[uid] = false;
    await deleteBotState(env.telegram_bot_db, `user_mode_${uid}`);
    await deleteBotState(env.telegram_bot_db, `lab_proof_wait_${uid}`);
    if (uid === TEACHER_ID) {
      waitingBroadcast[TEACHER_ID] = false;
      await deleteBotState(env.telegram_bot_db, "teacher_pdf_quiz");
      await deleteBotState(env.telegram_bot_db, "teacher_mission_score");
      await deleteBotState(env.telegram_bot_db, "teacher_lab_score");
    } else {
      await deleteBotState(env.telegram_bot_db, `mission_wait_${uid}`);
    }
    (globalThis as any).waitingBirthday = (globalThis as any).waitingBirthday || {};
    delete (globalThis as any).waitingBirthday[uid];
    await ctx.reply("✅ عملیات فعلی لغو شد.");
  });
  bot.command("report", async (ctx) => { if (ctx.from?.id !== TEACHER_ID) return; await ctx.reply(await buildWeeklyReport(env.telegram_bot_db)); });
  bot.command("motivate", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const msg = ctx.match?.trim() || getRandomMotivation(); const all = await getAllStudents(env.telegram_bot_db);
    for (const s of all) try { await bot.api.sendMessage(s.user_id, `💡 ${msg}`); } catch {}
    await ctx.reply(`✅ ارسال شد.`);
  });
  bot.command("parent", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const p = ctx.match?.trim().split(" ") || []; if (p.length < 2) return void (await ctx.reply("/parent نام آیدی_عدد"));
    const id = parseInt(p[p.length - 1]), name = p.slice(0, -1).join(" ");
    const st = await getStudentByName(env.telegram_bot_db, name); if (!st) return void (await ctx.reply("پیدا نشد."));
    await setParent(env.telegram_bot_db, st.user_id, id); await ctx.reply(`✅ ثبت شد.`);
  });
  bot.command("send_parent", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const name = ctx.match?.trim() || ""; const st = await getStudentByName(env.telegram_bot_db, name);
    if (!st || !st.parent_chat_id) return void (await ctx.reply("پیدا نشد یا والدین ثبت نشده."));
    await bot.api.sendMessage(st.parent_chat_id, `📊 گزارش ${st.name}:\n\nامتیاز: ${st.score}\nسطح: ${getLevelInfo(st.level).name}\nاستریک: ${st.streak} روز`);
    await ctx.reply(`✅ ارسال شد.`);
  });
  bot.command("quiz", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const p = ctx.match?.trim().split("|").map(s => s.trim()) || []; if (p.length !== 6) return void (await ctx.reply("فرمت: سوال | گزینه1 | گزینه2 | گزینه3 | گزینه4 | پاسخ"));
    const id = await addQuiz(env.telegram_bot_db, p[0], [p[1], p[2], p[3], p[4]], parseInt(p[5]), 5); const all = await getAllStudents(env.telegram_bot_db);
    for (const s of all) {
      const kb = new InlineKeyboard().text(`1️⃣ ${p[1]}`, `quiz_${id}_1`).row().text(`2️⃣ ${p[2]}`, `quiz_${id}_2`).row().text(`3️⃣ ${p[3]}`, `quiz_${id}_3`).row().text(`4️⃣ ${p[4]}`, `quiz_${id}_4`);
      try { await bot.api.sendMessage(s.user_id, `🎲 کوییز:\n\n❓ ${p[0]}\n\n⏱ +5 امتیاز`, { reply_markup: kb }); } catch {}
    }
    await ctx.reply(`✅ کوییز ${id} ساخته شد.`);
  });
  bot.command("quiz_result", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const q = await getLatestQuiz(env.telegram_bot_db); if (!q) return void (await ctx.reply("کوییز نیست."));
    const res = await getQuizResults(env.telegram_bot_db, q.id); const opts = JSON.parse(q.options);
    let text = `📊 نتایج #${q.id}\n❓ ${q.question}\n✅ ${opts[q.correct - 1]}\n\n🏆 درست‌ها:\n`;
    res.filter(r => r.is_correct).forEach((r, i) => text += `${i + 1}. ${r.name}\n`);
    await ctx.reply(text);
  });
  bot.command("add", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const p = ctx.match?.trim().split(" ") || []; const amt = parseInt(p[p.length - 1]), name = p.slice(0, -1).join(" ");
    if (isNaN(amt)) return void (await ctx.reply("عدد وارد کن.")); const st = await getStudentByName(env.telegram_bot_db, name);
    if (!st) return void (await ctx.reply("پیدا نشد.")); const up = await updateScore(env.telegram_bot_db, st.user_id, amt);
    await ctx.reply(`✅ ${name}: ${up?.score} امتیاز.`); try { await bot.api.sendMessage(st.user_id, `🎉 +${amt} امتیاز! مجموع: ${up?.score}`); } catch {}
  });
  bot.command("remove", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const p = ctx.match?.trim().split(" ") || []; const amt = parseInt(p[p.length - 1]), name = p.slice(0, -1).join(" ");
    if (isNaN(amt)) return void (await ctx.reply("عدد وارد کن.")); const st = await getStudentByName(env.telegram_bot_db, name);
    if (!st) return void (await ctx.reply("پیدا نشد.")); const up = await updateScore(env.telegram_bot_db, st.user_id, -amt);
    await ctx.reply(`✅ ${name}: ${up?.score} امتیاز.`);
  });
  bot.command("grade", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const p = ctx.match?.trim().split(" ") || []; if (p.length < 2) return void (await ctx.reply("/grade ID نمره بازخورد"));
    const id = parseInt(p[0]); let score = parseInt(p[1]); if (isNaN(score)) score = 0;
    const fb = p.slice(2).join(" "); const hw = await getHomeworkById(env.telegram_bot_db, id);
    if (!hw) return void (await ctx.reply("تکلیف پیدا نشد.")); await setHomeworkFeedback(env.telegram_bot_db, id, score, fb);
    await ctx.reply(`✅ ثبت شد.`); try { await bot.api.sendMessage(hw.user_id, `📝 نمره: ${score}\n💬 ${fb}`); } catch {}
  });
  bot.command("deadline", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const m = ctx.match?.trim().split("|") || []; if (m.length !== 2) return void (await ctx.reply("/deadline عنوان | تاریخ"));
    const [title, date] = m.map(s => s.trim()); const id = await addDeadline(env.telegram_bot_db, title, date); const all = await getAllStudents(env.telegram_bot_db);
    for (const s of all) try { await bot.api.sendMessage(s.user_id, `⏰ ددلاین:\n📝 ${title}\n📅 ${date}`); } catch {}
    await ctx.reply(`✅ ثبت شد.`);
  });
  bot.command("del-deadline", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const id = parseInt(ctx.match?.trim() || ""); if (isNaN(id)) return void (await ctx.reply("/del-deadline ID"));
    await deleteDeadline(env.telegram_bot_db, id); await ctx.reply("✅ حذف شد.");
  });
  bot.command("announce", async (ctx) => {
    if (ctx.from?.id !== TEACHER_ID) return;
    const msg = ctx.match?.trim(); if (!msg) return void (await ctx.reply("/announce متن"));
    const all = await getAllStudents(env.telegram_bot_db); for (const s of all) try { await bot.api.sendMessage(s.user_id, `📢 اعلان:\n${msg}`); } catch {}
    await ctx.reply(`✅ ارسال شد.`);
  });

  // ------------------- Callback -------------------
  bot.on("callback_query:data", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return; const data = ctx.callbackQuery.data;

    // ========== ادامه یا پایان چت با AI ==========
    if (data.startsWith("ai_continue_yes_")) {
      const targetUserId = parseInt(data.replace("ai_continue_yes_", ""));
      if (userId !== targetUserId) return void (await ctx.answerCallbackQuery({ text: "این دکمه برای شما نیست." }));
      
      await ctx.answerCallbackQuery({ text: "✅" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("⏳ لطفاً سوالت رو بفرست:");
      waitingAiQuestion[userId] = true;
      return;
    }

    if (data.startsWith("ai_continue_no")) {
      waitingAiQuestion[userId] = false;
      await ctx.answerCallbackQuery({ text: "✅" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("👋 هر وقت سوالی داشتی، از منوی پایین «❓ پرسش و پاسخ» رو بزن.", {
        reply_markup: userId === TEACHER_ID ? teacherKeyboard() : studentKeyboard(),
      });
      return;
    }

    // ========== تایید/رد کوییز AI یا متنی ==========
    if (data.startsWith("approve_ai_") || data.startsWith("approve_quiz_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری." }));
      const qid = parseInt(data.replace(/approve_(ai|quiz)_/, ""));
      const quiz = await getQuizById(env.telegram_bot_db, qid);
      if (!quiz) return void (await ctx.answerCallbackQuery({ text: "❌ پیدا نشد." }));

      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("✅ تایید شد! در حال ارسال به کلاس...");

      const options = JSON.parse(quiz.options);
      const all = await getAllStudents(env.telegram_bot_db);
      let sent = 0;
      for (const s of all) {
        const kb = new InlineKeyboard();
        options.forEach((opt: string, i: number) => { kb.text(`${i + 1}. ${opt}`, `quiz_${qid}_${i + 1}`).row(); });
        try { await bot.api.sendMessage(s.user_id, `🎲 کوییز!\n\n❓ ${quiz.question}\n\n⏱ پاسخ درست: +${quiz.points} امتیاز`, { reply_markup: kb }); sent++; } catch {}
        await new Promise(r => setTimeout(r, 100));
      }
      await ctx.reply(`✅ به ${sent} نفر ارسال شد.`);
      return;
    }

    if (data.startsWith("approve_multi_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری." }));
      const quizIdStr = data.replace("approve_multi_", "");
      const quizIds = quizIdStr.split(",").map(Number);
      
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      const statusMsg = await ctx.reply(`⏳ در حال ارسال ${quizIds.length} سوال به کلاس... لطفاً صبر کن.`);

      const all = await getAllStudents(env.telegram_bot_db);
      let totalSent = 0;
      let totalMessages = 0;

      for (const s of all) {
        let sentToStudent = 0;
        for (const qid of quizIds) {
          const quiz = await getQuizById(env.telegram_bot_db, qid);
          if (!quiz) continue;
          
          const options = JSON.parse(quiz.options);
          const kb = new InlineKeyboard();
          options.forEach((opt: string, i: number) => { kb.text(`${i + 1}. ${opt}`, `quiz_${qid}_${i + 1}`).row(); });
          
          try { 
            await bot.api.sendMessage(s.user_id, `🎲 کوییز!\n\n❓ ${quiz.question}\n\n⏱ پاسخ درست: +${quiz.points} امتیاز`, { reply_markup: kb }); 
            sentToStudent++;
            totalMessages++;
          } catch (e) { console.error("خطا در ارسال به", s.name, e); }
          
          await new Promise(r => setTimeout(r, 300));
        }
        if (sentToStudent > 0) totalSent++;
        await new Promise(r => setTimeout(r, 500));
      }
      
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch {}
      await ctx.reply(`✅ ${totalMessages} پیام به ${totalSent} نفر ارسال شد.`);
      return;
    }

    if (data.startsWith("reject_ai_") || data.startsWith("reject_quiz_") || data.startsWith("reject_multi_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری." }));
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("❌ سوال(ها) لغو شد.");
      return;
    }

    if (data.startsWith("quiz_")) {
      const p = data.split("_"), qid = parseInt(p[1]), ans = parseInt(p[2]); const q = await getQuizById(env.telegram_bot_db, qid);
      if (!q) return void (await ctx.answerCallbackQuery({ text: "❌" }));
      if (await hasAnsweredQuiz(env.telegram_bot_db, qid, userId)) return void (await ctx.answerCallbackQuery({ text: "قبلاً جواب دادی!" }));
      const st = await getStudent(env.telegram_bot_db, userId); if (!st) return void (await ctx.answerCallbackQuery({ text: "ثبت‌نام کن." }));
      await answerQuiz(env.telegram_bot_db, qid, userId, st.name, ans, ans === q.correct ? 1 : 0);
      if (ans === q.correct) { await updateScore(env.telegram_bot_db, userId, q.points); await ctx.answerCallbackQuery({ text: "✅ درست!" }); await ctx.editMessageReplyMarkup({ reply_markup: undefined }); await ctx.reply(`🎉 درست بود! +${q.points}`); }
      else { await ctx.answerCallbackQuery({ text: "❌ اشتباه" }); await ctx.editMessageReplyMarkup({ reply_markup: undefined }); await ctx.reply(`❌ اشتباه بود.`); }
      return;
    }

    // ========== مدیریت ماموریت روز (دانش‌آموز و معلم) ==========
    if (data.startsWith("mission_cancel_")) {
      await deleteBotState(env.telegram_bot_db, `mission_wait_${userId}`);
      await ctx.answerCallbackQuery({ text: "لغو شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("✅ ارسال گزارش ماموریت لغو شد. هر وقت انجامش دادی دوباره روی «🎯 ماموریت روز» بزن.");
      return;
    }

    if (data.startsWith("mission_resubmit_")) {
      const mid = parseInt(data.replace("mission_resubmit_", ""), 10);
      await setBotState(env.telegram_bot_db, `mission_wait_${userId}`, { missionId: mid });
      await ctx.answerCallbackQuery({ text: "آماده دریافت گزارش" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("📤 لطفاً گزارش جدید یا تکمیلی ماموریتت (متن، عکس، ویس، ویدیو یا فایل) رو بفرست:\n(برای انصراف /cancel)");
      return;
    }

    if (data.startsWith("ms_ok_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const parts = data.split("_");
      const mid = parseInt(parts[2], 10);
      const pts = parseInt(parts[3], 10);
      const mission = await getMissionById(env.telegram_bot_db, mid);
      if (!mission) return void (await ctx.answerCallbackQuery({ text: "❌ ماموریت پیدا نشد." }));
      if (mission.done === 1) {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return void (await ctx.answerCallbackQuery({ text: "قبلاً تایید شده است." }));
      }

      await setMissionStatus(env.telegram_bot_db, mid, 1);
      const up = await updateScore(env.telegram_bot_db, mission.user_id, pts);
      const newBadges = await checkAndAwardBadges(env.telegram_bot_db, mission.user_id);

      await ctx.answerCallbackQuery({ text: `✅ +${pts} امتیاز ثبت شد` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`✅ ماموریت «${mission.name}» تایید شد و +${pts} امتیاز به او تعلق گرفت (مجموع: ${up?.score}).`);

      try {
        let stMsg = `🎉 تبریک ${mission.name} عزیز!\n✅ معلم ماموریت امروزت (${mission.mission}) رو تایید کرد و +${pts} امتیاز گرفتی! 🌟\n📊 مجموع امتیازت: ${up?.score}`;
        if (newBadges.length > 0) stMsg += `\n\n🏅 نشان جدید باز شد:\n${newBadges.map((b) => `• ${b}`).join("\n")}`;
        await bot.api.sendMessage(mission.user_id, stMsg);
      } catch {}
      return;
    }

    if (data.startsWith("ms_custom_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const mid = parseInt(data.replace("ms_custom_", ""), 10);
      const mission = await getMissionById(env.telegram_bot_db, mid);
      if (!mission) return void (await ctx.answerCallbackQuery({ text: "❌ ماموریت پیدا نشد." }));
      if (mission.done === 1) {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return void (await ctx.answerCallbackQuery({ text: "قبلاً تایید شده است." }));
      }

      await setBotState(env.telegram_bot_db, "teacher_mission_score", { missionId: mid });
      await ctx.answerCallbackQuery({ text: "✏️ ورود امتیاز دلخواه" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`✏️ لطفاً عدد امتیاز دلخواه برای ماموریت «${mission.name}» را بفرستید (مثلاً: 8):\n(برای لغو /cancel بزنید)`);
      return;
    }

    if (data.startsWith("ms_rej_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const mid = parseInt(data.replace("ms_rej_", ""), 10);
      const mission = await getMissionById(env.telegram_bot_db, mid);
      if (mission) {
        await setMissionStatus(env.telegram_bot_db, mid, 0);
        try {
          await bot.api.sendMessage(
            mission.user_id,
            `⚠️ گزارش ماموریت امروزت (${mission.mission}) توسط معلم تایید نشد.\n💡 لطفاً فعالیت رو کامل‌تر انجام بده و دوباره از بخش «🎯 ماموریت روز» بفرست!`
          );
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: "❌ رد شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`❌ گزارش ماموریت «${mission?.name || ""}» رد شد.`);
      return;
    }

    // ========== انتخاب تعداد سوال و امتیاز برای کوییز PDF / متن ==========
    if (data.startsWith("srcq_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      if (data === "srcq_cancel") {
        await deleteBotState(env.telegram_bot_db, "teacher_pdf_quiz");
        await ctx.answerCallbackQuery({ text: "لغو شد" });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await ctx.reply("❌ ساخت کوییز از متن/PDF لغو شد.");
        return;
      }

      const stData = await getBotState<{ step: string; sourceText?: string; sourceInfo?: string }>(
        env.telegram_bot_db,
        "teacher_pdf_quiz"
      );
      if (!stData?.sourceText) {
        await ctx.answerCallbackQuery({ text: "متن درس منقضی شده" });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return void (await ctx.reply("⚠️ متن درس پیدا نشد. لطفاً دوباره فایل PDF یا متن درس را بفرستید."));
      }

      if (data === "srcq_custom") {
        await setBotState(env.telegram_bot_db, "teacher_pdf_quiz", {
          ...stData,
          step: "custom_params",
        });
        await ctx.answerCallbackQuery({ text: "✏️ تعداد و امتیاز دلخواه" });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await ctx.reply("✏️ لطفاً «تعداد سوال | امتیاز هر سوال» را بنویسید:\n\nمثال: 7 | 10\n(یعنی ۷ سوال چهارگزینه‌ای، هر سوال ۱۰ امتیاز)");
        return;
      }

      const parts = data.split("_");
      const qCount = parseInt(parts[1], 10);
      const qPoints = parseInt(parts[2], 10);
      await deleteBotState(env.telegram_bot_db, "teacher_pdf_quiz");
      await ctx.answerCallbackQuery({ text: `🤖 طراحی ${qCount} سوال...` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await createAndPreviewSourceQuizzes(
        ctx,
        env,
        bot,
        stData.sourceText,
        stData.sourceInfo || "متن درس",
        qCount,
        qPoints
      );
      return;
    }

    // ==================== ۱. دوئل علمی دو نفره (⚔️) ====================
    if (data === "hub_duel") {
      const me = await getStudent(env.telegram_bot_db, userId);
      if (!me?.name) return void (await ctx.answerCallbackQuery({ text: "ابتدا به عنوان دانش‌آموز ثبت‌نام کن." }));
      const classmates = (await getAllStudents(env.telegram_bot_db)).filter((s) => s.user_id !== userId);
      if (classmates.length === 0) {
        await ctx.answerCallbackQuery({ text: "هم‌کلاسی دیگری ثبت‌نام نکرده" });
        return void (await ctx.reply("⚠️ برای شروع دوئل علمی، حداقل یک هم‌کلاسی دیگر هم باید در ربات ثبت‌نام کرده باشد."));
      }
      const kb = new InlineKeyboard().text("🎲 انتخاب شانسی هم‌کلاسی", "duel_opp_0").row();
      classmates.slice(0, 12).forEach((s, idx) => {
        kb.text(`⚔️ ${s.name}`, `duel_opp_${s.user_id}`);
        if (idx % 2 === 1) kb.row();
      });
      await ctx.answerCallbackQuery({ text: "⚔️ انتخاب حریف" });
      await ctx.reply("⚔️ *دوئل علمی دو نفره*\n\nبا کدوم هم‌کلاسی‌ت می‌خوای وارد رقابت ۳ سوالی بشی؟\n🏆 جایزه برنده: **+۱۰ امتیاز** | مشارکت نفر دوم: **+۲ امتیاز**", {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }

    if (data.startsWith("duel_opp_")) {
      const me = await getStudent(env.telegram_bot_db, userId);
      if (!me?.name) return void (await ctx.answerCallbackQuery({ text: "ثبت‌نام کن" }));
      let oppId = parseInt(data.replace("duel_opp_", ""), 10);
      const classmates = (await getAllStudents(env.telegram_bot_db)).filter((s) => s.user_id !== userId);
      if (classmates.length === 0) return void (await ctx.answerCallbackQuery({ text: "حریفی پیدا نشد" }));
      if (oppId === 0) {
        oppId = classmates[Math.floor(Math.random() * classmates.length)].user_id;
      }
      const opp = await getStudent(env.telegram_bot_db, oppId);
      if (!opp) return void (await ctx.answerCallbackQuery({ text: "هم‌کلاسی پیدا نشد" }));

      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "duel_pick_topic", oppId });
      const kb = new InlineKeyboard()
        .text("🔬 علوم تجربی", `duel_top_sci_${oppId}`)
        .text("📐 ریاضی و هوش", `duel_top_math_${oppId}`).row()
        .text("📖 ادبیات فارسی", `duel_top_lit_${oppId}`)
        .text("🇬🇧 زبان انگلیسی", `duel_top_eng_${oppId}`).row()
        .text("🌍 اطلاعات عمومی", `duel_top_gen_${oppId}`)
        .text("✏️ موضوع دلخواه", `duel_top_custom_${oppId}`);

      await ctx.answerCallbackQuery({ text: `حریف: ${opp.name}` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`🎯 حریف انتخاب شد: *${opp.name}*\n\nحالا موضوع دوئل رو انتخاب کن:`, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }

    if (data.startsWith("duel_top_")) {
      const me = await getStudent(env.telegram_bot_db, userId);
      if (!me?.name) return void (await ctx.answerCallbackQuery({ text: "ثبت‌نام کن" }));
      const parts = data.split("_");
      const code = parts[2];
      const oppId = parseInt(parts[3], 10);
      const opp = await getStudent(env.telegram_bot_db, oppId);
      if (!opp) return void (await ctx.answerCallbackQuery({ text: "حریف پیدا نشد" }));

      if (code === "custom") {
        await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "duel_custom_topic", oppId });
        await ctx.answerCallbackQuery({ text: "✏️ موضوع دلخواه" });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await ctx.reply(`✏️ موضوع دلخواه دوئل با «${opp.name}» رو بنویس (مثلاً: منظومه شمسی، تاریخ ایران، کسرها):\n(برای لغو /cancel)`);
        return;
      }

      const topicMap: Record<string, string> = {
        sci: "علوم تجربی و طبیعت",
        math: "ریاضی و هوش محاسباتی",
        lit: "ادبیات فارسی و لغات",
        eng: "لغات و گرامر زبان انگلیسی مدرسه",
        gen: "اطلاعات عمومی و علمی",
      };
      const topic = topicMap[code] || "اطلاعات عمومی";
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await ctx.answerCallbackQuery({ text: "🤖 در حال ساخت سوالات دوئل..." });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      const waitMsg = await ctx.reply(`⚔️ در حال طراحی ۳ سوال دوئل در موضوع «${topic}»...`);

      const qList = await generateMultipleQuizzesWithAI(env, `${topic} مناسب پایه ${me.grade || "متوسطه"}`, 3);
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
      if (typeof qList === "string" || qList.length === 0) {
        return void (await ctx.reply("❌ خطا در ساخت سوالات دوئل. لطفاً دوباره امتحان کن."));
      }

      const shuffled = qList.map((q) => shuffleQuizOptions(q));
      const duelId = await createDuel(env.telegram_bot_db, userId, me.name, opp.user_id, opp.name, topic, shuffled);

      // ارسال دعوت‌نامه به حریف
      const invKb = new InlineKeyboard()
        .text("🔥 قبول دوئل و شروع!", `duel_acc_${duelId}`)
        .text("🏳️ انصراف", `duel_dec_${duelId}`);
      try {
        await bot.api.sendMessage(
          opp.user_id,
          `⚔️ *دعوت به دوئل علمی!*\n\nهم‌کلاسی‌ت *${me.name}* تو رو به یک رقابت ۳ سوالی در موضوع «*${topic}*» دعوت کرده!\n🏆 جایزه برنده: **+۱۰ امتیاز**`,
          { parse_mode: "Markdown", reply_markup: invKb }
        );
      } catch {}

      await ctx.reply(`✅ دعوت‌نامه دوئل برای «${opp.name}» ارسال شد!\n🚀 نوبت تو شروع شد — با دقت و سرعت جواب بده:`);
      await sendDuelQuestionToPlayer(bot, env.telegram_bot_db, duelId, userId);
      return;
    }

    if (data.startsWith("duel_acc_")) {
      const duelId = parseInt(data.replace("duel_acc_", ""), 10);
      const duel = await getDuelById(env.telegram_bot_db, duelId);
      if (!duel || duel.status !== "active") {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return void (await ctx.answerCallbackQuery({ text: "این دوئل منقضی یا تمام شده است." }));
      }
      if (userId !== duel.opponent_id) return void (await ctx.answerCallbackQuery({ text: "این دعوت برای شما نیست!" }));
      await ctx.answerCallbackQuery({ text: "🔥 شروع دوئل!" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await sendDuelQuestionToPlayer(bot, env.telegram_bot_db, duelId, userId);
      return;
    }

    if (data.startsWith("duel_dec_")) {
      const duelId = parseInt(data.replace("duel_dec_", ""), 10);
      const duel = await getDuelById(env.telegram_bot_db, duelId);
      if (duel && userId === duel.opponent_id && duel.status === "active") {
        await env.telegram_bot_db.prepare("UPDATE duels SET status = 'declined' WHERE id = ?").bind(duelId).run();
        if (duel.c_step > 0) await updateScore(env.telegram_bot_db, duel.challenger_id, 3);
        try {
          await bot.api.sendMessage(
            duel.challenger_id,
            `🏳️ «${duel.opponent_name}» فعلاً نتونست در دوئل شرکت کنه.${duel.c_step > 0 ? " به خاطر تلاشت +۳ امتیاز تشویقی گرفتی! 🌟" : ""}`
          );
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: "رد شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("🏳️ دعوت دوئل رد شد.");
      return;
    }

    if (data.startsWith("duel_ans_")) {
      const parts = data.split("_");
      const duelId = parseInt(parts[2], 10);
      const stepIdx = parseInt(parts[3], 10);
      const chosen = parseInt(parts[4], 10);
      const duel = await getDuelById(env.telegram_bot_db, duelId);
      if (!duel || duel.status !== "active") {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return void (await ctx.answerCallbackQuery({ text: "دوئل به پایان رسیده است." }));
      }

      const isChallenger = userId === duel.challenger_id;
      const isOpponent = userId === duel.opponent_id;
      if (!isChallenger && !isOpponent) return void (await ctx.answerCallbackQuery({ text: "شما عضو این دوئل نیستید!" }));

      const curStep = isChallenger ? duel.c_step : duel.o_step;
      if (stepIdx !== curStep) return void (await ctx.answerCallbackQuery({ text: "قبلاً جواب دادی!" }));

      const questions = JSON.parse(duel.questions_json) as { question: string; options: string[]; correct: number }[];
      const q = questions[stepIdx];
      const isOk = chosen === q.correct ? 1 : 0;
      const qStart = isChallenger ? duel.c_q_start : duel.o_q_start;
      const elapsed = qStart > 0 ? Math.min(Math.max(Date.now() - qStart, 300), 120000) : 10000;

      if (isChallenger) {
        await env.telegram_bot_db
          .prepare("UPDATE duels SET c_step = c_step + 1, c_correct = c_correct + ?, c_time_ms = c_time_ms + ? WHERE id = ?")
          .bind(isOk, elapsed, duelId)
          .run();
      } else {
        await env.telegram_bot_db
          .prepare("UPDATE duels SET o_step = o_step + 1, o_correct = o_correct + ?, o_time_ms = o_time_ms + ? WHERE id = ?")
          .bind(isOk, elapsed, duelId)
          .run();
      }

      await ctx.answerCallbackQuery({ text: isOk ? "✅ آفرین! درست بود" : "❌ اشتباه بود" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(
        isOk
          ? `✅ سوال ${stepIdx + 1}: درست جواب دادی! (${(elapsed / 1000).toFixed(1)} ثانیه)`
          : `❌ سوال ${stepIdx + 1}: اشتباه بود. پاسخ صحیح: «${q.options[q.correct - 1]}»`
      );

      if (stepIdx + 1 < questions.length) {
        await sendDuelQuestionToPlayer(bot, env.telegram_bot_db, duelId, userId);
      } else {
        const updatedDuel = await getDuelById(env.telegram_bot_db, duelId);
        if (updatedDuel && (updatedDuel.c_step < questions.length || updatedDuel.o_step < questions.length)) {
          await ctx.reply("👏 هر ۳ سوال رو جواب دادی! به‌محض این‌که حریفت هم جواب بده، نتیجه نهایی و جایزه اعلام می‌شه. ⏳");
        }
        await checkAndFinishDuel(bot, env.telegram_bot_db, duelId);
      }
      return;
    }

    // ==================== ۲. فروشگاه جوایز کلاسی (🛒 با تایید معلم) ====================
    if (data === "hub_shop") {
      const items = await getActiveShopItems(env.telegram_bot_db);
      const st = userId !== TEACHER_ID ? await getStudent(env.telegram_bot_db, userId) : null;
      const pendingCost = st ? await getPendingCostForStudent(env.telegram_bot_db, userId) : 0;

      let text = `🛒 *فروشگاه جوایز کلاسی*\n\n`;
      if (st) {
        text += `🌟 امتیاز فعلی تو: *${st.score}*${pendingCost > 0 ? ` (در انتظار تایید: ${pendingCost} امتیاز)` : ""}\n\n`;
      }
      if (items.length === 0) {
        text += "فعلاً جایزه‌ای در فروشگاه ثبت نشده است.";
        await ctx.answerCallbackQuery({ text: "فروشگاه خالی است" });
        return void (await ctx.reply(text, { parse_mode: "Markdown" }));
      }

      const kb = new InlineKeyboard();
      items.forEach((it) => {
        text += `${it.title} — 💰 *${it.cost} امتیاز*\n${it.description ? `└ _${it.description}_\n` : ""}\n`;
        if (userId !== TEACHER_ID) {
          kb.text(`🛍 خرید: ${it.title} (${it.cost})`, `shop_buy_${it.id}`).row();
        }
      });
      await ctx.answerCallbackQuery({ text: "🛒 فروشگاه جوایز" });
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: userId !== TEACHER_ID ? kb : undefined });
      return;
    }

    if (data.startsWith("shop_buy_")) {
      const st = await getStudent(env.telegram_bot_db, userId);
      if (!st?.name) return void (await ctx.answerCallbackQuery({ text: "ابتدا ثبت‌نام کن" }));
      const itemId = parseInt(data.replace("shop_buy_", ""), 10);
      const item = await getShopItemById(env.telegram_bot_db, itemId);
      if (!item || !item.active) return void (await ctx.answerCallbackQuery({ text: "این جایزه دیگر موجود نیست." }));

      const pendingCost = await getPendingCostForStudent(env.telegram_bot_db, userId);
      const available = st.score - pendingCost;
      if (available < item.cost) {
        return void (await ctx.answerCallbackQuery({
          text: `امتیاز کافی نداری! ${item.cost - available} امتیاز دیگه لازمه 💪`,
          show_alert: true,
        }));
      }

      const orderId = await createShopOrder(env.telegram_bot_db, userId, st.name, item);
      const tKb = new InlineKeyboard()
        .text(`✅ تایید و کسر ${item.cost} امتیاز`, `shop_ok_${orderId}`)
        .text("❌ رد درخواست", `shop_rej_${orderId}`);

      try {
        await bot.api.sendMessage(
          TEACHER_ID,
          `🛒 *درخواست خرید جایزه از فروشگاه*\n\n` +
          `👤 دانش‌آموز: ${st.name} (امتیاز فعلی: ${st.score})\n` +
          `🎁 جایزه درخواستی: ${item.title}\n` +
          `💰 هزینه: ${item.cost} امتیاز\n\n` +
          `👇 در صورت تایید، امتیاز کسر و کارت جایزه برای دانش‌آموز صادر می‌شود:`,
          { parse_mode: "Markdown", reply_markup: tKb }
        );
      } catch {}

      await ctx.answerCallbackQuery({ text: "✅ درخواست برای معلم ارسال شد!" });
      await ctx.reply(`✅ درخواست خرید «${item.title}» برای معلم ارسال شد!\n⏳ پس از تایید معلم، کارت جایزه‌ت صادر می‌شه. 🌟`);
      return;
    }

    if (data.startsWith("shop_ok_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const orderId = parseInt(data.replace("shop_ok_", ""), 10);
      const order = await getShopOrderById(env.telegram_bot_db, orderId);
      if (!order || order.status !== "pending") {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return void (await ctx.answerCallbackQuery({ text: "قبلاً بررسی شده است." }));
      }
      const st = await getStudent(env.telegram_bot_db, order.user_id);
      if (!st || st.score < order.cost) {
        await setShopOrderStatus(env.telegram_bot_db, orderId, "rejected");
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return void (await ctx.reply("❌ امتیاز فعلی دانش‌آموز کمتر از هزینه جایزه است؛ درخواست لغو شد."));
      }

      await setShopOrderStatus(env.telegram_bot_db, orderId, "approved");
      const up = await updateScore(env.telegram_bot_db, order.user_id, -order.cost);
      await ctx.answerCallbackQuery({ text: "✅ جایزه تایید شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`✅ جایزه «${order.item_title}» برای «${order.student_name}» تایید شد و ${order.cost} امتیاز کسر گردید (مانده: ${up?.score}).`);

      try {
        await bot.api.sendMessage(
          order.user_id,
          `🎉🎁 *کارت جایزه تایید شد!*\n\n` +
          `👤 دانش‌آموز: ${order.student_name}\n` +
          `🏆 جایزه: *${order.item_title}*\n` +
          `💰 امتیاز استفاده‌شده: ${order.cost} (مانده امتیازت: ${up?.score})\n` +
          `📅 تاریخ صدور: ${toJalali(new Date().toISOString())}\n\n` +
          `✅ معلم عزیز جایزه‌ت رو تایید کرد؛ مبارکت باشه قهرمان! 🌟`,
          { parse_mode: "Markdown" }
        );
      } catch {}
      return;
    }

    if (data.startsWith("shop_rej_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const orderId = parseInt(data.replace("shop_rej_", ""), 10);
      const order = await getShopOrderById(env.telegram_bot_db, orderId);
      if (order && order.status === "pending") {
        await setShopOrderStatus(env.telegram_bot_db, orderId, "rejected");
        try {
          await bot.api.sendMessage(
            order.user_id,
            `ℹ️ درخواست خرید جایزه «${order.item_title}» فعلاً توسط معلم تایید نشد (هیچ امتیازی ازت کم نشد!).`
          );
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: "❌ رد شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`❌ درخواست جایزه رد شد.`);
      return;
    }

    if (data === "thub_shop_admin") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const items = await getActiveShopItems(env.telegram_bot_db);
      const pend = await getPendingShopOrders(env.telegram_bot_db);
      let txt = `🛒 *مدیریت فروشگاه جوایز کلاس*\n⏳ سفارش‌های در انتظار تایید: ${pend.length}\n\n📋 جوایز فعال فعلی:\n`;
      const kb = new InlineKeyboard().text("➕ افزودن جایزه جدید", "shop_add_btn").row();
      items.forEach((it) => {
        txt += `• ${it.title} — ${it.cost} امتیاز\n`;
        kb.text(`🗑 حذف: ${it.title}`, `shop_del_${it.id}`).row();
      });
      kb.text("🔙 بازگشت", "thub_main");
      await ctx.answerCallbackQuery({ text: "مدیریت فروشگاه" });
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data === "shop_add_btn") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      await setBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`, { mode: "shop_add_item" });
      await ctx.answerCallbackQuery({ text: "افزودن جایزه" });
      await ctx.reply("➕ لطفاً مشخصات جایزه جدید را با فرمت زیر بفرستید:\n\n`عنوان جایزه | امتیاز لازم | توضیح کوتاه`\n\nمثال:\n`🌟 سرگروه شدن در پروژه هفته | 45 | انتخاب اعضای گروه توسط خود دانش‌آموز`\n(برای لغو /cancel)", { parse_mode: "Markdown" });
      return;
    }

    if (data.startsWith("shop_del_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const id = parseInt(data.replace("shop_del_", ""), 10);
      await deleteShopItem(env.telegram_bot_db, id);
      await ctx.answerCallbackQuery({ text: "🗑 حذف شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("✅ جایزه از فروشگاه حذف شد.");
      return;
    }

    // ==================== ۳. لیگ مطالعه و تایمر پومودورو (⏱ با تایید مستندات توسط معلم) ====================
    if (data === "hub_study_league") {
      const board = await getWeeklyStudyLeaderboard(env.telegram_bot_db);
      let txt = `🏆 *جدول لیگ مطالعه تاییدشده ۷ روز اخیر کلاس*\n\n`;
      if (board.length === 0) {
        txt += "هنوز مطالعه تاییدشده‌ای در این هفته ثبت نشده! اولین نفری باش که با تایمر مطالعه درس می‌خونه و خلاصه‌ش رو برای معلم می‌فرسته 🚀";
      } else {
        const medals = ["🥇", "🥈", "🥉"];
        board.forEach((r, idx) => {
          txt += `${idx < 3 ? medals[idx] : `${idx + 1}.`} *${r.student_name}* — ⏱ ${r.total_min} دقیقه (${r.sessions} نوبت)\n`;
        });
      }
      const kb = new InlineKeyboard().text("⏱ شروع تایمر مطالعه من", "hub_pomo");
      await ctx.answerCallbackQuery({ text: "🏆 لیگ مطالعه" });
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data === "hub_pomo") {
      const activeTimer = await getBotState<{ startedAt: number; targetMin: number }>(
        env.telegram_bot_db,
        `pomo_timer_${userId}`
      );
      if (activeTimer) {
        const elapsedMin = Math.floor((Date.now() - activeTimer.startedAt) / 60000);
        const rem = Math.max(0, activeTimer.targetMin - elapsedMin);
        const kb = new InlineKeyboard()
          .text("📝 پایان مطالعه و ارسال خلاصه به معلم", "pomo_done").row()
          .text("❌ لغو تایمر", "pomo_stop");
        await ctx.answerCallbackQuery({ text: "تایمر فعال است" });
        return void (await ctx.reply(
          `⏱ *تایمر مطالعه تو در حال کاره!*\n\n• زمان سپری‌شده: ${elapsedMin} دقیقه از ${activeTimer.targetMin} دقیقه\n• زمان باقی‌مانده: حدود ${rem} دقیقه\n\n💪 بعد از اتمام مطالعه روی دکمه زیر بزن و خلاصه مطالبی که خوندی رو برای معلم بفرست تا امتیاز بگیری:`,
          { parse_mode: "Markdown", reply_markup: kb }
        ));
      }

      const kb = new InlineKeyboard()
        .text("🍅 ۲۰ دقیقه مطالعه متمرکز", "pomo_go_20").row()
        .text("📚 ۴۵ دقیقه مطالعه عمیق", "pomo_go_45").row()
        .text("🏆 مشاهده لیگ مطالعه هفته", "hub_study_league");
      await ctx.answerCallbackQuery({ text: "⏱ تایمر مطالعه" });
      await ctx.reply(
        "⏱ *تایمر تمرکز و مطالعه (پومودورو)*\n\n" +
        "۱. زمان مطالعه رو انتخاب کن و گوشی رو کنار بذار 📵\n" +
        "۲. بعد از پایان حداقل ۲۰ دقیقه، خلاصه چیزی که مطالعه کردی (متن، ویس یا عکس خلاصه‌نویسی) رو بفرست 📝\n" +
        "۳. پس از **تایید معلم**، هم **امتیاز** می‌گیری و هم زمان مطالعه‌ت در **لیگ هفتگی کلاس** ثبت می‌شه! 🌟",
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("pomo_go_")) {
      const targetMin = parseInt(data.replace("pomo_go_", ""), 10) || 20;
      await setBotState(env.telegram_bot_db, `pomo_timer_${userId}`, {
        startedAt: Date.now(),
        targetMin,
      });
      const kb = new InlineKeyboard()
        .text("📝 تمام شد! ارسال خلاصه مطالعه به معلم", "pomo_done").row()
        .text("❌ انصراف از تایمر", "pomo_stop");
      await ctx.answerCallbackQuery({ text: `🍅 تایمر ${targetMin} دقیقه‌ای شروع شد!` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(
        `🚀 *تایمر مطالعه ${targetMin} دقیقه‌ای شروع شد!*\n🕐 ساعت شروع: ${new Date().toLocaleTimeString("fa-IR")}\n\n` +
        `📵 حالا گوشی رو کنار بذار و با تمرکز کامل مطالعه کن.\n` +
        `بعد از اتمام ${targetMin} دقیقه، روی دکمه زیر بزن تا **خلاصه چیزی که یاد گرفتی** رو برای معلم بفرستی و پس از تایید معلم امتیاز بگیری! 💪`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data === "pomo_done") {
      const activeTimer = await getBotState<{ startedAt: number; targetMin: number }>(
        env.telegram_bot_db,
        `pomo_timer_${userId}`
      );
      if (!activeTimer) return void (await ctx.answerCallbackQuery({ text: "تایمر فعالی نداری!" }));
      const elapsedMin = Math.floor((Date.now() - activeTimer.startedAt) / 60000);
      const minRequired = activeTimer.targetMin <= 20 ? 20 : activeTimer.targetMin - 5;
      if (elapsedMin < minRequired) {
        return void (await ctx.answerCallbackQuery({
          text: `⏳ هنوز زوده قهرمان! ${minRequired - elapsedMin} دقیقه دیگه به مطالعه‌ت ادامه بده، بعد خلاصه‌ش رو بفرست 💪`,
          show_alert: true,
        }));
      }

      const recordedMin = Math.min(Math.max(elapsedMin, activeTimer.targetMin), 120);
      await deleteBotState(env.telegram_bot_db, `pomo_timer_${userId}`);
      await setBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`, {
        category: "study",
        title: `⏱ مطالعه ${recordedMin} دقیقه‌ای`,
        minutes: recordedMin,
        metaNote: `مدت زمان ثبت‌شده در تایمر: ${recordedMin} دقیقه`,
      } as LabProofWaitState);

      const cancelKb = new InlineKeyboard().text("❌ انصراف از ارسال مستندات", "lab_proof_cancel");
      await ctx.answerCallbackQuery({ text: "📝 حالا خلاصه مطالعه‌ت رو بفرست!" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(
        `👏 *آفرین! ${recordedMin} دقیقه مطالعه متمرکزت به پایان رسید!*\n\n` +
        `📤 برای دریافت امتیاز و ثبت در لیگ مطالعه کلاس، همین الان **خلاصه مطالبی که مطالعه کردی** را به یکی از روش‌های زیر بفرست تا برای معلم ارسال شود:\n` +
        `• ✍️ نوشتن خلاصه نکات مهمی که یاد گرفتی\n` +
        `• 🎤 ویس توضیح شفاهی مبحث مطالعه‌شده\n` +
        `• 📸 عکس از خلاصه‌نویسی یا تمرین حل‌شده\n\n` +
        `⏳ پس از بررسی و تایید معلم، امتیازت ثبت می‌شه! 🌟`,
        { parse_mode: "Markdown", reply_markup: cancelKb }
      );
      return;
    }

    if (data === "pomo_stop") {
      await deleteBotState(env.telegram_bot_db, `pomo_timer_${userId}`);
      await ctx.answerCallbackQuery({ text: "تایمر لغو شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("⏹ تایمر مطالعه لغو شد.");
      return;
    }

    // ==================== ۴. جعبه لایتنر و فلش‌کارت هوشمند (🃏 با تایید مستندات معلم) ====================
    if (data === "hub_leitner") {
      const stats = await getFlashcardStats(env.telegram_bot_db, userId);
      const kb = new InlineKeyboard()
        .text(`📖 شروع مرور امروز (${stats.due} کارت)`, "fc_review").row()
        .text("🤖 ساخت خودکار ۵ کارت با هوش مصنوعی", "fc_ai_btn").row()
        .text("➕ افزودن دستی فلش‌کارت", "fc_manual_btn").row()
        .text("📤 ارسال خلاصه مرور به معلم (دریافت امتیاز)", "lab_req_leitner");
      await ctx.answerCallbackQuery({ text: "🃏 جعبه لایتنر" });
      await ctx.reply(
        `🃏 *جعبه لایتنر ۵ خانه‌ای تو*\n\n` +
        `• کل کارت‌ها: *${stats.total}*\n` +
        `• آماده مرور امروز: *${stats.due}*\n` +
        `• تثبیت‌شده در حافظه بلندمدت (خانه ۴ و ۵): *${stats.mastered}*\n\n` +
        `💡 بعد از مرور کارت‌هات می‌تونی خلاصه نکات مرور‌شده رو برای معلم بفرستی تا پس از تایید معلم امتیاز بگیری!`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data === "fc_review") {
      const card = await getDueFlashcard(env.telegram_bot_db, userId);
      if (!card) {
        await ctx.answerCallbackQuery({ text: "کارت سررسیدی نداری!" });
        const kb = new InlineKeyboard()
          .text("📤 ارسال خلاصه مرور به معلم (امتیاز)", "lab_req_leitner").row()
          .text("🤖 ساخت ۵ کارت جدید با هوش مصنوعی", "fc_ai_btn");
        return void (await ctx.reply("🎉 آفرین! تمام کارت‌های امروزت رو مرور کردی.\nاگر می‌خوای بابت مرورت امتیاز بگیری، خلاصه نکات یادگرفته‌شده رو برای معلم بفرست:", { reply_markup: kb }));
      }
      const kb = new InlineKeyboard().text("👁 نمایش پشت کارت (پاسخ)", `fc_flip_${card.id}`);
      await ctx.answerCallbackQuery({ text: "مرور کارت" });
      await ctx.reply(`🃏 *خانه ${card.box} از ۵*\n\n❓ *روی کارت:*\n${card.front}`, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }

    if (data.startsWith("fc_flip_")) {
      const cid = parseInt(data.replace("fc_flip_", ""), 10);
      const card = await getFlashcardById(env.telegram_bot_db, cid);
      if (!card || card.user_id !== userId) return void (await ctx.answerCallbackQuery({ text: "کارت پیدا نشد" }));
      const kb = new InlineKeyboard()
        .text("✅ بلد بودم (خانه بعد ⬆️)", `fc_ans_${card.id}_1`)
        .text("❌ یادم رفته بود (خانه ۱ 🔄)", `fc_ans_${card.id}_0`);
      await ctx.answerCallbackQuery({ text: "💡 پاسخ کارت" });
      try {
        await ctx.editMessageText(
          `🃏 خانه ${card.box} از ۵\n\n❓ روی کارت:\n${card.front}\n\n💡 پشت کارت (پاسخ):\n${card.back}`,
          { reply_markup: kb }
        );
      } catch {
        await ctx.reply(`💡 پاسخ:\n${card.back}`, { reply_markup: kb });
      }
      return;
    }

    if (data.startsWith("fc_ans_")) {
      const parts = data.split("_");
      const cid = parseInt(parts[2], 10);
      const knew = parts[3] === "1";
      const card = await getFlashcardById(env.telegram_bot_db, cid);
      if (!card || card.user_id !== userId) return void (await ctx.answerCallbackQuery({ text: "کارت پیدا نشد" }));

      const newBox = await updateFlashcardReview(env.telegram_bot_db, cid, knew);
      await recordLabPracticeLog(env.telegram_bot_db, `fc_session_${userId}`, card.front);

      await ctx.answerCallbackQuery({
        text: knew ? `✅ رفت به خانه ${newBox}!` : "🔄 برگشت به خانه ۱ برای مرور مجدد",
      });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });

      const nextCard = await getDueFlashcard(env.telegram_bot_db, userId);
      if (nextCard) {
        const kb = new InlineKeyboard().text("👁 نمایش پشت کارت (پاسخ)", `fc_flip_${nextCard.id}`);
        await ctx.reply(`🃏 کارت بعدی (خانه ${nextCard.box} از ۵):\n\n❓ روی کارت:\n${nextCard.front}`, { reply_markup: kb });
      } else {
        const kb = new InlineKeyboard().text("📤 ارسال خلاصه مرور به معلم (دریافت امتیاز)", "lab_req_leitner");
        await ctx.reply(
          `🎉 عالی بود! تمام کارت‌های مرور امروزت به پایان رسید.\n💡 برای دریافت امتیاز، روی دکمه زیر بزن و خلاصه نکاتی که مرور کردی رو (با ویس، متن یا عکس) برای معلم ارسال کن:`,
          { reply_markup: kb }
        );
      }
      return;
    }

    if (data === "fc_ai_btn") {
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "fc_ai_topic" });
      await ctx.answerCallbackQuery({ text: "🤖 ساخت هوشمند فلش‌کارت" });
      await ctx.reply("🤖 موضوع درس یا متن جزوه‌ت رو بفرست تا هوش مصنوعی **۵ فلش‌کارت استاندارد** برات بسازه و بذاره تو جعبه لایتنرت!\n\nمثال‌ها:\n• `لغات انگلیسی درس ۲ پایه هشتم`\n• `فرمول‌های مساحت و محیط اشکال هندسی`\n(برای لغو /cancel)", { parse_mode: "Markdown" });
      return;
    }

    if (data === "fc_manual_btn") {
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "fc_manual_add" });
      await ctx.answerCallbackQuery({ text: "➕ افزودن کارت دستی" });
      await ctx.reply("✍️ لطفاً روی کارت و پشت کارت را با علامت `|` جدا کن و بفرست:\n\nمثال:\n`Resilient | مقاوم و انعطاف‌پذیر`\n(برای لغو /cancel)", { parse_mode: "Markdown" });
      return;
    }

    // ==================== ۵. تمرین مکالمه زبان انگلیسی، تصحیح انشا و ارسال مستندات به معلم ====================
    if (data === "hub_eng_chat") {
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "english_chat" });
      const starter = "Hello! Let's practice speaking English together. Tell me about your day or your favorite subject!";
      const kb = new InlineKeyboard()
        .text("📤 ارسال مستندات مکالمه به معلم (امتیاز)", "lab_req_english").row()
        .text("🏁 پایان مکالمه انگلیسی", "eng_stop");
      await ctx.answerCallbackQuery({ text: "🎧 مکالمه انگلیسی فعال شد" });
      await ctx.reply(
        `🎧 *مربی مکالمه زبان انگلیسی (ویس‌به‌ویس)*\n\n` +
        `یک **ویس انگلیسی** (یا پیام انگلیسی) بفرست! من:\n` +
        `۱. جمله‌ت رو تشخیص می‌دم و اگر اشتباه گرامری داشت به فارسی بهت یاد می‌دم\n` +
        `۲. مکالمه رو با **متن + ویس انگلیسی** باهات ادامه می‌دم\n` +
        `۳. در پایان تمرین می‌تونی مستندات مکالمه‌ت رو برای معلم بفرستی تا پس از تایید امتیاز بگیری!\n\n` +
        `🗣 Teacher: *${starter}*\n` +
        `🇮🇷 (سلام! بیا با هم انگلیسی تمرین کنیم. از روزت یا درس مورد علاقه‌ت برام بگو!)`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      const vBuf = await textToVoice(starter, "en");
      if (vBuf) {
        try { await ctx.replyWithVoice(new InputFile(new Uint8Array(vBuf), "english_tutor.ogg")); } catch {}
      }
      return;
    }

    if (data === "eng_stop") {
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await ctx.answerCallbackQuery({ text: "پایان مکالمه" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      const kb = new InlineKeyboard().text("📤 ارسال مستندات مکالمه به معلم (امتیاز)", "lab_req_english");
      await ctx.reply("👏 Great job practicing English! اگر می‌خوای بابت تمرین امروزت امتیاز بگیری، مستندات تمرین رو برای معلم بفرست:", { reply_markup: kb });
      return;
    }

    // ---- درخواست ارسال مستندات کارگاه یادگیری به معلم ----
    if (data === "lab_req_leitner") {
      const fcLog = await getBotState<{ count: number; samples: string[] }>(env.telegram_bot_db, `fc_session_${userId}`);
      const stats = await getFlashcardStats(env.telegram_bot_db, userId);
      const meta =
        `تعداد کارت مرورشده در این نوبت: ${fcLog?.count || 0} (کل کارت‌های جعبه: ${stats.total})` +
        (fcLog?.samples?.length ? `\nنمونه کارت‌های مرورشده: ${fcLog.samples.join(" ، ")}` : "");
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await setBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`, {
        category: "leitner",
        title: "🃏 مرور فلش‌کارت‌های جعبه لایتنر",
        minutes: 0,
        metaNote: meta,
      } as LabProofWaitState);
      const cancelKb = new InlineKeyboard().text("❌ انصراف", "lab_proof_cancel");
      await ctx.answerCallbackQuery({ text: "📤 ارسال مستندات لایتنر" });
      await ctx.reply(
        "📤 *ارسال مستندات مرور لایتنر به معلم*\n\n" +
        "لطفاً الان **خلاصه نکات مهمی که از فلش‌کارت‌ها یاد گرفتی** را به صورت **ویس، متن یا عکس** بفرست تا برای معلم ارسال شود و پس از تایید معلم امتیاز بگیری! 🌟",
        { parse_mode: "Markdown", reply_markup: cancelKb }
      );
      return;
    }

    if (data === "lab_req_english") {
      const engLog = await getBotState<{ count: number; samples: string[] }>(env.telegram_bot_db, `eng_session_${userId}`);
      const meta =
        `تعداد جملات تمرین‌شده با هوش مصنوعی: ${engLog?.count || 0}` +
        (engLog?.samples?.length ? `\nنمونه جملات دانش‌آموز: "${engLog.samples.join('" | "')}"` : "");
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await setBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`, {
        category: "english",
        title: "🎧 تمرین مکالمه زبان انگلیسی",
        minutes: 0,
        metaNote: meta,
      } as LabProofWaitState);
      const cancelKb = new InlineKeyboard().text("❌ انصراف", "lab_proof_cancel");
      await ctx.answerCallbackQuery({ text: "📤 ارسال مستندات انگلیسی" });
      await ctx.reply(
        "📤 *ارسال مستندات مکالمه انگلیسی به معلم*\n\n" +
        "لطفاً الان یک **ویس کوتاه انگلیسی** (معرفی یا خلاصه جملاتی که تمرین کردی) یا **متن جملاتی که یاد گرفتی** بفرست تا همراه با گزارش تمرینت برای معلم ارسال شود و پس از تایید امتیاز بگیری! 🌟",
        { parse_mode: "Markdown", reply_markup: cancelKb }
      );
      return;
    }

    if (data === "lab_req_essay") {
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await setBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`, {
        category: "essay",
        title: "✍️ نگارش و اصلاح انشای فارسی",
        minutes: 0,
        metaNote: "بررسی و بازخورد اولیه نگارشی با هوش مصنوعی انجام شده است.",
      } as LabProofWaitState);
      const cancelKb = new InlineKeyboard().text("❌ انصراف", "lab_proof_cancel");
      await ctx.answerCallbackQuery({ text: "📤 ارسال انشا به معلم" });
      await ctx.reply(
        "📤 *ارسال نسخه نهایی انشا برای معلم*\n\n" +
        "لطفاً **متن اصلاح‌شده انشا** یا **عکس خوش‌خط برگه انشایت** را بفرست تا برای معلم ارسال شود و پس از تایید معلم امتیاز بگیری! 🌟",
        { parse_mode: "Markdown", reply_markup: cancelKb }
      );
      return;
    }

    if (data === "lab_proof_cancel") {
      await deleteBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`);
      await ctx.answerCallbackQuery({ text: "لغو شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("✅ ارسال مستندات لغو شد.");
      return;
    }

    // ---- تایید / امتیاز دلخواه / رد مستندات کارگاه یادگیری توسط معلم ----
    if (data.startsWith("lab_ok_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const parts = data.split("_");
      const subId = parseInt(parts[2], 10);
      const pts = parseInt(parts[3], 10);
      await approveLabSubmissionAndNotify(ctx, env, bot, subId, pts, true);
      return;
    }

    if (data.startsWith("lab_custom_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const subId = parseInt(data.replace("lab_custom_", ""), 10);
      const sub = await getLabSubmissionById(env.telegram_bot_db, subId);
      if (!sub) return void (await ctx.answerCallbackQuery({ text: "❌ گزارش پیدا نشد." }));
      if (sub.status === "approved") {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return void (await ctx.answerCallbackQuery({ text: "قبلاً تایید شده است." }));
      }
      await setBotState(env.telegram_bot_db, "teacher_lab_score", { subId });
      await ctx.answerCallbackQuery({ text: "✏️ ورود امتیاز دلخواه" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`✏️ لطفاً عدد امتیاز دلخواه برای مستندات «${sub.student_name}» (${sub.title}) را بفرستید (مثلاً: 6):\n(برای لغو /cancel بزنید)`);
      return;
    }

    if (data.startsWith("lab_rej_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const subId = parseInt(data.replace("lab_rej_", ""), 10);
      const sub = await getLabSubmissionById(env.telegram_bot_db, subId);
      if (sub && sub.status === "pending") {
        await updateLabSubmissionDecision(env.telegram_bot_db, sub.id, "rejected", 0);
        try {
          await bot.api.sendMessage(
            sub.user_id,
            `⚠️ مستندات ارسالی تو در بخش «${sub.title}» توسط معلم تایید نشد.\n💡 لطفاً خلاصه یا مستندات کامل‌تر و دقیق‌تری از فعالیتت آماده کن و دوباره ارسال کن!`
          );
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: "❌ رد شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`❌ مستندات کارگاه یادگیری «${sub?.student_name || ""}» رد شد.`);
      return;
    }

    if (data === "hub_essay") {
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "essay_review" });
      await ctx.answerCallbackQuery({ text: "✍️ تصحیح انشا" });
      await ctx.reply(
        "✍️ *کارگاه تصحیح هوشمند انشا و نگارش فارسی*\n\n" +
        "لطفاً **متن انشا** یا **عکس واضح از برگه دست‌نویس انشات** رو همین‌جا بفرست تا:\n" +
        "• غلط‌های املایی و نگارشی رو اصلاح کنم\n" +
        "• واژگان و تشبیه‌های زیباتر پیشنهاد بدم\n" +
        "• نمره پیشنهادی از ۲۰ بهت بدم!\n\n(برای انصراف /cancel)",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // ==================== ۶. ابزارهای طلایی دستیار معلم (👨‍🏫) ====================
    if (data === "thub_main") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      await deleteBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`);
      await ctx.answerCallbackQuery({ text: "ابزارهای معلم" });
      try {
        await ctx.editMessageText("👨‍🏫 *دستیار هوشمند مدیریت کلاس و طراحی درس*\n👇 ابزار مورد نظر را انتخاب کنید:", {
          parse_mode: "Markdown",
          reply_markup: buildTeacherHubMenuKeyboard(),
        });
      } catch {
        await ctx.reply("👨‍🏫 ابزارهای هوشمند کلاس:", { reply_markup: buildTeacherHubMenuKeyboard() });
      }
      return;
    }

    if (data === "thub_lab_preview") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      await ctx.answerCallbackQuery({ text: "کارگاه یادگیری" });
      await ctx.reply("🧠 *تست ابزارهای کارگاه یادگیری (ویژه معلم):*", {
        parse_mode: "Markdown",
        reply_markup: buildLearningLabMenuKeyboard(),
      });
      return;
    }

    if (data === "thub_app_codes") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      await ensureExtraTables(env.telegram_bot_db);
      const students = await getAllStudents(env.telegram_bot_db);
      await ctx.answerCallbackQuery({ text: "📱 کدهای اپلیکیشن" });
      let msg =
        `📱 *اپلیکیشن ۳ پنله اندروید و وب کلاس*\n` +
        `🔗 لینک وب‌اپ بدون فیلتر: ${env.PUBLIC_APP_URL || "https://smartclass.vercel.app/app"}\n` +
        `👨‍🏫 رمز ورود پنل معلم: \`${PANEL_PASSWORD}\`\n` +
        `──────────────────\n`;
      if (students.length === 0) {
        msg += "هنوز دانش‌آموزی ثبت‌نام نکرده است.";
      } else {
        for (const s of students) {
          const c = await ensureStudentAppCredentials(env.telegram_bot_db, s.user_id);
          msg += `👤 *${s.name}*\n   🎒 دانش‌آموز: \`${c.student_code}\` (رمز: \`${c.student_pin}\`) | 👪 والدین: \`${c.parent_code}\`\n`;
        }
      }
      await ctx.reply(msg.slice(0, 4000), { parse_mode: "Markdown" });
      return;
    }

    if (data === "thub_attendance") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const todayStr = new Date().toISOString().split("T")[0];
      const students = await getAllStudents(env.telegram_bot_db);
      if (students.length === 0) return void (await ctx.reply("هنوز دانش‌آموزی ثبت‌نام نکرده است."));
      const panel = await buildAttendancePanel(env.telegram_bot_db, todayStr);
      await ctx.answerCallbackQuery({ text: "✅ حضور و غیاب" });
      await ctx.reply(panel.text, { parse_mode: "Markdown", reply_markup: panel.kb });
      return;
    }

    if (data.startsWith("att_t_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const parts = data.split("_");
      const targetUid = parseInt(parts[2], 10);
      const dateStr = parts[3];
      const st = await getStudent(env.telegram_bot_db, targetUid);
      if (!st) return void (await ctx.answerCallbackQuery({ text: "دانش‌آموز پیدا نشد" }));

      const curMap = await getAttendanceByDate(env.telegram_bot_db, dateStr);
      const cur = curMap[targetUid] || "present";
      const nextStatus: "present" | "absent" | "late" =
        cur === "present" ? "absent" : cur === "absent" ? "late" : "present";
      await setAttendanceStatus(env.telegram_bot_db, targetUid, st.name, dateStr, nextStatus);

      const panel = await buildAttendancePanel(env.telegram_bot_db, dateStr);
      await ctx.answerCallbackQuery({
        text: `${st.name}: ${nextStatus === "present" ? "✅ حاضر" : nextStatus === "absent" ? "❌ غایب" : "⏰ تاخیر"}`,
      });
      try {
        await ctx.editMessageText(panel.text, { parse_mode: "Markdown", reply_markup: panel.kb });
      } catch {}
      return;
    }

    if (data.startsWith("att_all_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const dateStr = data.replace("att_all_", "");
      const students = await getAllStudents(env.telegram_bot_db);
      for (const s of students) {
        await setAttendanceStatus(env.telegram_bot_db, s.user_id, s.name, dateStr, "present");
      }
      const panel = await buildAttendancePanel(env.telegram_bot_db, dateStr);
      await ctx.answerCallbackQuery({ text: "✔️ همه حاضر ثبت شدند" });
      try {
        await ctx.editMessageText(panel.text, { parse_mode: "Markdown", reply_markup: panel.kb });
      } catch {}
      return;
    }

    if (data.startsWith("att_notify_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const dateStr = data.replace("att_notify_", "");
      const attMap = await getAttendanceByDate(env.telegram_bot_db, dateStr);
      const students = await getAllStudents(env.telegram_bot_db);
      let notified = 0;
      let missingParent = 0;

      for (const s of students) {
        const status = attMap[s.user_id] || "present";
        if (status === "absent" || status === "late") {
          if (s.parent_chat_id) {
            const stText = status === "absent" ? "غیبت" : "تاخیر در حضور";
            try {
              await bot.api.sendMessage(
                s.parent_chat_id,
                `📢 اطلاعیه حضور و غیاب کلاس\n📅 تاریخ: ${toJalali(dateStr + "T12:00:00Z")}\n\nاولیای گرامی دانش‌آموز عزیز «${s.name}»،\nبه استحضار می‌رسد امروز وضعیت حضور فرزندتان در کلاس به صورت «${stText}» ثبت گردید.\n\n💐 با احترام — ${TEACHER_NAME}`
              );
              notified++;
            } catch {}
          } else {
            missingParent++;
          }
        }
      }

      await ctx.answerCallbackQuery({ text: `📨 به ${notified} ولی ارسال شد` });
      await ctx.reply(
        `✅ اطلاع‌رسانی حضور و غیاب انجام شد:\n• ارسال موفق به والدین: ${notified} نفر` +
        (missingParent > 0 ? `\n• بدون آیدی والدین: ${missingParent} نفر (ثبت با دستور /parent نام آیدی)` : "")
      );
      return;
    }

    if (data === "thub_parent_cards") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const students = await getAllStudents(env.telegram_bot_db);
      if (students.length === 0) return void (await ctx.reply("هنوز دانش‌آموزی ثبت‌نام نکرده است."));
      const kb = new InlineKeyboard().text("🚀 ارسال کارنامه به همه والدین متصل", "pcard_all").row();
      students.slice(0, 20).forEach((s, idx) => {
        kb.text(`${s.parent_chat_id ? "📬" : "👁"} ${s.name}`, `pcard_view_${s.user_id}`);
        if (idx % 2 === 1) kb.row();
      });
      if (students.length % 2 === 1) kb.row();
      kb.text("🔙 بازگشت", "thub_main");
      await ctx.answerCallbackQuery({ text: "📬 کارنامه والدین" });
      await ctx.reply(
        "📬 *کارنامه هوشمند هفتگی والدین*\n\nروی نام هر دانش‌آموز بزنید تا پیش‌نمایش کارنامه تحلیلی او ساخته شود (📬 = والدین متصل):",
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("pcard_view_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const targetUid = parseInt(data.replace("pcard_view_", ""), 10);
      const st = await getStudent(env.telegram_bot_db, targetUid);
      if (!st) return void (await ctx.answerCallbackQuery({ text: "پیدا نشد" }));
      const cardText = await buildSmartParentReportCard(env.telegram_bot_db, st);
      const kb = new InlineKeyboard();
      if (st.parent_chat_id) {
        kb.text("📨 ارسال به تلگرام والدین", `pcard_send_${st.user_id}`).row();
      }
      kb.text("📤 ارسال یک نسخه تشویقی به خود دانش‌آموز", `pcard_self_${st.user_id}`);
      await ctx.answerCallbackQuery({ text: "کارنامه آماده شد" });
      await ctx.reply(
        cardText + (!st.parent_chat_id ? "\n\n⚠️ آیدی والدین برای این دانش‌آموز ثبت نشده است (`/parent نام آیدی`)." : ""),
        { reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("pcard_send_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const targetUid = parseInt(data.replace("pcard_send_", ""), 10);
      const st = await getStudent(env.telegram_bot_db, targetUid);
      if (!st || !st.parent_chat_id) return void (await ctx.answerCallbackQuery({ text: "آیدی والدین ثبت نشده!" }));
      const cardText = await buildSmartParentReportCard(env.telegram_bot_db, st);
      await bot.api.sendMessage(st.parent_chat_id, cardText);
      await ctx.answerCallbackQuery({ text: "✅ ارسال شد!" });
      await ctx.reply(`✅ کارنامه هفتگی «${st.name}» با موفقیت برای والدین ارسال شد.`);
      return;
    }

    if (data.startsWith("pcard_self_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const targetUid = parseInt(data.replace("pcard_self_", ""), 10);
      const st = await getStudent(env.telegram_bot_db, targetUid);
      if (!st) return void (await ctx.answerCallbackQuery({ text: "پیدا نشد!" }));
      const cardText = await buildSmartParentReportCard(env.telegram_bot_db, st);
      await bot.api.sendMessage(st.user_id, cardText);
      await ctx.answerCallbackQuery({ text: "✅ برای دانش‌آموز ارسال شد!" });
      await ctx.reply(`✅ کارنامه هفتگی برای خود «${st.name}» ارسال شد.`);
      return;
    }

    if (data === "pcard_all") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const students = await getAllStudents(env.telegram_bot_db);
      let sent = 0;
      for (const s of students) {
        if (!s.parent_chat_id) continue;
        try {
          const cardText = await buildSmartParentReportCard(env.telegram_bot_db, s);
          await bot.api.sendMessage(s.parent_chat_id, cardText);
          sent++;
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: `✅ به ${sent} ولی ارسال شد` });
      await ctx.reply(`✅ کارنامه هوشمند هفتگی برای والدین ${sent} دانش‌آموز ارسال گردید.`);
      return;
    }

    if (data === "thub_summary") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      await setBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`, { mode: "teacher_summary_wait" });
      await ctx.answerCallbackQuery({ text: "📚 جزوه‌ساز فعال شد" });
      await ctx.reply(
        "📚 *جزوه‌ساز هوشمند شب امتحان*\n\n" +
        "لطفاً یکی از موارد زیر را بفرستید تا جزوه خلاصه، دسته‌بندی‌شده و آماده ارسال به کلاس ساخته شود:\n" +
        "• 📄 فایل **PDF کتاب یا جزوه** (با کپشن شماره صفحه مثل `صفحه 10 تا 14` در صورت تمایل)\n" +
        "• 📸 **عکس صفحه کتاب درسی**\n" +
        "• 🎤 **ویس توضیحات تدریس خودتان**\n" +
        "• ✍️ **متن یا موضوع درس**\n\n(برای انصراف /cancel)",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (data === "thub_exam") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      await setBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`, { mode: "teacher_exam_wait" });
      await ctx.answerCallbackQuery({ text: "📄 طراح امتحان تشریحی فعال شد" });
      await ctx.reply(
        "📄 *طراح هوشمند برگه امتحانی ۲۰ نمره‌ای (با کلید پاسخنامه مجزا)*\n\n" +
        "لطفاً منبع امتحان را بفرستید:\n" +
        "• 📄 فایل **PDF فصل یا کتاب** (می‌توانید در کپشن شماره صفحات را بنویسید)\n" +
        "• 📸 **عکس صفحات درس**\n" +
        "• 🎤 **ویس توضیحات مبحث امتحانی**\n" +
        "• ✍️ **متن یا عنوان فصل و پایه تحصیلی**\n\n(برای انصراف /cancel)",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (data.startsWith("bcast_doc_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const key = data.replace("bcast_doc_", "");
      const savedText = await getBotState<string>(env.telegram_bot_db, `saved_bcast_${key}`);
      if (!savedText) return void (await ctx.answerCallbackQuery({ text: "محتوا منقضی شده است." }));
      const students = await getAllStudents(env.telegram_bot_db);
      await ctx.answerCallbackQuery({ text: "📤 در حال ارسال به کل کلاس..." });
      let sent = 0;
      for (const s of students) {
        try {
          await bot.api.sendMessage(s.user_id, savedText.slice(0, 4050));
          sent++;
        } catch {}
      }
      await ctx.reply(`✅ با موفقیت برای ${sent} دانش‌آموز کلاس ارسال شد!`);
      return;
    }

    // ==================== فاز ۶ — ۱. کتابخانه و آرشیو شیشه‌ای کلاس (📂) ====================
    if (data.startsWith("save_lib_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const key = data.replace("save_lib_", "");
      const draft = await getBotState<{ category: string; title: string; body: string }>(
        env.telegram_bot_db,
        `saved_lib_draft_${key}`
      );
      if (!draft) return void (await ctx.answerCallbackQuery({ text: "پیش‌نویس پیدا نشد" }));
      await addLibraryItem(env.telegram_bot_db, draft.category, draft.title, "text", "", draft.body);
      await ctx.answerCallbackQuery({ text: "📂 در کتابخانه کلاس ذخیره شد!" });
      await ctx.reply(`✅ «${draft.title}» در بخش «${draft.category}» کتابخانه کلاس ذخیره شد و برای همه دانش‌آموزان قابل مشاهده است.`);
      return;
    }

    if (data === "hub_library") {
      const allItems = await getLibraryItems(env.telegram_bot_db);
      const kb = new InlineKeyboard()
        .text("📚 جزوه و درسنامه", "lib_cat_جزوه و درسنامه")
        .text("📄 نمونه سوال امتحانی", "lib_cat_نمونه سوال امتحانی").row()
        .text("🎥 فایل و رسانه آموزشی", "lib_cat_فایل و رسانه آموزشی")
        .text("💡 نکات طلایی", "lib_cat_نکات طلایی").row()
        .text(`📋 نمایش همه منابع (${allItems.length})`, "lib_cat_all");
      await ctx.answerCallbackQuery({ text: "📂 کتابخانه کلاس" });
      await ctx.reply(
        `📂 *کتابخانه و آرشیو شیشه‌ای کلاس*\n\n` +
        `در این بخش به تمام جزوه‌ها، فایل‌های PDF، ویس‌های تدریس و نمونه سوالات امتحانی که معلم ثبت کرده دسترسی همیشگی داری!\n` +
        `📦 تعداد کل منابع موجود: *${allItems.length} مورد*\n\n👇 دسته‌بندی مورد نظرت رو انتخاب کن:`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("lib_cat_")) {
      const cat = data.replace("lib_cat_", "");
      const items = await getLibraryItems(env.telegram_bot_db, cat);
      await ctx.answerCallbackQuery({ text: "📂 بارگذاری منابع..." });
      if (items.length === 0) {
        return void (await ctx.reply(`ℹ️ هنوز منبعی در دسته «${cat === "all" ? "همه منابع" : cat}» ثبت نشده است.`));
      }
      const kb = new InlineKeyboard();
      const iconMap: Record<string, string> = { text: "📝", document: "📄", photo: "🖼", voice: "🎤", video: "🎥", audio: "🎵" };
      items.slice(0, 20).forEach((it) => {
        kb.text(`${iconMap[it.content_type] || "📌"} ${it.title}`.slice(0, 45), `lib_open_${it.id}`).row();
      });
      await ctx.reply(`📂 *منابع بخش «${cat === "all" ? "همه دسته‌ها" : cat}»:*\n👇 برای دریافت روی عنوان مورد نظر بزن:`, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }

    if (data.startsWith("lib_open_")) {
      const id = parseInt(data.replace("lib_open_", ""), 10);
      const item = await getLibraryItemById(env.telegram_bot_db, id);
      if (!item) return void (await ctx.answerCallbackQuery({ text: "منبع پیدا نشد" }));
      await ctx.answerCallbackQuery({ text: `📥 ${item.title}` });
      const header = `📂 *${item.title}*\n🏷 دسته: ${item.category} | 📅 ${toJalali(item.created_at)}\n\n`;
      if (item.content_type === "text") {
        await ctx.reply((header.replace(/\*/g, "") + item.text_body).slice(0, 4050));
      } else if (item.content_type === "document" && item.file_id) {
        await ctx.replyWithDocument(item.file_id, { caption: (header.replace(/\*/g, "") + item.text_body).slice(0, 1000) });
      } else if (item.content_type === "photo" && item.file_id) {
        await ctx.replyWithPhoto(item.file_id, { caption: (header.replace(/\*/g, "") + item.text_body).slice(0, 1000) });
      } else if (item.content_type === "voice" && item.file_id) {
        await ctx.replyWithVoice(item.file_id, { caption: (header.replace(/\*/g, "") + item.text_body).slice(0, 1000) });
      } else if (item.content_type === "video" && item.file_id) {
        await ctx.replyWithVideo(item.file_id, { caption: (header.replace(/\*/g, "") + item.text_body).slice(0, 1000) });
      } else if (item.content_type === "audio" && item.file_id) {
        await ctx.replyWithAudio(item.file_id, { caption: (header.replace(/\*/g, "") + item.text_body).slice(0, 1000) });
      }
      return;
    }

    if (data === "thub_library") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const items = await getLibraryItems(env.telegram_bot_db);
      const kb = new InlineKeyboard()
        .text("➕ افزودن جزوه / درسنامه", "lib_add_جزوه و درسنامه")
        .text("➕ افزودن نمونه سوال", "lib_add_نمونه سوال امتحانی").row()
        .text("➕ افزودن فایل / رسانه", "lib_add_فایل و رسانه آموزشی")
        .text("➕ افزودن نکته طلایی", "lib_add_نکات طلایی").row();
      items.slice(0, 12).forEach((it) => {
        kb.text(`🗑 حذف: ${it.title}`.slice(0, 42), `lib_del_${it.id}`).row();
      });
      kb.text("🔙 بازگشت", "thub_main");
      await ctx.answerCallbackQuery({ text: "📂 مدیریت کتابخانه" });
      await ctx.reply(
        `📂 *مدیریت کتابخانه کلاس*\n📦 تعداد منابع فعلی: ${items.length}\n\n` +
        `برای افزودن منبع جدید (فایل PDF، ویس، عکس، ویدیو یا متن)، ابتدا دسته آن را انتخاب کنید:`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("lib_add_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const category = data.replace("lib_add_", "");
      await setBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`, { mode: "library_add_wait", category });
      await ctx.answerCallbackQuery({ text: `➕ ${category}` });
      await ctx.reply(
        `➕ *افزودن منبع به دسته «${category}»*\n\n` +
        `لطفاً یکی از موارد زیر را ارسال کنید:\n` +
        `• 📄 فایل PDF / عکس / ویس / ویدیو **(عنوان منبع را در کپشن آن بنویسید)**\n` +
        `• ✍️ یا پیام متنی با فرمت: \`عنوان منبع | متن کامل جزوه یا نکته\`\n\n(برای لغو /cancel)`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (data.startsWith("lib_del_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const id = parseInt(data.replace("lib_del_", ""), 10);
      await deleteLibraryItem(env.telegram_bot_db, id);
      await ctx.answerCallbackQuery({ text: "🗑 حذف شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("✅ منبع از کتابخانه کلاس حذف شد.");
      return;
    }

    // ==================== فاز ۶ — ۲. صدور خودکار لوح تقدیر تصویری (🏅) ====================
    if (data === "thub_cert") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const students = await getAllStudents(env.telegram_bot_db);
      if (students.length === 0) return void (await ctx.reply("هنوز دانش‌آموزی ثبت‌نام نکرده است."));
      const kb = new InlineKeyboard();
      const medals = ["🥇 ", "🥈 ", "🥉 "];
      students.slice(0, 20).forEach((s, idx) => {
        kb.text(`${idx < 3 ? medals[idx] : "👤 "}${s.name} (${s.score})`, `cert_st_${s.user_id}`);
        if (idx % 2 === 1) kb.row();
      });
      if (students.length % 2 === 1) kb.row();
      kb.text("🔙 بازگشت", "thub_main");
      await ctx.answerCallbackQuery({ text: "🏅 لوح تقدیر" });
      await ctx.reply("🏅 *صدور لوح تقدیر تصویری اختصاصی*\n\nدانش‌آموز مورد نظر را انتخاب کنید:", {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }

    if (data.startsWith("cert_st_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const targetUid = parseInt(data.replace("cert_st_", ""), 10);
      const st = await getStudent(env.telegram_bot_db, targetUid);
      if (!st) return void (await ctx.answerCallbackQuery({ text: "پیدا نشد" }));
      const kb = new InlineKeyboard()
        .text("🌟 قهرمان تلاش و پیشرفت هفته", `cert_make_${targetUid}_1`).row()
        .text("🥇 رتبه برتر علمی و درسی کلاس", `cert_make_${targetUid}_2`).row()
        .text("🔥 رکورددار نظم، پیوستگی و استریک", `cert_make_${targetUid}_3`).row()
        .text("👑 اخلاق، ادب و مشارکت برتر کلاسی", `cert_make_${targetUid}_4`).row()
        .text("✏️ نوشتن عنوان افتخار دلخواه", `cert_make_${targetUid}_custom`);
      await ctx.answerCallbackQuery({ text: st.name });
      await ctx.reply(`🏅 عنوان روی لوح تقدیر برای «*${st.name}*» را انتخاب کنید:`, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }

    if (data.startsWith("cert_make_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const parts = data.split("_");
      const targetUid = parseInt(parts[2], 10);
      const code = parts[3];
      const st = await getStudent(env.telegram_bot_db, targetUid);
      if (!st) return void (await ctx.answerCallbackQuery({ text: "دانش‌آموز پیدا نشد" }));

      if (code === "custom") {
        await setBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`, { mode: "cert_custom_title", targetUid });
        await ctx.answerCallbackQuery({ text: "✏️ عنوان دلخواه" });
        await ctx.reply(`✏️ لطفاً عنوان دلخواه برای درج روی لوح تقدیر «${st.name}» را بنویسید (مثال: پژوهشگر برتر آزمایشگاه علوم):`);
        return;
      }

      const titles: Record<string, string> = {
        "1": "قهرمان تلاش و پیشرفت هفته",
        "2": "رتبه برتر علمی و درسی کلاس",
        "3": "رکورددار نظم، پیوستگی و استریک",
        "4": "اخلاق، ادب و مشارکت برتر کلاسی",
      };
      const awardTitle = titles[code] || titles["1"];
      await ctx.answerCallbackQuery({ text: "🎨 در حال طراحی لوح تقدیر..." });
      const wait = await ctx.reply("🎨 در حال طراحی گرافیکی لوح تقدیر اختصاصی با نام دانش‌آموز...");
      const png = await generateCertificatePng(st.name, st.grade || "", st.score, awardTitle);
      try { if (ctx.chat) await bot.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
      if (!png) return void (await ctx.reply("❌ خطا در رندر تصویر لوح تقدیر. لطفاً مجدداً تلاش کنید."));
      try { await saveCertificateInAppDb(env.telegram_bot_db, st.user_id, st.name, awardTitle, png, uint8ToBase64); } catch {}

      const kb = new InlineKeyboard()
        .text("📤 ارسال لوح به خود دانش‌آموز", `cert_send_st_${st.user_id}`).row();
      if (st.parent_chat_id) {
        kb.text("📬 ارسال لوح افتخار به تلگرام والدین", `cert_send_par_${st.user_id}`).row();
      }
      kb.text("📢 تشویق و نمایش در کل کلاس", `cert_bcast_${st.user_id}`);

      const sentPhoto = await ctx.replyWithPhoto(new InputFile(png, "certificate.png"), {
        caption: `🏅 لوح تقدیر آماده شد!\n👤 دانش‌آموز: ${st.name}\n🌟 عنوان: ${awardTitle}`,
        reply_markup: kb,
      });
      const fid = sentPhoto.photo?.[sentPhoto.photo.length - 1]?.file_id || "";
      await setBotState(env.telegram_bot_db, `saved_cert_${st.user_id}`, { fileId: fid, awardTitle, name: st.name });
      return;
    }

    if (data.startsWith("cert_send_st_") || data.startsWith("cert_send_par_") || data.startsWith("cert_bcast_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const parts = data.split("_");
      const targetUid = parseInt(parts[parts.length - 1], 10);
      const st = await getStudent(env.telegram_bot_db, targetUid);
      const certInfo = await getBotState<{ fileId: string; awardTitle: string; name: string }>(
        env.telegram_bot_db,
        `saved_cert_${targetUid}`
      );
      if (!st || !certInfo?.fileId) return void (await ctx.answerCallbackQuery({ text: "لوح پیدا نشد؛ دوباره بسازید." }));

      if (data.startsWith("cert_send_st_")) {
        await bot.api.sendPhoto(st.user_id, certInfo.fileId, {
          caption: `🎉🏅 تبریک فراوان ${st.name} عزیز!\nلوح تقدیر «${certInfo.awardTitle}» از طرف معلم عزیزت (${TEACHER_NAME}) به تو اهدا شد! 🌟👏`,
        });
        await ctx.answerCallbackQuery({ text: "✅ برای دانش‌آموز ارسال شد!" });
        await ctx.reply(`✅ لوح تقدیر برای «${st.name}» ارسال شد.`);
      } else if (data.startsWith("cert_send_par_")) {
        if (!st.parent_chat_id) return void (await ctx.answerCallbackQuery({ text: "آیدی والدین ثبت نشده" }));
        await bot.api.sendPhoto(st.parent_chat_id, certInfo.fileId, {
          caption: `🌺 اولیای گرامی دانش‌آموز عزیز «${st.name}»،\nبا کمال مسرت، لوح تقدیر فرزند تلاشگرتان در کسب عنوان «${certInfo.awardTitle}» تقدیم حضور می‌گردد.\n\nبا احترام — ${TEACHER_NAME}`,
        });
        await ctx.answerCallbackQuery({ text: "✅ برای والدین ارسال شد!" });
        await ctx.reply(`✅ لوح تقدیر برای والدین «${st.name}» ارسال شد.`);
      } else {
        const all = await getAllStudents(env.telegram_bot_db);
        let c = 0;
        for (const s of all) {
          try {
            await bot.api.sendPhoto(s.user_id, certInfo.fileId, {
              caption: `👏🌟 تشویق کلاسی!\nتبریک به هم‌کلاسی پرتلاش‌مون «${st.name}» بابت کسب لوح افتخار «${certInfo.awardTitle}»! 🎉🏅`,
            });
            c++;
          } catch {}
        }
        await ctx.answerCallbackQuery({ text: `📢 به ${c} نفر ارسال شد` });
        await ctx.reply(`✅ لوح افتخار «${st.name}» برای کل کلاس (${c} نفر) ارسال شد!`);
      }
      return;
    }

    // ==================== فاز ۶ — ۳. گروه‌بندی هوشمند کلاسی و امتیاز تیمی (👥) ====================
    if (data === "thub_teams") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const teams = await getClassTeams(env.telegram_bot_db);
      let txt = `👥 *گروه‌بندی هوشمند کلاسی و پروژه‌های تیمی*\n\n`;
      const kb = new InlineKeyboard()
        .text("⚖️ متعادل ۳ نفره", "team_gen_3_balanced")
        .text("⚖️ متعادل ۴ نفره", "team_gen_4_balanced").row()
        .text("🎲 شانسی ۳ نفره", "team_gen_3_random")
        .text("⚖️ متعادل ۲ نفره", "team_gen_2_balanced").row();

      if (teams.length === 0) {
        txt += "هنوز گروه‌بندی فعالی ثبت نشده است. با دکمه‌های زیر، دانش‌آموزان را به صورت **متعادل (توزیع عادلانه قوی و متوسط در هر گروه)** یا **شانسی** گروه‌بندی کنید:";
      } else {
        txt += "📋 *گروه‌های فعلی کلاس:*\n\n";
        teams.forEach((t) => {
          const avg = Math.round(t.members.reduce((a, b) => a + b.score, 0) / (t.members.length || 1));
          txt += `🔹 *${t.teamName}* (میانگین امتیاز: ${avg}):\n   👥 ${t.members.map((m) => m.name).join(" ، ")}\n\n`;
          kb.text(`⭐ +5 به ${t.teamName}`, `team_pts_${t.id}_5`)
            .text(`⭐ +10`, `team_pts_${t.id}_10`).row();
        });
        kb.text("📢 معرفی گروه‌ها به اعضای کلاس", "team_bcast").row();
      }
      kb.text("🔙 بازگشت", "thub_main");
      await ctx.answerCallbackQuery({ text: "👥 گروه‌بندی کلاس" });
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data.startsWith("team_gen_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const parts = data.split("_");
      const size = parseInt(parts[2], 10) || 3;
      const mode = (parts[3] === "random" ? "random" : "balanced") as "balanced" | "random";
      const students = await getAllStudents(env.telegram_bot_db);
      if (students.length < 2) return void (await ctx.answerCallbackQuery({ text: "حداقل ۲ دانش‌آموز لازم است" }));

      const built = generateSmartClassTeams(students, size, mode);
      await saveClassTeams(env.telegram_bot_db, built);
      const savedTeams = await getClassTeams(env.telegram_bot_db);

      let txt = `✅ *گروه‌بندی جدید کلاس (${mode === "balanced" ? "⚖️ متعادل علمی" : "🎲 قرعه‌کشی شانسی"} — ${size} نفره) ساخته شد!*\n\n`;
      const kb = new InlineKeyboard();
      savedTeams.forEach((t) => {
        txt += `🔹 *${t.teamName}:*\n   👥 ${t.members.map((m) => m.name).join(" ، ")}\n\n`;
        kb.text(`⭐ +5 به ${t.teamName}`, `team_pts_${t.id}_5`)
          .text(`⭐ +10`, `team_pts_${t.id}_10`).row();
      });
      kb.text("📢 ارسال ترکیب گروه‌ها به دانش‌آموزان", "team_bcast");
      await ctx.answerCallbackQuery({ text: "✅ گروه‌ها ساخته شدند!" });
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data === "team_bcast") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const teams = await getClassTeams(env.telegram_bot_db);
      if (teams.length === 0) return void (await ctx.answerCallbackQuery({ text: "گروهی ثبت نشده" }));
      let notified = 0;
      for (const t of teams) {
        const matesNames = t.members.map((m) => m.name).join(" ، ");
        for (const m of t.members) {
          try {
            await bot.api.sendMessage(
              m.user_id,
              `👥 *گروه‌بندی جدید کلاسی اعلام شد!*\n\n` +
              `🏷 تیم تو: *${t.teamName}*\n` +
              `🤝 اعضای گروه: ${matesNames}\n\n` +
              `با همکاری و هم‌فکری اعضای تیمت بدرخشید! 🌟`,
              { parse_mode: "Markdown" }
            );
            notified++;
          } catch {}
        }
      }
      await ctx.answerCallbackQuery({ text: `📢 به ${notified} نفر اعلام شد` });
      await ctx.reply(`✅ ترکیب گروه‌ها به صورت اختصاصی برای ${notified} دانش‌آموز ارسال شد.`);
      return;
    }

    if (data.startsWith("team_pts_")) {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const parts = data.split("_");
      const teamId = parseInt(parts[2], 10);
      const pts = parseInt(parts[3], 10) || 5;
      const teams = await getClassTeams(env.telegram_bot_db);
      const targetTeam = teams.find((t) => t.id === teamId);
      if (!targetTeam) return void (await ctx.answerCallbackQuery({ text: "گروه پیدا نشد" }));

      for (const m of targetTeam.members) {
        const up = await updateScore(env.telegram_bot_db, m.user_id, pts);
        try {
          await bot.api.sendMessage(
            m.user_id,
            `🎉👥 *امتیاز تیمی!* به پاس عملکرد عالی «${targetTeam.teamName}»، **+${pts} امتیاز** به همه اعضای تیمت تعلق گرفت!\n📊 مجموع امتیاز جدیدت: ${up?.score}`,
            { parse_mode: "Markdown" }
          );
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: `⭐ +${pts} به اعضای ${targetTeam.teamName}!` });
      await ctx.reply(`✅ به تمام اعضای «${targetTeam.teamName}» (${targetTeam.members.length} نفر) نفری +${pts} امتیاز تیمی اهدا شد!`);
      return;
    }

    // ==================== فاز ۶ — ۴. نقشه ذهنی تصویری درس (🗺 Mind Map) ====================
    if (data === "hub_mindmap" || data === "thub_mindmap") {
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "mindmap_wait" });
      await ctx.answerCallbackQuery({ text: "🗺 نقشه ذهنی" });
      await ctx.reply(
        "🗺 *ساخت خودکار نقشه ذهنی تصویری (Mind Map)*\n\n" +
        "لطفاً **عنوان مبحث درسی** یا **متن خلاصه درس** را بنویسید تا نمودار درختی رنگی و فارسی آن ساخته شود!\n\n" +
        "مثال‌ها:\n• `دستگاه گردش خون انسان علوم هشتم`\n• `اقسام کلمه در ادبیات فارسی`\n• `انواع انرژی و تبدیل‌های آن`\n\n(برای انصراف /cancel)",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (data === "mmap_bcast") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const saved = await getBotState<{ fileId: string; title: string }>(env.telegram_bot_db, "saved_mindmap_bcast");
      if (!saved?.fileId) return void (await ctx.answerCallbackQuery({ text: "تصویر منقضی شده" }));
      const all = await getAllStudents(env.telegram_bot_db);
      let c = 0;
      for (const s of all) {
        try {
          await bot.api.sendPhoto(s.user_id, saved.fileId, { caption: `🗺 نقشه ذهنی آموزشی درس: «${saved.title}»\nارسال‌شده توسط معلم کلاس 📚` });
          c++;
        } catch {}
      }
      await ctx.answerCallbackQuery({ text: `📢 به ${c} نفر ارسال شد` });
      await ctx.reply(`✅ نقشه ذهنی «${saved.title}» برای ${c} دانش‌آموز ارسال شد.`);
      return;
    }

    // ==================== فاز ۶ — ۵. آزمون دیکته و املای هوشمند (🎙) ====================
    if (data === "thub_dictation") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const activeDict = await getBotState<{ title: string; text: string; voiceFileId?: string }>(env.telegram_bot_db, "active_dictation");
      await setBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`, { mode: "dictation_teacher_set" });
      await ctx.answerCallbackQuery({ text: "🎙 ثبت دیکته کلاس" });
      await ctx.reply(
        `🎙 *مدیریت آزمون دیکته و املای هوشمند*\n\n` +
        (activeDict ? `📌 دیکته فعال فعلی: «${activeDict.title}»\n«${activeDict.text.slice(0, 120)}...»\n\n` : "") +
        `برای ثبت دیکته جدید کلاس:\n` +
        `• 🎤 یک **ویس دیکته** بفرستید (ربات خودکار متنش را هم برای تصحیح استخراج می‌کند!)\n` +
        `• ✍️ یا **متن املا** را به صورت متنی بفرستید تا دانش‌آموزان بنویسند و عکس برگه‌شان تصحیح شود!\n\n(برای انصراف /cancel)`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (data === "hub_dictation") {
      const activeDict = await getBotState<{ title: string; text: string; voiceFileId?: string }>(env.telegram_bot_db, "active_dictation");
      const fallback = DEFAULT_DICTATION_TEXTS[Math.floor(Date.now() / 86400000) % DEFAULT_DICTATION_TEXTS.length];
      const chosen = activeDict || fallback;

      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, {
        mode: "dictation_student_photo",
        expectedText: chosen.text,
        dictTitle: chosen.title,
      });

      await ctx.answerCallbackQuery({ text: "🎙 آزمون املا" });
      if (chosen.voiceFileId) {
        try {
          await ctx.replyWithVoice(chosen.voiceFileId, { caption: `🎙 ویس دیکته معلم: «${chosen.title}»` });
        } catch {}
        await ctx.reply(
          `✍️ *آزمون دیکته «${chosen.title}»*\n\n` +
          `۱. به ویس دیکته بالا با دقت گوش کن و روی کاغذ خوش‌خط بنویس 📝\n` +
          `۲. از برگه املات یک **عکس واضح** بگیر و همین‌جا بفرست 📸\n` +
          `۳. هوش مصنوعی غلط‌گیری اولیه رو انجام می‌ده و برگه‌ت رو برای **تایید و امتیازدهی معلم** ارسال می‌کنه! 🌟\n\n(برای لغو /cancel)`,
          { parse_mode: "Markdown" }
        );
      } else {
        // نمایش متن در قالب اسپویلر تا دانش‌آموز بعد از یک‌بار خواندن/شنیدن از کسی، روی کاغذ بنویسد
        await ctx.reply(
          `🎙 آزمون املای «${chosen.title}»\n\n` +
          `۱. از یکی از اعضای خانواده بخواه متن پنهان‌شده زیر را برایت بخواند (یا یک‌بار مرور کن و ببند) و روی کاغذ بنویس:\n` +
          `<tg-spoiler>${escapeGraphvizHtml(chosen.text)}</tg-spoiler>\n\n` +
          `۲. حالا **عکس واضح از برگه دست‌نویس املا** را همین‌جا بفرست تا غلط‌گیری شود و برای تایید امتیاز معلم ارسال گردد! 📸`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // ==================== فاز ۶ — ۶. «کجای درس امروز گنگ بود؟» (🆘) ====================
    if (data === "hub_muddy") {
      const kb = new InlineKeyboard()
        .text("🔒 ارسال کاملاً ناشناس (بدون نام)", "muddy_mode_1").row()
        .text("👤 ارسال با نام خودم (جهت راهنمایی)", "muddy_mode_0");
      await ctx.answerCallbackQuery({ text: "🆘 بازخورد درس" });
      await ctx.reply(
        "🆘 *کجای درس امروز برایت گنگ یا سخت بود؟*\n\n" +
        "هیچ سوالی خجالت نداره! اگر مبحثی از درس امروز یا این هفته رو کامل متوجه نشدی، اینجا ثبت کن تا معلم قبل از جلسه بعد بدونه کدوم بخش نیاز به مرور دوباره داره 💡\n\n" +
        "👇 چطور می‌خوای ارسال بشه؟",
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("muddy_mode_")) {
      const anon = data === "muddy_mode_1";
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "muddy_wait", anon });
      await ctx.answerCallbackQuery({ text: anon ? "🔒 حالت ناشناس" : "👤 با نام" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(
        `✍️ لطفاً بنویس **کدام درس یا کدام فرمول/مبحث** برایت گنگ یا سوال‌برانگیز بود:\n` +
        `(${anon ? "🔒 نام تو کاملاً محرمانه می‌ماند و نمایش داده نمی‌شود" : "👤 با نام خودت برای معلم ارسال می‌شود"})\n\n` +
        `مثال: «در ریاضی بخش مخرج مشترک گرفتن کسرها رو قاطی می‌کنم»`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (data === "thub_muddy_admin") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const rows = await getRecentMuddyFeedback(env.telegram_bot_db);
      await ctx.answerCallbackQuery({ text: "🆘 گزارش مباحث گنگ" });
      if (rows.length === 0) {
        return void (await ctx.reply("✅ هنوز هیچ موردی از ابهام درسی توسط دانش‌آموزان ثبت نشده است!"));
      }
      let txt = `🆘 *گزارش مباحث گنگ و نیازمند مرور کلاس (${rows.length} مورد):*\n\n`;
      rows.slice(0, 18).forEach((r, idx) => {
        const who = r.is_anonymous ? "🔒 ناشناس" : `👤 ${r.student_name}`;
        txt += `${idx + 1}. (${who}): ${r.topic_detail}\n`;
      });
      const kb = new InlineKeyboard()
        .text("🤖 دسته‌بندی و پیشنهاد رفع اشکال با AI", "muddy_ai_sum").row()
        .text("🗑 پاکسازی لیست (پس از رفع اشکال در کلاس)", "muddy_clear").row()
        .text("🔙 بازگشت", "thub_main");
      await ctx.reply(txt.slice(0, 4000), { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data === "muddy_ai_sum") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      const rows = await getRecentMuddyFeedback(env.telegram_bot_db);
      if (rows.length === 0) return void (await ctx.answerCallbackQuery({ text: "موردی وجود ندارد" }));
      await ctx.answerCallbackQuery({ text: "🤖 در حال تحلیل..." });
      const analysis = await summarizeMuddyPointsWithAI(env, rows);
      await ctx.reply(`🤖 تحلیل هوشمند گره‌های درسی کلاس و پیشنهاد رفع اشکال:\n\n${analysis}`.slice(0, 4050));
      return;
    }

    if (data === "muddy_clear") {
      if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
      await clearMuddyFeedback(env.telegram_bot_db);
      await ctx.answerCallbackQuery({ text: "🗑 پاکسازی شد" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply("✅ لیست مباحث گنگ پاکسازی شد.");
      return;
    }

    // ==================== فاز ۶ — ۷. گفتگو با دانشمندان و مفاخر تاریخ (🗣) ====================
    if (data === "hub_scientist") {
      const kb = new InlineKeyboard()
        .text("🩺 ابن‌سینا", "sci_pick_avicenna")
        .text("🔢 خوارزمی", "sci_pick_khwarizmi").row()
        .text("📜 فردوسی", "sci_pick_ferdowsi")
        .text("🍎 آیزاک نیوتن", "sci_pick_newton").row()
        .text("🌌 آلبرت انیشتین", "sci_pick_einstein")
        .text("🧪 ماری کوری", "sci_pick_curie");
      await ctx.answerCallbackQuery({ text: "🗣 صندلی داغ دانشمندان" });
      await ctx.reply(
        "🗣 *صندلی داغ گفتگو با مفاخر و دانشمندان بزرگ تاریخ*\n\n" +
        "دوست داری امروز با کدوم دانشمند یا شاعر بزرگ هم‌صحبت بشی و سوالات درسی و علمیت رو مستقیم از خودش بپرسی؟\n" +
        "💡 در پایان گفتگو می‌تونی خلاصه مصاحبه‌ت رو برای معلم بفرستی و پس از تایید امتیاز بگیری!",
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("sci_pick_")) {
      const sciKey = data.replace("sci_pick_", "");
      const persona = SCIENTIST_PERSONAS[sciKey] || SCIENTIST_PERSONAS.avicenna;
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "scientist_chat", sciKey });
      const kb = new InlineKeyboard()
        .text("📤 ارسال خلاصه مصاحبه به معلم (امتیاز)", "lab_req_scientist").row()
        .text("🏁 پایان گفتگو", "sci_stop");
      await ctx.answerCallbackQuery({ text: persona.name });
      await ctx.reply(`✨ *گفتگو با ${persona.name}*\n\n«${persona.intro}»\n\n✍️ سوالت رو بنویس:`, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }

    if (data === "sci_stop") {
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await ctx.answerCallbackQuery({ text: "پایان گفتگو" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      const kb = new InlineKeyboard().text("📤 ارسال خلاصه مصاحبه به معلم (امتیاز)", "lab_req_scientist");
      await ctx.reply("👏 گفتگوی علمی جذابی بود! اگر دوست داری نکاتی که یاد گرفتی رو برای معلم بفرستی تا امتیاز بگیری، روی دکمه زیر بزن:", {
        reply_markup: kb,
      });
      return;
    }

    if (data === "lab_req_scientist") {
      const log = await getBotState<{ count: number; samples: string[] }>(env.telegram_bot_db, `sci_session_${userId}`);
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await setBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`, {
        category: "scientist",
        title: "🗣 مصاحبه علمی با دانشمندان تاریخ",
        minutes: 0,
        metaNote: `تعداد پرسش‌وپاسخ‌های انجام‌شده: ${log?.count || 0}` + (log?.samples?.length ? `\nنمونه پرسش‌ها: ${log.samples.join(" | ")}` : ""),
      } as LabProofWaitState);
      await deleteBotState(env.telegram_bot_db, `sci_session_${userId}`);
      const cancelKb = new InlineKeyboard().text("❌ انصراف", "lab_proof_cancel");
      await ctx.answerCallbackQuery({ text: "📤 ارسال خلاصه مصاحبه" });
      await ctx.reply(
        "📤 *ارسال گزارش مصاحبه علمی به معلم*\n\nلطفاً در چند خط (متن یا ویس) بنویس یا بگو از گفتگوی امروزت با این دانشمند بزرگ چه نکته علمی یا تاریخی مهمی یاد گرفتی تا پس از تایید معلم امتیاز بگیری! 🌟",
        { parse_mode: "Markdown", reply_markup: cancelKb }
      );
      return;
    }

    // ==================== فاز ۶ — ۸. بازی کلمه‌چین و واژه علمی روزانه (🧩) ====================
    if (data === "hub_word_game") {
      const todayData = getTodayWordPuzzle();
      const solved = await getBotState<boolean>(env.telegram_bot_db, `word_solved_${todayData.dayKey}_${userId}`);
      await ctx.answerCallbackQuery({ text: "🧩 معمای واژه روز" });

      if (solved) {
        const kb = new InlineKeyboard().text("📤 جمله‌سازی علمی برای معلم (دریافت امتیاز)", "lab_req_word");
        return void (await ctx.reply(
          `🧩 *معمای واژه علمی امروز رو قبلاً حل کردی قهرمان!* 🎉\n\n` +
          `🔑 واژه امروز: *${todayData.puzzle.word}* (${todayData.puzzle.category})\n` +
          `💡 نکته علمی: ${todayData.puzzle.fact}\n\n` +
          `اگر می‌خوای بابت این واژه علمی امتیاز بگیری، یک جمله علمی یا توضیح کاربردی با آن بساز و برای معلم بفرست:`,
          { parse_mode: "Markdown", reply_markup: kb }
        ));
      }

      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "word_guess_wait", tries: 0 });
      const kb = new InlineKeyboard().text("💡 راهنمایی بیشتر", "word_hint2");
      await ctx.reply(
        `🧩 *چالش کلمه‌چین علمی امروز*\n\n` +
        `🏷 موضوع: *${todayData.puzzle.category}*\n` +
        `🔤 حروف به‌هم‌ریخته: \`${todayData.scrambled}\` (${todayData.puzzle.word.length} حرفی)\n` +
        `🔎 راهنمایی اول: ${todayData.puzzle.hint1}\n\n` +
        `✍️ حدس خودت رو بنویس و بفرست!`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data === "word_hint2") {
      const todayData = getTodayWordPuzzle();
      await ctx.answerCallbackQuery({ text: "💡 راهنمایی دوم" });
      await ctx.reply(`💡 *راهنمایی دوم:* ${todayData.puzzle.hint2}\nحرف اول واژه: «*${todayData.puzzle.word[0]}*»`, {
        parse_mode: "Markdown",
      });
      return;
    }

    if (data === "lab_req_word") {
      const todayData = getTodayWordPuzzle();
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await setBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`, {
        category: "word_puzzle",
        title: `🧩 واژه علمی روز (${todayData.puzzle.word})`,
        minutes: 0,
        metaNote: `واژه حل‌شده امروز: «${todayData.puzzle.word}» (${todayData.puzzle.category})`,
      } as LabProofWaitState);
      const cancelKb = new InlineKeyboard().text("❌ انصراف", "lab_proof_cancel");
      await ctx.answerCallbackQuery({ text: "📤 جمله‌سازی علمی" });
      await ctx.reply(
        `📤 *ارسال جمله‌سازی یا توضیح علمی واژه «${todayData.puzzle.word}» به معلم*\n\n` +
        `یک جمله علمی معنادار یا یک توضیح کوتاه با واژه «*${todayData.puzzle.word}*» (به صورت متن یا ویس) بفرست تا برای معلم ارسال شود و پس از تایید امتیاز بگیری! 🌟`,
        { parse_mode: "Markdown", reply_markup: cancelKb }
      );
      return;
    }

    // ==================== فاز ۶ — ۹. برنامه‌ریز هوشمند هفتگی شخصی (📅) ====================
    if (data === "hub_planner") {
      const savedPlan = await getBotState<string>(env.telegram_bot_db, `study_plan_${userId}`);
      await ctx.answerCallbackQuery({ text: "📅 برنامه‌ریز هفتگی" });
      if (savedPlan) {
        const kb = new InlineKeyboard()
          .text("📤 ارسال گزارش اجرای برنامه امروز به معلم (امتیاز)", "lab_req_plan").row()
          .text("🔄 طراحی برنامه هفتگی جدید", "plan_new");
        return void (await ctx.reply(`📅 *برنامه مطالعاتی هفتگی فعلی تو:*\n\n${savedPlan}`.slice(0, 4000), {
          reply_markup: kb,
        }));
      }
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "planner_wait" });
      await ctx.reply(
        "📅 *برنامه‌ریز هوشمند مطالعه هفتگی*\n\n" +
        "بنویس این هفته چه امتحان‌هایی در پیش داری، کدوم درس‌ها برات سخت‌ترن و روزی حدوداً چند ساعت وقت آزاد داری تا یک برنامه ۷ روزه دقیق برات بچینم!\n\n" +
        "مثال: `دوشنبه امتحان ریاضی دارم و چهارشنبه علوم، در عربی کمی ضعف دارم و روزی ۲ ساعت بعدازظهر وقت دارم`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (data === "plan_new") {
      await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "planner_wait" });
      await ctx.answerCallbackQuery({ text: "🔄 برنامه جدید" });
      await ctx.reply("✍️ امتحان‌های پیش‌رو و ساعت آزاد روزانه‌ت رو بنویس تا برنامه هفتگی جدیدت طراحی بشه:");
      return;
    }

    if (data === "lab_req_plan") {
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await setBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`, {
        category: "plan",
        title: "📅 اجرای برنامه مطالعاتی هفتگی",
        minutes: 0,
        metaNote: "گزارش انجام بخش روزانه برنامه مطالعاتی شخصی",
      } as LabProofWaitState);
      const cancelKb = new InlineKeyboard().text("❌ انصراف", "lab_proof_cancel");
      await ctx.answerCallbackQuery({ text: "📤 گزارش برنامه" });
      await ctx.reply(
        "📤 *ارسال مستندات اجرای برنامه امروز به معلم*\n\n" +
        "لطفاً خلاصه درس‌هایی که طبق برنامه‌ت امروز خوندی (متن، ویس یا عکس تیک خوردن برنامه و تمرین‌ها) رو بفرست تا پس از تایید معلم امتیاز بگیری! 🌟",
        { parse_mode: "Markdown", reply_markup: cancelKb }
      );
      return;
    }

    // ==================== فاز ۶ — ۱۰. شبیه‌ساز تعاملی آزمایشگاه علوم (🧪) ====================
    if (data === "hub_scilab") {
      const kb = new InlineKeyboard()
        .text("⚡ مدار الکتریکی و قانون اهم", "scilab_go_circuit").row()
        .text("🧪 اسید و باز و شناساگرها", "scilab_go_acid").row()
        .text("🌱 نور و دما در فتوسنتز", "scilab_go_photo").row()
        .text("🧊 گرما و تغییر حالت ماده", "scilab_go_states").row()
        .text("🔬 آزمایش دلخواه از کتاب درسی", "scilab_go_custom");
      await ctx.answerCallbackQuery({ text: "🧪 آزمایشگاه مجازی" });
      await ctx.reply(
        "🧪 *آزمایشگاه مجازی تعاملی علوم*\n\n" +
        "روپوش سفید آزمایشگاه رو بپوش! 🥼 یک آزمایش رو انتخاب کن، در ۳ مرحله فرضیه بده، نتیجه تغییر متغیرها رو ببین و در پایان گزارش‌کار آزمایش رو برای معلم بفرست تا امتیاز بگیری!",
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("scilab_go_")) {
      const key = data.replace("scilab_go_", "");
      if (key === "custom") {
        await setBotState(env.telegram_bot_db, `user_mode_${userId}`, { mode: "scilab_custom_topic" });
        await ctx.answerCallbackQuery({ text: "🔬 موضوع دلخواه" });
        return void (await ctx.reply("🔬 عنوان آزمایش مورد نظرت از کتاب علوم، فیزیک، شیمی یا زیست رو بنویس (مثال: `آزمایش چگالی اجسام در آب`):", { parse_mode: "Markdown" }));
      }
      const topic = SCIENCE_LAB_TOPICS[key] || SCIENCE_LAB_TOPICS.circuit;
      await ctx.answerCallbackQuery({ text: "🧪 آماده‌سازی میز آزمایش..." });
      const stepRes = await runScienceLabStepWithAI(env, topic, 0, []);
      const simState: ScienceLabState = {
        topic,
        step: 1,
        log: [`مرحله ۱: ${stepRes.text}`],
        lastQuestion: stepRes.text,
        options: stepRes.options,
      };
      await setBotState(env.telegram_bot_db, `scilab_state_${userId}`, simState);
      const kb = new InlineKeyboard();
      stepRes.options.forEach((opt, i) => kb.text(`🔹 ${opt}`, `scilab_ch_${i}`).row());
      await ctx.reply(`🧪 *${topic}* (مرحله ۱ از ۳)\n\n${stepRes.text}`, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data.startsWith("scilab_ch_")) {
      const idx = parseInt(data.replace("scilab_ch_", ""), 10);
      const sim = await getBotState<ScienceLabState>(env.telegram_bot_db, `scilab_state_${userId}`);
      if (!sim) return void (await ctx.answerCallbackQuery({ text: "آزمایش منقضی شده؛ دوباره شروع کن." }));
      const chosen = sim.options[idx] || sim.options[0] || "مشاهده اثر";
      await ctx.answerCallbackQuery({ text: `🔬 ${chosen}` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });

      const nextLog = [...sim.log, `انتخاب دانش‌آموز: ${chosen}`];
      const stepRes = await runScienceLabStepWithAI(env, sim.topic, sim.step, nextLog, chosen);

      if (stepRes.finished) {
        await setBotState(env.telegram_bot_db, `scilab_done_${userId}`, { topic: sim.topic, summary: stepRes.text });
        await deleteBotState(env.telegram_bot_db, `scilab_state_${userId}`);
        const kb = new InlineKeyboard().text("📤 ارسال گزارش‌کار آزمایش به معلم (دریافت امتیاز)", "lab_req_scilab");
        await ctx.reply(`🎉🔬 *پایان آزمایش «${sim.topic}» و نتیجه‌گیری علمی:*\n\n${stepRes.text}`, {
          parse_mode: "Markdown",
          reply_markup: kb,
        });
      } else {
        const nextStep = sim.step + 1;
        await setBotState(env.telegram_bot_db, `scilab_state_${userId}`, {
          topic: sim.topic,
          step: nextStep,
          log: [...nextLog, `مرحله ${nextStep}: ${stepRes.text}`],
          lastQuestion: stepRes.text,
          options: stepRes.options,
        } as ScienceLabState);
        const kb = new InlineKeyboard();
        stepRes.options.forEach((opt, i) => kb.text(`🔹 ${opt}`, `scilab_ch_${i}`).row());
        await ctx.reply(`🧪 *${sim.topic}* (مرحله ${nextStep} از ۳)\n\n${stepRes.text}`, {
          parse_mode: "Markdown",
          reply_markup: kb,
        });
      }
      return;
    }

    if (data === "lab_req_scilab") {
      const done = await getBotState<{ topic: string; summary: string }>(env.telegram_bot_db, `scilab_done_${userId}`);
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      await setBotState(env.telegram_bot_db, `lab_proof_wait_${userId}`, {
        category: "scilab",
        title: `🧪 گزارش‌کار آزمایشگاه (${done?.topic || "علوم"})`,
        minutes: 0,
        metaNote: `آزمایش تکمیل‌شده در شبیه‌ساز: ${done?.topic || "آزمایش علوم"}`,
      } as LabProofWaitState);
      const cancelKb = new InlineKeyboard().text("❌ انصراف", "lab_proof_cancel");
      await ctx.answerCallbackQuery({ text: "📤 گزارش‌کار آزمایش" });
      await ctx.reply(
        "📤 *ارسال گزارش‌کار آزمایش به معلم*\n\n" +
        "لطفاً به زبان خودت (به صورت متن یا ویس) بنویس یا بگو در این آزمایش چه تغییری انجام دادی و چه نتیجه علمی‌ای گرفتی تا پس از تایید معلم امتیاز بگیری! 🌟",
        { parse_mode: "Markdown", reply_markup: cancelKb }
      );
      return;
    }

    if (userId !== TEACHER_ID) return void (await ctx.answerCallbackQuery({ text: "دسترسی نداری!" }));
    if (data.startsWith("approve_")) { await ctx.answerCallbackQuery({ text: "✅" }); await ctx.editMessageReplyMarkup({ reply_markup: undefined }); await ctx.reply(`✅ تایید شد.`); }
    else if (data.startsWith("reject_")) {
      const hid = parseInt(data.replace("reject_", "")); const h = await getHomeworkById(env.telegram_bot_db, hid);
      if (h) { await deleteHomework(env.telegram_bot_db, hid); try { await bot.api.sendMessage(h.user_id, "❌ تکلیف رد شد."); } catch {} }
      await ctx.answerCallbackQuery({ text: "❌" }); await ctx.editMessageReplyMarkup({ reply_markup: undefined }); await ctx.reply(`❌ رد شد.`);
    } else if (data.startsWith("quick_")) {
      const p = data.split("_"), hid = parseInt(p[1]), amt = parseInt(p[2]); const h = await getHomeworkById(env.telegram_bot_db, hid);
      if (h) { const up = await updateScore(env.telegram_bot_db, h.user_id, amt); try { await bot.api.sendMessage(h.user_id, `🎉 +${amt} امتیاز! مجموع: ${up?.score}`); } catch {} }
      await ctx.answerCallbackQuery({ text: `✅ +${amt}` });
    }
  });

  // ------------------- ثبت‌نام و پیام‌های متنی -------------------
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;

    if (userId !== TEACHER_ID) {
      const step = (globalThis as any).regStep?.[userId];
      if (step === "name") {
        (globalThis as any).regStep[userId] = "grade";
        (globalThis as any).tempName = (globalThis as any).tempName || {};
        (globalThis as any).tempName[userId] = ctx.message.text;
        await ctx.reply("✅ اسم ثبت شد.\n\nحالا پایه تحصیلی‌ت رو بنویس (مثلاً: هفتم، هشتم، نهم):");
        return;
      } else if (step === "grade") {
        const name = (globalThis as any).tempName?.[userId];
        if (!name) { delete (globalThis as any).regStep[userId]; return void (await ctx.reply("خطا. دوباره /start بزن.")); }
        await saveStudent(env.telegram_bot_db, userId, name, ctx.message.text);
        delete (globalThis as any).regStep[userId]; delete (globalThis as any).tempName[userId];
        await ctx.reply(`✅ ثبت‌نام کامل شد!\n👤 ${name}\n🎓 ${ctx.message.text}\n\n🌟 خوش آمدی!`, { reply_markup: studentKeyboard() });
        try { await bot.api.sendMessage(TEACHER_ID, `📥 دانش‌آموز جدید: ${name} (${ctx.message.text})`); } catch {}
        return;
      }
    }

    if (userId === TEACHER_ID) {
      if (waitingBroadcast[TEACHER_ID]) {
        waitingBroadcast[TEACHER_ID] = false;
        await broadcastToAll(ctx, env, bot, { type: "text", text: ctx.message.text });
        return;
      }

      // اگر معلم در حال وارد کردن امتیاز دلخواه برای ماموریت دانش‌آموز است
      const customMissionState = await getBotState<{ missionId: number }>(env.telegram_bot_db, "teacher_mission_score");
      if (customMissionState?.missionId && !ctx.message.text.startsWith("/")) {
        const pts = parseInt(normalizeDigits(ctx.message.text).trim(), 10);
        if (isNaN(pts) || pts < 1 || pts > 500) {
          return void (await ctx.reply("❌ لطفاً یک عدد معتبر بین ۱ تا ۵۰۰ وارد کنید (یا برای لغو /cancel بزنید):"));
        }
        await deleteBotState(env.telegram_bot_db, "teacher_mission_score");
        const mission = await getMissionById(env.telegram_bot_db, customMissionState.missionId);
        if (!mission) return void (await ctx.reply("❌ ماموریت پیدا نشد."));
        if (mission.done === 1) return void (await ctx.reply("ℹ️ این ماموریت قبلاً تایید شده است."));

        await setMissionStatus(env.telegram_bot_db, mission.id, 1);
        const up = await updateScore(env.telegram_bot_db, mission.user_id, pts);
        const newBadges = await checkAndAwardBadges(env.telegram_bot_db, mission.user_id);

        await ctx.reply(`✅ ماموریت «${mission.name}» با موفقیت تایید شد و +${pts} امتیاز ثبت گردید (مجموع امتیاز دانش‌آموز: ${up?.score}).`);
        try {
          let stMsg = `🎉 تبریک ${mission.name} عزیز!\n✅ معلم ماموریت امروزت (${mission.mission}) رو تایید کرد و +${pts} امتیاز گرفتی! 🌟\n📊 مجموع امتیازت: ${up?.score}`;
          if (newBadges.length > 0) stMsg += `\n\n🏅 نشان جدید باز شد:\n${newBadges.map((b) => `• ${b}`).join("\n")}`;
          await bot.api.sendMessage(mission.user_id, stMsg);
        } catch {}
        return;
      }

      // اگر معلم در حال وارد کردن امتیاز دلخواه برای مستندات کارگاه یادگیری دانش‌آموز است
      const customLabState = await getBotState<{ subId: number }>(env.telegram_bot_db, "teacher_lab_score");
      if (customLabState?.subId && !ctx.message.text.startsWith("/")) {
        const pts = parseInt(normalizeDigits(ctx.message.text).trim(), 10);
        if (isNaN(pts) || pts < 1 || pts > 500) {
          return void (await ctx.reply("❌ لطفاً یک عدد معتبر بین ۱ تا ۵۰۰ وارد کنید (یا برای لغو /cancel بزنید):"));
        }
        await deleteBotState(env.telegram_bot_db, "teacher_lab_score");
        await approveLabSubmissionAndNotify(ctx, env, bot, customLabState.subId, pts, false);
        return;
      }

      // اگر معلم در ویزارد ساخت کوییز از PDF / متن درس است
      const pdfQuizState = await getBotState<{ step: string; sourceText?: string; sourceInfo?: string }>(
        env.telegram_bot_db,
        "teacher_pdf_quiz"
      );
      if (pdfQuizState && !ctx.message.text.startsWith("/")) {
        if (pdfQuizState.step === "await_source") {
          const lessonText = ctx.message.text.trim();
          if (lessonText.length < 40) {
            return void (await ctx.reply("⚠️ متن درس خیلی کوتاه است. لطفاً حداقل یک پاراگراف از درس بفرستید، یا فایل PDF / عکس صفحه کتاب را ارسال کنید:"));
          }
          await setBotState(env.telegram_bot_db, "teacher_pdf_quiz", {
            step: "pick_params",
            sourceText: lessonText.slice(0, 24000),
            sourceInfo: `متن درس (${lessonText.length} کاراکتر)`,
          });
          const snippet = lessonText.slice(0, 180).replace(/\s+/g, " ");
          await ctx.reply(
            `✅ متن درس دریافت شد (${lessonText.length} کاراکتر).\n🔍 پیش‌نمایش: «${snippet}...»\n\n📊 چند سوال و با چه امتیازی طراحی کنم؟`,
            { reply_markup: buildSourceQuizCountKeyboard() }
          );
          return;
        }

        if ((pdfQuizState.step === "custom_params" || pdfQuizState.step === "pick_params") && pdfQuizState.sourceText) {
          const normInput = normalizeDigits(ctx.message.text).trim();
          const parts = normInput.split("|").map((x) => x.trim());
          const qCount = parseInt(parts[0], 10);
          const qPoints = parts.length >= 2 ? parseInt(parts[1], 10) : 5;
          if (isNaN(qCount) || qCount < 1 || qCount > 20 || isNaN(qPoints) || qPoints < 1 || qPoints > 100) {
            return void (await ctx.reply("❌ فرمت نامعتبر است.\nلطفاً به صورت «تعداد | امتیاز» بنویسید (تعداد ۱ تا ۲۰، امتیاز ۱ تا ۱۰۰).\nمثال: 6 | 10"));
          }
          await deleteBotState(env.telegram_bot_db, "teacher_pdf_quiz");
          await createAndPreviewSourceQuizzes(
            ctx,
            env,
            bot,
            pdfQuizState.sourceText,
            pdfQuizState.sourceInfo || "متن درس",
            qCount,
            qPoints
          );
          return;
        }
      }

      // اگر معلم در یکی از حالت‌های ابزارهای جدید (جزوه‌ساز، امتحان‌ساز، فروشگاه، کارگاه یادگیری) است
      if (!ctx.message.text.startsWith("/") && (await handleSharedUserModeText(ctx, env, bot, userId, ctx.message.text))) {
        return;
      }

      // اگر معلم در حالت «❓ پرسش و پاسخ» است -> پاسخ آنلاین و هوشمند
      if (waitingAiQuestion[TEACHER_ID] && !ctx.message.text.startsWith("/")) {
        waitingAiQuestion[TEACHER_ID] = false;
        const question = ctx.message.text;
        const waitMsg = await ctx.reply("🤖 دارم فکر می‌کنم...");
        const aiResult = await askAI(env, question, async (statusText) => {
          try { await bot.api.editMessageText(ctx.chat.id, waitMsg.message_id, statusText); } catch {}
        });
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        await sendRichAiAnswer(ctx, env, bot, userId, question, aiResult, false);
        return;
      }

      return;
    }

    if ((globalThis as any).waitingBirthday?.[userId]) {
      delete (globalThis as any).waitingBirthday[userId];
      await processBirthday(ctx, env, userId, ctx.message.text);
      return;
    }

    // ========== اگر دانش‌آموز در حال ارسال خلاصه / مستندات «کارگاه یادگیری» (متنی) برای معلم است ==========
    if (!ctx.message.text.startsWith("/")) {
      const labWait = await getBotState<LabProofWaitState>(env.telegram_bot_db, `lab_proof_wait_${userId}`);
      if (labWait?.category) {
        if (ctx.message.text.trim().length < 10) {
          return void (await ctx.reply("⚠️ خلاصه ارسالی خیلی کوتاه است! لطفاً حداقل یک یا دو جمله از مطالبی که یاد گرفتی بنویس (یا ویس/عکس بفرست):"));
        }
        await submitLabProofToTeacher(ctx, env, bot, userId, labWait, "✍️ خلاصه متنی");
        return;
      }
    }

    // ========== اگر دانش‌آموز در یکی از ابزارهای کارگاه یادگیری یا دوئل موضوع دلخواه است ==========
    if (!ctx.message.text.startsWith("/") && (await handleSharedUserModeText(ctx, env, bot, userId, ctx.message.text))) {
      return;
    }

    // ========== اگر دانش‌آموز در حال ارسال گزارش ماموریت روز (متنی) است ==========
    if (!ctx.message.text.startsWith("/")) {
      const mWait = await getBotState<{ missionId: number }>(env.telegram_bot_db, `mission_wait_${userId}`);
      if (mWait?.missionId) {
        const student = await getStudent(env.telegram_bot_db, userId);
        const mission = await getMissionById(env.telegram_bot_db, mWait.missionId);
        await deleteBotState(env.telegram_bot_db, `mission_wait_${userId}`);
        if (student && mission) {
          await setMissionStatus(env.telegram_bot_db, mission.id, 2);
          await ctx.forwardMessage(TEACHER_ID);
          const kb = new InlineKeyboard()
            .text("✅ +2", `ms_ok_${mission.id}_2`)
            .text("✅ +5", `ms_ok_${mission.id}_5`)
            .text("✅ +10", `ms_ok_${mission.id}_10`)
            .text("✅ +15", `ms_ok_${mission.id}_15`)
            .row()
            .text("✏️ تایید با امتیاز دلخواه", `ms_custom_${mission.id}`)
            .text("❌ رد کردن", `ms_rej_${mission.id}`);
          await bot.api.sendMessage(
            TEACHER_ID,
            `🎯 گزارش انجام ماموریت روز (✍️ متن)\n` +
            `👤 دانش‌آموز: ${student.name}\n` +
            `📌 ماموریت: ${mission.mission}\n` +
            `🕐 ${formatDateTime(new Date().toISOString())}\n\n` +
            `👇 در صورت تایید، امتیاز مورد نظر را انتخاب کنید:`,
            { reply_markup: kb }
          );
          await ctx.reply("✅ آفرین! گزارش ماموریتت برای معلم ارسال شد.\n⏳ پس از بررسی و تایید معلم، امتیازت ثبت می‌شه و بهت خبر می‌دم! 🌟");
          return;
        }
      }
    }

    // ========== پاسخ به سوال دانش‌آموز با AI (متن) ==========
    if (waitingAiQuestion[userId]) {
      waitingAiQuestion[userId] = false;
      const question = ctx.message.text;
      const waitMsg = await ctx.reply("🤖 دارم فکر می‌کنم...");
      
      const aiResult = await askAI(env, question, async (statusText) => {
        try { await bot.api.editMessageText(ctx.chat.id, waitMsg.message_id, statusText); } catch {}
      });
      
      try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
      
      await sendRichAiAnswer(ctx, env, bot, userId, question, aiResult, false);
      return;
    }

    if (ctx.message.text.startsWith("/")) return;

    const menuBtns = [
      "❓ پرسش و پاسخ", "🎮 رقابت و جوایز", "🧠 کارگاه یادگیری",
      "🌟 امتیاز من", "🏆 رتبه من", "📤 ارسال تکلیف", "📅 تاریخچه من",
      "🏅 نشان‌های من", "🔥 استریک من", "📈 نمودار من", "🎂 تولد من",
      "🎯 ماموریت روز", "🏅 سطح من", "🖥 پنل من", "📖 راهنما",
    ];
    if (menuBtns.includes(ctx.message.text)) return;

    const student = await getStudent(env.telegram_bot_db, userId);
    if (!student) return void (await ctx.reply("اول /start بزن."));

    const hwId = await addHomework(env.telegram_bot_db, userId, student.name, "✍️ متن");
    await ctx.forwardMessage(TEACHER_ID);
    const streakResult = await updateStreak(env.telegram_bot_db, userId);
    const inlineKb = new InlineKeyboard().text("✅ تایید", `approve_${hwId}`).text("❌ رد", `reject_${hwId}`).row().text("⭐ +1", `quick_${hwId}_1`).text("⭐ +3", `quick_${hwId}_3`).text("⭐ +5", `quick_${hwId}_5`);
    const sent = await bot.api.sendMessage(TEACHER_ID, `📥 تکلیف متنی از: ${student.name}\n🆔 ID: ${hwId}\n🕐 ${formatDateTime(new Date().toISOString())}`, { reply_markup: inlineKb });
    await setTeacherMsgId(env.telegram_bot_db, hwId, sent.message_id);
    let replyMsg = "✅ تکلیف ارسال شد.";
    if (streakResult.isNew) replyMsg += `\n\n🔥 استریک: ${streakResult.streak} روز!`;
    replyMsg += `\n\n💬 ${getRandomMotivation()}`;
    await ctx.reply(replyMsg);
    const newBadges = await checkAndAwardBadges(env.telegram_bot_db, userId);
    if (newBadges.length > 0) await ctx.reply(`🏅 نشان جدید!\n${newBadges.map((b) => `• ${b}`).join("\n")}`);
  });

  // ------------------- تکالیف رسانه‌ای + ویس + عکس برای AI + فایل PDF کوییز/جزوه/امتحان + مدرک ماموریت -------------------
  bot.on(["message:photo", "message:video", "message:voice", "message:video_note", "message:document", "message:audio"], async (ctx) => {
    const userId = ctx.from?.id; if (!userId) return;
    const uMode = await getBotState<{
      mode: string;
      category?: string;
      expectedText?: string;
      dictTitle?: string;
    }>(env.telegram_bot_db, `user_mode_${userId}`);

    if (userId === TEACHER_ID) {
      if (waitingBroadcast[TEACHER_ID]) {
        waitingBroadcast[TEACHER_ID] = false;
        let content: any = null; const caption = ctx.message.caption || "";
        if (ctx.message.photo) content = { type: "photo", fileId: ctx.message.photo[ctx.message.photo.length - 1].file_id, text: caption };
        else if (ctx.message.video) content = { type: "video", fileId: ctx.message.video.file_id, text: caption };
        else if (ctx.message.voice) content = { type: "voice", fileId: ctx.message.voice.file_id, text: caption };
        else if (ctx.message.document) content = { type: "document", fileId: ctx.message.document.file_id, text: caption };
        if (content) await broadcastToAll(ctx, env, bot, content);
        return;
      }

      // ۰-الف. اگر معلم در حال افزودن فایل/رسانه به «📂 کتابخانه کلاس» است
      if (uMode?.mode === "library_add_wait") {
        await deleteBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`);
        const cat = uMode.category || "فایل و رسانه آموزشی";
        const cap = (ctx.message.caption || "").trim();
        let cType: LibraryItem["content_type"] = "document";
        let fid = "";
        let fallbackName = "منبع آموزشی";
        if (ctx.message.document) {
          cType = "document";
          fid = ctx.message.document.file_id;
          fallbackName = ctx.message.document.file_name || "فایل درسی";
        } else if (ctx.message.photo) {
          cType = "photo";
          fid = ctx.message.photo[ctx.message.photo.length - 1].file_id;
          fallbackName = "تصویر آموزشی";
        } else if (ctx.message.voice) {
          cType = "voice";
          fid = ctx.message.voice.file_id;
          fallbackName = "ویس تدریس معلم";
        } else if (ctx.message.video) {
          cType = "video";
          fid = ctx.message.video.file_id;
          fallbackName = "ویدیوی آموزشی";
        } else if (ctx.message.audio) {
          cType = "audio";
          fid = ctx.message.audio.file_id;
          fallbackName = ctx.message.audio.title || "فایل صوتی";
        }
        if (!fid) return void (await ctx.reply("❌ نوع فایل پشتیبانی نشد."));
        const title = (cap.split("\n")[0] || fallbackName).slice(0, 70);
        await addLibraryItem(env.telegram_bot_db, cat, title, cType, fid, cap);
        await ctx.reply(`✅ «${title}» با موفقیت در دسته «${cat}» کتابخانه کلاس ذخیره شد!`);
        return;
      }

      // ۰-ب. اگر معلم در حال ثبت «ویس دیکته جدید» برای کلاس است
      if (uMode?.mode === "dictation_teacher_set" && ctx.message.voice) {
        await deleteBotState(env.telegram_bot_db, `user_mode_${TEACHER_ID}`);
        const waitMsg = await ctx.reply("🎤 در حال ثبت ویس دیکته و استخراج متن مرجع برای تصحیح خودکار...");
        try {
          const tgFile = await ctx.api.getFile(ctx.message.voice.file_id);
          const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFile.file_path}`;
          const audioBuf = await (await fetchWithTimeout(fileUrl, {}, 15000)).arrayBuffer();
          const transcribed = await voiceToText(env, audioBuf, "fa");
          try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
          const title = (ctx.message.caption || `دیکته صوتی (${toJalali(new Date().toISOString())})`).slice(0, 60);
          await setBotState(env.telegram_bot_db, "active_dictation", {
            title,
            text: transcribed || "متن دیکته صوتی معلم",
            voiceFileId: ctx.message.voice.file_id,
          });
          await ctx.reply(`✅ ویس دیکته «${title}» ثبت شد!\n📝 متن مرجع تشخیص‌داده‌شده: «${(transcribed || "").slice(0, 200)}»`);
        } catch (e: any) {
          try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
          await ctx.reply(`❌ خطا در ثبت ویس دیکته: ${e.message}`);
        }
        return;
      }

      const isSummaryOrExam =
        uMode?.mode === "teacher_summary_wait" || uMode?.mode === "teacher_exam_wait"
          ? (uMode.mode as "teacher_summary_wait" | "teacher_exam_wait")
          : null;

      // ۱. اگر معلم فایل PDF (یا فایل متنی .txt) فرستاده باشد -> کوییز / جزوه‌ساز / امتحان‌ساز
      if (ctx.message.document) {
        const doc = ctx.message.document;
        const fileName = (doc.file_name || "").toLowerCase();
        const isPdf = doc.mime_type === "application/pdf" || fileName.endsWith(".pdf");
        const isTxt = (doc.mime_type || "").startsWith("text/") || fileName.endsWith(".txt");

        if (isPdf || isTxt) {
          if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
            return void (await ctx.reply("⚠️ حجم فایل بیش از ۲۰ مگابایت است (محدودیت ربات‌های تلگرام). لطفاً فقط فصل مورد نظر را بفرستید یا از صفحات درس عکس بگیرید و ارسال کنید."));
          }

          const waitMsg = await ctx.reply("📥 در حال دانلود و خواندن فایل درس...");
          try {
            const tgFile = await ctx.api.getFile(doc.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFile.file_path}`;
            const fileRes = await fetchWithTimeout(fileUrl, {}, 20000);
            if (!fileRes.ok) throw new Error("خطا در دانلود فایل از تلگرام");
            const fileBuffer = await fileRes.arrayBuffer();

            if (isTxt) {
              const txtContent = new TextDecoder("utf-8").decode(fileBuffer).trim();
              try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
              if (txtContent.length < 40) return void (await ctx.reply("❌ فایل متنی خالی یا بسیار کوتاه است."));
              if (isSummaryOrExam) {
                await deliverSummaryOrExam(ctx, env, bot, isSummaryOrExam, txtContent.slice(0, 24000), `فایل متنی ${doc.file_name || ""}`);
                return;
              }
              await setBotState(env.telegram_bot_db, "teacher_pdf_quiz", {
                step: "pick_params",
                sourceText: txtContent.slice(0, 24000),
                sourceInfo: `فایل متنی ${doc.file_name || ""}`,
              });
              const snippet = txtContent.slice(0, 180).replace(/\s+/g, " ");
              await ctx.reply(
                `✅ فایل متنی با موفقیت خوانده شد (${txtContent.length} کاراکتر).\n🔍 پیش‌نمایش: «${snippet}...»\n\n📊 چند سوال و با چه امتیازی طراحی کنم؟`,
                { reply_markup: buildSourceQuizCountKeyboard() }
              );
              return;
            }

            const extracted = await extractLessonFromPdf(env, fileBuffer, ctx.message.caption || "", async (msg) => {
              try { await bot.api.editMessageText(ctx.chat.id, waitMsg.message_id, msg); } catch {}
            });
            try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}

            if (!extracted.ok) {
              return void (await ctx.reply(extracted.info));
            }

            if (isSummaryOrExam) {
              await deliverSummaryOrExam(ctx, env, bot, isSummaryOrExam, extracted.text, extracted.info);
              return;
            }

            await setBotState(env.telegram_bot_db, "teacher_pdf_quiz", {
              step: "pick_params",
              sourceText: extracted.text,
              sourceInfo: extracted.info,
            });
            const snippet = extracted.text.replace(/\[صفحه \d+\]/g, "").trim().slice(0, 200).replace(/\s+/g, " ");
            await ctx.reply(
              `✅ محتوای درس با موفقیت استخراج شد!\n📌 منبع: ${extracted.info} (${extracted.text.length} کاراکتر)\n🔍 پیش‌نمایش متن خوانده‌شده:\n«${snippet}...»\n\n📊 چند سوال چهارگزینه‌ای طراحی کنم؟`,
              { reply_markup: buildSourceQuizCountKeyboard() }
            );
          } catch (e: any) {
            try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
            await ctx.reply(`❌ خطا در پردازش فایل: ${e.message}`);
          }
          return;
        }
      }

      // ۲. اگر معلم در حالت ساخت کوییز / جزوه‌ساز / امتحان‌ساز، عکس صفحه کتاب فرستاده باشد
      if (ctx.message.photo) {
        const pdfQuizState = await getBotState<{ step: string }>(env.telegram_bot_db, "teacher_pdf_quiz");
        if (pdfQuizState || isSummaryOrExam) {
          const waitMsg = await ctx.reply("📸 در حال خواندن متن فارسی صفحه درس با هوش مصنوعی بینایی...");
          try {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const tgFile = await ctx.api.getFile(photo.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFile.file_path}`;
            const imgRes = await fetchWithTimeout(fileUrl, {}, 15000);
            const imgBuf = await imgRes.arrayBuffer();
            const b64 = uint8ToBase64(new Uint8Array(imgBuf));
            const ocrText = await extractTextFromImagesWithVision(env, [`data:image/jpeg;base64,${b64}`]);
            try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}

            if (!ocrText || ocrText.length < 30) {
              return void (await ctx.reply("❌ متنی در تصویر تشخیص داده نشد. لطفاً عکس واضح‌تری از صفحه درس بفرستید."));
            }

            if (isSummaryOrExam) {
              await deliverSummaryOrExam(ctx, env, bot, isSummaryOrExam, ocrText.slice(0, 24000), "عکس صفحه کتاب/جزوه");
              return;
            }

            await setBotState(env.telegram_bot_db, "teacher_pdf_quiz", {
              step: "pick_params",
              sourceText: ocrText.slice(0, 24000),
              sourceInfo: "عکس صفحه کتاب/جزوه",
            });
            const snippet = ocrText.slice(0, 200).replace(/\s+/g, " ");
            await ctx.reply(
              `✅ متن صفحه درس با موفقیت خوانده شد (${ocrText.length} کاراکتر)!\n🔍 پیش‌نمایش: «${snippet}...»\n\n📊 چند سوال چهارگزینه‌ای طراحی کنم؟`,
              { reply_markup: buildSourceQuizCountKeyboard() }
            );
          } catch (e: any) {
            try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
            await ctx.reply(`❌ خطا در خواندن عکس: ${e.message}`);
          }
          return;
        }
      }

      // ۳. اگر معلم در حالت جزوه‌ساز یا امتحان‌ساز، ویس توضیحات تدریس فرستاده باشد
      if (ctx.message.voice && isSummaryOrExam) {
        const waitMsg = await ctx.reply("🎤 در حال تبدیل ویس تدریس به متن...");
        try {
          const tgFile = await ctx.api.getFile(ctx.message.voice.file_id);
          const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFile.file_path}`;
          const audioBuf = await (await fetchWithTimeout(fileUrl, {}, 15000)).arrayBuffer();
          const transcribed = await voiceToText(env, audioBuf, "fa");
          try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
          if (!transcribed || transcribed.trim().length < 15) {
            return void (await ctx.reply("❌ صدای واضحی تشخیص داده نشد؛ لطفاً دوباره ضبط کنید."));
          }
          await deliverSummaryOrExam(ctx, env, bot, isSummaryOrExam, transcribed, "ویس تدریس معلم");
        } catch (e: any) {
          try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
          await ctx.reply(`❌ خطا در پردازش ویس: ${e.message}`);
        }
        return;
      }

      // اگر معلم در حالت «❓ پرسش و پاسخ» یا «مکالمه انگلیسی» یا «تصحیح انشا/املا» ویس/عکس فرستاده باشد، ادامه بده
      const teacherSharedMediaAllowed =
        (waitingAiQuestion[TEACHER_ID] && (ctx.message.voice || ctx.message.photo)) ||
        (uMode?.mode === "english_chat" && ctx.message.voice) ||
        (uMode?.mode === "essay_review" && ctx.message.photo) ||
        (uMode?.mode === "dictation_student_photo" && ctx.message.photo);
      if (!teacherSharedMediaAllowed) {
        return;
      }
    }

    // ========== کارگاه یادگیری: تمرین مکالمه زبان انگلیسی با ویس (🎧) ==========
    if (uMode?.mode === "english_chat" && ctx.message.voice) {
      const waitMsg = await ctx.reply("🎤 Listening to your English voice...");
      try {
        const file = await ctx.api.getFile(ctx.message.voice.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const audioBuffer = await (await fetch(fileUrl)).arrayBuffer();
        const said = await voiceToText(env, audioBuffer, "en");
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        if (!said || said.trim().length < 2) {
          return void (await ctx.reply("❌ نتونستم جمله انگلیسی رو واضح بشنوم؛ لطفاً شمرده‌تر بگو! 🎤"));
        }
        await recordLabPracticeLog(env.telegram_bot_db, `eng_session_${userId}`, said);
        const turn = await runEnglishConversationTurn(env, said);
        const kb = new InlineKeyboard()
          .text("📤 ارسال مستندات مکالمه به معلم (امتیاز)", "lab_req_english").row()
          .text("🏁 پایان مکالمه انگلیسی", "eng_stop");
        await ctx.reply(
          `🎤 جمله شنیده‌شده از تو:\n"${said}"\n\n✏️ نکته آموزشی: ${turn.correctionFa}\n\n🗣 Teacher: ${turn.englishReply}\n🇮🇷 معنی: ${turn.persianMeaning}`,
          { reply_markup: kb }
        );
        const vBuf = await textToVoice(turn.englishReply, "en");
        if (vBuf) {
          try { await ctx.replyWithVoice(new InputFile(new Uint8Array(vBuf), "english_reply.ogg")); } catch {}
        }
      } catch {
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        await ctx.reply("❌ خطا در پردازش ویس انگلیسی.");
      }
      return;
    }

    // ========== کارگاه یادگیری: تصحیح هوشمند عکس دست‌نویس انشا (✍️) ==========
    if (uMode?.mode === "essay_review" && ctx.message.photo) {
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      const waitMsg = await ctx.reply("📸 در حال خواندن برگه انشا و تصحیح نگارشی...");
      try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const tgFile = await ctx.api.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFile.file_path}`;
        const imgBuf = await (await fetchWithTimeout(fileUrl, {}, 15000)).arrayBuffer();
        const b64 = uint8ToBase64(new Uint8Array(imgBuf));
        const ocrEssay = await extractTextFromImagesWithVision(env, [`data:image/jpeg;base64,${b64}`]);
        if (!ocrEssay || ocrEssay.length < 20) {
          try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
          return void (await ctx.reply("❌ متنی در عکس برگه انشا تشخیص داده نشد. لطفاً عکس واضح‌تری بفرست."));
        }
        const review = await evaluatePersianEssayWithAI(env, ocrEssay);
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        const kb = new InlineKeyboard().text("📤 ارسال انشای نهایی به معلم (دریافت امتیاز)", "lab_req_essay");
        await ctx.reply(`📝 نتیجه تصحیح انشای تصویری تو:\n\n${review}`.slice(0, 4050), { reply_markup: kb });
      } catch {
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        await ctx.reply("❌ خطا در خواندن عکس انشا.");
      }
      return;
    }

    // ========== کارگاه یادگیری: تصحیح هوشمند عکس برگه دیکته و ارسال به معلم (🎙) ==========
    if (uMode?.mode === "dictation_student_photo" && ctx.message.photo) {
      await deleteBotState(env.telegram_bot_db, `user_mode_${userId}`);
      const waitMsg = await ctx.reply("📸 در حال خواندن دست‌خط املا و بررسی کلمه‌به‌کلمه غلط‌های املایی...");
      try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const tgFile = await ctx.api.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgFile.file_path}`;
        const imgBuf = await (await fetchWithTimeout(fileUrl, {}, 15000)).arrayBuffer();
        const b64 = uint8ToBase64(new Uint8Array(imgBuf));
        const ocrDict = await extractTextFromImagesWithVision(env, [`data:image/jpeg;base64,${b64}`]);
        if (!ocrDict || ocrDict.length < 10) {
          try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
          return void (await ctx.reply("❌ دست‌خطی در تصویر برگه املا تشخیص داده نشد. لطفاً در نور کافی عکس واضح‌تری بفرست."));
        }
        const expected = uMode.expectedText || DEFAULT_DICTATION_TEXTS[0].text;
        const dictTitle = uMode.dictTitle || "آزمون املا";
        const aiCheck = await evaluateDictationWithAI(env, expected, ocrDict);
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        await ctx.reply(`🎙 *نتیجه غلط‌گیری اولیه هوش مصنوعی برای «${dictTitle}»:*\n\n${aiCheck}`.slice(0, 4050));

        // ارسال خودکار عکس برگه املا + گزارش تصحیح برای تایید و امتیازدهی معلم!
        await submitLabProofToTeacher(
          ctx,
          env,
          bot,
          userId,
          {
            category: "dictation",
            title: `🎙 آزمون دیکته (${dictTitle})`,
            minutes: 0,
            metaNote: `بررسی اولیه هوش مصنوعی:\n${aiCheck.slice(0, 500)}`,
          },
          "📸 عکس برگه املا"
        );
      } catch {
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        await ctx.reply("❌ خطا در بررسی عکس برگه املا.");
      }
      return;
    }

    // ========== اگر دانش‌آموز در حال ارسال مستندات «کارگاه یادگیری» (ویس/عکس/ویدیو/فایل) برای معلم است ==========
    if (userId !== TEACHER_ID) {
      const labWait = await getBotState<LabProofWaitState>(env.telegram_bot_db, `lab_proof_wait_${userId}`);
      if (labWait?.category) {
        let mType = "📄 فایل";
        if (ctx.message.photo) mType = "📷 عکس خلاصه/مستندات";
        else if (ctx.message.voice) mType = "🎤 ویس توضیح شفاهی";
        else if (ctx.message.video) mType = "🎥 ویدیو";
        else if (ctx.message.video_note) mType = "📹 ویدیو مسیج";
        else if (ctx.message.audio) mType = "🎵 فایل صوتی";
        await submitLabProofToTeacher(ctx, env, bot, userId, labWait, mType);
        return;
      }
    }

    // ========== اگر دانش‌آموز در حال ارسال گزارش فعالیت «ماموریت روز» (عکس/ویدیو/ویس/فایل) است ==========
    const mWait = await getBotState<{ missionId: number }>(env.telegram_bot_db, `mission_wait_${userId}`);
    if (mWait?.missionId) {
      const student = await getStudent(env.telegram_bot_db, userId);
      const mission = await getMissionById(env.telegram_bot_db, mWait.missionId);
      await deleteBotState(env.telegram_bot_db, `mission_wait_${userId}`);
      if (student && mission) {
        let mType = "📄 فایل";
        if (ctx.message.photo) mType = "📷 عکس";
        else if (ctx.message.video) mType = "🎥 ویدیو";
        else if (ctx.message.voice) mType = "🎤 ویس";
        else if (ctx.message.video_note) mType = "📹 ویدیو مسیج";
        else if (ctx.message.audio) mType = "🎵 صوتی";

        await setMissionStatus(env.telegram_bot_db, mission.id, 2);
        await ctx.forwardMessage(TEACHER_ID);
        const kb = new InlineKeyboard()
          .text("✅ +2", `ms_ok_${mission.id}_2`)
          .text("✅ +5", `ms_ok_${mission.id}_5`)
          .text("✅ +10", `ms_ok_${mission.id}_10`)
          .text("✅ +15", `ms_ok_${mission.id}_15`)
          .row()
          .text("✏️ تایید با امتیاز دلخواه", `ms_custom_${mission.id}`)
          .text("❌ رد کردن", `ms_rej_${mission.id}`);
        await bot.api.sendMessage(
          TEACHER_ID,
          `🎯 گزارش انجام ماموریت روز (${mType})\n` +
          `👤 دانش‌آموز: ${student.name}\n` +
          `📌 ماموریت: ${mission.mission}\n` +
          `🕐 ${formatDateTime(new Date().toISOString())}\n\n` +
          `👇 در صورت تایید، امتیاز مورد نظر را انتخاب کنید:`,
          { reply_markup: kb }
        );
        await ctx.reply("✅ آفرین! گزارش ماموریتت برای معلم ارسال شد.\n⏳ پس از بررسی و تایید معلم، امتیازت ثبت می‌شه و بهت خبر می‌دم! 🌟");
        return;
      }
    }

    // ========== اگر دانش‌آموز در حالت پرسش و پاسخ ویس فرستاده بود ==========
    if (waitingAiQuestion[userId] && ctx.message.voice) {
      waitingAiQuestion[userId] = false;
      const waitMsg = await ctx.reply("🎤 در حال تبدیل ویس به متن...");
      
      try {
        const file = await ctx.api.getFile(ctx.message.voice.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const audioRes = await fetch(fileUrl);
        const audioBuffer = await audioRes.arrayBuffer();
        
        const transcribedText = await voiceToText(env, audioBuffer);
        
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        
        if (!transcribedText || transcribedText.trim().length < 2) {
          return void (await ctx.reply("❌ نتونستم متنت رو تشخیص بدم. لطفاً واضح‌تر ضبط کن یا تایپ کن."));
        }
        
        const thinkingMsg = await ctx.reply(`📝 متن سوال تو:\n\n${transcribedText}\n\n⏳ در حال جواب دادن...`);
        
        const aiResult = await askAI(env, transcribedText, async (statusText) => {
          try {
            await bot.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, `📝 متن سوال تو:\n\n${transcribedText}\n\n${statusText}`);
          } catch {}
        });
        
        await sendRichAiAnswer(ctx, env, bot, userId, transcribedText, aiResult, true);
        
      } catch (e: any) {
        console.error("Voice process error:", e);
        await ctx.reply(`❌ خطا در پردازش ویس. لطفاً دوباره تلاش کن.`);
      }
      return;
    }

    // ========== اگر کاربر (دانش‌آموز یا معلم) در حالت پرسش و پاسخ عکس فرستاده بود (تحلیل تکلیف/سوال) ==========
    if (waitingAiQuestion[userId] && ctx.message.photo) {
      waitingAiQuestion[userId] = false;
      const waitMsg = await ctx.reply("📸 در حال تحلیل عکس با هوش مصنوعی...");
      
      try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const file = await ctx.api.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const imgRes = await fetch(fileUrl);
        const imgBuffer = await imgRes.arrayBuffer();
        
        const analysis = await analyzeHomeworkImage(env, imgBuffer);
        
        try { await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch {}
        
        try {
          await ctx.reply(`📝 *نتیجه بررسی:*\n\n${analysis}`, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(`📝 نتیجه بررسی:\n\n${analysis}`);
        }
        
        // ارسال صدای پاسخ
        const voiceBuffer = await textToVoice(analysis);
        if (voiceBuffer) {
          try {
            await ctx.replyWithVoice(new InputFile(new Uint8Array(voiceBuffer), "response.ogg"));
          } catch (e) {
            console.error("Voice send error:", e);
          }
        }
        
        // فوروارد به معلم (فقط وقتی ارسال‌کننده دانش‌آموز باشد)
        if (userId !== TEACHER_ID) {
          try {
            await ctx.forwardMessage(TEACHER_ID);
            await bot.api.sendMessage(TEACHER_ID, `📸 عکس تکلیف بررسی‌شده توسط AI\n\n👤 دانش‌آموز: ${(await getStudent(env.telegram_bot_db, userId))?.name || "ناشناس"}\n\n📝 نتیجه: ${analysis}`.slice(0, 4000));
          } catch (e) {}
        }
        
        // پرسیدن سوال بعدی
        const kb = new InlineKeyboard().text("✅ بله", `ai_continue_yes_${userId}`).text("❌ خیر", `ai_continue_no`);
        await ctx.reply("❓ آیا سوال دیگه‌ای داری؟", { reply_markup: kb });
        
      } catch (e: any) {
        console.error("Image process error:", e);
        await ctx.reply(`❌ خطا در تحلیل عکس. لطفاً دوباره تلاش کن.`);
      }
      return;
    }

    if (userId === TEACHER_ID) return;

    // ========== اگر دانش‌آموز در حالت عادی فایل فرستاده بود ==========
    const student = await getStudent(env.telegram_bot_db, userId); if (!student?.name) return void (await ctx.reply("اول ثبت‌نام کن."));
    if ((globalThis as any).waitingBirthday?.[userId]) return void (await ctx.reply("⚠️ فقط عدد بفرست."));
    let type = "📄 فایل";
    if (ctx.message.photo) type = "📷 عکس"; else if (ctx.message.video) type = "🎥 ویدیو"; else if (ctx.message.voice) type = "🎤 ویس"; else if (ctx.message.video_note) type = "📹 ویدیو مسیج"; else if (ctx.message.document) type = "📄 فایل"; else if (ctx.message.audio) type = "🎵 صوتی";
    const hwId = await addHomework(env.telegram_bot_db, userId, student.name, type);
    await ctx.forwardMessage(TEACHER_ID);
    const streakResult = await updateStreak(env.telegram_bot_db, userId);
    const inlineKb = new InlineKeyboard().text("✅ تایید", `approve_${hwId}`).text("❌ رد", `reject_${hwId}`).row().text("⭐ +1", `quick_${hwId}_1`).text("⭐ +3", `quick_${hwId}_3`).text("⭐ +5", `quick_${hwId}_5`);
    const sent = await bot.api.sendMessage(TEACHER_ID, `📥 تکلیف از: ${student.name}\n📎 ${type}\n🆔 ID: ${hwId}\n🕐 ${formatDateTime(new Date().toISOString())}`, { reply_markup: inlineKb });
    await setTeacherMsgId(env.telegram_bot_db, hwId, sent.message_id);
    let replyMsg = "✅ تکلیف ارسال شد.";
    if (streakResult.isNew) replyMsg += `\n\n🔥 استریک: ${streakResult.streak} روز!`;
    replyMsg += `\n\n💬 ${getRandomMotivation()}`;
    await ctx.reply(replyMsg);
    const newBadges = await checkAndAwardBadges(env.telegram_bot_db, userId);
    if (newBadges.length > 0) await ctx.reply(`🏅 نشان جدید!\n${newBadges.map((b) => `• ${b}`).join("\n")}`);
  });

  return bot;
}

// ==================== فاز ۷: وب‌اپ و اپلیکیشن اندروید ۳ پنله ====================
// ==================== رابط کاربری اپلیکیشن موبایل و وب‌اپ ۳ پنله «کلاس هوشمند» ====================

const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="50%" stop-color="#1E1B4B"/>
      <stop offset="100%" stop-color="#312E81"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="50%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="116" fill="url(#bg)"/>
  <rect x="28" y="28" width="456" height="456" rx="92" fill="none" stroke="url(#gold)" stroke-width="8" opacity="0.85"/>
  <!-- کلاه فارغ‌التحصیلی و کتاب درخشان -->
  <polygon points="256,108 96,184 256,260 416,184" fill="url(#gold)"/>
  <path d="M156,218 L156,304 C156,338 202,364 256,364 C310,364 356,338 356,304 L356,218 L256,268 Z" fill="#E0E7FF"/>
  <line x1="396" y1="192" x2="396" y2="306" stroke="#FDE68A" stroke-width="14" stroke-linecap="round"/>
  <circle cx="396" cy="318" r="16" fill="#F59E0B"/>
  <circle cx="256" cy="416" r="10" fill="#FDE68A"/>
  <circle cx="216" cy="416" r="7" fill="#818CF8"/>
  <circle cx="296" cy="416" r="7" fill="#818CF8"/>
</svg>`;

function buildManifestJson(): string {
  return JSON.stringify(
    {
      name: "کلاس هوشمند — نیما آزمکان",
      short_name: "کلاس هوشمند",
      description: "اپلیکیشن هوشمند مدیریت کلاس، کارگاه یادگیری و کارنامه اولیا",
      start_url: "/app",
      display: "standalone",
      dir: "rtl",
      lang: "fa",
      background_color: "#0F172A",
      theme_color: "#0F172A",
      orientation: "portrait",
      icons: [
        {
          src: "/app-icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    },
    null,
    2
  );
}

function buildServiceWorkerJs(): string {
  return `
const CACHE_NAME = 'smart-class-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
`;
}

function buildAppHtml(defaultApiBase: string = ""): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#0F172A" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" type="image/svg+xml" href="/app-icon.svg" />
  <title>کلاس هوشمند — دستیار آموزشی</title>
  <style>
    :root {
      --bg: #0B1120;
      --surface: #151F32;
      --surface-2: #1E293B;
      --border: rgba(148, 163, 184, 0.16);
      --primary: #6366F1;
      --primary-dark: #4F46E5;
      --gold: #F59E0B;
      --gold-light: #FDE68A;
      --emerald: #10B981;
      --rose: #F43F5E;
      --sky: #0EA5E9;
      --text: #F8FAFC;
      --muted: #94A3B8;
      --radius: 18px;
      --safe-bottom: env(safe-area-inset-bottom, 0px);
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0; padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
      font-size: 14.5px;
      line-height: 1.65;
      overflow-x: hidden;
      min-height: 100vh;
    }
    button, input, textarea, select {
      font-family: inherit;
      font-size: 14px;
    }
    .app-shell {
      max-width: 540px;
      margin: 0 auto;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding-bottom: calc(78px + var(--safe-bottom));
    }
    .topbar {
      position: sticky; top: 0; z-index: 50;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--border);
      padding: 12px 16px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-logo {
      width: 38px; height: 38px; border-radius: 12px;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; box-shadow: 0 4px 14px rgba(99,102,241,0.35);
    }
    .brand-title { font-weight: 800; font-size: 15.5px; color: #fff; }
    .brand-sub { font-size: 11.5px; color: var(--gold-light); }
    .icon-btn {
      background: var(--surface-2); border: 1px solid var(--border);
      color: var(--text); border-radius: 11px; padding: 7px 11px;
      cursor: pointer; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px;
    }
    .container { padding: 14px; flex: 1; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 15px;
      margin-bottom: 13px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.22);
    }
    .hero-card {
      background: linear-gradient(135deg, #1E1B4B 0%, #312E81 55%, #1E293B 100%);
      border: 1px solid rgba(245, 158, 11, 0.35);
      position: relative; overflow: hidden;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .stat-box {
      background: rgba(15, 23, 42, 0.58);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px;
      text-align: center;
    }
    .stat-val { font-size: 19px; font-weight: 800; color: var(--gold-light); }
    .stat-lbl { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
    .btn {
      width: 100%; border: none; border-radius: 13px; padding: 11px 14px;
      font-weight: 700; cursor: pointer; transition: transform 0.12s, opacity 0.15s;
      display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      color: #fff; background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    }
    .btn:active { transform: scale(0.98); }
    .btn-gold { background: linear-gradient(135deg, #F59E0B, #D97706); color: #0F172A; }
    .btn-emerald { background: linear-gradient(135deg, #10B981, #059669); }
    .btn-rose { background: linear-gradient(135deg, #F43F5E, #E11D48); }
    .btn-ghost { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); }
    .btn-sm { width: auto; padding: 6px 11px; font-size: 12.5px; border-radius: 10px; }
    .input, textarea, select {
      width: 100%; background: #0F172A; border: 1px solid var(--border);
      color: var(--text); border-radius: 12px; padding: 11px 12px;
      margin-bottom: 10px; outline: none;
    }
    .input:focus, textarea:focus { border-color: var(--primary); }
    .role-tabs, .sub-tabs {
      display: flex; gap: 6px; background: #0F172A; padding: 5px;
      border-radius: 14px; border: 1px solid var(--border); margin-bottom: 14px;
    }
    .role-tab {
      flex: 1; text-align: center; padding: 9px 6px; border-radius: 10px;
      font-weight: 700; font-size: 13px; cursor: pointer; color: var(--muted);
      border: none; background: transparent;
    }
    .role-tab.active {
      background: linear-gradient(135deg, var(--primary), #7C3AED);
      color: #fff; box-shadow: 0 3px 10px rgba(99,102,241,0.35);
    }
    .bottom-nav {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 60;
      max-width: 540px; margin: 0 auto;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(16px);
      border-top: 1px solid var(--border);
      display: flex; justify-content: space-around;
      padding: 6px 4px calc(6px + var(--safe-bottom));
    }
    .nav-item {
      flex: 1; border: none; background: transparent; color: var(--muted);
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      font-size: 10.5px; font-weight: 600; padding: 5px 2px; cursor: pointer;
    }
    .nav-item .nav-ic { font-size: 19px; transition: transform 0.15s; }
    .nav-item.active { color: var(--gold-light); }
    .nav-item.active .nav-ic { transform: translateY(-2px) scale(1.1); }
    .badge-pill {
      display: inline-block; padding: 3px 9px; border-radius: 99px;
      font-size: 11.5px; font-weight: 700; background: rgba(99,102,241,0.18);
      color: #C7D2FE; border: 1px solid rgba(99,102,241,0.35); margin: 2px;
    }
    .tool-tile {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 15px; padding: 13px 10px; text-align: center;
      cursor: pointer; transition: transform 0.12s, border-color 0.15s;
    }
    .tool-tile:active { transform: scale(0.97); border-color: var(--gold); }
    .tool-tile .ic { font-size: 26px; display: block; margin-bottom: 5px; }
    .tool-tile .tt { font-weight: 700; font-size: 13px; color: #fff; }
    .tool-tile .ds { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .progress-bar {
      width: 100%; height: 9px; background: rgba(15,23,42,0.8);
      border-radius: 99px; overflow: hidden; margin-top: 8px;
    }
    .progress-fill {
      height: 100%; background: linear-gradient(90deg, #F59E0B, #FDE68A);
      border-radius: 99px; transition: width 0.35s ease;
    }
    .chat-box {
      max-height: 52vh; overflow-y: auto; padding: 8px;
      background: #0F172A; border-radius: 14px; border: 1px solid var(--border);
      margin-bottom: 10px;
    }
    .bubble {
      padding: 10px 13px; border-radius: 14px; margin-bottom: 9px;
      max-width: 88%; white-space: pre-wrap; word-break: break-word; font-size: 13.5px;
    }
    .bubble-me { background: var(--primary-dark); color: #fff; margin-left: auto; border-bottom-right-radius: 4px; }
    .bubble-ai { background: var(--surface-2); color: var(--text); margin-right: auto; border-bottom-left-radius: 4px; border: 1px solid var(--border); }
    .toast {
      position: fixed; top: 68px; left: 50%; transform: translateX(-50%);
      background: #1E293B; color: #fff; border: 1px solid var(--gold);
      padding: 10px 18px; border-radius: 12px; z-index: 200;
      box-shadow: 0 10px 30px rgba(0,0,0,0.45); font-weight: 700; font-size: 13px;
      display: none; max-width: 90%; text-align: center;
    }
    .timer-ring {
      width: 170px; height: 170px; border-radius: 50%; margin: 12px auto;
      border: 7px solid var(--gold); display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: radial-gradient(circle, #1E1B4B, #0F172A);
      box-shadow: 0 0 28px rgba(245,158,11,0.22);
    }
    .timer-digits { font-size: 34px; font-weight: 900; color: var(--gold-light); letter-spacing: 1px; direction: ltr; }
    .flip-card {
      background: linear-gradient(135deg, #1E293B, #0F172A);
      border: 2px solid var(--primary); border-radius: 18px;
      padding: 24px 16px; min-height: 150px; text-align: center;
      display: flex; flex-direction: column; justify-content: center;
      cursor: pointer; margin-bottom: 12px;
    }
    .att-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 10px; border-bottom: 1px solid var(--border); gap: 8px;
    }
    .att-row:last-child { border-bottom: none; }
    img.resp-img { width: 100%; border-radius: 12px; margin-top: 8px; border: 1px solid var(--border); }
    .muted { color: var(--muted); font-size: 12.5px; }
    .section-title { font-size: 15px; font-weight: 800; margin: 4px 0 10px; display: flex; align-items: center; gap: 6px; }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 150;
      display: none; align-items: center; justify-content: center; padding: 16px;
    }
    .modal-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 18px; padding: 18px; width: 100%; max-width: 440px; max-height: 86vh; overflow-y: auto;
    }
  </style>
</head>
<body>
  <div id="toast" class="toast"></div>

  <div class="app-shell" id="appShell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-logo">🎓</div>
        <div>
          <div class="brand-title">کلاس هوشمند</div>
          <div class="brand-sub" id="headerSub">معلم، دانش‌آموز و اولیا</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="icon-btn" onclick="openServerModal()" title="تنظیمات اتصال">⚙️</button>
        <button class="icon-btn" id="logoutBtn" style="display:none;" onclick="doLogout()">خروج 🚪</button>
      </div>
    </header>

    <main class="container" id="mainView"></main>
    <nav class="bottom-nav" id="bottomNav" style="display:none;"></nav>
  </div>

  <!-- مودال تنظیم آدرس سرور -->
  <div class="modal-backdrop" id="serverModal">
    <div class="modal-card">
      <div class="section-title">⚙️ آدرس سرور کلاس هوشمند</div>
      <p class="muted">اپلیکیشن به صورت پیش‌فرض به سرور کلودفلر کلاس متصل است. فقط در صورت تغییر دامنه آن را ویرایش کنید:</p>
      <input id="serverUrlInput" class="input" dir="ltr" placeholder="https://my-telegram-bot.nimaazemkan.workers.dev" />
      <div class="grid-2">
        <button class="btn" onclick="saveServerUrl()">ذخیره</button>
        <button class="btn btn-ghost" onclick="closeServerModal()">بستن</button>
      </div>
    </div>
  </div>

  <script>
    const BUILTIN_API_BASE = ${JSON.stringify(defaultApiBase)};
    function getApiBase() {
      const saved = localStorage.getItem("sc_api_base");
      if (saved !== null && saved.trim() !== "") return saved.replace(/\\/+$/, "");
      if (BUILTIN_API_BASE) return BUILTIN_API_BASE.replace(/\\/+$/, "");
      return "";
    }

    let session = null;
    try { session = JSON.parse(localStorage.getItem("sc_session") || "null"); } catch {}

    let activeTab = "home";
    let activeLabTool = null;
    let pomoInterval = null;
    let pomoState = null; // { targetMin, startedAt, finished }
    let qaHistory = [];
    let engHistory = [];
    let sciHistory = [];
    let activeSciKey = "avicenna";
    let leitnerDeck = [];
    let leitnerIdx = 0;
    let leitnerFlipped = false;
    let leitnerReviewedCount = 0;

    function showToast(msg) {
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.style.display = "block";
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => { el.style.display = "none"; }, 3200);
    }

    function openServerModal() {
      document.getElementById("serverUrlInput").value = getApiBase() || window.location.origin;
      document.getElementById("serverModal").style.display = "flex";
    }
    function closeServerModal() {
      document.getElementById("serverModal").style.display = "none";
    }
    function cleanServerInputUrl(raw) {
      let v = String(raw || "").trim();
      if (!v) return "";
      if (!/^https?:\/\//i.test(v)) v = "https://" + v;
      v = v.replace(/\/app\/?$/i, "").replace(/\/setup\/?$/i, "").replace(/\/+$/, "");
      return v;
    }
    function saveServerUrl() {
      const v = cleanServerInputUrl(document.getElementById("serverUrlInput").value);
      localStorage.setItem("sc_api_base", v);
      closeServerModal();
      showToast("✅ آدرس سرور جدید ذخیره شد: " + (v || "پیش‌فرض"));
      renderApp();
    }

    function normDigits(str) {
      return String(str || "")
        .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
        .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
        .trim();
    }

    function deriveCodesForUser(userId) {
      const uid = Number(userId) || 0;
      let seedA = Math.abs((uid * 7919 + 135791) % 899999) + 100000;
      let seedB = Math.abs((uid * 6151 + 482713) % 899999) + 100000;
      if (seedB === seedA) seedB = ((seedB + 111111 - 100000) % 899999) + 100000;
      const sCode = String((seedA % 899999) + 100000).slice(0, 6);
      const pCode = String((seedB % 899999) + 100000).slice(0, 6);
      return { student_code: sCode, student_pin: "1234", parent_code: pCode };
    }

    async function fetchJsonSafe(url, opts) {
      const res = await fetch(url, opts);
      const txt = await res.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : {}; } catch { data = null; }
      return { res, txt, data };
    }

    // پل سازگاری خودکار برای حالتی که کد جدید ربات هنوز روی کلودفلر دیپلوی نشده باشد
    async function legacyApiFallback(base, path, body, method) {
      window._usingLegacyWorker = true;

      if (path === "/api/app/login") {
        if (body.role === "teacher") {
          const r = await fetchJsonSafe(base + "/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: body.password })
          });
          if (!r.res.ok || !r.data?.ok) throw new Error(r.data?.error || "رمز مدیریت اشتباه است.");
          return { session: { role: "teacher", name: "استاد نیما آزمکان", token: "legacy-teacher" } };
        }

        const dash = await fetchJsonSafe(base + "/api/dashboard", { method: "GET" });
        if (!dash.res.ok || !dash.data?.students) throw new Error("خطا در دریافت لیست کلاس از سرور");
        const cleanCode = normDigits(body.code);

        if (body.role === "student") {
          const cleanPin = normDigits(body.pin || "1234");
          const found = dash.data.students.find(s => {
            const c = deriveCodesForUser(s.user_id);
            return c.student_code === cleanCode || String(s.user_id) === cleanCode;
          });
          if (!found || (cleanPin !== "1234" && cleanPin !== "")) {
            throw new Error("کد دانش‌آموزی یا رمز عبور اشتباه است (رمز پیش‌فرض: 1234).");
          }
          return { session: { role: "student", userId: found.user_id, name: found.name, token: "legacy-st-" + found.user_id } };
        }

        if (body.role === "parent") {
          const found = dash.data.students.find(s => deriveCodesForUser(s.user_id).parent_code === cleanCode);
          if (!found) throw new Error("کد اختصاصی والدین معتبر نیست. کد ۶ رقمی اولیا را از پنل معلم دریافت کنید.");
          return { session: { role: "parent", studentId: found.user_id, studentName: found.name, token: "legacy-par-" + found.user_id } };
        }
      }

      if (path === "/api/app/teacher/overview") {
        const dash = await fetchJsonSafe(base + "/api/dashboard", { method: "GET" });
        if (!dash.res.ok || !dash.data) throw new Error("خطا در دریافت اطلاعات داشبورد معلم");
        const students = (dash.data.students || []).map(s => ({
          ...s,
          ...deriveCodesForUser(s.user_id)
        }));
        return {
          students,
          pendingLab: [],
          pendingShop: [],
          recentHw: [],
          deadlines: (dash.data.deadlines || []).map(d => ({ id: d.id, title: d.title, due_date: d.dueDate || d.due_date || "" })),
          muddy: [],
          attendanceToday: {},
          todayJalali: dash.data.updatedAt || "امروز",
          teams: [],
          parentMessages: [],
          unreadParentCount: 0,
          legacyNotice: true
        };
      }

      if (path === "/api/app/teacher/score" && body) {
        const r = await fetchJsonSafe(base + "/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: Number(body.userId), amount: Number(body.delta) })
        });
        if (!r.res.ok || !r.data?.ok) throw new Error("خطا در ثبت امتیاز");
        return { ok: true };
      }

      if (path === "/api/app/student/overview" && session?.userId) {
        const [stRes, dashRes] = await Promise.all([
          fetchJsonSafe(base + "/api/student/" + session.userId, { method: "GET" }),
          fetchJsonSafe(base + "/api/dashboard", { method: "GET" })
        ]);
        if (!stRes.res.ok || !stRes.data?.my) throw new Error("اطلاعات دانش‌آموز یافت نشد");
        const my = stRes.data.my;
        return {
          student: { user_id: session.userId, name: my.name, score: my.score, streak: my.streak || 0, grade: my.grade || "" },
          levelName: my.level || "🌱 تازه‌کار",
          nextLevel: null,
          rank: my.rank || 1,
          totalStudents: my.totalStudents || 1,
          weeklyStudyMin: 0,
          badges: (my.badges || []).map(b => ({ badge: b.name || b.badge, date: b.date })),
          mission: { id: 0, mission: "برای فعال شدن ماموریت و کارگاه هوشمند، نسخه جدید ربات را در کلودفلر دیپلوی کنید.", done: 0 },
          deadlines: ((dashRes.data && dashRes.data.deadlines) || []).map(d => ({ id: d.id, title: d.title, due_date: d.dueDate || d.due_date || "" })),
          credentials: deriveCodesForUser(session.userId),
          legacyNotice: true
        };
      }

      if (path === "/api/app/arena" && session?.userId) {
        const stRes = await fetchJsonSafe(base + "/api/student/" + session.userId, { method: "GET" });
        const my = stRes.data?.my || { score: 0 };
        return {
          score: my.score || 0,
          latestQuiz: null,
          wordPuzzle: { category: "علوم", scrambled: "ف ت و س ن ت ز", hint1: "فرآیند غذاسازی گیاهان با نور خورشید", word: "", fact: "", solved: false },
          shopItems: [],
          leaderboard: stRes.data?.leaderboard || []
        };
      }

      if (path === "/api/app/student/history" && session?.userId) {
        const stRes = await fetchJsonSafe(base + "/api/student/" + session.userId, { method: "GET" });
        return {
          homework: stRes.data?.my?.homework || [],
          labSubmissions: [],
          certificates: []
        };
      }

      if (path === "/api/app/parent/overview" && session?.studentId) {
        const [stRes, dashRes] = await Promise.all([
          fetchJsonSafe(base + "/api/student/" + session.studentId, { method: "GET" }),
          fetchJsonSafe(base + "/api/dashboard", { method: "GET" })
        ]);
        if (!stRes.res.ok || !stRes.data?.my) throw new Error("اطلاعات فرزند یافت نشد");
        const my = stRes.data.my;
        return {
          student: { user_id: session.studentId, name: my.name, score: my.score, streak: my.streak || 0, grade: my.grade || "" },
          levelName: my.level || "🌱 تازه‌کار",
          rank: my.rank || 1,
          totalStudents: my.totalStudents || 1,
          quizAccuracy: "ثبت‌نشده",
          weeklyStudyMin: 0,
          weeklyHwCount: (my.homework || []).length,
          attSummary: { present: 0, absent: 0, late: 0 },
          attendanceList: [],
          homework: my.homework || [],
          badges: (my.badges || []).map(b => ({ badge: b.name || b.badge, date: b.date })),
          deadlines: ((dashRes.data && dashRes.data.deadlines) || []).map(d => ({ id: d.id, title: d.title, due_date: d.dueDate || d.due_date || "" })),
          certificates: [],
          messages: [],
          legacyNotice: true
        };
      }

      if (path === "/api/app/library") return { items: [] };
      if (path === "/api/app/leitner") return { stats: { total: 0, due: 0, mastered: 0 }, dueCards: [] };
      if (path === "/api/app/planner" && (!method || method === "GET")) return { plan: "" };
      if (path === "/api/app/dictation") return { title: "دیکته کلاسی", text: "لطفاً نسخه جدید ربات را در کلودفلر دیپلوی کنید." };

      throw new Error("برای استفاده از این بخش، ابتدا کد جدید ربات (فایل worker.js یا my-telegram-bot-updated.zip) را در کلودفلر دیپلوی کنید.");
    }

    async function api(path, body = null, method = null) {
      const base = getApiBase();
      const url = base + path;
      const headers = { "Content-Type": "application/json" };
      if (session?.token) headers["Authorization"] = "Bearer " + session.token;
      const opts = { method: method || (body ? "POST" : "GET"), headers };
      if (body) opts.body = JSON.stringify(body);

      let parsed;
      try {
        parsed = await fetchJsonSafe(url, opts);
      } catch {
        throw new Error("عدم دسترسی به اینترنت یا سرور کلودفلر (در صورت نیاز آدرس سرور یا فیلترشکن را بررسی کنید)");
      }

      // اگر نسخه جدید ورکر هنوز روی کلودفلر دیپلوی نشده باشد (404 Not Found)، خودکار به پل سازگاری برو!
      if (parsed.res.status === 404 && path.startsWith("/api/app/")) {
        return await legacyApiFallback(base, path, body, opts.method);
      }

      window._usingLegacyWorker = false;
      if (!parsed.data) {
        throw new Error("پاسخ نامعتبر از سرور (" + parsed.res.status + ") — لطفاً نسخه جدید ربات را در کلودفلر دیپلوی کنید.");
      }
      if (!parsed.res.ok || parsed.data.error) {
        if (parsed.res.status === 401 && String(session?.token || "").startsWith("legacy-")) {
          // به محض دیپلوی شدن ورکر جدید، کاربر را به صفحه ورود هدایت کن تا توکن اصلی بگیرد
          doLogout();
          throw new Error("سرور کلودفلر به‌روزرسانی شد! لطفاً یک بار دیگر وارد شوید.");
        }
        throw new Error(parsed.data.error || ("خطای ارتباط (" + parsed.res.status + ")"));
      }
      return parsed.data;
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function esc(s) {
      return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function doLogout() {
      localStorage.removeItem("sc_session");
      session = null;
      activeTab = "home";
      activeLabTool = null;
      renderApp();
    }

    // ==================== صفحه ورود ۳ پنله ====================
    let loginRole = "student"; // student | parent | teacher | signup
    function renderLogin() {
      document.getElementById("logoutBtn").style.display = "none";
      document.getElementById("bottomNav").style.display = "none";
      document.getElementById("headerSub").textContent = "ورود به سامانه یکپارچه آموزشی";

      const main = document.getElementById("mainView");
      main.innerHTML = \`
        <div class="card hero-card" style="text-align:center;padding:20px 14px;">
          <div style="font-size:40px;margin-bottom:6px;">🎓✨</div>
          <div style="font-size:18px;font-weight:800;color:var(--gold-light);">اپلیکیشن کلاس هوشمند</div>
          <div class="muted" style="color:#E2E8F0;margin-top:4px;">سامانه یکپارچه هوشمند آموزشی و ربات تلگرام مدرسه</div>
          <div style="margin-top:10px;display:flex;justify-content:center;">
            <button class="icon-btn" style="font-size:11px;border-color:rgba(56,189,248,0.5);color:#BAE6FD;" onclick="openServerModal()">🌐 سرور متصل: <span dir="ltr">\${esc((getApiBase() || location.origin).replace(/^https?:\\/\\//,''))}</span> (تغییر سرور مدرسه)</button>
          </div>
        </div>

        <div class="card">
          <div class="role-tabs">
            <button class="role-tab \${loginRole==='student'||loginRole==='signup'?'active':''}" onclick="loginRole='student';renderLogin()">🎒 دانش‌آموز</button>
            <button class="role-tab \${loginRole==='parent'?'active':''}" onclick="loginRole='parent';renderLogin()">👪 پنل والدین</button>
            <button class="role-tab \${loginRole==='teacher'?'active':''}" onclick="loginRole='teacher';renderLogin()">👨‍🏫 پنل معلم</button>
          </div>

          \${loginRole === 'student' ? \`
            <div class="section-title">🎒 ورود دانش‌آموز</div>
            <p class="muted" style="margin-top:0;">کد ۶ رقمی دانش‌آموزی و رمز عبور خود را وارد کن (از دکمه «🖥 پنل من» در ربات تلگرام یا از معلم بگیر):</p>
            <input id="stCode" class="input" type="tel" dir="ltr" placeholder="کد دانش‌آموزی (مثلاً 482915)" />
            <input id="stPin" class="input" type="password" dir="ltr" placeholder="رمز عبور (پیش‌فرض: 1234)" />
            <button class="btn" onclick="submitStudentLogin()">🚀 ورود به میز کار دانش‌آموز</button>
            <div style="text-align:center;margin-top:12px;">
              <button class="btn btn-ghost btn-sm" onclick="loginRole='signup';renderLogin()">➕ دانش‌آموز جدید هستم (ثبت‌نام مستقیم در اپ)</button>
            </div>
          \` : ''}

          \${loginRole === 'signup' ? \`
            <div class="section-title">📝 ثبت‌نام دانش‌آموز جدید</div>
            <p class="muted" style="margin-top:0;">اگر در ربات تلگرام ثبت‌نام نکرده‌ای، مشخصاتت را وارد کن تا کد اختصاصی بگیری:</p>
            <input id="regName" class="input" placeholder="نام و نام خانوادگی (فارسی)" />
            <input id="regGrade" class="input" placeholder="پایه تحصیلی (مثلاً هفتم، هشتم، نهم)" />
            <input id="regPin" class="input" type="password" dir="ltr" placeholder="رمز عبور ۴ رقمی دلخواه (مثلاً 1234)" />
            <button class="btn btn-emerald" onclick="submitStudentSignup()">✅ ثبت‌نام و دریافت کد ورود</button>
            <div style="text-align:center;margin-top:10px;">
              <button class="btn btn-ghost btn-sm" onclick="loginRole='student';renderLogin()">🔙 بازگشت به ورود دانش‌آموز</button>
            </div>
          \` : ''}

          \${loginRole === 'parent' ? \`
            <div class="section-title">👪 ورود اختصاصی اولیا (والدین)</div>
            <p class="muted" style="margin-top:0;">با «کد ۶ رقمی ویژه والدین» وارد شوید تا کارنامه زنده، حضوروغیاب، لوح‌های تقدیر و ارتباط مستقیم با معلم را مشاهده کنید:</p>
            <input id="parCode" class="input" type="tel" dir="ltr" placeholder="کد ۶ رقمی ویژه والدین" />
            <button class="btn btn-gold" onclick="submitParentLogin()">📬 ورود به پنل اولیا</button>
          \` : ''}

          \${loginRole === 'teacher' ? \`
            <div class="section-title">👨‍🏫 ورود مدیریت کلاس (معلم)</div>
            <p class="muted" style="margin-top:0;">رمز عبور مدیریت پنل کلاس را وارد نمایید:</p>
            <input id="tPass" class="input" type="password" dir="ltr" placeholder="رمز مدیریت معلم" />
            <button class="btn" onclick="submitTeacherLogin()">🔐 ورود به اتاق فرمان معلم</button>
          \` : ''}
        </div>
      \`;
    }

    async function submitStudentLogin() {
      try {
        const code = document.getElementById("stCode").value.trim();
        const pin = document.getElementById("stPin").value.trim();
        if (!code) return showToast("کد دانش‌آموزی را وارد کن");
        const r = await api("/api/app/login", { role: "student", code, pin });
        session = r.session;
        localStorage.setItem("sc_session", JSON.stringify(session));
        activeTab = "home";
        showToast("خوش آمدی " + session.name + " 🌟");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function submitStudentSignup() {
      try {
        const name = document.getElementById("regName").value.trim();
        const grade = document.getElementById("regGrade").value.trim();
        const pin = document.getElementById("regPin").value.trim() || "1234";
        if (name.length < 3) return showToast("لطفاً نام و نام خانوادگی کامل بنویس");
        const r = await api("/api/app/signup", { name, grade, pin });
        session = r.session;
        localStorage.setItem("sc_session", JSON.stringify(session));
        alert("✅ ثبت‌نام انجام شد!\\n\\n🆔 کد ورود دانش‌آموزی تو: " + r.studentCode + "\\n🔑 رمز عبور: " + pin + "\\n👪 کد اختصاصی والدین: " + r.parentCode + "\\n\\nاین کدها را یادداشت کن!");
        activeTab = "home";
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function submitParentLogin() {
      try {
        const code = document.getElementById("parCode").value.trim();
        if (!code) return showToast("کد ویژه والدین را وارد کنید");
        const r = await api("/api/app/login", { role: "parent", code });
        session = r.session;
        localStorage.setItem("sc_session", JSON.stringify(session));
        activeTab = "report";
        showToast("خوش آمدید اولیای گرامی «" + session.studentName + "» 🌺");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function submitTeacherLogin() {
      try {
        const password = document.getElementById("tPass").value;
        if (!password) return showToast("رمز مدیریت را وارد کنید");
        const r = await api("/api/app/login", { role: "teacher", password });
        session = r.session;
        localStorage.setItem("sc_session", JSON.stringify(session));
        activeTab = "dash";
        showToast("سلام استاد عزیز! خوش آمدید 👨‍🏫");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ==================== مسیریاب اصلی ۳ پنل ====================
    function renderApp() {
      if (!session?.role) return renderLogin();
      document.getElementById("logoutBtn").style.display = "inline-flex";
      document.getElementById("bottomNav").style.display = "flex";

      if (session.role === "student") renderStudentPanel();
      else if (session.role === "parent") renderParentPanel();
      else if (session.role === "teacher") renderTeacherPanel();
    }

    function setNav(items) {
      const nav = document.getElementById("bottomNav");
      nav.innerHTML = items.map(it => \`
        <button class="nav-item \${activeTab===it.id?'active':''}" onclick="activeTab='\${it.id}';activeLabTool=null;renderApp()">
          <span class="nav-ic">\${it.icon}</span>
          <span>\${it.label}</span>
        </button>
      \`).join("");
    }

    // ====================================================================
    // 🎒 ۱. پنل دانش‌آموز (Student Panel)
    // ====================================================================
    async function renderStudentPanel() {
      document.getElementById("headerSub").textContent = "🎒 پنل دانش‌آموز: " + session.name;
      setNav([
        { id: "home", icon: "🏠", label: "خانه" },
        { id: "qa", icon: "❓", label: "پرسش AI" },
        { id: "lab", icon: "🧠", label: "کارگاه" },
        { id: "arena", icon: "🎮", label: "رقابت" },
        { id: "history", icon: "📜", label: "سوابق" },
      ]);
      const main = document.getElementById("mainView");
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال بارگذاری اطلاعات...</div>';

      try {
        if (activeTab === "home") await renderStudentHome(main);
        else if (activeTab === "qa") renderStudentQA(main);
        else if (activeTab === "lab") await renderStudentLab(main);
        else if (activeTab === "arena") await renderStudentArena(main);
        else if (activeTab === "history") await renderStudentHistory(main);
      } catch (e) {
        main.innerHTML = \`<div class="card">❌ خطا: \${esc(e.message)} <button class="btn btn-sm" style="margin-top:8px;" onclick="renderApp()">تلاش مجدد</button></div>\`;
      }
    }

    async function renderStudentHome(main) {
      const d = await api("/api/app/student/overview");
      const st = d.student;
      const pct = d.nextLevel ? Math.min(100, Math.round((st.score / d.nextLevel.minScore) * 100)) : 100;

      main.innerHTML = \`
        <div class="card hero-card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:17px;font-weight:800;">\${esc(st.name)} \${st.grade ? '<span class="badge-pill">پایه '+esc(st.grade)+'</span>' : ''}</div>
              <div style="color:var(--gold-light);font-size:13px;margin-top:3px;">🏅 سطح فعلی: \${esc(d.levelName)}</div>
            </div>
            <div style="text-align:left;">
              <div style="font-size:24px;font-weight:900;color:var(--gold-light);">\${st.score} ⭐</div>
              <div class="muted" style="color:#CBD5E1;">رتبه \${d.rank} از \${d.totalStudents}</div>
            </div>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:\${pct}%"></div></div>
          <div class="grid-3" style="margin-top:12px;">
            <div class="stat-box"><div class="stat-val">🔥 \${st.streak||0}</div><div class="stat-lbl">استریک روزانه</div></div>
            <div class="stat-box"><div class="stat-val">⏱ \${d.weeklyStudyMin}</div><div class="stat-lbl">دقیقه مطالعه هفته</div></div>
            <div class="stat-box"><div class="stat-val">🏅 \${d.badges.length}</div><div class="stat-lbl">نشان افتخار</div></div>
          </div>
        </div>

        <div class="card">
          <div class="section-title">🎯 ماموریت امروز تو</div>
          <div style="background:#0F172A;padding:11px;border-radius:12px;border:1px solid var(--border);margin-bottom:10px;">
            \${esc(d.mission.mission)}
          </div>
          \${d.mission.done === 1 ? '<div style="color:var(--emerald);font-weight:700;">✅ توسط معلم تایید شد و امتیاز گرفتی!</div>' :
            d.mission.done === 2 ? '<div style="color:var(--gold-light);font-weight:700;">⏳ گزارش ماموریت ارسال شده و منتظر تایید معلم است.</div>' : \`
            <textarea id="missionText" rows="2" placeholder="توضیح بده چطور ماموریت رو انجام دادی (یا عکس بفرست)..."></textarea>
            <input type="file" id="missionFile" accept="image/*" class="input" />
            <button class="btn btn-gold" onclick="submitMissionProof()">📤 ارسال گزارش ماموریت برای تایید معلم</button>
          \`}
        </div>

        <div class="card">
          <div class="section-title">📤 ارسال تکلیف کلاسی</div>
          <textarea id="hwText" rows="3" placeholder="پاسخ تکلیف یا توضیح عکس تکلیفت را بنویس..."></textarea>
          <input type="file" id="hwFile" accept="image/*,.pdf" class="input" />
          <button class="btn btn-emerald" onclick="submitStudentHomework()">📨 ارسال تکلیف به معلم</button>
        </div>

        \${d.deadlines.length ? \`
          <div class="card">
            <div class="section-title">⏰ ددلاین‌ها و امتحانات پیش‌رو</div>
            \${d.deadlines.map(dl => \`<div class="att-row"><span>📝 \${esc(dl.title)}</span><span class="badge-pill">📅 \${esc(dl.due_date)}</span></div>\`).join("")}
          </div>
        \` : ''}

        <div class="card">
          <div class="section-title">🔑 کدهای اتصال اپ و والدین</div>
          <div class="muted">کد ورود دانش‌آموز: <b style="color:#fff;" dir="ltr">\${esc(d.credentials.student_code)}</b> | کد اختصاصی پنل والدین: <b style="color:var(--gold-light);" dir="ltr">\${esc(d.credentials.parent_code)}</b></div>
        </div>
      \`;
    }

    async function submitMissionProof() {
      try {
        const text = document.getElementById("missionText").value.trim();
        const f = document.getElementById("missionFile").files[0];
        let imageB64 = "";
        if (f) imageB64 = await fileToBase64(f);
        if (!text && !imageB64) return showToast("توضیح متنی یا عکس ماموریت را انتخاب کن");
        await api("/api/app/student/mission", { text, imageB64 });
        showToast("✅ گزارش ماموریت برای تایید معلم ارسال شد!");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function submitStudentHomework() {
      try {
        const text = document.getElementById("hwText").value.trim();
        const f = document.getElementById("hwFile").files[0];
        let imageB64 = "";
        if (f) imageB64 = await fileToBase64(f);
        if (!text && !imageB64) return showToast("متن تکلیف یا عکس آن را وارد کن");
        const r = await api("/api/app/student/homework", { text, imageB64, fileName: f?.name || "" });
        showToast("✅ تکلیف ارسال شد! استریک: " + r.streak + " روز 🔥");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ---- تب ۲ دانش‌آموز: پرسش و پاسخ هوشمند (۱۸ ابزار آنلاین) ----
    function renderStudentQA(main) {
      main.innerHTML = \`
        <div class="card">
          <div class="section-title">❓ پرسش و پاسخ هوشمند + ۱۸ ابزار زنده</div>
          <div class="muted" style="margin-bottom:8px;">هر سوال درسی، شعر، آیه قرآن با صوت، فضا، شیمی، موزه‌گردی، حیات‌وحش، دیکشنری صوتی انگلیسی، رسم نمودار تابع یا ساخت تصویر داری بپرس!</div>
          <div class="chat-box" id="qaBox">
            \${qaHistory.length === 0 ? '<div class="muted" style="text-align:center;padding:24px 8px;">👋 سوالت رو بپرس یا عکس تکلیفت رو بفرست تا قدم‌به‌قدم کمکت کنم!</div>' :
              qaHistory.map(m => \`
                <div class="bubble \${m.me ? 'bubble-me' : 'bubble-ai'}">\${esc(m.text)}
                  \${m.photo ? \`<img class="resp-img" src="\${esc(m.photo)}" />\` : ''}
                  \${m.audio ? \`<audio controls style="width:100%;margin-top:8px;" src="\${esc(m.audio)}"></audio>\` : ''}
                </div>
              \`).join("")}
          </div>
          <textarea id="qaInput" rows="2" placeholder="سوالت را اینجا بنویس (مثلاً: نمودار x^2 - 4 را بکش / معنی courage)..."></textarea>
          <div style="display:flex;gap:8px;align-items:center;">
            <label class="icon-btn" style="cursor:pointer;">📸 عکس سوال <input type="file" id="qaPhoto" accept="image/*" style="display:none;" onchange="sendQaPhoto(this)" /></label>
            <button class="btn" style="flex:1;" onclick="sendQaText()">🚀 ارسال سوال</button>
          </div>
        </div>
      \`;
      const box = document.getElementById("qaBox");
      if (box) box.scrollTop = box.scrollHeight;
    }

    async function sendQaText() {
      const inp = document.getElementById("qaInput");
      const q = inp.value.trim();
      if (!q) return;
      inp.value = "";
      qaHistory.push({ me: true, text: q });
      qaHistory.push({ me: false, text: "⏳ در حال جستجو و تفکر..." });
      renderStudentQA(document.getElementById("mainView"));
      try {
        const r = await api("/api/app/ai/ask", { question: q });
        qaHistory.pop();
        qaHistory.push({ me: false, text: r.text, photo: r.photoUrl || r.imageDataUrl, audio: r.audioUrl });
      } catch (e) {
        qaHistory.pop();
        qaHistory.push({ me: false, text: "❌ " + e.message });
      }
      renderStudentQA(document.getElementById("mainView"));
    }

    async function sendQaPhoto(inputEl) {
      const f = inputEl.files[0];
      if (!f) return;
      qaHistory.push({ me: true, text: "📸 ارسال تصویر تکلیف برای بررسی هوش مصنوعی" });
      qaHistory.push({ me: false, text: "⏳ در حال تحلیل تصویر..." });
      renderStudentQA(document.getElementById("mainView"));
      try {
        const b64 = await fileToBase64(f);
        const r = await api("/api/app/ai/homework-image", { imageB64: b64 });
        qaHistory.pop();
        qaHistory.push({ me: false, text: r.analysis });
      } catch (e) {
        qaHistory.pop();
        qaHistory.push({ me: false, text: "❌ " + e.message });
      }
      renderStudentQA(document.getElementById("mainView"));
    }

    // ---- تب ۳ دانش‌آموز: کارگاه یادگیری (۱۰ ابزار کامل + ارسال مستندات به معلم) ----
    async function renderStudentLab(main) {
      if (!activeLabTool) {
        main.innerHTML = \`
          <div class="card">
            <div class="section-title">🧠 کارگاه هوشمند یادگیری</div>
            <div class="muted" style="margin-bottom:12px;">💡 در هر بخش پس از تمرین یا مطالعه، خلاصه و مستندات کار خودت را برای معلم بفرست تا پس از تایید معلم امتیاز بگیری!</div>
            <div class="grid-2">
              <div class="tool-tile" onclick="activeLabTool='pomo';renderApp()"><span class="ic">⏱</span><div class="tt">تایمر پومودورو</div><div class="ds">۲۰ و ۴۵ دقیقه + خلاصه</div></div>
              <div class="tool-tile" onclick="activeLabTool='leitner';renderApp()"><span class="ic">🃏</span><div class="tt">جعبه لایتنر</div><div class="ds">فلش‌کارت ۵ خانه‌ای AI</div></div>
              <div class="tool-tile" onclick="activeLabTool='library';renderApp()"><span class="ic">📂</span><div class="tt">کتابخانه کلاس</div><div class="ds">جزوات و نمونه سوالات</div></div>
              <div class="tool-tile" onclick="activeLabTool='mindmap';renderApp()"><span class="ic">🗺</span><div class="tt">نقشه ذهنی درس</div><div class="ds">نمودار درختی تصویری</div></div>
              <div class="tool-tile" onclick="activeLabTool='english';renderApp()"><span class="ic">🎧</span><div class="tt">مکالمه انگلیسی</div><div class="ds">اصلاح گرامر + تلفظ صوتی</div></div>
              <div class="tool-tile" onclick="activeLabTool='essay';renderApp()"><span class="ic">✍️</span><div class="tt">تصحیح انشا</div><div class="ds">نگارش و غلط‌گیری فارسی</div></div>
              <div class="tool-tile" onclick="activeLabTool='dictation';renderApp()"><span class="ic">🎙</span><div class="tt">آزمون دیکته</div><div class="ds">تصحیح از عکس برگه</div></div>
              <div class="tool-tile" onclick="activeLabTool='scilab';renderApp()"><span class="ic">🧪</span><div class="tt">آزمایشگاه مجازی</div><div class="ds">شبیه‌ساز تعاملی علوم</div></div>
              <div class="tool-tile" onclick="activeLabTool='scientist';renderApp()"><span class="ic">🗣</span><div class="tt">گفتگو با دانشمندان</div><div class="ds">ابن‌سینا، خوارزمی، نیوتن...</div></div>
              <div class="tool-tile" onclick="activeLabTool='planner';renderApp()"><span class="ic">📅</span><div class="tt">برنامه‌ریز هفتگی</div><div class="ds">برنامه شخصی تا امتحان</div></div>
              <div class="tool-tile" style="grid-column:span 2;" onclick="activeLabTool='muddy';renderApp()"><span class="ic">🆘</span><div class="tt">کجای درس امروز گنگ بود؟</div><div class="ds">ارسال محترمانه یا کاملاً ناشناس به معلم برای رفع اشکال</div></div>
            </div>
          </div>
        \`;
        return;
      }

      const backBtn = \`<button class="btn btn-ghost btn-sm" style="margin-bottom:10px;" onclick="activeLabTool=null;renderApp()">🔙 بازگشت به کارگاه یادگیری</button>\`;

      // ۱. تایمر مطالعه پومودورو ۲۰ و ۴۵ دقیقه‌ای + ارسال خلاصه به معلم
      if (activeLabTool === "pomo") {
        main.innerHTML = backBtn + \`
          <div class="card" style="text-align:center;">
            <div class="section-title" style="justify-content:center;">⏱ تایمر تمرکز و مطالعه (پومودورو)</div>
            <div class="muted">بعد از پایان تایمر، خلاصه مطالبی را که مطالعه کردی برای معلم بفرست تا پس از تایید معلم هم امتیاز بگیری و هم وارد لیگ مطالعه هفته شوی!</div>
            <div class="timer-ring">
              <div class="timer-digits" id="pomoDigits">20:00</div>
              <div class="muted" id="pomoSub">آماده شروع</div>
            </div>
            <div id="pomoControls" class="grid-2" style="margin-top:10px;">
              <button class="btn" onclick="startPomoApp(20)">🍅 شروع ۲۰ دقیقه</button>
              <button class="btn btn-gold" onclick="startPomoApp(45)">📚 شروع ۴۵ دقیقه</button>
            </div>
            <div id="pomoProofBox" style="display:none;text-align:right;margin-top:14px;">
              <div class="section-title">📝 ارسال خلاصه مطالعه به معلم</div>
              <textarea id="pomoSummaryTxt" rows="3" placeholder="خلاصه نکات مهمی که در این نوبت مطالعه یاد گرفتی را بنویس..."></textarea>
              <input type="file" id="pomoSummaryImg" accept="image/*" class="input" />
              <button class="btn btn-emerald" onclick="submitLabProofApp('study', '⏱ مطالعه ' + (pomoState?.targetMin||20) + ' دقیقه‌ای', pomoState?.targetMin||20, 'pomoSummaryTxt', 'pomoSummaryImg')">📤 ارسال مستندات مطالعه برای تایید معلم</button>
            </div>
          </div>
        \`;
        updatePomoTick();
        return;
      }

      // ۲. جعبه لایتنر ۵ خانه‌ای
      if (activeLabTool === "leitner") {
        const d = await api("/api/app/leitner");
        leitnerDeck = d.dueCards || [];
        if (leitnerIdx >= leitnerDeck.length) leitnerIdx = 0;
        const cur = leitnerDeck[leitnerIdx];
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">🃏 جعبه لایتنر هوشمند ۵ خانه‌ای</div>
            <div class="grid-3" style="margin-bottom:12px;">
              <div class="stat-box"><div class="stat-val">\${d.stats.total}</div><div class="stat-lbl">کل کارت‌ها</div></div>
              <div class="stat-box"><div class="stat-val">\${d.stats.due}</div><div class="stat-lbl">مرور امروز</div></div>
              <div class="stat-box"><div class="stat-val">\${d.stats.mastered}</div><div class="stat-lbl">تثبیت‌شده</div></div>
            </div>
            \${cur ? \`
              <div class="flip-card" onclick="leitnerFlipped=!leitnerFlipped;document.getElementById('fcText').innerHTML=leitnerFlipped?'💡 پاسخ:<br><b>'+esc(leitnerDeck[leitnerIdx].back)+'</b>':'❓ سوال (خانه '+leitnerDeck[leitnerIdx].box+'):<br><b>'+esc(leitnerDeck[leitnerIdx].front)+'</b>'">
                <div id="fcText">❓ سوال (خانه \${cur.box} از ۵):<br><b>\${esc(cur.front)}</b></div>
                <div class="muted" style="margin-top:10px;">👆 برای مشاهده پشت کارت لمس کن</div>
              </div>
              <div class="grid-2">
                <button class="btn btn-emerald" onclick="answerFlashcardApp(\${cur.id}, true)">✅ بلد بودم (خانه بعد)</button>
                <button class="btn btn-rose" onclick="answerFlashcardApp(\${cur.id}, false)">❌ یادم رفته بود</button>
              </div>
            \` : '<div class="muted" style="text-align:center;padding:14px;">🎉 تمام کارت‌های امروزت مرور شدند!</div>'}
          </div>

          <div class="card">
            <div class="section-title">🤖 ساخت خودکار ۵ فلش‌کارت با هوش مصنوعی</div>
            <input id="fcTopicInp" class="input" placeholder="موضوع درس (مثلاً: لغات درس ۳ زبان نهم / فرمول‌های فشار)" />
            <button class="btn" onclick="createAiFlashcardsApp()">✨ ساخت ۵ کارت جدید</button>
          </div>

          <div class="card">
            <div class="section-title">📤 ارسال خلاصه مرور لایتنر به معلم (دریافت امتیاز)</div>
            <textarea id="fcProofTxt" rows="2" placeholder="مهم‌ترین نکاتی که از مرور امروز یاد گرفتی را برای معلم بنویس..."></textarea>
            <button class="btn btn-gold" onclick="submitLabProofApp('leitner', '🃏 مرور جعبه لایتنر ('+leitnerReviewedCount+' کارت)', 0, 'fcProofTxt')">📤 ارسال برای تایید و امتیاز معلم</button>
          </div>
        \`;
        return;
      }

      // ۳. کتابخانه کلاس
      if (activeLabTool === "library") {
        const d = await api("/api/app/library");
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">📂 کتابخانه و آرشیو جزوات کلاس (\${d.items.length})</div>
            \${d.items.length === 0 ? '<div class="muted">هنوز جزوه یا نمونه سوالی توسط معلم در کتابخانه قرار داده نشده است.</div>' :
              d.items.map(it => \`
                <div class="card" style="background:#0F172A;margin-bottom:9px;">
                  <div style="font-weight:700;color:var(--gold-light);">📌 \${esc(it.title)} <span class="badge-pill">\${esc(it.category)}</span></div>
                  <div style="white-space:pre-wrap;margin-top:6px;font-size:13px;">\${esc(it.text_body || 'فایل پیوست در تلگرام کلاس قابل دریافت است.')}</div>
                </div>
              \`).join("")}
          </div>
        \`;
        return;
      }

      // ۴. نقشه ذهنی تصویری
      if (activeLabTool === "mindmap") {
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">🗺 تبدیل خودکار درس به نقشه ذهنی تصویری</div>
            <input id="mmTopic" class="input" placeholder="موضوع یا متن درس (مثلاً: دستگاه گوارش انسان)" />
            <button class="btn" onclick="buildMindMapApp()">🎨 ترسیم نقشه ذهنی فارسی</button>
            <div id="mmResult" style="margin-top:12px;"></div>
          </div>
        \`;
        return;
      }

      // ۵. مکالمه زبان انگلیسی + صوت
      if (activeLabTool === "english") {
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">🎧 مربی مکالمه زبان انگلیسی</div>
            <div class="chat-box" id="engBox">
              \${engHistory.length===0 ? '<div class="muted">یک جمله به انگلیسی بنویس تا گرامرش اصلاح شود و با تلفظ صوتی انگلیسی پاسخ بگیری!</div>' :
                engHistory.map(m => \`<div class="bubble \${m.me?'bubble-me':'bubble-ai'}">\${esc(m.text)}</div>\`).join("")}
            </div>
            <input id="engInp" class="input" dir="ltr" placeholder="Write an English sentence..." />
            <button class="btn" onclick="sendEngTurnApp()">🗣 ارسال و شنیدن پاسخ انگلیسی</button>
          </div>
          <div class="card">
            <div class="section-title">📤 ارسال مستندات تمرین انگلیسی به معلم</div>
            <textarea id="engProofTxt" rows="2" placeholder="چند جمله‌ای که امروز یاد گرفتی را بنویس تا برای معلم ارسال شود..."></textarea>
            <button class="btn btn-gold" onclick="submitLabProofApp('english', '🎧 تمرین مکالمه زبان انگلیسی', 0, 'engProofTxt')">📤 ارسال برای تایید امتیاز معلم</button>
          </div>
        \`;
        return;
      }

      // ۶. تصحیح هوشمند انشا
      if (activeLabTool === "essay") {
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">✍️ تصحیح هوشمند انشا و نگارش فارسی</div>
            <textarea id="essayInp" rows="4" placeholder="متن انشای خود را بنویس (یا عکس دست‌نویس انشا را انتخاب کن)..."></textarea>
            <input type="file" id="essayImg" accept="image/*" class="input" />
            <button class="btn" onclick="checkEssayApp()">🔍 غلط‌گیری و بهبود نگارش با AI</button>
            <div id="essayOut" style="white-space:pre-wrap;margin-top:12px;"></div>
          </div>
          <div class="card">
            <div class="section-title">📤 ارسال نسخه نهایی انشا برای معلم</div>
            <textarea id="essayFinalTxt" rows="3" placeholder="نسخه اصلاح‌شده انشا را اینجا بنویس (یا عکسش را بفرست)..."></textarea>
            <input type="file" id="essayFinalImg" accept="image/*" class="input" />
            <button class="btn btn-gold" onclick="submitLabProofApp('essay', '✍️ نگارش و اصلاح انشای فارسی', 0, 'essayFinalTxt', 'essayFinalImg')">📤 ارسال انشا برای تایید امتیاز معلم</button>
          </div>
        \`;
        return;
      }

      // ۷. آزمون دیکته از عکس برگه
      if (activeLabTool === "dictation") {
        const d = await api("/api/app/dictation");
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">🎙 آزمون دیکته هوشمند: \${esc(d.title)}</div>
            <p class="muted">۱. از یکی از اعضای خانواده بخواه متن پنهان زیر را برایت بخواند (یا با دکمه زیر بشنو) و روی کاغذ خوش‌خط بنویس:</p>
            <details style="background:#0F172A;padding:10px;border-radius:12px;margin-bottom:10px;">
              <summary style="cursor:pointer;color:var(--gold-light);font-weight:700;">👁 نمایش متن دیکته (فقط برای گوینده دیکته)</summary>
              <p style="margin-top:8px;">\${esc(d.text)}</p>
            </details>
            <p class="muted">۲. حالا از برگه دست‌نویس املایت عکس بگیر تا هوش مصنوعی غلط‌گیری کند و هم‌زمان برای تایید امتیاز معلم ارسال شود:</p>
            <input type="file" id="dictPhoto" accept="image/*" class="input" />
            <button class="btn btn-emerald" onclick="submitDictationApp()">📸 تصحیح هوشمند برگه املا و ارسال به معلم</button>
            <div id="dictOut" style="white-space:pre-wrap;margin-top:12px;"></div>
          </div>
        \`;
        return;
      }

      // ۸. آزمایشگاه مجازی علوم
      if (activeLabTool === "scilab") {
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">🧪 شبیه‌ساز تعاملی آزمایشگاه علوم</div>
            <input id="labTopicInp" class="input" value="مدار الکتریکی و قانون اهم" placeholder="موضوع آزمایش علوم..." />
            <button class="btn" onclick="startSciLabApp()">🥼 شروع آزمایش ۳ مرحله‌ای</button>
            <div id="sciLabStage" style="margin-top:12px;"></div>
          </div>
          <div class="card">
            <div class="section-title">📤 ارسال گزارش‌کار آزمایش به معلم</div>
            <textarea id="sciLabProof" rows="2" placeholder="نتیجه علمی آزمایشی که انجام دادی را به زبان خودت بنویس..."></textarea>
            <button class="btn btn-gold" onclick="submitLabProofApp('scilab', '🧪 گزارش‌کار آزمایشگاه علوم', 0, 'sciLabProof')">📤 ارسال گزارش‌کار برای تایید معلم</button>
          </div>
        \`;
        return;
      }

      // ۹. گفتگو با دانشمندان تاریخ
      if (activeLabTool === "scientist") {
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">🗣 صندلی داغ گفتگو با دانشمندان</div>
            <select id="sciSelect" class="input" onchange="activeSciKey=this.value;sciHistory=[];renderApp()">
              <option value="avicenna" \${activeSciKey==='avicenna'?'selected':''}>🩺 ابوعلی سینا (پزشکی و حکمت)</option>
              <option value="khwarizmi" \${activeSciKey==='khwarizmi'?'selected':''}>🔢 خوارزمی (جبر و الگوریتم)</option>
              <option value="ferdowsi" \${activeSciKey==='ferdowsi'?'selected':''}>📜 حکیم فردوسی (شاهنامه)</option>
              <option value="newton" \${activeSciKey==='newton'?'selected':''}>🍎 آیزاک نیوتن (فیزیک و حرکت)</option>
              <option value="einstein" \${activeSciKey==='einstein'?'selected':''}>🌌 آلبرت انیشتین (نسبیت و فضا)</option>
              <option value="curie" \${activeSciKey==='curie'?'selected':''}>🧪 ماری کوری (شیمی و اتم)</option>
            </select>
            <div class="chat-box">
              \${sciHistory.length===0 ? '<div class="muted">سوالت را از این دانشمند بزرگ بپرس!</div>' :
                sciHistory.map(m => \`<div class="bubble \${m.me?'bubble-me':'bubble-ai'}">\${esc(m.text)}</div>\`).join("")}
            </div>
            <input id="sciInp" class="input" placeholder="سوال علمی یا تاریخی خودت را بپرس..." />
            <button class="btn" onclick="askScientistApp()">💬 ارسال پرسش</button>
          </div>
          <div class="card">
            <div class="section-title">📤 ارسال خلاصه مصاحبه به معلم</div>
            <textarea id="sciProofTxt" rows="2" placeholder="نکته جالبی که از این دانشمند یاد گرفتی را بنویس..."></textarea>
            <button class="btn btn-gold" onclick="submitLabProofApp('scientist', '🗣 مصاحبه با مفاخر علمی', 0, 'sciProofTxt')">📤 ارسال برای تایید معلم</button>
          </div>
        \`;
        return;
      }

      // ۱۰. برنامه‌ریز هفتگی شخصی
      if (activeLabTool === "planner") {
        const d = await api("/api/app/planner");
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">📅 برنامه‌ریز هوشمند هفتگی من</div>
            <textarea id="planInp" rows="2" placeholder="امتحان‌های پیش‌رو و ساعت آزاد روزانه‌ات را بنویس..."></textarea>
            <button class="btn" onclick="makePlanApp()">✨ طراحی برنامه ۷ روزه جدید</button>
            \${d.plan ? \`<div style="white-space:pre-wrap;background:#0F172A;padding:12px;border-radius:12px;margin-top:12px;font-size:13px;">\${esc(d.plan)}</div>\` : ''}
          </div>
          <div class="card">
            <div class="section-title">📤 گزارش اجرای برنامه امروز به معلم</div>
            <textarea id="planProofTxt" rows="2" placeholder="امروز کدام بخش از برنامه‌ات را مطالعه کردی؟"></textarea>
            <button class="btn btn-gold" onclick="submitLabProofApp('plan', '📅 اجرای برنامه مطالعاتی هفتگی', 0, 'planProofTxt')">📤 ارسال گزارش برای تایید معلم</button>
          </div>
        \`;
        return;
      }

      // ۱۱. مبحث گنگ درس امروز
      if (activeLabTool === "muddy") {
        main.innerHTML = backBtn + \`
          <div class="card">
            <div class="section-title">🆘 کجای درس امروز برایت گنگ بود؟</div>
            <p class="muted">بدون خجالت بنویس کدام فرمول یا مبحث نیاز به توضیح دوباره در کلاس دارد:</p>
            <textarea id="muddyTxt" rows="3" placeholder="مثال: در ریاضی مبحث تجزیه عبارت‌های جبری را کامل متوجه نشدم..."></textarea>
            <select id="muddyAnon" class="input">
              <option value="1">🔒 ارسال کاملاً ناشناس (بدون نام من)</option>
              <option value="0">👤 ارسال با نام خودم (برای راهنمایی مستقیم)</option>
            </select>
            <button class="btn btn-emerald" onclick="sendMuddyApp()">📨 ثبت محترمانه برای معلم</button>
          </div>
        \`;
      }
    }

    function startPomoApp(mins) {
      pomoState = { targetMin: mins, startedAt: Date.now(), finished: false };
      clearInterval(pomoInterval);
      pomoInterval = setInterval(updatePomoTick, 1000);
      updatePomoTick();
    }
    function updatePomoTick() {
      const dig = document.getElementById("pomoDigits");
      const sub = document.getElementById("pomoSub");
      const box = document.getElementById("pomoProofBox");
      if (!dig || !pomoState) return;
      const elapsedSec = Math.floor((Date.now() - pomoState.startedAt) / 1000);
      const totalSec = pomoState.targetMin * 60;
      const rem = Math.max(0, totalSec - elapsedSec);
      const m = String(Math.floor(rem / 60)).padStart(2, "0");
      const s = String(rem % 60).padStart(2, "0");
      dig.textContent = m + ":" + s;
      if (rem === 0) {
        clearInterval(pomoInterval);
        pomoState.finished = true;
        sub.textContent = "🎉 آفرین! زمان مطالعه کامل شد!";
        if (box) box.style.display = "block";
      } else {
        sub.textContent = "در حال تمرکز عمیق... گوشی را کنار بگذار 📵";
        // امکان پایان زودهنگام پس از حداقل ۲۰ دقیقه
        if (elapsedSec >= 20 * 60 && box) box.style.display = "block";
      }
    }

    async function submitLabProofApp(category, title, minutes, txtId, fileId = null) {
      try {
        const text = document.getElementById(txtId)?.value?.trim() || "";
        const f = fileId ? document.getElementById(fileId)?.files?.[0] : null;
        let imageB64 = "";
        if (f) imageB64 = await fileToBase64(f);
        if (text.length < 8 && !imageB64) return showToast("لطفاً خلاصه کامل‌تری از فعالیتت بنویس (یا عکس پیوست کن)");
        await api("/api/app/lab/submit-proof", { category, title, minutes, text, imageB64 });
        if (category === "study") pomoState = null;
        showToast("✅ مستندات برای معلم ارسال شد! پس از تایید معلم امتیاز می‌گیری 🌟");
        activeLabTool = null;
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function answerFlashcardApp(cardId, knew) {
      try {
        await api("/api/app/leitner/answer", { cardId, knew });
        leitnerReviewedCount++;
        leitnerFlipped = false;
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function createAiFlashcardsApp() {
      try {
        const topic = document.getElementById("fcTopicInp").value.trim();
        if (!topic) return showToast("موضوع درس را بنویس");
        showToast("🤖 در حال ساخت ۵ فلش‌کارت...");
        await api("/api/app/leitner/generate", { topic });
        showToast("✅ ۵ فلش‌کارت جدید اضافه شد!");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function buildMindMapApp() {
      try {
        const topic = document.getElementById("mmTopic").value.trim();
        if (!topic) return showToast("عنوان مبحث را بنویس");
        const box = document.getElementById("mmResult");
        box.innerHTML = "⏳ در حال ترسیم نقشه ذهنی فارسی...";
        const r = await api("/api/app/mindmap", { topic });
        box.innerHTML = r.imageB64
          ? \`<img class="resp-img" src="\${r.imageB64}" /><a class="btn btn-ghost btn-sm" style="margin-top:8px;" download="mindmap.png" href="\${r.imageB64}">📥 ذخیره تصویر در گوشی</a>\`
          : \`<pre style="white-space:pre-wrap;">\${esc(r.textFallback)}</pre>\`;
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function sendEngTurnApp() {
      const inp = document.getElementById("engInp");
      const text = inp.value.trim();
      if (!text) return;
      inp.value = "";
      engHistory.push({ me: true, text });
      renderApp();
      try {
        const r = await api("/api/app/english", { text });
        engHistory.push({ me: false, text: "✏️ " + r.correctionFa + "\\n\\n🗣 " + r.englishReply + "\\n🇮🇷 " + r.persianMeaning });
        if (window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance(r.englishReply);
          u.lang = "en-US";
          window.speechSynthesis.speak(u);
        }
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function checkEssayApp() {
      try {
        const text = document.getElementById("essayInp").value.trim();
        const f = document.getElementById("essayImg").files[0];
        let imageB64 = "";
        if (f) imageB64 = await fileToBase64(f);
        if (!text && !imageB64) return showToast("متن یا عکس انشا را وارد کن");
        document.getElementById("essayOut").textContent = "⏳ در حال بررسی نگارشی و املایی...";
        const r = await api("/api/app/essay", { text, imageB64 });
        document.getElementById("essayOut").textContent = r.review;
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function submitDictationApp() {
      try {
        const f = document.getElementById("dictPhoto").files[0];
        if (!f) return showToast("ابتدا عکس واضح برگه املایت را انتخاب کن");
        document.getElementById("dictOut").textContent = "📸 در حال خواندن دست‌خط و غلط‌گیری املا...";
        const imageB64 = await fileToBase64(f);
        const r = await api("/api/app/dictation/check", { imageB64 });
        document.getElementById("dictOut").textContent = r.aiCheck + "\\n\\n✅ برگه املا برای تایید و ثبت امتیاز به معلم ارسال شد!";
      } catch (e) { showToast("❌ " + e.message); }
    }

    let appSciStep = 0;
    let appSciLog = [];
    async function startSciLabApp(chosen = "") {
      try {
        const topic = document.getElementById("labTopicInp").value.trim() || "مدار الکتریکی";
        if (!chosen) { appSciStep = 0; appSciLog = []; }
        const stg = document.getElementById("sciLabStage");
        stg.innerHTML = "🔬 در حال مشاهده آزمایشگاه...";
        const r = await api("/api/app/scilab", { topic, step: appSciStep, log: appSciLog, chosen });
        appSciStep++;
        appSciLog.push(r.text);
        if (r.finished) {
          stg.innerHTML = \`<div style="background:#0F172A;padding:12px;border-radius:12px;">🎉 <b>نتیجه نهایی آزمایش:</b><br>\${esc(r.text)}</div>\`;
        } else {
          stg.innerHTML = \`<div style="background:#0F172A;padding:12px;border-radius:12px;margin-bottom:8px;">\${esc(r.text)}</div>\` +
            r.options.map(o => \`<button class="btn btn-ghost" style="margin-bottom:6px;" onclick="startSciLabApp('\${esc(o)}')">🔹 \${esc(o)}</button>\`).join("");
        }
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function askScientistApp() {
      const inp = document.getElementById("sciInp");
      const q = inp.value.trim();
      if (!q) return;
      inp.value = "";
      sciHistory.push({ me: true, text: q });
      renderApp();
      try {
        const r = await api("/api/app/scientist", { sciKey: activeSciKey, question: q });
        sciHistory.push({ me: false, text: r.reply });
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function makePlanApp() {
      try {
        const goals = document.getElementById("planInp").value.trim();
        if (goals.length < 6) return showToast("توضیح امتحان‌ها و ساعت آزادت را بنویس");
        showToast("📅 در حال چیدن برنامه ۷ روزه...");
        await api("/api/app/planner", { goals });
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function sendMuddyApp() {
      try {
        const detail = document.getElementById("muddyTxt").value.trim();
        const isAnon = document.getElementById("muddyAnon").value === "1";
        if (detail.length < 5) return showToast("لطفاً مبحث گنگ را بنویس");
        await api("/api/app/muddy", { detail, isAnon });
        showToast("✅ بازخوردت ثبت شد تا معلم در کلاس مرور کند!");
        activeLabTool = null;
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ---- تب ۴ دانش‌آموز: رقابت، کوییز، معمای روز و فروشگاه جوایز ----
    async function renderStudentArena(main) {
      const d = await api("/api/app/arena");
      main.innerHTML = \`
        \${d.latestQuiz && !d.latestQuiz.answered ? \`
          <div class="card hero-card">
            <div class="section-title">🎲 کوییز فعال کلاس (+\${d.latestQuiz.points} امتیاز)</div>
            <div style="font-weight:700;margin-bottom:10px;">❓ \${esc(d.latestQuiz.question)}</div>
            \${d.latestQuiz.options.map((opt, idx) => \`
              <button class="btn btn-ghost" style="margin-bottom:7px;justify-content:flex-start;" onclick="answerActiveQuizApp(\${d.latestQuiz.id}, \${idx+1})">\${idx+1}. \${esc(opt)}</button>
            \`).join("")}
          </div>
        \` : ''}

        <div class="card">
          <div class="section-title">🧩 معمای واژه علمی روز (\${esc(d.wordPuzzle.category)})</div>
          \${d.wordPuzzle.solved ? \`
            <div style="color:var(--emerald);font-weight:700;margin-bottom:8px;">✅ آفرین! واژه امروز (\${esc(d.wordPuzzle.word)}) را کشف کردی!</div>
            <div class="muted" style="margin-bottom:8px;">💡 \${esc(d.wordPuzzle.fact)}</div>
            <input id="wordSentenceInp" class="input" placeholder="یک جمله علمی با این واژه بساز و برای معلم بفرست..." />
            <button class="btn btn-gold" onclick="submitLabProofApp('word_puzzle', '🧩 جمله‌سازی واژه روز ('+d.wordPuzzle.word+')', 0, 'wordSentenceInp')">📤 ارسال جمله به معلم (دریافت امتیاز)</button>
          \` : \`
            <div style="background:#0F172A;padding:10px;border-radius:12px;margin-bottom:8px;">
              <div>🔤 حروف به‌هم‌ریخته: <b style="color:var(--gold-light);">\${esc(d.wordPuzzle.scrambled)}</b></div>
              <div class="muted" style="margin-top:4px;">🔎 راهنمایی: \${esc(d.wordPuzzle.hint1)}</div>
            </div>
            <div style="display:flex;gap:8px;">
              <input id="wordGuessInp" class="input" style="margin:0;flex:1;" placeholder="حدس تو..." />
              <button class="btn btn-sm" onclick="guessWordApp()">بررسی</button>
            </div>
          \`}
        </div>

        <div class="card">
          <div class="section-title">🛒 فروشگاه جوایز کلاس (موجودی: \${d.score} ⭐)</div>
          \${d.shopItems.map(it => \`
            <div class="att-row">
              <div>
                <div style="font-weight:700;">\${esc(it.title)}</div>
                <div class="muted">\${esc(it.description || '')}</div>
              </div>
              <button class="btn btn-gold btn-sm" onclick="buyShopApp(\${it.id})">\${it.cost} ⭐ خرید</button>
            </div>
          \`).join("")}
        </div>

        <div class="card">
          <div class="section-title">🏆 برترین‌های کلاس و لیگ مطالعه هفته</div>
          \${d.leaderboard.slice(0, 8).map((s, i) => \`
            <div class="att-row">
              <span>\${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.'} <b>\${esc(s.name)}</b> <span class="muted">(\${esc(s.level)})</span></span>
              <span class="badge-pill">\${s.score} ⭐</span>
            </div>
          \`).join("")}
        </div>
      \`;
    }

    async function answerActiveQuizApp(quizId, answer) {
      try {
        const r = await api("/api/app/quiz/answer", { quizId, answer });
        showToast(r.correct ? "🎉 آفرین! پاسخ درست بود (+" + r.points + " امتیاز)" : "❌ اشتباه بود! دفعه بعد دقت کن");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function guessWordApp() {
      try {
        const guess = document.getElementById("wordGuessInp").value.trim();
        const r = await api("/api/app/word/guess", { guess });
        showToast(r.solved ? "🎉 عالی بود! درست حدس زدی!" : "❌ نه! راهنمایی بیشتر: " + r.hint2);
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    async function buyShopApp(itemId) {
      try {
        await api("/api/app/shop/buy", { itemId });
        showToast("🛍 درخواست جایزه برای تایید معلم ارسال شد!");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ---- تب ۵ دانش‌آموز: سوابق، لوح‌های تقدیر و تغییر رمز ----
    async function renderStudentHistory(main) {
      const d = await api("/api/app/student/history");
      main.innerHTML = \`
        \${d.certificates.length ? \`
          <div class="card">
            <div class="section-title">🏅 لوح‌های تقدیر من</div>
            \${d.certificates.map(c => \`
              <div style="margin-bottom:12px;">
                <div class="muted">🌟 \${esc(c.award_title)} — \${esc(c.date)}</div>
                <img class="resp-img" src="\${c.image_b64}" />
              </div>
            \`).join("")}
          </div>
        \` : ''}

        <div class="card">
          <div class="section-title">🧠 وضعیت مستندات کارگاه یادگیری</div>
          \${d.labSubmissions.length === 0 ? '<div class="muted">هنوز مستندی ارسال نکرده‌ای.</div>' :
            d.labSubmissions.map(s => \`
              <div class="att-row">
                <div><b>\${esc(s.title)}</b><div class="muted">\${esc(s.date)}</div></div>
                <span class="badge-pill">\${s.status==='approved'?'✅ +'+s.points+' امتیاز':s.status==='rejected'?'❌ ردشده':'⏳ در انتظار معلم'}</span>
              </div>
            \`).join("")}
        </div>

        <div class="card">
          <div class="section-title">📅 آخرین تکالیف و نمرات من</div>
          \${d.homework.length === 0 ? '<div class="muted">هنوز تکلیفی ثبت نشده است.</div>' :
            d.homework.map(h => \`
              <div class="att-row">
                <div><b>\${esc(h.type)}</b> — <span class="muted">\${esc(h.date)}</span>\${h.feedback ? '<div class="muted">💬 '+esc(h.feedback)+'</div>' : ''}</div>
                <span class="badge-pill">\${h.score > 0 ? 'نمره: '+h.score : 'ثبت‌شده'}</span>
              </div>
            \`).join("")}
        </div>

        <div class="card">
          <div class="section-title">🔐 تغییر رمز عبور شخصی من</div>
          <input id="newPinInp" class="input" type="password" dir="ltr" placeholder="رمز عبور جدید (حداقل ۴ کاراکتر)" />
          <button class="btn btn-ghost" onclick="changePinApp()">ذخیره رمز جدید</button>
        </div>
      \`;
    }

    async function changePinApp() {
      try {
        const newPin = document.getElementById("newPinInp").value.trim();
        if (newPin.length < 4) return showToast("رمز باید حداقل ۴ رقم یا حرف باشد");
        await api("/api/app/student/pin", { newPin });
        showToast("✅ رمز عبور جدیدت ذخیره شد!");
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ====================================================================
    // 👪 ۲. پنل اختصاصی والدین (Parent Panel)
    // ====================================================================
    async function renderParentPanel() {
      document.getElementById("headerSub").textContent = "👪 پنل اولیا — " + session.studentName;
      setNav([
        { id: "report", icon: "📊", label: "کارنامه زنده" },
        { id: "att", icon: "📅", label: "حضور و تکالیف" },
        { id: "certs", icon: "🏅", label: "افتخارات" },
        { id: "chat", icon: "💬", label: "ارتباط با معلم" },
      ]);
      const main = document.getElementById("mainView");
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال دریافت کارنامه فرزندتان...</div>';

      try {
        const d = await api("/api/app/parent/overview");
        if (activeTab === "report") {
          main.innerHTML = \`
            <div class="card hero-card">
              <div style="font-size:16px;font-weight:800;color:var(--gold-light);">📬 کارنامه زنده هفتگی فرزند شما</div>
              <div style="font-size:19px;font-weight:900;margin-top:4px;">👤 \${esc(d.student.name)} \${d.student.grade ? '('+esc(d.student.grade)+')' : ''}</div>
              <div class="grid-2" style="margin-top:12px;">
                <div class="stat-box"><div class="stat-val">\${d.student.score} ⭐</div><div class="stat-lbl">امتیاز کل (\${esc(d.levelName)})</div></div>
                <div class="stat-box"><div class="stat-val">#\${d.rank}</div><div class="stat-lbl">رتبه از \${d.totalStudents} دانش‌آموز</div></div>
                <div class="stat-box"><div class="stat-val">\${d.quizAccuracy}</div><div class="stat-lbl">دقت در کوییزها</div></div>
                <div class="stat-box"><div class="stat-val">\${d.weeklyStudyMin} دقیقه</div><div class="stat-lbl">مطالعه تاییدشده هفته</div></div>
              </div>
            </div>

            <div class="card">
              <div class="section-title">📈 خلاصه وضعیت حضور و فعالیت ۷ روز گذشته</div>
              <div class="att-row"><span>✅ حضور در کلاس</span><span class="badge-pill">\${d.attSummary.present} جلسه حاضر | \${d.attSummary.late} تاخیر | \${d.attSummary.absent} غیبت</span></div>
              <div class="att-row"><span>📝 تکالیف ارسال‌شده این هفته</span><span class="badge-pill">\${d.weeklyHwCount} تکلیف</span></div>
              <div class="att-row"><span>🔥 پیوستگی فعالیت (استریک)</span><span class="badge-pill">\${d.student.streak || 0} روز پیاپی</span></div>
            </div>

            \${d.deadlines.length ? \`
              <div class="card">
                <div class="section-title">⏰ ددلاین‌ها و برنامه‌های پیش‌روی کلاس</div>
                \${d.deadlines.map(dl => \`<div class="att-row"><span>📌 \${esc(dl.title)}</span><span class="badge-pill">\${esc(dl.due_date)}</span></div>\`).join("")}
              </div>
            \` : ''}
          \`;
        } else if (activeTab === "att") {
          main.innerHTML = \`
            <div class="card">
              <div class="section-title">📅 سوابق حضور و غیاب فرزندتان</div>
              \${d.attendanceList.length === 0 ? '<div class="muted">هنوز سابقه حضوروغیابی ثبت نشده است.</div>' :
                d.attendanceList.map(a => \`
                  <div class="att-row">
                    <span>📅 \${esc(a.jalali)}</span>
                    <span class="badge-pill">\${a.status==='present'?'✅ حاضر':a.status==='absent'?'❌ غایب':'⏰ تاخیر'}</span>
                  </div>
                \`).join("")}
            </div>
            <div class="card">
              <div class="section-title">📝 آخرین تکالیف و بازخوردهای معلم</div>
              \${d.homework.length === 0 ? '<div class="muted">هنوز تکلیفی ثبت نشده است.</div>' :
                d.homework.map(h => \`
                  <div class="att-row">
                    <div><b>\${esc(h.type)}</b> <span class="muted">(\${esc(h.date)})</span>\${h.feedback ? '<div class="muted">💬 نظر معلم: '+esc(h.feedback)+'</div>' : ''}</div>
                    <span class="badge-pill">\${h.score > 0 ? 'نمره '+h.score : 'ارسال‌شده'}</span>
                  </div>
                \`).join("")}
            </div>
          \`;
        } else if (activeTab === "certs") {
          main.innerHTML = \`
            <div class="card">
              <div class="section-title">🏅 ویترین افتخارات و نشان‌های \${esc(d.student.name)}</div>
              <div style="margin-bottom:10px;">\${d.badges.length ? d.badges.map(b => \`<span class="badge-pill">🏅 \${esc(b.badge)}</span>\`).join(" ") : '<span class="muted">در مسیر کسب اولین نشان افتخار!</span>'}</div>
              \${d.certificates.map(c => \`
                <div style="margin-top:12px;">
                  <div style="font-weight:700;color:var(--gold-light);">🌟 \${esc(c.award_title)} (\${esc(c.date)})</div>
                  <img class="resp-img" src="\${c.image_b64}" />
                  <a class="btn btn-ghost btn-sm" style="margin-top:6px;" download="certificate.png" href="\${c.image_b64}">📥 ذخیره لوح تقدیر در گوشی</a>
                </div>
              \`).join("")}
            </div>
          \`;
        } else if (activeTab === "chat") {
          main.innerHTML = \`
            <div class="card">
              <div class="section-title">💬 گفتگو و ارتباط مستقیم با معلم کلاس</div>
              <div class="chat-box">
                \${d.messages.length === 0 ? '<div class="muted" style="text-align:center;padding:20px;">اگر سوال آموزشی، یادداشت یا اطلاع غیبتی دارید، مستقیماً برای معلم ارسال فرمایید.</div>' :
                  d.messages.map(m => \`
                    <div class="bubble \${m.sender_role==='parent'?'bubble-me':'bubble-ai'}">
                      <div style="font-size:11px;opacity:0.75;margin-bottom:3px;">\${m.sender_role==='parent'?'👪 اولیا':'👨‍🏫 معلم کلاس'} • \${esc(m.date)}</div>
                      \${esc(m.message)}
                    </div>
                  \`).join("")}
              </div>
              <textarea id="parMsgInp" rows="2" placeholder="پیام محترمانه شما به معلم کلاس..."></textarea>
              <button class="btn btn-gold" onclick="sendParentMsgApp()">📨 ارسال پیام به معلم</button>
            </div>
          \`;
        }
      } catch (e) {
        main.innerHTML = \`<div class="card">❌ \${esc(e.message)}</div>\`;
      }
    }

    async function sendParentMsgApp() {
      try {
        const msg = document.getElementById("parMsgInp").value.trim();
        if (msg.length < 3) return showToast("متن پیام را وارد نمایید");
        await api("/api/app/parent/message", { message: msg });
        showToast("✅ پیام شما برای معلم ارسال گردید");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }

    // ====================================================================
    // 👨‍🏫 ۳. پنل مدیریت معلم (Teacher Panel)
    // ====================================================================
    let teacherSubTool = "quiz";
    async function renderTeacherPanel() {
      document.getElementById("headerSub").textContent = "👨‍🏫 اتاق فرمان معلم";
      setNav([
        { id: "dash", icon: "📊", label: "داشبورد" },
        { id: "inbox", icon: "📥", label: "صندوق تایید" },
        { id: "att", icon: "✅", label: "حضوروغیاب" },
        { id: "ai", icon: "🤖", label: "ابزار هوش" },
        { id: "class", icon: "🏆", label: "کلاس و کدها" },
        { id: "pchat", icon: "💬", label: "پیام اولیا" },
      ]);
      const main = document.getElementById("mainView");
      main.innerHTML = '<div class="card" style="text-align:center;">⏳ در حال بارگذاری پنل مدیریت...</div>';

      try {
        const d = await api("/api/app/teacher/overview");
        if (activeTab === "dash") {
          main.innerHTML = \`
            \${d.legacyNotice ? \`
              <div class="card" style="border-color:var(--gold);background:rgba(245,158,11,0.12);">
                <div style="font-weight:800;color:var(--gold-light);margin-bottom:4px;">⚠️ حالت سازگاری فعال است (سرور کلودفلر هنوز آپدیت نشده)</div>
                <div class="muted" style="color:#FDE68A;">مشاهده کلاس، کدهای ورود و ثبت امتیاز همین الان کار می‌کند! برای فعال شدن کامل هوش مصنوعی، کارگاه یادگیری، چت اولیا و لوح تقدیر، فایل جدید ربات را در کلودفلر دیپلوی کنید.</div>
              </div>
            \` : ''}
            <div class="card hero-card">
              <div style="font-size:17px;font-weight:800;color:var(--gold-light);">👨‍🏫 داشبورد زنده مدیریت کلاس</div>
              <div class="grid-3" style="margin-top:12px;">
                <div class="stat-box"><div class="stat-val">\${d.students.length}</div><div class="stat-lbl">دانش‌آموزان</div></div>
                <div class="stat-box"><div class="stat-val">\${d.pendingLab.length + d.pendingShop.length}</div><div class="stat-lbl">منتظر تایید</div></div>
                <div class="stat-box"><div class="stat-val">\${d.unreadParentCount}</div><div class="stat-lbl">پیام جدید اولیا</div></div>
              </div>
            </div>

            <div class="card">
              <div class="section-title">📢 ارسال اعلان همگانی (در اپ و تلگرام کل کلاس)</div>
              <textarea id="annTxt" rows="2" placeholder="متن پیام یا اطلاعیه مهم برای همه دانش‌آموزان..."></textarea>
              <button class="btn" onclick="teacherAnnounceApp()">📣 ارسال همگانی به کل کلاس</button>
            </div>

            <div class="card">
              <div class="section-title">⏰ ثبت ددلاین یا تاریخ امتحان جدید</div>
              <input id="dlTitle" class="input" placeholder="عنوان (مثلاً: تحویل پروژه فصل ۴ علوم)" />
              <input id="dlDate" class="input" placeholder="تاریخ (مثلاً: دوشنبه ۱۲ آبان)" />
              <button class="btn btn-gold" onclick="teacherAddDeadlineApp()">➕ ثبت ددلاین و اطلاع به کلاس</button>
              \${d.deadlines.map(dl => \`
                <div class="att-row" style="margin-top:6px;">
                  <span>📝 \${esc(dl.title)} (\${esc(dl.due_date)})</span>
                  <button class="btn btn-rose btn-sm" onclick="teacherDelDeadlineApp(\${dl.id})">حذف</button>
                </div>
              \`).join("")}
            </div>

            \${d.muddy.length ? \`
              <div class="card">
                <div class="section-title">🆘 مباحث گنگ گزارش‌شده توسط دانش‌آموزان (\${d.muddy.length})</div>
                \${d.muddy.slice(0, 8).map(m => \`<div class="att-row"><span>\${m.is_anonymous?'🔒 ناشناس':'👤 '+esc(m.student_name)}: \${esc(m.topic_detail)}</span></div>\`).join("")}
                <button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="clearMuddyTeacherApp()">🗑 پاکسازی پس از رفع اشکال</button>
              </div>
            \` : ''}
          \`;
        } else if (activeTab === "inbox") {
          main.innerHTML = \`
            <div class="card">
              <div class="section-title">🧠 مستندات کارگاه یادگیری در انتظار تایید (\${d.pendingLab.length})</div>
              \${d.pendingLab.length === 0 ? '<div class="muted">همه مستندات بررسی شده‌اند ✅</div>' :
                d.pendingLab.map(s => \`
                  <div class="card" style="background:#0F172A;margin-bottom:10px;">
                    <div style="font-weight:800;color:var(--gold-light);">👤 \${esc(s.student_name)} — \${esc(s.title)}</div>
                    <div style="white-space:pre-wrap;font-size:13px;margin:6px 0;">\${esc(s.meta_note)}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                      <button class="btn btn-emerald btn-sm" onclick="decideLabApp(\${s.id}, 'approve', 3)">✅ +3</button>
                      <button class="btn btn-emerald btn-sm" onclick="decideLabApp(\${s.id}, 'approve', 5)">✅ +5</button>
                      <button class="btn btn-emerald btn-sm" onclick="decideLabApp(\${s.id}, 'approve', 10)">✅ +10</button>
                      <button class="btn btn-ghost btn-sm" onclick="const p=prompt('امتیاز دلخواه:');if(p)decideLabApp(\${s.id},'approve',parseInt(p,10))">✏️ دلخواه</button>
                      <button class="btn btn-rose btn-sm" onclick="decideLabApp(\${s.id}, 'reject', 0)">❌ رد</button>
                    </div>
                  </div>
                \`).join("")}
            </div>

            <div class="card">
              <div class="section-title">🛒 درخواست‌های خرید فروشگاه جوایز (\${d.pendingShop.length})</div>
              \${d.pendingShop.length === 0 ? '<div class="muted">درخواست خرید جدیدی وجود ندارد.</div>' :
                d.pendingShop.map(o => \`
                  <div class="att-row">
                    <div><b>\${esc(o.student_name)}</b>: \${esc(o.item_title)} (\${o.cost} ⭐)</div>
                    <div style="display:flex;gap:5px;">
                      <button class="btn btn-emerald btn-sm" onclick="decideShopApp(\${o.id}, true)">تایید</button>
                      <button class="btn btn-rose btn-sm" onclick="decideShopApp(\${o.id}, false)">رد</button>
                    </div>
                  </div>
                \`).join("")}
            </div>

            <div class="card">
              <div class="section-title">📝 آخرین تکالیف ارسالی دانش‌آموزان</div>
              \${d.recentHw.map(h => \`
                <div class="att-row">
                  <div><b>\${esc(h.name)}</b> (\${esc(h.type)}) <span class="muted">\${esc(h.date)}</span>\${h.feedback ? '<div class="muted">'+esc(h.feedback)+'</div>' : ''}</div>
                  <button class="btn btn-gold btn-sm" onclick="gradeHwApp(\${h.id})">\${h.score>0 ? 'نمره '+h.score : 'ثبت نمره'}</button>
                </div>
              \`).join("")}
            </div>
          \`;
        } else if (activeTab === "att") {
          main.innerHTML = \`
            <div class="card">
              <div class="section-title">✅ حضور و غیاب تک‌کلیکی امروز (\${esc(d.todayJalali)})</div>
              <p class="muted">با لمس وضعیت هر دانش‌آموز بین حاضر، غایب و تاخیر جابه‌جا شوید:</p>
              \${d.students.map(s => {
                const st = d.attendanceToday[s.user_id] || "present";
                const lbl = st==="present" ? "✅ حاضر" : st==="absent" ? "❌ غایب" : "⏰ تاخیر";
                const cls = st==="present" ? "btn-emerald" : st==="absent" ? "btn-rose" : "btn-gold";
                return \`
                  <div class="att-row">
                    <span style="font-weight:700;">👤 \${esc(s.name)}</span>
                    <button class="btn \${cls} btn-sm" onclick="toggleAttApp(\${s.user_id}, '\${st}')">\${lbl}</button>
                  </div>
                \`;
              }).join("")}
              <button class="btn" style="margin-top:12px;" onclick="notifyAbsentParentsApp()">📨 ارسال اطلاعیه غیبت/تاخیر به تلگرام والدین متصل</button>
            </div>
          \`;
        } else if (activeTab === "ai") {
          main.innerHTML = \`
            <div class="sub-tabs">
              <button class="role-tab \${teacherSubTool==='quiz'?'active':''}" onclick="teacherSubTool='quiz';renderApp()">🎲 کوییز AI</button>
              <button class="role-tab \${teacherSubTool==='summary'?'active':''}" onclick="teacherSubTool='summary';renderApp()">📚 جزوه‌ساز</button>
              <button class="role-tab \${teacherSubTool==='exam'?'active':''}" onclick="teacherSubTool='exam';renderApp()">📄 امتحان ۲۰</button>
              <button class="role-tab \${teacherSubTool==='lib'?'active':''}" onclick="teacherSubTool='lib';renderApp()">📂 کتابخانه</button>
            </div>
            <div class="card">
              \${teacherSubTool === 'quiz' ? \`
                <div class="section-title">🎲 طراحی و انتشار کوییز چهارگزینه‌ای در اپ و تلگرام</div>
                <input id="tqTopic" class="input" placeholder="موضوع سوال (مثلاً: فصل ۴ ریاضی نهم توان و ریشه)" />
                <input id="tqPoints" class="input" type="number" value="5" placeholder="امتیاز پاسخ صحیح" />
                <button class="btn btn-emerald" onclick="teacherMakeQuizApp()">🚀 ساخت با هوش مصنوعی و انتشار برای کل کلاس</button>
              \` : teacherSubTool === 'summary' ? \`
                <div class="section-title">📚 جزوه‌ساز هوشمند شب امتحان</div>
                <textarea id="tsText" rows="4" placeholder="موضوع یا متن درس را وارد کنید..."></textarea>
                <button class="btn" onclick="teacherDocToolApp('summary')">✨ تولید جزوه و ذخیره در کتابخانه کلاس</button>
                <div id="tDocOut" style="white-space:pre-wrap;margin-top:12px;font-size:13px;"></div>
              \` : teacherSubTool === 'exam' ? \`
                <div class="section-title">📄 طراح برگه امتحانی تشریحی ۲۰ نمره‌ای + پاسخنامه</div>
                <textarea id="tsText" rows="4" placeholder="مبحث امتحانی یا متن فصل را وارد کنید..."></textarea>
                <button class="btn btn-gold" onclick="teacherDocToolApp('exam')">📄 طراحی برگه سوال + کلید پاسخنامه</button>
                <div id="tDocOut" style="white-space:pre-wrap;margin-top:12px;font-size:13px;"></div>
              \` : \`
                <div class="section-title">📂 افزودن جزوه یا نکته جدید به کتابخانه کلاس</div>
                <input id="libTitleInp" class="input" placeholder="عنوان جزوه یا نمونه سوال" />
                <select id="libCatInp" class="input">
                  <option value="جزوه و درسنامه">📚 جزوه و درسنامه</option>
                  <option value="نمونه سوال امتحانی">📄 نمونه سوال امتحانی</option>
                  <option value="نکات طلایی">💡 نکات طلایی</option>
                </select>
                <textarea id="libBodyInp" rows="4" placeholder="متن کامل جزوه، فرمول‌ها یا نمونه سوالات..."></textarea>
                <button class="btn btn-emerald" onclick="teacherAddLibApp()">➕ ذخیره در کتابخانه کلاس</button>
              \`}
            </div>
          \`;
        } else if (activeTab === "class") {
          main.innerHTML = \`
            <div class="card">
              <div class="section-title">🔑 لیست دانش‌آموزان، امتیازها و کدهای ورود (دانش‌آموز و والدین)</div>
              <p class="muted">روی دکمه «📋 کپی کارت ورود» هر دانش‌آموز بزنید تا کد دانش‌آموزی و کد والدین او آماده ارسال شود:</p>
              \${d.students.map((s, idx) => \`
                <div class="card" style="background:#0F172A;padding:11px;margin-bottom:9px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <b>\${idx+1}. \${esc(s.name)} (\${s.score} ⭐)</b>
                    <div style="display:flex;gap:4px;">
                      <button class="btn btn-emerald btn-sm" onclick="teacherScoreApp(\${s.user_id}, 5)">+5</button>
                      <button class="btn btn-rose btn-sm" onclick="teacherScoreApp(\${s.user_id}, -5)">-5</button>
                      <button class="btn btn-gold btn-sm" onclick="teacherIssueCertApp(\${s.user_id}, '\${esc(s.name)}')">🏅 لوح</button>
                    </div>
                  </div>
                  <div class="muted" style="margin-top:6px;">
                    🎒 کد دانش‌آموز: <b style="color:#fff;" dir="ltr">\${s.student_code}</b> (رمز: <span dir="ltr">\${s.student_pin}</span>) |
                    👪 کد والدین: <b style="color:var(--gold-light);" dir="ltr">\${s.parent_code}</b>
                  </div>
                  <button class="btn btn-ghost btn-sm" style="margin-top:6px;width:100%;" onclick="copyLoginCard('\${esc(s.name)}','\${s.student_code}','\${s.student_pin}','\${s.parent_code}')">📋 کپی کارت ورود دانش‌آموز و ولی</button>
                </div>
              \`).join("")}
            </div>

            <div class="card">
              <div class="section-title">👥 گروه‌بندی هوشمند متعادل و امتیاز تیمی</div>
              <div class="grid-2" style="margin-bottom:10px;">
                <button class="btn btn-ghost btn-sm" onclick="teacherMakeTeamsApp(3, 'balanced')">⚖️ گروه‌بندی متعادل ۳ نفره</button>
                <button class="btn btn-ghost btn-sm" onclick="teacherMakeTeamsApp(4, 'balanced')">⚖️ گروه‌بندی متعادل ۴ نفره</button>
              </div>
              \${d.teams.map(t => \`
                <div class="att-row">
                  <div><b>\${esc(t.teamName)}</b><div class="muted">\${t.members.map(m=>esc(m.name)).join(' ، ')}</div></div>
                  <button class="btn btn-gold btn-sm" onclick="teacherTeamPtsApp(\${t.id}, 5)">⭐ +5 تیمی</button>
                </div>
              \`).join("")}
            </div>
          \`;
        } else if (activeTab === "pchat") {
          main.innerHTML = \`
            <div class="card">
              <div class="section-title">💬 پیام‌های دریافتی و گفتگو با اولیا</div>
              \${d.parentMessages.length === 0 ? '<div class="muted">هنوز پیامی از طرف اولیا ارسال نشده است.</div>' :
                d.parentMessages.map(m => \`
                  <div class="card" style="background:#0F172A;margin-bottom:9px;">
                    <div style="display:flex;justify-content:space-between;">
                      <b style="color:var(--gold-light);">\${m.sender_role==='parent'?'👪 ولیِ ':'👨‍🏫 پاسخ شما به ولیِ '}\${esc(m.student_name)}</b>
                      <span class="muted">\${esc(m.date)}</span>
                    </div>
                    <div style="margin:6px 0;">\${esc(m.message)}</div>
                    \${m.sender_role === 'parent' ? \`
                      <button class="btn btn-ghost btn-sm" onclick="replyParentApp(\${m.student_id}, '\${esc(m.student_name)}')">↩️ ارسال پاسخ مستقیم به پنل ولی</button>
                    \` : ''}
                  </div>
                \`).join("")}
            </div>
          \`;
        }
      } catch (e) {
        main.innerHTML = \`<div class="card">❌ \${esc(e.message)}</div>\`;
      }
    }

    function copyLoginCard(name, scode, spin, pcode) {
      const txt = "🎓 کارت ورود به اپلیکیشن «کلاس هوشمند»\\n👤 دانش‌آموز: " + name + "\\n\\n🎒 کد ورود دانش‌آموز: " + scode + "\\n🔑 رمز عبور: " + spin + "\\n\\n👪 کد اختصاصی پنل والدین: " + pcode + "\\n🌐 آدرس وب‌اپ: " + (getApiBase() || window.location.origin) + "/app";
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
      showToast("📋 کارت ورود «" + name + "» کپی شد!");
    }

    async function teacherAnnounceApp() {
      try {
        const text = document.getElementById("annTxt").value.trim();
        if (!text) return showToast("متن اعلان را بنویسید");
        const r = await api("/api/app/teacher/announce", { text });
        showToast("✅ اعلان برای " + r.sent + " نفر ارسال شد!");
        document.getElementById("annTxt").value = "";
      } catch (e) { showToast("❌ " + e.message); }
    }
    async function teacherAddDeadlineApp() {
      try {
        const title = document.getElementById("dlTitle").value.trim();
        const dueDate = document.getElementById("dlDate").value.trim();
        if (!title || !dueDate) return showToast("عنوان و تاریخ را پر کنید");
        await api("/api/app/teacher/deadline", { title, dueDate });
        showToast("✅ ددلاین ثبت شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }
    async function teacherDelDeadlineApp(id) {
      await api("/api/app/teacher/deadline-del", { id });
      renderApp();
    }
    async function clearMuddyTeacherApp() {
      await api("/api/app/teacher/muddy-clear", {});
      renderApp();
    }
    async function decideLabApp(subId, decision, points) {
      try {
        await api("/api/app/teacher/lab-decide", { subId, decision, points });
        showToast(decision === "approve" ? "✅ تایید شد و +" + points + " امتیاز ثبت گردید!" : "❌ رد شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }
    async function decideShopApp(orderId, approve) {
      try {
        await api("/api/app/teacher/shop-decide", { orderId, approve });
        showToast(approve ? "✅ جایزه تایید و امتیاز کسر شد" : "❌ رد شد");
        renderApp();
      } catch (e) { showToast("❌ " + e.message); }
    }
    async function gradeHwApp(hwId) {
      const scoreStr = prompt("نمره تکلیف را وارد کنید (مثلاً 20):");
      if (scoreStr === null) return;
      const feedback = prompt("بازخورد تشویقی برای دانش‌آموز و والدین:") || "آفرین، عالی بود!";
      await api("/api/app/teacher/grade-hw", { hwId, score: parseInt(scoreStr, 10) || 0, feedback });
      showToast("✅ نمره و بازخورد ثبت شد!");
      renderApp();
    }
    async function toggleAttApp(userId, cur) {
      const next = cur === "present" ? "absent" : cur === "absent" ? "late" : "present";
      await api("/api/app/teacher/attendance", { userId, status: next });
      renderApp();
    }
    async function notifyAbsentParentsApp() {
      const r = await api("/api/app/teacher/attendance-notify", {});
      showToast("📨 اطلاعیه برای " + r.notified + " ولی در تلگرام ارسال شد");
    }
    async function teacherMakeQuizApp() {
      try {
        const topic = document.getElementById("tqTopic").value.trim();
        const points = parseInt(document.getElementById("tqPoints").value, 10) || 5;
        if (!topic) return showToast("موضوع کوییز را بنویسید");
        showToast("🤖 در حال طراحی کوییز و ارسال به کلاس...");
        const r = await api("/api/app/teacher/quiz-ai", { topic, points });
        showToast("✅ کوییز ساخته و برای کل کلاس منتشر شد!");
        document.getElementById("tqTopic").value = "";
      } catch (e) { showToast("❌ " + e.message); }
    }
    async function teacherDocToolApp(kind) {
      try {
        const text = document.getElementById("tsText").value.trim();
        if (text.length < 5) return showToast("موضوع یا متن درس را وارد کنید");
        document.getElementById("tDocOut").textContent = "⏳ در حال نگارش با هوش مصنوعی...";
        const r = await api("/api/app/teacher/doc-ai", { kind, text });
        document.getElementById("tDocOut").textContent = r.output;
        showToast("✅ آماده شد و در کتابخانه کلاس هم ذخیره گردید!");
      } catch (e) { showToast("❌ " + e.message); }
    }
    async function teacherAddLibApp() {
      try {
        const title = document.getElementById("libTitleInp").value.trim();
        const category = document.getElementById("libCatInp").value;
        const body = document.getElementById("libBodyInp").value.trim();
        if (!title || !body) return showToast("عنوان و متن را وارد کنید");
        await api("/api/app/teacher/library-add", { title, category, body });
        showToast("📂 در کتابخانه کلاس ذخیره شد!");
        document.getElementById("libTitleInp").value = "";
        document.getElementById("libBodyInp").value = "";
      } catch (e) { showToast("❌ " + e.message); }
    }
    async function teacherScoreApp(userId, delta) {
      await api("/api/app/teacher/score", { userId, delta });
      showToast((delta > 0 ? "✅ +" : "➖ ") + delta + " امتیاز اعمال شد");
      renderApp();
    }
    async function teacherIssueCertApp(userId, name) {
      const awardTitle = prompt("عنوان روی لوح تقدیر «" + name + "»:", "قهرمان تلاش و پیشرفت هفته");
      if (!awardTitle) return;
      showToast("🎨 در حال طراحی و ارسال لوح تقدیر تصویری...");
      await api("/api/app/teacher/certificate", { userId, awardTitle });
      showToast("🏅 لوح تقدیر صادر و در پنل دانش‌آموز و والدین ثبت شد!");
    }
    async function teacherMakeTeamsApp(size, mode) {
      await api("/api/app/teacher/teams", { size, mode });
      showToast("👥 گروه‌بندی جدید کلاس ساخته شد!");
      renderApp();
    }
    async function teacherTeamPtsApp(teamId, pts) {
      await api("/api/app/teacher/team-points", { teamId, pts });
      showToast("⭐ +" + pts + " امتیاز تیمی به همه اعضای گروه داده شد!");
      renderApp();
    }
    async function replyParentApp(studentId, studentName) {
      const msg = prompt("پاسخ شما به ولیِ «" + studentName + "»:");
      if (!msg) return;
      await api("/api/app/teacher/parent-reply", { studentId, studentName, message: msg });
      showToast("✅ پاسخ شما در پنل والدین ثبت شد!");
      renderApp();
    }

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    renderApp();
  </script>
</body>
</html>`;
}




interface AppAccountRow {
  user_id: number;
  student_code: string;
  student_pin: string;
  parent_code: string;
  created_at: string;
}

interface ParentMessageRow {
  id: number;
  student_id: number;
  student_name: string;
  sender_role: "parent" | "teacher";
  message: string;
  is_read: number;
  created_at: string;
}

interface AppCertificateRow {
  id: number;
  student_id: number;
  student_name: string;
  award_title: string;
  image_b64: string;
  created_at: string;
}

interface AppCoreDeps {
  TEACHER_ID: number;
  TEACHER_NAME: string;
  PANEL_PASSWORD: string;
  DAILY_MISSIONS: string[];
  DEFAULT_DICTATION_TEXTS: { title: string; text: string; voiceFileId?: string }[];
  normalizeDigits: (s: string) => string;
  uint8ToBase64: (bytes: Uint8Array) => string;
  toJalali: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  getLevelInfo: (lvl: number) => { level: number; name: string; minScore: number };
  getNextLevelInfo: (lvl: number) => { level: number; name: string; minScore: number } | null;
  ensureExtraTables: (db: D1Database) => Promise<void>;
  getBotState: <T = any>(db: D1Database, key: string) => Promise<T | null>;
  setBotState: (db: D1Database, key: string, val: any) => Promise<void>;
  getStudent: (db: D1Database, uid: number) => Promise<any>;
  getAllStudents: (db: D1Database) => Promise<any[]>;
  saveStudent: (db: D1Database, uid: number, name: string, grade: string) => Promise<void>;
  updateScore: (db: D1Database, uid: number, delta: number) => Promise<any>;
  updateStreak: (db: D1Database, uid: number) => Promise<{ streak: number; isNew: boolean }>;
  checkAndAwardBadges: (db: D1Database, uid: number) => Promise<string[]>;
  getBadges: (db: D1Database, uid: number) => Promise<any[]>;
  addHomework: (db: D1Database, uid: number, name: string, type: string) => Promise<number>;
  getHomework: (db: D1Database, uid: number) => Promise<any[]>;
  getHomeworkById: (db: D1Database, id: number) => Promise<any>;
  setHomeworkFeedback: (db: D1Database, id: number, score: number, fb: string) => Promise<void>;
  getAllDeadlines: (db: D1Database) => Promise<any[]>;
  addDeadline: (db: D1Database, title: string, dueDate: string) => Promise<number>;
  deleteDeadline: (db: D1Database, id: number) => Promise<void>;
  getTodayMission: (db: D1Database, uid: number) => Promise<any>;
  createMission: (db: D1Database, uid: number, name: string, mission: string) => Promise<number>;
  setMissionStatus: (db: D1Database, id: number, status: number) => Promise<void>;
  getLatestQuiz: (db: D1Database) => Promise<any>;
  getQuizById: (db: D1Database, id: number) => Promise<any>;
  hasAnsweredQuiz: (db: D1Database, qid: number, uid: number) => Promise<boolean>;
  answerQuiz: (db: D1Database, qid: number, uid: number, name: string, ans: number, ok: number) => Promise<void>;
  addQuiz: (db: D1Database, q: string, opts: string[], corr: number, pts: number) => Promise<number>;
  generateQuizWithAI: (env: any, topic: string) => Promise<any>;
  shuffleQuizOptions: (q: { question: string; options: string[]; correct: number }) => { question: string; options: string[]; correct: number };
  getActiveShopItems: (db: D1Database) => Promise<any[]>;
  getShopItemById: (db: D1Database, id: number) => Promise<any>;
  getPendingCostForStudent: (db: D1Database, uid: number) => Promise<number>;
  createShopOrder: (db: D1Database, uid: number, name: string, item: any) => Promise<number>;
  getPendingShopOrders: (db: D1Database) => Promise<any[]>;
  getShopOrderById: (db: D1Database, id: number) => Promise<any>;
  setShopOrderStatus: (db: D1Database, id: number, status: string) => Promise<void>;
  getStudentWeeklyStudyMinutes: (db: D1Database, uid: number) => Promise<number>;
  recordStudySession: (db: D1Database, uid: number, name: string, subj: string, min: number) => Promise<void>;
  createLabSubmission: (db: D1Database, uid: number, name: string, wait: any) => Promise<number>;
  getLabSubmissionById: (db: D1Database, id: number) => Promise<any>;
  updateLabSubmissionDecision: (db: D1Database, id: number, status: string, pts: number) => Promise<void>;
  getFlashcardStats: (db: D1Database, uid: number) => Promise<{ total: number; due: number; mastered: number }>;
  addFlashcard: (db: D1Database, uid: number, front: string, back: string) => Promise<void>;
  updateFlashcardReview: (db: D1Database, id: number, knew: boolean) => Promise<number>;
  generateFlashcardsWithAI: (env: any, topic: string) => Promise<{ front: string; back: string }[]>;
  getLibraryItems: (db: D1Database, cat?: string) => Promise<any[]>;
  addLibraryItem: (db: D1Database, cat: string, title: string, cType: any, fid: string, body: string) => Promise<number>;
  getAttendanceByDate: (db: D1Database, dateStr: string) => Promise<Record<number, "present" | "absent" | "late">>;
  setAttendanceStatus: (db: D1Database, uid: number, name: string, dateStr: string, st: "present" | "absent" | "late") => Promise<void>;
  getClassTeams: (db: D1Database) => Promise<any[]>;
  saveClassTeams: (db: D1Database, teams: any[]) => Promise<void>;
  generateSmartClassTeams: (students: any[], size: number, mode: "balanced" | "random") => any[];
  addMuddyFeedback: (db: D1Database, name: string, detail: string, anon: boolean) => Promise<void>;
  getRecentMuddyFeedback: (db: D1Database) => Promise<any[]>;
  clearMuddyFeedback: (db: D1Database) => Promise<void>;
  askAI: (env: any, q: string) => Promise<any>;
  extractTextFromImagesWithVision: (env: any, urls: string[]) => Promise<string>;
  generateMindMapPngWithAI: (env: any, topic: string) => Promise<{ png: Uint8Array | null; rootTitle: string; textFallback: string }>;
  generateCertificatePng: (name: string, grade: string, score: number, award: string) => Promise<Uint8Array | null>;
  runEnglishConversationTurn: (env: any, text: string) => Promise<any>;
  evaluatePersianEssayWithAI: (env: any, text: string) => Promise<string>;
  evaluateDictationWithAI: (env: any, expected: string, studentOcr: string) => Promise<string>;
  runScienceLabStepWithAI: (env: any, topic: string, step: number, log: string[], chosen?: string) => Promise<any>;
  runScientistChatTurn: (env: any, sciKey: string, q: string) => Promise<string>;
  generateWeeklyStudyPlanWithAI: (env: any, goals: string, grade: string) => Promise<string>;
  generateLessonSummaryWithAI: (env: any, src: string, info: string) => Promise<string>;
  generateDescriptiveExamWithAI: (env: any, src: string, info: string) => Promise<{ examSheet: string; answerKey: string }>;
  getTodayWordPuzzle: () => { index: number; dayKey: string; puzzle: any; scrambled: string };
  createBot: (env: any) => Bot;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResp(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// امضای رمزنگاری‌شده توکن نشست اپلیکیشن (HMAC-SHA256 بدون نیاز به دیتابیس نشست)
async function signToken(payload: Record<string, any>, secret: string): Promise<string> {
  const raw = JSON.stringify({ ...payload, iat: Date.now() });
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  const b64Payload = btoa(unescape(encodeURIComponent(raw)));
  const b64Sig = btoa(String.fromCharCode(...sig));
  return `${b64Payload}.${b64Sig}`;
}

async function verifyToken(token: string, secret: string): Promise<any | null> {
  try {
    const [b64Payload, b64Sig] = token.split(".");
    if (!b64Payload || !b64Sig) return null;
    const raw = decodeURIComponent(escape(atob(b64Payload)));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
    const expectedB64 = btoa(String.fromCharCode(...expected));
    if (expectedB64 !== b64Sig) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// تولید و تضمین کد ۶ رقمی یکتا برای دانش‌آموز و کد ۶ رقمی مجزا برای والدین او
async function ensureStudentAppCredentials(
  db: D1Database,
  userId: number,
  defaultPin = "1234"
): Promise<AppAccountRow> {
  const existing = await db.prepare("SELECT * FROM app_accounts WHERE user_id = ?").bind(userId).first<AppAccountRow>();
  if (existing) return existing;

  let seedA = Math.abs((userId * 7919 + 135791) % 899999) + 100000;
  let seedB = Math.abs((userId * 6151 + 482713) % 899999) + 100000;
  if (seedB === seedA) seedB = ((seedB + 111111 - 100000) % 899999) + 100000;

  for (let attempt = 0; attempt < 25; attempt++) {
    const sCode = String(((seedA + attempt * 37) % 899999) + 100000).slice(0, 6);
    const pCode = String(((seedB + attempt * 53) % 899999) + 100000).slice(0, 6);
    if (sCode === pCode) continue;
    try {
      const now = new Date().toISOString();
      await db
        .prepare("INSERT INTO app_accounts (user_id, student_code, student_pin, parent_code, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(userId, sCode, defaultPin, pCode, now)
        .run();
      return { user_id: userId, student_code: sCode, student_pin: defaultPin, parent_code: pCode, created_at: now };
    } catch {}
  }
  const fallbackS = String(Math.floor(100000 + Math.random() * 899999));
  const fallbackP = String(Math.floor(100000 + Math.random() * 899999));
  const now = new Date().toISOString();
  await db
    .prepare("INSERT OR REPLACE INTO app_accounts (user_id, student_code, student_pin, parent_code, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, fallbackS, defaultPin, fallbackP, now)
    .run();
  return { user_id: userId, student_code: fallbackS, student_pin: defaultPin, parent_code: fallbackP, created_at: now };
}

async function saveCertificateInAppDb(
  db: D1Database,
  studentId: number,
  studentName: string,
  awardTitle: string,
  pngBytes: Uint8Array,
  uint8ToBase64: (b: Uint8Array) => string
) {
  const dataUrl = `data:image/png;base64,${uint8ToBase64(pngBytes)}`;
  await db
    .prepare("INSERT INTO app_certificates (student_id, student_name, award_title, image_b64, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(studentId, studentName, awardTitle, dataUrl, new Date().toISOString())
    .run();
}

async function handleAppRequest(
  request: Request,
  env: any,
  core: AppCoreDeps
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS" && (path.startsWith("/api/app/") || path === "/app")) {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // ۱. فایل‌های وب‌اپلیکیشن قابل نصب (PWA برای آیفون، اندروید و مرورگر)
  if (path === "/app" || path === "/app/") {
    return new Response(buildAppHtml(""), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (path === "/manifest.json") {
    return new Response(buildManifestJson(), {
      headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
    });
  }
  if (path === "/sw.js") {
    return new Response(buildServiceWorkerJs(), {
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }
  if (path === "/app-icon.svg") {
    return new Response(APP_ICON_SVG, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" },
    });
  }

  if (!path.startsWith("/api/app/")) return null;

  const db: D1Database = env.telegram_bot_db;
  await core.ensureExtraTables(db);

  try {
    // ==================== ورود ۳ پنله و ثبت‌نام ====================
    if (path === "/api/app/login" && request.method === "POST") {
      const body = (await request.json()) as any;
      const role = body.role;

      if (role === "teacher") {
        if (body.password !== core.PANEL_PASSWORD) {
          return jsonResp({ error: "رمز مدیریت اشتباه است." }, 401);
        }
        const token = await signToken({ role: "teacher" }, core.PANEL_PASSWORD);
        return jsonResp({ session: { role: "teacher", name: core.TEACHER_NAME, token } });
      }

      // اطمینان از ساخته شدن کدها برای همه دانش‌آموزان قبلی ربات تلگرام
      const allSt = await core.getAllStudents(db);
      for (const s of allSt) {
        await ensureStudentAppCredentials(db, s.user_id);
      }

      const cleanCode = core.normalizeDigits(String(body.code || "")).trim();
      if (role === "student") {
        const cleanPin = core.normalizeDigits(String(body.pin || "")).trim();
        const acc = await db
          .prepare("SELECT * FROM app_accounts WHERE student_code = ?")
          .bind(cleanCode)
          .first<AppAccountRow>();
        if (!acc || acc.student_pin !== cleanPin) {
          return jsonResp({ error: "کد دانش‌آموزی یا رمز عبور اشتباه است." }, 401);
        }
        const st = await core.getStudent(db, acc.user_id);
        if (!st) return jsonResp({ error: "حساب دانش‌آموز یافت نشد." }, 404);
        const token = await signToken({ role: "student", userId: st.user_id, name: st.name }, core.PANEL_PASSWORD);
        return jsonResp({ session: { role: "student", userId: st.user_id, name: st.name, token } });
      }

      if (role === "parent") {
        const acc = await db
          .prepare("SELECT * FROM app_accounts WHERE parent_code = ?")
          .bind(cleanCode)
          .first<AppAccountRow>();
        if (!acc) {
          return jsonResp({ error: "کد اختصاصی والدین معتبر نیست. لطفاً کد را از معلم دریافت فرمایید." }, 401);
        }
        const st = await core.getStudent(db, acc.user_id);
        if (!st) return jsonResp({ error: "اطلاعات دانش‌آموز یافت نشد." }, 404);
        const token = await signToken(
          { role: "parent", studentId: st.user_id, studentName: st.name },
          core.PANEL_PASSWORD
        );
        return jsonResp({ session: { role: "parent", studentId: st.user_id, studentName: st.name, token } });
      }

      return jsonResp({ error: "نقش ورود نامعتبر است." }, 400);
    }

    if (path === "/api/app/signup" && request.method === "POST") {
      const body = (await request.json()) as any;
      const name = String(body.name || "").trim();
      const grade = String(body.grade || "").trim();
      const pin = core.normalizeDigits(String(body.pin || "1234")).trim() || "1234";
      if (name.length < 3) return jsonResp({ error: "نام و نام خانوادگی کوتاه است." }, 400);

      // تولید شناسه یکتا برای دانش‌آموزی که مستقیم در اپلیکیشن ثبت‌نام می‌کند
      const newUid = 800000000 + Math.floor(Math.random() * 190000000);
      await core.saveStudent(db, newUid, name, grade);
      const cred = await ensureStudentAppCredentials(db, newUid, pin);

      try {
        const bot = core.createBot(env);
        await bot.api.sendMessage(
          core.TEACHER_ID,
          `📱 ثبت‌نام دانش‌آموز جدید از طریق اپلیکیشن اندروید:\n👤 نام: ${name} (${grade || "بدون پایه"})\n🎒 کد دانش‌آموز: ${cred.student_code}\n👪 کد والدین: ${cred.parent_code}`
        );
      } catch {}

      const token = await signToken({ role: "student", userId: newUid, name }, core.PANEL_PASSWORD);
      return jsonResp({
        session: { role: "student", userId: newUid, name, token },
        studentCode: cred.student_code,
        parentCode: cred.parent_code,
      });
    }

    // ==================== احراز هویت توکن برای بقیه مسیرها ====================
    const authHeader = request.headers.get("Authorization") || "";
    const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const auth = await verifyToken(rawToken, core.PANEL_PASSWORD);
    if (!auth) return jsonResp({ error: "نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید." }, 401);

    // ====================================================================
    // 🎒 مسیرهای پنل دانش‌آموز
    // ====================================================================
    if (auth.role === "student") {
      const uid = Number(auth.userId);
      const student = await core.getStudent(db, uid);
      if (!student) return jsonResp({ error: "دانش‌آموز پیدا نشد." }, 404);

      if (path === "/api/app/student/overview") {
        const all = await core.getAllStudents(db);
        const rank = all.findIndex((s) => s.user_id === uid) + 1;
        const badges = await core.getBadges(db, uid);
        const deadlines = await core.getAllDeadlines(db);
        const weeklyStudyMin = await core.getStudentWeeklyStudyMinutes(db, uid);
        const credentials = await ensureStudentAppCredentials(db, uid);

        let mission = await core.getTodayMission(db, uid);
        if (!mission) {
          const mTxt = core.DAILY_MISSIONS[Math.floor(Math.random() * core.DAILY_MISSIONS.length)];
          const mid = await core.createMission(db, uid, student.name, mTxt);
          mission = { id: mid, user_id: uid, name: student.name, mission: mTxt, done: 0 };
        }

        return jsonResp({
          student,
          levelName: core.getLevelInfo(student.level || 1).name,
          nextLevel: core.getNextLevelInfo(student.level || 1),
          rank: rank || all.length,
          totalStudents: all.length,
          weeklyStudyMin,
          badges,
          mission,
          deadlines,
          credentials,
        });
      }

      if (path === "/api/app/student/mission" && request.method === "POST") {
        const body = (await request.json()) as any;
        let mission = await core.getTodayMission(db, uid);
        if (!mission) return jsonResp({ error: "ماموریت امروز یافت نشد." }, 404);
        await core.setMissionStatus(db, mission.id, 2);

        try {
          const bot = core.createBot(env);
          const kb = new InlineKeyboard()
            .text("✅ +2", `ms_ok_${mission.id}_2`)
            .text("✅ +5", `ms_ok_${mission.id}_5`)
            .text("✅ +10", `ms_ok_${mission.id}_10`)
            .text("✅ +15", `ms_ok_${mission.id}_15`).row()
            .text("✏️ تایید با امتیاز دلخواه", `ms_custom_${mission.id}`)
            .text("❌ رد کردن", `ms_rej_${mission.id}`);
          const caption = `📱🎯 گزارش ماموریت روز از اپلیکیشن\n👤 دانش‌آموز: ${student.name}\n📌 ماموریت: ${mission.mission}\n📝 توضیح: ${body.text || "تصویر پیوست"}`;
          if (body.imageB64) {
            const bytes = dataUrlToBytes(body.imageB64);
            if (bytes) await bot.api.sendPhoto(core.TEACHER_ID, new InputFile(bytes, "mission.jpg"), { caption: caption.slice(0, 950), reply_markup: kb });
          } else {
            await bot.api.sendMessage(core.TEACHER_ID, caption, { reply_markup: kb });
          }
        } catch {}
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/student/homework" && request.method === "POST") {
        const body = (await request.json()) as any;
        const typeLabel = body.imageB64 ? "📱📷 تکلیف تصویری اپ" : "📱✍️ تکلیف متنی اپ";
        const hwId = await core.addHomework(db, uid, student.name, typeLabel);
        const streakRes = await core.updateStreak(db, uid);
        await core.checkAndAwardBadges(db, uid);

        try {
          const bot = core.createBot(env);
          const kb = new InlineKeyboard()
            .text("✅ تایید", `approve_${hwId}`).text("❌ رد", `reject_${hwId}`).row()
            .text("⭐ +1", `quick_${hwId}_1`).text("⭐ +3", `quick_${hwId}_3`).text("⭐ +5", `quick_${hwId}_5`);
          const msgTxt = `📱📥 تکلیف ارسالی از اپلیکیشن\n👤 دانش‌آموز: ${student.name}\n🆔 ID: ${hwId}\n📝 متن: ${body.text || "فایل پیوست"}`;
          if (body.imageB64) {
            const bytes = dataUrlToBytes(body.imageB64);
            if (bytes) await bot.api.sendPhoto(core.TEACHER_ID, new InputFile(bytes, "homework.jpg"), { caption: msgTxt.slice(0, 950), reply_markup: kb });
          } else {
            await bot.api.sendMessage(core.TEACHER_ID, msgTxt.slice(0, 4000), { reply_markup: kb });
          }
        } catch {}

        return jsonResp({ ok: true, hwId, streak: streakRes.streak });
      }

      if (path === "/api/app/ai/ask" && request.method === "POST") {
        const { question } = (await request.json()) as any;
        const res = await core.askAI(env, String(question || ""));
        const imageDataUrl = res.imageBytes ? `data:image/jpeg;base64,${core.uint8ToBase64(res.imageBytes)}` : undefined;
        try {
          const bot = core.createBot(env);
          await bot.api.sendMessage(core.TEACHER_ID, `📱❓ سوال دانش‌آموز در اپلیکیشن\n👤 ${student.name}\nسوال: ${question}\n\nپاسخ: ${String(res.text || "").slice(0, 900)}`);
        } catch {}
        return jsonResp({
          text: res.text,
          photoUrl: res.photoUrl,
          imageDataUrl,
          audioUrl: res.audioUrl,
        });
      }

      if (path === "/api/app/ai/homework-image" && request.method === "POST") {
        const { imageB64 } = (await request.json()) as any;
        const ocr = await core.extractTextFromImagesWithVision(env, [imageB64]);
        const ai = await core.askAI(env, `این متن تکلیف دانش‌آموز است، آن را بررسی و اشکالاتش را مهربانانه به فارسی توضیح بده:\n${ocr}`);
        return jsonResp({ analysis: ai.text });
      }

      if (path === "/api/app/leitner") {
        const stats = await core.getFlashcardStats(db, uid);
        const now = new Date().toISOString();
        const dueCards = (
          await db
            .prepare("SELECT * FROM flashcards WHERE user_id = ? AND next_review <= ? ORDER BY box ASC, id ASC LIMIT 20")
            .bind(uid, now)
            .all()
        ).results;
        return jsonResp({ stats, dueCards });
      }

      if (path === "/api/app/leitner/answer" && request.method === "POST") {
        const { cardId, knew } = (await request.json()) as any;
        await core.updateFlashcardReview(db, Number(cardId), Boolean(knew));
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/leitner/generate" && request.method === "POST") {
        const { topic } = (await request.json()) as any;
        const cards = await core.generateFlashcardsWithAI(env, String(topic || ""));
        for (const c of cards) {
          await core.addFlashcard(db, uid, c.front, c.back);
        }
        return jsonResp({ ok: true, count: cards.length });
      }

      if (path === "/api/app/library") {
        const items = await core.getLibraryItems(db);
        return jsonResp({ items });
      }

      if (path === "/api/app/mindmap" && request.method === "POST") {
        const { topic } = (await request.json()) as any;
        const mm = await core.generateMindMapPngWithAI(env, String(topic || ""));
        return jsonResp({
          imageB64: mm.png ? `data:image/png;base64,${core.uint8ToBase64(mm.png)}` : null,
          textFallback: mm.textFallback,
        });
      }

      if (path === "/api/app/english" && request.method === "POST") {
        const { text } = (await request.json()) as any;
        const turn = await core.runEnglishConversationTurn(env, String(text || ""));
        return jsonResp(turn);
      }

      if (path === "/api/app/essay" && request.method === "POST") {
        const { text, imageB64 } = (await request.json()) as any;
        let essayTxt = String(text || "").trim();
        if (imageB64) {
          const ocr = await core.extractTextFromImagesWithVision(env, [imageB64]);
          if (ocr) essayTxt = ocr;
        }
        const review = await core.evaluatePersianEssayWithAI(env, essayTxt);
        return jsonResp({ review });
      }

      if (path === "/api/app/dictation") {
        const active = await core.getBotState<{ title: string; text: string }>(db, "active_dictation");
        const fallback = core.DEFAULT_DICTATION_TEXTS[Math.floor(Date.now() / 86400000) % core.DEFAULT_DICTATION_TEXTS.length];
        return jsonResp(active || fallback);
      }

      if (path === "/api/app/dictation/check" && request.method === "POST") {
        const { imageB64 } = (await request.json()) as any;
        const active = await core.getBotState<{ title: string; text: string }>(db, "active_dictation");
        const fallback = core.DEFAULT_DICTATION_TEXTS[Math.floor(Date.now() / 86400000) % core.DEFAULT_DICTATION_TEXTS.length];
        const chosen = active || fallback;

        const ocr = await core.extractTextFromImagesWithVision(env, [imageB64]);
        const aiCheck = await core.evaluateDictationWithAI(env, chosen.text, ocr || "متن ناخوانا");
        const subId = await core.createLabSubmission(db, uid, student.name, {
          category: "dictation",
          title: `🎙 آزمون دیکته (${chosen.title})`,
          minutes: 0,
          metaNote: `نتیجه بررسی اولیه AI:\n${aiCheck.slice(0, 600)}`,
        });

        try {
          const bot = core.createBot(env);
          const kb = new InlineKeyboard()
            .text("✅ +2", `lab_ok_${subId}_2`).text("✅ +3", `lab_ok_${subId}_3`)
            .text("✅ +5", `lab_ok_${subId}_5`).text("✅ +10", `lab_ok_${subId}_10`).row()
            .text("✏️ امتیاز دلخواه", `lab_custom_${subId}`).text("❌ رد", `lab_rej_${subId}`);
          const bytes = dataUrlToBytes(imageB64);
          if (bytes) {
            await bot.api.sendPhoto(core.TEACHER_ID, new InputFile(bytes, "dictation.jpg"), {
              caption: `📱🎙 برگه دیکته ارسالی از اپلیکیشن\n👤 ${student.name}\n\n${aiCheck}`.slice(0, 950),
              reply_markup: kb,
            });
          }
        } catch {}

        return jsonResp({ aiCheck });
      }

      if (path === "/api/app/scilab" && request.method === "POST") {
        const { topic, step, log, chosen } = (await request.json()) as any;
        const res = await core.runScienceLabStepWithAI(env, String(topic || ""), Number(step || 0), Array.isArray(log) ? log : [], chosen);
        return jsonResp(res);
      }

      if (path === "/api/app/scientist" && request.method === "POST") {
        const { sciKey, question } = (await request.json()) as any;
        const reply = await core.runScientistChatTurn(env, String(sciKey || "avicenna"), String(question || ""));
        return jsonResp({ reply });
      }

      if (path === "/api/app/planner") {
        if (request.method === "POST") {
          const { goals } = (await request.json()) as any;
          const plan = await core.generateWeeklyStudyPlanWithAI(env, String(goals || ""), student.grade || "");
          await core.setBotState(db, `study_plan_${uid}`, plan);
          return jsonResp({ plan });
        }
        const plan = await core.getBotState<string>(db, `study_plan_${uid}`);
        return jsonResp({ plan: plan || "" });
      }

      if (path === "/api/app/muddy" && request.method === "POST") {
        const { detail, isAnon } = (await request.json()) as any;
        await core.addMuddyFeedback(db, student.name, String(detail || "").slice(0, 400), Boolean(isAnon));
        try {
          const bot = core.createBot(env);
          await bot.api.sendMessage(
            core.TEACHER_ID,
            `📱🆘 گزارش «مبحث گنگ» از اپلیکیشن\n👤 فرستنده: ${isAnon ? "🔒 ناشناس" : student.name}\n📌 مبحث: ${detail}`
          );
        } catch {}
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/lab/submit-proof" && request.method === "POST") {
        const body = (await request.json()) as any;
        const subId = await core.createLabSubmission(db, uid, student.name, {
          category: body.category || "study",
          title: String(body.title || "کارگاه یادگیری"),
          minutes: Number(body.minutes || 0),
          metaNote: `خلاصه/توضیح دانش‌آموز:\n${String(body.text || "تصویر پیوست").slice(0, 800)}`,
        });

        try {
          const bot = core.createBot(env);
          const kb = new InlineKeyboard()
            .text("✅ +2", `lab_ok_${subId}_2`).text("✅ +3", `lab_ok_${subId}_3`)
            .text("✅ +5", `lab_ok_${subId}_5`).text("✅ +10", `lab_ok_${subId}_10`).row()
            .text("✏️ امتیاز دلخواه", `lab_custom_${subId}`).text("❌ رد کردن", `lab_rej_${subId}`);
          const msgTxt = `📱🧠 مستندات کارگاه یادگیری از اپلیکیشن\n👤 دانش‌آموز: ${student.name}\n📌 بخش: ${body.title}\n📝 خلاصه ارسالی:\n${body.text || "تصویر پیوست"}`;
          if (body.imageB64) {
            const bytes = dataUrlToBytes(body.imageB64);
            if (bytes) await bot.api.sendPhoto(core.TEACHER_ID, new InputFile(bytes, "proof.jpg"), { caption: msgTxt.slice(0, 950), reply_markup: kb });
          } else {
            await bot.api.sendMessage(core.TEACHER_ID, msgTxt.slice(0, 4000), { reply_markup: kb });
          }
        } catch {}

        return jsonResp({ ok: true, subId });
      }

      if (path === "/api/app/arena") {
        const all = await core.getAllStudents(db);
        const shopItems = await core.getActiveShopItems(db);
        const q = await core.getLatestQuiz(db);
        let latestQuiz = null;
        if (q) {
          const answered = await core.hasAnsweredQuiz(db, q.id, uid);
          latestQuiz = {
            id: q.id,
            question: q.question,
            options: JSON.parse(q.options),
            points: q.points,
            answered,
          };
        }
        const wp = core.getTodayWordPuzzle();
        const solved = Boolean(await core.getBotState<boolean>(db, `word_solved_${wp.dayKey}_${uid}`));

        return jsonResp({
          score: student.score,
          latestQuiz,
          wordPuzzle: {
            category: wp.puzzle.category,
            scrambled: wp.scrambled,
            hint1: wp.puzzle.hint1,
            word: solved ? wp.puzzle.word : "",
            fact: solved ? wp.puzzle.fact : "",
            solved,
          },
          shopItems,
          leaderboard: all.map((s) => ({
            name: s.name,
            score: s.score,
            level: core.getLevelInfo(s.level || 1).name,
          })),
        });
      }

      if (path === "/api/app/quiz/answer" && request.method === "POST") {
        const { quizId, answer } = (await request.json()) as any;
        const q = await core.getQuizById(db, Number(quizId));
        if (!q) return jsonResp({ error: "کوییز پیدا نشد." }, 404);
        if (await core.hasAnsweredQuiz(db, q.id, uid)) return jsonResp({ error: "قبلاً به این سوال پاسخ داده‌ای!" }, 400);
        const isCorrect = Number(answer) === q.correct;
        await core.answerQuiz(db, q.id, uid, student.name, Number(answer), isCorrect ? 1 : 0);
        if (isCorrect) await core.updateScore(db, uid, q.points);
        return jsonResp({ correct: isCorrect, points: q.points });
      }

      if (path === "/api/app/word/guess" && request.method === "POST") {
        const { guess } = (await request.json()) as any;
        const wp = core.getTodayWordPuzzle();
        const cleanG = String(guess || "").replace(/[\s\u200c\-]/g, "").trim();
        const cleanT = wp.puzzle.word.replace(/[\s\u200c\-]/g, "").trim();
        if (cleanG === cleanT) {
          await core.setBotState(db, `word_solved_${wp.dayKey}_${uid}`, true);
          return jsonResp({ solved: true });
        }
        return jsonResp({ solved: false, hint2: wp.puzzle.hint2 });
      }

      if (path === "/api/app/shop/buy" && request.method === "POST") {
        const { itemId } = (await request.json()) as any;
        const item = await core.getShopItemById(db, Number(itemId));
        if (!item) return jsonResp({ error: "جایزه پیدا نشد." }, 404);
        const pendingCost = await core.getPendingCostForStudent(db, uid);
        if (student.score - pendingCost < item.cost) {
          return jsonResp({ error: "امتیاز آزاد کافی برای این جایزه نداری!" }, 400);
        }
        const orderId = await core.createShopOrder(db, uid, student.name, item);
        try {
          const bot = core.createBot(env);
          const kb = new InlineKeyboard()
            .text("✅ تایید و کسر امتیاز", `shop_ok_${orderId}`)
            .text("❌ رد درخواست", `shop_rej_${orderId}`);
          await bot.api.sendMessage(
            core.TEACHER_ID,
            `📱🛒 درخواست جایزه از اپلیکیشن\n👤 دانش‌آموز: ${student.name}\n🎁 جایزه: ${item.title} (${item.cost} امتیاز)`,
            { reply_markup: kb }
          );
        } catch {}
        return jsonResp({ ok: true, orderId });
      }

      if (path === "/api/app/student/history") {
        const hw = await core.getHomework(db, uid);
        const labs = (
          await db.prepare("SELECT * FROM lab_submissions WHERE user_id = ? ORDER BY id DESC LIMIT 15").bind(uid).all<any>()
        ).results;
        const certs = (
          await db.prepare("SELECT * FROM app_certificates WHERE student_id = ? ORDER BY id DESC LIMIT 10").bind(uid).all<AppCertificateRow>()
        ).results;
        return jsonResp({
          homework: hw.slice(0, 15).map((h: any) => ({ ...h, date: core.toJalali(h.date) })),
          labSubmissions: labs.map((l: any) => ({ ...l, date: core.toJalali(l.created_at) })),
          certificates: certs.map((c) => ({ ...c, date: core.toJalali(c.created_at) })),
        });
      }

      if (path === "/api/app/student/pin" && request.method === "POST") {
        const { newPin } = (await request.json()) as any;
        const clean = core.normalizeDigits(String(newPin || "")).trim();
        if (clean.length < 4) return jsonResp({ error: "رمز باید حداقل ۴ کاراکتر باشد." }, 400);
        await ensureStudentAppCredentials(db, uid);
        await db.prepare("UPDATE app_accounts SET student_pin = ? WHERE user_id = ?").bind(clean, uid).run();
        return jsonResp({ ok: true });
      }
    }

    // ====================================================================
    // 👪 مسیرهای پنل اختصاصی اولیا (والدین)
    // ====================================================================
    if (auth.role === "parent") {
      const studentId = Number(auth.studentId);
      const student = await core.getStudent(db, studentId);
      if (!student) return jsonResp({ error: "اطلاعات دانش‌آموز یافت نشد." }, 404);

      if (path === "/api/app/parent/overview") {
        const all = await core.getAllStudents(db);
        const rank = all.findIndex((s) => s.user_id === studentId) + 1;
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const weeklyStudyMin = await core.getStudentWeeklyStudyMinutes(db, studentId);
        const hwAll = await core.getHomework(db, studentId);
        const weeklyHwCount = hwAll.filter((h: any) => h.date >= weekAgo).length;

        const qStats = await db
          .prepare("SELECT COUNT(*) as total, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as ok FROM quiz_answers WHERE user_id = ?")
          .bind(studentId)
          .first<{ total: number; ok: number }>();
        const quizAccuracy =
          qStats && qStats.total > 0 ? `${Math.round(((qStats.ok || 0) / qStats.total) * 100)}%` : "ثبت‌نشده";

        const attRows = (
          await db.prepare("SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC LIMIT 20").bind(studentId).all<any>()
        ).results;
        const attSummary = { present: 0, absent: 0, late: 0 };
        attRows.slice(0, 7).forEach((r: any) => {
          if (r.status === "present") attSummary.present++;
          else if (r.status === "absent") attSummary.absent++;
          else if (r.status === "late") attSummary.late++;
        });

        const badges = await core.getBadges(db, studentId);
        const deadlines = await core.getAllDeadlines(db);
        const certs = (
          await db.prepare("SELECT * FROM app_certificates WHERE student_id = ? ORDER BY id DESC LIMIT 10").bind(studentId).all<AppCertificateRow>()
        ).results;
        const messages = (
          await db.prepare("SELECT * FROM parent_messages WHERE student_id = ? ORDER BY id ASC LIMIT 40").bind(studentId).all<ParentMessageRow>()
        ).results;

        return jsonResp({
          student,
          levelName: core.getLevelInfo(student.level || 1).name,
          rank: rank || all.length,
          totalStudents: all.length,
          quizAccuracy,
          weeklyStudyMin,
          weeklyHwCount,
          attSummary,
          attendanceList: attRows.map((a: any) => ({
            date: a.date,
            jalali: core.toJalali(a.date + "T12:00:00Z"),
            status: a.status,
          })),
          homework: hwAll.slice(0, 15).map((h: any) => ({ ...h, date: core.toJalali(h.date) })),
          badges,
          deadlines,
          certificates: certs.map((c) => ({ ...c, date: core.toJalali(c.created_at) })),
          messages: messages.map((m) => ({ ...m, date: core.toJalali(m.created_at) })),
        });
      }

      if (path === "/api/app/parent/message" && request.method === "POST") {
        const { message } = (await request.json()) as any;
        const txt = String(message || "").trim().slice(0, 1000);
        if (txt.length < 2) return jsonResp({ error: "پیام کوتاه است." }, 400);

        await db
          .prepare("INSERT INTO parent_messages (student_id, student_name, sender_role, message, is_read, created_at) VALUES (?, ?, 'parent', ?, 0, ?)")
          .bind(studentId, student.name, txt, new Date().toISOString())
          .run();

        try {
          const bot = core.createBot(env);
          await bot.api.sendMessage(
            core.TEACHER_ID,
            `📱👪 پیام جدید از طرف ولیِ دانش‌آموز «${student.name}» در اپلیکیشن:\n\n«${txt}»\n\n(از بخش 💬 پیام اولیا در اپلیکیشن می‌توانید پاسخ دهید)`
          );
        } catch {}

        return jsonResp({ ok: true });
      }
    }

    // ====================================================================
    // 👨‍🏫 مسیرهای پنل مدیریت معلم
    // ====================================================================
    if (auth.role === "teacher") {
      if (path === "/api/app/teacher/overview") {
        const rawStudents = await core.getAllStudents(db);
        const students = [];
        for (const s of rawStudents) {
          const cred = await ensureStudentAppCredentials(db, s.user_id);
          students.push({
            ...s,
            student_code: cred.student_code,
            student_pin: cred.student_pin,
            parent_code: cred.parent_code,
          });
        }

        const pendingLab = (
          await db.prepare("SELECT * FROM lab_submissions WHERE status = 'pending' ORDER BY id DESC LIMIT 25").all<any>()
        ).results;
        const pendingShop = await core.getPendingShopOrders(db);
        const recentHw = (
          await db.prepare("SELECT * FROM homework ORDER BY id DESC LIMIT 15").all<any>()
        ).results.map((h: any) => ({ ...h, date: core.toJalali(h.date) }));
        const deadlines = await core.getAllDeadlines(db);
        const muddy = await core.getRecentMuddyFeedback(db);
        const todayStr = new Date().toISOString().split("T")[0];
        const attendanceToday = await core.getAttendanceByDate(db, todayStr);
        const teams = await core.getClassTeams(db);
        const parentMessages = (
          await db.prepare("SELECT * FROM parent_messages ORDER BY id DESC LIMIT 30").all<ParentMessageRow>()
        ).results.map((m) => ({ ...m, date: core.toJalali(m.created_at) }));
        const unreadParentCount = parentMessages.filter((m) => m.sender_role === "parent" && m.is_read === 0).length;

        return jsonResp({
          students,
          pendingLab,
          pendingShop,
          recentHw,
          deadlines,
          muddy,
          attendanceToday,
          todayJalali: core.toJalali(new Date().toISOString()),
          teams,
          parentMessages,
          unreadParentCount,
        });
      }

      if (path === "/api/app/teacher/announce" && request.method === "POST") {
        const { text } = (await request.json()) as any;
        const all = await core.getAllStudents(db);
        const bot = core.createBot(env);
        let sent = 0;
        for (const s of all) {
          if (s.user_id >= 800000000) continue; // کاربران فقط اپ
          try {
            await bot.api.sendMessage(s.user_id, `📢 اعلان مهم کلاس:\n\n${text}`);
            sent++;
          } catch {}
        }
        await core.addLibraryItem(db, "نکات طلایی", `📢 اطلاعیه (${core.toJalali(new Date().toISOString())})`, "text", "", String(text || ""));
        return jsonResp({ ok: true, sent: Math.max(sent, all.length) });
      }

      if (path === "/api/app/teacher/deadline" && request.method === "POST") {
        const { title, dueDate } = (await request.json()) as any;
        await core.addDeadline(db, String(title), String(dueDate));
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/deadline-del" && request.method === "POST") {
        const { id } = (await request.json()) as any;
        await core.deleteDeadline(db, Number(id));
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/muddy-clear" && request.method === "POST") {
        await core.clearMuddyFeedback(db);
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/lab-decide" && request.method === "POST") {
        const { subId, decision, points } = (await request.json()) as any;
        const sub = await core.getLabSubmissionById(db, Number(subId));
        if (!sub || sub.status !== "pending") return jsonResp({ error: "قبلاً بررسی شده است." }, 400);

        if (decision === "approve") {
          const pts = Math.max(1, Number(points) || 5);
          await core.updateLabSubmissionDecision(db, sub.id, "approved", pts);
          const up = await core.updateScore(db, sub.user_id, pts);
          if (sub.category === "study" && sub.minutes > 0) {
            await core.recordStudySession(db, sub.user_id, sub.student_name, sub.title, sub.minutes);
          }
          try {
            const bot = core.createBot(env);
            await bot.api.sendMessage(sub.user_id, `🎉 مستندات «${sub.title}» توسط معلم تایید شد و +${pts} امتیاز گرفتی! (مجموع: ${up?.score})`);
          } catch {}
        } else {
          await core.updateLabSubmissionDecision(db, sub.id, "rejected", 0);
          try {
            const bot = core.createBot(env);
            await bot.api.sendMessage(sub.user_id, `⚠️ مستندات «${sub.title}» تایید نشد؛ لطفاً خلاصه کامل‌تری بفرست.`);
          } catch {}
        }
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/shop-decide" && request.method === "POST") {
        const { orderId, approve } = (await request.json()) as any;
        const order = await core.getShopOrderById(db, Number(orderId));
        if (!order || order.status !== "pending") return jsonResp({ error: "سفارش معتبر نیست." }, 400);
        if (approve) {
          const st = await core.getStudent(db, order.user_id);
          if (!st || st.score < order.cost) return jsonResp({ error: "امتیاز دانش‌آموز کافی نیست." }, 400);
          await core.setShopOrderStatus(db, order.id, "approved");
          await core.updateScore(db, order.user_id, -order.cost);
        } else {
          await core.setShopOrderStatus(db, order.id, "rejected");
        }
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/grade-hw" && request.method === "POST") {
        const { hwId, score, feedback } = (await request.json()) as any;
        const hw = await core.getHomeworkById(db, Number(hwId));
        if (!hw) return jsonResp({ error: "تکلیف پیدا نشد." }, 404);
        await core.setHomeworkFeedback(db, hw.id, Number(score) || 0, String(feedback || ""));
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/attendance" && request.method === "POST") {
        const { userId, status } = (await request.json()) as any;
        const st = await core.getStudent(db, Number(userId));
        if (!st) return jsonResp({ error: "پیدا نشد." }, 404);
        const todayStr = new Date().toISOString().split("T")[0];
        await core.setAttendanceStatus(db, st.user_id, st.name, todayStr, status);
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/attendance-notify" && request.method === "POST") {
        const todayStr = new Date().toISOString().split("T")[0];
        const attMap = await core.getAttendanceByDate(db, todayStr);
        const all = await core.getAllStudents(db);
        const bot = core.createBot(env);
        let notified = 0;
        for (const s of all) {
          const st = attMap[s.user_id] || "present";
          if ((st === "absent" || st === "late") && s.parent_chat_id) {
            try {
              await bot.api.sendMessage(
                s.parent_chat_id,
                `📢 اطلاعیه حضوروغیاب (${core.toJalali(new Date().toISOString())}):\nوضعیت امروز فرزندتان «${s.name}»: ${st === "absent" ? "غیبت" : "تاخیر"}`
              );
              notified++;
            } catch {}
          }
        }
        return jsonResp({ ok: true, notified });
      }

      if (path === "/api/app/teacher/quiz-ai" && request.method === "POST") {
        const { topic, points } = (await request.json()) as any;
        const rawQ = await core.generateQuizWithAI(env, String(topic || ""));
        if (typeof rawQ === "string") return jsonResp({ error: rawQ }, 400);
        const q = core.shuffleQuizOptions(rawQ);
        const pts = Math.max(1, Number(points) || 5);
        const qid = await core.addQuiz(db, q.question, q.options, q.correct, pts);

        try {
          const all = await core.getAllStudents(db);
          const bot = core.createBot(env);
          for (const s of all) {
            if (s.user_id >= 800000000) continue;
            const kb = new InlineKeyboard();
            q.options.forEach((opt: string, i: number) => kb.text(`${i + 1}. ${opt}`, `quiz_${qid}_${i + 1}`).row());
            try {
              await bot.api.sendMessage(s.user_id, `🎲 کوییز جدید کلاس!\n\n❓ ${q.question}\n⏱ امتیاز: +${pts}`, { reply_markup: kb });
            } catch {}
          }
        } catch {}
        return jsonResp({ ok: true, quizId: qid });
      }

      if (path === "/api/app/teacher/doc-ai" && request.method === "POST") {
        const { kind, text } = (await request.json()) as any;
        if (kind === "summary") {
          const sum = await core.generateLessonSummaryWithAI(env, String(text), "اپلیکیشن معلم");
          await core.addLibraryItem(db, "جزوه و درسنامه", `جزوه ${String(text).slice(0, 35)}`, "text", "", sum);
          return jsonResp({ output: sum });
        } else {
          const ex = await core.generateDescriptiveExamWithAI(env, String(text), "اپلیکیشن معلم");
          await core.addLibraryItem(db, "نمونه سوال امتحانی", `آزمون ${String(text).slice(0, 35)}`, "text", "", ex.examSheet);
          return jsonResp({ output: `${ex.examSheet}\n\n🔑 پاسخنامه معلم:\n${ex.answerKey}` });
        }
      }

      if (path === "/api/app/teacher/library-add" && request.method === "POST") {
        const { title, category, body } = (await request.json()) as any;
        await core.addLibraryItem(db, String(category || "جزوه و درسنامه"), String(title), "text", "", String(body));
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/score" && request.method === "POST") {
        const { userId, delta } = (await request.json()) as any;
        await core.updateScore(db, Number(userId), Number(delta));
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/certificate" && request.method === "POST") {
        const { userId, awardTitle } = (await request.json()) as any;
        const st = await core.getStudent(db, Number(userId));
        if (!st) return jsonResp({ error: "دانش‌آموز پیدا نشد." }, 404);
        const png = await core.generateCertificatePng(st.name, st.grade || "", st.score, String(awardTitle));
        if (!png) return jsonResp({ error: "خطا در رندر تصویر لوح تقدیر." }, 500);

        await saveCertificateInAppDb(db, st.user_id, st.name, String(awardTitle), png, core.uint8ToBase64);
        try {
          const bot = core.createBot(env);
          if (st.user_id < 800000000) {
            await bot.api.sendPhoto(st.user_id, new InputFile(png, "certificate.png"), {
              caption: `🎉🏅 لوح تقدیر «${awardTitle}» از طرف ${core.TEACHER_NAME} به تو اهدا شد!`,
            });
          }
          if (st.parent_chat_id) {
            await bot.api.sendPhoto(st.parent_chat_id, new InputFile(png, "certificate.png"), {
              caption: `🌺 اولیای گرامی «${st.name}»، لوح تقدیر فرزند عزیزتان تقدیم می‌گردد.`,
            });
          }
        } catch {}
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/teams" && request.method === "POST") {
        const { size, mode } = (await request.json()) as any;
        const all = await core.getAllStudents(db);
        const built = core.generateSmartClassTeams(all, Number(size) || 3, mode === "random" ? "random" : "balanced");
        await core.saveClassTeams(db, built);
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/team-points" && request.method === "POST") {
        const { teamId, pts } = (await request.json()) as any;
        const teams = await core.getClassTeams(db);
        const t = teams.find((x: any) => x.id === Number(teamId));
        if (!t) return jsonResp({ error: "گروه پیدا نشد." }, 404);
        for (const m of t.members) {
          await core.updateScore(db, m.user_id, Number(pts) || 5);
        }
        return jsonResp({ ok: true });
      }

      if (path === "/api/app/teacher/parent-reply" && request.method === "POST") {
        const { studentId, studentName, message } = (await request.json()) as any;
        await db
          .prepare("INSERT INTO parent_messages (student_id, student_name, sender_role, message, is_read, created_at) VALUES (?, ?, 'teacher', ?, 1, ?)")
          .bind(Number(studentId), String(studentName), String(message), new Date().toISOString())
          .run();
        await db.prepare("UPDATE parent_messages SET is_read = 1 WHERE student_id = ? AND sender_role = 'parent'").bind(Number(studentId)).run();
        return jsonResp({ ok: true });
      }
    }

    return jsonResp({ error: "مسیر یافت نشد." }, 404);
  } catch (e: any) {
    console.error("App API Error:", e);
    return jsonResp({ error: e.message || "خطای داخلی سرور" }, 500);
  }
}

// ==================== Webhook + Cron + API ====================
const APP_CORE_DEPS: AppCoreDeps = {
  TEACHER_ID,
  TEACHER_NAME,
  PANEL_PASSWORD,
  DAILY_MISSIONS,
  DEFAULT_DICTATION_TEXTS,
  normalizeDigits,
  uint8ToBase64,
  toJalali,
  formatDateTime,
  getLevelInfo,
  getNextLevelInfo,
  ensureExtraTables,
  getBotState,
  setBotState,
  getStudent,
  getAllStudents,
  saveStudent,
  updateScore,
  updateStreak,
  checkAndAwardBadges,
  getBadges,
  addHomework,
  getHomework,
  getHomeworkById,
  setHomeworkFeedback,
  getAllDeadlines,
  addDeadline,
  deleteDeadline,
  getTodayMission,
  createMission,
  setMissionStatus,
  getLatestQuiz,
  getQuizById,
  hasAnsweredQuiz,
  answerQuiz,
  addQuiz,
  generateQuizWithAI,
  shuffleQuizOptions,
  getActiveShopItems,
  getShopItemById,
  getPendingCostForStudent,
  createShopOrder,
  getPendingShopOrders,
  getShopOrderById,
  setShopOrderStatus,
  getStudentWeeklyStudyMinutes,
  recordStudySession,
  createLabSubmission,
  getLabSubmissionById,
  updateLabSubmissionDecision,
  getFlashcardStats,
  addFlashcard,
  updateFlashcardReview,
  generateFlashcardsWithAI,
  getLibraryItems,
  addLibraryItem,
  getAttendanceByDate,
  setAttendanceStatus,
  getClassTeams,
  saveClassTeams,
  generateSmartClassTeams,
  addMuddyFeedback,
  getRecentMuddyFeedback,
  clearMuddyFeedback,
  askAI,
  extractTextFromImagesWithVision,
  generateMindMapPngWithAI,
  generateCertificatePng,
  runEnglishConversationTurn,
  evaluatePersianEssayWithAI,
  evaluateDictationWithAI,
  runScienceLabStepWithAI,
  runScientistChatTurn,
  generateWeeklyStudyPlanWithAI,
  generateLessonSummaryWithAI,
  generateDescriptiveExamWithAI,
  getTodayWordPuzzle,
  createBot,
};

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const appResp = await handleAppRequest(request, env, APP_CORE_DEPS);
    if (appResp) return appResp;

    const url = new URL(request.url);
    const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (url.pathname === "/api/auth" && request.method === "POST") {
      try { const body = await request.json() as { password: string };
        if (body.password === PANEL_PASSWORD) return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        return new Response(JSON.stringify({ ok: false, error: "رمز اشتباه" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) { return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
    }

    if (url.pathname === "/api/dashboard") {
      try {
        const students = await getAllStudents(env.telegram_bot_db);
        const totalHw = await env.telegram_bot_db.prepare("SELECT COUNT(*) as c FROM homework").first<{ c: number }>();
        const allDeadlines = await getAllDeadlines(env.telegram_bot_db);
        const activity = await env.telegram_bot_db.prepare("SELECT date(date) as day, COUNT(*) as c FROM homework WHERE date > ? GROUP BY date(date) ORDER BY day ASC").bind(new Date(Date.now() - 14 * 86400000).toISOString()).all<{ day: string; c: number }>();
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const hwWeek = await env.telegram_bot_db.prepare("SELECT DISTINCT user_id FROM homework WHERE date > ?").bind(weekAgo).all<{ user_id: number }>();
        const data = {
          students: students.map((s) => ({ user_id: s.user_id, name: s.name, score: s.score, level: getLevelInfo(s.level || 1).name, levelNum: s.level || 1, streak: s.streak || 0, maxStreak: s.max_streak || 0, birthday: s.birthday ? formatJalaliBirthday(s.birthday) : null, joined: toJalali(s.joined) })),
          totalStudents: students.length, totalHomework: totalHw?.c || 0, topScore: students[0]?.score || 0, avgScore: Math.round(students.reduce((sum, s) => sum + s.score, 0) / (students.length || 1)),
          activeThisWeek: hwWeek.results.length, activity: activity.results.map((a) => ({ day: a.day, count: a.c })), deadlines: allDeadlines.map((d) => ({ id: d.id, title: d.title, dueDate: d.due_date })), updatedAt: new Date().toLocaleString("fa-IR"),
        };
        return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders } });
      } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders } }); }
    }

    if (url.pathname.startsWith("/api/student/")) {
      try {
        const userId = parseInt(url.pathname.split("/").pop() || "");
        if (isNaN(userId)) return new Response(JSON.stringify({ error: "ID" }), { status: 400, headers: corsHeaders });
        const student = await getStudent(env.telegram_bot_db, userId);
        if (!student) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
        const allStudents = await getAllStudents(env.telegram_bot_db);
        const rank = allStudents.findIndex((s) => s.user_id === userId) + 1;
        const hw = await getHomework(env.telegram_bot_db, userId);
        const badges = await getBadges(env.telegram_bot_db, userId);
        const myData = {
          name: student.name, score: student.score, rank, totalStudents: allStudents.length, level: getLevelInfo(student.level || 1).name, streak: student.streak || 0, maxStreak: student.max_streak || 0, birthday: student.birthday ? formatJalaliBirthday(student.birthday) : null,
          homework: hw.slice(0, 20).map((h) => ({ date: toJalali(h.date), type: h.type, score: h.score, feedback: h.feedback })),
          badges: badges.map((b) => ({ name: b.badge, date: toJalali(b.date) })), grade: student.grade || "",
        };
        const leaderboard = allStudents.map((s) => ({ name: s.name, score: s.score, level: getLevelInfo(s.level || 1).name, isMe: s.user_id === userId }));
        return new Response(JSON.stringify({ my: myData, leaderboard }), { headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders } });
      } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders }); }
    }

    if (url.pathname === "/api/score" && request.method === "POST") {
      try { const body = await request.json() as { user_id: number; amount: number }; const updated = await updateScore(env.telegram_bot_db, body.user_id, body.amount); return new Response(JSON.stringify({ ok: true, newScore: updated?.score }), { headers: { "Content-Type": "application/json", ...corsHeaders } }); } catch (e) { return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
    }

    if (url.pathname === "/api/student" && request.method === "DELETE") {
      try { const body = await request.json() as { user_id: number }; await env.telegram_bot_db.prepare("DELETE FROM students WHERE user_id = ?").bind(body.user_id).run(); return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } }); } catch (e) { return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
    }

    if (url.pathname === "/api/reset" && request.method === "POST") {
      try { await resetScores(env.telegram_bot_db); return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } }); } catch (e) { return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
    }

    if (url.pathname === "/webhook") { const bot = createBot(env); return webhookCallback(bot, "std/http")(request); }
    if (url.pathname === "/") return new Response(buildAppHtml(""), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event: any, env: Env, ctx?: any) {
    const bot = createBot(env);
    const all = await getAllStudents(env.telegram_bot_db);
    const birthdayPeople = all.filter((s) => isBirthdayToday(s.birthday));
    for (const s of birthdayPeople) {
      try { await bot.api.sendMessage(s.user_id, `🎂🎉✨ *تولدت مبارک ${s.name}!* ✨🎉🎂\n\n${getRandomBirthdayMessage()}\n\n💐 از طرف معلمت و دوست دارت\n💙 *${TEACHER_NAME}*`, { parse_mode: "Markdown" }); } catch (e) {}
      try { await bot.api.sendMessage(TEACHER_ID, `🎂 *امروز تولد ${s.name} هست!*`, { parse_mode: "Markdown" }); } catch (e) {}
      for (const other of all) { if (other.user_id === s.user_id) continue; try { await bot.api.sendMessage(other.user_id, `🎂🎉 *امروز تولد ${s.name} هست!* 🎉🎂\n\n👏 بیایید بهش تبریک بگیم! 🥳\n\n💐 *${TEACHER_NAME}*`, { parse_mode: "Markdown" }); } catch {} }
    }
    const deadlines = await getActiveDeadlines(env.telegram_bot_db);
    for (const d of deadlines) { for (const s of all) { try { await bot.api.sendMessage(s.user_id, `⏰ یادآور ددلاین!\n\n📝 ${d.title}\n📅 ${d.due_date}\n\n💡 اگه هنوز نفرستادی، الان وقتشه!`); } catch {} } }
  },
};