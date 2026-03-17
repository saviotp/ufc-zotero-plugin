/**
 * post-processor.ts — Pós-processamento de referências bibliográficas
 *
 * Este módulo corrige formatações que o CSL não consegue expressar.
 * O CSL é declarativo e tem limitações — certas regras da UFC/ABNT
 * exigem manipulação direta do HTML gerado.
 *
 * São 19 correções organizadas em ordem de execução (a ordem importa):
 *
 *   0.  fixOrdinalSup             — <sup>o/a</sup> → º/ª
 *   0b. fixBookTitleEntry         — remove <b> de livros sem autor (entrada por título)
 *   1.  fixSubtitleBold           — subtítulo fora do negrito
 *   2a. fixPageEnDashToHyphen     — en-dash → hífen em páginas
 *   2b. fixMonthRangeSeparator    — en-dash → barra entre meses
 *   3.  fixLegislationNote        — nota [Constituição (ano)] antes do título
 *   5.  fixInstitutionalAuthor    — restaura caixa mista de autor institucional (*)
 *   5b. fixDuplicatePublisher     — remove editora = autor (*)
 *   6.  fixEditorLabel            — (org.) → (ed.) quando editor substitui autor
 *   7.  fixEbookItalic            — "E-book" em itálico
 *   8.  fixFilmTitleCase          — primeira palavra em MAIÚSCULAS (sem autor)
 *   10. fixBracketedTitle         — colchetes fora do negrito
 *   11. fixAnaisBrackets          — "[...]" fora do negrito em Anais
 *   12. fixBibleLanguageCase      — "PORTUGUÊS" → "Português" após BÍBLIA
 *   13. fixContainerTitleCase     — primeira palavra do container-title em MAIÚSCULAS
 *   14. fixChapterNoPublisher     — remove [s. n.] em chapters sem editora
 *   15. fixCertidaoDate           — "Registro em," → "Registro em:"
 *   16. fixEventJournalBold       — bold no periódico em eventos tipo book (*)
 *   17. fixPublisherPlaceCountry  — remove país do local de publicação (DOI)
 *
 *   (*) = precisa de dados dos itens (CslItemData)
 *
 * Técnica: Monkey-patching
 *   Substituímos Zotero.Cite.makeFormattedBibliographyOrCitationList
 *   por uma versão que chama a original e depois aplica nossas correções.
 *   No shutdown, restauramos a função original.
 */

import { addon } from "../addon";

// ========================================================================
// Interface mínima para dados dos itens (usada por 3 funções)
// ========================================================================

/**
 * Subconjunto mínimo de campos CSL-JSON necessários para as correções
 * que dependem de dados dos itens.
 *
 * Por que uma interface mínima?
 *   Evita acoplar o pós-processador a toda a estrutura do Zotero.Item.
 *   Só declara os campos que as 3 funções (fixInstitutionalAuthor,
 *   fixDuplicatePublisher, fixEventJournalBold) realmente acessam.
 */
interface CslNameData {
  literal?: string;
  family?: string;
  given?: string;
}

interface CslItemData {
  type?: string;
  author?: CslNameData[];
  "container-author"?: CslNameData[];
  publisher?: string;
  note?: string;
  volume?: string;
}

// ========================================================================
// Registro e remoção do monkey-patch
// ========================================================================

/** Referência à função original do Zotero (para restaurar no shutdown). */
let originalMakeBibliography: ((...args: any[]) => any) | null = null;

/**
 * Registra o pós-processador — substitui a função do Zotero.
 *
 * Chamada no startup do plugin, APÓS o Zotero estar inicializado.
 * A substituição só é feita se o pós-processamento estiver habilitado
 * nas preferências do usuário.
 */
