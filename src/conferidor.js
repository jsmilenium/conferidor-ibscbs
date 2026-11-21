// Conferidor de totais IBS/CBS (NF-e/NFC-e da Reforma Tributária) - sem dependências, roda no navegador e no Node.
// Base: NT 2025.002-RTC v1.53 (out/2026, publicada em 30/10/2026; regras iguais às da v1.52). Leiaute pág. 29 (grupo W34 IBSCBSTot: "deve ser informado com o somatório do
// campo correspondente dos itens"); regras de validação págs. 70-71:
//   W41-10 rejeição 1080 (vIBSUF), W46-10 rejeição 1084 (vIBSMun), W47-10 rejeição 1085 (vIBS), W56-10 rejeição 1091 (vCBS).
// Todo valor é tratado em CENTAVOS inteiros (nada de ponto flutuante na comparação).

/** "27.05" | "27,05" | 27.05 -> 2705. Aceita até 2 casas; mais casas = erro (valor de documento fiscal é 13v2). */
export function centavos(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const s = String(valor).trim().replace(",", ".");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`valor fora do formato 13v2: "${valor}"`);
  const [, sinal, int, dec = ""] = m;
  const c = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  return sinal ? -c : c;
}

export const reais = (c) => (c < 0 ? "-" : "") + (Math.abs(c) / 100).toFixed(2);

// Regras conferidas na NT (código da regra, rejeição, campo do total, texto da rejeição)
export const REGRAS = [
  { regra: "W41-10", rejeicao: 1080, campo: "vIBSUF", texto: "Total de IBS UF difere da soma dos itens" },
  { regra: "W46-10", rejeicao: 1084, campo: "vIBSMun", texto: "Total de IBS Municipal difere da soma dos itens" },
  { regra: "W47-10", rejeicao: 1085, campo: "vIBS", texto: "Total do IBS difere da soma do vIBS dos itens" },
  { regra: "W56-10", rejeicao: 1091, campo: "vCBS", texto: "Total de CBS difere da soma dos itens" },
];

// ---------- leitura do XML da NF-e (sem DOM: regex sobre a estrutura regular do leiaute) ----------
const semNs = (xml) => xml.replace(/<(\/?)[A-Za-z0-9_]+:/g, "<$1"); // tira prefixo de namespace, se houver

function bloco(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1] : null;
}
function texto(xml, caminho) {
  let b = xml;
  for (const tag of caminho) {
    if (b === null) return null;
    b = bloco(b, tag);
  }
  return b === null ? null : b.trim();
}

/** Lê itens e totais do XML de uma NF-e/NFC-e. Devolve {itens:[{nItem, vIBSUF, vIBSMun, vIBS, vCBS}], totais:{...}} em centavos. */
export function lerXmlNFe(xmlBruto) {
  const xml = semNs(xmlBruto);
  const itens = [];
  const reDet = /<det\b([^>]*)>([\s\S]*?)<\/det>/g;
  let m;
  while ((m = reDet.exec(xml))) {
    const nItem = (/nItem="(\d+)"/.exec(m[1]) || [])[1] || String(itens.length + 1);
    const g = texto(m[2], ["imposto", "IBSCBS", "gIBSCBS"]);
    if (g === null) { itens.push({ nItem, semIBSCBS: true }); continue; }
    itens.push({
      nItem,
      vIBSUF: centavos(texto(g, ["gIBSUF", "vIBSUF"])),
      vIBSMun: centavos(texto(g, ["gIBSMun", "vIBSMun"])),
      vIBS: centavos(texto(g, ["vIBS"])),
      vCBS: centavos(texto(g, ["gCBS", "vCBS"])),
    });
  }
  const t = texto(xml, ["total", "IBSCBSTot"]);
  const totais = t === null ? null : {
    vIBSUF: centavos(texto(t, ["gIBS", "gIBSUF", "vIBSUF"])),
    vIBSMun: centavos(texto(t, ["gIBS", "gIBSMun", "vIBSMun"])),
    vIBS: centavos(texto(t, ["gIBS", "vIBS"])),
    vCBS: centavos(texto(t, ["gCBS", "vCBS"])),
  };
  return { itens, totais };
}

/** Lê a resposta JSON da Calculadora de Tributos oficial (regime regular, endpoint de observabilidade ou regime-geral). */
export function lerRespostaCalculadora(resp) {
  const r = typeof resp === "string" ? JSON.parse(resp) : resp;
  const itens = (r.objetos || []).map((o) => {
    const g = o?.tribCalc?.IBSCBS?.gIBSCBS;
    if (!g) return { nItem: String(o.nObj), semIBSCBS: true };
    return { nItem: String(o.nObj), vIBSUF: centavos(g.gIBSUF?.vIBSUF), vIBSMun: centavos(g.gIBSMun?.vIBSMun),
             vIBS: centavos(g.vIBS), vCBS: centavos(g.gCBS?.vCBS) };
  });
  const t = r?.total?.tribCalc?.IBSCBSTot;
  const totais = t ? { vIBSUF: centavos(t.gIBS?.gIBSUF?.vIBSUF), vIBSMun: centavos(t.gIBS?.gIBSMun?.vIBSMun),
                       vIBS: centavos(t.gIBS?.vIBS), vCBS: centavos(t.gCBS?.vCBS) } : null;
  return { itens, totais };
}

