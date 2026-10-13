import { redirect } from "next/navigation";

// as etapas do CRM foram retiradas com o CRM
export default function Page() {
  redirect("/comercial/configuracoes/vendedores");
}
