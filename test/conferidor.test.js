// node --test   (Node 18+, sem dependências)
import test from "node:test";
import assert from "node:assert/strict";
import { centavos, conferir, lerRespostaCalculadora, lerXmlNFe, ratear } from "../src/conferidor.js";

// Caso REAL medido em 18/11/2026 na Calculadora de Tributos oficial, regime regular 1.6.1:
// 3 itens com CBS, IBS UF e IBS Mun = 0,005 cada. Itens saem 0,00; totais 0,02/0,02/0,02 e vIBS 0,03.
const respostaCalculadora = {
  objetos: [1, 2, 3].map((n) => ({ nObj: n, tribCalc: { IBSCBS: { gIBSCBS: {
    gIBSUF: { vIBSUF: "0.00" }, gIBSMun: { vIBSMun: "0.00" }, vIBS: "0.00", gCBS: { vCBS: "0.00" } } } } })),
  total: { tribCalc: { IBSCBSTot: { vBCIBSCBS: "3.00",
    gIBS: { gIBSUF: { vIBSUF: "0.02" }, gIBSMun: { vIBSMun: "0.02" }, vIBS: "0.03" }, gCBS: { vCBS: "0.02" } } } },
};

function nfe(itens, tot) {
  const det = itens.map((i, k) => `<det nItem="${k + 1}"><prod><cProd>${k}</cProd></prod><imposto><IBSCBS><CST>000</CST>
    <gIBSCBS><vBC>100.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>${i[0]}</vIBSUF></gIBSUF>
    <gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>${i[1]}</vIBSMun></gIBSMun><vIBS>${i[2]}</vIBS>
    <gCBS><pCBS>0.90</pCBS><vCBS>${i[3]}</vCBS></gCBS></gIBSCBS></IBSCBS></imposto></det>`).join("");
  return `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe1">${det}
    <total><ICMSTot><vNF>1.00</vNF></ICMSTot><IBSCBSTot><vBCIBSCBS>100.00</vBCIBSCBS><gIBS><gIBSUF><vDif>0.00</vDif>
    <vDevTrib>0.00</vDevTrib><vIBSUF>${tot[0]}</vIBSUF></gIBSUF><gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib>
    <vIBSMun>${tot[1]}</vIBSMun></gIBSMun><vIBS>${tot[2]}</vIBS><vCredPres>0.00</vCredPres></gIBS>
    <gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${tot[3]}</vCBS></gCBS></IBSCBSTot></total></infNFe></NFe></nfeProc>`;
}

test("centavos sem ponto flutuante", () => {
  assert.equal(centavos("27.05"), 2705);
  assert.equal(centavos("27,05"), 2705);
  assert.equal(centavos("0.1"), 10);
  assert.equal(centavos("1234567890.99"), 123456789099);
  assert.throws(() => centavos("0.005")); // documento fiscal é 13v2
});

test("resposta real da calculadora: as 4 regras disparam", () => {
  const r = conferir(lerRespostaCalculadora(respostaCalculadora));
  assert.equal(r.ok, false);
  assert.deepEqual(r.achados.map((a) => a.rejeicao).sort(), [1080, 1084, 1085, 1091]);
  const cbs = r.achados.find((a) => a.campo === "vCBS");
  assert.equal(cbs.total, 2); assert.equal(cbs.somaItens, 0); assert.equal(cbs.diferenca, 2);
  assert.ok(r.avisos.some((a) => a.includes("Total: vIBS 0.03 difere de vIBSUF + vIBSMun (0.04)")));
});

test("XML equilibrado: nenhuma rejeição (controle negativo)", () => {
  const r = conferir(lerXmlNFe(nfe([["0.10", "0.00", "0.10", "0.90"], ["0.20", "0.00", "0.20", "1.80"]], ["0.30", "0.00", "0.30", "2.70"])));
  assert.equal(r.ok, true, JSON.stringify(r.achados));
  assert.equal(r.avisos.length, 0);
});

test("XML com o caso da issue #3 (CBS 27,06 x soma 27,05): só W56-10 dispara", () => {
  const r = conferir(lerXmlNFe(nfe([["0.00", "0.00", "0.00", "13.52"], ["0.00", "0.00", "0.00", "13.53"]], ["0.00", "0.00", "0.00", "27.06"])));
  assert.deepEqual(r.achados.map((a) => a.regra), ["W56-10"]);
  assert.equal(r.achados[0].diferenca, 1);
});

test("XML com prefixo de namespace também é lido", () => {
  const x = nfe([["0.10", "0.00", "0.10", "0.90"]], ["0.10", "0.00", "0.10", "0.90"]).replace(/<(\/?)(?!\?)/g, "<$1ns:");
  const lido = lerXmlNFe(x);
  assert.equal(lido.itens.length, 1); assert.equal(lido.totais.vCBS, 90);
});

test("rateio: 3 x 0,005 fecha com o total HALF_EVEN (0,02)", () => {
  const { itens, total } = ratear(["0.005", "0.005", "0.005"]);
  assert.equal(total, 2);
  assert.equal(itens.reduce((a, b) => a + b, 0), total);
  assert.deepEqual(itens, [1, 1, 0]); // maior resto; empate resolvido pela ordem
});

test("rateio: soma dos itens sempre igual ao total (100 itens de 0,0049)", () => {
  const { itens, total } = ratear(Array(100).fill("0.0049"));
  assert.equal(total, 49); // 0,49 exato
  assert.equal(itens.reduce((a, b) => a + b, 0), 49);
  assert.ok(itens.every((c) => c === 0 || c === 1));
});

test("rateio: valores já exatos em centavos não mudam", () => {
  assert.deepEqual(ratear(["13.52", "13.53"]), { itens: [1352, 1353], total: 2705 });
});