/** Confere totais x soma dos itens pelas regras da NT. Devolve {ok, achados, avisos, somas}. */
export function conferir({ itens, totais }) {
  const avisos = [];
  const achados = [];
  if (!totais) {
    avisos.push("Grupo de totais IBSCBSTot não encontrado: nada a conferir.");
    return { ok: false, achados, avisos, somas: null };
  }
  const comGrupo = itens.filter((i) => !i.semIBSCBS);
  if (comGrupo.length < itens.length) avisos.push(`${itens.length - comGrupo.length} item(ns) sem o grupo gIBSCBS.`);
  const somas = {};
  for (const { regra, rejeicao, campo, texto: msg } of REGRAS) {
    const soma = comGrupo.reduce((s, i) => s + (i[campo] ?? 0), 0);
    somas[campo] = soma;
    if (totais[campo] === null || totais[campo] === undefined) { avisos.push(`Total ${campo} ausente.`); continue; }
    if (totais[campo] !== soma) {
      achados.push({ regra, rejeicao, campo, mensagem: `Rejeição ${rejeicao}: ${msg}`,
                     total: totais[campo], somaItens: soma, diferenca: totais[campo] - soma });
    }
  }
  // consistência interna (não é regra citada: aviso): vIBS deve ser vIBSUF + vIBSMun
  comGrupo.forEach((i) => {
    if (i.vIBS !== null && i.vIBSUF !== null && i.vIBSMun !== null && i.vIBS !== i.vIBSUF + i.vIBSMun)
      avisos.push(`Item ${i.nItem}: vIBS ${reais(i.vIBS)} difere de vIBSUF + vIBSMun (${reais(i.vIBSUF + i.vIBSMun)}).`);
  });
  if (totais.vIBS !== null && totais.vIBSUF !== null && totais.vIBSMun !== null && totais.vIBS !== totais.vIBSUF + totais.vIBSMun)
    avisos.push(`Total: vIBS ${reais(totais.vIBS)} difere de vIBSUF + vIBSMun (${reais(totais.vIBSUF + totais.vIBSMun)}).`);
  return { ok: achados.length === 0, achados, avisos, somas };
}

// ---------- rateio de centavos ----------
/** Converte decimal em texto ("0.005", "26.12500000") para unidades de 1/10^casas sem ponto flutuante. */
function emEscala(v, casas) {
  const s = String(v).trim().replace(",", ".");
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`valor inválido: "${v}"`);
  if (m[1]) throw new Error("rateio com valor negativo não suportado");
  const dec = (m[3] || "").padEnd(casas, "0").slice(0, casas);
  if ((m[3] || "").length > casas && /[1-9]/.test((m[3] || "").slice(casas))) throw new Error(`mais de ${casas} casas: "${v}"`);
  return BigInt(m[2] + dec);
}

/** Arredondamento bancário (HALF_EVEN) de um inteiro em escala 10^casasEntrada para centavos. */
function halfEvenCentavos(x, fator) {
  const q = x / fator, r = x % fator, dobro = r * 2n;
  if (dobro > fator || (dobro === fator && q % 2n === 1n)) return q + 1n;
  return q;
}

/**
 * Rateio pelo maior resto: dado o valor EXATO de cada item (com mais casas, ex. "0.005"), devolve valores em centavos
 * cuja SOMA é exatamente o total arredondado (HALF_EVEN, o mesmo modo da calculadora oficial). Assim itens e total batem.
 */
export function ratear(valoresExatos, casasEntrada = 8) {
  const fator = 10n ** BigInt(casasEntrada - 2);
  const xs = valoresExatos.map((v) => emEscala(v, casasEntrada));
  const totalCent = halfEvenCentavos(xs.reduce((a, b) => a + b, 0n), fator);
  const base = xs.map((x) => x / fator);
  let falta = totalCent - base.reduce((a, b) => a + b, 0n);
  const ordem = xs.map((x, i) => ({ i, resto: x % fator })).sort((a, b) => (b.resto > a.resto ? 1 : b.resto < a.resto ? -1 : a.i - b.i));
  const out = [...base];
  for (const { i } of ordem) { if (falta <= 0n) break; out[i] += 1n; falta -= 1n; }
  return { itens: out.map(Number), total: Number(totalCent) };
}
