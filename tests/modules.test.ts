import { describe, expect, it } from "vitest";
import { installments, isValidCnpj, isValidCpf, lineTotal, orderTotals } from "../src/lib/sales";
import { activeTab } from "../src/lib/modules";
import { parsePieces } from "../src/lib/assembly";

describe("pedido de venda", () => {
  it("aplica o desconto percentual da linha", () => expect(lineTotal(3, 100, 10)).toBe(270));
  it("limita o desconto entre 0 e 100%", () => {
    expect(lineTotal(1, 50, 150)).toBe(0);
    expect(lineTotal(1, 50, -5)).toBe(50);
  });
  it("soma as linhas, tira o desconto geral e soma o frete", () => {
    expect(orderTotals([{ qty: 2, price: 10.5, disc: 0 }, { qty: 1, price: 100, disc: 5 }], 6, 20)).toEqual({ subtotal: 116, total: 130 });
  });
  it("total nunca fica negativo", () => expect(orderTotals([{ qty: 1, price: 10, disc: 0 }], 50, 0).total).toBe(0));
});

describe("parcelas", () => {
  it("a soma das parcelas bate com o total", () => {
    const p = installments(100, 3, "2026-01-31", 30, 30);
    expect(p.map((x) => x.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(p.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(100, 2);
  });
  it("vencimentos pela data de emissão, primeiro prazo e intervalo", () => {
    expect(installments(90, 3, "2026-03-10", 0, 15).map((x) => x.dueDate)).toEqual(["2026-03-10", "2026-03-25", "2026-04-09"]);
  });
  it("pagamento à vista gera uma parcela", () => expect(installments(50, 1, "2026-05-05", 0, 30)).toEqual([{ number: 1, dueDate: "2026-05-05", amount: 50 }]));
});

describe("documentos", () => {
  it("CNPJ válido e inválido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
  it("CPF válido e inválido", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
  });
});

describe("abas dos módulos", () => {
  const tabs = [{ href: "/producao" }, { href: "/producao/etapas" }, { href: "/producao/centros" }];
  it("a aba mais específica fica ativa", () => expect(activeTab(tabs, "/producao/etapas")).toBe("/producao/etapas"));
  it("telas internas ficam na aba principal", () => expect(activeTab(tabs, "/producao/abc123")).toBe("/producao"));
  it("não confunde prefixos parecidos", () => expect(activeTab(tabs, "/producaox")).toBeUndefined());
});

describe("peças da montagem", () => {
  it("lê uma peça por linha, com quantidade opcional", () => {
    expect(parsePieces("2x Porta de correr\n\n  Tampo de granito  \n1,5 x Rodapé")).toEqual([
      { description: "Porta de correr", quantity: 2 }, { description: "Tampo de granito", quantity: 1 }, { description: "Rodapé", quantity: 1.5 },
    ]);
  });
  it("não confunde número no nome com quantidade", () => expect(parsePieces("Armário 3 portas")).toEqual([{ description: "Armário 3 portas", quantity: 1 }]));
});
