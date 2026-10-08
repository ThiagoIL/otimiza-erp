// Cria a conta master (administrador do sistema) se ainda não existir.
// Lê INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD.
// Roda automaticamente no início do container, depois das migrações. Sem as variáveis, não faz nada.
import bcrypt from "bcryptjs";
import { pool, newId, passwordProblem } from "./_common.mjs";

const name = (process.env.INITIAL_ADMIN_NAME ?? "Administrador").trim() || "Administrador";
const email = (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();
const pass = process.env.INITIAL_ADMIN_PASSWORD ?? "";
const db = pool();
try {
  const { rows } = await db.query("select email from users where is_master limit 1");
  if (rows.length) {
    console.log(`[bootstrap] conta master já existe (${rows[0].email}). Nada a fazer.`);
  } else if (!email || !pass) {
    console.log("[bootstrap] ainda não há conta master. Defina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD e reinicie para criá-la.");
  } else {
    const prob = passwordProblem(pass, email);
    if (prob) { console.error(`[bootstrap] INITIAL_ADMIN_PASSWORD inválida: ${prob}.`); process.exitCode = 1; }
    else {
      await db.query(
        `insert into users (id, tenant_id, name, email, password_hash, role, status, is_master, must_change_password)
         values ($1, null, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', true, false)`,
        [newId(), name, email, await bcrypt.hash(pass, 12)],
      );
      await db.query(`insert into audit_logs (id, action, user_email, data) values ($1, 'master.criado', $2, '{"origem":"bootstrap"}')`, [newId(), email]);
      console.log(`[bootstrap] conta master criada: ${email}. Por segurança, apague INITIAL_ADMIN_PASSWORD das variáveis de ambiente.`);
    }
  }
} catch (err) {
  console.error("[bootstrap] falhou:", err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
