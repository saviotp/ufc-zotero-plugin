/**
 * Validação do CSL da UFC usando citeproc-js (mesma engine do Zotero).
 *
 * Compara a saída gerada pelo CSL com as referências da folha de respostas
 * (docs/referencias-ufc-exemplos.md).
 *
 * Uso: node tests/test_csl.mjs
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import CSL from "citeproc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const CSL_PATH = join(PROJECT_ROOT, "ufc.csl");
const LOCALES_DIR = join(PROJECT_ROOT, "node_modules", "citeproc-locales", "locales");

// Carregar o CSL
const cslXml = readFileSync(CSL_PATH, "utf-8");

// Cache de locales
const localeCache = {};
function loadLocale(lang) {
  if (localeCache[lang]) return localeCache[lang];
  const path = join(LOCALES_DIR, `locales-${lang}.xml`);
  if (existsSync(path)) {
    localeCache[lang] = readFileSync(path, "utf-8");
    return localeCache[lang];
  }
  return false;
}

/**
 * Converte HTML inline do citeproc-js para markdown.
 */
function htmlToMarkdown(html) {
  let text = html;
  // citeproc-js usa <i> e <b> para formatação
  text = text.replace(/<b>(.*?)<\/b>/g, "**$1**");
  text = text.replace(/<i>(.*?)<\/i>/g, "*$1*");
  // Remover divs e spans
  text = text.replace(/<\/?div[^>]*>/g, "");
  text = text.replace(/<\/?span[^>]*>/g, "");
  text = text.replace(/<[^>]+>/g, "");
  // Decodificar entidades HTML comuns
  text = text.replace(/&#38;/g, "&");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&#60;/g, "<");
  text = text.replace(/&#62;/g, ">");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  // Normalizar apóstrofos tipográficos (citeproc-js converte ' → ')
  text = text.replace(/\u2019/g, "'");
  // Normalizar espaços
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// ========================================================================
// Pós-processamento — mesmas correções que o plugin aplica no Zotero.
//
// Estas funções são réplicas das que estão em src/modules/post-processor.ts,
// adaptadas para operar sobre o HTML do citeproc-js (antes da conversão
// para markdown). Mantê-las sincronizadas manualmente por enquanto.
//
// Cada correção resolve um gap identificado na Fase 1+2: algo que a UFC
// exige mas que o CSL não consegue expressar nativamente.
// ========================================================================

/**
 * Aplica todas as correções de pós-processamento ao HTML do citeproc-js.
 *
 * A ordem das correções importa:
 *   1. fixOrdinalSup — converte <sup>o</sup> → º (precisa rodar antes das
 *      regex que operam sobre o conteúdo de <b>)
 *   2. fixLegislationNote — reordena campos (altera estrutura do HTML)
 *   3. fixBookTitleEntry — remove <b> de entradas por título (sem autor)
 *   4. fixSubtitleBold — ajusta negrito/itálico (depende da estrutura)
 *   5. fixPageEnDashToHyphen — en-dash → hífen só em intervalos de páginas
 *   6. fixMonthRangeSeparator — en-dash → barra entre meses abreviados
 *   7. fixInstitutionalAuthor — restaura caixa mista de subdivisões institucionais
 *   8. fixEbookItalic — "E-book" em itálico
 *   9. fixFilmTitleCase — uppercase no título sem autor (independente)
 */
function postProcess(html, items) {
  let result = html;
  result = fixOrdinalSup(result);
  result = fixLegislationNote(result);
  result = fixBookTitleEntry(result);
  result = fixSubtitleBold(result);
  result = fixPageEnDashToHyphen(result);
  result = fixMonthRangeSeparator(result);
  result = fixInstitutionalAuthor(result, items);
  result = fixDuplicatePublisher(result, items);
  result = fixEditorLabel(result);
  result = fixEbookItalic(result);
  result = fixFilmTitleCase(result);
  result = fixAnaisBrackets(result);
  result = fixBracketedTitle(result);
  result = fixBibleLanguageCase(result);
  result = fixChapterNoPublisher(result);
  result = fixContainerTitleCase(result);
  result = fixCertidaoDate(result);
  result = fixEventJournalBold(result, items);
  result = fixPublisherPlaceCountry(result);
  return result;
}

/**
 * Correção 0: Ordinais em <sup> → caractere Unicode
 *
 * Problema:
 *   citeproc-js converte "nº" → "n<sup>o</sup>" no HTML.
 *   Isso quebra regexes que esperam conteúdo simples dentro de <b>.
 *   UFC exige "nº" (com ordinal feminino/masculino como caractere).
 *
 * Conversões:
 *   <sup>o</sup>  → º  (qualquer contexto: nº, 1º, 2º, etc.)
 *   <sup>a</sup>  → ª  (qualquer contexto: nª, 1ª, 2ª, etc.)
 */
function fixOrdinalSup(html) {
  return html
    .replace(/<sup>o<\/sup>/g, "º")
    .replace(/<sup>a<\/sup>/g, "ª");
}

/**
 * Correção 0b: Entrada por título (livro sem autor) — remove negrito
 *
 * Problema:
 *   O CSL envolve títulos de livro em <b> automaticamente, mesmo quando
 *   não há autor. Mas a UFC diz que entradas por título NÃO levam negrito —
 *   apenas a primeira palavra fica em MAIÚSCULAS (tratado por fixFilmTitleCase).
 *
 * Detecção:
 *   Se a entrada começa diretamente com <b>, significa que o título é o
 *   primeiro elemento — não há autor antes. Em entradas com autor, o
 *   padrão seria "SOBRENOME, Nome. <b>Título</b>".
 *
 * Por que roda ANTES de fixSubtitleBold?
 *   Ao remover <b> aqui, fixSubtitleBold não encontra tags para separar
 *   título/subtítulo — e não precisa, pois entradas por título não usam
 *   negrito nem separação de subtítulo na UFC.
 *
 * Depois, fixFilmTitleCase (que roda por último) vai detectar a ausência
 * de autor e aplicar uppercase na primeira palavra.
 */
function fixBookTitleEntry(html) {
  if (/^<b>/.test(html)) {
    return html.replace(/<b>([\s\S]*?)<\/b>/, "$1");
  }
  return html;
}

/**
 * Correção 1: Subtítulo fora do negrito/itálico
 *
 * Problema:
 *   CSL gera: <b>Título: subtítulo</b>
 *   UFC exige: <b>Título</b>: subtítulo
 *
 * Regex:
 *   (<[bi]>)   → tag de abertura (<b> ou <i>)
 *   ([^<]+?)  → texto antes do PRIMEIRO ": " (o título) — NÃO-GULOSO
 *   (:\s)      → o separador literal ": "
 *   ([^<]+)    → texto depois do ": " (o subtítulo, pode conter mais ":")
 *   (<\/[bi]>) → tag de fechamento
 *
 * Por que não-guloso no título?
 *   Títulos com dois ":" (ex: "Mapa...: diagnóstico...: áreas...").
 *   Guloso ([^<]+) iria até o ÚLTIMO ":", colocando parte do subtítulo
 *   dentro do negrito. Não-guloso ([^<]+?) para no PRIMEIRO ":", que é
 *   o ponto correto de separação título/subtítulo segundo a UFC.
 *
 * Resultado: fecha a tag ANTES do primeiro ": " e remove a tag de fechamento original
 */
function fixSubtitleBold(html) {
  // Apenas <b> — não mexer em <i> (ex: *[S. l.: s. n.]* usa ":" interno)
  return html.replace(
    /(<b>)([^<]+?)(:\s)([^<]+)(<\/b>)/g,
    (_, openTag, title, separator, subtitle, closeTag) => {
      return `${openTag}${title}${closeTag}${separator}${subtitle}`;
    }
  );
}

/**
 * Correção 2: En-dash → hífen APENAS em intervalos de páginas
 *
 * Problema:
 *   CSL gera: p. 10–20 (en-dash, U+2013)
 *   UFC exige: p. 10-20 (hífen, U+002D)
 *
 * Cuidado:
 *   NÃO substituir todos os en-dashes! A tese usa en-dash como separador
 *   antes da faculdade: "Tese (...) – Faculdade...". Só queremos trocar
 *   en-dashes entre números em contexto de páginas.
 *
 * Regex:
 *   (p\.\s*) — prefixo "p. " (marcador de páginas no CSL)
 *   (\d+)    — número inicial da página
 *   \u2013   — en-dash (U+2013)
 *   (\d+)    — número final da página
 *
 * Resultado: p. 169-176 (com hífen simples)
 */
function fixPageEnDashToHyphen(html) {
  return html.replace(/(p\.\s*\d+)\u2013(\d+)/g, "$1-$2");
}

/**
 * Correção 2b: En-dash → barra entre meses abreviados (intervalo/trimestre)
 *
 * Problema:
 *   A macro "issued" do CSL divide a data em dois blocos <date> — um para
 *   dia+mês, outro para ano. Quando o citeproc-js processa um intervalo
 *   (ex: jul 2006 – dez 2006), ele renderiza cada bloco independentemente:
 *     - Bloco 1 (mês): jul.–dez.    (en-dash como separador de range)
 *     - Bloco 2 (ano): 2006
 *   E insere um ponto+espaço espúrio entre eles: "jul.–dez. . 2006"
 *
 *   UFC exige barra: "jul./dez. 2006"
 *
 * Regex:
 *   (\w{3,4}\.)  — mês abreviado com ponto (jan., fev., ..., dez.)
 *   \u2013       — en-dash (U+2013) que o citeproc usa como range-delimiter
 *   (\w{3,4}\.)  — segundo mês abreviado com ponto
 *   \s*\.\s*     — o ponto+espaço espúrio que o citeproc insere (opcional)
 *
 * Segurança:
 *   Se o artigo NÃO tem trimestre (data simples como "jul. 2006"), não há
 *   en-dash entre meses, então o regex simplesmente não casa e o texto
 *   passa inalterado.
 */
function fixMonthRangeSeparator(html) {
  return html.replace(
    /(\w{3,4}\.)\u2013(\w{3,4}\.)\s*\.\s*/g,
    "$1/$2 "
  );
}

/**
 * Correção 3: Legislação — nota [Constituição (ano)] antes do título
 *
 * Problema:
 *   CSL gera: BRASIL. <b>Título: subtítulo</b>. [Constituição (1988)]. 31. ed. ...
 *   UFC exige: BRASIL. [Constituição (1988)]. <b>Título</b>: subtítulo. 31. ed. ...
 *
 * O CSL coloca o campo `note` DEPOIS do título (é a posição padrão na
 * macro "access" ou "note"). Mas a UFC exige que notas de tipo legal
 * (reconhecidas pelo padrão [texto (ano)]) venham ANTES do título.
 *
 * Como funciona a regex:
 *   1. Captura tudo antes da nota como "prefixo + título"
 *   2. Captura a nota no formato [Algo (NNNN)]
 *   3. Reordena: prefixo + nota + título + resto
 *
 * Limitação: só funciona para notas no formato [Texto (ano)].
 * Outras notas não são afetadas.
 */
function fixLegislationNote(html) {
  // Padrão: detecta ". [Texto (NNNN)]." após o título e antes da edição/editora
  // Captura groups:
  //   $1 = tudo antes do título (ex: "BRASIL. ")
  //   $2 = o título completo com tags (ex: "<b>Constituição...</b>")
  //   $3 = a nota entre colchetes (ex: "[Constituição (1988)]")
  //   $4 = o resto da referência (ex: ". 31. ed. São Paulo: Saraiva, 2003.")
  return html.replace(
    /^(.*?\.\s*)(<[bi]>[\s\S]*?<\/[bi]>)\.\s*(\[[^\]]+\([\d]{4}\)\])\.\s*/,
    (_, prefix, title, note) => {
      return `${prefix}${note}. ${title}. `;
    }
  );
}

/**
 * Correção 5: Autoria institucional — restaura caixa mista das subdivisões
 *
 * Problema:
 *   O CSL aplica text-case="uppercase" a TODOS os autores (para transformar
 *   "Lessa" em "LESSA"). Mas quando o autor é institucional com campo
 *   `literal`, ele transforma tudo em MAIÚSCULAS:
 *     Entrada: "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária"
 *     CSL gera: "UNIVERSIDADE FEDERAL DO CEARÁ. BIBLIOTECA UNIVERSITÁRIA"
 *     UFC exige: "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária"
 *
 * Como funciona:
 *   1. Percorre todos os itens procurando autores com campo `literal`
 *   2. Para cada literal, gera a versão totalmente em MAIÚSCULAS
 *   3. Se essa versão aparece no HTML, substitui pela original (caixa mista)
 *
 * Segurança:
 *   - Só age quando o literal JÁ tem caixa mista (ex: "Biblioteca Universitária")
 *   - Se o literal já é todo MAIÚSCULAS (ex: "BRASIL"), a comparação é idêntica
 *     e o replace é um no-op (substitui o mesmo texto por ele mesmo)
 *   - Não usa regex, é comparação exata de strings
 *
 * Requisito:
 *   Esta função precisa dos dados originais dos itens (CSL-JSON) para saber
 *   qual era a caixa original do literal. No plugin, esses dados virão do
 *   item do Zotero; no teste, vêm do fixture.
 */
function fixInstitutionalAuthor(html, items) {
  let result = html;
  for (const item of items) {
    // Restaura caixa mista de autores institucionais (author e container-author)
    const nameArrays = [item.author, item["container-author"]].filter(Boolean);
    for (const names of nameArrays) {
      for (const person of names) {
        if (!person.literal) continue;
        const uppercased = person.literal.toUpperCase();
        // Só substitui se o citeproc realmente alterou a caixa
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
 * Problema:
 *   Quando a entidade responsável (autor) é a mesma que a editora,
 *   a ABNT/UFC manda omitir a editora para evitar redundância.
 *   Exemplo: AVAST SOFTWARE publica via Avast Software → omitir.
 *
 *   CSL gera: "Praga: Avast Software, 2019."
 *   UFC exige: "Praga, 2019."
 *
 * Como funciona:
 *   1. Percorre os itens buscando autores com campo `literal`
 *   2. Compara case-insensitivamente com o `publisher`
 *   3. Se iguais, remove ": publisher" do HTML, deixando só "local, ano"
 *
 * Segurança:
 *   Só atua quando autor literal e publisher são case-insensitivamente
 *   iguais. Se forem diferentes (ex: UFC publica via Imprensa Universitária),
 *   não remove nada.
 */
function fixDuplicatePublisher(html, items) {
  let result = html;
  for (const item of items) {
    if (!item.publisher) continue;
    const authors = item.author || [];
    for (const author of authors) {
      if (!author.literal) continue;
      if (author.literal.toUpperCase() === item.publisher.toUpperCase()) {
        // Remove ": Publisher" ou ": Publisher, " do HTML
        result = result.replace(
          new RegExp(": " + item.publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ","),
          ","
        );
      }
    }
  }
  return result;
}

/**
 * Correção 6: Label "(org.)" → "(ed.)" para editores como autores
 *
 * Problema:
 *   O CSL tem um único term `editor` short = "org.", que é correto para
 *   capítulos (*In*: EDITOR (org.)) mas incorreto para livros onde o
 *   editor substitui o autor (EDITOR (ed.)).
 *
 * Por que não corrigir no CSL?
 *   O CSL permite apenas UM valor por term — não é possível ter "org."
 *   em capítulos e "ed." em livros para o mesmo campo `editor`.
 *
 * Detecção:
 *   Se a referência contém "(org.)" mas NÃO contém "<i>In</i>:" (ou seja,
 *   não é capítulo/parte de obra), então o editor está atuando como autor
 *   principal e o label correto é "(ed.)".
 */
function fixEditorLabel(html) {
  if (html.includes("(org.)") && !html.includes("<i>In</i>")) {
    return html.replace("(org.)", "(ed.)");
  }
  return html;
}

/**
 * Correção 7: "E-book" em itálico
 *
 * Problema:
 *   O CSL renderiza o campo `medium` como texto simples. A UFC exige
 *   que "E-book" apareça em itálico (*E-book*), mas outros meios como
 *   "5 CD-ROM" ficam sem itálico.
 *
 * Por que não corrigir no CSL?
 *   O CSL não tem condicional baseada no VALOR de um campo — não é
 *   possível dizer "se medium = 'E-book', aplique itálico". Só é
 *   possível verificar se o campo EXISTE, não o que ele contém.
 *
 * Regex:
 *   \bE-book\b — a palavra "E-book" como token isolado (word boundary)
 *   Substitui por <i>E-book</i> para que htmlToMarkdown converta em *E-book*
 */
function fixEbookItalic(html) {
  return html.replace(/\bE-book\b/g, "<i>E-book</i>");
}

/**
 * Correção 7: Filme sem autor — primeira palavra do título em caixa alta
 *
 * Problema:
 *   CSL gera: Alzheimer: mudanças na comunicação...
 *   UFC exige: ALZHEIMER: mudanças na comunicação...
 *
 * Regra ABNT: quando não há autoria, a primeira palavra do título
 * (até o primeiro espaço ou pontuação) deve ser escrita em CAIXA ALTA.
 *
 * Detecção de "sem autor": se a referência NÃO começa com uma tag <b>
 * ou sequência de SOBRENOME (letras maiúsculas seguidas de vírgula),
 * significa que o título é o primeiro elemento — portanto sem autor.
 *
 * Regex:
 *   ^ → início da string
 *   (\S+) → primeira "palavra" (sequência sem espaço)
 *   Só aplica se NÃO começa com padrão de autor (SOBRENOME, Nome)
 */
function fixFilmTitleCase(html) {
  // Se começa com padrão de autor (MAIÚSCULAS seguidas de vírgula), não mexer.
  // Exemplos de autor: "LESSA, Sérgio", "BRASIL."
  if (/^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,},/.test(html)) return html;
  // Se começa com tag de formatação, provavelmente tem autor. Não mexer.
  if (/^<[bi]>/.test(html)) return html;

  // Sem autor detectado: colocar a primeira palavra em caixa alta.
  // Se a primeira palavra é um artigo (O, A, OS, AS, UM, UMA), inclui
  // a próxima palavra também — a UFC capitaliza artigo + substantivo.
  // Ex: "O inverno" → "O INVERNO", "A força" → "A FORÇA",
  //     "As melhores" → "AS MELHORES"
  const articles = /^(o|a|os|as|um|uma|uns|umas)\s/i;
  if (articles.test(html)) {
    return html.replace(/^(\S+)\s+(\S+?)([:\s.])/, (_, art, word, sep) => {
      return art.toUpperCase() + " " + word.toUpperCase() + sep;
    });
  }
  // A primeira "palavra" vai até o primeiro espaço, ":" ou ".".
  return html.replace(/^(\S+?)([:\s.])/, (_, firstWord, separator) => {
    return firstWord.toUpperCase() + separator;
  });
}

/**
 * Correção 10: Título atribuído — colchetes para fora do negrito
 *
 * Problema:
 *   CSL gera: <b>[Biblioteca de Ciências e Tecnologia]</b>
 *   UFC exige: [<b>Biblioteca de Ciências e Tecnologia</b>]
 *
 * Títulos atribuídos (entre colchetes) são comuns em fotografias,
 * cartas e obras sem título original. O CSL aplica bold ao campo
 * inteiro, incluindo os colchetes. Mas os colchetes devem ficar
 * fora da formatação tipográfica.
 *
 * Regex:
 *   <b>\[ — abertura do negrito seguida de colchete
 *   ([^\]]+) — conteúdo do título (tudo exceto ])
 *   \]</b> — colchete de fechamento seguido de fechamento do negrito
 */
function fixBracketedTitle(html) {
  return html.replace(/<b>\[([^\]]+)\]<\/b>/g, '[<b>$1</b>]');
}

/**
 * Correção 11: Anais — mover "[...]" para fora do negrito (evento)
 *
 * Problema:
 *   CSL gera: <b>Anais [...]</b>
 *   UFC exige: <b>Anais</b> [...]
 *
 * O campo "title" ou "container-title" contém "Anais [...]" e o CSL aplica
 * bold ao campo inteiro. Mas "[...]" (supressão) deve ficar fora do negrito.
 *
 * Regex:
 *   <b>  — abertura do negrito
 *   ([^<]*?) — conteúdo do título (non-greedy)
 *   \s*  — espaço opcional antes de [...]
 *   (\[\.{3}\]) — literal "[...]"
 *   </b> — fechamento do negrito
 */
function fixAnaisBrackets(html) {
  return html.replace(/<b>([^<]*?)\s*(\[\.{3}\])<\/b>/g, '<b>$1</b> $2');
}

/**
 * Correção 14: Capítulo sem editora — remove [s. n.] e ajusta pontuação
 *
 * Problema:
 *   CSL gera: **Container**. Local: [<i>s. n.</i>], Ano.
 *   UFC exige: **Container**, Local, Ano. (quando não há editora)
 *
 * Em capítulos (blogs, obras informais), a ausência de editora faz o CSL
 * inserir "[s. n.]". A UFC omite o "[s. n.]" e usa vírgulas.
 *
 * Regex:
 *   </b>. Local: [<i>s. n.</i>], Ano → </b>, Local, Ano
 *   Captura o padrão: fechamento de bold + ". " + local + ": [s. n.], " + ano
 */
function fixChapterNoPublisher(html) {
  // Pattern: </b>. PLACE: [<i>s. n.</i>], YEAR
  // Replace: </b>, PLACE, YEAR
  return html.replace(
    /(<\/b>)\.\s+([^:]+):\s*\[<i>s\. n\.<\/i>\],\s*/g,
    "$1, $2, "
  );
}

/**
 * Correção 13: Container-title — primeira palavra em maiúsculas
 *
 * Problema:
 *   Em partes de obra (faixas de CD, episódios de série), o container-title
 *   é o título da obra-mãe. Quando a obra-mãe é uma entrada por título
 *   (sem autor), a primeira palavra deve ficar em MAIÚSCULAS.
 *
 *   CSL gera: *In*: Cantando coisas de cá. ...
 *   UFC exige: *In*: CANTANDO coisas de cá. ...
 *
 * Detecção:
 *   Após "<i>In</i>: ", se a próxima palavra NÃO é toda maiúscula seguida
 *   de vírgula (padrão de autor), a obra é entrada por título.
 *
 * Também aplica regra de artigos: "A força" → "A FORÇA".
 */
function fixContainerTitleCase(html) {
  // Procura o padrão *In*: seguido de texto
  return html.replace(
    /(<i>In<\/i>:\s+)([^\s<]+)(\s+)?([^\s<]*)?/,
    (match, prefix, firstWord, space, secondWord) => {
      // Se já começa com maiúsculas seguidas de vírgula (autor), não mexer
      if (/^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,},/.test(firstWord)) return match;
      // Artigos: capitaliza artigo + próxima palavra
      // Checamos artigos ANTES do teste de maiúsculas, pois "A", "AS", "OS",
      // "UM" já são maiúsculos e seriam erroneamente ignorados
      const articles = /^(o|a|os|as|um|uma|uns|umas)$/i;
      if (articles.test(firstWord) && space && secondWord) {
        return prefix + firstWord.toUpperCase() + space + secondWord.toUpperCase();
      }
      // Caso normal: só a primeira palavra
      return prefix + firstWord.toUpperCase() + (space || "") + (secondWord || "");
    }
  );
}

/**
 * Correção 12: Bíblia — idioma em caixa mista após "BÍBLIA."
 *
 * Problema:
 *   CSL gera: BÍBLIA. PORTUGUÊS (text-case="uppercase" afeta literal names)
 *   UFC exige: BÍBLIA. Português (idioma em caixa de frase)
 *
 * O container-author literal "BÍBLIA. Português" passa pela macro
 * container-contributors que tem name-part family text-case="uppercase",
 * convertendo tudo para maiúsculas.
 *
 * Regex:
 *   BÍBLIA\.\s+ — literal "BÍBLIA. "
 *   ([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]+) — idioma todo em maiúsculas
 *
 * Converte para title case: primeira letra maiúscula, resto minúscula.
 */
function fixBibleLanguageCase(html) {
  return html.replace(/BÍBLIA\.\s+([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,})/g, (_, lang) => {
    return 'BÍBLIA. ' + lang.charAt(0) + lang.slice(1).toLowerCase();
  });
}

/**
 * Correção 15: Certidão — "Registro em," → "Registro em:"
 *
 * Problema:
 *   O CSL `document` renderiza publisher-place + data com vírgula:
 *     "Registro em, 28 set. 1997."
 *   A UFC exige dois-pontos:
 *     "Registro em: 28 set. 1997."
 *
 * Como funciona:
 *   O campo publisher-place contém o literal "Registro em". O CSL adiciona
 *   vírgula como sufixo. Esta função substitui "Registro em, " por
 *   "Registro em: " — conversão pontual e segura.
 *
 * Segurança:
 *   Só casa com o literal exato "Registro em, " — nenhum outro texto
 *   é afetado. Se publisher-place não contém "Registro em", o regex
 *   simplesmente não casa.
 */
function fixCertidaoDate(html) {
  return html.replace(/Registro em, /g, "Registro em: ");
}

/**
 * Correção 16: Evento em periódico — nome do periódico em negrito
 *
 * Problema:
 *   Eventos publicados em periódicos (3.4.1.3) têm dois elementos bold:
 *     1. O título dos anais (**Anais** [...]) — já resolvido pelo CSL + fixAnaisBrackets
 *     2. O nome do periódico (**Cadernos do Centro...**) — renderizado como note (plain)
 *
 *   O CSL renderiza `note` como texto simples (sem formatação tipográfica).
 *   A UFC exige que o nome do periódico seja bold quando o evento é publicado
 *   como fascículo de uma revista.
 *
 * Como funciona:
 *   1. Percorre os itens procurando type=book com note + volume
 *      (padrão exclusivo de evento-em-periódico)
 *   2. Localiza o valor da note no HTML
 *   3. Se não está já envolvido em <b>, envolve
 *
 * Segurança:
 *   A condição type=book + note + volume é exclusiva de eventos em periódico.
 *   Nenhum outro livro no projeto usa volume com note simultaneamente.
 *   Verificado: 0 fixtures existentes casam com essa condição.
 */
function fixEventJournalBold(html, items) {
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
 * Problema:
 *   Dados importados via DOI (Crossref) frequentemente incluem o país no
 *   campo publisher-place: "Rio de Janeiro, Brazil", "New York, USA".
 *   A UFC/ABNT exige apenas a cidade: "Rio de Janeiro", "New York".
 *
 * Como funciona:
 *   Mantém uma lista explícita de países (em inglês e português) que o
 *   Crossref comprovadamente retorna no campo publisher-place.
 *   Remove ", País" apenas quando seguido por vírgula ou ponto (contexto
 *   de publicação: "Cidade, País, ano." ou "Cidade, País.").
 *
 * Segurança:
 *   - Lista fechada de países (sem regex genérica)
 *   - Exige vírgula antes E vírgula/ponto depois (evita falsos positivos)
 *   - Não afeta referências onde o país NÃO aparece (maioria dos fixtures)
 *   - Se o país é o local inteiro (sem cidade), não remove (exige vírgula antes)
 */
function fixPublisherPlaceCountry(html) {
  // Países mais comuns no Crossref (inglês e português)
  const countries = [
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

  let result = html;
  for (const country of countries) {
    // Padrão: ", País," ou ", País." (com possível espaço)
    const escaped = country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`,\\s*${escaped}(?=[,.])`);
    result = result.replace(re, "");
  }
  return result;
}

/**
 * Renderiza a bibliografia para um conjunto de itens CSL-JSON.
 */
function renderBibliography(items) {
  // Indexar itens por ID
  const itemsById = {};
  for (const item of items) {
    itemsById[item.id] = item;
  }

  // Sistema de callbacks que o citeproc-js precisa
  const sys = {
    retrieveLocale: (lang) => {
      return loadLocale(lang);
    },
    retrieveItem: (id) => {
      return itemsById[id];
    },
  };

  const engine = new CSL.Engine(sys, cslXml, "pt-BR");

  // Registrar todos os itens
  const ids = items.map((item) => item.id);
  engine.updateItems(ids);

  // Gerar bibliografia
  const [params, entries] = engine.makeBibliography();

  // Fluxo: HTML bruto → strip wrappers → postProcess → htmlToMarkdown
  //   1. Remove <div>/<span> e whitespace (postProcess precisa de texto limpo)
  //   2. postProcess: corrige no HTML (subtítulo, en-dash, legislação, filme)
  //   3. htmlToMarkdown: converte <b>→**, <i>→*, <sup>→texto, normaliza
  return entries.map((entry) => {
    let clean = entry
      .replace(/<\/?div[^>]*>/g, "")
      .replace(/<\/?span[^>]*>/g, "")
      .trim();
    clean = postProcess(clean, items);
    return htmlToMarkdown(clean);
  });
}

// ========================================================================
// FIXTURES — dados CSL-JSON para cada referência de teste
// ========================================================================

const TESTS = [
  // ---- 3.1.1.1 Livros e/ou folhetos no todo ----
  {
    section: "3.1.1.1",
    description: "Livro simples - 1 autor",
    items: [
      {
        id: "lessa2014",
        type: "book",
        title: "Cadê os operários?",
        author: [{ family: "Lessa", given: "Sérgio" }],
        publisher: "Instituto Lukacs",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2014]] },
      },
    ],
    expected:
      "LESSA, Sérgio. **Cadê os operários?** São Paulo: Instituto Lukacs, 2014.",
  },
  {
    section: "3.1.1.1",
    description: "Livro - 2 autores com edição",
    items: [
      {
        id: "marconi2004",
        type: "book",
        title: "Metodologia científica",
        author: [
          { family: "Marconi", given: "Marina de Andrade" },
          { family: "Lakatos", given: "Eva Maria" },
        ],
        edition: "4",
        publisher: "Atlas",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2004]] },
      },
    ],
    expected:
      "MARCONI, Marina de Andrade; LAKATOS, Eva Maria. **Metodologia científica**. 4. ed. São Paulo: Atlas, 2004.",
  },
  {
    section: "3.1.1.1",
    description: "Livro - 3 autores",
    items: [
      {
        id: "libaneo2012",
        type: "book",
        title: "Educação escolar: políticas, estrutura e organização",
        author: [
          { family: "Libâneo", given: "José Carlos" },
          { family: "Oliveira", given: "João Ferreira de" },
          { family: "Toschi", given: "Mirza Seabra" },
        ],
        publisher: "Cortez",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2012]] },
      },
    ],
    expected:
      "LIBÂNEO, José Carlos; OLIVEIRA, João Ferreira de; TOSCHI, Mirza Seabra. **Educação escolar**: políticas, estrutura e organização. São Paulo: Cortez, 2012.",
  },
  {
    section: "3.1.1.1",
    description: "Livro - 4 autores (et al)",
    items: [
      {
        id: "farias2014",
        type: "book",
        title: "Didática e docência",
        author: [
          { family: "Farias", given: "I. M. S." },
          { family: "Sales", given: "J. C. B." },
          { family: "Braga", given: "M. M. S. C." },
          { family: "França", given: "M. do S. L. M." },
        ],
        edition: "4",
        publisher: "Liber Livro",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2014]] },
      },
    ],
    expected:
      "FARIAS, I. M. S. *et al*. **Didática e docência**. 4. ed. Brasília, DF: Liber Livro, 2014.",
  },
  {
    section: "3.1.1.1",
    description: "Livro - autoria institucional",
    items: [
      {
        id: "ufc2011",
        type: "book",
        title: "Relatório de atividades 2011",
        author: [
          {
            literal:
              "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária",
          },
        ],
        publisher: "Biblioteca Universitária",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2011]] },
      },
    ],
    expected:
      "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária. **Relatório de atividades 2011**. Fortaleza: Biblioteca Universitária, 2011.",
  },
  // NOTA: Este teste falha por 2 gaps no pós-processamento:
  //   1. citeproc converte "º" → "<sup>o</sup>"; fixOrdinalSup só trata "n<sup>o</sup>"
  //   2. O <sup> dentro do <b> quebra a regex do fixSubtitleBold ([^<]+?)
  //   Resultado atual: "...com 1o e 2o graus**..." (sem º, subtítulo dentro do negrito)
  {
    section: "3.1.1.1",
    description: "Livro - 4+ autores (et al) com subtítulo",
    items: [
      {
        id: "rua1993",
        type: "book",
        title: "Para ensinar geografia: contribuições para os trabalhos com 1º e 2º graus",
        author: [
          { family: "Rua", given: "João" },
          { family: "Autor2", given: "B." },
          { family: "Autor3", given: "C." },
          { family: "Autor4", given: "D." },
        ],
        publisher: "ACCESS",
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[1993]] },
      },
    ],
    expected:
      "RUA, João *et al*. **Para ensinar geografia**: contribuições para os trabalhos com 1º e 2º graus. Rio de Janeiro: ACCESS, 1993.",
  },
  {
    section: "3.1.1.1",
    description: "Livro - com edição (Aulete)",
    items: [
      {
        id: "aulete1980",
        type: "book",
        title: "Dicionário contemporâneo da língua portuguesa",
        author: [{ family: "Aulete", given: "Caldas" }],
        edition: "3",
        publisher: "Delta",
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[1980]] },
      },
    ],
    expected:
      "AULETE, Caldas. **Dicionário contemporâneo da língua portuguesa**. 3. ed. Rio de Janeiro: Delta, 1980.",
  },
  // NOTA: citeproc converte apóstrofo reto (') → curvo (\u2019) automaticamente.
  // htmlToMarkdown normaliza de volta para ASCII (') — expected usa ASCII.
  {
    section: "3.1.1.1",
    description: "Livro - sobrenome com apóstrofo (O'Hara) com subtítulo",
    items: [
      {
        id: "ohara2007",
        type: "book",
        title: "Enciclopédia da moda: de 1840 à década de 90",
        author: [{ family: "O'Hara", given: "Georgina" }],
        publisher: "Companhia das Letras",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2007]] },
      },
    ],
    expected:
      "O'HARA, Georgina. **Enciclopédia da moda**: de 1840 à década de 90. São Paulo: Companhia das Letras, 2007.",
  },
  // NOTA: Este teste falha por 2 gaps no pós-processamento:
  //   1. CSL aplica <b> ao título mesmo sem autor; fixFilmTitleCase pula quando vê <b>
  //   2. Para a UFC, entrada por título não leva negrito e primeira palavra fica em CAIXA ALTA
  //   Resultado atual: "**Collins dicionário**: inglês-..." (com bold, sem uppercase)
  //   Esperado UFC: "COLLINS dicionário: inglês-..." (sem bold, com uppercase)
  {
    section: "3.1.1.1",
    description: "Livro - entrada pelo título (sem autor)",
    items: [
      {
        id: "collins2009",
        type: "book",
        title: "Collins dicionário: inglês-português, português-inglês",
        edition: "6",
        publisher: "Collins",
        "publisher-place": "Glasgow",
        issued: { "date-parts": [[2009]] },
      },
    ],
    expected:
      "COLLINS dicionário: inglês-português, português-inglês. 6. ed. Glasgow: Collins, 2009.",
  },
  // ---- 3.1.1.2 E-books ----
  {
    // NOTA: O CSL gera editores SEM o label "(ed.)" quando usados como
    // substituto de autor (a macro `author` > `substitute` > `names variable="editor"`
    // não inclui `<label>`). A UFC exige "(ed.)" — gap para pós-processamento ou
    // correção no CSL (adicionar <label form="short" prefix=" (" suffix=")"/> ao substitute).
    section: "3.1.1.2",
    description: "E-book - CD-ROM com editores",
    items: [
      {
        id: "koogan1998",
        type: "book",
        title: "Enciclopédia e dicionário digital",
        editor: [
          { family: "Koogan", given: "André" },
          { family: "Houaiss", given: "Antônio" },
        ],
        publisher: "Delta",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[1998]] },
        medium: "5 CD-ROM",
      },
    ],
    expected:
      "KOOGAN, André; HOUAISS, Antônio (ed.). **Enciclopédia e dicionário digital**. São Paulo: Delta, 1998. 5 CD-ROM.",
  },
  {
    // NOTA: O CSL renderiza `medium` sem itálico (`<text variable="medium">`
    // não tem `font-style="italic"`). A UFC exige "E-book" em itálico —
    // gap para pós-processamento ou correção no CSL.
    section: "3.1.1.2",
    description: "E-book - livro digital com subtítulo",
    items: [
      {
        id: "spohr2010",
        type: "book",
        title: "A batalha do apocalipse: da queda dos anjos ao crepúsculo do mundo",
        author: [{ family: "Spohr", given: "Eduardo" }],
        publisher: "Verus",
        "publisher-place": "Campinas",
        issued: { "date-parts": [[2010]] },
        medium: "E-book",
      },
    ],
    expected:
      "SPOHR, Eduardo. **A batalha do apocalipse**: da queda dos anjos ao crepúsculo do mundo. Campinas: Verus, 2010. *E-book*.",
  },
  // ---- 3.1.1.3 Parte de livros ----
  {
    section: "3.1.1.3",
    description: "Capítulo de livro com organizadores",
    items: [
      {
        id: "muller1999",
        type: "chapter",
        title:
          "O macroeixo São Paulo-Buenos Aires e a gestão territorializada de governos subnacionais",
        author: [{ family: "Muller", given: "Geraldo" }],
        editor: [
          { family: "Castro", given: "Iná Elias de" },
          { family: "Miranda", given: "Mariana" },
          { family: "Egler", given: "Claudio" },
        ],
        "container-title": "Redescobrindo o Brasil: 500 anos depois",
        publisher: "Bertrand Brasil: FAPERJ",
        "publisher-place": "Rio de Janeiro",
        page: "41-55",
        issued: { "date-parts": [[1999]] },
      },
    ],
    expected:
      "MULLER, Geraldo. O macroeixo São Paulo-Buenos Aires e a gestão territorializada de governos subnacionais. *In*: CASTRO, Iná Elias de; MIRANDA, Mariana; EGLER, Claudio (org.). **Redescobrindo o Brasil**: 500 anos depois. Rio de Janeiro: Bertrand Brasil: FAPERJ, 1999. p. 41-55.",
  },
  {
    section: "3.1.1.3",
    description: "Capítulo - 2 autores, 3 editores",
    items: [
      {
        id: "barbosa2004",
        type: "chapter",
        title: "Introdução",
        author: [
          { family: "Barbosa", given: "G. A." },
          { family: "Pinheiro", given: "A. G." },
        ],
        editor: [
          { family: "Pimentel", given: "A. J. P." },
          { family: "Andrade", given: "E. O." },
          { family: "Barbosa", given: "G. A." },
        ],
        "container-title": "Os estudantes de medicina e o ato médico: atitudes e valores que norteiam seu posicionamento",
        publisher: "Conselho Federal de Medicina",
        "publisher-place": "Brasília, DF",
        page: "25-30",
        issued: { "date-parts": [[2004]] },
      },
    ],
    expected:
      "BARBOSA, G. A.; PINHEIRO, A. G. Introdução. *In*: PIMENTEL, A. J. P.; ANDRADE, E. O.; BARBOSA, G. A. (org.). **Os estudantes de medicina e o ato médico**: atitudes e valores que norteiam seu posicionamento. Brasília, DF: Conselho Federal de Medicina, 2004. p. 25-30.",
  },
  // ---- 3.1.1.4 Parte de livros em meio eletrônico ----
  {
    section: "3.1.1.4",
    description: "Capítulo de e-book com URL e subtítulo",
    items: [
      {
        id: "silva2013cap",
        type: "chapter",
        title:
          "Hilda Hilst no fluxo da consciência: o horizonte estético de contos d'escárnio",
        author: [{ family: "Silva", given: "Reginaldo Oliveira" }],
        "container-title":
          "Uma superfície de gelo ancorada no riso: a atualidade do grotesco em Hilda Hilst",
        "container-author": [
          { family: "Silva", given: "Reginaldo Oliveira" },
        ],
        publisher: "EDUEPB",
        "publisher-place": "Campina Grande",
        page: "199-292",
        issued: { "date-parts": [[2013]] },
        URL: "http://books.scielo.org/id/wwfpz",
        accessed: { "date-parts": [[2016, 4, 1]] },
      },
    ],
    expected:
      "SILVA, Reginaldo Oliveira. Hilda Hilst no fluxo da consciência: o horizonte estético de contos d'escárnio. *In*: SILVA, Reginaldo Oliveira. **Uma superfície de gelo ancorada no riso**: a atualidade do grotesco em Hilda Hilst. Campina Grande: EDUEPB, 2013. p. 199-292. Disponível em: http://books.scielo.org/id/wwfpz. Acesso em: 1 abr. 2016.",
  },
  {
    section: "3.1.1.3",
    description: "Capítulo - entrada por título (Batuque)",
    items: [
      {
        id: "batuque2012",
        type: "chapter",
        title: "Batuque",
        "container-title": "Dicionário do folclore brasileiro",
        "container-author": [{ family: "Cascudo", given: "Luis da Câmara" }],
        edition: "12",
        publisher: "Global",
        "publisher-place": "São Paulo",
        page: "59",
        issued: { "date-parts": [[2012]] },
      },
    ],
    expected:
      "BATUQUE. *In*: CASCUDO, Luis da Câmara. **Dicionário do folclore brasileiro**. 12. ed. São Paulo: Global, 2012. p. 59.",
  },
  {
    section: "3.1.1.3",
    description: "Capítulo - entrada por título (Formatação)",
    items: [
      {
        id: "formatacao2008",
        type: "chapter",
        title: "Formatação",
        "container-title": "Dicionário de biblioteconomia e arquivologia",
        "container-author": [
          { family: "Cunha", given: "Murilo Bastos" },
          { family: "Cavalcanti", given: "Cordélia Robalinho de Oliveira" },
        ],
        publisher: "Briquet de Lemos",
        "publisher-place": "Brasília, DF",
        page: "173",
        issued: { "date-parts": [[2008]] },
      },
    ],
    expected:
      "FORMATAÇÃO. *In*: CUNHA, Murilo Bastos; CAVALCANTI, Cordélia Robalinho de Oliveira. **Dicionário de biblioteconomia e arquivologia**. Brasília, DF: Briquet de Lemos, 2008. p. 173.",
  },
  // ---- 3.1.2.1 Trabalhos acadêmicos ----
  {
    section: "3.1.2.1",
    description: "Tese de doutorado",
    items: [
      {
        id: "benegas2006",
        type: "thesis",
        title: "Três ensaios em análise econômica",
        author: [{ family: "Benegas", given: "M." }],
        genre: "Tese (Doutorado em Economia)",
        publisher: "Universidade Federal do Ceará",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2006]] },
        note: "Faculdade de Economia, Administração, Atuária e Contabilidade",
      },
    ],
    expected:
      "BENEGAS, M. **Três ensaios em análise econômica**. 2006. Tese (Doutorado em Economia) – Faculdade de Economia, Administração, Atuária e Contabilidade, Universidade Federal do Ceará, Fortaleza, 2006.",
  },
  {
    section: "3.1.2.1",
    description: "Dissertação de mestrado",
    items: [
      {
        id: "mayorga2006",
        type: "thesis",
        title: "Análise de transmissão de preços do mercado de melão do Brasil",
        author: [{ family: "Mayorga", given: "Rodrigo de Oliveira" }],
        genre: "Dissertação (Mestrado em Economia Rural)",
        publisher: "Universidade Federal do Ceará",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2006]] },
        note: "Centro de Ciências Agrárias",
      },
    ],
    expected:
      "MAYORGA, Rodrigo de Oliveira. **Análise de transmissão de preços do mercado de melão do Brasil**. 2006. Dissertação (Mestrado em Economia Rural) – Centro de Ciências Agrárias, Universidade Federal do Ceará, Fortaleza, 2006.",
  },
  // ---- 3.1.2.2 Trabalhos acadêmicos em meio eletrônico ----
  {
    section: "3.1.2.2",
    description: "Tese eletrônica com URL",
    items: [
      {
        id: "lourenco2018",
        type: "thesis",
        title:
          "Proposta de modelo físico-socioambiental para o estudo de bacias hidrográficas semiáridas do nordeste setentrional (Brasil)",
        author: [{ family: "Lourenço", given: "Ronaldo Mendes" }],
        genre: "Tese (Doutorado em Geografia)",
        publisher: "Universidade Federal do Ceará",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2018]] },
        note: "Centro de Ciências",
        URL: "http://www.repositorio.ufc.br/handle/riufc/39044",
        accessed: { "date-parts": [[2019, 2, 13]] },
      },
    ],
    expected:
      "LOURENÇO, Ronaldo Mendes. **Proposta de modelo físico-socioambiental para o estudo de bacias hidrográficas semiáridas do nordeste setentrional (Brasil)**. 2018. Tese (Doutorado em Geografia) – Centro de Ciências, Universidade Federal do Ceará, Fortaleza, 2018. Disponível em: http://www.repositorio.ufc.br/handle/riufc/39044. Acesso em: 13 fev. 2019.",
  },
  // ---- 3.3.7 Artigo de periódico ----
  {
    section: "3.3.7",
    description: "Artigo de periódico - básico",
    items: [
      {
        id: "hoffmann2006",
        type: "article-journal",
        title: "A autoridade e a questão do pai",
        author: [{ family: "Hoffmann", given: "C." }],
        "container-title": "Ágora: estudos em teoria psicanalítica",
        "publisher-place": "Rio de Janeiro",
        volume: "9",
        issue: "2",
        page: "169-176",
        // Date range: [[início], [fim]] — gera "jul./dez." no CSL
        issued: { "date-parts": [[2006, 7], [2006, 12]] },
      },
    ],
    expected:
      "HOFFMANN, C. A autoridade e a questão do pai. **Ágora**: estudos em teoria psicanalítica, Rio de Janeiro, v. 9, n. 2, p. 169-176, jul./dez. 2006.",
  },
  {
    section: "3.3.7",
    description: "Artigo de periódico - 3 autores, mês único",
    items: [
      {
        id: "nunez2005",
        type: "article-journal",
        title:
          "Stress hídrico e a distribuição de características vegetativas e reprodutivas de um cultivo de feijão",
        author: [
          { family: "Nunez Barrios", given: "A." },
          { family: "Hoogenboom", given: "G." },
          { family: "Nesmith", given: "D. S." },
        ],
        "container-title": "Sci. Agric.",
        "publisher-place": "Piracicaba",
        volume: "62",
        issue: "1",
        page: "18-22",
        issued: { "date-parts": [[2005, 1]] },
      },
    ],
    expected:
      "NUNEZ BARRIOS, A.; HOOGENBOOM, G.; NESMITH, D. S. Stress hídrico e a distribuição de características vegetativas e reprodutivas de um cultivo de feijão. **Sci. Agric.**, Piracicaba, v. 62, n. 1, p. 18-22, jan. 2005.",
  },
  {
    section: "3.3.7",
    description: "Artigo de periódico - 4+ autores (et al), só ano",
    items: [
      {
        id: "rees2011",
        type: "article-journal",
        title:
          "Advancements in web-database applications for rabies surveillance",
        author: [
          { family: "Rees", given: "Erin E." },
          { family: "Bélanger", given: "Denise" },
          { family: "Bhatt", given: "Mrutyunjaya" },
          { family: "Tinline", given: "Robin" },
        ],
        "container-title": "International Journal of Health Geographics",
        "publisher-place": "London",
        volume: "10",
        issue: "1",
        page: "48",
        issued: { "date-parts": [[2011]] },
      },
    ],
    expected:
      "REES, Erin E. *et al*. Advancements in web-database applications for rabies surveillance. **International Journal of Health Geographics**, London, v. 10, n. 1, p. 48, 2011.",
  },
  {
    section: "3.3.7",
    description: "Artigo de periódico - 3 autores, só ano",
    items: [
      {
        id: "favoretto2013",
        type: "article-journal",
        title:
          "O surgimento de espécies silvestres como fonte de infecção por raiva humana no Brasil",
        author: [
          { family: "Favoretto", given: "S. R." },
          { family: "Matos", given: "C. C." },
          { family: "Matos", given: "C. A." },
        ],
        "container-title": "Epideimol. Infect.",
        "publisher-place": "Cambridge",
        volume: "141",
        issue: "7",
        page: "1552-1561",
        issued: { "date-parts": [[2013]] },
      },
    ],
    expected:
      "FAVORETTO, S. R.; MATOS, C. C.; MATOS, C. A. O surgimento de espécies silvestres como fonte de infecção por raiva humana no Brasil. **Epideimol. Infect.**, Cambridge, v. 141, n. 7, p. 1552-1561, 2013.",
  },
  // ---- 3.3.8 Artigo de periódico em meio eletrônico ----
  {
    section: "3.3.8",
    description: "Artigo de periódico eletrônico com URL",
    items: [
      {
        id: "lavalle2015",
        type: "article-journal",
        title:
          "Representación y participación en la crítica democrática",
        author: [
          { family: "Lavalle", given: "Adrián Gurza" },
          { family: "Ernesto Isunza", given: "Vera" },
        ],
        "container-title": "Desacatos",
        "publisher-place": "[Ciudad del México]",
        volume: "49",
        page: "10-27",
        issued: { "date-parts": [[2015]] },
        URL: "https://desacatos.ciesas.edu.mx/index.php/Desacatos/article/view/150",
        accessed: { "date-parts": [[2019, 7, 31]] },
      },
    ],
    expected:
      "LAVALLE, Adrián Gurza; ERNESTO ISUNZA, Vera. Representación y participación en la crítica democrática. **Desacatos**, [Ciudad del México], v. 49, p. 10-27, 2015. Disponível em: https://desacatos.ciesas.edu.mx/index.php/Desacatos/article/view/150. Acesso em: 31 jul. 2019.",
  },
  // ---- 3.3.9 Artigo de jornal ----
  {
    section: "3.3.9",
    description: "Artigo de jornal",
    items: [
      {
        id: "holanda2019",
        type: "article-newspaper",
        title:
          "Emendas continuam a ser instrumentos de barganha",
        author: [{ family: "Holanda", given: "Carlos" }],
        "container-title": "O Povo",
        "publisher-place": "Fortaleza",
        volume: "92",
        issue: "30.730",
        page: "20",
        issued: { "date-parts": [[2019, 8, 18]] },
      },
    ],
    expected:
      "HOLANDA, Carlos. Emendas continuam a ser instrumentos de barganha. **O Povo**, Fortaleza, ano 92, n. 30.730, p. 20, 18 ago. 2019.",
  },
  {
    section: "3.3.9",
    description: "Artigo de jornal - com caderno e subtítulo",
    items: [
      {
        id: "barros2019",
        type: "article-newspaper",
        title:
          "STF deve concluir hoje julgamento sobre criminalização da homofobia: duas ações tratam da omissão do Congresso Nacional sobre o tema e começaram a ser discutidas ontem",
        author: [{ family: "Barros", given: "Luana" }],
        "container-title": "O Povo",
        "publisher-place": "Fortaleza",
        volume: "43",
        issue: "30.547",
        page: "11",
        section: "Caderno política",
        issued: { "date-parts": [[2019, 2, 14]] },
      },
    ],
    expected:
      "BARROS, Luana. STF deve concluir hoje julgamento sobre criminalização da homofobia: duas ações tratam da omissão do Congresso Nacional sobre o tema e começaram a ser discutidas ontem. **O Povo**, Fortaleza, ano 43, n. 30.547, 14 fev. 2019. Caderno política, p. 11.",
  },
  // ---- 3.5.1 Patente ----
  {
    section: "3.5.1",
    description: "Patente",
    items: [
      {
        id: "schroeder_patent",
        type: "patent",
        title:
          "Aparelho para servir bebidas e processo para converter um aparelho para servir bebidas",
        author: [
          { family: "Schroeder", given: "Alfred A." },
          { family: "Credle", given: "William S." },
        ],
        publisher: "The Coca-Cola Company",
        "publisher-place": "BR",
        number: "PI 8706898-2 B1",
        submitted: { "date-parts": [[1988, 3, 29]] },
        issued: { "date-parts": [[1991, 10, 29]] },
      },
    ],
    expected:
      "SCHROEDER, Alfred A.; CREDLE, William S. **Aparelho para servir bebidas e processo para converter um aparelho para servir bebidas**. Depositante: The Coca-Cola Company. BR n. PI 8706898-2 B1. Depósito: 29 mar. 1988. Concessão: 29 out. 1991.",
  },
  // ---- 3.6.1 Legislação ----
  // NOTA: Constituição usa type "book". A nota "[Constituição (1988)]" fica
  // após o título no CSL (campo note) mas a UFC quer antes — requer pós-processamento.
  // Subtítulo dentro do negrito também requer pós-processamento.
  {
    section: "3.6.1",
    description: "Constituição (como livro — requer pós-processamento para nota e subtítulo)",
    items: [
      {
        id: "brasil_constituicao",
        type: "book",
        title:
          "Constituição da República Federativa do Brasil: promulgada em 5 de outubro de 1988, atualizada até a Emenda Constitucional nº 39, de 19 de dezembro de 2002",
        author: [{ literal: "BRASIL" }],
        note: "[Constituição (1988)]",
        edition: "31",
        publisher: "Saraiva",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2003]] },
      },
    ],
    // Saída atual do CSL (com note após título):
    // BRASIL. **Constituição...nº 39...2002**. [Constituição (1988)]. 31. ed. São Paulo: Saraiva, 2003.
    // Esperado UFC (note antes do título, subtítulo fora do negrito):
    expected:
      "BRASIL. [Constituição (1988)]. **Constituição da República Federativa do Brasil**: promulgada em 5 de outubro de 1988, atualizada até a Emenda Constitucional nº 39, de 19 de dezembro de 2002. 31. ed. São Paulo: Saraiva, 2003.",
  },
  {
    section: "3.6.1",
    description: "Código civil (livro com autor institucional)",
    items: [
      {
        id: "brasil_codigo_civil",
        type: "book",
        title: "Código civil",
        author: [{ literal: "BRASIL" }],
        edition: "46",
        publisher: "Saraiva",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2005]] },
      },
    ],
    expected:
      "BRASIL. **Código civil**. 46. ed. São Paulo: Saraiva, 2005.",
  },
  // ---- 3.8.1 Filmes/vídeos ----
  {
    section: "3.8.1",
    description: "Filme com diretor",
    items: [
      {
        id: "alzheimer2011",
        type: "motion_picture",
        title: "Alzheimer: mudanças na comunicação e no comportamento",
        director: [{ family: "Jessouroun", given: "Thereza" }],
        publisher: "Kino Filmes",
        "publisher-place": "[Rio de Janeiro]",
        issued: { "date-parts": [[2011]] },
        medium: "1 DVD (26 min)",
      },
    ],
    expected:
      "ALZHEIMER: mudanças na comunicação e no comportamento. Direção: Thereza Jessouroun. [Rio de Janeiro]: Kino Filmes, 2011. 1 DVD (26 min).",
  },
  {
    section: "3.8.1",
    description: "Filme - série com produtor (sem diretor)",
    items: [
      {
        id: "got2012",
        type: "motion_picture",
        title: "Game of thrones",
        // Sem `author` → título é o primeiro elemento (entrada por título)
        // `director` com `genre: "Produção"` → CSL renderiza "Produção: Nome, Nome"
        director: [
          { family: "Benoff", given: "David" },
          { family: "Weiss", given: "D. B." },
        ],
        genre: "Produção",
        publisher: "HBO",
        "publisher-place": "New York",
        issued: { "date-parts": [[2012]] },
        medium: "5 discos",
      },
    ],
    expected:
      "GAME of thrones. Produção: David Benoff, D. B. Weiss. New York: HBO, 2012. 5 discos.",
  },
  {
    section: "3.8.3",
    description: "Documento sonoro - CD com intérprete",
    items: [
      {
        id: "brasilizacao2006",
        type: "song",
        title: "Brasilização",
        author: [{ family: "Canário", given: "Anna" }],
        publisher: "Estúdio Santa Música",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2006]] },
        medium: "1 CD",
      },
    ],
    expected:
      "BRASILIZAÇÃO. Intérprete: Anna Canário. Fortaleza: Estúdio Santa Música, 2006. 1 CD.",
  },
  // ---- 3.10.1 Documento iconográfico ----
  {
    section: "3.10.1",
    description: "Pintura",
    items: [
      {
        id: "portinari1935",
        type: "graphic",
        title: "Café",
        author: [{ family: "Portinari", given: "C." }],
        issued: { "date-parts": [[1935]] },
        genre: "1 reprodução",
        medium: "óleo sobre tela",
        dimensions: "130 x 195 cm",
      },
    ],
    expected:
      "PORTINARI, C. **Café**. 1935. 1 reprodução, óleo sobre tela, 130 x 195 cm.",
  },
  // ---- 3.11.1 Documento cartográfico ----
  {
    section: "3.11.1",
    description: "Mapa - título com dois ':' (subtítulo duplo)",
    items: [
      {
        id: "mma_mapa2012",
        type: "map",
        title:
          "Mapa do macrozoneamento ecológico-econômico da Bacia do Rio São Francisco: diagnóstico da biodiversidade: áreas importantes para conservação da biodiversidade",
        author: [
          {
            literal:
              "BRASIL. Ministério do Meio Ambiente",
          },
        ],
        publisher: "MMA",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2012]] },
        genre: "1 mapa",
        medium: "color.",
        scale: "1:2750.000",
      },
    ],
    expected:
      "BRASIL. Ministério do Meio Ambiente. **Mapa do macrozoneamento ecológico-econômico da Bacia do Rio São Francisco**: diagnóstico da biodiversidade: áreas importantes para conservação da biodiversidade. Brasília, DF: MMA, 2012. 1 mapa, color. Escala 1:2750.000.",
  },
  // ---- 3.6.5 Atos administrativos normativos ----
  {
    section: "3.6.5",
    description: "Ato administrativo - regimento (autor institucional + subdivisão)",
    items: [
      {
        id: "ufc_portaria2015",
        type: "book",
        title: "Portaria nº 5046, de 07 de dezembro de 2015",
        author: [
          {
            literal:
              "UNIVERSIDADE FEDERAL DO CEARÁ. Pró-Reitoria de Gestão de Pessoas",
          },
        ],
        publisher: "UFC",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2015]] },
      },
    ],
    expected:
      "UNIVERSIDADE FEDERAL DO CEARÁ. Pró-Reitoria de Gestão de Pessoas. **Portaria nº 5046, de 07 de dezembro de 2015**. Fortaleza: UFC, 2015.",
  },
  {
    section: "3.6.5",
    description: "Ato administrativo - regimento geral",
    items: [
      {
        id: "ufc_regimento2018",
        type: "book",
        title: "Regimento geral",
        author: [{ literal: "UNIVERSIDADE FEDERAL DO CEARÁ" }],
        publisher: "UFC",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2018]] },
      },
    ],
    expected:
      "UNIVERSIDADE FEDERAL DO CEARÁ. **Regimento geral**. Fortaleza: UFC, 2018.",
  },
  // ---- 3.13.3 Programas de computador ----
  {
    section: "3.13.3",
    description: "Software - com URL",
    items: [
      {
        id: "avast2019",
        type: "book",
        title: "Avast antivirus",
        author: [{ literal: "AVAST SOFTWARE" }],
        publisher: "Avast Software",
        "publisher-place": "Praga",
        issued: { "date-parts": [[2019]] },
        // publisher = autor → pós-processamento remove a editora duplicada
        URL: "https://www.avast.com/index#pc",
        accessed: { "date-parts": [[2019, 7, 29]] },
      },
    ],
    expected:
      "AVAST SOFTWARE. **Avast antivirus**. Praga, 2019. Disponível em: https://www.avast.com/index#pc. Acesso em: 29 jul. 2019.",
  },
  // ---- 3.14.9 Bíblia ----
  {
    section: "3.14.9",
    description: "Bíblia",
    items: [
      {
        id: "biblia1999",
        type: "book",
        title: "Bíblia sagrada",
        author: [{ literal: "BÍBLIA. Português" }],
        edition: "2",
        publisher: "Sociedade Bíblica do Brasil",
        "publisher-place": "Barueri",
        issued: { "date-parts": [[1999]] },
      },
    ],
    expected:
      "BÍBLIA. Português. **Bíblia sagrada**. 2. ed. Barueri: Sociedade Bíblica do Brasil, 1999.",
  },
  // ---- 3.14.11 Parte de bíblia ----
  {
    section: "3.14.11",
    description: "Parte de bíblia",
    items: [
      {
        id: "biblia_eclesiastes",
        type: "chapter",
        title: "A. T. Eclesiastes",
        author: [{ literal: "BÍBLIA" }],
        "container-title": "Bíblia sagrada: antigo e novo testamento",
        "container-author": [{ literal: "BÍBLIA. Português" }],
        publisher: "Vida",
        "publisher-place": "São Paulo",
        page: "362-367",
        issued: { "date-parts": [[2001]] },
      },
    ],
    expected:
      "BÍBLIA. A. T. Eclesiastes. *In*: BÍBLIA. Português. **Bíblia sagrada**: antigo e novo testamento. São Paulo: Vida, 2001. p. 362-367.",
  },
  // ---- 3.4.1.1 Evento no todo em monografia ----
  {
    section: "3.4.1.1",
    description: "Anais de congresso",
    items: [
      {
        id: "congresso_ecologia2003",
        type: "book",
        title: "Anais [...]",
        author: [
          {
            literal:
              "CONGRESSO DE ECOLOGIA DO BRASIL, 6., 2003, Fortaleza",
          },
        ],
        publisher: "UFC",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2003]] },
      },
    ],
    expected:
      "CONGRESSO DE ECOLOGIA DO BRASIL, 6., 2003, Fortaleza. **Anais** [...]. Fortaleza: UFC, 2003.",
  },
  // ---- 3.4.2.1 Parte de evento em monografia ----
  {
    section: "3.4.2.1",
    description: "Trabalho em anais de congresso",
    items: [
      {
        id: "lima2003",
        type: "paper-conference",
        title:
          "Estudos etnobotânicos na Serra de Maranguape, CE",
        author: [{ family: "Lima", given: "C. M." }],
        "event-title":
          "CONGRESSO DE ECOLOGIA DO BRASIL, 6., 2003, Fortaleza",
        "container-title": "Anais [...]",
        publisher: "UFC",
        "publisher-place": "Fortaleza",
        page: "419-420",
        issued: { "date-parts": [[2003]] },
      },
    ],
    expected:
      "LIMA, C. M. Estudos etnobotânicos na Serra de Maranguape, CE. *In*: CONGRESSO DE ECOLOGIA DO BRASIL, 6., 2003, Fortaleza. **Anais** [...]. Fortaleza: UFC, 2003. p. 419-420.",
  },
  // ---- 3.2.1 Correspondência ----
  {
    section: "3.2.1",
    description: "Carta pessoal",
    items: [
      {
        id: "santos2019carta",
        type: "personal_communication",
        title: "Carta para o filho",
        author: [{ family: "Santos", given: "Heitor" }],
        recipient: [{ family: "Silva", given: "Jefferson Amorim da" }],
        "publisher-place": "Caucaia",
        issued: { "date-parts": [[2019]] },
        medium: "1 carta",
      },
    ],
    expected:
      "SANTOS, Heitor. [**Carta para o filho**]. Destinatário: Jefferson Amorim da Silva. Caucaia, 2019. 1 carta.",
  },
  // ---- 3.9.1 Partitura ----
  {
    section: "3.9.1",
    description: "Partitura musical",
    items: [
      {
        id: "villalobos1916",
        type: "musical_score",
        title: "Coleções de quartetos modernos",
        author: [{ family: "Villa-Lobos", given: "H." }],
        medium: "Violoncelo",
        publisher: "Universal",
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[1916]] },
        genre: "1 partitura",
      },
    ],
    expected:
      "VILLA-LOBOS, H. **Coleções de quartetos modernos**. Violoncelo. Rio de Janeiro: Universal, 1916. 1 partitura.",
  },
  // ---- 3.14.5 Bula de remédio ----
  {
    section: "3.14.5",
    description: "Bula de remédio (entrada por título)",
    items: [
      {
        id: "cefadroxila2010",
        type: "book",
        title: "Cefadroxila",
        note: "Responsável técnico Ronoel Caza de Dio",
        publisher: "EMS",
        "publisher-place": "Hortolândia",
        issued: { "date-parts": [[2010]] },
        medium: "1 bula de remédio",
      },
    ],
    expected:
      "CEFADROXILA. Responsável técnico Ronoel Caza de Dio. Hortolândia: EMS, 2010. 1 bula de remédio.",
  },
  // ---- 3.14.7 Psicografia ----
  {
    section: "3.14.7",
    description: "Psicografia",
    items: [
      {
        id: "campos_espirito2015",
        type: "book",
        title: "Brasil, coração do mundo, pátria do evangelho.",
        author: [{ literal: "CAMPOS, Humberto de (Espírito)" }],
        note: "Psicografado por Francisco Cândido Xavier",
        publisher: "FEB",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2015]] },
      },
    ],
    expected:
      "CAMPOS, Humberto de (Espírito). **Brasil, coração do mundo, pátria do evangelho.** Psicografado por Francisco Cândido Xavier. Brasília, DF: FEB, 2015.",
  },
  // ---- 3.13.6 Websites ----
  {
    section: "3.13.6",
    description: "Website institucional",
    items: [
      {
        id: "ufc_bu2019",
        type: "webpage",
        title: "Biblioteca Universitária",
        author: [{ literal: "UNIVERSIDADE FEDERAL DO CEARÁ" }],
        "publisher-place": "Fortaleza",
        publisher: "UFC",
        issued: { "date-parts": [[2019]] },
        URL: "http://www.biblioteca.ufc.br",
        accessed: { "date-parts": [[2019, 5, 18]] },
      },
    ],
    expected:
      "UNIVERSIDADE FEDERAL DO CEARÁ. **Biblioteca Universitária**. Fortaleza: UFC, 2019. Disponível em: http://www.biblioteca.ufc.br. Acesso em: 18 maio 2019.",
  },
  // ---- 3.14.1 Entrevista ----
  {
    section: "3.14.1",
    description: "Entrevista em periódico",
    items: [
      {
        id: "duval2020",
        type: "article-journal",
        title:
          "Entrevista: Raymond Duval e a teoria dos registros de representação semiótica",
        author: [{ family: "Duval", given: "Raymond" }],
        "container-title":
          "Revista Paranaense de Educação Matemática",
        "publisher-place": "Campo Mourão",
        volume: "2",
        issue: "3",
        page: "10-34",
        issued: { "date-parts": [[2020, 7], [2020, 12]] },
        publisher: "Entrevista concedida a José Luiz Magalhães de Freitas e Veridiana Rezende",
      },
    ],
    expected:
      "DUVAL, Raymond. Entrevista: Raymond Duval e a teoria dos registros de representação semiótica. Entrevista concedida a José Luiz Magalhães de Freitas e Veridiana Rezende. **Revista Paranaense de Educação Matemática**, Campo Mourão, v. 2, n. 3, p. 10-34, jul./dez. 2020.",
  },
  // ---- 3.14.3 Resenha ----
  {
    section: "3.14.3",
    description: "Resenha de livro em periódico",
    items: [
      {
        id: "campos_filho2019",
        type: "article-journal",
        title:
          "Brecht, Benjamin e a questão do engajamento",
        author: [{ family: "Campos Filho", given: "Lindberg S." }],
        "container-title": "Margem Esquerda",
        "publisher-place": "São Paulo",
        issue: "32",
        page: "149-152",
        issued: { "date-parts": [[2019, 5]] },
        note: "Resenha da obra de: BENJAMIN, Walter. Ensaios sobre Brecht. São Paulo: Boitempo, 2017. 152 p.",
      },
    ],
    expected:
      "CAMPOS FILHO, Lindberg S. Brecht, Benjamin e a questão do engajamento. **Margem Esquerda**, São Paulo, n. 32, p. 149-152, maio 2019. Resenha da obra de: BENJAMIN, Walter. Ensaios sobre Brecht. São Paulo: Boitempo, 2017. 152 p.",
  },
  // ---- 3.11.1 Documento cartográfico (simples) ----
  {
    section: "3.11.1",
    description: "Mapa rodoviário simples",
    items: [
      {
        id: "ceara_mapa2005",
        type: "map",
        title: "Mapa rodoviário e político",
        author: [
          {
            literal: "CEARÁ. Secretaria de Infraestrutura",
          },
        ],
        publisher: "SEINFRA",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2005]] },
        genre: "1 mapa",
        medium: "color.",
        scale: "1:750.000",
      },
    ],
    expected:
      "CEARÁ. Secretaria de Infraestrutura. **Mapa rodoviário e político**. Fortaleza: SEINFRA, 2005. 1 mapa, color. Escala 1:750.000.",
  },
  // ---- 3.11.1 Documento cartográfico (atlas, sem autor) ----
  {
    section: "3.11.1",
    description: "Atlas (entrada por título)",
    items: [
      {
        id: "atlas_ceara1997",
        type: "map",
        title: "Atlas do Ceará",
        publisher: "Fundação Instituto de Planejamento do Ceará",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[1997]] },
        genre: "1 atlas",
      },
    ],
    expected:
      "ATLAS do Ceará. Fortaleza: Fundação Instituto de Planejamento do Ceará, 1997. 1 atlas.",
  },
  // ---- 3.1.1.2 E-book com URL sem medium ----
  {
    section: "3.1.1.2",
    description: "E-book com URL (Ferreira Aurélio)",
    items: [
      {
        id: "ferreira2010",
        type: "book",
        title: "Dicionário Aurélio da língua portuguesa",
        author: [
          { family: "Ferreira", given: "Aurélio Buarque de Holanda" },
        ],
        edition: "5",
        publisher: "Positivo",
        "publisher-place": "Curitiba",
        issued: { "date-parts": [[2010]] },
        URL: "https://pergamum.ufc.br/pergamum/biblioteca/fotos.php?cod_acervo=171775",
        accessed: { "date-parts": [[2019, 2, 12]] },
      },
    ],
    expected:
      "FERREIRA, Aurélio Buarque de Holanda. **Dicionário Aurélio da língua portuguesa**. 5. ed. Curitiba: Positivo, 2010. Disponível em: https://pergamum.ufc.br/pergamum/biblioteca/fotos.php?cod_acervo=171775. Acesso em: 12 fev. 2019.",
  },
  // ---- 3.1.1.2 E-book sem URL ----
  {
    section: "3.1.1.2",
    description: "E-book sem URL (Spohr)",
    items: [
      {
        id: "spohr2010",
        type: "book",
        title: "A batalha do apocalipse: da queda dos anjos ao crepúsculo do mundo",
        author: [{ family: "Spohr", given: "Eduardo" }],
        publisher: "Verus",
        "publisher-place": "Campinas",
        issued: { "date-parts": [[2010]] },
        medium: "E-book",
      },
    ],
    expected:
      "SPOHR, Eduardo. **A batalha do apocalipse**: da queda dos anjos ao crepúsculo do mundo. Campinas: Verus, 2010. *E-book*.",
  },
  // ---- 3.1.1.2 E-book com nº de páginas e URL ----
  {
    section: "3.1.1.2",
    description: "E-book institucional com páginas e URL (Brasil CGU)",
    items: [
      {
        id: "brasil_cgu2015",
        type: "book",
        title: "Relatório de gestão: exercício 2014",
        author: [
          { literal: "BRASIL. Controladoria Geral da União" },
        ],
        publisher: "CGU",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2015]] },
        "number-of-pages": "150",
        URL: "http://goo.gl/C7lXCw",
        accessed: { "date-parts": [[2016, 5, 24]] },
      },
    ],
    expected:
      "BRASIL. Controladoria Geral da União. **Relatório de gestão**: exercício 2014. Brasília, DF: CGU, 2015. 150 p. Disponível em: http://goo.gl/C7lXCw. Acesso em: 24 maio 2016.",
  },
  // ---- 3.1.1.3 Capítulo com "cap." em vez de "p." ----
  {
    section: "3.1.1.3",
    description: "Capítulo com numeração de capítulo (Neves)",
    items: [
      {
        id: "neves2005",
        type: "chapter",
        title: "Amebas de vida livre",
        author: [{ family: "Neves", given: "D. P." }],
        "container-author": [{ family: "Neves", given: "D. P." }],
        "container-title": "Parasitologia humana",
        edition: "11",
        publisher: "Atheneu",
        "publisher-place": "São Paulo",
        page: "cap. 16",
        issued: { "date-parts": [[2005]] },
      },
    ],
    expected:
      "NEVES, D. P. Amebas de vida livre. *In*: NEVES, D. P. **Parasitologia humana**. 11. ed. São Paulo: Atheneu, 2005. cap. 16.",
  },
  // ---- 3.1.1.4 Capítulo de e-book com CD-ROM ----
  // NOTA: "c1998" (copyright date) não é suportado nativamente pelo CSL.
  // Usamos "1998" como aproximação. O "c" requer pós-processamento futuro.
  {
    section: "3.1.1.4",
    description: "Capítulo de e-book em CD-ROM (Nascimento)",
    items: [
      {
        id: "nascimento1998",
        type: "chapter",
        title: "Morfologia dos artrópodes",
        author: [{ family: "Nascimento", given: "E." }],
        editor: [{ family: "Castro", given: "I." }],
        "container-title": "Enciclopédia multimídia dos seres vivos",
        publisher: "Planeta DeAgostini",
        "publisher-place": "[S. l.]",
        issued: { "date-parts": [[1998]] },
        archive: "CD-ROM 9",
      },
    ],
    expected:
      "NASCIMENTO, E. Morfologia dos artrópodes. *In*: CASTRO, I. (org.). **Enciclopédia multimídia dos seres vivos**. [S. l.]: Planeta DeAgostini, 1998. CD-ROM 9.",
  },
  // ---- 3.1.2.3 Parte de trabalho acadêmico ----
  // TODO: Formato "capítulo de tese" (3.1.2.3/3.1.2.4) exige renderização
  // híbrida chapter+thesis que o CSL não suporta nativamente. Requer
  // pós-processamento dedicado em fase futura.
  // ---- 3.2.1 Correspondência — bilhete [S.l.] ----
  {
    section: "3.2.1",
    description: "Bilhete sem local (Castro)",
    items: [
      {
        id: "castro2019bilhete",
        type: "personal_communication",
        title: "Correspondência",
        author: [{ family: "Castro", given: "Islânia" }],
        recipient: [{ family: "Sales", given: "Weslayne" }],
        issued: { "date-parts": [[2019]] },
        medium: "1 bilhete",
      },
    ],
    expected:
      "CASTRO, Islânia. [**Correspondência**]. Destinatário: Weslayne Sales. *[S. l.]*, 2019. 1 bilhete.",
  },
  // ---- 3.2.1 Correspondência — cartão com data completa ----
  {
    section: "3.2.1",
    description: "Cartão pessoal com data completa (Nascimento)",
    items: [
      {
        id: "nascimento2019cartao",
        type: "personal_communication",
        title: "Correspondência",
        author: [{ family: "Nascimento", given: "Isabela" }],
        recipient: [{ family: "Pereira", given: "Anderson" }],
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2019, 6, 17]] },
        medium: "1 cartão pessoal",
      },
    ],
    expected:
      "NASCIMENTO, Isabela. [**Correspondência**]. Destinatário: Anderson Pereira. Fortaleza, 17 jun. 2019. 1 cartão pessoal.",
  },
  // ---- 3.2.2 Correspondência eletrônica ----
  {
    section: "3.2.2",
    description: "Cartão eletrônico (Rosa Guimarães)",
    items: [
      {
        id: "rosa1958",
        type: "personal_communication",
        title: "Agradecimento",
        author: [{ family: "Rosa", given: "Guimarães" }],
        recipient: [{ family: "Brandt", given: "Alice" }],
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[1958, 7, 15]] },
        medium: "1 cartão",
        URL: "http://www.babelleiloes.com.br/peca.asp?ID=2636950",
        accessed: { "date-parts": [[2019, 6, 18]] },
      },
    ],
    expected:
      "ROSA, Guimarães. [**Agradecimento**]. Destinatário: Alice Brandt. Rio de Janeiro, 15 jul. 1958. 1 cartão. Disponível em: http://www.babelleiloes.com.br/peca.asp?ID=2636950. Acesso em: 18 jun. 2019.",
  },
  // ---- 3.3.8 Artigo eletrônico com URL ----
  {
    section: "3.3.8",
    description: "Artigo eletrônico com URL (Lavalle)",
    items: [
      {
        id: "lavalle2015",
        type: "article-journal",
        title:
          "Representación y participación en la crítica democrática",
        author: [
          { family: "Lavalle", given: "Adrián Gurza" },
          { family: "Ernesto Isunza", given: "Vera" },
        ],
        "container-title": "Desacatos",
        "publisher-place": "[Ciudad del México]",
        volume: "49",
        page: "10-27",
        issued: { "date-parts": [[2015]] },
        URL: "https://desacatos.ciesas.edu.mx/index.php/Desacatos/article/view/150",
        accessed: { "date-parts": [[2019, 7, 31]] },
      },
    ],
    expected:
      "LAVALLE, Adrián Gurza; ERNESTO ISUNZA, Vera. Representación y participación en la crítica democrática. **Desacatos**, [Ciudad del México], v. 49, p. 10-27, 2015. Disponível em: https://desacatos.ciesas.edu.mx/index.php/Desacatos/article/view/150. Acesso em: 31 jul. 2019.",
  },
  // ---- 3.3.8 Artigo eletrônico - entrada por título ----
  {
    section: "3.3.8",
    description: "Artigo eletrônico - entrada por título (Aconteceu)",
    items: [
      {
        id: "aconteceu2022",
        type: "article-journal",
        title: "Aconteceu há cem anos",
        "container-title": "Revista Marítima Brasileira",
        "publisher-place": "Rio de Janeiro",
        volume: "142",
        issue: "4/6",
        page: "247-250",
        issued: { "date-parts": [[2022, 1], [2022, 3]] },
        URL: "http://www.revistamaritima.com.br/revistas/o-brasil-no-artico",
        accessed: { "date-parts": [[2022, 8, 11]] },
      },
    ],
    expected:
      "ACONTECEU há cem anos. **Revista Marítima Brasileira**, Rio de Janeiro, v. 142, n. 4/6, p. 247-250, jan./mar. 2022. Disponível em: http://www.revistamaritima.com.br/revistas/o-brasil-no-artico. Acesso em: 11 ago. 2022.",
  },
  // ---- 3.3.10 Artigo de jornal eletrônico ----
  {
    section: "3.3.10",
    description: "Artigo de jornal eletrônico (Boechat)",
    items: [
      {
        id: "boechat2019",
        type: "article-newspaper",
        title:
          "Boechat: Anac suspende empresa dona do helicóptero",
        "container-title": "O Estado",
        "publisher-place": "Fortaleza",
        volume: "82",
        issue: "23.475",
        issued: { "date-parts": [[2019, 2, 14]] },
        section: "Caderno Nacional",
        page: "6",
        URL: "http://www.oestadoce.com.br/digital",
        accessed: { "date-parts": [[2019, 2, 14]] },
      },
    ],
    expected:
      "BOECHAT: Anac suspende empresa dona do helicóptero. **O Estado**, Fortaleza, ano 82, n. 23.475, 14 fev. 2019. Caderno Nacional, p. 6. Disponível em: http://www.oestadoce.com.br/digital. Acesso em: 14 fev. 2019.",
  },
  // ---- 3.4.1.2 Evento eletrônico ----
  {
    section: "3.4.1.2",
    description: "Anais de congresso eletrônico",
    items: [
      {
        id: "congresso_medicina2011",
        type: "book",
        title: "Anais [...]",
        author: [
          {
            literal:
              "CONGRESSO DE MEDICINA POPULAR VILAR DE PERDIZES, 25., 2011, Montalegre",
          },
        ],
        publisher: "[s. n.]",
        "publisher-place": "Montalegre",
        issued: { "date-parts": [[2011]] },
        URL: "http://www.cm-montalegre.pt/showPG.php?Id=320",
        accessed: { "date-parts": [[2016, 4, 8]] },
      },
    ],
    expected:
      "CONGRESSO DE MEDICINA POPULAR VILAR DE PERDIZES, 25., 2011, Montalegre. **Anais** [...]. Montalegre: [s. n.], 2011. Disponível em: http://www.cm-montalegre.pt/showPG.php?Id=320. Acesso em: 8 abr. 2016.",
  },
  // ---- 3.4.2.1 Outro trabalho em anais ----
  {
    section: "3.4.2.1",
    description: "Trabalho em anais (Dias)",
    items: [
      {
        id: "dias2004",
        type: "paper-conference",
        title:
          "Parque Nacional do Pico da Neblina: conservação, pesquisa e divulgação",
        author: [{ family: "Dias", given: "R. L." }],
        "event-title":
          "CONGRESSO BRASILEIRO DE UNIDADES DE CONSERVAÇÃO, 4., 2004, Curitiba",
        "container-title": "Anais [...]",
        publisher: "Fundação Boticário de Proteção à Natureza",
        "publisher-place": "Curitiba",
        page: "45-54",
        issued: { "date-parts": [[2004]] },
      },
    ],
    expected:
      "DIAS, R. L. Parque Nacional do Pico da Neblina: conservação, pesquisa e divulgação. *In*: CONGRESSO BRASILEIRO DE UNIDADES DE CONSERVAÇÃO, 4., 2004, Curitiba. **Anais** [...]. Curitiba: Fundação Boticário de Proteção à Natureza, 2004. p. 45-54.",
  },
  // ---- 3.4.2.2 Trabalho em anais eletrônico ----
  {
    section: "3.4.2.2",
    description: "Trabalho em anais eletrônico (Bugarim)",
    items: [
      {
        id: "bugarim2018",
        type: "paper-conference",
        title:
          "A compreensão dos assurinis sobre lazer referente aos jogos dos povos indígenas",
        author: [
          { family: "Bugarim", given: "Jonatha Pereira" },
          { family: "Barroso", given: "Simone Pompeu" },
        ],
        "event-title":
          "CONGRESSO NACIONAL DE EDUCAÇÃO FÍSICA, SAÚDE E CULTURAL CORPORAL, 9., 2018, Recife",
        "container-title": "Anais [...]",
        publisher: "Even3",
        "publisher-place": "Recife",
        page: "1-2",
        issued: { "date-parts": [[2018]] },
        URL: "http://abre.ai/aiG9",
        accessed: { "date-parts": [[2019, 6, 17]] },
      },
    ],
    expected:
      "BUGARIM, Jonatha Pereira; BARROSO, Simone Pompeu. A compreensão dos assurinis sobre lazer referente aos jogos dos povos indígenas. *In*: CONGRESSO NACIONAL DE EDUCAÇÃO FÍSICA, SAÚDE E CULTURAL CORPORAL, 9., 2018, Recife. **Anais** [...]. Recife: Even3, 2018. p. 1-2. Disponível em: http://abre.ai/aiG9. Acesso em: 17 jun. 2019.",
  },
  // ---- 3.4.2.3 Parte de evento em periódico ----
  {
    section: "3.4.2.3",
    description: "Parte de evento em periódico (Abreu)",
    items: [
      {
        id: "abreu2006",
        type: "article-journal",
        title: "O perigo dos livros",
        author: [{ family: "Abreu", given: "Márcia" }],
        "container-title":
          "Cadernos do Centro de Pesquisas Literárias da PUCRS",
        "publisher-place": "Porto Alegre",
        volume: "12",
        issue: "1",
        page: "41-51",
        issued: { "date-parts": [[2006]] },
        note: "Trabalho apresentado no Seminário Internacional de História da Literatura, 6., 2005, Porto Alegre.",
      },
    ],
    expected:
      "ABREU, Márcia. O perigo dos livros. **Cadernos do Centro de Pesquisas Literárias da PUCRS**, Porto Alegre, v. 12, n. 1, p. 41-51, 2006. Trabalho apresentado no Seminário Internacional de História da Literatura, 6., 2005, Porto Alegre.",
  },
  // ---- 3.6.1 Decreto ----
  // No bill com container-title: note = poder (Poder Executivo), section = texto da seção
  {
    section: "3.6.1",
    description: "Decreto em Diário Oficial (legislação em periódico)",
    items: [
      {
        id: "brasil_decreto2007",
        type: "bill",
        title:
          "Decreto n° 6.063, de 20 de março de 2007. Regulamenta no âmbito federal, dispositivos da Lei n° 11.284 de 2 de março de 2006, que dispõe sobre gestão de florestas públicas para a produção sustentável, e dá outras providências",
        author: [{ literal: "BRASIL" }],
        "container-title":
          "Diário Oficial [da] República Federativa do Brasil",
        note: "Poder Executivo",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2007, 3, 21]] },
        section: "Seção 1",
        page: "1",
      },
    ],
    expected:
      "BRASIL. Decreto n° 6.063, de 20 de março de 2007. Regulamenta no âmbito federal, dispositivos da Lei n° 11.284 de 2 de março de 2006, que dispõe sobre gestão de florestas públicas para a produção sustentável, e dá outras providências. **Diário Oficial [da] República Federativa do Brasil**, Poder Executivo, Brasília, DF, 21 mar. 2007. Seção 1, p. 1.",
  },
  // ---- 3.6.6 Ato administrativo eletrônico (ASBRAN) ----
  {
    section: "3.6.6",
    description: "Ato administrativo eletrônico (ASBRAN)",
    items: [
      {
        id: "asbran2019",
        type: "book",
        title:
          "Parecer técnico nº 01/2019 de 05 de fevereiro de 2019",
        author: [
          { literal: "ASSOCIAÇÃO BRASILEIRA DE NUTRIÇÃO" },
        ],
        publisher: "ASBRAN",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2019]] },
        URL: "http://www.asbran.org.br/arquivos/parecerTecnicoJI.pdf",
        accessed: { "date-parts": [[2019, 2, 13]] },
      },
    ],
    expected:
      "ASSOCIAÇÃO BRASILEIRA DE NUTRIÇÃO. **Parecer técnico nº 01/2019 de 05 de fevereiro de 2019**. Brasília, DF: ASBRAN, 2019. Disponível em: http://www.asbran.org.br/arquivos/parecerTecnicoJI.pdf. Acesso em: 13 fev. 2019.",
  },
  // ---- 3.8.1 Filme — vídeo YouTube (sem autor) ----
  {
    section: "3.8.1",
    description: "Vídeo YouTube sem autor (Tesouro Direto)",
    items: [
      {
        id: "tesouro2018",
        type: "motion_picture",
        title:
          "Tesouro direto: 5 passos práticos para investir todo mês!",
        issued: { "date-parts": [[2018]] },
        medium: "1 vídeo (11 min)",
        URL: "https://www.youtube.com/watch?v=71WEvV8s46k",
        accessed: { "date-parts": [[2019, 8, 22]] },
      },
    ],
    expected:
      "TESOURO direto: 5 passos práticos para investir todo mês! *[S. l.: s. n.]*, 2018. 1 vídeo (11 min). Disponível em: https://www.youtube.com/watch?v=71WEvV8s46k. Acesso em: 22 ago. 2019.",
  },
  // ---- 3.8.3 Documento sonoro — entrada por título ----
  {
    section: "3.8.3",
    description: "Documento sonoro - entrada por título (Cantando)",
    items: [
      {
        id: "cantando2007",
        type: "song",
        title: "Cantando coisas de cá",
        author: [{ family: "Angélica", given: "Joana" }],
        "publisher-place": "[Fortaleza]",
        publisher: "Radiadora Cultural",
        issued: { "date-parts": [[2007]] },
        medium: "1 CD",
      },
    ],
    expected:
      "CANTANDO coisas de cá. Intérprete: Joana Angélica. [Fortaleza]: Radiadora Cultural, 2007. 1 CD.",
  },
  // ---- 3.9.1 Partitura (Araújo) ----
  {
    section: "3.9.1",
    description: "Partitura com piano (Araújo)",
    items: [
      {
        id: "araujo1870",
        type: "musical_score",
        title: "A brilhante aurora: mazurka de salão",
        author: [{ family: "Araújo", given: "João Gomes de" }],
        medium: "Piano solo",
        publisher: "Narciso & Arthur Napoleão",
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[1870]] },
        genre: "1 partitura",
      },
    ],
    expected:
      "ARAÚJO, João Gomes de. **A brilhante aurora**: mazurka de salão. Piano solo. Rio de Janeiro: Narciso & Arthur Napoleão, 1870. 1 partitura.",
  },
  // ---- 3.9.2 Partitura eletrônica (Gonzaga) ----
  {
    section: "3.9.2",
    description: "Partitura eletrônica (Gonzaga)",
    items: [
      {
        id: "gonzaga1901",
        type: "musical_score",
        title: "A noiva",
        author: [{ family: "Gonzaga", given: "Chiquinha" }],
        medium: "Piano",
        publisher: "[s. n.]",
        "publisher-place": "[S. l.]",
        issued: { "date-parts": [[1901]] },
        genre: "1 partitura",
        URL: "http://www.chiquinhagonzaga.com/acervo/partituras/a-noite_piano.pdf",
        accessed: { "date-parts": [[2019, 7, 30]] },
      },
    ],
    expected:
      "GONZAGA, Chiquinha. **A noiva**. Piano. [S. l.]: [s. n.], 1901. 1 partitura. Disponível em: http://www.chiquinhagonzaga.com/acervo/partituras/a-noite_piano.pdf. Acesso em: 30 jul. 2019.",
  },
  // ---- 3.9.2 Partitura eletrônica (Campos) ----
  {
    section: "3.9.2",
    description: "Partitura eletrônica (Campos Roberta)",
    items: [
      {
        id: "campos_roberta2015",
        type: "musical_score",
        title: "De janeiro a janeiro",
        author: [{ family: "Campos", given: "Roberta" }],
        medium: "Violão",
        publisher: "Super Partituras",
        "publisher-place": "[S. l.]",
        issued: { "date-parts": [[2015]] },
        genre: "1 partitura",
        URL: "https://www.superpartituras.com.br/nando-reis/de-janeiro-a-janeiro-v2",
        accessed: { "date-parts": [[2019, 7, 30]] },
      },
    ],
    expected:
      "CAMPOS, Roberta. **De janeiro a janeiro**. Violão. [S. l.]: Super Partituras, 2015. 1 partitura. Disponível em: https://www.superpartituras.com.br/nando-reis/de-janeiro-a-janeiro-v2. Acesso em: 30 jul. 2019.",
  },
  // ---- 3.10.1 Fotografia com colchetes ----
  {
    section: "3.10.1",
    description: "Fotografia com título atribuído (Nascimento)",
    items: [
      {
        id: "nascimento2011foto",
        type: "graphic",
        title: "[Biblioteca de Ciências e Tecnologia]",
        author: [{ family: "Nascimento", given: "I." }],
        issued: { "date-parts": [[2011]] },
        genre: "1 fotografia",
        medium: "color.",
        dimensions: "17,5 x 13 cm",
      },
    ],
    expected:
      "NASCIMENTO, I. [**Biblioteca de Ciências e Tecnologia**]. 2011. 1 fotografia, color., 17,5 x 13 cm.",
  },
  // ---- 3.10.1 Original de arte ----
  {
    section: "3.10.1",
    description: "Original de arte (Mateus)",
    items: [
      {
        id: "mateus1997",
        type: "graphic",
        title: "[Sem título]",
        author: [{ family: "Mateus" }],
        issued: { "date-parts": [[1997]] },
        genre: "1 original de arte",
        medium: "óleo sobre tela",
      },
    ],
    expected:
      "MATEUS. [**Sem título**]. 1997. 1 original de arte, óleo sobre tela.",
  },
  // ---- 3.11.2 Documento cartográfico eletrônico (atlas) ----
  {
    section: "3.11.2",
    description: "Atlas eletrônico (COGERH)",
    items: [
      {
        id: "ceara_cogerh2019",
        type: "map",
        title: "Atlas dos recursos hídricos do Ceará",
        author: [
          {
            literal:
              "CEARÁ. Secretaria de Recursos Hídricos. Companhia de Gestão dos Recursos Hídricos",
          },
        ],
        publisher: "COGERH",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2019]] },
        genre: "1 atlas",
        URL: "http://atlas.cogerh.com.br/",
        accessed: { "date-parts": [[2011, 4, 26]] },
      },
    ],
    expected:
      "CEARÁ. Secretaria de Recursos Hídricos. Companhia de Gestão dos Recursos Hídricos. **Atlas dos recursos hídricos do Ceará**. Fortaleza: COGERH, 2019. 1 atlas. Disponível em: http://atlas.cogerh.com.br/. Acesso em: 26 abr. 2011.",
  },
  // ---- 3.11.2 Mapa eletrônico com escala (IBGE) ----
  {
    section: "3.11.2",
    description: "Mapa eletrônico com escala (IBGE)",
    items: [
      {
        id: "ibge2010",
        type: "map",
        title: "Desigualdade econômica: infância",
        author: [
          {
            literal:
              "IBGE. Diretoria de Geodesia e Cartografia",
          },
        ],
        publisher: "IBGE",
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[2010]] },
        genre: "1 mapa",
        scale: "1:30.000.000",
        URL: "https://atlasescolar.ibge.gov.br/images/atlas/mapas_brasil/brasil_infancia.pdf",
        accessed: { "date-parts": [[2019, 5, 25]] },
      },
    ],
    expected:
      "IBGE. Diretoria de Geodesia e Cartografia. **Desigualdade econômica**: infância. Rio de Janeiro: IBGE, 2010. 1 mapa. Escala 1:30.000.000. Disponível em: https://atlasescolar.ibge.gov.br/images/atlas/mapas_brasil/brasil_infancia.pdf. Acesso em: 25 maio 2019.",
  },
  // ---- 3.13.1 Base de dados (EBSCO) ----
  {
    section: "3.13.1",
    description: "Base de dados (EBSCO)",
    items: [
      {
        id: "ebsco2019",
        type: "dataset",
        title: "Medline complete",
        author: [{ literal: "EBSCO" }],
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[2019]] },
        URL: "http://web-b-ebscohost.ez11.periodicos.capes.gov.br/ehost/search/basic?vid=0&amp;sid=61b3db52-f351-4dc5-b8d5-d396be905156%40sessionmgr103",
        accessed: { "date-parts": [[2019, 7, 29]] },
      },
    ],
    expected:
      "EBSCO. **Medline complete**. Rio de Janeiro, 2019. Disponível em: http://web-b-ebscohost.ez11.periodicos.capes.gov.br/ehost/search/basic?vid=0&sid=61b3db52-f351-4dc5-b8d5-d396be905156%40sessionmgr103. Acesso em: 29 jul. 2019.",
  },
  // ---- 3.13.3 Software em CD-ROM (Microsoft) ----
  {
    section: "3.13.3",
    description: "Software em CD-ROM (Microsoft)",
    items: [
      {
        id: "microsoft1995",
        type: "software",
        title: "Microsoft project for Windows 95",
        author: [{ literal: "MICROSOFT CORPORATION" }],
        version: "4.1",
        "publisher-place": "Washington, DC",
        issued: { "date-parts": [[1995]] },
        medium: "1 CD",
      },
    ],
    expected:
      "MICROSOFT CORPORATION. **Microsoft project for Windows 95**. Versão 4.1. Washington, DC, 1995. 1 CD.",
  },
  // Nota: O Avast usa type "book" com fixDuplicatePublisher, já testado acima.
  // ---- 3.13.5 Mensagem eletrônica (ABNT) ----
  {
    section: "3.13.5",
    description: "Mensagem eletrônica (ABNT)",
    items: [
      {
        id: "abnt2019msg",
        type: "personal_communication",
        title:
          "Convite 2ª reunião/2019 da Comissão de Estudo de Identificação e Descrição – CE-14:000.003",
        author: [
          {
            literal:
              "ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS",
          },
        ],
        recipient: [{ family: "Moura", given: "Eliene" }],
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2019, 5, 27]] },
        medium: "1 mensagem eletrônica",
      },
    ],
    expected:
      "ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. [**Convite 2ª reunião/2019 da Comissão de Estudo de Identificação e Descrição – CE-14:000.003**]. Destinatário: Eliene Moura. São Paulo, 27 maio 2019. 1 mensagem eletrônica.",
  },
  // ---- 3.13.5 Mensagem WhatsApp ----
  {
    section: "3.13.5",
    description: "Mensagem WhatsApp (Nascimento)",
    items: [
      {
        id: "nascimento2020whatsapp",
        type: "personal_communication",
        title: "Livros eletrônicos",
        author: [{ family: "Nascimento", given: "Isabela" }],
        recipient: [{ family: "Ribeiro", given: "Nonato" }],
        "publisher-place": "[Fortaleza]",
        issued: { "date-parts": [[2020, 3, 27]] },
        medium: "1 mensagem Whatsapp",
      },
    ],
    expected:
      "NASCIMENTO, Isabela. [**Livros eletrônicos**]. Destinatário: Nonato Ribeiro. [Fortaleza], 27 mar. 2020. 1 mensagem Whatsapp.",
  },
  // ---- 3.14.5 Bula de remédio (Dipirona) ----
  {
    section: "3.14.5",
    description: "Bula de remédio com subtítulo (Dipirona)",
    items: [
      {
        id: "dipirona2013",
        type: "book",
        title: "Dipirona monoidratada: frasco gotejador",
        note: "Responsável técnico A. F. Sandes",
        publisher: "Farmace",
        "publisher-place": "Barbalha",
        issued: { "date-parts": [[2013]] },
        medium: "1 bula de remédio",
      },
    ],
    expected:
      "DIPIRONA monoidratada: frasco gotejador. Responsável técnico A. F. Sandes. Barbalha: Farmace, 2013. 1 bula de remédio.",
  },
  // ---- 3.14.5 Bula de remédio (Xeljanz) ----
  {
    section: "3.14.5",
    description: "Bula de remédio (Xeljanz)",
    items: [
      {
        id: "xeljanz2017",
        type: "book",
        title: "Xeljanz",
        note: "Responsável técnico Carolina C. S. Rizoli",
        publisher: "Pfizer",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2017]] },
        medium: "1 bula de remédio",
      },
    ],
    expected:
      "XELJANZ. Responsável técnico Carolina C. S. Rizoli. São Paulo: Pfizer, 2017. 1 bula de remédio.",
  },
  // ---- 3.14.6 Bula de remédio eletrônica (Advil) ----
  {
    section: "3.14.6",
    description: "Bula de remédio eletrônica (Advil)",
    items: [
      {
        id: "advil2013",
        type: "book",
        title: "Advil: ibuprofeno",
        note: "Responsável técnico Edina S. M. Nakaruma",
        publisher: "Wyeth Indústria Farmacêutica",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2013]] },
        medium: "1 bula de remédio",
        URL: "https://bula.medicinanet.com.br/bula/6551/advil_ibuprofeno.htm",
        accessed: { "date-parts": [[2019, 2, 15]] },
      },
    ],
    expected:
      "ADVIL: ibuprofeno. Responsável técnico Edina S. M. Nakaruma. São Paulo: Wyeth Indústria Farmacêutica, 2013. 1 bula de remédio. Disponível em: https://bula.medicinanet.com.br/bula/6551/advil_ibuprofeno.htm. Acesso em: 15 fev. 2019.",
  },
  // ---- 3.14.7 Psicografia (Emanuel) ----
  {
    section: "3.14.7",
    description: "Psicografia (Emanuel)",
    items: [
      {
        id: "emanuel2013",
        type: "book",
        title: "Cinquenta anos depois.",
        author: [{ literal: "EMANUEL (Espírito)" }],
        note: "Psicografado por Francisco Cândido Xavier",
        publisher: "FEB",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2013]] },
      },
    ],
    expected:
      "EMANUEL (Espírito). **Cinquenta anos depois.** Psicografado por Francisco Cândido Xavier. Brasília, DF: FEB, 2013.",
  },
  // ---- 3.14.10 Bíblia eletrônica ----
  {
    section: "3.14.10",
    description: "Bíblia em meio eletrônico",
    items: [
      {
        id: "biblia_online2008",
        type: "book",
        title: "Bíblia online",
        author: [{ literal: "BÍBLIA. Português" }],
        publisher: "[s. n.]",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2008]] },
        URL: "http://www.bibliaonline.net/?lang=pt-BR",
        accessed: { "date-parts": [[2019, 2, 14]] },
      },
    ],
    expected:
      "BÍBLIA. Português. **Bíblia online**. São Paulo: [s. n.], 2008. Disponível em: http://www.bibliaonline.net/?lang=pt-BR. Acesso em: 14 fev. 2019.",
  },
  // ---- 3.14.12 Parte de bíblia eletrônica ----
  {
    section: "3.14.12",
    description: "Parte de bíblia eletrônica (NT Coríntios)",
    items: [
      {
        id: "biblia_corintios",
        type: "chapter",
        title: "N. T. Coríntios",
        author: [{ literal: "BÍBLIA" }],
        "container-title": "Bíblia online",
        "container-author": [{ literal: "BÍBLIA. Português" }],
        publisher: "[s. n.]",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[2008]] },
        URL: "https://www.bibliaonline.com.br/acf/1co/13",
        accessed: { "date-parts": [[2019, 7, 29]] },
      },
    ],
    expected:
      "BÍBLIA. N. T. Coríntios. *In*: BÍBLIA. Português. **Bíblia online**. São Paulo: [s. n.], 2008. Disponível em: https://www.bibliaonline.com.br/acf/1co/13. Acesso em: 29 jul. 2019.",
  },
  // ---- 3.14.1 Entrevista em capítulo ----
  {
    section: "3.14.1",
    description: "Entrevista em capítulo de livro (Barreira)",
    items: [
      {
        id: "barreira2011",
        type: "chapter",
        title: "César Barreira",
        author: [{ family: "Barreira", given: "César" }],
        medium: "Entrevista concedida a José Luiz Ratton",
        editor: [
          { family: "Ratton", given: "José Luiz" },
          { family: "Lima", given: "Renato Sérgio de" },
        ],
        "container-title":
          "As ciências sociais e os pioneiros nos estudos sobre crime, violência e direitos humanos no Brasil",
        publisher: "ANPOCS",
        "publisher-place": "São Paulo",
        page: "192-207",
        issued: { "date-parts": [[2011]] },
      },
    ],
    expected:
      "BARREIRA, César. César Barreira. Entrevista concedida a José Luiz Ratton. *In*: RATTON, José Luiz; LIMA, Renato Sérgio de (org.). **As ciências sociais e os pioneiros nos estudos sobre crime, violência e direitos humanos no Brasil**. São Paulo: ANPOCS, 2011. p. 192-207.",
  },
  // ---- 3.14.3 Recensão ----
  {
    section: "3.14.3",
    description: "Recensão de livro (Marques)",
    items: [
      {
        id: "marques2006",
        type: "article-journal",
        title: "Recensão de livro",
        author: [{ family: "Marques", given: "Ramiro" }],
        "container-title": "Interações",
        "publisher-place": "Porto",
        issue: "3",
        page: "188-189",
        issued: { "date-parts": [[2006]] },
        note: "Recensão da obra de: JARDIM, J.; PEREIRA, A. Competências pessoais e sociais: guia prático para a mudança positiva. Porto: Edições Asa, 2006.",
      },
    ],
    expected:
      "MARQUES, Ramiro. Recensão de livro. **Interações**, Porto, n. 3, p. 188-189, 2006. Recensão da obra de: JARDIM, J.; PEREIRA, A. Competências pessoais e sociais: guia prático para a mudança positiva. Porto: Edições Asa, 2006.",
  },
  // ---- 3.6.5 Portaria (ato administrativo com subdivisão) ----
  {
    section: "3.6.5",
    description: "Portaria (PROGEP)",
    items: [
      {
        id: "ufc_portaria2015",
        type: "book",
        title:
          "Portaria nº 5046, de 07 de dezembro de 2015",
        author: [
          {
            literal:
              "UNIVERSIDADE FEDERAL DO CEARÁ. Pró-Reitoria de Gestão de Pessoas",
          },
        ],
        publisher: "UFC",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2015]] },
      },
    ],
    expected:
      "UNIVERSIDADE FEDERAL DO CEARÁ. Pró-Reitoria de Gestão de Pessoas. **Portaria nº 5046, de 07 de dezembro de 2015**. Fortaleza: UFC, 2015.",
  },
  // ---- 3.10.2 Documento iconográfico eletrônico ----
  // NOTA: O guia UFC imprime "MOREIRA. Jair Célio." com ponto após sobrenome,
  // mas o padrão ABNT é vírgula (MOREIRA, Jair Célio). Provável erro de formatação
  // no guia. Mantemos o formato ABNT padrão (vírgula).
  {
    section: "3.10.2",
    description: "Fotografia eletrônica no Facebook (Moreira)",
    items: [
      {
        id: "moreira2016",
        type: "graphic",
        title: "Caló montada em seu burrinho",
        author: [{ family: "Moreira", given: "Jair Célio" }],
        issued: { "date-parts": [[2016]] },
        genre: "1 fotografia",
        "container-title": "Facebook: eliene.moura.58",
        URL: "https://www.facebook.com/photo.php?fbid=1220904821321837&amp;set=a.1220904764655176&amp;type=3&amp;theater",
        accessed: { "date-parts": [[2019, 7, 28]] },
      },
    ],
    expected:
      "MOREIRA, Jair Célio. **Caló montada em seu burrinho**. 2016. 1 fotografia. Facebook: eliene.moura.58. Disponível em: https://www.facebook.com/photo.php?fbid=1220904821321837&set=a.1220904764655176&type=3&theater. Acesso em: 28 jul. 2019.",
  },
  // ---- 3.5.1 Patente em meio eletrônico (Araújo) ----
  {
    section: "3.5.1e",
    description: "Patente eletrônica (Araújo - adubo de caranguejo)",
    items: [
      {
        id: "araujo_patent2007",
        type: "patent",
        title: "Processo para o preparo do adubo de caranguejo",
        author: [
          { family: "Araújo", given: "Francisco José Freire de" },
        ],
        publisher: "Universidade Federal do Ceará",
        "publisher-place": "BR",
        number: "PI0704286-8 A2",
        submitted: { "date-parts": [[2007, 11, 9]] },
        issued: { "date-parts": [[2009, 7, 7]] },
        URL: "https://busca.inpi.gov.br/pePI/servlet/PatenteServletController?Action=detail&CodPedido=752455&SearchParameter=PI%200704286-8%20%20%20%20%20%20&Resumo=&Titulo=",
        accessed: { "date-parts": [[2023, 11, 27]] },
      },
    ],
    expected:
      "ARAÚJO, Francisco José Freire de. **Processo para o preparo do adubo de caranguejo**. Depositante: Universidade Federal do Ceará. BR n. PI0704286-8 A2. Depósito: 9 nov. 2007. Concessão: 7 jul. 2009. Disponível em: https://busca.inpi.gov.br/pePI/servlet/PatenteServletController?Action=detail&CodPedido=752455&SearchParameter=PI%200704286-8%20%20%20%20%20%20&Resumo=&Titulo=. Acesso em: 27 nov. 2023.",
  },
  // ---- 3.5.1 Patente eletrônica (Schwindt) ----
  {
    section: "3.5.1e",
    description: "Patente eletrônica com procurador (Schwindt)",
    items: [
      {
        id: "schwindt_patent2018",
        type: "patent",
        title:
          "Método e sistema para determinar degradação em desempenho de um dispositivo eletrônico conectado a uma rede de comunicação para um veículo aéreo.",
        author: [
          { family: "Schwindt", given: "Stefan Alexander" },
          { family: "Foye", given: "Barry" },
        ],
        publisher: "GE Aviation Systems Limited (GB)",
        "publisher-place": "BR",
        number: "10 2018 013727 1 A2",
        note: "Procurador: Jacques Labruine",
        submitted: { "date-parts": [[2018, 7, 4]] },
        issued: { "date-parts": [[2019, 1, 22]] },
        URL: "https://busca.inpi.gov.br/pePI/servlet/PatenteServletController?Action=detail&CodPedido=1480947&SearchParameter=BR%2010%202018%200013727%201%20%20%20%20%20%20&Resumo=&Titulo=",
        accessed: { "date-parts": [[2023, 11, 27]] },
      },
    ],
    expected:
      "SCHWINDT, Stefan Alexander; FOYE, Barry. **Método e sistema para determinar degradação em desempenho de um dispositivo eletrônico conectado a uma rede de comunicação para um veículo aéreo.** Depositante: GE Aviation Systems Limited (GB). Procurador: Jacques Labruine. BR n. 10 2018 013727 1 A2. Depósito: 4 jul. 2018. Concessão: 22 jan. 2019. Disponível em: https://busca.inpi.gov.br/pePI/servlet/PatenteServletController?Action=detail&CodPedido=1480947&SearchParameter=BR%2010%202018%200013727%201%20%20%20%20%20%20&Resumo=&Titulo=. Acesso em: 27 nov. 2023.",
  },
  // ---- 3.14.2 Entrevista em meio eletrônico ----
  {
    section: "3.14.2",
    description: "Entrevista eletrônica em periódico (Hoornaert)",
    items: [
      {
        id: "hoornaert2006",
        type: "article-journal",
        title: "Entrevista com Eduardo Hoornaert",
        author: [{ family: "Hoornaert", given: "Eduardo" }],
        "container-title": "Trajetos: revista de história da UFC",
        "publisher-place": "Fortaleza",
        volume: "4",
        issue: "8",
        page: "247-278",
        issued: { "date-parts": [[2006]] },
        publisher: "[Entrevista concedida a] Cristina Rodrigues Holanda",
        URL: "http://www.repositorio.ufc.br/handle/riufc/20009",
        accessed: { "date-parts": [[2019, 8, 19]] },
      },
    ],
    expected:
      "HOORNAERT, Eduardo. Entrevista com Eduardo Hoornaert. [Entrevista concedida a] Cristina Rodrigues Holanda. **Trajetos**: revista de história da UFC, Fortaleza, v. 4, n. 8, p. 247-278, 2006. Disponível em: http://www.repositorio.ufc.br/handle/riufc/20009. Acesso em: 19 ago. 2019.",
  },
  // ---- 3.14.4 Resenha em meio eletrônico (Lima) ----
  {
    section: "3.14.4",
    description: "Resenha eletrônica em blog (Lima)",
    items: [
      {
        id: "lima_resenha2014",
        type: "chapter",
        title:
          "Introdução à teoria geral da biblioteconomia: resenha",
        author: [{ family: "Lima", given: "Izabel" }],
        "container-author": [{ family: "Lima", given: "Izabel" }],
        "container-title": "Blog estante da bibliotecária",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2014]] },
        note: "Resenha da obra de: VIEIRA, Ronaldo. Introdução à teoria geral da biblioteconomia. Rio de Janeiro: Interciência, 2014.",
        URL: "https://estantedabibliotecaria.wordpress.com/2014/11/20/introducao-a-teoria-geral-da-biblioteconomia-resenha/",
        accessed: { "date-parts": [[2016, 4, 28]] },
      },
    ],
    expected:
      "LIMA, Izabel. Introdução à teoria geral da biblioteconomia: resenha. *In*: LIMA, Izabel. **Blog estante da bibliotecária**, Fortaleza, 2014. Resenha da obra de: VIEIRA, Ronaldo. Introdução à teoria geral da biblioteconomia. Rio de Janeiro: Interciência, 2014. Disponível em: https://estantedabibliotecaria.wordpress.com/2014/11/20/introducao-a-teoria-geral-da-biblioteconomia-resenha/. Acesso em: 28 abr. 2016.",
  },
  // ---- 3.14.4 Resenha eletrônica em jornal (Martirani) ----
  {
    section: "3.14.4",
    description: "Resenha eletrônica em jornal (Martirani)",
    items: [
      {
        id: "martirani2011",
        type: "article-newspaper",
        title: "O livro e o pão",
        author: [{ family: "Martirani", given: "M. C." }],
        "container-title": "Gazeta do Povo",
        "publisher-place": "Curitiba",
        issued: { "date-parts": [[2011, 10, 25]] },
        note: "Resenha da obra de: SANT'ANNA, A. R. de. Ler o mundo. São Paulo: Global, 2011.",
        URL: "http://rascunho.gazetadopovo.com.br/o-livro-e-o-pao",
        accessed: { "date-parts": [[2011, 11, 18]] },
      },
    ],
    expected:
      "MARTIRANI, M. C. O livro e o pão. **Gazeta do Povo**, Curitiba, 25 out. 2011. Resenha da obra de: SANT'ANNA, A. R. de. Ler o mundo. São Paulo: Global, 2011. Disponível em: http://rascunho.gazetadopovo.com.br/o-livro-e-o-pao. Acesso em: 18 nov. 2011.",
  },
  // ---- 3.14.8 Psicografia em meio eletrônico (Campos) ----
  {
    section: "3.14.8",
    description: "Psicografia eletrônica (Campos - Crônicas)",
    items: [
      {
        id: "campos_cronicas1963",
        type: "book",
        title: "Crônicas de além-túmulo",
        author: [{ literal: "CAMPOS, Humberto de (Espírito)" }],
        note: "Psicografado por Francisco Cândido Xavier",
        publisher: "FEB",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[1963]] },
        URL: "http://www.oconsolador.com.br/linkfixo/bibliotecavirtual/chicoxavier/cronicasdealemturmulo.pdf",
        accessed: { "date-parts": [[2019, 2, 21]] },
      },
    ],
    expected:
      "CAMPOS, Humberto de (Espírito). **Crônicas de além-túmulo**. Psicografado por Francisco Cândido Xavier. São Paulo: FEB, 1963. Disponível em: http://www.oconsolador.com.br/linkfixo/bibliotecavirtual/chicoxavier/cronicasdealemturmulo.pdf. Acesso em: 21 fev. 2019.",
  },
  // ---- 3.14.8 Psicografia eletrônica (Emanuel) ----
  {
    section: "3.14.8",
    description: "Psicografia eletrônica (Emanuel - Há 2000 anos)",
    items: [
      {
        id: "emanuel_2000anos1996",
        type: "book",
        title:
          "Há 2000 anos...: episódios da história do cristianismo no século I",
        author: [{ literal: "EMANUEL (Espírito)" }],
        note: "Psicografado por Francisco Cândido Xavier",
        edition: "29",
        publisher: "FEB",
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[1996]] },
        URL: "http://www.oconsolador.com.br/linkfixo/bibliotecavirtual/chicoxavier/ha2000anos.pdf",
        accessed: { "date-parts": [[2019, 2, 21]] },
      },
    ],
    expected:
      "EMANUEL (Espírito). **Há 2000 anos...**: episódios da história do cristianismo no século I. Psicografado por Francisco Cândido Xavier. 29. ed. Rio de Janeiro: FEB, 1996. Disponível em: http://www.oconsolador.com.br/linkfixo/bibliotecavirtual/chicoxavier/ha2000anos.pdf. Acesso em: 21 fev. 2019.",
  },
  // ---- 3.8.2 Parte de filme ----
  {
    section: "3.8.2",
    description: "Episódio de série (parte de filme)",
    items: [
      {
        id: "got_ep1_2012",
        type: "motion_picture",
        title: "O inverno está para chegar",
        genre: "Diretor",
        director: [{ family: "Van Patten", given: "Tim" }],
        "container-title": "Game of thrones",
        note: "Produção: David Benoff; D. B. Weiss",
        publisher: "HBO",
        "publisher-place": "New York",
        issued: { "date-parts": [[2012]] },
        medium: "Disco 1, episódio 1",
      },
    ],
    expected:
      "O INVERNO está para chegar. Diretor: Tim Van Patten. *In*: GAME of thrones. Produção: David Benoff; D. B. Weiss. New York: HBO, 2012. Disco 1, episódio 1.",
  },
  // ---- 3.8.4 Parte de documento sonoro (Flor da paisagem) ----
  {
    section: "3.8.4",
    description: "Faixa de CD (Flor da paisagem)",
    items: [
      {
        id: "flor_paisagem2007",
        type: "song",
        title: "Flor da paisagem",
        author: [{ family: "Angélica", given: "Joana" }],
        composer: [
          { family: "Recife", given: "Robertinho de" },
          { family: "Nilo", given: "Fausto" },
        ],
        "container-title": "Cantando coisas de cá",
        note: "Intérprete: Joana Angélica",
        publisher: "Radiadora Cultural",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2007]] },
        medium: "1 CD, faixa 8",
      },
    ],
    expected:
      "FLOR da paisagem. Intérprete: Joana Angélica. Compositores: Robertinho de Recife e Fausto Nilo. *In*: CANTANDO coisas de cá. Intérprete: Joana Angélica. Fortaleza: Radiadora Cultural, 2007. 1 CD, faixa 8.",
  },
  // ---- 3.8.4 Parte de documento sonoro (Penas do tiê) ----
  {
    section: "3.8.4",
    description: "Faixa de CD com et al (Penas do tiê)",
    items: [
      {
        id: "penas_tie1998",
        type: "song",
        title: "Penas do tiê",
        author: [{ family: "Caymmi", given: "Nana" }],
        composer: [{ family: "Tavares", given: "Hekel" }],
        "container-title": "Amigos e canções",
        note: "Intérpretes: Raimundo Fagner *et al*",
        publisher: "BMG",
        "publisher-place": "[S. l.]",
        issued: { "date-parts": [[1998]] },
        medium: "Disco 1, faixa 9",
      },
    ],
    expected:
      "PENAS do tiê. Intérprete: Nana Caymmi. Compositor: Hekel Tavares. *In*: AMIGOS e canções. Intérpretes: Raimundo Fagner *et al*. [S. l.]: BMG, 1998. Disco 1, faixa 9.",
  },
  // ---- 3.8.4 Parte de documento sonoro (A força que nunca seca) ----
  {
    section: "3.8.4",
    description: "Faixa de CD - mesmo título (A força que nunca seca)",
    items: [
      {
        id: "forca_seca1999",
        type: "song",
        title: "A força que nunca seca",
        author: [{ family: "Bethânia", given: "Maria" }],
        composer: [
          { family: "César", given: "Chico" },
          { family: "Mata", given: "Vanessa da" },
        ],
        "container-title": "A força que nunca seca",
        publisher: "Sony",
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[1999]] },
        medium: "1 CD, faixa 2",
      },
    ],
    expected:
      "A FORÇA que nunca seca. Intérprete: Maria Bethânia. Compositores: Chico César e Vanessa da Mata. *In*: A FORÇA que nunca seca. Rio de Janeiro: Sony, 1999. 1 CD, faixa 2.",
  },
  // ---- 3.4.2.4 Parte de evento em periódico eletrônico ----
  {
    section: "3.4.2.4",
    description: "Parte de evento em periódico eletrônico (Calazans)",
    items: [
      {
        id: "calazans2018",
        type: "article-journal",
        title:
          "Análise de intervenções farmacêuticas em um hospital oncológico",
        author: [
          { family: "Calazans", given: "Jonas de Almeida" },
          { family: "Elias", given: "Sabrina Calil" },
        ],
        "container-title": "Revista Brasileira de Cancerologia",
        "publisher-place": "Rio de Janeiro",
        volume: "64",
        issue: "2",
        page: "19",
        issued: { "date-parts": [[2018]] },
        note: "Trabalho apresentado no Congresso de Farmácia Hospitalar em Oncologia do INCA, 6., 2018, Rio de Janeiro.",
        URL: "https://rbc.inca.gov.br/revista/index.php/revista/article/view/330/221",
        accessed: { "date-parts": [[2019, 7, 25]] },
      },
    ],
    expected:
      "CALAZANS, Jonas de Almeida; ELIAS, Sabrina Calil. Análise de intervenções farmacêuticas em um hospital oncológico. **Revista Brasileira de Cancerologia**, Rio de Janeiro, v. 64, n. 2, p. 19, 2018. Trabalho apresentado no Congresso de Farmácia Hospitalar em Oncologia do INCA, 6., 2018, Rio de Janeiro. Disponível em: https://rbc.inca.gov.br/revista/index.php/revista/article/view/330/221. Acesso em: 25 jul. 2019.",
  },
  // ---- 3.4.2.5 Trabalho apresentado em evento, mas não publicado ----
  {
    section: "3.4.2.5",
    description: "Trabalho não publicado em evento (Saraiva)",
    items: [
      {
        id: "saraiva2017",
        type: "thesis",
        title:
          "Organização do acervo da Biblioteca Central do Campus do Pici",
        author: [
          { family: "Saraiva", given: "Maria Vitória Ferreira" },
          { family: "Silva", given: "Maria de Fátima" },
          { family: "Nascimento", given: "Regiane Lima" },
        ],
        issued: { "date-parts": [[2017]] },
        genre: "Trabalho apresentado no Encontro de Iniciação Acadêmica da Universidade Federal do Ceará, 2., 2017, Fortaleza",
      },
    ],
    expected:
      "SARAIVA, Maria Vitória Ferreira; SILVA, Maria de Fátima; NASCIMENTO, Regiane Lima. **Organização do acervo da Biblioteca Central do Campus do Pici**. 2017. Trabalho apresentado no Encontro de Iniciação Acadêmica da Universidade Federal do Ceará, 2., 2017, Fortaleza.",
  },
  // ---- 3.6.2 Legislação em meio eletrônico ----
  // Fixture 1: Lei municipal publicada em Diário Oficial (bill com container-title)
  //
  // Necessidade: testar bill em DJe municipal (com issue/page, sem section)
  // Mapeamento: type=bill, number=designação da lei, title=ementa,
  //   container-title=nome do diário, issue=número do diário, page=página
  // Decisão: sem section, o CSL usa a branch "else" (page antes de date)
  {
    section: "3.6.2",
    description: "Lei municipal em Diário Oficial (Fortaleza)",
    items: [
      {
        id: "fortaleza_lei10851_2019",
        type: "bill",
        author: [{ literal: "FORTALEZA" }],
        number: "Lei nº 10.851, de 02 de janeiro de 2019",
        title:
          "Institui a Política Pública e Programa de Conscientização do Uso Responsável de Água Potável no município de Fortaleza e dá outras providências",
        "container-title": "Diário Oficial do Município",
        "publisher-place": "Fortaleza",
        issue: "16.436",
        page: "1",
        issued: { "date-parts": [[2019, 2, 1]] },
        URL: "http://apps.fortaleza.ce.gov.br/diariooficial/download-diario.php?objectId=workspace://SpacesStore/d454a4f9-8f27-4483-816d-6bbaee1a7266;1.0&numero=16436",
        accessed: { "date-parts": [[2019, 1, 25]] },
      },
    ],
    expected:
      "FORTALEZA. Lei nº 10.851, de 02 de janeiro de 2019. Institui a Política Pública e Programa de Conscientização do Uso Responsável de Água Potável no município de Fortaleza e dá outras providências. **Diário Oficial do Município**, Fortaleza, n. 16.436, p. 1, 1 fev. 2019. Disponível em: http://apps.fortaleza.ce.gov.br/diariooficial/download-diario.php?objectId=workspace://SpacesStore/d454a4f9-8f27-4483-816d-6bbaee1a7266;1.0&numero=16436. Acesso em: 25 jan. 2019.",
  },
  // Fixture 2: Lei federal publicada como livro (sem Diário Oficial)
  //
  // Necessidade: testar legislação eletrônica sem periódico — título em negrito
  // Mapeamento: type=book, title=designação da lei (bold), note=ementa
  // Decisão: book porque o título (lei) precisa de negrito; bill sem
  //   container-title não aplica bold ao título (macro title line 315-316)
  {
    section: "3.6.2",
    description: "Lei federal eletrônica como livro (Brasil Lei 12.305)",
    items: [
      {
        id: "brasil_lei12305_2010",
        type: "book",
        author: [{ literal: "BRASIL" }],
        title: "Lei nº 12.305, de 2 de agosto de 2010",
        note: "Institui a Política Nacional de Resíduos Sólidos; altera a Lei nº 9.605, de 12 de fevereiro de 1998; e dá outras providências",
        publisher: "Casa Civil",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2010]] },
        URL: "http://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12305.htm",
        accessed: { "date-parts": [[2019, 2, 13]] },
      },
    ],
    expected:
      "BRASIL. **Lei nº 12.305, de 2 de agosto de 2010**. Institui a Política Nacional de Resíduos Sólidos; altera a Lei nº 9.605, de 12 de fevereiro de 1998; e dá outras providências. Brasília, DF: Casa Civil, 2010. Disponível em: http://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12305.htm. Acesso em: 13 fev. 2019.",
  },
  // ---- 3.6.6 Ato administrativo em DJe (Portaria em periódico) ----
  //
  // Necessidade: testar portaria publicada em Diário da Justiça (bill com container-title)
  // Mapeamento: type=bill, container-title inclui "seção 1" para que
  //   fixSubtitleBold separe: **Diário da Justiça**: seção 1
  // Decisão: "seção 1" no container-title (não no campo section do CSL)
  //   porque o CSL renderiza section como elemento separado após a data
  {
    section: "3.6.6",
    description: "Portaria em Diário da Justiça eletrônico (Ceará TJ)",
    items: [
      {
        id: "ceara_portaria805_2011",
        type: "bill",
        author: [{ literal: "CEARÁ. Tribunal de Justiça" }],
        number:
          "Portaria nº 805 de 13 de junho de 2011",
        title:
          "Resolve determinar que o expediente do dia 14 de junho de 2011 seja encerrado às 15:00, em todas as unidades do Tribunal de Justiça",
        "container-title": "Diário da Justiça: seção 1",
        "publisher-place": "Fortaleza",
        page: "2",
        issued: { "date-parts": [[2011, 6, 15]] },
        URL: "http://twixar.me/cJs1",
        accessed: { "date-parts": [[2011, 6, 24]] },
      },
    ],
    expected:
      "CEARÁ. Tribunal de Justiça. Portaria nº 805 de 13 de junho de 2011. Resolve determinar que o expediente do dia 14 de junho de 2011 seja encerrado às 15:00, em todas as unidades do Tribunal de Justiça. **Diário da Justiça**: seção 1, Fortaleza, p. 2, 15 jun. 2011. Disponível em: http://twixar.me/cJs1. Acesso em: 24 jun. 2011.",
  },
  // ---- 3.13.4 Redes sociais ----
  // Fixture 1: Facebook com autor pessoal
  //
  // Necessidade: testar post com autor, título bold, plataforma em container-title
  // Mapeamento: type=post, note=local (sufixo ", "), container-title=plataforma
  // Decisão: post-weblog/post renderiza: author. title. note, date. container-title. URL
  {
    section: "3.13.4",
    description: "Rede social - Facebook com autor (Couto)",
    items: [
      {
        id: "couto2019",
        type: "post",
        author: [{ family: "Couto", given: "Mia" }],
        title: "A saudade",
        note: "Cidade da Beira",
        issued: { "date-parts": [[2019, 8, 17]] },
        "container-title": "Facebook: @miacoutoficial",
        URL: "https://www.facebook.com/miacoutoficial/photos/a.298941346819589/1244373005609747/?type=3&theater",
        accessed: { "date-parts": [[2019, 2, 22]] },
      },
    ],
    expected:
      "COUTO, Mia. **A saudade**. Cidade da Beira, 17 ago. 2019. Facebook: @miacoutoficial. Disponível em: https://www.facebook.com/miacoutoficial/photos/a.298941346819589/1244373005609747/?type=3&theater. Acesso em: 22 fev. 2019.",
  },
  // Fixture 2: Twitter sem autor (entrada por título)
  //
  // Necessidade: testar post sem autor — fixBookTitleEntry remove bold,
  //   fixFilmTitleCase aplica MAIÚSCULAS com artigo "O BRASIL"
  // Mapeamento: type=post, sem author, note=[local]
  // Decisão: artigo "O" + "Brasil" → "O BRASIL" pela regra de artigos
  {
    section: "3.13.4",
    description: "Rede social - Twitter sem autor (CNPq)",
    items: [
      {
        id: "cnpq_twitter2019",
        type: "post",
        title:
          "O Brasil tem ciência de alta qualidade e pesquisadores de excelência reconhecida nacional e internacionalmente",
        note: "[Brasília, DF]",
        issued: { "date-parts": [[2019, 7, 8]] },
        "container-title": "Twitter: @CNPq_Oficial",
        URL: "https://twitter.com/CNPq_Oficial/status/1148340918141018118",
        accessed: { "date-parts": [[2019, 8, 22]] },
      },
    ],
    expected:
      "O BRASIL tem ciência de alta qualidade e pesquisadores de excelência reconhecida nacional e internacionalmente. [Brasília, DF], 8 jul. 2019. Twitter: @CNPq_Oficial. Disponível em: https://twitter.com/CNPq_Oficial/status/1148340918141018118. Acesso em: 22 ago. 2019.",
  },
  // Fixture 3: Instagram com autor institucional e subtítulo
  //
  // Necessidade: testar post com autor literal (subdivisão) + subtítulo
  // Mapeamento: type=post, literal author com subdivisão,
  //   título com ": " para fixSubtitleBold separar bold/normal
  // Decisão: fixInstitutionalAuthor restaura caixa mista da subdivisão
  {
    section: "3.13.4",
    description: "Rede social - Instagram com autor institucional (UFC BU)",
    items: [
      {
        id: "ufc_instagram2019",
        type: "post",
        author: [
          {
            literal:
              "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária",
          },
        ],
        title:
          "Vamos fazer uma biblioteca sustentável?: diga sim ao recibo digital!",
        note: "Fortaleza",
        issued: { "date-parts": [[2019, 2, 13]] },
        "container-title": "Instagram: @bibliotecauniversitariaufc",
        URL: "https://www.instagram.com/p/Bt0vs1UndCZ/",
        accessed: { "date-parts": [[2019, 2, 22]] },
      },
    ],
    expected:
      "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária. **Vamos fazer uma biblioteca sustentável?**: diga sim ao recibo digital! Fortaleza, 13 fev. 2019. Instagram: @bibliotecauniversitariaufc. Disponível em: https://www.instagram.com/p/Bt0vs1UndCZ/. Acesso em: 22 fev. 2019.",
  },
  // ---- 3.7.1 Documentos civis e de cartórios ----
  //
  // Necessidade: testar certidão civil — formato especial com "Registro em:"
  // Mapeamento: type=document, publisher-place="Registro em", issued=data do registro
  // Decisão: document renderiza publisher-place, date. O pós-processador
  //   fixCertidaoDate converte "Registro em, " → "Registro em: "
  // Desafio: o CSL usa vírgula entre place e date, mas UFC exige dois-pontos
  {
    section: "3.7.1",
    description: "Certidão de nascimento (Fortaleza)",
    items: [
      {
        id: "fortaleza_certidao1997",
        type: "document",
        author: [
          {
            literal:
              "FORTALEZA. Cartório de Registro Civil das Pessoas Naturais do 1º Subdistrito de Fortaleza",
          },
        ],
        title: "Certidão de nascimento [de] Iago Moura e Moreira",
        "publisher-place": "Registro em",
        issued: { "date-parts": [[1997, 9, 28]] },
      },
    ],
    expected:
      "FORTALEZA. Cartório de Registro Civil das Pessoas Naturais do 1º Subdistrito de Fortaleza. **Certidão de nascimento [de] Iago Moura e Moreira**. Registro em: 28 set. 1997.",
  },
  // ---- 3.7.2 Documentos civis e de cartórios em meio eletrônico ----
  //
  // Necessidade: testar certidão eletrônica com URL
  // Nota: "31 fev. 2015" é uma data impossível (fevereiro tem 28/29 dias) —
  //   está assim no guia UFC (exemplo fictício). citeproc-js pode normalizar.
  {
    section: "3.7.2",
    description: "Registro geral eletrônico (São Paulo)",
    items: [
      {
        id: "sp_rg2015",
        type: "document",
        author: [
          {
            literal: "SÃO PAULO. Secretaria da Segurança Pública",
          },
        ],
        title: "Registro geral [de] Cravo do Lírio Pelópedas",
        "publisher-place": "Registro em",
        issued: { "date-parts": [[2015, 2, 28]] },
        URL: "https://www.sofazquemsabe.com/2012/07/carteira-de-identidade-ou-rg-passo.html",
        accessed: { "date-parts": [[2019, 7, 29]] },
      },
    ],
    expected:
      "SÃO PAULO. Secretaria da Segurança Pública. **Registro geral [de] Cravo do Lírio Pelópedas**. Registro em: 28 fev. 2015. Disponível em: https://www.sofazquemsabe.com/2012/07/carteira-de-identidade-ou-rg-passo.html. Acesso em: 29 jul. 2019.",
  },
  {
    section: "3.7.2",
    description: "Certidão de nascimento eletrônica (Serra Talhada)",
    items: [
      {
        id: "serra_talhada_certidao1900",
        type: "document",
        author: [
          {
            literal:
              "SERRA TALHADA. Cartório de Ofício de Registro Civil das Pessoas Naturais do Distrito de Tauapiranga",
          },
        ],
        title: "Certidão de nascimento [de] Virgulino Ferreira da Silva",
        "publisher-place": "Registro em",
        issued: { "date-parts": [[1900, 8, 12]] },
        URL: "http://newtonthaumaturgo.com/2009/09/certidao-de-nascimento-de-lampiao.html",
        accessed: { "date-parts": [[2019, 7, 24]] },
      },
    ],
    expected:
      "SERRA TALHADA. Cartório de Ofício de Registro Civil das Pessoas Naturais do Distrito de Tauapiranga. **Certidão de nascimento [de] Virgulino Ferreira da Silva**. Registro em: 12 ago. 1900. Disponível em: http://newtonthaumaturgo.com/2009/09/certidao-de-nascimento-de-lampiao.html. Acesso em: 24 jul. 2019.",
  },
  // ---- 3.13.2 Listas de discussão ----
  //
  // Necessidade: testar referência sem título (só autor + local + URL)
  // Mapeamento: type=dataset, sem title, publisher-place=local, URL=email
  // Decisão: dataset sem publisher renderiza publisher-place, date. URL
  //   Sem título, o substitute do author macro pega o title (vazio),
  //   resultando em supressão do campo título.
  // Desafio: [S. l.] precisa de itálico — pós-processador fixSineLocoItalic
  {
    section: "3.13.2",
    description: "Lista de discussão - CBBU",
    items: [
      {
        id: "cbbu2019",
        type: "dataset",
        author: [{ literal: "CBBU" }],
        "publisher-place": "[São Paulo]",
        issued: { "date-parts": [[2019]] },
        URL: "cbbu_febab@googlegroups.com",
        accessed: { "date-parts": [[2019, 7, 26]] },
      },
    ],
    expected:
      "CBBU. [São Paulo], 2019. Disponível em: cbbu_febab@googlegroups.com. Acesso em: 26 jul. 2019.",
  },
  {
    section: "3.13.2",
    description: "Lista de discussão - Python Brasil",
    items: [
      {
        id: "python_brasil2019",
        type: "dataset",
        author: [{ literal: "PYTHON Brasil" }],
        "publisher-place": "[*S. l.*]",
        issued: { "date-parts": [[2019]] },
        URL: "python...@yahoogrupos.com.br",
        accessed: { "date-parts": [[2019, 8, 22]] },
      },
    ],
    expected:
      "PYTHON Brasil. [*S. l.*], 2019. Disponível em: python...@yahoogrupos.com.br. Acesso em: 22 ago. 2019.",
  },
  // ---- 3.4.1.3 Evento no todo em publicação periódica ----
  //
  // Necessidade: testar evento publicado como fascículo de periódico —
  //   dois elementos bold (Anais + nome do periódico)
  // Mapeamento: type=book (título bold naturalmente), note=nome do periódico
  //   volume+edition → "v. 12, n. 1" (branch volume+edition do book)
  // Decisão: book porque AMBOS os elementos precisam de negrito:
  //   - **Anais** [...] → título bold do book + fixAnaisBrackets
  //   - **Cadernos...** → note bold via fixEventJournalBold
  //   paper-conference não daria bold no título.
  // Nota: edition="1" aqui mapeia o "n. 1" do periódico (não edição do livro)
  {
    section: "3.4.1.3",
    description: "Evento em periódico (Seminário Hist. Literatura)",
    items: [
      {
        id: "seminario_hist_lit_2005",
        type: "book",
        author: [
          {
            literal:
              "SEMINÁRIO INTERNACIONAL DE HISTÓRIA DA LITERATURA, 6., 2005, Porto Alegre",
          },
        ],
        title: "Anais [...]",
        note: "Cadernos do Centro de Pesquisas Literárias da PUCRS",
        publisher: "Ed. PUCRS",
        "publisher-place": "Porto Alegre",
        volume: "12",
        edition: "1",
        issued: { "date-parts": [[2006]] },
      },
    ],
    expected:
      "SEMINÁRIO INTERNACIONAL DE HISTÓRIA DA LITERATURA, 6., 2005, Porto Alegre. **Anais** [...]. **Cadernos do Centro de Pesquisas Literárias da PUCRS**. Porto Alegre: Ed. PUCRS, v. 12, n. 1, 2006.",
  },
  // ---- 3.4.1.4 Evento no todo em publicação periódica em meio eletrônico ----
  //
  // Necessidade: testar evento em periódico eletrônico (só volume, sem issue)
  // Mapeamento: type=paper-conference, container-title=periódico (bold)
  //   Sem issue, o CSL renderiza apenas v. 5
  // Nota: o título "Anais [...]" não é bold (plain no paper-conference) —
  //   isso difere do esperado UFC que mostra "Anais [...]" sem negrito.
  //   Na verdade, o guia UFC mostra "Anais [...]" sem formatação neste caso.
  {
    section: "3.4.1.4",
    description: "Evento em periódico eletrônico (CONEDU)",
    items: [
      {
        id: "congresso_educacao2018",
        type: "paper-conference",
        author: [
          {
            literal:
              "CONGRESSO NACIONAL DE EDUCAÇÃO, 5., 2018, Olinda",
          },
        ],
        title: "Anais [...]",
        "container-title": "Anais CONEDU",
        publisher: "Realize",
        "publisher-place": "Campina Grande",
        volume: "5",
        issued: { "date-parts": [[2018]] },
        URL: "https://www.editorarealize.com.br/revistas/conedu/anaisanteriores.php",
        accessed: { "date-parts": [[2019, 6, 17]] },
      },
    ],
    expected:
      "CONGRESSO NACIONAL DE EDUCAÇÃO, 5., 2018, Olinda. Anais [...]. **Anais CONEDU**. Campina Grande: Realize, v. 5, 2018. Disponível em: https://www.editorarealize.com.br/revistas/conedu/anaisanteriores.php. Acesso em: 17 jun. 2019.",
  },
  // ---- 3.1.2.3 Partes de trabalhos acadêmicos ----
  //
  // Necessidade: testar capítulo dentro de tese — formato híbrido
  //   *In*: com sequência de tese (ano antes de gênero, travessão)
  // Mapeamento: type=chapter com genre (ativa branch de tese no CSL)
  //   container-author = autor da tese, note = faculdade/departamento
  //   original-date = ano na capa da tese (2001), issued = ano da defesa (2000)
  // Decisão: reuso do layout chapter com condicional por genre —
  //   evita criar um tipo CSL separado para "capítulo de tese"
  {
    section: "3.1.2.3",
    description: "Parte de dissertação (Campos - Esforço de pesca)",
    items: [
      {
        id: "campos2001_cap",
        type: "chapter",
        author: [{ family: "Campos", given: "Ludmila Maria de Araújo" }],
        title: "Esforço de pesca",
        "container-author": [
          { family: "Campos", given: "Ludmila Maria de Araújo" },
        ],
        "container-title":
          "Estudo bioeconômico da pesca da lagosta no nordeste do Brasil: análise estática",
        "original-date": { "date-parts": [[2001]] },
        genre: "Dissertação (Mestrado em Desenvolvimento e Meio Ambiente)",
        note: "Pró-Reitoria de Pesquisa e Pós-Graduação, Universidade Federal do Ceará",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2000]] },
        page: "12-15",
      },
    ],
    expected:
      "CAMPOS, Ludmila Maria de Araújo. Esforço de pesca. *In*: CAMPOS, Ludmila Maria de Araújo. **Estudo bioeconômico da pesca da lagosta no nordeste do Brasil**: análise estática. 2001. Dissertação (Mestrado em Desenvolvimento e Meio Ambiente) – Pró-Reitoria de Pesquisa e Pós-Graduação, Universidade Federal do Ceará, Fortaleza, 2000. p. 12-15.",
  },
  // ---- 3.1.2.4 Partes de trabalhos acadêmicos em meio eletrônico ----
  //
  // Necessidade: testar parte de tese com URL
  // Mapeamento: mesmo padrão de 3.1.2.3 + URL/accessed
  // Nota: ambos os anos são 2014 (mesmo ano) → não usa original-date
  {
    section: "3.1.2.4",
    description: "Parte de tese eletrônica (Silva - O construto)",
    items: [
      {
        id: "silva2014_cap",
        type: "chapter",
        author: [
          { family: "Silva", given: "Regina Cláudia Oliveira da" },
        ],
        title: "O construto de um Brasil moderno",
        "container-author": [
          { family: "Silva", given: "Regina Cláudia Oliveira da" },
        ],
        "container-title":
          "A ação educacional e o legado cultural de Gustavo Barroso para a moderna museologia brasileira",
        genre: "Tese (Doutorado em Educação Brasileira)",
        note: "Faculdade de Educação, Universidade Federal do Ceará",
        "publisher-place": "Fortaleza",
        issued: { "date-parts": [[2014]] },
        page: "30-52",
        URL: "http://www.repositoriobib.ufc.br/000032/00003234.pdf",
        accessed: { "date-parts": [[2019, 4, 12]] },
      },
    ],
    expected:
      "SILVA, Regina Cláudia Oliveira da. O construto de um Brasil moderno. *In*: SILVA, Regina Cláudia Oliveira da. **A ação educacional e o legado cultural de Gustavo Barroso para a moderna museologia brasileira**. 2014. Tese (Doutorado em Educação Brasileira) – Faculdade de Educação, Universidade Federal do Ceará, Fortaleza, 2014. p. 30-52. Disponível em: http://www.repositoriobib.ufc.br/000032/00003234.pdf. Acesso em: 12 abr. 2019.",
  },
  // ---- 3.6.3 Jurisprudência ----
  //
  // Necessidade: testar jurisprudência em periódico — formato mais complexo
  //   do guia UFC com partes, advogados, relator, data extensa, container bold
  // Mapeamento: type=legal_case (sem publisher → branch "periódico")
  //   author=jurisdição, authority=tribunal, title=tipo+número+partes+relator
  //   container-title=periódico (bold), archive-place=local do periódico
  //   note=mês e ano da publicação (renderizado após pages)
  // Decisão: todo o corpo do processo (agravantes, advogados, relator) vai
  //   no title porque o CSL não tem campos separados para cada elemento
  //   processual. O field "title" em legal_case é plain text (sem bold).
  // Desafio: container-title com subtítulo → fixSubtitleBold separa o bold
  {
    section: "3.6.3",
    description: "Jurisprudência em periódico (Agravo regimental STJ)",
    items: [
      {
        id: "brasil_agravo2006",
        type: "legal_case",
        author: [{ literal: "BRASIL" }],
        authority: "Superior Tribunal de Justiça",
        title:
          "Agravo regimental de instrumento n° 612.097 - RS (2004.0074630-2). Agravantes: Adroaldo Lemos Guerreiro e outro. Advogados: César Augusto Bier e outro e Maria Eloísa da Costa. Agravado: Banco do Brasil S/A. Advogados: Magda Montenegro e Rosella Horst e outros. Relator: Ministro Carlos Alberto Menezes Direito",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2006, 5, 9]] },
        "container-title":
          "Lex: jurisprudência do STJ e Tribunais Regionais Federais",
        "archive-place": "São Paulo",
        volume: "18",
        issue: "205",
        page: "23-27",
        note: "maio 2006",
      },
    ],
    expected:
      "BRASIL. Superior Tribunal de Justiça. Agravo regimental de instrumento n° 612.097 - RS (2004.0074630-2). Agravantes: Adroaldo Lemos Guerreiro e outro. Advogados: César Augusto Bier e outro e Maria Eloísa da Costa. Agravado: Banco do Brasil S/A. Advogados: Magda Montenegro e Rosella Horst e outros. Relator: Ministro Carlos Alberto Menezes Direito. Brasília, DF, 9 de maio de 2006. **Lex**: jurisprudência do STJ e Tribunais Regionais Federais, São Paulo, v. 18, n. 205, p. 23-27, maio 2006.",
  },
  // ---- 3.6.4 Jurisprudência em meio eletrônico ----
  //
  // Fixture 1: Mandado de segurança publicado em DJe
  // Necessidade: testar jurisprudência eletrônica em periódico
  // Mapeamento: mesmo padrão de 3.6.3 + URL/accessed
  {
    section: "3.6.4",
    description: "Jurisprudência eletrônica em DJe (MS STF)",
    items: [
      {
        id: "brasil_ms32941_2015",
        type: "legal_case",
        author: [{ literal: "BRASIL" }],
        authority: "Supremo Tribunal Federal",
        title:
          "Mandado de Segurança nº 32.941 Relator: Ministro Marcos Aurélio",
        "publisher-place": "Brasília, DF",
        issued: { "date-parts": [[2015, 8, 18]] },
        "container-title": "Diário da Justiça Eletrônico",
        "archive-place": "Brasília, DF",
        issue: "203",
        page: "28",
        note: "9 out. 2015",
        URL: "https://www.stf.jus.br/arquivo/djEletronico/DJE_20151008_203.pdf",
        accessed: { "date-parts": [[2020, 9, 8]] },
      },
    ],
    expected:
      "BRASIL. Supremo Tribunal Federal. Mandado de Segurança nº 32.941 Relator: Ministro Marcos Aurélio, Brasília, DF, 18 ago. 2015. **Diário da Justiça Eletrônico**, Brasília, DF, n. 203, p. 28, 9 out. 2015. Disponível em: https://www.stf.jus.br/arquivo/djEletronico/DJE_20151008_203.pdf. Acesso em: 8 set. 2020.",
  },
  // Fixture 2: Jurisprudência em CD-ROM (SISLEX)
  //
  // Necessidade: testar referência legislativa em base de dados CD-ROM
  // Mapeamento: type=chapter (tem *In*:) — container-title=título da base,
  //   medium="1 CD-ROM", publisher/publisher-place para editora
  // Decisão: chapter porque tem *In*: explícito e estrutura de parte-de-todo.
  //   O container-title "SISLEX: sistema de..." tem subtítulo que o
  //   fixSubtitleBold separa em bold/plain.
  // Nota: no guia, [S. l.] aparece sem itálico. Na prática, o CSL não
  //   renderiza publisher-place em itálico diretamente — ele só aplica
  //   itálico quando gera "[S. l.]" automaticamente. Como aqui é literal,
  //   colocamos sem itálico.
  {
    section: "3.6.4",
    description: "Jurisprudência em CD-ROM (SISLEX DATAPREV)",
    items: [
      {
        id: "brasil_sislex1999",
        type: "chapter",
        author: [{ literal: "BRASIL" }],
        title: "Regulamento dos benefícios da previdência social",
        "container-title":
          "SISLEX: sistema de legislação, jurisprudência e pareceres da previdência e assistência social",
        publisher: "DATAPREV",
        "publisher-place": "[S. l.]",
        issued: { "date-parts": [[1999]] },
        archive: "1 CD-ROM",
      },
    ],
    expected:
      "BRASIL. Regulamento dos benefícios da previdência social. *In*: **SISLEX**: sistema de legislação, jurisprudência e pareceres da previdência e assistência social. [S. l.]: DATAPREV, 1999. 1 CD-ROM.",
  },
  // ---- 3.1.1.4 Capítulo institucional eletrônico (UFC Biblioteca) ----
  //
  // Necessidade: testar capítulo com autor institucional igual ao organizador
  //   do livro-contêiner, sem rótulo "(org.)" — usa container-author (sem editor)
  // Mapeamento: type=chapter, container-author para o nome institucional
  //   repetido no *In*: sem label, container-title com subtítulo longo
  // Decisão: container-author (não editor) → evita "(org.)" automático do CSL
  // Desafio: fixSubtitleBold separa bold do subtítulo após ":"
  {
    section: "3.1.1.4",
    description: "Capítulo de e-book institucional (UFC Biblioteca)",
    items: [
      {
        id: "ufc_bib2017",
        type: "chapter",
        title: "Identificação da instituição",
        author: [
          {
            literal:
              "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária",
          },
        ],
        "container-author": [
          {
            literal:
              "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária",
          },
        ],
        "container-title":
          "Relatório de avaliação dos produtos e serviços oferecidos pelo Sistema de Bibliotecas da Universidade Federal do Ceará: aplicação 03",
        "publisher-place": "Fortaleza",
        publisher: "Biblioteca Universitária",
        issued: { "date-parts": [[2017]] },
        URL: "http://www.biblioteca.ufc.br/wp-content/uploads/2017/12/rel-avaliacao-servicos-2017.pdf",
        accessed: { "date-parts": [[2019, 3, 25]] },
      },
    ],
    expected:
      "UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária. Identificação da instituição. *In*: UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária. **Relatório de avaliação dos produtos e serviços oferecidos pelo Sistema de Bibliotecas da Universidade Federal do Ceará**: aplicação 03. Fortaleza: Biblioteca Universitária, 2017. Disponível em: http://www.biblioteca.ufc.br/wp-content/uploads/2017/12/rel-avaliacao-servicos-2017.pdf. Acesso em: 25 mar. 2019.",
  },
  // ---- 3.2.2 Correspondência eletrônica (Carvalho) ----
  //
  // Necessidade: testar segunda referência de correspondência eletrônica
  // Mapeamento: mesmo padrão de Rosa Guimarães — personal_communication
  //   com title (bold entre colchetes), recipient, place, date, medium, URL
  {
    section: "3.2.2",
    description: "Carta eletrônica (Carvalho)",
    items: [
      {
        id: "carvalho1908",
        type: "personal_communication",
        title: "Poemas e canções para Euclides da Cunha",
        author: [{ family: "Carvalho", given: "Vicente de" }],
        recipient: [{ family: "Cunha", given: "Euclides da" }],
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[1908, 8, 31]] },
        medium: "1 carta",
        URL: "https://www.correioims.com.br/carta/poemas-e-cancoes-para-euclides-da-cunha/",
        accessed: { "date-parts": [[2019, 6, 17]] },
      },
    ],
    expected:
      "CARVALHO, Vicente de. [**Poemas e canções para Euclides da Cunha**]. Destinatário: Euclides da Cunha. São Paulo, 31 ago. 1908. 1 carta. Disponível em: https://www.correioims.com.br/carta/poemas-e-cancoes-para-euclides-da-cunha/. Acesso em: 17 jun. 2019.",
  },
  // ---- 3.8.1 DVD musical com intérprete (Tim Maia) ----
  //
  // Necessidade: testar tipo song para DVD musical (não filme)
  // Mapeamento: type=song — renderiza "Intérprete:" via author, título
  //   plain text. fixFilmTitleCase aplica MAIÚSCULAS na primeira palavra.
  // Decisão: song (não motion_picture) porque tem "Intérprete:" e não "Direção:"
  {
    section: "3.8.1",
    description: "DVD musical com intérprete (Tim Maia)",
    items: [
      {
        id: "timmaia2007",
        type: "song",
        title: "Tim Maia in concert",
        author: [{ family: "Maia", given: "Tim" }],
        "publisher-place": "Manaus",
        publisher: "Pólo Industrial de Manaus",
        issued: { "date-parts": [[2007]] },
        medium: "1 DVD",
      },
    ],
    expected:
      "TIM Maia in concert. Intérprete: Tim Maia. Manaus: Pólo Industrial de Manaus, 2007. 1 DVD.",
  },
  // ---- 3.13.1 Base de dados (Elsevier ScienceDirect) ----
  //
  // Necessidade: testar segunda base de dados — mesma estrutura do EBSCO
  // Mapeamento: type=dataset, author=empresa, title=nome da base (bold),
  //   publisher-place=local, URL+accessed
  {
    section: "3.13.1",
    description: "Base de dados (Elsevier ScienceDirect)",
    items: [
      {
        id: "elsevier2019",
        type: "dataset",
        title: "ScienceDirect",
        author: [{ literal: "ELSEVIER" }],
        "publisher-place": "Rio de Janeiro",
        issued: { "date-parts": [[2019]] },
        URL: "https://www-sciencedirect.ez11.periodicos.capes.gov.br/",
        accessed: { "date-parts": [[2019, 7, 29]] },
      },
    ],
    expected:
      "ELSEVIER. **ScienceDirect**. Rio de Janeiro, 2019. Disponível em: https://www-sciencedirect.ez11.periodicos.capes.gov.br/. Acesso em: 29 jul. 2019.",
  },
  // ========================================================================
  // 3.3.1 Coleção de publicação periódica
  // ========================================================================
  //
  // Tipo CSL: periodical (bloco dedicado)
  // Formato: TÍTULO. Local: Editora, datas. ISSN.
  // O campo note carrega o intervalo de datas + ISSN porque:
  //   1. CSL date ranges não suportam "em andamento" (ex: 1999- .)
  //   2. ISSN não tem variável com renderização no CSL padrão
  // Título em CAPS: o usuário entra o nome do periódico em maiúsculas
  //   (convenção bibliográfica para coleções), e o CSL preserva.
  {
    section: "3.3.1",
    description: "Coleção de periódico encerrada (Rev. Bras. Odontologia)",
    items: [
      {
        id: "rbo1943",
        type: "periodical",
        title: "REVISTA BRASILEIRA DE ODONTOLOGIA",
        "publisher-place": "Rio de Janeiro",
        publisher: "Associação Brasileira de Odontologia",
        note: "1943-2010. ISSN 0034-7272",
      },
    ],
    expected:
      "REVISTA BRASILEIRA DE ODONTOLOGIA. Rio de Janeiro: Associação Brasileira de Odontologia, 1943-2010. ISSN 0034-7272.",
  },
  {
    section: "3.3.1",
    description: "Coleção de periódico em andamento (Rev. Bras. Plantas)",
    items: [
      {
        id: "rbpm1999",
        type: "periodical",
        title: "REVISTA BRASILEIRA DE PLANTAS MEDICINAIS",
        "publisher-place": "Botucatu",
        publisher: "Fundação do Instituto de Biociências",
        note: "1999- . ISSN 1516-0572",
      },
    ],
    expected:
      "REVISTA BRASILEIRA DE PLANTAS MEDICINAIS. Botucatu: Fundação do Instituto de Biociências, 1999- . ISSN 1516-0572.",
  },
  {
    section: "3.3.1",
    description: "Coleção de periódico — jornal (O Povo)",
    items: [
      {
        id: "opovo1928",
        type: "periodical",
        title: "O POVO",
        "publisher-place": "Fortaleza",
        publisher: "Grupo Comunicação O Povo",
        note: "1928- . ISSN 1517-6819",
      },
    ],
    expected:
      "O POVO. Fortaleza: Grupo Comunicação O Povo, 1928- . ISSN 1517-6819.",
  },
  // ---- 3.3.2 Coleção de publicação periódica em meio eletrônico ----
  //
  // Mesmo padrão de 3.3.1 + URL/accessed
  // Título com subtítulo: "ENCONTROS BIBLI: Revista Eletrônica de..."
  //   O subtítulo fica plain text (sem bold) porque fixBookTitleEntry
  //   remove o bold da entrada por título antes de fixSubtitleBold agir.
  {
    section: "3.3.2",
    description: "Coleção de periódico eletrônico (Encontros Bibli)",
    items: [
      {
        id: "encontros1996",
        type: "periodical",
        title:
          "ENCONTROS BIBLI: Revista Eletrônica de Biblioteconomia e Ciência da Informação",
        "publisher-place": "Florianópolis",
        publisher: "UFSC",
        note: "1996- . ISSN 1518-2924",
        URL: "https://periodicos.ufsc.br/index.php/eb/index",
        accessed: { "date-parts": [[2019, 2, 11]] },
      },
    ],
    expected:
      "ENCONTROS BIBLI: Revista Eletrônica de Biblioteconomia e Ciência da Informação. Florianópolis: UFSC, 1996- . ISSN 1518-2924. Disponível em: https://periodicos.ufsc.br/index.php/eb/index. Acesso em: 11 fev. 2019.",
  },
  // ---- 3.3.3 Parte de coleção de publicação periódica ----
  //
  // Formato similar a 3.3.1 mas com período específico após as datas gerais:
  //   "1958- . 1997-2007." — datas da coleção + datas da parte consultada
  {
    section: "3.3.3",
    description: "Parte de coleção de periódico (Rev. Bras. Política Intl.)",
    items: [
      {
        id: "rbpi1958",
        type: "periodical",
        title: "REVISTA BRASILEIRA DE POLÍTICA INTERNACIONAL",
        "publisher-place": "Rio de Janeiro",
        publisher: "Instituto Brasileiro de Relações Internacionais",
        note: "1958- . 1997-2007. ISSN 0034-7329",
      },
    ],
    expected:
      "REVISTA BRASILEIRA DE POLÍTICA INTERNACIONAL. Rio de Janeiro: Instituto Brasileiro de Relações Internacionais, 1958- . 1997-2007. ISSN 0034-7329.",
  },
  // ---- 3.3.4 Parte de coleção de publicação periódica em meio eletrônico ----
  {
    section: "3.3.4",
    description:
      "Parte de coleção de periódico eletrônico (Rev. Bras. Enfermagem)",
    items: [
      {
        id: "rben1955",
        type: "periodical",
        title: "REVISTA BRASILEIRA DE ENFERMAGEM",
        "publisher-place": "Brasília, DF",
        publisher: "Associação Brasileira de Enfermagem",
        note: "1955- . 2010-2015. ISSN 1984-0446",
        URL: "http://www.scielo.br/scielo.php?script=sci_issues&pid=0034-7167&lng=en&nrm=iso/",
        accessed: { "date-parts": [[2019, 5, 18]] },
      },
    ],
    expected:
      "REVISTA BRASILEIRA DE ENFERMAGEM. Brasília, DF: Associação Brasileira de Enfermagem, 1955- . 2010-2015. ISSN 1984-0446. Disponível em: http://www.scielo.br/scielo.php?script=sci_issues&pid=0034-7167&lng=en&nrm=iso/. Acesso em: 18 maio 2019.",
  },
  // ========================================================================
  // 3.3.5 Fascículo, suplemento e outros
  // ========================================================================
  //
  // Tipo CSL: article-journal (fascículo dentro de periódico)
  // Entrada por título (sem autor): fixFilmTitleCase trata "AS" como artigo
  //   → "AS MELHORES" em maiúsculas
  // Container-title (periódico) em bold pelo CSL
  // Nota: o doc não mostra bold em "Gestão Universitária", mas seguindo a
  //   regra UFC o nome do periódico é sempre em negrito.
  {
    section: "3.3.5",
    description: "Fascículo de periódico (As melhores universidades)",
    items: [
      {
        id: "melhores2011",
        type: "article-journal",
        title: "As melhores universidades do Brasil",
        "container-title": "Gestão Universitária",
        "publisher-place": "São Paulo",
        volume: "2",
        issued: { "date-parts": [[2011]] },
      },
    ],
    expected:
      "AS MELHORES universidades do Brasil. **Gestão Universitária**, São Paulo, v. 2, 2011.",
  },
  // ========================================================================
  // 3.3.6 Fascículo, suplemento e outros em meio eletrônico
  // ========================================================================
  //
  // Três referências com estruturas distintas:
  //
  // #1 (CFMV): periódico como referência principal (sem container)
  //   → type=periodical, note carrega "ano 24, n. 77, abr./ jun. 2018"
  //
  // #2 (Perspectivas): fascículo com container-title (periódico bold)
  //   → type=periodical com container-title + publisher-place (sufixo ". ")
  //   note carrega volume, data, nota especial e ISSN
  //
  // #3 (O Povo): fascículo de jornal com container-title (bold)
  //   → type=periodical com container-title SEM publisher-place (sufixo ", ")
  //   note carrega edição, local, editora, data e nota
  {
    section: "3.3.6",
    description: "Fascículo eletrônico — revista (CFMV)",
    items: [
      {
        id: "cfmv2018",
        type: "periodical",
        title: "REVISTA [DO] CONSELHO FEDERAL DE MEDICINA VETERINÁRIA",
        "publisher-place": "Brasília, DF",
        publisher: "CRVM",
        note: "ano 24, n. 77, abr./ jun. 2018",
        URL: "http://certidao.cfmv.gov.br/revistas/edicao77.pdf",
        accessed: { "date-parts": [[2019, 2, 14]] },
      },
    ],
    expected:
      "REVISTA [DO] CONSELHO FEDERAL DE MEDICINA VETERINÁRIA. Brasília, DF: CRVM, ano 24, n. 77, abr./ jun. 2018. Disponível em: http://certidao.cfmv.gov.br/revistas/edicao77.pdf. Acesso em: 14 fev. 2019.",
  },
  {
    section: "3.3.6",
    description:
      "Fascículo eletrônico — periódico com container (Perspectivas em CI)",
    items: [
      {
        id: "perspectivas2019",
        type: "periodical",
        title: "Informação mediação cultura",
        "container-title": "Perspectivas em Ciência da Informação",
        "publisher-place": "Belo Horizonte",
        publisher: "Ed. UFMG",
        note: "v. 24, mar. 2019. Número especial. ISSN 1981-5344",
        URL: "http://portaldeperiodicos.eci.ufmg.br/index.php/pci/issue/view/188",
        accessed: { "date-parts": [[2019, 8, 13]] },
      },
    ],
    expected:
      "INFORMAÇÃO mediação cultura. **Perspectivas em Ciência da Informação**. Belo Horizonte: Ed. UFMG, v. 24, mar. 2019. Número especial. ISSN 1981-5344. Disponível em: http://portaldeperiodicos.eci.ufmg.br/index.php/pci/issue/view/188. Acesso em: 13 ago. 2019.",
  },
  {
    section: "3.3.6",
    description: "Fascículo eletrônico — jornal com container (O Povo)",
    items: [
      {
        id: "sertao2014",
        type: "periodical",
        title: "Sertão a ferro e fogo: marcas de gado e gente",
        "container-title": "O Povo",
        note: "ed. 28.918, Fortaleza: Grupo de Comunicação O Povo, 12 ago. 2014. Caderno especial",
        URL: "https://digital.opovo.com.br/sertaoaferroefogo",
        accessed: { "date-parts": [[2019, 8, 21]] },
      },
    ],
    expected:
      "SERTÃO a ferro e fogo: marcas de gado e gente. **O Povo**, ed. 28.918, Fortaleza: Grupo de Comunicação O Povo, 12 ago. 2014. Caderno especial. Disponível em: https://digital.opovo.com.br/sertaoaferroefogo. Acesso em: 21 ago. 2019.",
  },
  // ---- 3.4.2.2 Parte de evento eletrônico (Serra) ----
  //
  // Referência previamente truncada no doc, agora completa.
  // Mesmo padrão do Bugarim: paper-conference com event-title, anais, URL.
  {
    section: "3.4.2.2",
    description: "Trabalho em anais eletrônico (Serra)",
    items: [
      {
        id: "serra2017",
        type: "paper-conference",
        title:
          "Placas indicativas como fontes de informação: a percepção dos usuários de ônibus do Terminal de Integração da Parangaba",
        author: [
          { family: "Serra", given: "Jackson Sousa" },
          { family: "Pinto", given: "Virgínia Bentes" },
        ],
        "event-title":
          "ENCONTRO DE ESTUDOS DE USO E USUÁRIOS DA INFORMAÇÃO, 1., 2017, Fortaleza",
        "container-title": "Anais [...]",
        publisher: "UFC",
        "publisher-place": "Fortaleza",
        page: "1-18",
        issued: { "date-parts": [[2017]] },
        URL: "http://www.eneu2017.ufc.br/index.php/eneu/1/paper/viewFile/13/37",
        accessed: { "date-parts": [[2020, 9, 10]] },
      },
    ],
    expected:
      "SERRA, Jackson Sousa; PINTO, Virgínia Bentes. Placas indicativas como fontes de informação: a percepção dos usuários de ônibus do Terminal de Integração da Parangaba. *In*: ENCONTRO DE ESTUDOS DE USO E USUÁRIOS DA INFORMAÇÃO, 1., 2017, Fortaleza. **Anais** [...]. Fortaleza: UFC, 2017. p. 1-18. Disponível em: http://www.eneu2017.ufc.br/index.php/eneu/1/paper/viewFile/13/37. Acesso em: 10 set. 2020.",
  },
  // ---- 3.6.3 Jurisprudência em livro — Súmula (STF) ----
  //
  // Referência previamente truncada no doc, agora completa.
  // Branch legal_case com publisher → súmula publicada em livro.
  // CSL renderiza: author. authority. title. In: note. container-title.
  //   publisher-place: publisher, year. p. page.
  // Nota: "São Paulo,:" no doc original é typo — corrigido para "São Paulo:"
  {
    section: "3.6.3",
    description: "Jurisprudência em livro — Súmula (STF)",
    items: [
      {
        id: "brasil_sumula14_1994",
        type: "legal_case",
        author: [{ literal: "BRASIL" }],
        authority: "Supremo Tribunal Federal",
        title: "Súmula n° 14",
        publisher: "Associação dos Advogados do Brasil",
        "publisher-place": "São Paulo",
        issued: { "date-parts": [[1994]] },
        note: "BRASIL. Supremo Tribunal Federal",
        "container-title": "Súmulas",
        page: "16",
      },
    ],
    expected:
      "BRASIL. Supremo Tribunal Federal. Súmula n° 14. *In*: BRASIL. Supremo Tribunal Federal. **Súmulas**. São Paulo: Associação dos Advogados do Brasil, 1994. p. 16.",
  },
];

