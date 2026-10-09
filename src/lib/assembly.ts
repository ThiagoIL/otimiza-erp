/** Montagens: funções puras, sem banco. */

/** "3x Porta de correr" ou "Porta de correr": uma peça por linha. */
export function parsePieces(text: string): { description: string; quantity: number }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 200).map((l) => {
    const m = /^(\d+(?:[.,]\d+)?)\s*x\s+(.+)$/i.exec(l);
    return m ? { description: m[2].slice(0, 160), quantity: Number(m[1].replace(",", ".")) || 1 } : { description: l.slice(0, 160), quantity: 1 };
  });
}

/** Progresso de montagem (0 a 1) a partir das peças montadas. */
export function progress(done: number, total: number): number {
  return total > 0 ? Math.min(1, done / total) : 0;
}
