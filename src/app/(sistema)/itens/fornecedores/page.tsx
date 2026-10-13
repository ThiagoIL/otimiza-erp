import { redirect } from "next/navigation";

// fornecedores agora ficam em Compras, no mesmo cadastro de clientes
export default function Page() {
  redirect("/compras/fornecedores");
}
