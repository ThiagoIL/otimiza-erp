"use server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import { formObject, keepValues, zodFail } from "@/lib/forms";
import { cnpjValid, cpfValid, maskDoc, onlyDigits } from "@/lib/doc";
import * as E from "@/db/erp";
import { ruleMsg, RuleError } from "./common";
import type { ActionState } from "@/lib/action";
import { PARTNER_KINDS } from "@/lib/consts";

const opt = (max = 200) => z.string().trim().max(max).optional().transform((v) => v || null);

const schema = z.object({
  id: z.string().max(64).optional(),
  pessoa: z.enum(["PJ", "PF"]),
  documento: z.string().trim().max(20).optional().default(""),
  nome: z.string().trim().min(2, "Informe a razão social ou o nome.").max(200),
  fantasia: opt(), perfil: opt(64), vendedor: opt(64), ativo: z.string().optional(),
  email: z.string().trim().max(160).optional().refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido.").transform((v) => v || null),
  telefone: opt(30), celular1: opt(30), celular2: opt(30), site: opt(160),
  cep: opt(10), logradouro: opt(), numero: opt(20), complemento: opt(100), bairro: opt(100), cidade: opt(100), cod_mun: opt(7), uf: opt(2),
  ie: opt(30), ind_ie: z.enum(["", "1", "2", "9"]).optional().transform((v) => v || null), im: opt(30), suframa: opt(20), regime: opt(40),
  consumidor_final: z.string().optional(), limite: opt(20),
});

