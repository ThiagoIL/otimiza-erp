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
    for (const [code, name, unit, type, gid, min, cost, price, ncm] of itens) {
      await c.query("insert into items (id, tenant_id, code, name, unit, type, group_id, min_stock, cost, sale_price, ncm) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [newId(), tid, code, name, unit, type, gid, min, cost, price, ncm]);
    }
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
