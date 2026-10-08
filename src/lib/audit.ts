import "server-only";
import { db } from "./db";
import { auditLogs } from "@/db/schema";
import { clientIp } from "./request";

export async function audit(entry: {
  action: string; tenantId?: string | null; userId?: string | null; userEmail?: string | null;
  entity?: string; entityId?: string; data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({ ...entry, ip: await clientIp() });
  } catch (err) {
    console.error("[audit] falha ao registrar:", (err as Error).message);
  }
}
