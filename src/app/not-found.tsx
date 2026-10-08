import Link from "next/link";
export default function NotFound() {
  return (
    <main className="view" style={{ margin: "80px auto", maxWidth: 520, textAlign: "center" }}>
      <h1>Página não encontrada</h1>
      <p className="muted">O endereço não existe ou você não tem acesso a ele.</p>
      <Link className="btn" href="/">Ir para o início</Link>
    </main>
  );
}
