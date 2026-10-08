"use client";
import { useTransition } from "react";
import { logoutAction } from "@/server/auth-actions";

export function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-ghost btn-sm" type="button" disabled={pending}
      onClick={() => start(async () => { await logoutAction(); window.location.assign("/login"); })}>
      {pending ? "Saindo…" : "Sair"}
    </button>
  );
}
