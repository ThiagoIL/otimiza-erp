import { requestArea } from "@/lib/context";
import { AdminHome } from "@/views/admin/home";
import { TenantHome } from "@/views/tenant/home";
import { BrandPanel } from "@/components/Brand";

type SP = Promise<Record<string, string | undefined>>;
export default async function Inicio({ searchParams }: { searchParams: SP }) {
  const info = await requestArea();
  if (info.area === "admin") return <AdminHome />;
  if (info.area === "tenant") return <TenantHome />;
  return (
    <main className="login">
      <BrandPanel />
      <section className="login-side">
        <div className="login-form">
          <h1>Acesse a sua empresa</h1>
          <p className="lead">Cada empresa tem o próprio endereço, no formato <b>suaempresa.{process.env.ROOT_DOMAIN}</b>. Se não souber o seu, fale com o administrador da sua empresa.</p>
        </div>
      </section>
    </main>
  );
}
