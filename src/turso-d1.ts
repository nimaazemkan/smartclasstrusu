import { createClient, Client, InValue } from "@libsql/client/web";

export interface D1Meta {
  last_row_id: number;
  changes: number;
}

export interface D1Result<T = any> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

export interface D1PreparedStatement {
  sql: string;
  args: InValue[];
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(colName?: string): Promise<T | null>;
  all<T = any>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<any>>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

function normalizeVal(v: any): any {
  if (typeof v === "bigint") return Number(v);
  return v;
}

function rowToObject(columns: string[], row: any): any {
  const out: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const val = row[col] !== undefined ? row[col] : row[i];
    out[col] = normalizeVal(val);
  }
  return out;
}

export function resolveTursoConfig(envObj: Record<string, string | undefined> = process.env): {
  url: string;
  authToken: string;
} | null {
  // ۱. متغیرهای مستقیم استاندارد
  const directPairs: [string, string][] = [
    ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"],
    ["TURSO_URL", "TURSO_TOKEN"],
    ["DATABASE_URL", "DATABASE_AUTH_TOKEN"],
    ["STORAGE_URL", "STORAGE_AUTH_TOKEN"],
    ["LIBSQL_DB_URL", "LIBSQL_DB_AUTH_TOKEN"],
  ];
  for (const [uKey, tKey] of directPairs) {
    const u = envObj[uKey]?.trim();
    if (u && (u.startsWith("libsql://") || u.startsWith("https://") || u.startsWith("http://"))) {
      return {
        url: u.replace(/^libsql:\/\//i, "https://"),
        authToken: (envObj[tKey] || "").trim(),
      };
    }
  }

  // ۲. پیشوندهای خودکار Vercel Marketplace (مثل STORAGE_TURSO_DATABASE_URL)
  for (const [k, v] of Object.entries(envObj)) {
    if (!v) continue;
    if (k.endsWith("_TURSO_DATABASE_URL") || k.endsWith("_DATABASE_URL")) {
      const prefix = k.replace(/_(TURSO_)?DATABASE_URL$/, "");
      const token =
        envObj[`${prefix}_TURSO_AUTH_TOKEN`] ||
        envObj[`${prefix}_DATABASE_AUTH_TOKEN`] ||
        envObj["TURSO_AUTH_TOKEN"] ||
        "";
      const cleanU = v.trim();
      if (cleanU.startsWith("libsql://") || cleanU.startsWith("https://") || cleanU.startsWith("http://")) {
        return {
          url: cleanU.replace(/^libsql:\/\//i, "https://"),
          authToken: token.trim(),
        };
      }
    }
  }
  return null;
}

let cachedClient: Client | null = null;
let cachedUrl = "";
let coreTablesBootstrapped = false;

const CORE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS students (
    user_id INTEGER PRIMARY KEY,
    name TEXT DEFAULT '',
    score INTEGER DEFAULT 0,
    joined TEXT DEFAULT '',
    streak INTEGER DEFAULT 0,
    last_hw_date TEXT DEFAULT '',
    birthday TEXT DEFAULT '',
    max_streak INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    parent_chat_id INTEGER DEFAULT 0,
    parent_name TEXT DEFAULT '',
    grade TEXT DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    date TEXT,
    type TEXT,
    score INTEGER DEFAULT 0,
    feedback TEXT DEFAULT '',
    teacher_msg_id INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS deadlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    due_date TEXT,
    created TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    badge TEXT,
    date TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT,
    options TEXT,
    correct INTEGER,
    points INTEGER DEFAULT 5,
    created TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS quiz_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER,
    user_id INTEGER,
    name TEXT,
    answer INTEGER,
    is_correct INTEGER,
    date TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    mission TEXT,
    date TEXT,
    done INTEGER DEFAULT 0
  )`,
];

async function ensureCoreTables(client: Client) {
  if (coreTablesBootstrapped) return;
  await client.batch(
    CORE_TABLES_SQL.map((sql) => ({ sql, args: [] })),
    "write"
  );
  coreTablesBootstrapped = true;
}

export function createTursoD1Adapter(client: Client): D1Database {
  function makeStmt(sql: string, args: InValue[] = []): D1PreparedStatement {
    return {
      sql,
      args,
      bind(...values: any[]) {
        const cleanArgs: InValue[] = values.map((v) =>
          v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v
        );
        return makeStmt(sql, cleanArgs);
      },
      async first<T = any>(colName?: string): Promise<T | null> {
        await ensureCoreTables(client);
        const rs = await client.execute({ sql, args });
        if (!rs.rows || rs.rows.length === 0) return null;
        const obj = rowToObject(rs.columns, rs.rows[0]);
        if (colName) return (obj[colName] ?? null) as T | null;
        return obj as T;
      },
      async all<T = any>(): Promise<D1Result<T>> {
        await ensureCoreTables(client);
        const rs = await client.execute({ sql, args });
        const results = (rs.rows || []).map((r) => rowToObject(rs.columns, r) as T);
        return {
          results,
          success: true,
          meta: {
            last_row_id: Number(rs.lastInsertRowid || 0),
            changes: Number(rs.rowsAffected || 0),
          },
        };
      },
      async run(): Promise<D1Result<any>> {
        await ensureCoreTables(client);
        const rs = await client.execute({ sql, args });
        return {
          results: [],
          success: true,
          meta: {
            last_row_id: Number(rs.lastInsertRowid || 0),
            changes: Number(rs.rowsAffected || 0),
          },
        };
      },
    };
  }

  return {
    prepare(sql: string) {
      return makeStmt(sql, []);
    },
    async batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      await ensureCoreTables(client);
      const rsList = await client.batch(
        statements.map((s) => ({ sql: s.sql, args: s.args })),
        "write"
      );
      return rsList.map((rs) => ({
        results: (rs.rows || []).map((r) => rowToObject(rs.columns, r) as T),
        success: true,
        meta: {
          last_row_id: Number(rs.lastInsertRowid || 0),
          changes: Number(rs.rowsAffected || 0),
        },
      }));
    },
  };
}

export function getTursoD1FromEnv(envObj: Record<string, string | undefined> = process.env): D1Database | null {
  const cfg = resolveTursoConfig(envObj);
  if (!cfg) return null;
  if (!cachedClient || cachedUrl !== cfg.url) {
    cachedClient = createClient({
      url: cfg.url,
      authToken: cfg.authToken || undefined,
    });
    cachedUrl = cfg.url;
    coreTablesBootstrapped = false;
  }
  return createTursoD1Adapter(cachedClient);
}
