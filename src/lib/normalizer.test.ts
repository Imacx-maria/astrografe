import { describe, it, expect } from "vitest";
import { normalizeText } from "./normalizer";

describe("normalizeText", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeText("linha1\r\nlinha2")).toBe("linha1\nlinha2");
  });

  it("joins mid-sentence line breaks (next line starts lowercase)", () => {
    const input = "Este produto é fabricado em\nplástico rígido de alta densidade.";
    const expected = "Este produto é fabricado em plástico rígido de alta densidade.";
    expect(normalizeText(input)).toBe(expected);
  });

  it("does NOT join lines when first ends with punctuation", () => {
    const input = "Entrega prevista: 10 dias.\nContacto: geral@empresa.pt";
    expect(normalizeText(input)).toBe(input);
  });

  it("does NOT join lines when next starts uppercase (new sentence)", () => {
    const input = "Impressão: 4/0.\nEspecificações técnicas adicionais.";
    expect(normalizeText(input)).toBe(input);
  });

  it("fixes soft hyphenation (word-\\nnext)", () => {
    const input = "plas-\ntificação couché";
    expect(normalizeText(input)).toBe("plastificação couché");
  });

  it("fixes hyphenation mid-compound (microcanelado\\nnext)", () => {
    const input = "microcanelado 1mm contracolado frente e verso por\ncouché 135grs";
    expect(normalizeText(input)).toBe("microcanelado 1mm contracolado frente e verso por couché 135grs");
  });

  it("preserves paragraph breaks (blank line between sections)", () => {
    const input = "Secção A: materiais\n\nSecção B: acabamentos";
    expect(normalizeText(input)).toBe("Secção A: materiais\n\nSecção B: acabamentos");
  });

  it("collapses multiple blank lines into one", () => {
    const input = "linha1\n\n\n\nlinha2";
    expect(normalizeText(input)).toBe("linha1\n\nlinha2");
  });

  it("trims leading/trailing whitespace from each line", () => {
    const input = "  Caixa individual  \n  com janela  ";
    expect(normalizeText(input)).toBe("Caixa individual com janela");
  });

  it("handles real portuguese quote fragment", () => {
    const input =
      "Caneta esferográfica em plástico ABS com\r\nmecanismo de clique, tinta azul,\r\ngravação laser 1 face.\r\n\r\nPreço unitário: 0,85€";
    const result = normalizeText(input);
    expect(result).toContain("Caneta esferográfica em plástico ABS com mecanismo de clique, tinta azul, gravação laser 1 face.");
    expect(result).toContain("Preço unitário: 0,85€");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeText("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeText("   ")).toBe("");
  });

  it("does NOT join lines when first line ends with colon (label: value pattern)", () => {
    const input = "Descrição:\ncaixa individual com janela";
    expect(normalizeText(input)).toBe("Descrição:\ncaixa individual com janela");
  });
});
