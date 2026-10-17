// Empresa de demonstração de ESQUADRIAS DE ALUMÍNIO (padrão: "demo2") com dados de exemplo em todos os módulos:
// itens com estrutura, estoque, clientes e fornecedores, compras (quadro), vendas, medições de obra, OPs,
// apontamentos, montagens (instalação), romaneios e financeiro.
// Uso:   DEMO_ADMIN_PASSWORD='DemoFabrica2026' node scripts/seed-esquadrias.mjs
// Apagar o que existe e popular de novo:  DEMO_RESET=1 DEMO_ADMIN_PASSWORD='...' node scripts/seed-esquadrias.mjs
// Opcional: DEMO_SLUG (padrão demo2), DEMO_ADMIN_EMAIL (padrão admin@demo2.com.br).
// Com DEMO_RESET=1, todos os dados de negócio da empresa são apagados; os administradores da empresa são mantidos
// (a senha é trocada se DEMO_ADMIN_PASSWORD for informada) e os demais usuários são recriados.
import bcrypt from "bcryptjs";
import { pool, newId, passwordProblem, tempPassword } from "./_common.mjs";

const slug = process.env.DEMO_SLUG ?? "demo2";
const email = (process.env.DEMO_ADMIN_EMAIL ?? `admin@${slug}.com.br`).toLowerCase();
const reset = process.env.DEMO_RESET === "1";
const passGiven = !!process.env.DEMO_ADMIN_PASSWORD;
const pass = process.env.DEMO_ADMIN_PASSWORD ?? tempPassword();
const prob = passwordProblem(pass, email);
if (prob) { console.error(`DEMO_ADMIN_PASSWORD inválida: ${prob}.`); process.exit(1); }