export function register(): void {
  const prefKey = `${addon.prefNamespace}.postprocess.enabled`;
  const enabled = Services.prefs.getBoolPref(prefKey, true);

  if (!enabled) {
    Zotero.debug(
      "[UFC-ABNT] Pós-processamento desativado nas preferências.",
    );
    return;
  }

  originalMakeBibliography =
    Zotero.Cite.makeFormattedBibliographyOrCitationList;

  /**
   * Wrapper que intercepta o HTML da bibliografia e aplica correções.
   *
   * O primeiro argumento de makeFormattedBibliographyOrCitationList é
   * um objeto bibliography/citationList que contém os itens. Extraímos
   * os dados mínimos (CslItemData) para passar às funções que precisam.
   */
  Zotero.Cite.makeFormattedBibliographyOrCitationList = function (
    ...args: any[]
  ) {
    const result = originalMakeBibliography!.apply(this, args);

    if (typeof result !== "string") return result;

    // Extrai dados mínimos dos itens para as funções que precisam.
    // O primeiro argumento é o bibliography object que contém os itens
    // no formato Zotero.Item. Convertemos para CslItemData mínimo.
    const items = extractItemData(args);

    return applyCorrections(result, items);
  };

  Zotero.debug("[UFC-ABNT] Pós-processador registrado.");
}

/**
 * Remove o pós-processador — restaura a função original do Zotero.
 *
 * Chamada no shutdown do plugin. ESSENCIAL para não deixar um
 * monkey-patch órfão que referencia código de um plugin descarregado.
 */
export function unregister(): void {
  if (originalMakeBibliography) {
    Zotero.Cite.makeFormattedBibliographyOrCitationList =
      originalMakeBibliography;
    originalMakeBibliography = null;
    Zotero.debug("[UFC-ABNT] Pós-processador removido.");
  }
}

// ========================================================================
// Extração de dados dos itens Zotero
// ========================================================================

/**
 * Extrai CslItemData mínimo dos argumentos da função interceptada.
 *
 * makeFormattedBibliographyOrCitationList recebe como segundo argumento
 * um array de Zotero.Item. Convertemos cada item para CslItemData
 * usando Zotero.Utilities.Item.itemToCSLJSON() para obter os campos
 * em formato CSL-JSON padronizado.
 *
 * Se não conseguir extrair (ex: formato inesperado), retorna array vazio.
 * As funções que dependem de items simplesmente não aplicam correções
 * (degradação graciosa).
 */
function extractItemData(args: any[]): CslItemData[] {
  try {
    // O segundo argumento é tipicamente o array de Zotero.Item
    const zoteroItems = args[1];
    if (!Array.isArray(zoteroItems)) return [];

    return zoteroItems
      .map((item: any) => {
        try {
          // Zotero.Utilities.Item.itemToCSLJSON converte um Zotero.Item
          // para CSL-JSON. Extraímos só os campos que precisamos.
          const csl = Zotero.Utilities.Item.itemToCSLJSON(item);
          return {
            type: csl.type,
            author: csl.author,
            "container-author": csl["container-author"],
            publisher: csl.publisher,
            note: csl.note,
            volume: csl.volume,
          } as CslItemData;
        } catch {
          return {} as CslItemData;
        }
      });
  } catch {
    return [];
  }
}

// ========================================================================
// Pipeline de correções
// ========================================================================

/**
 * Aplica todas as 19 correções ao HTML da bibliografia.
 *
 * A ORDEM importa:
 *   - fixOrdinalSup roda primeiro para normalizar <sup> → caractere Unicode,
 *     evitando que <sup> dentro de <b> quebre as regexes subsequentes.
 *   - fixLegislationNote roda antes de fixSubtitleBold porque reordena o
 *     título (a separação título/subtítulo precisa operar no HTML final).
 *   - fixBookTitleEntry roda antes de fixSubtitleBold para remover <b> de
 *     livros sem autor — assim fixSubtitleBold não age sobre eles.
 *   - fixFilmTitleCase roda após fixBookTitleEntry (que remove <b>),
 *     permitindo detectar "sem autor" pela ausência de tag.
 *
 * @param html — HTML gerado pelo Zotero (múltiplas entradas csl-entry)
 * @param items — Dados mínimos dos itens (para as 3 funções que precisam)
 */
