import Link from "next/link";
import type { User } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/rules";
import { fmtDateTime } from "@/lib/format";

export function UserTable({ users, hrefBase, selfId }: { users: User[]; hrefBase: string; selfId?: string }) {
  if (!users.length) return <div className="tbl solo"><div className="empty"><strong>Nenhum usuário</strong>Cadastre o primeiro usuário.</div></div>;
  const now = new Date();
  return (
    <div className="tbl solo">
      <table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Nível</th><th>Situação</th><th>Último acesso</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><Link className="row-link" href={`${hrefBase}/${u.id}`}>{u.name}</Link>{u.id === selfId && <> <span className="badge">você</span></>}{u.isMaster && <> <span className="badge brand">master</span></>}</td>
              <td>{u.email}</td>
              <td>{ROLE_LABEL[u.role]}</td>
              <td>{u.status !== "ACTIVE" ? <span className="badge bad">Inativo</span> : u.lockedUntil && u.lockedUntil > now ? <span className="badge warn">Bloqueado</span> : <span className="badge ok">Ativo</span>}</td>
              <td>{fmtDateTime(u.lastLoginAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
