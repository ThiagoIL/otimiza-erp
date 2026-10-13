import { redirect } from "next/navigation";

// o CRM foi retirado do sistema
export default function Page() {
  redirect("/pedidos");
}
