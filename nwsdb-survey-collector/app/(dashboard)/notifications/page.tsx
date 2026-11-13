"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityNotification, getMyNotifications } from "@/lib/api";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyNotifications()
      .then(setNotifications)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load notifications.")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">
          Recent responses to your projects and projects shared with you.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Loading notifications…
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-800">You’re all caught up</p>
            <p className="mt-1 text-sm text-gray-500">
              New project activity will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <Link
                  href={`/projects/${notification.project_id}`}
                  className="flex items-start gap-3 px-5 py-4 transition hover:bg-gray-50"
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      notification.type === "response"
                        ? "bg-green-50 text-green-700"
                        : "bg-blue-50 text-[#004C99]"
                    }`}
                  >
                    {notification.type === "response" ? (
                      <NotificationIcon name="response" />
                    ) : (
                      <NotificationIcon name="share" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">
                      {notification.message}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-gray-600">
                      {notification.project_name}
                    </span>
                    {notification.created_at && (
                      <span className="mt-1 block text-xs text-gray-500">
                        {new Date(notification.created_at).toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span className="mt-2 text-xs text-[#004C99]">View</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NotificationIcon({ name }: { name: "response" | "share" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "response") {
    return (
      <svg {...common}>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 3.9M15.4 6.5 8.6 10.4" />
    </svg>
  );
}