function applyCorrections(html: string, items: CslItemData[]): string {
  // A bibliografia do Zotero contém múltiplas entradas <div class="csl-entry">.
  // Aplicamos as correções em cada entrada individualmente, porque várias
  // funções usam ^ (início de string) para detectar padrões.
  return html.replace(
    /(<div class="csl-entry">)([\s\S]*?)(<\/div>)/g,
    (_, openDiv, content, closeDiv) => {
      let entry = content.trim();
      // Correções regex-only (não precisam de items)
      entry = fixOrdinalSup(entry);
      entry = fixLegislationNote(entry);
      entry = fixBookTitleEntry(entry);
      entry = fixSubtitleBold(entry);
      entry = fixPageEnDashToHyphen(entry);
      entry = fixMonthRangeSeparator(entry);
      // Correções que precisam de items
      entry = fixInstitutionalAuthor(entry, items);
      entry = fixDuplicatePublisher(entry, items);
      // Correções regex-only (continuação)
      entry = fixEditorLabel(entry);
      entry = fixEbookItalic(entry);
      entry = fixFilmTitleCase(entry);
      entry = fixAnaisBrackets(entry);
      entry = fixBracketedTitle(entry);
      entry = fixBibleLanguageCase(entry);
      entry = fixChapterNoPublisher(entry);
      entry = fixContainerTitleCase(entry);
      entry = fixCertidaoDate(entry);
      // Correção que precisa de items
      entry = fixEventJournalBold(entry, items);
      // Correção de dados importados via DOI
      entry = fixPublisherPlaceCountry(entry);
      return `${openDiv}${entry}${closeDiv}`;
    },
  );
}

// ========================================================================
// 18 funções de correção (sincronizadas com tests/test_csl.mjs)
// ========================================================================

/**
 * Correção 0: Ordinais em <sup> → caractere Unicode
 *
 * citeproc-js converte "nº" → "n<sup>o</sup>" no HTML.
 * Isso quebra regexes que esperam conteúdo simples dentro de <b>.
 * UFC exige "nº" (ordinal como caractere Unicode).
 */
function fixOrdinalSup(html: string): string {
  return html
    .replace(/<sup>o<\/sup>/g, "º")
    .replace(/<sup>a<\/sup>/g, "ª");
}

/**
 * Correção 0b: Entrada por título (livro sem autor) — remove negrito
 *
 * Se a entrada começa diretamente com <b>, o título é o primeiro
 * elemento (sem autor antes). A UFC diz que entradas por título
 * NÃO levam negrito — apenas a primeira palavra fica em MAIÚSCULAS
 * (tratado depois por fixFilmTitleCase).
 *
 * Roda ANTES de fixSubtitleBold para que este não encontre tags
 * para separar título/subtítulo em entradas sem autor.
 */
function fixBookTitleEntry(html: string): string {
  if (/^<b>/.test(html)) {
    return html.replace(/<b>([\s\S]*?)<\/b>/, "$1");
  }
  return html;
}

/**
 * Correção 1: Subtítulo fora do negrito
 *
 * CSL gera: <b>Título: subtítulo</b>
 * UFC exige: <b>Título</b>: subtítulo
 *
 * Apenas <b> — não mexer em <i> (ex: *[S. l.: s. n.]* usa ":" interno).
 * Usa quantificador não-guloso ([^<]+?) no título para parar no PRIMEIRO ":"
 * (títulos com dois ":" como "Mapa...: diagnóstico...: áreas...").
 */
function fixSubtitleBold(html: string): string {
  return html.replace(
    /(<b>)([^<]+?)(:\s)([^<]+)(<\/b>)/g,
    (_, openTag, title, separator, _subtitle, _closeTag) => {
      return `${openTag}${title}${_closeTag}${separator}${_subtitle}`;
    },
  );
}

/**
 * Correção 2a: En-dash → hífen APENAS em intervalos de páginas
 *
 * CSL gera: p. 10–20 (en-dash U+2013)
 * UFC exige: p. 10-20 (hífen U+002D)
 *
 * NÃO substituir todos os en-dashes — teses usam en-dash como separador
 * antes da faculdade ("Tese (...) – Faculdade..."). Só troca entre números
 * após prefixo de página "p. ".
 */
