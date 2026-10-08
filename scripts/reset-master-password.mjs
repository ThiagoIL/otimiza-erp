// Recuperação de acesso da conta master, para quem tem acesso ao servidor (console do Easypanel).
// Uso: NEW_PASSWORD='NovaSenhaForte2026' node scripts/reset-master-password.mjs
// A senha nunca fica vazia: o script só troca por outra que siga a política.
import bcrypt from "bcryptjs";
import { pool, newId, passwordProblem } from "./_common.mjs";

const pass = process.env.NEW_PASSWORD ?? "";
const db = pool();
try {
  const { rows } = await db.query("select id, email from users where is_master limit 1");
  if (!rows.length) { console.error("Não há conta master. Rode o bootstrap."); process.exitCode = 1; }
  else {
    const prob = passwordProblem(pass, rows[0].email);
    if (prob) { console.error(`NEW_PASSWORD inválida: ${prob}.`); process.exitCode = 1; }
    else {
      await db.query(
        "update users set password_hash = $1, password_changed_at = now(), failed_logins = 0, locked_until = null, must_change_password = false where id = $2",
        [await bcrypt.hash(pass, 12), rows[0].id],
      );
      await db.query("delete from sessions where user_id = $1", [rows[0].id]);
      await db.query(`insert into audit_logs (id, action, user_id, user_email, data) values ($1, 'master.senha_redefinida', $2, $3, '{"origem":"console do servidor"}')`, [newId(), rows[0].id, rows[0].email]);
      console.log(`Senha da conta master (${rows[0].email}) redefinida. Sessões encerradas.`);
    }
  }
} catch (err) {
  console.error("Falhou:", err.message); process.exitCode = 1;
} finally {
  await db.end();
}
