"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";

type LogoutButtonProps = {
  className?: string;
  children: React.ReactNode;
  label?: string;
};

export function LogoutButton({ className, children, label }: LogoutButtonProps) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      await logout();
      window.location.href = "/";
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      disabled={pending}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function LogoutIconButton({ className }: { className?: string }) {
  return (
    <LogoutButton className={className} label="تسجيل الخروج">
      <LogOut className="size-4" />
    </LogoutButton>
  );
}
