import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const attendanceKeys = new Set([
  "/api/leaves", "/api/pending-requests", "/api/leaves/balance",
  "/api/attendance/permissions", "/api/hr/reports", "/api/hr/requests",
  "/api/employees", "/api/attendance/zones", "/api/attendance/work-settings",
  "/api/attendance/monitor", "/api/attendance/corrections", "/api/attendance/violations",
  "/api/attendance/risk-scores", "/api/attendance/device-report", "/api/attendance/audit-log",
  "/api/attendance/workweek/settings",
  "attendance-shift-monitor", "attendance-shift-monitor-today", "attendance-individual-report",
]);

export function useAttendanceLive() {
  const queryClient = useQueryClient();
  const [state, setState] = useState({ connected: false, lastUpdated: 0 });
  useEffect(() => {
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries({
          predicate: query => attendanceKeys.has(String(query.queryKey[0])),
        });
      }, 120);
    };
    const connect = () => {
      source?.close();
      source = undefined;
      setState(previous => ({ ...previous, connected: false }));
      if (document.hidden || typeof EventSource === "undefined") return;
      const stream = new EventSource("/api/attendance/events");
      source = stream;
      stream.addEventListener("ready", () => {
        setState({ connected: true, lastUpdated: Date.now() });
        refresh();
      });
      stream.addEventListener("attendance", () => {
        setState({ connected: true, lastUpdated: Date.now() });
        refresh();
      });
      stream.onerror = () => setState(previous => ({ ...previous, connected: false }));
    };
    connect();
    document.addEventListener("visibilitychange", connect);
    return () => {
      source?.close();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", connect);
    };
  }, [queryClient]);
  return state;
}
