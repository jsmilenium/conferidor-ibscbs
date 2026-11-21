# Conferidor de totais IBS e CBS

> **In English:** checker for Brazilian IBS/CBS tax totals on NF-e/NFC-e (item sum vs. totals, cent apportionment), before sending to SEFAZ. Docs in Portuguese.

Confere se os totais de IBS e CBS de uma NF-e ou NFC-e batem com a soma dos itens, antes de enviar à SEFAZ, e rateia
centavos para o total fechar. Roda no navegador (o XML não sai do computador) e no Node. Sem dependências.

## Por que existe
A Nota Técnica 2025.002-RTC v1.53 (out/2026, publicada no Portal da NF-e em 30/10/2026) exige que o grupo de totais `IBSCBSTot` seja a soma dos itens, sem
tolerância (leiaute pág. 29; regras págs. 70-71):

| Campo | Regra | Rejeição |
|---|---|---|
| vIBSUF | W41-10 | 1080 - Total de IBS UF difere da soma dos itens |
| vIBSMun | W46-10 | 1084 - Total de IBS Municipal difere da soma dos itens |
| vIBS | W47-10 | 1085 - Total do IBS difere da soma do vIBS dos itens |
| vCBS | W56-10 | 1091 - Total de CBS difere da soma dos itens |

Quem calcula com mais casas e arredonda cada valor separadamente pode gerar um total que não é a soma dos itens
exibidos. Exemplo medido na Calculadora de Tributos oficial (regime regular 1.6.1): três itens de 0,005 de CBS saem
0,00 cada, e o total sai 0,02.

## Uso
- Página: abra `index.html` (precisa ser servida por HTTP, por causa do módulo JavaScript).
- Node:
```js
import { lerXmlNFe, conferir, ratear } from "./src/conferidor.js";
const r = conferir(lerXmlNFe(xml));        // { ok, achados: [{regra, rejeicao, campo, total, somaItens, diferenca}], avisos }
const { itens, total } = ratear(["0.005", "0.005", "0.005"]); // centavos: [1, 1, 0], total 2
```
- Testes: `npm test` (node --test, Node 18+).

## O que NÃO faz
- Não valida o XML inteiro nem assinatura; confere só os totais do grupo IBS/CBS.
- Não cobre ainda vBCIBSCBS, diferimento, devolução, crédito presumido, monofásico nem o Simples Nacional.
- Fonte: PDF baixado do Portal Nacional da NF-e em 18/11/2026
  (https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=BMcHSMEoepU=). As regras W41-10, W46-10, W47-10 e
  W56-10 têm o mesmo texto na v1.52 e na v1.53.
- Ferramenta independente, sem vínculo com a Receita Federal. Não substitui a validação da SEFAZ nem orientação contábil.

## Licença
MIT.
