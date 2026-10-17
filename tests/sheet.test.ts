import { describe, expect, it } from "vitest";
import { normHead, readSpreadsheet, sheetDate, sheetNum, sheetObjects } from "../src/lib/sheet";

describe("importação de planilha", () => {
  it("lê CSV com ponto e vírgula, aspas e BOM", async () => {
    const csv = "﻿Andar;Local;Quantidade\r\n1º andar;\"Janela \"\"A\"\"\";1,5\r\n\r\n";
    const o = sheetObjects(await readSpreadsheet(new TextEncoder().encode(csv), "m.csv"));
    expect(o.head).toEqual(["andar", "local", "quantidade"]);
    expect(o.rows).toEqual([{ andar: "1º andar", local: 'Janela "A"', quantidade: "1,5" }]);
  });
  it("lê CSV com vírgula", async () => {
    const o = sheetObjects(await readSpreadsheet(new TextEncoder().encode("Item,Qtd\nPA-010,3\n"), "ops.csv"));
    expect(o.rows[0]).toEqual({ item: "PA-010", qtd: "3" });
  });
  it("recusa o .xls antigo", async () => {
    await expect(readSpreadsheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), "velho.xls")).rejects.toThrow(/xlsx/);
  });
  it("converte números, datas e cabeçalhos", () => {
    expect(sheetNum("1.234,5")).toBe(1234.5);
    expect(sheetNum("12.5")).toBe(12.5);
    expect(Number.isNaN(sheetNum("abc"))).toBe(true);
    expect(sheetDate("31/12/2026")).toBe("2026-12-31");
    expect(sheetDate("46387")).toBe("2026-12-31");
    expect(sheetDate("2026-01-05")).toBe("2026-01-05");
    expect(normHead("Largura (mm)")).toBe("largura mm");
    expect(normHead("Observação")).toBe("observacao");
  });
});
