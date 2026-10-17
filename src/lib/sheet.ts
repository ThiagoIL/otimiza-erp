/**
 * Leitura simples de planilhas para importação: .xlsx (primeira aba) ou .csv (; ou ,).
 * Roda no navegador (o arquivo não precisa subir inteiro para o servidor) e não usa biblioteca externa:
 * o .xlsx é um zip com XML; lemos só os textos e números das células.
 */
export async function readSpreadsheet(bytes: Uint8Array, name: string): Promise<string[][]> {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  if (zip || /\.xlsx$/i.test(name)) return readXlsx(bytes);
  if (/\.xls$/i.test(name)) throw new Error("Salve a planilha como .xlsx ou .csv (o formato .xls antigo não é lido).");
  return readCsv(new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, ""));
}

function readCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Arquivos do zip (diretório central), descompactados sob demanda. */
function unzip(b: Uint8Array): Map<string, () => Promise<string>> {
  const out = new Map<string, () => Promise<string>>();
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Arquivo .xlsx inválido.");
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const dec = new TextDecoder("utf-8");
  for (let k = 0; k < count; k++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10), size = u32(b, p + 20);
    const nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32), off = u32(b, p + 42);
    const fname = dec.decode(b.subarray(p + 46, p + 46 + nl));
    out.set(fname, async () => {
      const ln = u16(b, off + 26), le = u16(b, off + 28);
      const data = b.subarray(off + 30 + ln + le, off + 30 + ln + le + size);
      if (method === 0) return dec.decode(data);
      if (method === 8) return dec.decode(await inflate(data));
      throw new Error("Compactação do .xlsx não suportada.");
    });
    p += 46 + nl + el + cl;
  }
  return out;
}

const ent = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => ent(m[1])).join("");
const colIdx = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

async function readXlsx(b: Uint8Array): Promise<string[][]> {
  const z = unzip(b);
  const shared: string[] = [];
  const ss = z.get("xl/sharedStrings.xml");
  if (ss) for (const m of (await ss()).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));
  // primeira aba pela ordem do workbook
  let sheet = "xl/worksheets/sheet1.xml";
  const wb = await z.get("xl/workbook.xml")?.();
  const rels = await z.get("xl/_rels/workbook.xml.rels")?.();
  const rid = wb && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  if (rid && rels) {
    const t = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
    if (t) sheet = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
  }
  const get = z.get(sheet) ?? [...z.entries()].find(([k]) => k.startsWith("xl/worksheets/sheet"))?.[1];
  if (!get) throw new Error("A planilha não tem abas.");
  const xml = await get();
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = "";
      if (type === "s") val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = texts(body);
      else if (type === "b") val = v === "1" ? "Sim" : "Não";
      else val = v != null ? ent(v) : "";
      const i = ref ? colIdx(ref) : row.length;
      while (row.length < i) row.push("");
      row[i] = val.trim();
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some(Boolean));
}

/** Converte número da planilha (1.234,5 ou 1234.5) em número; NaN se não for número. */
export function sheetNum(v: string | undefined): number {
  const s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return 0;
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Data da planilha (serial do Excel, AAAA-MM-DD ou DD/MM/AAAA) em AAAA-MM-DD. */
export function sheetDate(v: string | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
  return null;
}

/** Cabeçalho normalizado para comparar ("Quantidade (un.)" → "quantidade un"). */
export const normHead = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Linhas da planilha em objetos pelo cabeçalho (primeira linha), com o nome normalizado. */
export function sheetObjects(rows: string[][]): { head: string[]; rows: Record<string, string>[] } {
  const [h = [], ...rest] = rows;
  const head = h.map(normHead);
  return { head, rows: rest.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ""]))) };
}
