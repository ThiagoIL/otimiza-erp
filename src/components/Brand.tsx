import { LogoSymbol, LogoWordmark } from "./Logo";
/** Lado azul das telas de entrada, com a marca. */
export function BrandPanel({ tag }: { tag?: string }) {
  return (
    <section className="login-art">
      {tag && <span className="tag">{tag}</span>}
      <LogoSymbol width={220} dark />
      <div className="wm"><LogoWordmark height={64} dark /><span className="erp-pill on-dark" style={{ fontSize: 28 }}>ERP</span></div>
      <p>Gestão da fábrica do pedido à entrega: produção, estoque, compras e financeiro num só lugar.</p>
    </section>
  );
}
