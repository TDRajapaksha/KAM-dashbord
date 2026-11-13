"use client";

import { useEffect, useState } from "react";

type SyncStatus = {
  connected: boolean;
  spreadsheetUrl: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

export default function GoogleSheetsSync({
  projectId,
}: {
  projectId: string;
}) {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/google-sheets/connect?projectId=${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load sync status.");
        if (active) {
          setStatus(result);
          setSpreadsheetUrl(result.spreadsheetUrl ?? "");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load sync status.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/google-sheets/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, spreadsheetUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not connect Google Sheets.");
      window.location.assign(result.authorizationUrl);
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Could not connect Google Sheets."
      );
      setConnecting(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold">Google Sheets live sync</h3>
      <p className="mt-1 text-xs text-gray-500">
        Connect your Google account to copy existing responses and add new
        submissions to this spreadsheet.
      </p>

      {status?.connected && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Connected.{" "}
          {status.lastSyncedAt
            ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}.`
            : "Waiting for the first sync."}
          <a
            href={status.spreadsheetUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 font-medium underline"
          >
            Open sheet
          </a>
        </div>
      )}
      {status?.lastSyncError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Last sync error: {status.lastSyncError}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="mb-1 mt-4 block text-xs font-medium text-gray-700">
        Google Sheets URL
      </label>
      <input
        type="url"
        value={spreadsheetUrl}
        onChange={(event) => setSpreadsheetUrl(event.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004C99] focus:outline-none"
      />
      <p className="mt-1 text-xs text-gray-500">
        The sheet needs an empty tab named Responses. Connecting copies all
        existing responses; later submissions sync automatically.
      </p>
      <button
        type="button"
        onClick={connect}
        disabled={loading || connecting || !spreadsheetUrl.trim()}
        className="mt-3 rounded-lg bg-[#004C99] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003d7a] disabled:opacity-50"
      >
        {loading
          ? "Loading…"
          : connecting
            ? "Connecting…"
            : status?.connected
              ? "Reconnect Google Sheets"
              : "Connect Google Sheets"}
      </button>
    </div>
  );
}
