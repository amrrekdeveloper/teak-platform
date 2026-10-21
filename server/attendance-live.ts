import type { Express, Request, RequestHandler, Response } from "express";
import type { PoolClient } from "pg";
import { pool } from "./db";

const CHANNEL = "teak_attendance_changed";
const clients = new Map<Response, number>();
let listener: PoolClient | undefined;
let disconnectListener: (() => void) | undefined;
let listenerEpoch = 0;
let connecting: Promise<void> | undefined;
let notifyTimer: ReturnType<typeof setTimeout> | undefined;

export function affectsAttendance(method: string, path: string) {
  return /^(POST|PUT|PATCH|DELETE)$/i.test(method) &&
    /^\/api\/(?:attendance|employees|leaves|hr-actions|hr-permissions|employee-portal\/(?:attendance|corrections|leaves|permissions|actions))(?:\/|$)/i.test(path.split("?")[0]);
}

// Observe only successful operations, including the separately mounted employee
// router. Never inspect or transmit request/response bodies or employee IDs.
export const notifyAttendanceChanges: RequestHandler = (req, res, next) => {
  if (affectsAttendance(req.method, req.originalUrl)) {
    res.once("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300 || notifyTimer) return;
      notifyTimer = setTimeout(() => {
        notifyTimer = undefined;
        // PostgreSQL notification reaches other workers/instances too.
        void pool.query("SELECT pg_notify($1, 'refresh')", [CHANNEL]).catch(() => {
          // A successful business write must not fail because transport is down.
          // Visible monitoring also retains its periodic reconciliation query.
          broadcast();
        });
      }, 80);
      notifyTimer.unref();
    });
  }
  next();
};

function send(res: Response, event: string) {
  if (!res.writableEnded && !res.destroyed)
    res.write(`event: ${event}\ndata: {"at":${Date.now()}}\n\n`);
}
function broadcast() {
  for (const res of clients.keys()) send(res, "attendance");
}

async function ensureListener() {
  if (listener) return;
  if (connecting) return connecting;
  const epoch = listenerEpoch;
  connecting = (async () => {
    const client = await pool.connect();
    let released = false;
    const fail = () => {
      if (listener === client) {
        listener = undefined;
        disconnectListener = undefined;
        for (const res of clients.keys()) res.end();
      }
      if (!released) { released = true; client.release(true); }
    };
    client.on("error", fail);
    client.on("end", fail);
    client.on("notification", notification => {
      if (notification.channel === CHANNEL) broadcast();
    });
    try {
      await client.query(`LISTEN ${CHANNEL}`);
      if (released || epoch !== listenerEpoch) throw new Error("Listener closed");
      listener = client;
      disconnectListener = fail;
    } catch {
      fail();
      throw new Error("Attendance stream unavailable");
    }
  })().finally(() => { connecting = undefined; });
  return connecting;
}

type LiveSession = {
  userId?: number; adminAuthenticated?: boolean; hrWorkspace?: boolean;
  managerWorkspace?: boolean; systemAdminWorkspace?: boolean;
};
export function canReceiveAttendanceEvents(
  session: LiveSession | null | undefined,
  user: { role: string; active: boolean; archived?: boolean } | undefined,
) {
  return !!session?.userId && session.adminAuthenticated === true &&
    !session.systemAdminWorkspace && !session.managerWorkspace &&
    !!user && user.active && !user.archived && ["hr", "owner", "it"].includes(user.role);
}
async function stillAuthorized(req: Request, actorId: number) {
  const session = await new Promise<LiveSession | null>((resolve, reject) => {
    req.sessionStore.get(req.sessionID, (error, data) => error ? reject(error) : resolve(data ?? null));
  });
  if (session?.userId !== actorId) return false;
  const { rows: [user] } = await pool.query("SELECT role,active,archived FROM users WHERE id=$1", [actorId]);
  return canReceiveAttendanceEvents(session, user);
}

export function registerAttendanceEvents(app: Express, authorize: RequestHandler, heartbeatMs = 15000) {
  app.get("/api/attendance/events", authorize, async (req, res) => {
    const actorId = req.session.userId;
    try {
      if (!actorId || !await stillAuthorized(req, actorId))
        return res.status(401).json({ message: "سجّل الدخول إلى الموارد البشرية." });
      if ([...clients.values()].filter(id => id === actorId).length >= 5)
        return res.status(429).json({ message: "أغلق نوافذ المراقبة الزائدة." });
      res.set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      res.write("retry: 2000\n\n");
      clients.set(res, actorId);
      let checking = false;
      const heartbeat = setInterval(async () => {
        if (checking) return;
        checking = true;
        try {
          if (!await stillAuthorized(req, actorId)) { res.end(); return; }
          send(res, "heartbeat");
        } catch { res.end(); }
        finally { checking = false; }
      }, heartbeatMs);
      heartbeat.unref();
      res.once("close", () => { clearInterval(heartbeat); clients.delete(res); });
      await ensureListener();
      send(res, "ready"); // Refresh after LISTEN, including after reconnection.
    } catch {
      if (res.headersSent) res.end();
      else res.status(503).json({ message: "التحديث المباشر غير متاح مؤقتًا." });
    }
  });
}

export function closeAttendanceEvents() {
  for (const res of clients.keys()) res.end();
  clients.clear();
  if (notifyTimer) { clearTimeout(notifyTimer); notifyTimer = undefined; }
  listenerEpoch++;
  disconnectListener?.();
}