// ---------- datas relativas a hoje ----------
const TZ = process.env.APP_TIMEZONE ?? "America/Sao_Paulo";
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addD = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const D = (n) => addD(TODAY, n);
const M = (mo, day) => { const t = new Date(TODAY.slice(0, 8) + "01T12:00:00Z"); t.setUTCMonth(t.getUTCMonth() + mo); t.setUTCDate(day); return t.toISOString().slice(0, 10); };
const minD = (a, b) => (a < b ? a : b);
const r2 = (v) => Math.round(v * 100) / 100;
const parc = (total, days, base) => { const v = Math.floor((total / days.length) * 100) / 100; return days.map((d, i) => ({ n: i + 1, due: addD(base, d), value: i < days.length - 1 ? v : r2(total - v * (days.length - 1)) })); };
const fixCnpj = (doc) => { const d = doc.replace(/\D/g, "").slice(0, 12).split("").map(Number); const f = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let t = 0; for (let i = 0; i < n; i++) t += d[i] * w[i]; const r = t % 11; return r < 2 ? 0 : 11 - r; }; d.push(f(12)); d.push(f(13)); const x = d.join(""); return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`; };
const snake = (k) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

const COMPANY = { legal: "Esquadrias Modelo Alumínio e Vidros Ltda", trade: "Esquadrias Modelo", doc: fixCnpj("23.456.789/0001") };

const db = pool();
const c = await db.connect();
let tid;
/** insert genérico: chaves em camelCase viram colunas snake_case; devolve o id. */
async function ins(table, o) {
  const row = { id: o.id ?? newId(), tenant_id: tid, ...Object.fromEntries(Object.entries(o).filter(([k]) => k !== "id").map(([k, v]) => [snake(k), v])) };
  const cols = Object.keys(row);
  const vals = cols.map((k) => {
    const v = row[k];
    if (v instanceof Date || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.length && typeof v[0] === "object" ? JSON.stringify(v) : v;
    return JSON.stringify(v);
  });
  await c.query(`insert into ${table} (${cols.map((x) => `"${x}"`).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
  return row.id;
}

/** Apaga todos os dados de negócio da empresa (tabelas com tenant_id), respeitando a ordem das chaves estrangeiras. */
async function wipe() {
  const { rows } = await c.query(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id'
    and table_name not in ('users', 'audit_logs', 'tenants', 'sessions')`);
  let left = rows.map((r) => r.table_name);
  for (let pass = 0; left.length && pass < 30; pass++) {
    const next = [];
    for (const t of left) {
      await c.query("savepoint w");
      try { await c.query(`delete from "${t}" where tenant_id = $1`, [tid]); await c.query("release savepoint w"); }
      catch { await c.query("rollback to savepoint w"); next.push(t); }
    }
    left = next;
  }
  if (left.length) throw new Error(`Não foi possível apagar: ${left.join(", ")}`);
}

try {
  await c.query("begin");
  const hash = await bcrypt.hash(pass, 12);
  let adminId;
  const ex = await c.query("select id from tenants where slug = $1", [slug]);
  if (ex.rows.length && !reset) { console.log(`A empresa "${slug}" já existe. Use DEMO_RESET=1 para apagar os dados e popular de novo.`); await c.query("rollback"); process.exit(0); }
  if (ex.rows.length) {
    tid = ex.rows[0].id;
    // usuários comuns saem (as sessões caem junto); os administradores ficam
    await c.query("delete from users where tenant_id = $1 and role <> 'TENANT_ADMIN'", [tid]);
    await c.query("select set_config('app.tenant_id', $1, true)", [tid]);
    await c.query("set local role erp_app");
    await wipe();
    await c.query("reset role");
    await c.query("update tenants set name = $2, document = $3 where id = $1", [tid, COMPANY.legal, COMPANY.doc]);
    const adm = await c.query("select id from users where tenant_id = $1 and role = 'TENANT_ADMIN' order by (email = $2) desc, created_at limit 1", [tid, email]);
    if (adm.rows.length) {
      adminId = adm.rows[0].id;
      if (passGiven) await c.query("update users set password_hash = $2, must_change_password = false where id = $1", [adminId, hash]);
    }
    console.log(`Dados da empresa "${slug}" apagados.`);
  } else {
    tid = newId();
    await c.query("insert into tenants (id, slug, name, document) values ($1, $2, $3, $4)", [tid, slug, COMPANY.legal, COMPANY.doc]);
  }
  if (!adminId) {
    adminId = newId();
    await c.query("insert into users (id, tenant_id, name, email, password_hash, role, must_change_password) values ($1, $2, 'Administrador Demo', $3, $4, 'TENANT_ADMIN', false)", [adminId, tid, email, hash]);
  }

  await c.query("select set_config('app.tenant_id', $1, true)", [tid]);
  await c.query("set local role erp_app");

  // ---------- empresa e cadastros básicos ----------
  await ins("company_settings", { legalName: COMPANY.legal, tradeName: COMPANY.trade, document: COMPANY.doc, stateReg: "200345678", taxRegime: "Simples Nacional",
    phone: "(84) 3205-4400", email: "contato@esquadriasmodelo.com.br", zip: "59115-000", street: "Rua da Indústria", number: "820", district: "Distrito Industrial", city: "Natal", cityCode: "2408102", uf: "RN", defaultsVersion: 3 });
  for (const [code, name, decimals] of [["UN", "Unidade", 0], ["PC", "Peça", 0], ["BR", "Barra de 6 m", 2], ["M", "Metro", 2], ["M2", "Metro quadrado", 2], ["KG", "Quilograma", 3], ["CX", "Caixa", 2], ["PR", "Par", 0], ["KIT", "Kit", 0], ["RL", "Rolo", 0], ["H", "Hora", 2]])
    await ins("units", { code, name, decimals });
  const T = {};
  for (const [k, name, kind] of [["MP", "Matéria-prima", "MATERIA_PRIMA"], ["SA", "Componente fabricado", "SEMIACABADO"], ["PA", "Esquadria (produto acabado)", "PRODUTO_ACABADO"], ["UC", "Uso e consumo", "CONSUMO"], ["RV", "Revenda", "REVENDA"]])
    T[k] = { id: await ins("item_types", { name, kind }), kind };
  const G = {};
  for (const [k, code, name, prefix, next] of [["g01", "PF", "Perfis de alumínio", "PF-", 20], ["g02", "VD", "Vidros", "VD-", 10], ["g03", "AC", "Acessórios e ferragens", "AC-", 10],
    ["g04", "VE", "Vedação e fixação", "VE-", 10], ["g05", "EM", "Embalagem", "EM-", 10], ["g06", "ESQ", "Esquadrias (produto acabado)", "ESQ-", 20], ["g07", "CF", "Componentes fabricados", "CF-", 10], ["g08", "UC", "Uso e consumo", "UC-", 10]])
    G[k] = await ins("item_groups", { code, name, codePrefix: prefix, prefixDigits: 3, nextNumber: next });
  const GS = {
    sup: await ins("item_groups", { code: "PF-SU", name: "Linha Suprema", parentId: G.g01, codePrefix: "PF-SU-", prefixDigits: 3, nextNumber: 10 }),
    gold: await ins("item_groups", { code: "PF-GO", name: "Linha Gold", parentId: G.g01, codePrefix: "PF-GO-", prefixDigits: 3, nextNumber: 10 }),
    out: await ins("item_groups", { code: "PF-OU", name: "Outras linhas e tubos", parentId: G.g01, codePrefix: "PF-OU-", prefixDigits: 3, nextNumber: 10 }),
    temp: await ins("item_groups", { code: "VD-TP", name: "Temperados e laminados", parentId: G.g02, codePrefix: "VD-TP-", prefixDigits: 3, nextNumber: 10 }),
  };
  const SP = {
    carlos: await ins("salespeople", { name: "Carlos Andrade", email: "vendas@esquadriasmodelo.com.br", phone: "(84) 99812-3344", commissionPct: 3 }),
    marina: await ins("salespeople", { name: "Marina Souza", email: "marina.arq@email.com", phone: "(84) 99701-5566", commissionPct: 5 }),
  };
  const L = {};
  for (const [k, code, name, type, description] of [["e01", "001", "Almoxarifado de acessórios", "Almoxarifado", "Ferragens, vedação e fixação"], ["e02", "002", "Linha de montagem", "Produção", "Material liberado para a linha"],
    ["e03", "003", "Expedição", "Expedição", "Esquadrias embaladas aguardando instalação"], ["e04", "004", "Depósito de perfis", "Almoxarifado", "Cavaletes de barras de 6 m"], ["e05", "005", "Estoque de vidros", "Almoxarifado", "Cavaletes de chapas e vidros cortados"]])
    L[k] = await ins("stock_locations", { code, name, type, description });

  // ---------- clientes e fornecedores ----------
  const PF = {};
  for (const [k, name, color] of [["constr", "Construtora", "#1F8A8A"], ["arq", "Arquiteto / especificador", "#7A4FA0"], ["resid", "Cliente residencial", "#C77700"], ["comerc", "Comercial e serviços", "#1E3A5F"], ["revenda", "Revenda / vidraçaria", "#2E7D4F"]])
    PF[k] = await ins("partner_profiles", { name, color });
  const P = {};
  const partners = [
    ["cl01", ["Cliente"], "PJ", "13.141.516/0001", "Construtora Ponta Negra Ltda", "Construtora Ponta Negra", "Natal", "RN", "obras@cpnegra.com.br", "(84) 3219-7070", "(84) 99630-1122", "constr", "Av. Eng. Roberto Freire, 1776", "Capim Macio", "59090-000", "2408102"],
    ["cl02", ["Cliente"], "PJ", "24.252.627/0001", "Atlântico Empreendimentos Imobiliários Ltda", "Atlântico Empreendimentos", "Natal", "RN", "suprimentos@atlanticoemp.com.br", "(84) 3342-8800", "", "constr", "Av. Prudente de Morais, 4200", "Lagoa Nova", "59064-630", "2408102"],
    ["cl03", ["Cliente"], "PJ", "35.363.738/0001", "Condomínio Residencial Jardins do Lago", "Jardins do Lago", "Parnamirim", "RN", "sindico@jardinsdolago.com.br", "(84) 3644-2020", "(84) 98877-1010", "comerc", "Rua das Garças, 300", "Nova Parnamirim", "59150-000", "2403251"],
    ["cl04", ["Cliente"], "PJ", "46.474.849/0001", "Beatriz Menezes Arquitetura Ltda", "Beatriz Menezes Arquitetura", "Natal", "RN", "projetos@bmenezes.arq.br", "(84) 3206-5151", "(84) 99911-2233", "arq", "Rua Mossoró, 512", "Tirol", "59020-090", "2408102"],
    ["cl05", ["Cliente"], "PJ", "57.585.950/0001", "Clínica Bem Viver Ltda", "Clínica Bem Viver", "Natal", "RN", "adm@clinicabemviver.com.br", "(84) 3222-4545", "", "comerc", "Rua Apodi, 410", "Cidade Alta", "59025-000", "2408102"],
    ["cl06", ["Cliente"], "PF", "123.456.789-09", "Ricardo Albuquerque Lima", null, "Parnamirim", "RN", "ricardo.lima@email.com", "", "(84) 98822-4455", "resid", "Rua dos Cajueiros, 88", "Cotovelo", "59160-000", "2403251"],
    ["cl07", ["Cliente"], "PF", "987.654.321-00", "Juliana Freitas Rocha", null, "Natal", "RN", "juliana.rocha@email.com", "", "(84) 99655-7788", "resid", "Rua Pedro Fonseca Filho, 1200, apto 702", "Ponta Negra", "59090-080", "2408102"],
    ["cl08", ["Cliente"], "PJ", "68.696.061/0001", "Hotel Praia Dourada Ltda", "Hotel Praia Dourada", "Natal", "RN", "manutencao@praiadourada.com.br", "(84) 3219-9000", "", "comerc", "Via Costeira, 2500", "Ponta Negra", "59090-001", "2408102"],
    ["cl09", ["Cliente"], "PJ", "79.707.172/0001", "Vidraçaria Central de Mossoró Ltda", "Vidraçaria Central", "Mossoró", "RN", "compras@vidracariacentral.com.br", "(84) 3316-1212", "", "revenda", "Av. Alberto Maranhão, 1500", "Centro", "59600-000", "2408003"],
    ["f01", ["Fornecedor"], "PJ", "80.818.283/0001", "Extrusa Nordeste Alumínio Ltda", "Extrusa Nordeste", "Cabo de Santo Agostinho", "PE", "vendas@extrusane.com.br", "(81) 3521-4000", "", null, "Rod. PE-60, km 10", "Distrito Industrial", "54500-000", "2602902"],
    ["f02", ["Fornecedor"], "PJ", "91.929.394/0001", "Temperados Potiguar Vidros Ltda", "Temperados Potiguar", "Natal", "RN", "pedidos@temperadospotiguar.com.br", "(84) 3213-7070", "", null, "Rua do Vidro, 45", "Felipe Camarão", "59072-000", "2408102"],
    ["f03", ["Fornecedor"], "PJ", "10.203.040/0001", "Ferragens Esquadria Comércio Ltda", "Ferragens Esquadria", "Recife", "PE", "comercial@ferragensesq.com.br", "(81) 3445-2121", "", null, "Av. Mascarenhas de Morais, 3000", "Imbiribeira", "51150-000", "2611606"],
    ["f04", ["Fornecedor"], "PJ", "11.213.141/0001", "Anodiza Nordeste Tratamentos de Superfície Ltda", "Anodiza Nordeste", "Natal", "RN", "producao@anodizane.com.br", "(84) 3234-5656", "", null, "Rua Industrial, 70", "Igapó", "59104-000", "2408102"],
    ["f05", ["Fornecedor"], "PJ", "12.223.242/0001", "Pintura Forte Eletrostática Ltda", "Pintura Forte", "Parnamirim", "RN", "atendimento@pinturaforte.com.br", "(84) 3272-3030", "", null, "Av. Ayrton Senna, 900", "Nova Parnamirim", "59140-000", "2403251"],
    ["f06", ["Fornecedor"], "PJ", "13.233.343/0001", "Embalagens RN Comércio Ltda", "Embalagens RN", "Natal", "RN", "vendas@embalagensrn.com.br", "(84) 3211-8080", "", null, "Av. Bernardo Vieira, 900", "Tirol", "59015-000", "2408102"],
    ["tr01", ["Transportadora", "Fornecedor"], "PJ", "14.243.444/0001", "Rota Potiguar Transportes Ltda", "Rota Potiguar", "Natal", "RN", "coleta@rotapotiguar.com.br", "(84) 3272-6060", "", null, "BR-304, km 2", "Bom Pastor", "59052-000", "2408102"],
  ];
  for (const [k, kinds, personType, document, name, tradeName, city, uf, em, phone, mobile1, prof, street, district, zip, cityCode] of partners)
    P[k] = await ins("partners", { kinds, personType, document: personType === "PJ" ? fixCnpj(document) : document, name, tradeName, city, uf, email: em, phone: phone || null, mobile1: mobile1 || null, profileId: prof ? PF[prof] : null,
      street, district, zip, cityCode, stateRegIndicator: personType === "PJ" ? "1" : "9", salespersonId: kinds.includes("Cliente") ? (["cl04", "cl06", "cl07"].includes(k) ? SP.marina : SP.carlos) : null, finalConsumer: personType === "PF" });
  await ins("partner_contacts", { partnerId: P.cl01, name: "Eng. Roberto Maia", role: "Engenheiro da obra", email: "roberto@cpnegra.com.br", mobile: "(84) 99901-2233", isPrimary: true });
  await ins("partner_contacts", { partnerId: P.cl01, name: "Patrícia Lopes", role: "Suprimentos", email: "suprimentos@cpnegra.com.br", phone: "(84) 3219-7071" });
  await ins("partner_contacts", { partnerId: P.cl02, name: "Marcelo Dantas", role: "Gerente de obras", mobile: "(84) 99644-7788", isPrimary: true });
  await ins("partner_contacts", { partnerId: P.cl08, name: "Sérgio Bezerra", role: "Manutenção predial", mobile: "(84) 99123-4567", isPrimary: true });
  await ins("partner_notes", { partnerId: P.cl01, body: "Obra só libera instalação depois do reboco e da pintura interna. Confirmar com o engenheiro antes de agendar a equipe.", userName: "Administrador Demo" });
  await ins("partner_notes", { partnerId: P.cl04, body: "Arquiteta especifica sempre linha Gold, pintura preto fosco e vidro laminado nas fachadas.", userName: "Administrador Demo" });

  // ---------- itens ----------
  // [chave, código, nome, complemento, grupo, unidade, tipo, estoque mínimo, custo, local, saldo inicial, peso kg/un]
  const I = [
    ["p01", "PF-SU-001", "PERFIL TRILHO SUPERIOR DE CORRER SU-001 6M", "Linha Suprema", "sup", "BR", "MP", 20, 118, "e04", 70],
    ["p02", "PF-SU-002", "PERFIL TRILHO INFERIOR DE CORRER SU-002 6M", "Linha Suprema", "sup", "BR", "MP", 20, 126, "e04", 70],
    ["p03", "PF-SU-003", "PERFIL MARCO LATERAL SU-003 6M", "Linha Suprema", "sup", "BR", "MP", 20, 98, "e04", 60],
    ["p04", "PF-SU-004", "PERFIL MONTANTE DA FOLHA SU-004 6M", "Linha Suprema", "sup", "BR", "MP", 30, 104, "e04", 90],
    ["p05", "PF-SU-005", "PERFIL TRAVESSA DA FOLHA SU-005 6M", "Linha Suprema", "sup", "BR", "MP", 30, 92, "e04", 90],
    ["p06", "PF-GO-001", "PERFIL PORTA DE GIRO GO-010 6M", "Linha Gold", "gold", "BR", "MP", 10, 168, "e04", 28],
    ["p07", "PF-OU-001", "PERFIL MAXIM-AR L25-020 6M", "Linha 25", "out", "BR", "MP", 10, 86, "e04", 30],
    ["p08", "PF-OU-002", "TUBO 50X50X2MM GUARDA-CORPO 6M", null, "out", "BR", "MP", 10, 142, "e04", 20],
    ["p09", "PF-OU-003", "PERFIL COLUNA FACHADA PELE DE VIDRO 6M", null, "out", "BR", "MP", 8, 286, "e04", 18],
    ["v01", "VD-001", "VIDRO INCOLOR 6MM", "chapa cortada sob medida", "g02", "M2", "MP", 30, 92, "e05", 130],
    ["v02", "VD-002", "VIDRO FUMÊ 6MM", null, "g02", "M2", "MP", 20, 118, "e05", 55],
    ["v03", "VD-TP-001", "VIDRO LAMINADO 8MM INCOLOR", null, "temp", "M2", "MP", 20, 196, "e05", 60],
    ["v04", "VD-TP-002", "VIDRO TEMPERADO 10MM INCOLOR", null, "temp", "M2", "MP", 20, 168, "e05", 75],
    ["v05", "VD-TP-003", "VIDRO TEMPERADO 8MM VERDE", null, "temp", "M2", "MP", 10, 152, "e05", 30],
    ["a01", "AC-001", "ROLDANA DUPLA COM ROLAMENTO", null, "g03", "UN", "MP", 100, 7.8, "e01", 420],
    ["a02", "AC-002", "FECHO CONCHA COM TRAVA", null, "g03", "UN", "MP", 50, 12.4, "e01", 150],
    ["a03", "AC-003", "PUXADOR CONCHA DE EMBUTIR", null, "g03", "UN", "MP", 50, 6.9, "e01", 160],
    ["a04", "AC-004", "FECHADURA PORTA DE CORRER BICO DE PAPAGAIO", null, "g03", "UN", "MP", 20, 48, "e01", 45],
    ["a05", "AC-005", "BRAÇO DE MAXIM-AR 300MM", null, "g03", "PR", "MP", 30, 28, "e01", 60],
    ["a06", "AC-006", "DOBRADIÇA DE ALUMÍNIO PARA PORTA DE GIRO", null, "g03", "UN", "MP", 40, 16.5, "e01", 90],
    ["a07", "AC-007", "KIT BOX DE CORRER (ROLDANAS E TRILHO)", null, "g03", "KIT", "MP", 10, 145, "e01", 18],
    ["a08", "AC-008", "FIXADOR INOX PARA GUARDA-CORPO", null, "g03", "UN", "MP", 40, 22, "e01", 70],
    ["e1", "VE-001", "ESCOVA DE VEDAÇÃO 5X7MM", null, "g04", "M", "MP", 500, 0.85, "e01", 2200],
    ["e2", "VE-002", "BORRACHA EPDM TIPO CUNHA", null, "g04", "M", "MP", 500, 1.2, "e01", 2000],
    ["e3", "VE-003", "SILICONE NEUTRO INCOLOR 280G", null, "g04", "UN", "MP", 40, 21.9, "e01", 130],
    ["e4", "VE-004", "PARAFUSO INOX 4,2X32", "caixa com 500", "g04", "CX", "MP", 4, 64, "e01", 12],
    ["e5", "VE-005", "FITA DUPLA FACE ESTRUTURAL 19MM", "rolo de 20 m", "g04", "RL", "MP", 10, 59, "e01", 30],
    ["e6", "VE-006", "BUCHA E PARAFUSO DE FIXAÇÃO 8MM", null, "g04", "UN", "MP", 300, 0.9, "e01", 1300],
    ["m1", "EM-001", "FILME STRETCH 500MM", null, "g05", "RL", "MP", 6, 39, "e01", 20],
    ["m2", "EM-002", "CANTONEIRA DE PAPELÃO", null, "g05", "UN", "MP", 200, 0.45, "e01", 900],
    ["u1", "UC-001", "DISCO DE SERRA WIDEA 300MM 100 DENTES", null, "g08", "UN", "UC", 2, 289, "e01", 5],
    ["u2", "UC-002", "FRESA DE TOPO 5MM PARA USINAGEM", null, "g08", "UN", "UC", 5, 38, "e01", 12],
    ["u3", "UC-003", "LUVA ANTICORTE", null, "g08", "PR", "UC", 10, 18, "e01", 30],
    ["s01", "CF-001", "FOLHA DE CORRER MONTADA", "perfil + vidro + vedação", "g07", "UN", "SA", 0, 0, "e02", 0],
    ["s02", "CF-002", "MARCO DE ESQUADRIA MONTADO", null, "g07", "UN", "SA", 0, 0, "e02", 0],
    ["j2", "ESQ-001", "JANELA DE CORRER 2 FOLHAS 1500X1200", "Linha Suprema", "g06", "UN", "PA", 0, 0, "e03", 0, 14],
    ["j4", "ESQ-002", "JANELA DE CORRER 4 FOLHAS 2000X1200", "Linha Suprema", "g06", "UN", "PA", 0, 0, "e03", 0, 21],
    ["pc2", "ESQ-003", "PORTA DE CORRER 2 FOLHAS 1600X2100", "Linha Suprema", "g06", "UN", "PA", 0, 0, "e03", 0, 28],
    ["pc4", "ESQ-004", "PORTA DE CORRER 4 FOLHAS 2400X2100", "Linha Suprema", "g06", "UN", "PA", 0, 0, "e03", 0, 42],
    ["mx", "ESQ-005", "JANELA MAXIM-AR 600X600", "Linha 25", "g06", "UN", "PA", 0, 0, "e03", 0, 6],
    ["pg", "ESQ-006", "PORTA DE GIRO 800X2100", "Linha Gold", "g06", "UN", "PA", 0, 0, "e03", 0, 22],
    ["bx", "ESQ-007", "BOX DE BANHEIRO DE CORRER 1200X1900", "vidro temperado 8 mm", "g06", "UN", "PA", 0, 0, "e03", 0, 30],
    ["gc", "ESQ-008", "GUARDA-CORPO DE ALUMÍNIO E VIDRO", "por metro linear", "g06", "M", "PA", 0, 0, "e03", 0, 18],
    ["fc", "ESQ-009", "FACHADA PELE DE VIDRO", "por metro quadrado", "g06", "M2", "PA", 0, 0, "e03", 0, 32],
  ];
  const NCM = { p01: "76042920", p02: "76042920", p03: "76042920", p04: "76042920", p05: "76042920", p06: "76042920", p07: "76042920", p08: "76082090", p09: "76042920",
    v01: "70052900", v02: "70052100", v03: "70072900", v04: "70071900", v05: "70071900", j2: "76101000", j4: "76101000", pc2: "76101000", pc4: "76101000", mx: "76101000", pg: "76101000", bx: "70200090", gc: "76109000", fc: "76109000" };
  const FP = (k) => (k.startsWith("p") && k.length === 3 && !k.startsWith("pc") && k !== "pg" ? "f01" : k.startsWith("v") ? "f02" : k.startsWith("m") && k.length === 2 ? "f06" : k.startsWith("u") ? "f06" : "f03");
  const IT = {}, COST = {}, UNIT = {}, NAME = {};
  const FAB = (k) => ["s01", "s02"].includes(k);
  // custos das esquadrias calculados depois pela estrutura
  const C = {};
  const CPH = { c1: 85, c2: 90, c3: 95, c4: 100, c5: 60, c6: 110 };
  for (const [k, code, name, cap, description] of [["c1", "CT-01", "Corte de perfis", 16, "Serra dupla esquadria e serra de bancada"], ["c2", "CT-02", "Usinagem", 16, "Copiadora, puncionadeira e furação"],
    ["c3", "CT-03", "Montagem de esquadrias", 24, "Montagem de marcos e folhas, ferragens e vedação"], ["c4", "CT-04", "Vidraçaria", 16, "Corte, colagem e envidraçamento"],
    ["c5", "CT-05", "Embalagem e expedição", 8, "Proteção, etiquetas e carregamento"], ["c6", "CT-06", "Instalação em obra", 32, "Equipes de instalação"]])
    C[k] = await ins("work_centers", { code, name, capacityHours: cap, costPerHour: CPH[k], description });
  const BOMS = {
    j2: { m: [["s02", 1], ["s01", 2], ["p01", 0.25], ["p02", 0.25], ["p03", 0.4], ["p04", 0.8], ["p05", 0.5], ["a01", 4], ["a02", 1], ["a03", 1], ["e1", 9], ["e2", 9], ["e4", 0.05], ["v01", 1.6], ["e3", 1], ["m1", 0.1], ["m2", 4]], r: [["c1", 0.6], ["c2", 0.5], ["c3", 1.2], ["c4", 0.6], ["c5", 0.3]] },
    j4: { m: [["s02", 1], ["s01", 4], ["p01", 0.35], ["p02", 0.35], ["p03", 0.4], ["p04", 1.6], ["p05", 0.7], ["a01", 8], ["a02", 2], ["a03", 2], ["e1", 14], ["e2", 14], ["e4", 0.08], ["v01", 2.2], ["e3", 1], ["m1", 0.15], ["m2", 4]], r: [["c1", 0.9], ["c2", 0.8], ["c3", 1.8], ["c4", 0.9], ["c5", 0.4]] },
    pc2: { m: [["s02", 1], ["s01", 2], ["p01", 0.3], ["p02", 0.3], ["p03", 0.7], ["p04", 1.4], ["p05", 0.6], ["a01", 4], ["a04", 1], ["e1", 12], ["e2", 12], ["e4", 0.06], ["v04", 3.2], ["e3", 2], ["m1", 0.2], ["m2", 4]], r: [["c1", 0.8], ["c2", 0.7], ["c3", 1.6], ["c4", 0.8], ["c5", 0.4]] },
    pc4: { m: [["s02", 1], ["s01", 4], ["p01", 0.45], ["p02", 0.45], ["p03", 0.7], ["p04", 2.8], ["p05", 0.9], ["a01", 8], ["a04", 1], ["a03", 2], ["e1", 18], ["e2", 18], ["e4", 0.1], ["v04", 4.8], ["e3", 2], ["m1", 0.3], ["m2", 6]], r: [["c1", 1.2], ["c2", 1], ["c3", 2.4], ["c4", 1.2], ["c5", 0.5]] },
    mx: { m: [["s02", 1], ["p07", 0.5], ["a05", 1], ["e2", 2.5], ["e4", 0.02], ["v02", 0.36], ["e3", 0.5], ["m2", 4]], r: [["c1", 0.3], ["c2", 0.3], ["c3", 0.5], ["c4", 0.3], ["c5", 0.1]] },
    pg: { m: [["s02", 1], ["p06", 1.2], ["p03", 0.5], ["a06", 3], ["a04", 1], ["e2", 6], ["e4", 0.05], ["v03", 1.2], ["e3", 1], ["m1", 0.15], ["m2", 4]], r: [["c1", 0.6], ["c2", 0.6], ["c3", 1.2], ["c4", 0.5], ["c5", 0.3]] },
    bx: { m: [["p01", 0.2], ["p02", 0.2], ["a07", 1], ["e6", 6], ["v05", 2.3], ["e3", 1], ["m2", 4]], r: [["c1", 0.3], ["c3", 0.6], ["c4", 0.8], ["c5", 0.3]] },
    gc: { m: [["p08", 0.4], ["a08", 4], ["e6", 4], ["v03", 1.1], ["e3", 0.5]], r: [["c1", 0.4], ["c2", 0.5], ["c3", 0.6], ["c4", 0.4]] },
    fc: { m: [["p09", 0.35], ["e2", 4], ["e6", 3], ["v03", 1.05], ["e5", 0.3], ["e3", 1]], r: [["c1", 0.3], ["c2", 0.4], ["c3", 0.8], ["c4", 0.6]] },
  };
  const rawCost = Object.fromEntries(I.map((x) => [x[0], x[8]]));
  const unitCost = (k) => BOMS[k] ? r2(BOMS[k].m.reduce((a, [m, q]) => a + q * rawCost[m], 0) + BOMS[k].r.reduce((a, [w, h]) => a + h * CPH[w], 0)) : rawCost[k];
  const price = (k) => Math.round((unitCost(k) * 1.8) / 10) * 10;
  for (const [k, code, name, complement, g, unit, t, min, cost0, loc, , weight] of I) {
    const pa = t === "PA";
    const cost = pa ? unitCost(k) : cost0;
    COST[k] = cost; UNIT[k] = unit; NAME[k] = name;
    IT[k] = await ins("items", { code, name, complement, groupId: GS[g] ?? G[g], unit, typeId: T[t].id, type: T[t].kind, minStock: min, maxStock: pa || t === "SA" ? 0 : min * 3, defaultLocationId: L[loc], cost,
      salePrice: pa ? price(k) : k.startsWith("v") ? r2(cost * 1.7) : k.startsWith("a") ? r2(cost * 1.9) : 0, ncm: NCM[k] ?? null, defaultSupplierId: pa || t === "SA" ? null : P[FP(k)], leadDays: pa || t === "SA" ? null : k.startsWith("p") ? 15 : 7,
      netWeight: weight ?? null, grossWeight: weight ? r2(weight * 1.08) : null });
    if (!pa && t !== "SA") await ins("item_suppliers", { itemId: IT[k], partnerId: P[FP(k)], lastPrice: cost, leadDays: k.startsWith("p") ? 15 : 7 });
  }
  for (const [k, b] of Object.entries(BOMS)) {
    let i = 0; for (const [m, q] of b.m) await ins("item_bom", { itemId: IT[k], componentId: IT[m], qty: q, lossPct: m.startsWith("p") || m.startsWith("v") ? 3 : 0, supply: FAB(m) ? "FABRICADO" : "ESTOQUE", position: i++ });
    i = 0; for (const [w, h] of b.r) await ins("item_routing", { itemId: IT[k], workCenterId: C[w], hours: h, position: i++ });
  }
  // etapa da fábrica em que cada material é usado (1 corte, 2 usinagem, 3 montagem, 4 vidraçaria, 5 embalagem)
  const GRP = (m) => (m.startsWith("p") ? 1 : m === "s02" ? 2 : m.startsWith("v") || m === "e3" || m === "e5" ? 4 : m === "m1" || m === "m2" ? 5 : 3);
  const LOCOF = (m) => (m.startsWith("p") ? L.e04 : m.startsWith("v") ? L.e05 : L.e01);

  // ---------- produção: etapas e equipe ----------
  const S = {};
  const STG = [["s1", "A produzir", "#6B7785", "aberta"], ["s2", "Corte", "#C77700", "andamento"], ["s3", "Usinagem", "#8A6D1F", "andamento"], ["s4", "Montagem", "#2F6E9A", "andamento"],
    ["s5", "Envidraçamento", "#1F8A8A", "andamento"], ["s6", "Embalagem e expedição", "#7A4FA0", "andamento"], ["s7", "Concluída", "#2E7D4F", "finalizada"], ["s8", "Cancelada", "#B3261E", "cancelada"]];
  for (const [i, [k, name, color, kind]] of STG.entries()) S[k] = await ins("production_stages", { name, color, position: i + 1, kind });
  const AS = {};
  for (const [k, name, color, pos, kind] of [["a1", "A iniciar", "#6B7785", 1, "aguardando"], ["a2", "Instalando", "#2F6E9A", 2, "andamento"], ["a3", "Pendência na obra", "#B3261E", 3, "pendencia"], ["a4", "Instalado", "#2E7D4F", 4, "concluido"]])
    AS[k] = await ins("assembly_stages", { name, color, position: pos, kind });
  const PE = {};
  for (const [k, name, role, wc, shift] of [["p1", "Francisco Lima", "Encarregado de produção", "c3", "Comercial"], ["p2", "Antônio Bezerra", "Operador de serra", "c1", "Manhã"], ["p3", "Raimundo Nonato", "Operador de usinagem", "c2", "Manhã"],
    ["p4", "José Wellington", "Montador de esquadrias", "c3", "Comercial"], ["p5", "Marcos Dantas", "Vidraceiro", "c4", "Comercial"], ["p6", "Edilson Freitas", "Montador de esquadrias", "c3", "Tarde"], ["p7", "Cláudia Souza", "Conferente de expedição", "c5", "Comercial"],
    ["p8", "Rafael Medeiros", "Instalador", "c6", "Comercial"], ["p9", "Luan Pereira", "Ajudante de instalação", "c6", "Comercial"], ["p10", "Tiago Moura", "Instalador", "c6", "Comercial"], ["p11", "Diego Alves", "Medidor de obras", "c6", "Comercial"]])
    PE[k] = await ins("team_members", { name, role, workCenterId: C[wc], shift });
  const PC = { c1: "p2", c2: "p3", c3: "p4", c4: "p5", c5: "p7" };
  const MEMBER_GRP = { 1: "p2", 2: "p3", 3: "p4", 4: "p5", 5: "p7" };

  // ---------- comercial e financeiro: cadastros ----------
  const PM = {};
  for (const n of ["Boleto", "PIX", "Transferência", "Cartão de crédito", "Cartão de débito", "Dinheiro"]) PM[n] = await ins("payment_methods", { name: n });
  const PT = {};
  for (const [n, days] of [["À vista", [0]], ["28 dias", [28]], ["30 dias", [30]], ["30/60", [30, 60]], ["30/60/90", [30, 60, 90]], ["Entrada + 2x", [0, 30, 60]], ["Entrada + 3x", [0, 30, 60, 90]]]) PT[n] = { id: await ins("payment_terms", { name: n, days }), days };
  const CAT = {};
  for (const n of ["Venda de esquadrias", "Instalação", "Outras receitas"]) CAT[n] = await ins("fin_categories", { name: n, kind: "RECEBER" });
  for (const n of ["Perfis de alumínio", "Vidros", "Acessórios", "Beneficiamento (pintura e anodização)", "Folha de pagamento", "Energia", "Aluguel", "Impostos", "Frete", "Outras despesas"]) CAT[n] = await ins("fin_categories", { name: n, kind: "PAGAR" });
  const BK = await ins("bank_accounts", { name: "Banco do Brasil · conta movimento", bank: "Banco do Brasil", agency: "3795-8", account: "21456-0", initialBalance: 160000, initialDate: D(-120) });
  const BK2 = await ins("bank_accounts", { name: "Caixa da fábrica", bank: "Caixa interno", initialBalance: 2500, initialDate: D(-120) });
  const SIT = {};
  for (const [n, color] of [["Aguardando aprovação", "#C77700"], ["Aprovado para pagamento", "#2E7D4F"], ["Agendado", "#2F6E9A"]]) SIT[n] = await ins("fin_situations", { name: n, color });
  const RSP = await ins("fin_responsibles", { name: "Fernanda Rocha", email: "financeiro@esquadriasmodelo.com.br" });
  await ins("fin_responsibles", { name: "Administrador Demo" });
  const CF = {
    arq: await ins("custom_fields", { entity: "sales_order", label: "Arquiteto / especificador", type: "texto", position: 1 }),
    ent: await ins("custom_fields", { entity: "sales_order", label: "Entrega", type: "lista", options: ["Instalado na obra", "Retira na fábrica", "Entrega sem instalação"], position: 2 }),
    cor: await ins("custom_fields", { entity: "sales_order", label: "Cor do alumínio", type: "lista", options: ["Branco", "Preto fosco", "Anodizado natural", "Bronze"], position: 3 }),
  };
  // campos da medição (o “Peso” entra nos relatórios e no romaneio) e da OP (aparecem no quadro)
  const MF = {
    lar: await ins("custom_fields", { entity: "measurement", label: "Largura (mm)", type: "numero", position: 1, required: true }),
    alt: await ins("custom_fields", { entity: "measurement", label: "Altura (mm)", type: "numero", position: 2, required: true }),
    vid: await ins("custom_fields", { entity: "measurement", label: "Vidro", type: "lista", options: ["Incolor 6 mm", "Fumê 6 mm", "Laminado 8 mm", "Temperado 10 mm", "Temperado 8 mm verde"], position: 3 }),
    lin: await ins("custom_fields", { entity: "measurement", label: "Linha", type: "lista", options: ["Suprema", "Gold", "Linha 25"], position: 4 }),
    pin: await ins("custom_fields", { entity: "measurement", label: "Pintura", type: "lista", options: ["Branco", "Preto fosco", "Anodizado natural", "Bronze"], position: 5 }),
    peso: await ins("custom_fields", { entity: "measurement", label: "Peso (kg)", type: "numero", position: 6 }),
  };
  const OF = {
    tipo: await ins("custom_fields", { entity: "production_order", label: "Tipo", type: "lista", options: ["Janela", "Porta", "Maxim-ar", "Box", "Guarda-corpo", "Fachada"], position: 1, onCard: true }),
    pin: await ins("custom_fields", { entity: "production_order", label: "Pintura", type: "lista", options: ["Branco", "Preto fosco", "Anodizado natural", "Bronze"], position: 2, onCard: true }),
    lin: await ins("custom_fields", { entity: "production_order", label: "Linha", type: "lista", options: ["Suprema", "Gold", "Linha 25"], position: 3, onCard: false }),
  };
  const TIPO = { j2: "Janela", j4: "Janela", mx: "Maxim-ar", pc2: "Porta", pc4: "Porta", pg: "Porta", bx: "Box", gc: "Guarda-corpo", fc: "Fachada" };
  const LINHA = { j2: "Suprema", j4: "Suprema", pc2: "Suprema", pc4: "Suprema", mx: "Linha 25", pg: "Gold" };
  const opCustom = (it, pin) => ({ [OF.tipo]: TIPO[it], ...(pin ? { [OF.pin]: pin } : {}), ...(LINHA[it] ? { [OF.lin]: LINHA[it] } : {}) });

  // perfis de acesso e usuários de exemplo (mesma senha do administrador)
  const all = (v) => ({ dash: v, comercial: v, producao: v, itens: v, estoque: v, compras: v, financeiro: v });
  const PRF = {};
  for (const [k, name, description, perms] of [
    ["com", "Comercial", "Pedidos, clientes e faturamento. Consulta produção e estoque.", { ...all("nenhum"), dash: "ver", comercial: "editar", producao: "ver", estoque: "ver", itens: "ver", custos: false }],
    ["pcp", "PCP e produção", "Medições, OPs, apontamentos, instalações e estoque. Vê custos.", { ...all("nenhum"), dash: "ver", comercial: "ver", producao: "editar", estoque: "editar", itens: "editar", compras: "ver", custos: true }],
    ["alm", "Almoxarifado e compras", "Estoque, inventário, solicitações, cotações e pedidos de compra.", { ...all("nenhum"), dash: "ver", producao: "ver", estoque: "editar", itens: "editar", compras: "editar", custos: false }],
    ["fin", "Financeiro", "Contas a pagar e receber, extrato e relatórios.", { ...all("nenhum"), dash: "ver", comercial: "ver", compras: "ver", financeiro: "editar", custos: false }],
    ["mont", "Instalação em obra", "Acompanha as instalações e aponta horas.", { ...all("nenhum"), producao: "editar", custos: false }],
    ["apont", "Apontador", "Só aponta o que ficou pronto na fábrica e na instalação (celular ou tablet).", { ...all("nenhum"), custos: false, apontador: "ambos" }]]) PRF[k] = await ins("access_profiles", { name, description, permissions: perms });
  await c.query("reset role");
  const domain = email.split("@")[1];
  const U = {};
  for (const [n, e, p] of [["Carlos Andrade", `vendas@${domain}`, PRF.com], ["Francisco Lima", `pcp@${domain}`, PRF.pcp], ["Fernanda Rocha", `financeiro@${domain}`, PRF.fin], ["José Ribeiro", `apontamento@${domain}`, PRF.apont]]) {
    const key = e.split("@")[0];
    const old = await c.query("select id from users where tenant_id = $1 and email = $2", [tid, e]);
    if (old.rows.length) { U[key] = old.rows[0].id; continue; } // e-mail já usado (ex.: administrador): não duplica
    U[key] = newId();
    await c.query("insert into users (id, tenant_id, name, email, password_hash, role, must_change_password, profile_id) values ($1, $2, $3, $4, $5, 'TENANT_USER', false, $6)", [U[key], tid, n, e, hash, p]);
  }
  await c.query("set local role erp_app");

  // ---------- estoque: saldo inicial e consumo semanal ----------
  const mv = (o) => ins("stock_movements", { userName: "Implantação", ...o });
  for (const [k, , , , , , , , cost, loc, q] of I) if (q > 0) await mv({ date: D(-110), type: "ENTRADA", itemId: IT[k], locationId: L[loc], qty: q, unitCost: cost, document: "Saldo inicial", notes: "Implantação do sistema" });
  for (let w = 12; w >= 1; w--) {
    await mv({ date: D(-7 * w + 2), type: "SAIDA", itemId: IT.e3, locationId: L.e01, qty: 6 + (w % 3), unitCost: COST.e3, document: `Requisição ${140 + w}`, notes: "Silicone para obras e reparos", userName: "Almoxarifado" });
    await mv({ date: D(-7 * w + 3), type: "SAIDA", itemId: IT.e6, locationId: L.e01, qty: 60 + 10 * (w % 4), unitCost: COST.e6, document: `Requisição ${150 + w}`, notes: "Fixação nas instalações", userName: "Almoxarifado" });
    if (w % 4 === 0) await mv({ date: D(-7 * w + 4), type: "SAIDA", itemId: IT.u1, locationId: L.e01, qty: 1, unitCost: COST.u1, document: `Requisição ${160 + w}`, notes: "Troca do disco da serra", userName: "Almoxarifado" });
    if (w % 3 === 0) await mv({ date: D(-7 * w + 5), type: "SAIDA", itemId: IT.u3, locationId: L.e01, qty: 3, unitCost: COST.u3, document: `Requisição ${170 + w}`, notes: "EPI da equipe", userName: "Almoxarifado" });
  }
  await mv({ date: D(-4), type: "TRANSFERENCIA", itemId: IT.p04, locationId: L.e04, destLocationId: L.e02, qty: 12, unitCost: COST.p04, document: "Transf. 31", notes: "Perfis separados para a linha", userName: "Almoxarifado" });
  await mv({ date: D(-1), type: "AJUSTE", itemId: IT.a01, locationId: L.e01, qty: -6, unitCost: COST.a01, document: "Inventário", notes: "Contagem cíclica", userName: "Almoxarifado" });
  await mv({ date: D(-12), type: "AJUSTE", itemId: IT.v01, locationId: L.e05, qty: -2.4, unitCost: COST.v01, document: "Quebra", notes: "Vidro quebrado no transporte interno", userName: "Almoxarifado" });

  // ---------- compras: etapas do quadro e campos ----------
  const PS = {};
  for (const [k, name, color, kind, system] of [["RASCUNHO", "Levantamento de material", "#6B7785", "RASCUNHO", true], ["COT", "Em cotação", "#5B4BC4", "RASCUNHO", false],
    ["APR", "Em aprovação / pagamento", "#2F6E9A", "RASCUNHO", false], ["ENVIADO", "Em produção no fornecedor", "#8A5A44", "ENVIADO", true], ["BEN", "Na pintura / anodização", "#C77700", "ENVIADO", false],
    ["TRA", "Transportadora", "#7A4FA0", "ENVIADO", false], ["RECEBIDO", "Entregue", "#2E7D4F", "RECEBIDO", true], ["CANCELADO", "Cancelado", "#B3261E", "CANCELADO", true]])
    PS[k] = await ins("purchase_stages", { name, color, kind, system, position: Object.keys(PS).length + 1 });
  const CFP = {
    trat: await ins("custom_fields", { entity: "purchase_order", label: "Tratamento", type: "lista", options: ["ANODIZADO NATURAL", "ANODIZADO PRETO", "PINTURA BRANCO", "PINTURA PRETO FOSCO", "PINTURA BRONZE"], position: 1, onCard: true }),
    cc: await ins("custom_fields", { entity: "purchase_order", label: "Centro de custo", type: "lista", options: ["Produção", "Obra", "Manutenção"], position: 2, onCard: true }),
    ben: await ins("custom_fields", { entity: "purchase_order", label: "Beneficiadora", type: "texto", position: 3, onCard: false }),
  };
  const CATOF = (k) => (k.startsWith("v") ? CAT.Vidros : k.startsWith("p") ? CAT["Perfis de alumínio"] : CAT["Acessórios"]);
  let pcn = 400;
  async function purchase(fk, lines, dRec, status, extraO = {}) {
    const number = ++pcn;
    const total = r2(lines.reduce((a, [, q, pr]) => a + q * pr, 0));
    const inst = parc(total, [28], dRec);
    const id = await ins("purchase_orders", { number, status, stageId: PS[status], partnerId: P[fk], issueDate: addD(dRec, -10), deliveryDate: dRec, buyer: "Almoxarifado", paymentMethodId: PM.Boleto, paymentTermId: PT["28 dias"].id, installments: inst, total, ...extraO });
    let pos = 0;
    for (const [k, q, pr] of lines) {
      const rec = status === "RECEBIDO" ? q : 0;
      await ins("purchase_order_items", { orderId: id, itemId: IT[k], qty: q, price: pr, receivedQty: rec, position: pos++ });
      if (rec) await mv({ date: dRec, type: "ENTRADA", itemId: IT[k], locationId: LOCOF(k), qty: q, unitCost: pr, document: `NF ${7100 + number}`, notes: `Recebimento do pedido de compra ${number}`, partnerId: P[fk], purchaseOrderId: id, userName: "Almoxarifado" });
    }
    if (status === "RECEBIDO") for (const x of inst) {
      const paid = x.due < TODAY;
      await ins("fin_titles", { kind: "PAGAR", description: `PC ${number} · NF ${7100 + number}`, document: `NF ${7100 + number}`, partnerId: P[fk], categoryId: fk === "f04" || fk === "f05" ? CAT["Beneficiamento (pintura e anodização)"] : CATOF(lines[0][0]), issueDate: dRec, dueDate: x.due, amount: x.value,
        status: paid ? "PAGO" : "ABERTO", paidAt: paid ? x.due : null, paidAmount: paid ? x.value : null, bankAccountId: paid ? BK : null, paymentMethodId: PM.Boleto, installment: "1/1", originType: "PC", originId: id, originNumber: String(number), responsibleId: RSP });
    }
    return id;
  }
  // histórico: reposição de perfis, vidros e acessórios
  await purchase("f01", [["p01", 30, 116], ["p02", 30, 124], ["p04", 40, 102], ["p05", 40, 90]], D(-95), "RECEBIDO");
  await purchase("f02", [["v01", 80, 91], ["v04", 40, 166]], D(-88), "RECEBIDO");
  await purchase("f03", [["a01", 300, 7.7], ["a02", 100, 12.2], ["e1", 1500, 0.84], ["e2", 1500, 1.18]], D(-82), "RECEBIDO");
  await purchase("f01", [["p03", 30, 97], ["p06", 12, 166], ["p07", 20, 85]], D(-70), "RECEBIDO");
  await purchase("f02", [["v03", 40, 194], ["v02", 30, 117]], D(-62), "RECEBIDO");
  await purchase("f03", [["e3", 96, 21.5], ["e4", 6, 63], ["e6", 1000, 0.88]], D(-55), "RECEBIDO");
  await purchase("f01", [["p04", 40, 104], ["p05", 40, 92], ["p01", 20, 118]], D(-41), "RECEBIDO");
  await purchase("f06", [["m1", 12, 39], ["m2", 600, 0.45], ["u1", 3, 289]], D(-35), "RECEBIDO");
  await purchase("f02", [["v01", 60, 92], ["v05", 20, 152]], D(-27), "RECEBIDO");
  await purchase("f03", [["a04", 30, 48], ["a06", 60, 16.5], ["a05", 40, 28]], D(-18), "RECEBIDO");
  await purchase("f01", [["p08", 12, 142], ["p09", 10, 286]], D(-8), "RECEBIDO");
  await purchase("f04", [["p04", 20, 38], ["p05", 20, 34]], D(-15), "RECEBIDO", { notes: "Anodização preta dos perfis da obra Beatriz Menezes", custom: { [CFP.trat]: "ANODIZADO PRETO", [CFP.cc]: "Obra", [CFP.ben]: "Anodiza Nordeste" } });
  // em andamento (quadro de compras)
  await purchase("f01", [["p01", 40, 119], ["p02", 40, 127], ["p03", 30, 98]], D(4), "ENVIADO", { issueDate: D(-8), stageId: PS.ENVIADO, clientId: P.cl02, work: "Edifício Atlântico Prime · Torre A", custom: { [CFP.trat]: "PINTURA BRANCO", [CFP.cc]: "Obra" } });
  await purchase("f05", [["p04", 30, 32], ["p05", 30, 30]], D(3), "ENVIADO", { issueDate: D(-5), stageId: PS.BEN, clientId: P.cl04, work: "Residência Lagoa Nova · projeto Beatriz Menezes", custom: { [CFP.trat]: "PINTURA PRETO FOSCO", [CFP.cc]: "Obra", [CFP.ben]: "Pintura Forte" } });
  await purchase("f04", [["p06", 10, 40]], D(5), "ENVIADO", { issueDate: D(-4), stageId: PS.BEN, clientId: P.cl08, work: "Hotel Praia Dourada · reforma do lobby", custom: { [CFP.trat]: "ANODIZADO NATURAL", [CFP.cc]: "Obra", [CFP.ben]: "Anodiza Nordeste" } });
  await purchase("f02", [["v03", 60, 198], ["v04", 30, 168]], D(1), "ENVIADO", { issueDate: D(-7), stageId: PS.TRA, clientId: P.cl02, work: "Edifício Atlântico Prime · Torre A", custom: { [CFP.cc]: "Obra" } });
  await purchase("f03", [["a01", 400, 7.8], ["a03", 120, 6.9], ["e1", 1000, 0.85]], D(10), "RASCUNHO", { issueDate: D(-1), stageId: PS.COT, custom: { [CFP.cc]: "Produção" } });
  await purchase("f06", [["m1", 10, 39], ["m2", 500, 0.45]], D(6), "RASCUNHO", { issueDate: TODAY, stageId: PS.APR, custom: { [CFP.cc]: "Produção" } });
  await purchase("f03", [["a07", 10, 145]], D(-1), "ENVIADO", { issueDate: D(-12), stageId: PS.ENVIADO, clientId: P.cl08, work: "Hotel Praia Dourada · banheiros", custom: { [CFP.cc]: "Obra" } });

  // ---------- etapas do pedido de venda e locais ----------
  const SS = {};
  for (const [k, name, color, kind, system, position] of [["PROPOSTA", "Orçamento enviado", "#6B7785", "PROPOSTA", true, 1], ["NEGOC", "Em negociação", "#7A4FA0", "PROPOSTA", false, 2],
    ["APROVADO", "Aprovado", "#E0601A", "APROVADO", true, 3], ["FATURADO", "Faturado", "#2E7D4F", "FATURADO", true, 4], ["ENTREGUE", "Instalado", "#1F8A8A", "FATURADO", false, 5], ["CANCELADO", "Cancelado", "#B3261E", "CANCELADO", true, 6]])
    SS[k] = await ins("sales_stages", { name, color, kind, system, position });
  const PLACES = {
    prime: "Edifício Atlântico Prime · Torre A", jard: "Residencial Jardins do Lago · Bloco B", clin: "Clínica Bem Viver · reforma", hotel: "Hotel Praia Dourada · reforma do lobby",
    lagoa: "Residência Lagoa Nova · projeto Beatriz Menezes", pnegra: "Residencial Ponta Negra · Torre B", cot: "Casa Ricardo · Cotovelo", jul: "Apartamento 702 · Ponta Negra",
  };
  await ins("delivery_places", { name: PLACES.prime, address: "Av. Prudente de Morais, 5100 · Lagoa Nova · Natal/RN", partnerId: P.cl02 });
  await ins("delivery_places", { name: PLACES.jard, address: "Rua das Garças, 300 · Parnamirim/RN", partnerId: P.cl03 });
  await ins("delivery_places", { name: PLACES.clin, address: "Rua Apodi, 410 · Cidade Alta · Natal/RN", partnerId: P.cl05 });
  await ins("delivery_places", { name: PLACES.hotel, address: "Via Costeira, 2500 · Natal/RN", partnerId: P.cl08 });
  await ins("delivery_places", { name: PLACES.pnegra, address: "Av. Eng. Roberto Freire, 3000 · Natal/RN", partnerId: P.cl01 });

  // ---------- vendas, OPs, apontamentos e faturamento ----------
  let pv = 500, opn = 200, nf = 3100, asmN = 40;
  const conds = [["Entrada + 3x", "PIX"], ["30/60/90", "Boleto"], ["Entrada + 2x", "Transferência"], ["30/60", "Boleto"]];
  const spOf = (cli) => (["cl04", "cl06", "cl07"].includes(cli) ? ["marina", "Marina Souza"] : ["carlos", "Carlos Andrade"]);
  async function order({ cli, lines, status, prod, issue, delivery, k = 0, place, stage, assembly = true, cor = "Branco", arq = null }) {
    const number = ++pv;
    const total = r2(lines.reduce((a, [, q, pr, d = 0]) => a + q * pr * (1 - d / 100), 0));
    const [cn, pmn] = conds[k % 4];
    const [spk, spn] = spOf(cli);
    const id = await ins("sales_orders", { number, status, stageId: SS[stage ?? status], hasAssembly: assembly, productionStatus: prod, partnerId: P[cli], salespersonId: SP[spk], salespersonName: spn, issueDate: issue, deliveryDate: delivery,
      deliveryPlace: place ?? (assembly ? null : "Retira na fábrica"), paymentMethodId: PM[pmn], paymentTermId: PT[cn].id, installments: parc(total, PT[cn].days, issue), total, approvedAt: status === "PROPOSTA" ? null : issue,
      custom: { [CF.ent]: assembly ? "Instalado na obra" : "Retira na fábrica", [CF.cor]: cor, ...(arq ? { [CF.arq]: arq } : {}) } });
    let pos = 0;
    for (const [it, q, pr, d = 0] of lines) await ins("sales_order_items", { orderId: id, itemId: IT[it], qty: q, price: pr, discountPct: d, position: pos++ });
    return { id, number, total, terms: PT[cn].days, pm: PM[pmn] };
  }
  const order_ = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];
  const rep = (o) => ins("production_reports", { userName: "Produção", ...o });
  async function op({ so, cli, it, qty, stage, need, start, resp, wc, prio = "Normal", produced = 0, completed = null, created, work = null, pin = "Branco", measurementId = null }) {
    const number = ++opn;
    const id = await ins("production_orders", { number, itemId: IT[it], qty, qtyProduced: produced, salesOrderId: so ?? null, partnerId: cli ? P[cli] : null, stageId: S[stage], workCenterId: C[wc], responsibleId: PE[resp], priority: prio,
      startDate: start, needDate: need, completedAt: completed, createdAt: new Date(created + "T10:00:00Z"), work, measurementId, custom: opCustom(it, pin), notes: work ? `Obra: ${work}` : null });
    const lvl = order_.indexOf(stage);
    let pos = 0;
    for (const [m, q] of BOMS[it].m) {
      const req = r2(q * qty * (m.startsWith("p") || m.startsWith("v") ? 1.03 : 1));
      const grp = GRP(m);
      const done = lvl >= 6 || grp < lvl ? req : grp === lvl ? r2(Math.floor(req / 2)) : 0;
      const cid = await ins("production_order_components", { productionOrderId: id, itemId: IT[m], qtyRequired: req, qtyDone: done, supply: FAB(m) ? "FABRICADO" : "ESTOQUE", fromBom: true, position: pos++ });
      if (FAB(m) && done > 0) await rep({ kind: "FABRICA", date: minD(addD(start, grp * 2), TODAY), productionOrderId: id, componentId: cid, itemId: IT[m], description: NAME[m], qty: done, memberId: PE[MEMBER_GRP[grp]] });
      if (!FAB(m) && lvl > 0 && lvl < 6 && grp <= Math.max(lvl, 1))
        await mv({ date: minD(addD(start, grp * 2), TODAY), type: "SAIDA", itemId: IT[m], locationId: LOCOF(m), qty: req, unitCost: COST[m], document: `OP ${number}`, notes: "Requisição pela estrutura da OP", productionOrderId: id, userName: "Almoxarifado" });
    }
    // horas apontadas nas etapas já passadas (e metade da etapa atual)
    const MAPA = { s2: "c1", s3: "c2", s4: "c3", s5: "c4", s6: "c5" };
    let dia = 0;
    for (const sk of ["s2", "s3", "s4", "s5", "s6"].slice(0, Math.max(0, Math.min(lvl, 5)))) {
      const w = MAPA[sk]; const r = BOMS[it].r.find(([x]) => x === w); if (!r) continue;
      let h = Math.round(r[1] * qty * (sk === stage ? 0.5 : 0.95) * 2) / 2;
      while (h > 0) { const x = Math.min(8, h); h -= x; const d = addD(start, ++dia); if (d > TODAY) break;
        await ins("time_entries", { productionOrderId: id, stageId: S[sk], workCenterId: C[w], memberId: PE[PC[w]], date: d, start: "07:00", end: `${String(7 + Math.floor(x) + (x > 4 ? 1 : 0)).padStart(2, "0")}:${x % 1 ? "30" : "00"}`, breakMinutes: x > 4 ? 60 : 0, hours: x }); }
    }
    if (produced > 0) {
      const d = completed ?? D(-1);
      const outId = await ins("production_outputs", { productionOrderId: id, date: d, qty: produced, locationId: L.e03, userName: "Produção", notes: "Apontamento de finalização" });
      const mvId = await mv({ date: d, type: "PRODUCAO", itemId: IT[it], locationId: L.e03, qty: produced, unitCost: unitCost(it), document: `OP ${number}`, notes: "Entrada de produção", productionOrderId: id, userName: "Produção" });
      await rep({ kind: "FABRICA", date: d, productionOrderId: id, itemId: IT[it], description: NAME[it], qty: produced, memberId: PE.p7, outputId: outId, movementId: mvId });
    }
    return { id, number, it, qty, produced };
  }
  async function invoice(o, cli, lines, date) {
    const number = ++nf;
    const id = await ins("invoices", { number, series: "1", issueDate: date, partnerId: P[cli], salesOrderId: o.id, total: o.total, status: "EMITIDA", stockOut: true, locationId: L.e03 });
    for (const [it, q, pr, dsc = 0] of lines) {
      await ins("invoice_items", { invoiceId: id, itemId: IT[it], qty: q, price: pr, discountPct: dsc });
      await mv({ date, type: "SAIDA", itemId: IT[it], locationId: L.e03, qty: q, unitCost: unitCost(it), document: `NF ${number}`, notes: `Faturamento do pedido ${o.number}`, partnerId: P[cli], invoiceId: id, userName: "Expedição" });
    }
    const ps = parc(o.total, o.terms, date);
    for (const x of ps) {
      const late = cli === "cl03" && x.due < TODAY && x.due >= D(-40);
      const paid = x.due < TODAY && !late;
      await ins("fin_titles", { kind: "RECEBER", description: `NF ${number} · Pedido ${o.number}`, document: `NF ${number}`, partnerId: P[cli], categoryId: CAT["Venda de esquadrias"], issueDate: date, dueDate: x.due, amount: x.value,
        status: paid ? "PAGO" : "ABERTO", paidAt: paid ? x.due : null, paidAmount: paid ? x.value : null, bankAccountId: paid ? BK : null, paymentMethodId: o.pm, installment: `${x.n}/${ps.length}`, originType: "NF", originId: id, originNumber: String(number), responsibleId: late ? RSP : null, situationId: late ? SIT["Aguardando aprovação"] : null });
    }
    await c.query("update sales_orders set installments = $1 where id = $2", [JSON.stringify(ps), o.id]);
  }
  // montagem (instalação) com árvore de locais; peças montadas viram apontamentos de montagem
  async function asm({ op: o, name, cli, address, resp, start, due, completed = null, notes = null, qty = 1, locs }) {
    const id = await ins("assemblies", { number: ++asmN, name, productionOrderId: o.id, qty, partnerId: P[cli], address, responsibleId: PE[resp], startDate: start, dueDate: due, completedAt: completed, notes });
    let pos = 0;
    const parts = [];
    const add = async (parentId, [lname, type, stage, inst, help, ps, kids]) => {
      const lid = await ins("assembly_locations", { assemblyId: id, parentId, name: lname, type, stageId: stage ? AS[stage] : null, installerId: inst ? PE[inst] : null, helperId: help ? PE[help] : null, position: pos++ });
      for (const [it, desc, q, done, mi = null] of ps ?? []) {
        const pid = await ins("assembly_parts", { assemblyId: id, locationId: lid, itemId: it ? IT[it] : null, description: it ? null : desc, qty: q, qtyDone: done, measurementItemId: mi });
        parts.push({ pid, q });
        if (done > 0) await rep({ kind: "MONTAGEM", date: minD(addD(start, 2 + (pos % 5)), completed ?? TODAY), productionOrderId: o.id, assemblyId: id, assemblyPartId: pid, itemId: it ? IT[it] : null, description: it ? NAME[it] : desc, qty: done, memberId: inst ? PE[inst] : PE.p8, userName: "Instalação" });
      }
      for (const k of kids ?? []) await add(lid, k);
    };
    for (const l of locs) await add(null, l);
    return { id, parts };
  }

  // histórico: obras produzidas, instaladas e faturadas
  const hist = [["cl01", "j4", 6, -86, "Branco"], ["cl06", "pc4", 1, -80, "Preto fosco"], ["cl08", "pg", 4, -74, "Anodizado natural"], ["cl07", "bx", 2, -68, "Branco"], ["cl04", "gc", 14, -60, "Preto fosco"],
    ["cl02", "j2", 10, -52, "Branco"], ["cl09", "mx", 12, -45, "Branco"], ["cl05", "pc2", 2, -38, "Branco"], ["cl01", "j2", 8, -30, "Branco"], ["cl08", "fc", 36, -22, "Anodizado natural"], ["cl06", "j2", 3, -15, "Preto fosco"], ["cl04", "pg", 2, -9, "Preto fosco"]];
  const histOps = [];
  const HW = { cl01: PLACES.pnegra, cl02: "Edifício Atlântico Mar", cl04: "Residência Candelária · projeto Beatriz Menezes", cl05: "Clínica Bem Viver · sede", cl06: PLACES.cot, cl07: PLACES.jul, cl08: PLACES.hotel };
  for (const [k, [cli, it, qty, conc, cor]] of hist.entries()) {
    const lines = [[it, qty, price(it), k % 3 === 0 ? 3 : 0]];
    if (k % 4 === 1) lines.push(["e3", 4, 39.9]);
    const inst = cli !== "cl09";
    const o = await order({ cli, lines, status: "FATURADO", stage: conc < -20 ? "ENTREGUE" : "FATURADO", prod: "PRODUZIDO", issue: D(conc - 30), delivery: D(conc + 5), k, assembly: inst, cor,
      place: HW[cli] ?? null, arq: cli === "cl04" ? "Beatriz Menezes" : null });
    histOps.push({ ...(await op({ so: o.id, cli, it, qty, stage: "s7", need: D(conc + 1 - (k % 3 === 0 ? 3 : 0)), start: D(conc - 20), resp: "p1", wc: "c3", produced: qty, completed: D(conc), created: D(conc - 26), pin: cor,
      work: HW[cli] ?? null })), cli, conc, qty, inst });
    await invoice(o, cli, lines, D(Math.min(conc + 3, -1)));
  }

  // em produção (pedidos aprovados com OP em várias etapas)
  const live = [["cl02", "pc2", 4, "s1", 18, "p1", "c3", "Normal", "Branco", PLACES.prime], ["cl01", "j4", 8, "s4", 4, "p4", "c3", "Alta", "Branco", PLACES.pnegra], ["cl06", "mx", 3, "s2", 9, "p2", "c1", "Normal", "Preto fosco", PLACES.cot],
    ["cl04", "pg", 3, "s3", 12, "p3", "c2", "Normal", "Preto fosco", PLACES.lagoa], ["cl07", "bx", 1, "s5", -2, "p5", "c4", "Urgente", "Branco", PLACES.jul], ["cl08", "fc", 24, "s6", -1, "p7", "c5", "Alta", "Anodizado natural", PLACES.hotel],
    ["cl04", "gc", 9, "s4", 6, "p6", "c3", "Normal", "Preto fosco", PLACES.lagoa], ["cl08", "pg", 2, "s5", 3, "p5", "c4", "Alta", "Anodizado natural", PLACES.hotel], ["cl03", "j2", 6, "s2", 14, "p2", "c1", "Normal", "Branco", PLACES.jard],
    ["cl09", "j2", 10, "s1", 20, "p1", "c1", "Baixa", "Branco", null]];
  const liveOps = [];
  for (const [k, [cli, it, qty, st, need, resp, wc, prio, cor, place]] of live.entries()) {
    const produced = st === "s6" ? Math.floor(qty / 2) : 0;
    const o = await order({ cli, lines: [[it, qty, price(it)]], status: "APROVADO", prod: "EM_PRODUCAO", assembly: cli !== "cl09", issue: D(Math.min(need - 25, -6)), delivery: D(need), k, place, cor, arq: cli === "cl04" ? "Beatriz Menezes" : null });
    liveOps.push({ ...(await op({ so: o.id, cli, it, qty, stage: st, need: D(need), start: D(Math.min(need - 18, -4)), resp, wc, prio, produced, created: D(Math.min(need - 25, -6)), work: place, pin: cor })), cli, place });
  }
  for (const [i, sk, w, pk] of [[1, "s4", "c3", "p4"], [6, "s4", "c3", "p6"], [4, "s5", "c4", "p5"]])
    await ins("time_entries", { productionOrderId: liveOps[i].id, stageId: S[sk], workCenterId: C[w], memberId: PE[pk], date: TODAY, start: "07:00", end: null, breakMinutes: 0, hours: 0, notes: "Em andamento" });

  // aprovados aguardando a decisão da produção, venda sem produção e orçamentos
  await order({ cli: "cl05", lines: [["j2", 3, price("j2")], ["pc2", 1, price("pc2")]], status: "APROVADO", prod: "PENDENTE", issue: D(-2), delivery: D(30), k: 0, place: PLACES.clin });
  await order({ cli: "cl03", lines: [["gc", 18, price("gc")]], status: "APROVADO", prod: "PENDENTE", issue: D(-1), delivery: D(28), k: 1, place: PLACES.jard });
  await order({ cli: "cl09", lines: [["v04", 12, r2(COST.v04 * 1.7)], ["a01", 80, r2(COST.a01 * 1.9)], ["e3", 24, 39.9]], status: "APROVADO", prod: "NAO_NECESSITA", issue: D(-3), delivery: D(2), k: 2, assembly: false });
  const prop1 = await order({ cli: "cl02", lines: [["j2", 48, price("j2"), 5], ["pc4", 24, price("pc4"), 5], ["mx", 24, price("mx"), 5]], status: "PROPOSTA", stage: "NEGOC", prod: null, issue: D(-3), delivery: D(75), k: 1, place: "Edifício Atlântico Prime · Torre B" });
  await order({ cli: "cl04", lines: [["fc", 60, price("fc")], ["gc", 22, price("gc")]], status: "PROPOSTA", prod: null, issue: D(-12), delivery: D(60), k: 3, cor: "Preto fosco", arq: "Beatriz Menezes", place: "Loja conceito · Av. Hermes da Fonseca" });
  await order({ cli: "cl07", lines: [["bx", 2, price("bx")], ["j2", 2, price("j2")]], status: "PROPOSTA", prod: null, issue: D(-1), delivery: D(30), k: 0, place: PLACES.jul });

  // ---------- medições de obra ----------
  const kgOf = (lar, alt, it) => r2(((lar * alt) / 1e6) * (it.startsWith("pc") || it === "pg" ? 9 : 8) + 2);
  async function meas(number, cli, work, address, status, due, rows, so = null, date = D(-6)) {
    const id = await ins("measurements", { number, partnerId: P[cli], salesOrderId: so, work, address, date, dueDate: due, measurerId: PE.p11, status });
    const out = [];
    let pos = 0;
    for (const [floor, loc, it, lar, alt, vid, pin, measured] of rows) {
      const lid = await ins("measurement_items", { measurementId: id, floor, location: loc, itemId: IT[it], qty: 1, measured, position: pos++,
        custom: measured ? { [MF.lar]: String(lar), [MF.alt]: String(alt), [MF.vid]: vid, [MF.lin]: LINHA[it] ?? "Suprema", [MF.pin]: pin, [MF.peso]: String(kgOf(lar, alt, it)) } : {} });
      out.push({ lid, floor, loc, it });
    }
    return { id, lines: out };
  }
  // 1) em medição: parte dos locais ainda sem medida
  const jard = [];
  for (const fl of ["Térreo", "1º andar", "2º andar"]) {
    for (const n of [1, 2, 3]) jard.push([fl, `Janela ${n}`, "j2", 1500, 1200, "Incolor 6 mm", "Branco", fl !== "2º andar"]);
    jard.push([fl, "Janela do banheiro", "mx", 600, 600, "Fumê 6 mm", "Branco", fl === "Térreo"]);
    jard.push([fl, "Porta da sacada", "pc2", 1600, 2100, "Temperado 10 mm", "Branco", fl === "Térreo"]);
  }
  await meas(1, "cl03", PLACES.jard, "Rua das Garças, 300 · Parnamirim/RN", "MEDINDO", D(40), jard);
  // 2) liberada, pronta para gerar as OPs
  await meas(2, "cl05", PLACES.clin, "Rua Apodi, 410 · Cidade Alta · Natal/RN", "LIBERADA", D(25), [
    ["Térreo", "Recepção · Janela 1", "j4", 2000, 1200, "Laminado 8 mm", "Branco", true], ["Térreo", "Recepção · Janela 2", "j4", 2000, 1200, "Laminado 8 mm", "Branco", true],
    ["Térreo", "Consultório 1", "j2", 1500, 1200, "Incolor 6 mm", "Branco", true], ["Térreo", "Consultório 2", "j2", 1500, 1200, "Incolor 6 mm", "Branco", true],
    ["Térreo", "Banheiro PNE", "mx", 600, 600, "Fumê 6 mm", "Branco", true], ["Térreo", "Porta de entrada", "pc2", 1600, 2100, "Temperado 10 mm", "Branco", true]]);
  // 3) em produção: medição → OPs → instalação com romaneio
  const primeSo = await order({ cli: "cl02", lines: [["j2", 6, price("j2")], ["pc4", 3, price("pc4")]], status: "APROVADO", prod: "EM_PRODUCAO", issue: D(-30), delivery: D(12), k: 3, place: PLACES.prime });
  const primeRows = [];
  for (const fl of ["1º andar", "2º andar", "3º andar"]) {
    primeRows.push([fl, "Apto 01 · Quarto", "j2", 1500, 1200, "Incolor 6 mm", "Branco", true], [fl, "Apto 02 · Quarto", "j2", 1500, 1200, "Incolor 6 mm", "Branco", true], [fl, "Apto 01 · Sala", "pc4", 2400, 2100, "Temperado 10 mm", "Branco", true]);
  }
  const prime = await meas(3, "cl02", PLACES.prime, "Av. Prudente de Morais, 5100 · Lagoa Nova · Natal/RN", "LIBERADA", D(12), primeRows, primeSo.id, D(-26));
  const opJ = await op({ so: primeSo.id, cli: "cl02", it: "j2", qty: 6, stage: "s6", need: D(5), start: D(-20), resp: "p7", wc: "c5", prio: "Alta", produced: 4, created: D(-22), work: PLACES.prime, measurementId: prime.id });
  const opP = await op({ so: primeSo.id, cli: "cl02", it: "pc4", qty: 3, stage: "s4", need: D(10), start: D(-12), resp: "p4", wc: "c3", created: D(-22), work: PLACES.prime, measurementId: prime.id });
  for (const l of prime.lines) await c.query("update measurement_items set production_order_id = $1 where id = $2", [l.it === "j2" ? opJ.id : opP.id, l.lid]);
  const jl = prime.lines.filter((l) => l.it === "j2").slice(0, 4);
  const floorsJ = [...new Set(jl.map((l) => l.floor))];
  const primeAsm = await asm({ op: opJ, name: `${PLACES.prime} · Janelas`, cli: "cl02", address: "Av. Prudente de Morais, 5100 · Natal/RN", resp: "p8", start: D(-3), due: D(8), qty: 4,
    locs: floorsJ.map((fl) => [fl, "Andar", null, null, null, [], jl.filter((l) => l.floor === fl).map((l, i) => [l.loc, "Ambiente", fl === "1º andar" ? "a4" : i === 0 ? "a2" : "a1", "p8", "p9", [["j2", "", 1, fl === "1º andar" ? 1 : 0, l.lid]]])]) });
  const shId = await ins("shipments", { number: 1, assemblyId: primeAsm.id, date: D(-3), vehicle: "Caminhão baú · QGH-4D21", driver: "Valdir Santos", notes: "Janelas embaladas com cantoneiras. Descarregar no 1º andar.", userName: "Cláudia Souza" });
  for (const p of primeAsm.parts) await ins("shipment_items", { shipmentId: shId, partId: p.pid, qty: p.q });

  // ---------- instalações (montagens) das obras do histórico e das OPs prontas ----------
  const hop = (cli, it) => histOps.find((o) => o.cli === cli && o.it === it);
  // instalada: Construtora Ponta Negra, janelas de 4 folhas
  await asm({ op: hop("cl01", "j4"), name: `${PLACES.pnegra} · Janelas 4 folhas`, cli: "cl01", address: "Av. Eng. Roberto Freire, 3000 · Natal/RN", resp: "p8", start: D(-84), due: D(-76), completed: D(-77), qty: 6,
    locs: [["1º andar", "Andar", null, null, null, [], [["Apto 101 · Sala", "Ambiente", "a4", "p8", "p9", [["j4", "", 1, 1]]], ["Apto 102 · Sala", "Ambiente", "a4", "p8", "p9", [["j4", "", 1, 1]]], ["Apto 103 · Sala", "Ambiente", "a4", "p10", "p9", [["j4", "", 1, 1]]]]],
      ["2º andar", "Andar", null, null, null, [], [["Apto 201 · Sala", "Ambiente", "a4", "p8", "p9", [["j4", "", 1, 1]]], ["Apto 202 · Sala", "Ambiente", "a4", "p10", "p9", [["j4", "", 1, 1]]], ["Apto 203 · Sala", "Ambiente", "a4", "p10", "p9", [["j4", "", 1, 1]]]]]] });
  // com pendência: Hotel Praia Dourada, fachada (vidro trincado aguardando reposição)
  await asm({ op: hop("cl08", "fc"), name: `${PLACES.hotel} · Fachada pele de vidro`, cli: "cl08", address: "Via Costeira, 2500 · Natal/RN", resp: "p10", start: D(-20), due: D(-4), qty: 36,
    notes: "Um módulo com vidro trincado na descarga: reposição pedida à Temperados Potiguar.",
    locs: [["Lobby", "Pavimento", null, null, null, [], [["Fachada frontal", "Ambiente", "a3", "p10", "p9", [["fc", "", 24, 20]]], ["Fachada lateral", "Ambiente", "a4", "p8", "p9", [["fc", "", 12, 12]]]]]] });
  // em andamento: Ricardo, janelas preto fosco
  await asm({ op: hop("cl06", "j2"), name: `${PLACES.cot} · Janelas`, cli: "cl06", address: "Rua dos Cajueiros, 88 · Cotovelo/RN", resp: "p8", start: D(-10), due: D(2), qty: 3,
    locs: [["Térreo", "Pavimento", null, null, null, [], [["Quarto casal", "Ambiente", "a4", "p8", "p9", [["j2", "", 1, 1], [null, "Arremate com silicone e baguete", 1, 1]]], ["Quarto 2", "Ambiente", "a2", "p8", "p9", [["j2", "", 1, 0]]], ["Escritório", "Ambiente", "a1", null, null, [["j2", "", 1, 0]]]]]] });
  // instalada: arquiteta, guarda-corpo
  await asm({ op: hop("cl04", "gc"), name: "Residência Candelária · Guarda-corpo da escada e varanda", cli: "cl04", address: "Rua Candelária, 77 · Natal/RN", resp: "p10", start: D(-58), due: D(-50), completed: D(-51), qty: 14,
    locs: [["Escada", "Ambiente", "a4", "p10", "p9", [["gc", "", 6, 6]]], ["Varanda", "Ambiente", "a4", "p10", "p9", [["gc", "", 8, 8]]]] });
  // demais obras do histórico: instaladas e concluídas
  const withAsm = new Set((await c.query("select production_order_id from assemblies")).rows.map((r) => r.production_order_id));
  for (const h of histOps.filter((x) => x.inst && !withAsm.has(x.id)))
    await asm({ op: h, name: `${HW[h.cli] ?? "Obra"} · ${NAME[h.it].toLowerCase()}`, cli: h.cli, address: null, resp: "p10", start: D(h.conc + 1), due: D(h.conc + 6), completed: D(h.conc + 5), qty: h.qty,
      locs: [["Obra", "Ambiente", "a4", h.conc % 2 ? "p8" : "p10", "p9", [[h.it, "", h.qty, h.qty]]]] });
  // pronta para instalar: metade da fachada do hotel (OP em embalagem)
  const fcLive = liveOps.find((o) => o.it === "fc");
  if (fcLive?.produced) await asm({ op: fcLive, name: `${PLACES.hotel} · Fachada do restaurante`, cli: "cl08", address: "Via Costeira, 2500 · Natal/RN", resp: "p8", start: TODAY, due: D(6), qty: fcLive.produced,
    locs: [["Restaurante", "Pavimento", "a1", "p8", "p9", [["fc", "", fcLive.produced, 0]]]] });

  // ---------- compras: solicitações e cotação ----------
  const r1 = await ins("purchase_requests", { number: 1, requester: "Francisco Lima", department: "Produção", needDate: D(8), status: "APROVADA", notes: "Perfis para as OPs da próxima semana" });
  await ins("purchase_request_items", { requestId: r1, itemId: IT.p04, qty: 40 });
  await ins("purchase_request_items", { requestId: r1, itemId: IT.p05, qty: 40 });
  const r2b = await ins("purchase_requests", { number: 2, requester: "Almoxarifado", department: "Almoxarifado", needDate: D(15), status: "ABERTA" });
  await ins("purchase_request_items", { requestId: r2b, itemId: IT.u1, qty: 2, notes: "Disco da serra dupla" });
  await ins("purchase_request_items", { requestId: r2b, itemId: IT.u3, qty: 20 });
  const r3 = await ins("purchase_requests", { number: 3, requester: "Marcos Dantas", department: "Vidraçaria", needDate: D(6), status: "EM_COTACAO" });
  await ins("purchase_request_items", { requestId: r3, itemId: IT.v03, qty: 40 });
  await ins("purchase_request_items", { requestId: r3, itemId: IT.v05, qty: 20 });
  const q = await ins("quotations", { number: 1, date: D(-2), dueDate: D(3), status: "ABERTA", requestIds: [r3], notes: "Solicitação 3 · vidros da obra Jardins do Lago" });
  const qi1 = await ins("quotation_items", { quotationId: q, itemId: IT.v03, qty: 40, position: 0 });
  const qi2 = await ins("quotation_items", { quotationId: q, itemId: IT.v05, qty: 20, position: 1 });
  const qs1 = await ins("quotation_suppliers", { quotationId: q, partnerId: P.f02, freight: 0, paymentTerms: "28 dias", deliveryDays: 5 });
  const qs2 = await ins("quotation_suppliers", { quotationId: q, partnerId: P.cl09, freight: 180, paymentTerms: "30/60", deliveryDays: 8 });
  await ins("quotation_prices", { quotationId: q, quotationItemId: qi1, quotationSupplierId: qs1, unitPrice: 196 });
  await ins("quotation_prices", { quotationId: q, quotationItemId: qi1, quotationSupplierId: qs2, unitPrice: 189.5 });
  await ins("quotation_prices", { quotationId: q, quotationItemId: qi2, quotationSupplierId: qs1, unitPrice: 152 });
  await ins("quotation_prices", { quotationId: q, quotationItemId: qi2, quotationSupplierId: qs2, unitPrice: 158 });

  // ---------- despesas fixas ----------
  for (const mo of [-3, -2, -1, 0, 1]) for (const [d, day, v, cat] of [["Folha de pagamento", 5, 48500, "Folha de pagamento"], ["Energia elétrica", 10, 7200 + mo * 150, "Energia"], ["Aluguel do galpão", 15, 11000, "Aluguel"], ["Impostos (DAS)", 20, 14800 + mo * 350, "Impostos"]]) {
    const venc = M(mo, day); const paid = venc < TODAY;
    await ins("fin_titles", { kind: "PAGAR", description: d, categoryId: CAT[cat], issueDate: M(mo, 1), dueDate: venc, amount: v, status: paid ? "PAGO" : "ABERTO", paidAt: paid ? venc : null, paidAmount: paid ? v : null,
      bankAccountId: paid ? BK : null, paymentMethodId: PM["Transferência"], installment: "1/1", originType: "MANUAL", responsibleId: RSP, situationId: !paid && mo === 0 ? SIT.Agendado : null });
  }
  await ins("bank_entries", { bankAccountId: BK, date: D(-10), description: "Tarifa de manutenção de conta", amount: -89.9 });
  await ins("bank_entries", { bankAccountId: BK, date: D(-30), description: "Transferência para o caixa", amount: -2000 });
  await ins("bank_entries", { bankAccountId: BK2, date: D(-30), description: "Transferência do banco", amount: 2000 });

  // ---------- comunicação ----------
  const at = (d, h) => new Date(`${D(d)}T${h}:00-03:00`);
  for (const [uid, name, body, d, h] of [[adminId, "Administrador Demo", "Bom dia, pessoal! Avisos e tarefas da fábrica e das obras ficam por aqui.", -1, "08:05"],
    [U.pcp, "Francisco Lima", "As janelas do Atlântico Prime saem amanhã cedo; romaneio já impresso.", -1, "16:40"],
    [U.vendas, "Carlos Andrade", "A Clínica Bem Viver aprovou a medição. Podemos gerar as OPs?", 0, "08:20"]])
    if (uid) await ins("messages", { channel: "geral", userId: uid, userName: name, body, createdAt: at(d, h) });
  if (U.vendas) await ins("tasks", { title: "Fechar a negociação do Atlântico Prime · Torre B", notes: "Conferir prazo de instalação e o desconto de 5% antes de aprovar.", assigneeId: U.vendas, assigneeName: "Carlos Andrade",
    creatorId: adminId, creatorName: "Administrador Demo", dueDate: D(2), priority: "Alta", link: `/pedidos/${prop1.id}`, linkLabel: `Pedido ${prop1.number}` });
  if (U.financeiro) await ins("tasks", { title: "Cobrar parcela em atraso do Jardins do Lago", assigneeId: U.financeiro, assigneeName: "Fernanda Rocha", creatorId: adminId, creatorName: "Administrador Demo", dueDate: D(1), priority: "Normal" });
  await ins("tasks", { title: "Agendar a medição do Bloco B (2º andar)", assigneeId: adminId, assigneeName: "Administrador Demo", creatorId: U.pcp ?? adminId, creatorName: "Francisco Lima", dueDate: D(0), priority: "Normal", link: "/medicoes", linkLabel: "Medições" });
  await ins("notifications", { userId: adminId, kind: "tarefa", title: "Nova tarefa: Agendar a medição do Bloco B (2º andar)", fromName: "Francisco Lima", link: "/comunicacao?aba=tarefas" });
  await ins("notifications", { userId: adminId, kind: "aviso", title: "Vidro trincado na fachada do Hotel Praia Dourada", body: "Reposição pedida; instalação do módulo fica pendente.", fromName: "Tiago Moura", link: "/montagens" });

  // ---------- numeração ----------
  for (const [key, table] of [["sales_order", "sales_orders"], ["production_order", "production_orders"], ["purchase_order", "purchase_orders"], ["assembly", "assemblies"], ["purchase_request", "purchase_requests"],
    ["quotation", "quotations"], ["measurement", "measurements"], ["shipment", "shipments"]])
    await c.query(`insert into sequences (tenant_id, key, value) select $1, $2, coalesce(max(number), 0) from ${table}`, [tid, key]);

  await c.query("commit");
  console.log(`Empresa de demonstração (esquadrias) pronta: ${slug}.${process.env.ROOT_DOMAIN ?? "SEU_DOMINIO"}`);
  const admin = (await c.query("select email from users where id = $1", [adminId])).rows[0]?.email ?? email;
  console.log(`Administrador: ${admin}  ${passGiven || !ex.rows.length ? `Senha: ${pass}` : "(senha mantida)"}`);
  console.log(`Outros usuários, senha ${pass}: vendas@${domain}, pcp@${domain}, financeiro@${domain}, apontamento@${domain}`);
} catch (err) {
  await c.query("rollback").catch(() => {});
  console.error("Falha ao criar a demonstração:", err.message);
  process.exitCode = 1;
} finally {
  c.release();
  await db.end();
}
