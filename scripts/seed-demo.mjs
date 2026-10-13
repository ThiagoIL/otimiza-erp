// Cria a empresa de demonstração "demo" com dados de exemplo em todos os módulos
// (clientes, itens com estrutura, estoque, CRM, pedidos, OPs, montagens, compras e financeiro).
// Uso: DEMO_ADMIN_PASSWORD='DemoFabrica2026' node scripts/seed-demo.mjs   (sem a variável, gera uma senha)
// Opcional: DEMO_SLUG (padrão demo), DEMO_ADMIN_EMAIL (padrão admin@demo.com.br). Se a empresa já existe, não faz nada.
import bcrypt from "bcryptjs";
import { pool, newId, passwordProblem, tempPassword } from "./_common.mjs";

const slug = process.env.DEMO_SLUG ?? "demo";
const email = (process.env.DEMO_ADMIN_EMAIL ?? "admin@demo.com.br").toLowerCase();
const pass = process.env.DEMO_ADMIN_PASSWORD ?? tempPassword();
const prob = passwordProblem(pass, email);
if (prob) { console.error(`DEMO_ADMIN_PASSWORD inválida: ${prob}.`); process.exit(1); }

// ---------- datas relativas a hoje ----------
const TZ = process.env.APP_TIMEZONE ?? "America/Sao_Paulo";
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addD = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const D = (n) => addD(TODAY, n);
const M = (mo, day) => { const t = new Date(TODAY.slice(0, 8) + "01T12:00:00Z"); t.setUTCMonth(t.getUTCMonth() + mo); t.setUTCDate(day); return t.toISOString().slice(0, 10); };
const r2 = (v) => Math.round(v * 100) / 100;
const parc = (total, days, base) => { const v = Math.floor((total / days.length) * 100) / 100; return days.map((d, i) => ({ n: i + 1, due: addD(base, d), value: i < days.length - 1 ? v : r2(total - v * (days.length - 1)) })); };
/** CNPJ com dígitos verificadores corretos a partir dos 12 primeiros dígitos. */
const fixCnpj = (doc) => { const d = doc.replace(/\D/g, "").slice(0, 12).split("").map(Number); const f = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let t = 0; for (let i = 0; i < n; i++) t += d[i] * w[i]; const r = t % 11; return r < 2 ? 0 : 11 - r; }; d.push(f(12)); d.push(f(13)); const x = d.join(""); return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`; };
const snake = (k) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

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
    if (Array.isArray(v)) return v.length && typeof v[0] === "object" ? JSON.stringify(v) : v; // jsonb de objetos ou array do Postgres
    return JSON.stringify(v);
  });
  await c.query(`insert into ${table} (${cols.map((x) => `"${x}"`).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
  return row.id;
}

try {
  await c.query("begin");
  const ex = await c.query("select id from tenants where slug = $1", [slug]);
  if (ex.rows.length) { console.log(`A empresa "${slug}" já existe. Nada a fazer.`); await c.query("rollback"); process.exit(0); }
  tid = newId();
  await c.query("insert into tenants (id, slug, name, document) values ($1, $2, 'Carrocerias Modelo Ltda', '12.345.678/0001-95')", [tid, slug]);
  const hash = await bcrypt.hash(pass, 12);
  const adminId = newId();
  await c.query("insert into users (id, tenant_id, name, email, password_hash, role, must_change_password) values ($1, $2, 'Administrador Demo', $3, $4, 'TENANT_ADMIN', false)", [adminId, tid, email, hash]);

  // dados de negócio: informa a empresa para respeitar o Row Level Security
  await c.query("select set_config('app.tenant_id', $1, true)", [tid]);
  await c.query("set local role erp_app");

  // ---------- empresa e cadastros básicos ----------
  await ins("company_settings", { legalName: "Carrocerias Modelo Ltda", tradeName: "Carrocerias Modelo", document: "12.345.678/0001-95", stateReg: "061234567", taxRegime: "Simples Nacional",
    phone: "(85) 3371-0000", email: "contato@carroceriasmodelo.com.br", zip: "61939-160", street: "Av. Industrial", number: "1500", district: "Distrito Industrial", city: "Maracanaú", cityCode: "2307650", uf: "CE", defaultsVersion: 1 });
  for (const [code, name, decimals] of [["UN", "Unidade", 0], ["PC", "Peça", 0], ["KG", "Quilograma", 3], ["M", "Metro", 2], ["M2", "Metro quadrado", 2], ["L", "Litro", 2], ["GL", "Galão", 0], ["CX", "Caixa", 0], ["PR", "Par", 0], ["KIT", "Kit", 0], ["H", "Hora", 2]])
    await ins("units", { code, name, decimals });
  const T = {};
  for (const [k, name, kind] of [["MP", "Matéria-prima", "MATERIA_PRIMA"], ["SA", "Semiacabado", "SEMIACABADO"], ["PA", "Produto acabado", "PRODUTO_ACABADO"], ["UC", "Uso e consumo", "CONSUMO"], ["RV", "Revenda", "REVENDA"]])
    T[k] = { id: await ins("item_types", { name, kind }), kind };
  const G = {};
  for (const [k, code, name, prefix, next] of [["g01", "MP-CH", "Chapas, perfis e tubos", "002.", 20], ["g02", "MP-SD", "Soldagem", "005.01.", 10], ["g03", "MP-FX", "Fixadores", "003.", 10], ["g04", "MP-HD", "Mangueiras e conexões", "005.17.", 30],
    ["g05", "MP-AC", "Acessórios de carroceria", "011.", 20], ["g06", "MP-PT", "Tintas e acabamento", "004.", 10], ["g07", "PA-CR", "Carrocerias (produto acabado)", "PA-", 100], ["g08", "UC", "Uso e consumo", "009.", 10]]) {
    const prefixId = await ins("code_prefixes", { prefix, description: name, digits: 3, nextNumber: next });
    G[k] = await ins("item_groups", { code, name, prefixId });
  }
  const L = {};
  for (const [k, code, name, type, description] of [["e01", "001", "Almoxarifado central", "Almoxarifado", "Galpão 1, prateleiras A a F"], ["e02", "002", "Linha de montagem", "Produção", "Material liberado para a linha"],
    ["e03", "003", "Expedição", "Expedição", "Carrocerias prontas aguardando entrega"], ["e04", "004", "Pátio de chapas", "Almoxarifado", "Área coberta ao lado da guilhotina"]])
    L[k] = await ins("stock_locations", { code, name, type, description });

  // ---------- clientes e fornecedores ----------
  const PF = {};
  for (const [k, name, color] of [["frota", "Frotista", "#1E3A5F"], ["revenda", "Revenda de implementos", "#7A4FA0"], ["varejo", "Varejo e supermercado", "#2E7D4F"], ["autonomo", "Caminhoneiro autônomo", "#C77700"], ["constr", "Construtora", "#1F8A8A"]])
    PF[k] = await ins("partner_profiles", { name, color });
  const P = {};
  const partners = [
    ["cl01", ["Cliente"], "PJ", "11.222.333/0001-81", "Transportes Vale do Jaguaribe Ltda", "Vale do Jaguaribe", "Russas", "CE", "compras@valejaguaribe.com.br", "(88) 3411-2020", "(88) 99812-4411", "frota", "Rod. CE-356, km 4", "Distrito Industrial", "62900-000", "2311801"],
    ["cl02", ["Cliente"], "PJ", "22.333.444/0001-90", "Rodante Peças e Serviços Ltda", "Rodante", "Mossoró", "RN", "contato@rodante.com.br", "(84) 3316-4455", "(84) 99977-1020", "revenda", "Av. Presidente Dutra, 2100", "Alto de São Manoel", "59600-000", "2408003"],
    ["cl03", ["Cliente"], "PJ", "33.444.555/0001-00", "Via Diesel Caminhões Ltda", "Via Diesel", "Natal", "RN", "vendas@viadiesel.com.br", "(84) 3206-7788", "", "revenda", "BR-101, km 5, Galpão 3", "Lagoa Nova", "59064-000", "2408102"],
    ["cl04", ["Cliente", "Fornecedor"], "PJ", "44.555.666/0001-08", "Audax Implementos Rodoviários Ltda", "Audax", "Parnamirim", "RN", "audax@audax.com.br", "(84) 3644-1122", "", "revenda", "Av. Ayrton Senna, 900", "Nova Parnamirim", "59140-000", "2403251"],
    ["cl05", ["Cliente"], "PJ", "55.666.777/0001-17", "Seridó Locações de Veículos Ltda", "Seridó Locações", "Caicó", "RN", "frota@seridoloc.com.br", "(84) 3421-9090", "(84) 98801-3030", "frota", "Rua Renato Dantas, 310", "Centro", "59300-000", "2402006"],
    ["cl06", ["Cliente"], "PJ", "66.777.888/0001-26", "Supermercado Potiguar Ltda", "Potiguar", "Natal", "RN", "logistica@potiguar.com.br", "(84) 3222-5050", "", "varejo", "Av. Salgado Filho, 3200", "Lagoa Nova", "59075-000", "2408102"],
    ["cl07", ["Cliente"], "PF", "123.456.789-09", "Joailson Ferreira da Silva", null, "João Pessoa", "PB", "joailson.frete@email.com", "", "(83) 98877-6655", "autonomo", "Rua das Trincheiras, 45", "Centro", "58000-000", "2507507"],
    ["cl08", ["Cliente"], "PJ", "13.141.516/0001-05", "Construtora Ponta Negra Ltda", "Construtora Ponta Negra", "Natal", "RN", "obras@cpnegra.com.br", "(84) 3219-7070", "", "constr", "Av. Eng. Roberto Freire, 1776", "Capim Macio", "59090-000", "2408102"],
    ["f01", ["Fornecedor"], "PJ", "77.888.999/0001-44", "Aços Nordeste Distribuidora Ltda", "Aços Nordeste", "Recife", "PE", "vendas@acosne.com.br", "(81) 3455-1000", "", null, "Av. Recife, 5000", "Areias", "50000-000", "2611606"],
    ["f02", ["Fornecedor"], "PJ", "88.999.000/0001-53", "Fixapar Parafusos e Fixadores Ltda", "Fixapar", "Natal", "RN", "pedidos@fixapar.com.br", "(84) 3213-4040", "", null, "Rua da Indústria, 80", "Ribeira", "59012-000", "2408102"],
    ["f03", ["Fornecedor"], "PJ", "99.000.111/0001-62", "Soldamax Gases e Soldas Ltda", "Soldamax", "Natal", "RN", "comercial@soldamax.com.br", "(84) 3234-3030", "", null, "Rua dos Gases, 12", "Alecrim", "59030-000", "2408102"],
    ["f04", ["Fornecedor"], "PJ", "10.111.222/0001-30", "Tintas Potiguar Comércio Ltda", "Tintas Potiguar", "Natal", "RN", "tintas@tpotiguar.com.br", "(84) 3211-8080", "", null, "Av. Bernardo Vieira, 900", "Tirol", "59015-000", "2408102"],
    ["tr01", ["Transportadora", "Fornecedor"], "PJ", "12.131.415/0001-90", "Rota Potiguar Transportes Ltda", "Rota Potiguar", "Natal", "RN", "coleta@rotapotiguar.com.br", "(84) 3272-6060", "", null, "BR-304, km 2", "Bom Pastor", "59052-000", "2408102"],
  ];
  for (const [k, kinds, personType, document, name, tradeName, city, uf, em, phone, mobile1, prof, street, district, zip, cityCode] of partners)
    P[k] = await ins("partners", { kinds, personType, document: personType === "PJ" ? fixCnpj(document) : document, name, tradeName, city, uf, email: em, phone: phone || null, mobile1: mobile1 || null, profileId: prof ? PF[prof] : null,
      street, district, zip, cityCode, stateRegIndicator: personType === "PJ" ? "1" : "9", salespersonId: kinds.includes("Cliente") ? adminId : null, finalConsumer: personType === "PF" });
  await ins("partner_contacts", { partnerId: P.cl01, name: "Raimundo Maia", role: "Gerente de frota", email: "raimundo@valejaguaribe.com.br", mobile: "(88) 99901-2233", isPrimary: true });
  await ins("partner_contacts", { partnerId: P.cl01, name: "Patrícia Lopes", role: "Financeiro", email: "financeiro@valejaguaribe.com.br", phone: "(88) 3411-2021" });
  await ins("partner_contacts", { partnerId: P.cl06, name: "Marcelo Dantas", role: "Logística", mobile: "(84) 99644-7788", isPrimary: true });
  await ins("partner_notes", { partnerId: P.cl01, body: "Cliente pede sempre baú com porta lateral do lado direito. Prefere entrega na fábrica.", userName: "Administrador Demo" });
  await ins("partner_notes", { partnerId: P.cl05, body: "Combinado prazo extra de 15 dias na próxima compra por conta do atraso no último pagamento.", userName: "Administrador Demo" });

  // ---------- itens ----------
  const I = [
    ["it01", "011.81.160.001-01", "ABRIGO PARA EXTINTOR 335X620X240", "DAKEN", "g05", "UN", "MP", 2, 140.136, "e01", 5],
    ["it02", "011.81.160.001-02", "ABRIGO PARA EXTINTOR 335X715X240", "DAKEN", "g05", "UN", "MP", 2, 158.04, "e01", 5],
    ["it03", "011.90.012.023-00", "ALAVANCA EXTERNA COM SUPORTE GRANDE", "OLTREMARE E ROQUE", "g05", "UN", "MP", 10, 26.096, "e01", 20],
    ["it04", "011.90.012.024-00", "ALAVANCA EXTERNA COM SUPORTE PEQUENA", "OLTREMARE E ROQUE", "g05", "UN", "MP", 10, 24.403, "e01", 20],
    ["it05", "011.90.012.020-00", "ALOJAMENTO DO CAME FF DIR/ESQ", "OLTREMARE E ROQUE", "g05", "UN", "MP", 10, 7.3285, "e01", 30],
    ["it06", "005.01.100.001-00", "ARAME DE SOLDA MIG 0,8MM", "OXIMIG", "g02", "KG", "MP", 20, 12.17, "e01", 30],
    ["it07", "005.01.100.003-01", "ARAME DE SOLDA MIG 1,2MM ER70S-6", "OXIMIG", "g02", "KG", "MP", 40, 9.96773, "e01", 120],
    ["it08", "001.10.200.005-03", "ARRUELA LISA A994 3/8\" GALVANIZADA", null, "g03", "UN", "MP", 100, 0.35, "e01", 60],
    ["it09", "001.40.200.002-00", "BASE DO MANCAL 1\"", "OLTREMARE E ROQUE", "g05", "UN", "MP", 10, 18.5, "e01", 12],
    ["it10", "005.17.100.024-00", "BICO DE MANGUEIRA NYLON 1/2", null, "g04", "UN", "MP", 20, 4.25, "e01", 63],
    ["it11", "005.17.100.025-00", "BICO DE MANGUEIRA NYLON 1/4", null, "g04", "UN", "MP", 20, 2.15, "e01", 62],
    ["it12", "005.17.100.018-00", "BICO DE MANGUEIRA TEE 1/4", null, "g04", "UN", "MP", 10, 9.57, "e01", 20],
    ["it13", "002.01.300.010-00", "CHAPA AÇO CARBONO 2,00MM 1200X3000", null, "g01", "PC", "MP", 20, 385, "e04", 48],
    ["it14", "002.01.300.012-00", "CHAPA AÇO CARBONO 3,00MM 1500X3000", null, "g01", "PC", "MP", 10, 612, "e04", 14],
    ["it15", "002.05.100.004-00", "PERFIL U ENRIJECIDO 100X50X17X2,00MM 6M", null, "g01", "PC", "MP", 30, 142, "e04", 60],
    ["it16", "002.05.100.008-00", "TUBO RETANGULAR 50X30X1,50MM 6M", null, "g01", "PC", "MP", 40, 98.4, "e04", 70],
    ["it17", "002.09.400.001-00", "CHAPA DE ALUMÍNIO LISA 1,20MM 1250X3000", null, "g01", "PC", "MP", 20, 540, "e04", 26],
    ["it18", "003.02.100.001-00", "PARAFUSO SEXTAVADO 3/8\" X 1\" ZINCADO", null, "g03", "UN", "MP", 500, 0.62, "e01", 1200],
    ["it19", "003.02.100.004-00", "PORCA SEXTAVADA 3/8\" ZINCADA", null, "g03", "UN", "MP", 500, 0.28, "e01", 1200],
    ["it20", "003.05.200.002-00", "REBITE POP ALUMÍNIO 4,8X16", "CAIXA C/ 500", "g03", "CX", "MP", 10, 58.9, "e01", 14],
    ["it21", "004.01.100.001-00", "TINTA ESMALTE PU BRANCO GELO 3,6L", null, "g06", "GL", "MP", 10, 189.9, "e01", 18],
    ["it22", "004.01.100.002-00", "PRIMER EPÓXI CINZA 3,6L", null, "g06", "GL", "MP", 8, 164.5, "e01", 12],
    ["it23", "004.02.100.001-00", "THINNER 5L", null, "g06", "UN", "MP", 10, 72, "e01", 18],
    ["it24", "006.01.100.001-00", "DOBRADIÇA DE PORTA TRASEIRA FURGÃO", null, "g05", "UN", "MP", 20, 46.8, "e01", 40],
    ["it25", "006.01.100.005-00", "FECHO DE PORTA TIPO CREMONA INOX", null, "g05", "UN", "MP", 10, 132, "e01", 16],
    ["it26", "006.03.100.001-00", "LANTERNA LATERAL LED ÂMBAR", null, "g05", "UN", "MP", 30, 18.9, "e01", 70],
    ["it27", "009.01.100.001-00", "DISCO DE CORTE 7\" X 1/8\"", null, "g08", "UN", "UC", 30, 9.8, "e01", 35],
    ["it28", "009.01.100.003-00", "LUVA DE VAQUETA", null, "g08", "PR", "UC", 20, 14.5, "e01", 40],
    ["it29", "PA-001", "CARROCERIA FECHADA - FURGÃO CS 6200X2300X2300", null, "g07", "UN", "PA", 0, 38500, "e03", 0],
    ["it30", "PA-002", "CARROCERIA FECHADA - FURGÃO CS 3100X2000X2100", null, "g07", "UN", "PA", 0, 21800, "e03", 0],
    ["it31", "PA-003", "CARROCERIA ABERTA CARGA SECA AÇO COMUM - 4500", null, "g07", "UN", "PA", 0, 16900, "e03", 0],
    ["it32", "PA-004", "CARROCERIA BASCULANTE GRADES MÓVEIS ASTM A36", null, "g07", "UN", "PA", 0, 29400, "e03", 0],
    ["it33", "PA-005", "CARROCERIA ABERTA CARGA SECA MADEIRA PU - 6200", null, "g07", "UN", "PA", 0, 19800, "e03", 0],
    ["it34", "PA-006", "SOBRE GRADE TRANSPORTE BOVINO LINHA MÉDIA 5000", null, "g07", "UN", "PA", 0, 14200, "e03", 0],
  ];
  const NCM = { it13: "72091700", it14: "72085200", it15: "72163100", it16: "73066100", it17: "76061220", it18: "73181500", it19: "73181600", it21: "32089010", it22: "32089010", it26: "85122022", it29: "87079090", it30: "87079090", it31: "87079090", it32: "87079090", it33: "87079090", it34: "87169090" };
  const FP = (k) => (["it13", "it14", "it15", "it16", "it17"].includes(k) ? "f01" : ["it06", "it07"].includes(k) ? "f03" : ["it21", "it22", "it23"].includes(k) ? "f04" : "f02");
  const IT = {}, COST = {}, UNIT = {};
  for (const [k, code, name, complement, g, unit, t, min, cost, loc] of I) {
    COST[k] = cost; UNIT[k] = unit;
    const pa = t === "PA";
    IT[k] = await ins("items", { code, name, complement, groupId: G[g], unit, typeId: T[t].id, type: T[t].kind, minStock: min, maxStock: pa ? 0 : min * 3, defaultLocationId: L[loc], cost,
      salePrice: pa ? Math.round((cost * 1.32) / 100) * 100 : t === "UC" && k === "it28" ? 24.9 : 0, ncm: NCM[k] ?? null, defaultSupplierId: pa ? null : P[FP(k)], leadDays: pa ? null : 7 });
    if (!pa) await ins("item_suppliers", { itemId: IT[k], partnerId: P[FP(k)], lastPrice: cost, leadDays: 7 });
  }
  // estrutura e roteiro
  const C = {};
  for (const [k, code, name, cap, cph, description] of [["c1", "CT-01", "Corte e dobra", 16, 95, "Guilhotina, dobradeira e serra fita"], ["c2", "CT-02", "Solda e chassi", 16, 110, "Estrutura, longarinas e travessas"], ["c3", "CT-03", "Montagem de furgões", 8, 105, "Painéis, portas e revestimento"],
    ["c4", "CT-04", "Cabine de pintura", 8, 130, "Preparação, primer e PU"], ["c5", "CT-05", "Acabamento e elétrica", 8, 90, "Iluminação, acessórios e vedação"], ["c6", "CT-06", "Inspeção e expedição", 8, 70, "Checklist final e liberação"]])
    C[k] = await ins("work_centers", { code, name, capacityHours: cap, costPerHour: cph, description });
  const BOMS = {
    it29: { m: [["it13", 5], ["it15", 4], ["it16", 6], ["it17", 3], ["it07", 8], ["it18", 40], ["it19", 40], ["it20", 1], ["it21", 2], ["it22", 1], ["it23", 1], ["it24", 4], ["it25", 2], ["it26", 8], ["it01", 1]], r: [["c1", 14], ["c2", 26], ["c3", 36], ["c4", 16], ["c5", 8], ["c6", 3]] },
    it30: { m: [["it13", 3], ["it15", 3], ["it16", 4], ["it17", 2], ["it07", 5], ["it18", 30], ["it19", 30], ["it20", 1], ["it21", 1], ["it22", 1], ["it23", 1], ["it24", 4], ["it25", 2], ["it26", 6], ["it01", 1]], r: [["c1", 9], ["c2", 16], ["c3", 24], ["c4", 11], ["c5", 6], ["c6", 2]] },
    it31: { m: [["it14", 2], ["it15", 3], ["it16", 3], ["it07", 6], ["it18", 30], ["it19", 30], ["it21", 1], ["it22", 1], ["it23", 1], ["it03", 2], ["it05", 4], ["it26", 6], ["it01", 1]], r: [["c1", 10], ["c2", 24], ["c4", 12], ["c5", 5], ["c6", 2]] },
    it32: { m: [["it14", 4], ["it15", 5], ["it16", 4], ["it07", 9], ["it18", 40], ["it19", 40], ["it21", 2], ["it22", 1], ["it23", 1], ["it03", 4], ["it04", 4], ["it05", 8], ["it09", 4], ["it26", 6], ["it02", 1]], r: [["c1", 16], ["c2", 34], ["c4", 16], ["c5", 6], ["c6", 3]] },
    it33: { m: [["it14", 2], ["it15", 4], ["it16", 2], ["it07", 5], ["it18", 40], ["it19", 40], ["it21", 1], ["it22", 1], ["it23", 1], ["it03", 2], ["it05", 4], ["it26", 6], ["it01", 1]], r: [["c1", 8], ["c2", 20], ["c3", 10], ["c4", 10], ["c5", 5], ["c6", 2]] },
    it34: { m: [["it16", 6], ["it15", 2], ["it07", 5], ["it18", 30], ["it19", 30], ["it21", 1], ["it22", 1], ["it23", 1], ["it09", 4]], r: [["c1", 6], ["c2", 22], ["c4", 8], ["c6", 2]] },
  };
  for (const [k, b] of Object.entries(BOMS)) {
    let i = 0; for (const [m, q] of b.m) await ins("item_bom", { itemId: IT[k], componentId: IT[m], qty: q, lossPct: ["it13", "it14", "it17"].includes(m) ? 5 : 0, position: i++ });
    i = 0; for (const [w, h] of b.r) await ins("item_routing", { itemId: IT[k], workCenterId: C[w], hours: h, position: i++ });
  }
  const unitCost = (k) => BOMS[k] ? r2(BOMS[k].m.reduce((a, [m, q]) => a + q * COST[m], 0) + BOMS[k].r.reduce((a, [w, h]) => a + h * { c1: 95, c2: 110, c3: 105, c4: 130, c5: 90, c6: 70 }[w], 0)) : COST[k];

  // ---------- produção: etapas, equipe ----------
  const S = {};
  for (const [k, name, color, pos, kind] of [["s1", "A produzir", "#6B7785", 1, "aberta"], ["s2", "Corte e preparação", "#C77700", 2, "andamento"], ["s3", "Montagem e solda", "#2F6E9A", 3, "andamento"], ["s4", "Pintura e acabamento", "#7A4FA0", 4, "andamento"],
    ["s5", "Inspeção de qualidade", "#1F8A8A", 5, "andamento"], ["s6", "Concluída", "#2E7D4F", 6, "finalizada"], ["s7", "Cancelada", "#B3261E", 7, "cancelada"]])
    S[k] = await ins("production_stages", { name, color, position: pos, kind });
  const AS = {};
  for (const [k, name, color, pos, kind] of [["a1", "A iniciar", "#6B7785", 1, "aguardando"], ["a2", "Em montagem", "#2F6E9A", 2, "andamento"], ["a3", "Pendência", "#B3261E", 3, "pendencia"], ["a4", "Concluído", "#2E7D4F", 4, "concluido"]])
    AS[k] = await ins("assembly_stages", { name, color, position: pos, kind });
  const PE = {};
  for (const [k, name, role, wc, shift] of [["p1", "Francisco Lima", "Encarregado de produção", "c2", "Comercial"], ["p2", "Antônio Bezerra", "Soldador", "c2", "Manhã"], ["p3", "Raimundo Nonato", "Operador de dobradeira", "c1", "Manhã"],
    ["p4", "José Wellington", "Montador", "c3", "Comercial"], ["p5", "Marcos Dantas", "Pintor industrial", "c4", "Comercial"], ["p6", "Edilson Freitas", "Eletricista automotivo", "c5", "Comercial"], ["p7", "Cláudia Souza", "Inspetora de qualidade", "c6", "Comercial"],
    ["p8", "Rafael Medeiros", "Montador", "c3", "Tarde"], ["p9", "Luan Pereira", "Auxiliar de montagem", "c3", "Comercial"], ["p10", "Tiago Moura", "Montador", "c3", "Comercial"]])
    PE[k] = await ins("team_members", { name, role, workCenterId: C[wc], shift });

  // ---------- comercial e financeiro: cadastros ----------
  const PM = {};
  for (const n of ["Boleto", "PIX", "Transferência", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Cheque"]) PM[n] = await ins("payment_methods", { name: n });
  const PT = {};
  for (const [n, days] of [["À vista", [0]], ["28 dias", [28]], ["30 dias", [30]], ["30/60", [30, 60]], ["30/60/90", [30, 60, 90]], ["Entrada + 2x", [0, 30, 60]], ["Entrada + 3x", [0, 30, 60, 90]]]) PT[n] = { id: await ins("payment_terms", { name: n, days }), days };
  const CAT = {};
  for (const n of ["Venda de produtos", "Serviços", "Outras receitas"]) CAT[n] = await ins("fin_categories", { name: n, kind: "RECEBER" });
  for (const n of ["Matéria-prima", "Folha de pagamento", "Energia", "Aluguel", "Impostos", "Manutenção", "Frete", "Outras despesas"]) CAT[n] = await ins("fin_categories", { name: n, kind: "PAGAR" });
  const BK = await ins("bank_accounts", { name: "Banco do Brasil · conta movimento", bank: "Banco do Brasil", agency: "1234-5", account: "45678-9", initialBalance: 185000, initialDate: D(-120) });
  const BK2 = await ins("bank_accounts", { name: "Caixa da fábrica", bank: "Caixa interno", initialBalance: 3500, initialDate: D(-120) });
  const SIT = {};
  for (const [n, color] of [["Aguardando aprovação", "#C77700"], ["Aprovado para pagamento", "#2E7D4F"], ["Agendado", "#2F6E9A"]]) SIT[n] = await ins("fin_situations", { name: n, color });
  const RSP = await ins("fin_responsibles", { name: "Fernanda Rocha", email: "financeiro@carroceriasmodelo.com.br" });
  await ins("fin_responsibles", { name: "Administrador Demo" });
  const CRM = {};
  for (const [k, name, color, pos, kind] of [["n", "Novo contato", "#6B7785", 1, "aberta"], ["q", "Qualificação", "#2F6E9A", 2, "aberta"], ["p", "Proposta enviada", "#C77700", 3, "aberta"], ["ng", "Negociação", "#7A4FA0", 4, "aberta"], ["w", "Ganho", "#2E7D4F", 5, "ganha"], ["l", "Perdido", "#B3261E", 6, "perdida"]])
    CRM[k] = await ins("crm_stages", { name, color, position: pos, kind });
  const CF1 = await ins("custom_fields", { entity: "sales_order", label: "Chassi / modelo do caminhão", type: "texto", position: 1 });
  const CF2 = await ins("custom_fields", { entity: "sales_order", label: "Tipo de entrega", type: "lista", options: ["Retira na fábrica", "Entrega no cliente", "Transportadora"], position: 2 });
  await ins("custom_fields", { entity: "sales_order", label: "Precisa de projeto especial", type: "sim_nao", position: 3 });

  // perfis de acesso e usuários de exemplo (mesma senha do administrador)
  const all = (v) => ({ dash: v, comercial: v, producao: v, itens: v, estoque: v, compras: v, financeiro: v });
  const PRF = {};
  for (const [k, name, description, perms] of [
    ["com", "Comercial", "CRM, pedidos, clientes e faturamento. Consulta produção e estoque.", { ...all("nenhum"), dash: "ver", comercial: "editar", producao: "ver", estoque: "ver", itens: "ver", custos: false }],
    ["pcp", "PCP e produção", "Fila de pedidos, OPs, apontamentos, montagens e estoque. Vê custos.", { ...all("nenhum"), dash: "ver", comercial: "ver", producao: "editar", estoque: "editar", itens: "editar", compras: "ver", custos: true }],
    ["alm", "Almoxarifado e compras", "Estoque, inventário, solicitações, cotações e pedidos de compra.", { ...all("nenhum"), dash: "ver", producao: "ver", estoque: "editar", itens: "editar", compras: "editar", custos: false }],
    ["fin", "Financeiro", "Contas a pagar e receber, extrato e relatórios.", { ...all("nenhum"), dash: "ver", comercial: "ver", compras: "ver", financeiro: "editar", custos: false }],
    ["mont", "Montagem em campo", "Acompanha montagens e aponta horas.", { ...all("nenhum"), producao: "editar", custos: false }]]) PRF[k] = await ins("access_profiles", { name, description, permissions: perms });
  await c.query("reset role");
  const domain = email.split("@")[1];
  const extra = [["Carlos Andrade", `vendas@${domain}`, PRF.com], ["Francisco Lima", `pcp@${domain}`, PRF.pcp], ["Fernanda Rocha", `financeiro@${domain}`, PRF.fin]];
  for (const [n, e, p] of extra) await c.query("insert into users (id, tenant_id, name, email, password_hash, role, must_change_password, profile_id) values ($1, $2, $3, $4, $5, 'TENANT_USER', false, $6)", [newId(), tid, n, e, hash, p]);
  await c.query("set local role erp_app");

  // ---------- estoque: saldo inicial e consumo ----------
  const mv = (o) => ins("stock_movements", { userName: "Implantação", ...o });
  for (const [k, , , , , , , , cost, loc, q] of I) if (q > 0) await mv({ date: D(-110), type: "ENTRADA", itemId: IT[k], locationId: L[loc], qty: q, unitCost: cost, document: "Saldo inicial", notes: "Implantação do sistema" });
  for (let w = 12; w >= 1; w--) {
    await mv({ date: D(-7 * w + 2), type: "SAIDA", itemId: IT.it07, locationId: L.e01, qty: 4 + (w % 3), unitCost: COST.it07, document: `Requisição ${140 + w}`, notes: "Consumo da solda", userName: "Almoxarifado" });
    await mv({ date: D(-7 * w + 3), type: "SAIDA", itemId: IT.it27, locationId: L.e01, qty: 1 + (w % 2), unitCost: COST.it27, document: `Requisição ${150 + w}`, notes: "Corte de perfis", userName: "Almoxarifado" });
    const [rk, rq, rl] = [["it15", 2, "e04"], ["it21", 1, "e01"], ["it18", 60, "e01"], ["it16", 2, "e04"]][w % 4];
    await mv({ date: D(-7 * w + 4), type: "SAIDA", itemId: IT[rk], locationId: L[rl], qty: rq, unitCost: COST[rk], document: `Requisição ${160 + w}`, notes: "Consumo da linha", userName: "Almoxarifado" });
    if (w % 3 === 0) await mv({ date: D(-7 * w + 5), type: "SAIDA", itemId: IT.it28, locationId: L.e01, qty: 2, unitCost: COST.it28, document: `Requisição ${170 + w}`, notes: "EPI da equipe", userName: "Almoxarifado" });
  }
  await mv({ date: D(-4), type: "TRANSFERENCIA", itemId: IT.it13, locationId: L.e04, destLocationId: L.e02, qty: 6, unitCost: COST.it13, document: "Transf. 22", notes: "Chapas para a linha", userName: "Almoxarifado" });
  await mv({ date: D(-1), type: "AJUSTE", itemId: IT.it08, locationId: L.e01, qty: -4, unitCost: COST.it08, document: "Inventário", notes: "Contagem cíclica", userName: "Almoxarifado" });

  // ---------- compras: pedidos recebidos com contas a pagar ----------
  let pcn = 300;
  async function purchase(fk, lines, dRec, status, extraO = {}) {
    const number = ++pcn;
    const total = r2(lines.reduce((a, [, q, pr]) => a + q * pr, 0));
    const inst = parc(total, [28], dRec);
    const id = await ins("purchase_orders", { number, status, partnerId: P[fk], issueDate: addD(dRec, -7), deliveryDate: dRec, buyer: "Almoxarifado", paymentMethodId: PM.Boleto, paymentTermId: PT["28 dias"].id, installments: inst, total, ...extraO });
    let pos = 0;
    for (const [k, q, pr] of lines) {
      const rec = status === "RECEBIDO" ? q : 0;
      await ins("purchase_order_items", { orderId: id, itemId: IT[k], qty: q, price: pr, receivedQty: rec, position: pos++ });
      if (rec) await mv({ date: dRec, type: "ENTRADA", itemId: IT[k], locationId: k === "it13" || k === "it14" || k === "it15" || k === "it16" || k === "it17" ? L.e04 : L.e01, qty: q, unitCost: pr, document: `NF ${4400 + number}`, notes: `Recebimento do pedido de compra ${number}`, partnerId: P[fk], purchaseOrderId: id, userName: "Almoxarifado" });
    }
    if (status === "RECEBIDO") for (const x of inst) {
      const paid = x.due < TODAY;
      await ins("fin_titles", { kind: "PAGAR", description: `PC ${number} · NF ${4400 + number}`, document: `NF ${4400 + number}`, partnerId: P[fk], categoryId: CAT["Matéria-prima"], issueDate: dRec, dueDate: x.due, amount: x.value,
        status: paid ? "PAGO" : "ABERTO", paidAt: paid ? x.due : null, paidAmount: paid ? x.value : null, bankAccountId: paid ? BK : null, paymentMethodId: PM.Boleto, installment: "1/1", originType: "PC", originId: id, originNumber: String(number), responsibleId: RSP });
    }
    return id;
  }
  // reposição periódica do que a linha consome (histórico de compras, como no protótipo)
  await purchase("f03", [["it07", 40, 9.95], ["it06", 20, 12.17]], D(-92), "RECEBIDO");
  await purchase("f02", [["it18", 400, 0.62], ["it19", 400, 0.28]], D(-86), "RECEBIDO");
  await purchase("f01", [["it13", 20, 385], ["it15", 16, 142], ["it16", 20, 98.4]], D(-80), "RECEBIDO");
  await purchase("f04", [["it21", 6, 189.9], ["it23", 6, 72]], D(-72), "RECEBIDO");
  await purchase("f01", [["it13", 12, 389], ["it17", 6, 540]], D(-65), "RECEBIDO");
  await purchase("f02", [["it08", 300, 0.35], ["it20", 4, 58.9]], D(-58), "RECEBIDO");
  await purchase("f01", [["it15", 12, 145], ["it16", 16, 99.9]], D(-44), "RECEBIDO");
  await purchase("f03", [["it07", 40, 10.1], ["it27", 30, 9.8]], D(-30), "RECEBIDO");
  await purchase("f01", [["it13", 10, 392], ["it14", 4, 612]], D(-23), "RECEBIDO");
  await purchase("f02", [["it18", 500, 0.6]], D(-9), "RECEBIDO");
  await purchase("f03", [["it07", 60, 9.9]], D(-60), "RECEBIDO");
  await purchase("f02", [["it18", 800, 0.6], ["it19", 800, 0.27], ["it20", 6, 58.9]], D(-45), "RECEBIDO");
  await purchase("f04", [["it21", 10, 189.9], ["it22", 6, 164.5], ["it23", 8, 72]], D(-20), "RECEBIDO");
  await purchase("f01", [["it14", 12, 612], ["it17", 10, 540]], D(-2), "ENVIADO", { issueDate: D(-12) });
  await purchase("f02", [["it24", 20, 46.8], ["it25", 10, 132]], D(10), "RASCUNHO", { issueDate: TODAY });

  // ---------- vendas, OPs e faturamento ----------
  let pv = 160, opn = 80, nf = 2200, asmN = 20;
  const conds = [["30/60/90", "Boleto"], ["Entrada + 2x", "PIX"], ["À vista", "Transferência"], ["30/60", "Boleto"]];
  async function order({ cli, lines, status, prod, issue, delivery, k = 0, place, custom }) {
    const number = ++pv;
    const total = r2(lines.reduce((a, [, q, pr, d = 0]) => a + q * pr * (1 - d / 100), 0));
    const [cn, pmn] = conds[k % 4];
    const id = await ins("sales_orders", { number, status, productionStatus: prod, partnerId: P[cli], salespersonId: adminId, salespersonName: "Carlos Andrade", issueDate: issue, deliveryDate: delivery,
      deliveryPlace: place ?? "Retira na fábrica", paymentMethodId: PM[pmn], paymentTermId: PT[cn].id, installments: parc(total, PT[cn].days, delivery ?? issue), total, approvedAt: status === "PROPOSTA" ? null : issue,
      custom: custom ?? { [CF2]: place ? "Entrega no cliente" : "Retira na fábrica" } });
    let pos = 0;
    for (const [it, q, pr, d = 0] of lines) await ins("sales_order_items", { orderId: id, itemId: IT[it], qty: q, price: pr, discountPct: d, position: pos++ });
    return { id, number, total, terms: PT[cn].days, pm: PM[pmn] };
  }
  const price = (k) => Math.round((COST[k] * 1.32) / 100) * 100;
  async function op({ so, cli, it, qty, stage, need, start, resp, wc, prio = "Normal", produced = 0, completed = null, created }) {
    const number = ++opn;
    const id = await ins("production_orders", { number, itemId: IT[it], qty, qtyProduced: produced, salesOrderId: so ?? null, partnerId: cli ? P[cli] : null, stageId: S[stage], workCenterId: C[wc], responsibleId: PE[resp], priority: prio,
      startDate: start, needDate: need, completedAt: completed, createdAt: new Date(created + "T10:00:00Z") });
    const lvl = ["s1", "s2", "s3", "s4", "s5", "s6"].indexOf(stage);
    let pos = 0;
    for (const [m, q] of BOMS[it].m) {
      const req = r2(q * qty * (["it13", "it14", "it17"].includes(m) ? 1.05 : 1));
      const grp = ["it13", "it14", "it15", "it16", "it17"].includes(m) ? 1 : ["it21", "it22", "it23"].includes(m) ? 3 : ["it26", "it01", "it02", "it24", "it25"].includes(m) ? 4 : 2;
      const done = lvl >= 5 || grp < lvl ? req : grp === lvl ? Math.floor(req / 2) : 0;
      await ins("production_order_components", { productionOrderId: id, itemId: IT[m], qtyRequired: req, qtyDone: done, fromBom: true, position: pos++ });
      // material retirado do estoque para a OP conforme a etapa
      if (lvl < 5 && grp <= Math.max(lvl, 1) && lvl > 0) {
        const loc = ["it13", "it14", "it15", "it16", "it17"].includes(m) ? L.e04 : L.e01;
        await mv({ date: addD(start, grp * 2), type: "SAIDA", itemId: IT[m], locationId: loc, qty: req, unitCost: COST[m], document: `OP ${number}`, notes: "Requisição pela estrutura da OP", productionOrderId: id, userName: "Almoxarifado" });
      }
    }
    // horas apontadas nas etapas já passadas
    const MAPA = { s2: ["c1"], s3: ["c2", "c3"], s4: ["c4", "c5"], s5: ["c6"] }; const PC = { c1: "p3", c2: "p2", c3: "p4", c4: "p5", c5: "p6", c6: "p7" };
    let dia = 0;
    for (const sk of ["s2", "s3", "s4", "s5"].slice(0, Math.max(0, Math.min(lvl, 4)))) for (const w of MAPA[sk]) {
      const r = BOMS[it].r.find(([x]) => x === w); if (!r) continue;
      let h = Math.round(r[1] * qty * (sk === stage ? 0.5 : 0.95) * 2) / 2;
      while (h > 0) { const x = Math.min(8, h); h -= x; const d = addD(start, ++dia); if (d > TODAY) break;
        await ins("time_entries", { productionOrderId: id, stageId: S[sk], workCenterId: C[w], memberId: PE[PC[w]], date: d, start: "07:00", end: `${String(7 + Math.floor(x) + (x > 4 ? 1 : 0)).padStart(2, "0")}:${x % 1 ? "30" : "00"}`, breakMinutes: x > 4 ? 60 : 0, hours: x }); }
    }
    if (produced > 0) {
      const d = completed ?? D(-1);
      await ins("production_outputs", { productionOrderId: id, date: d, qty: produced, locationId: L.e03, userName: "Produção" });
      await mv({ date: d, type: "PRODUCAO", itemId: IT[it], locationId: L.e03, qty: produced, unitCost: unitCost(it), document: `OP ${number}`, notes: "Entrada de produção", productionOrderId: id, userName: "Produção" });
    }
    return { id, number };
  }
  async function invoice(o, cli, lines, date, k) {
    const number = ++nf;
    const id = await ins("invoices", { number, series: "1", issueDate: date, partnerId: P[cli], salesOrderId: o.id, total: o.total, status: "EMITIDA", stockOut: true, locationId: L.e03 });
    for (const [it, q, pr, dsc = 0] of lines) {
      await ins("invoice_items", { invoiceId: id, itemId: IT[it], qty: q, price: pr, discountPct: dsc });
      await mv({ date: date, type: "SAIDA", itemId: IT[it], locationId: L.e03, qty: q, unitCost: unitCost(it), document: `NF ${number}`, notes: `Faturamento do pedido ${o.number}`, partnerId: P[cli], invoiceId: id, userName: "Expedição" });
    }
    const ps = parc(o.total, o.terms, date);
    for (const x of ps) {
      const late = cli === "cl05" && x.due < TODAY && x.due >= D(-40);
      const paid = x.due < TODAY && !late;
      await ins("fin_titles", { kind: "RECEBER", description: `NF ${number} · Pedido ${o.number}`, document: `NF ${number}`, partnerId: P[cli], categoryId: CAT["Venda de produtos"], issueDate: date, dueDate: x.due, amount: x.value,
        status: paid ? "PAGO" : "ABERTO", paidAt: paid ? x.due : null, paidAmount: paid ? x.value : null, bankAccountId: paid ? BK : null, paymentMethodId: o.pm, installment: `${x.n}/${ps.length}`, originType: "NF", originId: id, originNumber: String(number), responsibleId: late ? RSP : null, situationId: late ? SIT["Aguardando aprovação"] : null });
    }
    await c.query("update sales_orders set installments = $1 where id = $2", [JSON.stringify(ps), o.id]);
  }

  // histórico: pedidos produzidos e faturados
  const hist = [["cl01", "it29", -84], ["cl02", "it31", -78], ["cl04", "it33", -72], ["cl03", "it30", -66], ["cl05", "it32", -58], ["cl06", "it29", -50], ["cl06", "it34", -44], ["cl01", "it33", -38], ["cl03", "it29", -30], ["cl05", "it31", -22], ["cl02", "it30", -15], ["cl04", "it32", -9]];
  for (const [k, [cli, it, conc]] of hist.entries()) {
    const lines = [[it, 1, price(it), k % 3 === 0 ? 3 : 0]]; if (k % 4 === 1) lines.push(["it26", 4, 29]);
    const o = await order({ cli, lines, status: "FATURADO", prod: "PRODUZIDO", issue: D(conc - 30), delivery: D(conc + 2), k, place: k % 2 ? null : "Entrega no cliente" });
    await op({ so: o.id, cli, it, qty: 1, stage: "s6", need: D(conc + 1 - (k % 3 === 0 ? 3 : 0)), start: D(conc - 22), resp: "p7", wc: "c6", produced: 1, completed: D(conc), created: D(conc - 28) });
    if (k % 4 === 1) await mv({ date: D(conc - 5), type: "TRANSFERENCIA", itemId: IT.it26, locationId: L.e01, destLocationId: L.e03, qty: 4, unitCost: COST.it26, document: `Separação pedido ${o.number}`, userName: "Expedição" });
    await invoice(o, cli, lines, D(Math.min(conc + 2, -1)), k);
  }
  // em produção
  const live = [["cl02", "it31", "s1", 8, "p3", "c1", "Normal", 0], ["cl01", "it29", "s3", 2, "p4", "c3", "Alta", 0], ["cl02", "it31", "s2", -2, "p3", "c1", "Normal", 0], ["cl05", "it32", "s1", 14, "p1", "c2", "Normal", 0],
    ["cl07", "it30", "s4", -6, "p5", "c4", "Urgente", 0], ["cl03", "it29", "s5", -1, "p7", "c6", "Alta", 1], ["cl04", "it29", "s3", 5, "p2", "c2", "Normal", 0], ["cl06", "it29", "s4", -3, "p5", "c4", "Alta", 1],
    ["cl04", "it33", "s2", 11, "p3", "c1", "Normal", 0], ["cl06", "it34", "s1", 20, "p1", "c2", "Baixa", 0], ["cl05", "it31", "s1", 25, "p3", "c1", "Normal", 0], ["cl08", "it30", "s3", 9, "p8", "c3", "Normal", 0]];
  const liveOps = [];
  for (const [k, [cli, it, st, need, resp, wc, prio, produced]] of live.entries()) {
    const qty = k === 6 ? 2 : 1;
    const o = await order({ cli, lines: [[it, qty, price(it)]], status: "APROVADO", prod: "EM_PRODUCAO", issue: D(Math.min(need - 25, -6)), delivery: D(need), k, place: k % 2 ? "Entrega no cliente" : null, custom: { [CF1]: ["VW Delivery 11.180", "Accelo 1016", "Constellation 17.190", "Hyundai HR"][k % 4] } });
    liveOps.push({ ...(await op({ so: o.id, cli, it, qty, stage: st, need: D(need), start: D(Math.min(need - 20, -4)), resp, wc, prio, produced, created: D(Math.min(need - 25, -6)) })), cli, it, produced });
  }
  for (const [i, sk, w, pk] of [[6, "s3", "c2", "p2"], [1, "s3", "c3", "p8"], [11, "s3", "c3", "p10"]])
    await ins("time_entries", { productionOrderId: liveOps[i].id, stageId: S[sk], workCenterId: C[w], memberId: PE[pk], date: TODAY, start: "07:00", end: null, breakMinutes: 0, hours: 0, notes: "Em andamento" });

  // aprovados aguardando decisão da produção
  await order({ cli: "cl06", lines: [["it30", 2, price("it30")]], status: "APROVADO", prod: "PENDENTE", issue: D(-2), delivery: D(30), k: 0, place: "Av. Salgado Filho, 3200 · Natal/RN" });
  await order({ cli: "cl08", lines: [["it34", 1, price("it34")], ["it28", 10, 24.9]], status: "APROVADO", prod: "PENDENTE", issue: D(-1), delivery: D(25), k: 1 });
  // venda de peça do estoque: produção marcou como sem necessidade, pronto para faturar
  await order({ cli: "cl07", lines: [["it26", 10, 29], ["it28", 4, 24.9]], status: "APROVADO", prod: "NAO_NECESSITA", issue: D(-3), delivery: D(2), k: 2 });
  // propostas
  const prop1 = await order({ cli: "cl05", lines: [["it29", 2, price("it29")], ["it01", 2, 210]], status: "PROPOSTA", prod: null, issue: D(-2), delivery: D(40), k: 1 });
  await order({ cli: "cl02", lines: [["it33", 1, price("it33")]], status: "PROPOSTA", prod: null, issue: D(-20), delivery: D(35), k: 3 });
  await order({ cli: "cl01", lines: [["it29", 3, price("it29"), 4]], status: "PROPOSTA", prod: null, issue: D(-1), delivery: D(45), k: 0, place: "Rod. CE-356, km 4 · Russas/CE" });

  // ---------- montagens a partir das OPs produzidas ----------
  for (const x of liveOps.filter((o) => o.produced > 0)) {
    const id = await ins("assemblies", { number: ++asmN, name: `${x.it === "it29" ? "Furgão 6200" : "Carroceria"} · ${x.cli === "cl03" ? "Via Diesel" : "Supermercado Potiguar"}`, productionOrderId: x.id, qty: 1, partnerId: P[x.cli],
      address: "Fábrica, box 3", responsibleId: PE.p4, startDate: D(-6), dueDate: x.cli === "cl03" ? D(1) : D(-1) });
    const loc = await ins("assembly_locations", { assemblyId: id, name: x.cli === "cl03" ? "Veículo RGA2F34 · Accelo 1016" : "Veículo SJD1E88 · VW Delivery", type: "Veículo", stageId: AS.a2, installerId: PE.p8, helperId: PE.p9 });
    await ins("assembly_parts", { assemblyId: id, locationId: loc, itemId: IT[x.it], qty: 1, qtyDone: 1 });
    await ins("assembly_parts", { assemblyId: id, locationId: loc, itemId: IT.it26, qty: 8, qtyDone: x.cli === "cl03" ? 8 : 5 });
    await ins("assembly_parts", { assemblyId: id, locationId: loc, itemId: IT.it25, qty: 2, qtyDone: x.cli === "cl03" ? 2 : 0 });
    await ins("assembly_parts", { assemblyId: id, locationId: loc, description: "Faixas refletivas (kit)", qty: 1, qtyDone: 0 });
  }

  async function asm({ op, name, cli, address, resp, start, due, completed = null, notes = null, locs }) {
    const id = await ins("assemblies", { number: ++asmN, name, productionOrderId: op, qty: 1, partnerId: P[cli], address, responsibleId: PE[resp], startDate: start, dueDate: due, completedAt: completed, notes });
    let pos = 0;
    const add = async (parentId, [lname, type, stage, inst, help, parts, kids]) => {
      const lid = await ins("assembly_locations", { assemblyId: id, parentId, name: lname, type, stageId: stage ? AS[stage] : null, installerId: inst ? PE[inst] : null, helperId: help ? PE[help] : null, position: pos++ });
      for (const [it, desc, q, done] of parts ?? []) await ins("assembly_parts", { assemblyId: id, locationId: lid, itemId: it ? IT[it] : null, description: it ? null : desc, qty: q, qtyDone: done });
      for (const k of kids ?? []) await add(lid, k);
    };
    for (const l of locs) await add(null, l);
    return id;
  }
  const histOps = (await c.query("select id, partner_id, item_id from production_orders where completed_at is not null order by number")).rows;
  const opOf = (cli, it) => histOps.find((o) => o.partner_id === P[cli] && o.item_id === IT[it])?.id ?? histOps[0].id;
  // entregue: furgão para o Vale do Jaguaribe
  await asm({ op: opOf("cl01", "it29"), name: "Furgão 6200 · Vale do Jaguaribe", cli: "cl01", address: "Fábrica, box 3", resp: "p7", start: D(-26), due: D(-8), completed: D(-7),
    locs: [["Veículo PRT5C67 · Constellation 17.190", "Veículo", "a4", "p8", "p9", [["it29", "", 1, 1], ["it26", "", 8, 8], ["it24", "", 4, 4], ["it25", "", 2, 2]]]] });
  // com pendência: cliente retira na fábrica
  await asm({ op: opOf("cl03", "it30"), name: "Carroceria fechada · Via Diesel", cli: "cl03", address: "Fábrica, box 4", resp: "p4", start: D(-9), due: D(-2), notes: "Cliente retira na fábrica",
    locs: [["Veículo QFX7C19 · Hyundai HR", "Veículo", "a3", "p4", "p9", [["it30", "", 1, 1], ["it26", "", 6, 2], ["it01", "", 1, 0]]]] });
  // obra com níveis: andar → apartamento → ambiente
  await asm({ op: opOf("cl04", "it32"), name: "Residencial Ponta Negra · Torre A", cli: "cl08", address: "Av. Eng. Roberto Freire, Natal/RN", resp: "p1", start: D(-10), due: D(18),
    notes: "Exemplo de obra com andares, apartamentos e ambientes",
    locs: [
      ["1º andar", "Andar", null, null, null, [], [
        ["Apto 101", "Apartamento", null, null, null, [], [
          ["Cozinha", "Ambiente", "a4", "p10", "p9", [[null, "Armário aéreo 1200 mm", 3, 3], [null, "Balcão de pia 1800 mm", 1, 1], [null, "Torre quente", 1, 1]]],
          ["Banheiro social", "Ambiente", "a2", "p10", "p9", [[null, "Gabinete 800 mm", 1, 1], [null, "Espelheira", 1, 0]]]]],
        ["Apto 102", "Apartamento", null, null, null, [], [
          ["Cozinha", "Ambiente", "a3", "p4", "p9", [[null, "Armário aéreo 1200 mm", 3, 1], [null, "Balcão de pia 1800 mm", 1, 0], [null, "Torre quente", 1, 0]]]]]]],
      ["2º andar", "Andar", null, null, null, [], [
        ["Apto 201", "Apartamento", null, null, null, [], [
          ["Cozinha", "Ambiente", "a1", "p10", "p9", [[null, "Armário aéreo 1200 mm", 3, 0], [null, "Balcão de pia 1800 mm", 1, 0], [null, "Torre quente", 1, 0]]],
          ["Suíte", "Ambiente", "a1", "p8", "p9", [[null, "Guarda-roupa 3 portas", 1, 0], [null, "Cabeceira estofada", 1, 0]]]]]]]] });

  // ---------- compras: solicitações e cotação ----------
  const r1 = await ins("purchase_requests", { number: 1, requester: "Francisco Lima", department: "Produção", needDate: D(8), status: "APROVADA", notes: "Material para as OPs da próxima semana" });
  await ins("purchase_request_items", { requestId: r1, itemId: IT.it16, qty: 30 });
  await ins("purchase_request_items", { requestId: r1, itemId: IT.it15, qty: 20 });
  const r2b = await ins("purchase_requests", { number: 2, requester: "Almoxarifado", department: "Almoxarifado", needDate: D(15), status: "ABERTA" });
  await ins("purchase_request_items", { requestId: r2b, itemId: IT.it27, qty: 50, notes: "Disco para a serra" });
  await ins("purchase_request_items", { requestId: r2b, itemId: IT.it28, qty: 30 });
  const r3 = await ins("purchase_requests", { number: 3, requester: "Marcos Dantas", department: "Pintura", needDate: D(5), status: "EM_COTACAO" });
  await ins("purchase_request_items", { requestId: r3, itemId: IT.it21, qty: 12 });
  await ins("purchase_request_items", { requestId: r3, itemId: IT.it22, qty: 8 });
  const q = await ins("quotations", { number: 1, date: D(-2), dueDate: D(3), status: "ABERTA", requestIds: [r3], notes: "Solicitação 3" });
  const qi1 = await ins("quotation_items", { quotationId: q, itemId: IT.it21, qty: 12, position: 0 });
  const qi2 = await ins("quotation_items", { quotationId: q, itemId: IT.it22, qty: 8, position: 1 });
  const qs1 = await ins("quotation_suppliers", { quotationId: q, partnerId: P.f04, freight: 0, paymentTerms: "28 dias", deliveryDays: 5 });
  const qs2 = await ins("quotation_suppliers", { quotationId: q, partnerId: P.cl04, freight: 120, paymentTerms: "30/60", deliveryDays: 8 });
  await ins("quotation_prices", { quotationId: q, quotationItemId: qi1, quotationSupplierId: qs1, unitPrice: 186.5 });
  await ins("quotation_prices", { quotationId: q, quotationItemId: qi1, quotationSupplierId: qs2, unitPrice: 179.9 });
  await ins("quotation_prices", { quotationId: q, quotationItemId: qi2, quotationSupplierId: qs1, unitPrice: 161 });
  await ins("quotation_prices", { quotationId: q, quotationItemId: qi2, quotationSupplierId: qs2, unitPrice: 168 });

  // ---------- despesas fixas ----------
  for (const mo of [-3, -2, -1, 0, 1]) for (const [d, day, v, cat] of [["Folha de pagamento", 5, 41800, "Folha de pagamento"], ["Energia elétrica", 10, 6300 + mo * 120, "Energia"], ["Aluguel do galpão", 15, 9500, "Aluguel"], ["Impostos (DAS)", 20, 12400 + mo * 300, "Impostos"]]) {
    const venc = M(mo, day); const paid = venc < TODAY;
    await ins("fin_titles", { kind: "PAGAR", description: d, categoryId: CAT[cat], issueDate: M(mo, 1), dueDate: venc, amount: v, status: paid ? "PAGO" : "ABERTO", paidAt: paid ? venc : null, paidAmount: paid ? v : null,
      bankAccountId: paid ? BK : null, paymentMethodId: PM["Transferência"], installment: "1/1", originType: "MANUAL", responsibleId: RSP, situationId: !paid && mo === 0 ? SIT.Agendado : null });
  }
  await ins("bank_entries", { bankAccountId: BK, date: D(-10), description: "Tarifa de manutenção de conta", amount: -89.9 });
  await ins("bank_entries", { bankAccountId: BK, date: D(-30), description: "Transferência para o caixa", amount: -2000 });
  await ins("bank_entries", { bankAccountId: BK2, date: D(-30), description: "Transferência do banco", amount: 2000 });

  // ---------- CRM ----------
  const deals = [["Frota de 5 furgões refrigerados", "cl06", null, "ng", 245000, 12, "Cliente antigo"], ["Renovação da frota · 3 carrocerias abertas", "cl05", null, "p", 59400, 20, "Indicação"],
    ["Basculante para obra em Parnamirim", "cl08", null, "q", 38800, 30, "Site"], ["Carroceria para caminhão novo", null, ["Distribuidora Sertão", "Paulo Henrique", "(84) 99123-4567"], "n", 22000, 25, "Telefone"],
    ["Baú lonado para transportadora", "tr01", null, "q", 31000, 18, "Feira ou evento"], ["2 furgões 6200 para a Via Diesel", "cl03", null, "w", 101600, -5, "Cliente antigo"],
    ["Carroceria madeira PU", "cl02", null, "l", 26100, -12, "Representante"], ["Sobre grade bovino", null, ["Fazenda Boa Vista", "Seu Antônio", "(83) 98765-0001"], "p", 18700, 9, "Indicação"]];
  let dn = 0;
  for (const [title, cli, lead, st, value, close, source] of deals) {
    const did = await ins("crm_deals", { number: ++dn, title, partnerId: cli ? P[cli] : null, leadCompany: lead?.[0] ?? null, leadName: lead?.[1] ?? null, leadPhone: lead?.[2] ?? null, stageId: CRM[st], value, expectedClose: D(close),
      ownerId: adminId, source, closedAt: st === "w" || st === "l" ? D(close) : null, lostReason: st === "l" ? "Preço acima do concorrente" : null, salesOrderId: dn === 2 ? prop1.id : null });
    if (st !== "w" && st !== "l") {
      await ins("crm_activities", { dealId: did, partnerId: cli ? P[cli] : null, type: "Ligação", subject: "Primeiro contato e levantamento da necessidade", dueDate: D(-8), done: true, ownerName: "Carlos Andrade" });
      await ins("crm_activities", { dealId: did, partnerId: cli ? P[cli] : null, type: dn % 2 ? "Visita" : "WhatsApp", subject: dn % 2 ? "Visita técnica para medir o chassi" : "Enviar fotos de carrocerias já entregues", dueDate: D(dn % 3 === 0 ? -2 : dn), done: false, ownerName: "Carlos Andrade" });
    }
  }

  // ---------- numeração ----------
  for (const [key, table] of [["sales_order", "sales_orders"], ["production_order", "production_orders"], ["purchase_order", "purchase_orders"], ["assembly", "assemblies"], ["crm_deal", "crm_deals"], ["purchase_request", "purchase_requests"], ["quotation", "quotations"]])
    await c.query(`insert into sequences (tenant_id, key, value) select $1, $2, coalesce(max(number), 0) from ${table}`, [tid, key]);

  await c.query("commit");
  console.log(`Empresa de demonstração criada: ${slug}.${process.env.ROOT_DOMAIN ?? "SEU_DOMINIO"}`);
  console.log(`Administrador: ${email}  Senha: ${pass}`);
  console.log(`Outros usuários (mesma senha): vendas@${email.split("@")[1]} (Comercial), pcp@${email.split("@")[1]} (PCP), financeiro@${email.split("@")[1]} (Financeiro)`);
} catch (err) {
  await c.query("rollback").catch(() => {});
  console.error("Falhou:", err.message); process.exitCode = 1;
} finally {
  c.release(); await db.end();
}