function fixPageEnDashToHyphen(html: string): string {
  return html.replace(/(p\.\s*\d+)\u2013(\d+)/g, "$1-$2");
}

/**
 * Correção 2b: En-dash → barra entre meses abreviados
 *
 * citeproc-js renderiza intervalo de meses com en-dash e insere ponto
 * espúrio: "jul.–dez. . 2006". UFC exige barra: "jul./dez. 2006".
 */
function fixMonthRangeSeparator(html: string): string {
  return html.replace(
    /(\w{3,4}\.)\u2013(\w{3,4}\.)\s*\.\s*/g,
    "$1/$2 ",
  );
}

/**
 * Correção 3: Legislação — nota [Constituição (ano)] antes do título
 *
 * CSL gera: BRASIL. <b>Título</b>. [Constituição (1988)]. ...
 * UFC exige: BRASIL. [Constituição (1988)]. <b>Título</b>. ...
 *
 * A regex captura prefixo, título com tags e nota entre colchetes,
 * e reordena para nota antes do título.
 */
function fixLegislationNote(html: string): string {
  return html.replace(
    /^(.*?\.\s*)(<[bi]>[\s\S]*?<\/[bi]>)\.\s*(\[[^\]]+\([\d]{4}\)\])\.\s*/,
    (_, prefix, title, note) => {
      return `${prefix}${note}. ${title}. `;
    },
  );
}

/**
 * Correção 5: Autoria institucional — restaura caixa mista das subdivisões
 *
 * O CSL aplica text-case="uppercase" a TODOS os autores, mas quando o
 * autor é institucional com campo `literal`, transforma subdivisões em
 * MAIÚSCULAS indevidamente.
 *
 * Entrada: "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária"
 * CSL gera: "UNIVERSIDADE FEDERAL DO CEARÁ. BIBLIOTECA UNIVERSITÁRIA"
 * UFC exige: "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária"
 *
 * Compara a versão uppercase do literal com o HTML; se encontrar,
 * substitui pela versão original (caixa mista).
 */
function fixInstitutionalAuthor(
  html: string,
  items: CslItemData[],
): string {
  let result = html;
  for (const item of items) {
    const nameArrays = [item.author, item["container-author"]].filter(
      Boolean,
    ) as CslNameData[][];
    for (const names of nameArrays) {
      for (const person of names) {
        if (!person.literal) continue;
        const uppercased = person.literal.toUpperCase();
        if (uppercased !== person.literal && result.includes(uppercased)) {
          result = result.replace(uppercased, person.literal);
        }
      }
    }
  }
  return result;
}

/**
 * Correção 5b: Remove editora duplicada quando autor = editora
 *
 * Quando a entidade responsável (autor literal) é a mesma que a editora,
 * a UFC manda omitir a editora.
 *
 * CSL gera: "Praga: Avast Software, 2019."
 * UFC exige: "Praga, 2019."
 */
function fixDuplicatePublisher(
  html: string,
  items: CslItemData[],
): string {
  let result = html;
  for (const item of items) {
    if (!item.publisher) continue;
    const authors = item.author || [];
    for (const author of authors) {
      if (!author.literal) continue;
      if (author.literal.toUpperCase() === item.publisher.toUpperCase()) {
        const escaped = item.publisher.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        result = result.replace(new RegExp(": " + escaped + ","), ",");
      }
    }
  }
  return result;
}

/**
 * Correção 6: Label "(org.)" → "(ed.)" para editores como autores
 *
 * O CSL tem um único term `editor` short = "org.", correto para capítulos
 * (In: EDITOR (org.)) mas incorreto para livros onde o editor substitui
 * o autor (EDITOR (ed.)).
 *
 * Se a referência contém "(org.)" mas NÃO contém "<i>In</i>:", o editor
 * atua como autor principal e o label correto é "(ed.)".
 */
function fixEditorLabel(html: string): string {
  if (html.includes("(org.)") && !html.includes("<i>In</i>")) {
    return html.replace("(org.)", "(ed.)");
  }
  return html;
}

