import { requireTenantUser } from "@/lib/context";
import { FlowDiagram } from "@/components/FlowDiagram";

export async function FlowPage() {
  await requireTenantUser();
  return (
    <>
      <div className="ph"><div><h1>Fluxo do sistema</h1><p>Como um pedido passa pelos módulos, do cadastro do cliente até a montagem e o recebimento. Clique em uma etapa para abrir a tela.</p></div></div>
      <section className="panel"><div className="pb"><FlowDiagram /></div></section>
    </>
  );
}
