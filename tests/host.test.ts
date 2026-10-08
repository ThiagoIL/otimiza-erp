import { describe, expect, it } from "vitest";
import { parseHost, validateSlug } from "../src/lib/host";

describe("parseHost", () => {
  const R = "otimizaerp.com.br";
  it("painel do sistema", () => expect(parseHost("admin.otimizaerp.com.br", R)).toEqual({ area: "admin" }));
  it("empresa", () => expect(parseHost("msuassuna.otimizaerp.com.br", R)).toEqual({ area: "tenant", slug: "msuassuna" }));
  it("domínio raiz e www", () => {
    expect(parseHost("otimizaerp.com.br", R)).toEqual({ area: "root" });
    expect(parseHost("www.otimizaerp.com.br", R)).toEqual({ area: "root" });
  });
  it("ignora maiúsculas e ponto final", () => expect(parseHost("MSuassuna.OtimizaERP.com.br.", R)).toEqual({ area: "tenant", slug: "msuassuna" }));
  it("recusa domínios de terceiros e subníveis", () => {
    expect(parseHost("evil.com", R).area).toBe("unknown");
    expect(parseHost("otimizaerp.com.br.evil.com", R).area).toBe("unknown");
    expect(parseHost("a.b.otimizaerp.com.br", R).area).toBe("unknown");
  });
  it("recusa subdomínios reservados", () => expect(parseHost("api.otimizaerp.com.br", R).area).toBe("unknown"));
  it("funciona com porta em desenvolvimento", () => expect(parseHost("demo.localhost:3000", "localhost:3000")).toEqual({ area: "tenant", slug: "demo" }));
});

describe("validateSlug", () => {
  it("aceita nomes válidos", () => expect(validateSlug("m-suassuna2")).toBeNull());
  it("recusa hífen nas pontas, maiúsculas e reservados", () => {
    expect(validateSlug("-abc")).not.toBeNull();
    expect(validateSlug("ABC")).not.toBeNull();
    expect(validateSlug("admin")).not.toBeNull();
  });
});