/**
 * Correção 7: "E-book" em itálico
 *
 * O CSL renderiza o campo `medium` como texto simples. A UFC exige
 * que "E-book" apareça em itálico, mas outros meios (ex: "5 CD-ROM")
 * ficam sem itálico.
 *
 * O CSL não tem condicional baseada no VALOR de um campo — só verifica
 * se o campo EXISTE, não o que ele contém.
 */
function fixEbookItalic(html: string): string {
  return html.replace(/\bE-book\b/g, "<i>E-book</i>");
}

/**
 * Correção 8: Filme sem autor — primeira palavra do título em caixa alta
 *
 * Regra ABNT: quando não há autoria, a primeira palavra do título deve
 * ser em CAIXA ALTA. Se é um artigo (O, A, OS, AS...), capitaliza
 * artigo + próxima palavra.
 *
 * Detecção de "sem autor": não começa com padrão SOBRENOME, nem com <b>/<i>.
 */
function fixFilmTitleCase(html: string): string {
  // Padrão de autor: MAIÚSCULAS seguidas de vírgula
  if (/^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,},/.test(html)) return html;
  // Tag de formatação indica presença de autor
  if (/^<[bi]>/.test(html)) return html;

  // Artigos: capitaliza artigo + próxima palavra
  const articles = /^(o|a|os|as|um|uma|uns|umas)\s/i;
  if (articles.test(html)) {
    return html.replace(/^(\S+)\s+(\S+?)([:\s.])/, (_, art, word, sep) => {
      return art.toUpperCase() + " " + word.toUpperCase() + sep;
    });
  }
  // Caso normal: primeira palavra até espaço, ":" ou "."
  return html.replace(/^(\S+?)([:\s.])/, (_, firstWord, separator) => {
    return firstWord.toUpperCase() + separator;
  });
}

/**
 * Correção 10: Título atribuído — colchetes para fora do negrito
 *
 * CSL gera: <b>[Título]</b>
 * UFC exige: [<b>Título</b>]
 *
 * Títulos atribuídos (fotos, cartas sem título original) usam colchetes.
 * O CSL aplica bold ao campo inteiro incluindo colchetes, mas estes
 * devem ficar fora da formatação tipográfica.
 */
function fixBracketedTitle(html: string): string {
  return html.replace(/<b>\[([^\]]+)\]<\/b>/g, "[<b>$1</b>]");
}

/**
 * Correção 11: Anais — mover "[...]" para fora do negrito
 *
 * CSL gera: <b>Anais [...]</b>
 * UFC exige: <b>Anais</b> [...]
 *
 * O "[...]" (supressão) deve ficar fora do negrito.
 */
function fixAnaisBrackets(html: string): string {
  return html.replace(
    /<b>([^<]*?)\s*(\[\.{3}\])<\/b>/g,
    "<b>$1</b> $2",
  );
}

/**
 * Correção 12: Bíblia — idioma em caixa mista após "BÍBLIA."
 *
 * CSL gera: BÍBLIA. PORTUGUÊS (text-case="uppercase" afeta literal)
 * UFC exige: BÍBLIA. Português (title case)
 */
function fixBibleLanguageCase(html: string): string {
  return html.replace(
    /BÍBLIA\.\s+([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,})/g,
    (_, lang) => {
      return "BÍBLIA. " + lang.charAt(0) + lang.slice(1).toLowerCase();
    },
  );
}

/**
 * Correção 13: Container-title — primeira palavra em MAIÚSCULAS
 *
 * Em partes de obra sem autor na obra-mãe, a primeira palavra do
 * container-title deve ficar em MAIÚSCULAS (após "In:").
 * Também aplica regra de artigos (A FORÇA, O INVERNO).
 */
function fixContainerTitleCase(html: string): string {
  return html.replace(
    /(<i>In<\/i>:\s+)([^\s<]+)(\s+)?([^\s<]*)?/,
    (match, prefix, firstWord, space, secondWord) => {
      if (/^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,},/.test(firstWord)) return match;
      const articles = /^(o|a|os|as|um|uma|uns|umas)$/i;
      if (articles.test(firstWord) && space && secondWord) {
        return (
          prefix + firstWord.toUpperCase() + space + secondWord.toUpperCase()
        );
      }
      return (
        prefix +
        firstWord.toUpperCase() +
        (space || "") +
        (secondWord || "")
      );
    },
  );
}

