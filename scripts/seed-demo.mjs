// Cria a empresa de demonstração "demo" com um administrador e alguns itens. Opcional.
// Uso: DEMO_ADMIN_PASSWORD='DemoFabrica2026' node scripts/seed-demo.mjs   (sem a variável, gera uma senha)
import bcrypt from "bcryptjs";
import { pool, newId, passwordProblem, tempPassword } from "./_common.mjs";

const slug = process.env.DEMO_SLUG ?? "demo";
const email = (process.env.DEMO_ADMIN_EMAIL ?? "admin@demo.com.br").toLowerCase();
const pass = process.env.DEMO_ADMIN_PASSWORD ?? tempPassword();
const prob = passwordProblem(pass, email);
if (prob) { console.error(`DEMO_ADMIN_PASSWORD inválida: ${prob}.`); process.exit(1); }

const db = pool();
const c = await db.connect();
try {
  await c.query("begin");
  const ex = await c.query("select id from tenants where slug = $1", [slug]);
  if (ex.rows.length) { console.log(`A empresa "${slug}" já existe. Nada a fazer.`); await c.query("rollback"); }
  else {
    const tid = newId();
    await c.query("insert into tenants (id, slug, name, document) values ($1, $2, 'Carrocerias Demonstração Ltda', '12.345.678/0001-95')", [tid, slug]);
    await c.query(
      "insert into users (id, tenant_id, name, email, password_hash, role, must_change_password) values ($1, $2, 'Administrador Demo', $3, $4, 'TENANT_ADMIN', false)",
      [newId(), tid, email, await bcrypt.hash(pass, 12)],
    );
    // dados de negócio: informa a empresa para respeitar o Row Level Security
    await c.query("select set_config('app.tenant_id', $1, true)", [tid]);
    await c.query("set local role erp_app");
    const g = { chapas: newId(), fix: newId(), acab: newId() };
    await c.query("insert into item_groups (id, tenant_id, name) values ($1,$4,'Chapas e perfis'),($2,$4,'Fixação'),($3,$4,'Produtos acabados')", [g.chapas, g.fix, g.acab, tid]);
    const itens = [
      ["002.01.100.010", "CHAPA AÇO CARBONO 2,00MM 1200X3000", "PC", "MATERIA_PRIMA", g.chapas, 20, 385, 0, "72091700"],
      ["002.05.100.001", "PERFIL U ENRIJECIDO 100X50X17X2,00MM 6M", "PC", "MATERIA_PRIMA", g.chapas, 30, 142, 0, "72163100"],
      ["003.02.100.001", "PARAFUSO SEXTAVADO 3/8\" X 1\" ZINCADO", "UN", "MATERIA_PRIMA", g.fix, 500, 0.62, 0, "73181500"],
      ["003.02.100.004", "PORCA SEXTAVADA 3/8\" ZINCADA", "UN", "MATERIA_PRIMA", g.fix, 500, 0.28, 0, "73181600"],
      ["100.21.062", "CARROCERIA ABERTA CARGA SECA MADEIRA PU - 6200", "UN", "PRODUTO_ACABADO", g.acab, 0, 19700, 26100, "87079090"],
      ["020.30.062", "CARROCERIA FECHADA - FURGÃO CS 6200X2300X2300", "UN", "PRODUTO_ACABADO", g.acab, 0, 38500, 50800, "87079090"],
    ];
    const it = {};
    for (const [code, name, unit, type, gid, min, cost, price, ncm] of itens) {
      it[code] = newId();
      await c.query("insert into items (id, tenant_id, code, name, unit, type, group_id, min_stock, cost, sale_price, ncm) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [it[code], tid, code, name, unit, type, gid, min, cost, price, ncm]);
    }
    await seedModules(c, tid, it);
    await c.query("commit");
    console.log(`Empresa de demonstração criada: ${slug}.${process.env.ROOT_DOMAIN ?? "SEU_DOMINIO"}`);
    console.log(`Administrador: ${email}  Senha: ${pass}`);
  }
} catch (err) {
  await c.query("rollback").catch(() => {});
  console.error("Falhou:", err.message); process.exitCode = 1;
} finally {
  c.release(); await db.end();
}

/** Dados de exemplo dos módulos: estoque, produção, comercial, montagens e contas a receber. */
async function seedModules(c, tid, it) {
  const q = (sql, params) => c.query(sql, params);
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const loc = { alm: newId(), exp: newId() };
  await q("insert into stock_locations (id, tenant_id, name, description, is_default) values ($1,$3,'Almoxarifado','Matéria-prima e fixação',true),($2,$3,'Expedição','Produtos prontos para entrega',false)", [loc.alm, loc.exp, tid]);

  // saldos iniciais por movimentação de entrada (o saldo fica coerente com o histórico)
  const saldo = {};
  const move = async (kind, origin, code, local, qty, extra = {}) => {
    const key = `${code}|${local}`;
    saldo[key] = (saldo[key] ?? 0) + (kind === "ENTRADA" ? qty : -qty);
    await q(`insert into stock_balances (id, tenant_id, item_id, location_id, quantity) values ($1,$2,$3,$4,$5)
      on conflict (tenant_id, item_id, location_id) do update set quantity = $5`, [newId(), tid, it[code], local, saldo[key]]);
    await q(`insert into stock_movements (id, tenant_id, kind, origin, item_id, location_id, quantity, balance_after, production_order_id, document, user_name, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Administrador Demo', now() - ($11 || ' days')::interval)`,
      [newId(), tid, kind, origin, it[code], local, qty, saldo[key], extra.op ?? null, extra.doc ?? null, String(extra.ago ?? 10)]);
  };
  await move("ENTRADA", "MANUAL", "002.01.100.010", loc.alm, 26, { doc: "NF 4512", ago: 20 });
  await move("ENTRADA", "MANUAL", "002.05.100.001", loc.alm, 18, { doc: "NF 4512", ago: 20 });
  await move("ENTRADA", "MANUAL", "003.02.100.001", loc.alm, 1500, { doc: "NF 881", ago: 15 });
  await move("ENTRADA", "MANUAL", "003.02.100.004", loc.alm, 400, { doc: "NF 881", ago: 15 });

  // produção: etapas, situações, centros e equipe
  const st = { prog: newId(), prod: newId(), acab: newId(), insp: newId(), fim: newId() };
  await q(`insert into production_stages (id, tenant_id, name, position, color, is_final) values
    ($1,$6,'Programada',1,'#5F6B78',false),($2,$6,'Corte e solda',2,'#2557A0',false),($3,$6,'Pintura',3,'#8F6200',false),
    ($4,$6,'Montagem final',4,'#7A4FB0',false),($5,$6,'Concluída',5,'#2E7D4F',true)`, [st.prog, st.prod, st.acab, st.insp, st.fim, tid]);
  const ss = { normal: newId(), mat: newId(), parada: newId() };
  await q(`insert into production_statuses (id, tenant_id, name, color, is_alert, is_default) values
    ($1,$4,'Normal','#2E7D4F',false,true),($2,$4,'Aguardando material','#8F6200',true,false),($3,$4,'Parada','#B3261E',true,false)`, [ss.normal, ss.mat, ss.parada, tid]);
  const wc = { solda: newId(), pint: newId(), mont: newId() };
  await q("insert into work_centers (id, tenant_id, name, description) values ($1,$4,'Solda','Corte, dobra e solda'),($2,$4,'Pintura','Cabine de pintura PU'),($3,$4,'Montagem','Montagem final e acabamento')", [wc.solda, wc.pint, wc.mont, tid]);
  const tm = { carlos: newId(), joana: newId(), pedro: newId(), luis: newId(), rafa: newId() };
  await q(`insert into team_members (id, tenant_id, name, role, work_center_id) values
    ($1,$6,'Carlos Souza','Líder de solda',$7),($2,$6,'Joana Lima','Pintora',$8),($3,$6,'Pedro Alves','Montador',$9),
    ($4,$6,'Luís Ferreira','Montador',$9),($5,$6,'Rafael Costa','Auxiliar de montagem',$9)`,
    [tm.carlos, tm.joana, tm.pedro, tm.luis, tm.rafa, tid, wc.solda, wc.pint, wc.mont]);

  // clientes e fornecedores (um mesmo cadastro pode ser cliente e fornecedor)
  const pt = { trans: newId(), agro: newId(), aco: newId(), log: newId() };
  await q(`insert into partners (id, tenant_id, person_type, name, trade_name, document, is_customer, is_supplier, is_carrier, phone, city, state) values
    ($1,$5,'PJ','Transportes Rota Sul Ltda','Rota Sul','11222333000181',true,false,true,'(51) 3333-1000','Porto Alegre','RS'),
    ($2,$5,'PJ','Agropecuária Campo Verde S.A.','Campo Verde','45723174000110',true,false,false,'(54) 3222-2000','Passo Fundo','RS'),
    ($3,$5,'PJ','Aço Forte Distribuidora Ltda','Aço Forte','33000167000101',false,true,false,'(11) 4000-3000','São Paulo','SP'),
    ($4,$5,'PJ','LogMax Transportes e Comércio Ltda','LogMax','60701190000104',true,true,true,'(41) 3555-4000','Curitiba','PR')`,
    [pt.trans, pt.agro, pt.aco, pt.log, tid]);

  // pedidos de venda com itens e parcelas
  const so = async (n, cust, status, issue, deliv, lines, pay, inst, discount = 0) => {
    const id = newId();
    const sub = lines.reduce((a, [, qty, price]) => a + qty * price, 0);
    const total = sub - discount;
    await q(`insert into sales_orders (id, tenant_id, number, customer_id, status, issue_date, delivery_date, payment_method, installments, first_due_days, interval_days, subtotal, discount, total, seller_name, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,30,30,$10,$11,$12,'Marina Vendas','Administrador Demo')`, [id, tid, n, cust, status, day(issue), day(deliv), pay, inst, sub, discount, total]);
    for (const [i, [code, qty, price]] of lines.entries()) {
      await q("insert into sales_order_items (id, tenant_id, order_id, line, item_id, quantity, unit_price, discount_pct, total) values ($1,$2,$3,$4,$5,$6,$7,0,$8)", [newId(), tid, id, i + 1, it[code], qty, price, qty * price]);
    }
    if (status !== "ORCAMENTO") {
      const base = Math.floor((total / inst) * 100) / 100;
      for (let i = 0; i < inst; i++) {
        const amount = i === 0 ? Math.round((total - base * (inst - 1)) * 100) / 100 : base;
        const due = issue + 30 + i * 30;
        await q("insert into receivables (id, tenant_id, sales_order_id, customer_id, installment, installments_total, due_date, amount, payment_method, paid_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [newId(), tid, id, cust, i + 1, inst, day(due), amount, pay, due < -5 ? day(due) : null]);
      }
    }
    return id;
  };
  const pv1 = await so(1, pt.trans, "EM_PRODUCAO", -40, -3, [["100.21.062", 2, 26100]], "BOLETO", 3, 1200);
  const pv2 = await so(2, pt.agro, "EM_PRODUCAO", -12, 18, [["020.30.062", 1, 50800], ["100.21.062", 1, 26100]], "PIX", 2);
  await so(3, pt.log, "APROVADO", -4, 30, [["020.30.062", 2, 50800]], "BOLETO", 4);
  await so(4, pt.agro, "ORCAMENTO", -20, 40, [["100.21.062", 3, 25500]], "BOLETO", 3);

  // ordens de produção ligadas aos pedidos, com materiais e retiradas
  const op = async (n, code, qty, stage, status, center, resp, pv, start, due, produced = 0) => {
    const id = newId();
    await q(`insert into production_orders (id, tenant_id, number, item_id, quantity, produced_qty, stage_id, status_id, work_center_id, responsible_id, sales_order_id, priority, start_date, due_date, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,2,$12,$13,'Administrador Demo')`, [id, tid, n, it[code], qty, produced, stage, status, center, resp, pv, day(start), day(due)]);
    return id;
  };
  const mats = async (opId, list) => { for (const [code, qty] of list) await q("insert into production_order_materials (id, tenant_id, order_id, item_id, quantity) values ($1,$2,$3,$4,$5)", [newId(), tid, opId, it[code], qty]); };
  const o1 = await op(1, "100.21.062", 2, st.acab, ss.normal, wc.pint, tm.joana, pv1, -30, -3);
  await mats(o1, [["002.01.100.010", 8], ["002.05.100.001", 6], ["003.02.100.001", 240], ["003.02.100.004", 240]]);
  for (const [code, qty] of [["002.01.100.010", 8], ["002.05.100.001", 6], ["003.02.100.001", 240], ["003.02.100.004", 240]]) await move("SAIDA", "CONSUMO_OP", code, loc.alm, qty, { op: o1, doc: "OP 00001", ago: 25 });
  const o2 = await op(2, "020.30.062", 1, st.prod, ss.mat, wc.solda, tm.carlos, pv2, -8, 14);
  await mats(o2, [["002.01.100.010", 14], ["002.05.100.001", 10], ["003.02.100.001", 400]]);
  await move("SAIDA", "CONSUMO_OP", "002.01.100.010", loc.alm, 6, { op: o2, doc: "OP 00002", ago: 5 });
  const o3 = await op(3, "100.21.062", 1, st.prog, ss.normal, wc.solda, null, pv2, 2, 16);
  await mats(o3, [["002.01.100.010", 4], ["002.05.100.001", 3]]);
  const o4 = await op(4, "100.21.062", 1, st.fim, ss.normal, wc.mont, tm.pedro, null, -25, -10, 1);
  await q("update production_orders set finished_at = now() - interval '9 days' where id = $1", [o4]);
  await move("ENTRADA", "PRODUCAO_OP", "100.21.062", loc.exp, 1, { op: o4, doc: "OP 00004", ago: 9 });

  // montagem: obra com andares e apartamentos; peças a montar
  const mt = newId();
  await q(`insert into assemblies (id, tenant_id, number, name, customer_id, sales_order_id, address, status, start_date, due_date)
    values ($1,$2,1,'Residencial Jardins · Bloco A',$3,$4,'Rua das Acácias, 120 · Passo Fundo/RS','EM_ANDAMENTO',$5,$6)`, [mt, tid, pt.agro, pv2, day(-6), day(20)]);
  const area = async (name, parent, assembler, helper, due) => { const id = newId(); await q("insert into assembly_areas (id, tenant_id, assembly_id, parent_id, name, assembler_id, helper_id, due_date) values ($1,$2,$3,$4,$5,$6,$7,$8)", [id, tid, mt, parent, name, assembler, helper, due === null ? null : day(due)]); return id; };
  const piece = async (areaId, desc, qty, done) => q("insert into assembly_pieces (id, tenant_id, area_id, description, quantity, done_at, done_by) values ($1,$2,$3,$4,$5,$6,$7)", [newId(), tid, areaId, desc, qty, done ? new Date() : null, done ? "Pedro Alves" : null]);
  const a1 = await area("1º andar", null, null, null, null);
  const a101 = await area("Apto 101", a1, tm.pedro, tm.rafa, 5);
  const a102 = await area("Apto 102", a1, tm.luis, null, 9);
  const a2 = await area("2º andar", null, null, null, null);
  const a201 = await area("Apto 201", a2, null, null, 15);
  for (const [aid, done] of [[a101, 4], [a102, 1], [a201, 0]]) {
    const list = [["Armário de cozinha", 1], ["Guarda-roupa casal", 1], ["Gabinete de banheiro", 2], ["Painel de TV", 1], ["Prateleira", 4]];
    for (const [i, [d, qty]] of list.entries()) await piece(aid, d, qty, i < done);
  }
}