// ========================================================================
// Execução dos testes
// ========================================================================

let passed = 0;
let failed = 0;
const errors = [];

for (const test of TESTS) {
  const { section, description, items, expected } = test;
  let result;

  try {
    const results = renderBibliography(items);
    result = results[0] || "(vazio)";
  } catch (e) {
    result = `ERRO: ${e.message}`;
  }

  if (result === expected) {
    console.log(`  ✓ [${section}] ${description}`);
    passed++;
  } else {
    console.log(`  ✗ [${section}] ${description}`);
    console.log(`    Resultado: ${result}`);
    console.log(`    Esperado:  ${expected}`);

    // Mostrar primeira diferença
    const minLen = Math.min(result.length, expected.length);
    let firstDiff = minLen;
    for (let i = 0; i < minLen; i++) {
      if (result[i] !== expected[i]) {
        firstDiff = i;
        break;
      }
    }
    const ctx = 30;
    const start = Math.max(0, firstDiff - ctx);
    console.log(
      `    Diff @${firstDiff}: ...${result.slice(start, firstDiff + ctx)}...`
    );
    console.log(
      `    Diff @${firstDiff}: ...${expected.slice(start, firstDiff + ctx)}...`
    );

    failed++;
    errors.push({ section, description, result, expected });
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Total: ${passed + failed} | Passou: ${passed} | Falhou: ${failed}`);

if (errors.length > 0) {
  console.log(`\nProblemas encontrados:`);
  for (const { section, description } of errors) {
    console.log(`  - [${section}] ${description}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
