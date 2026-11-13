"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthUser, logout } from "@/lib/auth";
import SettingsDialog from "@/components/SettingsDialog";

export default function Sidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const items = [
    { href: "/projects", label: "Projects", icon: "folder", adminOnly: false },
    {
      href: "/my-responses",
      label: "My Responses",
      icon: "responses",
      adminOnly: false,
    },
    {
      href: "/notifications",
      label: "Notifications",
      icon: "notifications",
      adminOnly: false,
    },
    { href: "/users", label: "Users", icon: "users", adminOnly: true },
    { href: "/stats", label: "Statistics", icon: "chart", adminOnly: false },
  ].filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <>
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        <nav className="flex-1 p-3">
          <ul className="space-y-1">
            {items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                      active
                        ? "bg-blue-50 font-medium text-[#004C99]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <SidebarIcon name={item.icon} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-gray-200 p-3">
          <div className="space-y-1">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
            >
              <SidebarIcon name="settings" />
              Settings
            </button>
            <button
              onClick={() => {
                if (window.confirm("Sign out of KAM Collector?")) logout();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
            >
              <SidebarIcon name="signout" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
      {settingsOpen && (
        <SettingsDialog user={user} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}

function SidebarIcon({ name }: { name: string }) {
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
  switch (name) {
    case "folder":
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 15l3-3 4 4 5-7" />
        </svg>
      );
    case "responses":
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      );
    case "signout":
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}