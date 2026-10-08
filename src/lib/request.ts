import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

export async function clientIp(): Promise<string> {
  const h = await headers();
  if (env.TRUST_PROXY === "true") {
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim().slice(0, 64);
    const real = h.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  return "desconhecido";
}

export async function userAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 300);
}
