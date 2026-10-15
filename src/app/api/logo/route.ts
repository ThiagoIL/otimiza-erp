import { NextResponse, type NextRequest } from "next/server";
import { tenantSession } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { companySettings } from "@/db/erp";

export const dynamic = "force-dynamic";

const MAX = 1024 * 1024; // 1 MB
/** Confere o tipo pelo conteúdo do arquivo (não confia na extensão). SVG fica de fora por segurança. */
function kindOf(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}
const sameOrigin = (req: NextRequest) => { const o = req.headers.get("origin"), h = req.headers.get("host"); return !!o && !!h && new URL(o).host === h; };

/** Logo da empresa (para quem está conectado nela). */
export async function GET() {
  const s = await tenantSession();
  if (!s || !s.tenant) return new NextResponse(null, { status: 401 });
  const [c] = await withTenant(s.tenant.id, (tx) => tx.select({ logo: companySettings.logo, mime: companySettings.logoMime }).from(companySettings).limit(1));
  if (!c?.logo || !c.mime) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(c.logo, "base64"), {
    headers: { "Content-Type": c.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}

/** Envia a logo (só o administrador da empresa). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const s = await tenantSession();
  if (!s || !s.tenant || s.user.mustChangePassword) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (s.user.role !== "TENANT_ADMIN") return NextResponse.json({ error: "Só o administrador da empresa pode trocar a logo." }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Escolha a imagem da logo." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "A imagem passa de 1 MB. Use uma versão menor." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = kindOf(buf);
  if (!mime) return NextResponse.json({ error: "Use uma imagem PNG, JPG ou WebP." }, { status: 400 });
  const tenantId = s.tenant.id;
  await withTenant(tenantId, async (tx) => {
    const v = { logo: buf.toString("base64"), logoMime: mime, logoAt: new Date() };
    const r = await tx.update(companySettings).set(v).returning({ id: companySettings.id });
    if (!r.length) await tx.insert(companySettings).values({ ...v, tenantId });
  });
  await audit({ action: "empresa.logo", tenantId, userId: s.user.id, userEmail: s.user.email });
  return NextResponse.json({ ok: true });
}

/** Remove a logo. */
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const s = await tenantSession();
  if (!s || !s.tenant || s.user.role !== "TENANT_ADMIN") return NextResponse.json({ error: "Só o administrador da empresa pode remover a logo." }, { status: 403 });
  await withTenant(s.tenant.id, (tx) => tx.update(companySettings).set({ logo: null, logoMime: null, logoAt: null }));
  return NextResponse.json({ ok: true });
}
