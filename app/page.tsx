"use client";

import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/hooks";
import { setCurrentUser } from "@/lib/store";
import { useEffect } from "react";

export default function HomeRedirect() {
  const state = useAppState();
  const router = useRouter();

  useEffect(() => {
    const user = state.users.find((u) => u.id === state.currentUserId);
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.systemRole === "employee") {
      router.replace("/employee/home");
    } else {
      router.replace("/manager/dashboard");
    }
  }, [router, state.currentUserId, state.users]);

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
      <p className="muted text-sm">در حال ورود به سامانه آریا...</p>
      <button
        type="button"
        className="sr-only"
        onClick={() => setCurrentUser("user_emp_leila")}
      >
        demo
      </button>
    </div>
  );
}
