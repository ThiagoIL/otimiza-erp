import { redirect } from "next/navigation";

// o prefixo do código agora fica no cadastro do grupo
export default function Page() {
  redirect("/itens/grupos");
}
