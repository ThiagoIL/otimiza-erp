"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="view" style={{ margin: "80px auto", maxWidth: 560, textAlign: "center" }}>
      <h1>Algo deu errado</h1>
      <p className="muted">O erro foi registrado. Tente de novo; se continuar, informe ao suporte o código abaixo.</p>
      {error.digest && <p><span className="secret">{error.digest}</span></p>}
      <button className="btn btn-primary" onClick={reset}>Tentar de novo</button>
    </main>
  );
}
