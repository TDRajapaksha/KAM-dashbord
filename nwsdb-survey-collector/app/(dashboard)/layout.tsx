"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearUser, getUser, setUser, AuthUser } from "@/lib/auth";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = getUser();
    if (!storedUser) {
      router.replace("/login");
      return;
    }

    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) {
          clearUser();
          router.replace("/login");
          return;
        }
        const { user: sessionUser } = await response.json();
        if (sessionUser.id !== storedUser.id) {
          clearUser();
          router.replace("/login");
          return;
        }
        setUser(sessionUser);
        setUserState(sessionUser);
        setChecked(true);
      })
      .catch(() => {
        setSessionError("Could not verify your session. Check your connection and refresh.");
        setChecked(true);
      });
  }, [router]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex h-screen items-center justify-center px-6 text-center text-sm text-red-700">
        {sessionError}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#f4f6f8]">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {user && <Sidebar user={user} />}
        <main className="flex-1 overflow-auto bg-[#f4f6f8]">{children}</main>
      </div>
    </div>
  );
}