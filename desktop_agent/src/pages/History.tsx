import { useEffect, useState } from "react";
import type { ActivityLog } from "../lib/types";
import { CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";

export function History() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      const { default: Database } = await import("@tauri-apps/plugin-sql");
      const db = await Database.load("sqlite:nova.db");
      const result = await db.select<ActivityLog[]>(
        "SELECT * FROM activity_log ORDER BY created_at DESC"
      );
      setLogs(result);
    } catch {
      // DB might not exist yet
    } finally {
      setLoading(false);
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-400" />;
      case "partial":
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[hsl(var(--muted-foreground))]">
        <Clock className="w-12 h-12 opacity-30" />
        <p className="text-sm">No activity yet. Run your first command!</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-xl font-semibold mb-4">Activity History</h2>
      <div className="flex flex-col gap-3">
        {logs.map((log) => (
          <div
            key={log.id}
            className="bg-[hsl(var(--card))] rounded-lg p-4 border border-[hsl(var(--border))]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {statusIcon(log.status)}
                <span className="text-sm font-medium truncate">
                  {log.command}
                </span>
              </div>
              <span className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                {new Date(log.created_at + "Z").toLocaleString()}
              </span>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-[hsl(var(--muted-foreground))]">
              <span>
                {log.steps_succeeded}/{log.steps_total} steps succeeded
              </span>
              {log.steps_failed > 0 && (
                <span className="text-red-400">
                  {log.steps_failed} failed
                </span>
              )}
              <span>{log.duration_ms}ms</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