/**
 * Correção 14: Capítulo sem editora — remove [s. n.] e ajusta pontuação
 *
 * CSL gera: </b>. Local: [<i>s. n.</i>], Ano
 * UFC exige: </b>, Local, Ano (quando não há editora)
 */
function fixChapterNoPublisher(html: string): string {
  return html.replace(
    /(<\/b>)\.\s+([^:]+):\s*\[<i>s\. n\.<\/i>\],\s*/g,
    "$1, $2, ",
  );
}

/**
 * Correção 15: Certidão — "Registro em," → "Registro em:"
 *
 * O CSL `document` renderiza publisher-place + data com vírgula.
 * A UFC exige dois-pontos após "Registro em".
 */
function fixCertidaoDate(html: string): string {
  return html.replace(/Registro em, /g, "Registro em: ");
}

/**
 * Correção 16: Evento em periódico — nome do periódico em negrito
 *
 * Eventos publicados em periódicos (3.4.1.3) usam type=book com
 * note + volume. O nome do periódico (via note) fica sem bold.
 * A UFC exige bold no nome do periódico.
 *
 * Condição type=book + note + volume é exclusiva deste caso.
 */
function fixEventJournalBold(
  html: string,
  items: CslItemData[],
): string {
  let result = html;
  for (const item of items) {
    if (item.type === "book" && item.note && item.volume) {
      const plain = item.note;
      if (result.includes(plain) && !result.includes(`<b>${plain}</b>`)) {
        result = result.replace(plain, `<b>${plain}</b>`);
      }
    }
  }
  return result;
}

/**
 * Correção 17: Remove nome do país do local de publicação
 *
 * Dados importados via DOI (Crossref) frequentemente incluem o país no
 * campo publisher-place: "Rio de Janeiro, Brazil", "New York, USA".
 * A UFC/ABNT exige apenas a cidade: "Rio de Janeiro", "New York".
 *
 * Usa lista fechada de países (em inglês e português) que o Crossref
 * comprovadamente retorna. Remove ", País" apenas quando seguido por
 * vírgula ou ponto (contexto de publicação), evitando falsos positivos.
 */
const COUNTRIES: string[] = [
  // Inglês (como vem do Crossref)
  "Brazil", "United States", "USA", "US",
  "United Kingdom", "UK", "England", "Scotland", "Wales",
  "France", "Germany", "Spain", "Italy", "Portugal",
  "Netherlands", "Belgium", "Switzerland", "Austria",
  "Canada", "Australia", "New Zealand",
  "Japan", "China", "South Korea", "India",
  "Mexico", "Argentina", "Colombia", "Chile",
  "Sweden", "Norway", "Denmark", "Finland",
  "Poland", "Czech Republic", "Russia",
  "South Africa", "Nigeria", "Egypt",
  "Ireland", "Israel", "Singapore", "Taiwan",
  // Português (caso Zotero/tradutor localize)
  "Brasil", "Estados Unidos", "EUA",
  "Reino Unido", "Inglaterra",
  "França", "Alemanha", "Espanha", "Itália",
  "Países Baixos", "Holanda", "Bélgica", "Suíça",
  "Canadá", "Austrália", "Nova Zelândia",
  "Japão", "China", "Coreia do Sul", "Índia",
  "México", "Colômbia",
  "Suécia", "Noruega", "Dinamarca", "Finlândia",
  "Polônia", "Rússia",
  "África do Sul", "Nigéria", "Egito",
  "Irlanda",
];

/** Regex pré-compiladas para cada país (performance). */
const COUNTRY_REGEXES: RegExp[] = COUNTRIES.map((country) => {
  const escaped = country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`,\\s*${escaped}(?=[,.])`);
});

function fixPublisherPlaceCountry(html: string): string {
  let result = html;
  for (const re of COUNTRY_REGEXES) {
    result = result.replace(re, "");
  }
  return result;
}
