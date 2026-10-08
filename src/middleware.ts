import { NextResponse, type NextRequest } from "next/server";
import { parseHost } from "@/lib/host";

/**
 * Barra acessos por domínios que não pertencem ao sistema (ex.: IP direto ou domínio de terceiros
 * apontado para o servidor). As páginas descobrem a área (sistema ou empresa) pelo próprio Host.
 */
export function middleware(req: NextRequest) {
  const info = parseHost(req.headers.get("host"), process.env.ROOT_DOMAIN ?? "", process.env.ADMIN_SUBDOMAIN ?? "admin");
  if (info.area === "unknown") return new NextResponse("Domínio não configurado.", { status: 404 });
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/|api/health|favicon.ico|icon.svg|robots.txt).*)"],
};