export async function savePartnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await act(["comercial", "compras"]);
  if (!s) return NO_ACCESS;
  const raw = formObject(fd);
  const kinds = fd.getAll("tipos").map(String).filter((k) => (PARTNER_KINDS as readonly string[]).includes(k));
  const p = schema.safeParse(raw);
  if (!p.success) return { ...zodFail(p.error, raw), values: { ...keepValues(raw), tipos: kinds.join("|") } };
  const d = p.data;
  const fields: Record<string, string> = {};
  if (!kinds.length) fields.tipos = "Marque pelo menos um tipo.";
  const doc = onlyDigits(d.documento);
  if (doc && (d.pessoa === "PJ" ? !cnpjValid(doc) : !cpfValid(doc))) fields.documento = d.pessoa === "PJ" ? "CNPJ inválido." : "CPF inválido.";
  if (d.cod_mun && !/^\d{7}$/.test(d.cod_mun)) fields.cod_mun = "Use os 7 dígitos do IBGE.";
  if (Object.keys(fields).length) return { error: "Confira os campos destacados.", fields, values: { ...keepValues(raw), tipos: kinds.join("|") } };
  const values = {
    kinds, personType: d.pessoa, document: doc ? maskDoc(doc) : null, name: d.nome, tradeName: d.fantasia, profileId: d.perfil, salespersonId: d.vendedor,
    active: d.ativo === "on", email: d.email, phone: d.telefone, mobile1: d.celular1, mobile2: d.celular2, website: d.site,
    zip: d.cep, street: d.logradouro, number: d.numero, complement: d.complemento, district: d.bairro, city: d.cidade, cityCode: d.cod_mun, uf: d.uf?.toUpperCase() ?? null,
    stateReg: d.ie, stateRegIndicator: d.ind_ie, cityReg: d.im, suframa: d.suframa, taxRegime: d.regime, finalConsumer: d.consumidor_final === "on",
    creditLimit: d.limite ? String(Number(d.limite.replace(/\./g, "").replace(",", ".")) || 0) : null,
  };
  let id = d.id ?? "";
  try {
    await s.tx(async (tx) => {
      if (values.document) {
        const dup = await tx.select({ id: E.partners.id }).from(E.partners).where(and(eq(E.partners.document, values.document), id ? sql`${E.partners.id} <> ${id}` : sql`true`)).limit(1);
        if (dup.length) throw new RuleError("Já existe um cadastro com este CNPJ/CPF.");
      }
      if (id) {
        const r = await tx.update(E.partners).set(values).where(and(eq(E.partners.id, id), eq(E.partners.tenantId, s.tenant.id))).returning({ id: E.partners.id });
        if (!r.length) throw new RuleError("Cadastro não encontrado.");
      } else {
        const [r] = await tx.insert(E.partners).values({ ...values, tenantId: s.tenant.id }).returning({ id: E.partners.id });
        id = r.id;
      }
    });
  } catch (err) {
    const msg = ruleMsg(err);
    return msg.includes("CNPJ") ? { error: "Confira os campos destacados.", fields: { documento: msg }, values: { ...keepValues(raw), tipos: kinds.join("|") } } : { error: msg, values: { ...keepValues(raw), tipos: kinds.join("|") } };
  }
  await audit({ action: d.id ? "parceiro.alterado" : "parceiro.criado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "parceiro", entityId: id });
  return { ok: true, redirectTo: `${baseOf(fd.get("base"))}/${id}?msg=${encodeURIComponent("Cadastro salvo.")}` };
}

/** O mesmo cadastro abre em Comercial (clientes) e em Compras (fornecedores); volta para a tela de onde veio. */
function baseOf(v: unknown): string {
  return v === "/compras/fornecedores" ? "/compras/fornecedores" : "/clientes";
}

export async function deletePartnerAction(id: string, base?: string): Promise<ActionState> {
  const s = await act(["comercial", "compras"]);
  if (!s) return NO_ACCESS;
  try {
    const n = await s.tx((tx) => tx.delete(E.partners).where(and(eq(E.partners.id, id), eq(E.partners.tenantId, s.tenant.id))).returning({ id: E.partners.id }));
    if (!n.length) return { error: "Cadastro não encontrado." };
  } catch (err) {
    return { error: ruleMsg(err).includes("ligado") ? "Este cadastro está ligado a pedidos, notas ou contas. Marque como inativo em vez de excluir." : ruleMsg(err) };
  }
  await audit({ action: "parceiro.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "parceiro", entityId: id });
  return { ok: true, redirectTo: `${baseOf(base)}?msg=Cadastro%20exclu%C3%ADdo.` };
}

// ---------- contatos ----------
const contactSchema = z.object({
  id: z.string().max(64).optional(), partnerId: z.string().max(64), name: z.string().trim().min(2).max(120),
  role: z.string().trim().max(80).optional(), email: z.string().trim().max(160).optional(), phone: z.string().trim().max(30).optional(),
  mobile: z.string().trim().max(30).optional(), notes: z.string().trim().max(500).optional(), isPrimary: z.boolean().default(false),
});
export async function saveContactAction(input: z.input<typeof contactSchema>): Promise<ActionState> {
  const s = await act(["comercial", "compras"]);
  if (!s) return NO_ACCESS;
  const p = contactSchema.safeParse(input);
  if (!p.success) return { error: "Informe ao menos o nome do contato." };
  const { id, partnerId, ...v } = p.data;
  const values = { ...v, role: v.role || null, email: v.email || null, phone: v.phone || null, mobile: v.mobile || null, notes: v.notes || null };
  await s.tx(async (tx) => {
    if (values.isPrimary) await tx.update(E.partnerContacts).set({ isPrimary: false }).where(eq(E.partnerContacts.partnerId, partnerId));
    if (id) await tx.update(E.partnerContacts).set(values).where(eq(E.partnerContacts.id, id));
    else await tx.insert(E.partnerContacts).values({ ...values, partnerId, tenantId: s.tenant.id });
  });
  return { ok: true, message: "Contato salvo." };
}
export async function deleteContactAction(id: string): Promise<ActionState> {
  const s = await act(["comercial", "compras"]);
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.partnerContacts).where(eq(E.partnerContacts.id, id)));
  return { ok: true, message: "Contato removido." };
}

// ---------- anotações ----------
export async function addNoteAction(partnerId: string, body: string): Promise<ActionState> {
  const s = await act(["comercial", "compras"]);
  if (!s) return NO_ACCESS;
  const b = body.trim().slice(0, 4000);
  if (!b) return { error: "Escreva a anotação." };
  await s.tx((tx) => tx.insert(E.partnerNotes).values({ tenantId: s.tenant.id, partnerId, body: b, userName: s.user.name }));
  return { ok: true, message: "Anotação registrada." };
}
export async function deleteNoteAction(id: string): Promise<ActionState> {
  const s = await act(["comercial", "compras"]);
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.partnerNotes).where(eq(E.partnerNotes.id, id)));
  return { ok: true, message: "Anotação excluída." };
}
