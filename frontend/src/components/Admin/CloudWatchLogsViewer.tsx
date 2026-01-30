import { useState, useEffect } from "react";
import { RefreshCw, Terminal, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthService } from "@/functions/authService";

type LogEvent = {
  timestamp: number;
  message: string;
};

type CloudWatchLogsResponse = {
  job_id: string;
  glue_job_run_id: string;
  log_group: string;
  log_stream: string;
  events: LogEvent[];
  nextForwardToken?: string;
  nextBackwardToken?: string;
};

interface CloudWatchLogsViewerProps {
  textbookId: string;
}

export default function CloudWatchLogsViewer({
  textbookId,
}: CloudWatchLogsViewerProps) {
  const [logs, setLogs] = useState<CloudWatchLogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await AuthService.getAuthSession(true);
      const token = session.tokens.idToken;

      const response = await fetch(
        `${
          import.meta.env.VITE_API_ENDPOINT
        }/admin/textbooks/${textbookId}/logs`,
        {
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch logs");
      }

      const data = await response.json();
      setLogs(data);
    } catch (err: any) {
      console.error("Error fetching logs:", err);
      setError(err.message || "Failed to load CloudWatch logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [textbookId]);

  // Auto-refresh every 10 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
    }, 10000);

    return () => clearInterval(interval);
  }, [autoRefresh, textbookId]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatLogMessage = (message: string) => {
    // Remove ANSI color codes and clean up the message
    return message.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
  };

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Terminal className="h-5 w-5 text-gray-600" />
              CloudWatch Logs
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Real-time logs from Glue job execution
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs ${
                autoRefresh ? "bg-green-50 border-green-200 text-green-700" : ""
              }`}
            >
              {autoRefresh ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Auto-refresh ON
                </>
              ) : (
                "Enable Auto-refresh"
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
              className="text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <div className="p-6 flex items-start gap-3 bg-red-50 border-b border-red-100">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Error Loading Logs</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        ) : loading && !logs ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : logs && logs.events.length > 0 ? (
          <>
            <div className="p-3 bg-gray-50 border-b text-xs text-gray-600 font-mono">
              <span className="font-semibold">Log Stream:</span>{" "}
              {logs.glue_job_run_id}
            </div>
            <div className="max-h-[500px] overflow-y-auto bg-gray-900 text-gray-100 font-mono text-xs">
              {logs.events.map((event, index) => (
                <div
                  key={index}
                  className="py-2 px-4 border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex gap-3">
                    <span className="text-gray-500 shrink-0">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span className="text-gray-100 break-all whitespace-pre-wrap">
                      {formatLogMessage(event.message)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-gray-50 border-t text-xs text-gray-600">
              Showing {logs.events.length} log events
            </div>
          </>
        ) : logs ? (
          <div className="p-12 text-center text-gray-500">
            <Terminal className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="font-medium">No logs available yet</p>
            <p className="text-sm mt-1">
              Logs will appear here once the job starts processing
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
