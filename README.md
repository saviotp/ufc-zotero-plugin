# UFC Zotero Plugin

Plugin para o **Zotero 8** que formata referências bibliográficas de acordo com o **Guia de Normalização de Referências da Universidade Federal do Ceará (UFC)**, baseado nas normas ABNT NBR 6023:2018 e ABNT NBR 10520:2023.

Desenvolvido para a comunidade acadêmica da UFC — alunos, pesquisadores e docentes — com suporte da **Biblioteca Universitária da UFC**.

## Funcionalidades

- **Estilo CSL personalizado** (`ufc.csl`) com 20 macros e 26 tipos de referência, cobrindo todas as 67 seções do Guia de Normalização
- **Pós-processamento automático** com 19 correções que vão além do que o CSL consegue expressar (subtítulo fora do negrito, en-dash para hífen em páginas, caixa alta em títulos sem autor, etc.)
- **Instalação automática do estilo**: o plugin registra o CSL `ufc.csl` no Zotero ao ser ativado
- **137 testes automatizados** cobrindo 138 referências extraídas literalmente do Guia da UFC
- **Compatível com Zotero 8** (não compatível com versões anteriores)

## Instalação

### Pré-requisitos

- [Zotero 8](https://www.zotero.org/download/) instalado

### Passo a passo

1. Baixe o arquivo `.xpi` da [última release](https://github.com/saviotp/ufc-zotero-plugin/releases/latest)
2. No Zotero, vá em **Ferramentas → Complementos** (ou `Ctrl+Shift+A`)
3. Clique no ícone de engrenagem e selecione **Instalar complemento de arquivo...**
4. Selecione o arquivo `.xpi` baixado
5. Reinicie o Zotero quando solicitado
6. O estilo "UFC — Universidade Federal do Ceará" estará disponível automaticamente

### Selecionando o estilo

1. Vá em **Editar → Preferências → Citar**
2. Em **Estilos**, procure por "UFC"
3. Selecione "Universidade Federal do Ceará — ABNT (autoria completa)"

## Uso

### Como gerar referências

1. Adicione seus itens ao Zotero normalmente (via ISBN, DOI, navegador, ou manualmente)
2. Selecione os itens desejados na biblioteca
3. Clique com botão direito → **Criar referência bibliográfica a partir do item**
4. Escolha o estilo "UFC" e o formato desejado (RTF, HTML, etc.)

### Preenchimento de campos no Zotero

Para que as referências sejam geradas corretamente, é fundamental preencher os campos corretos no Zotero. A tabela abaixo mapeia cada tipo de referência do Guia UFC para o tipo de item e os campos correspondentes no Zotero.

> **Dica geral:** Ao adicionar um livro pelo ISBN, o Zotero preenche a maioria dos campos automaticamente. Caso algum campo não seja encontrado, consulte o **expediente** do livro (geralmente na página de rosto ou no verso dela) para editora, edição e local de publicação.

---

### Limpeza de dados importados por DOI

Ao importar referências pelo **DOI**, o Zotero busca os metadados no Crossref. Esses dados frequentemente vêm com problemas de formatação que **precisam ser corrigidos manualmente** no Zotero antes de gerar a referência.

> **O plugin corrige automaticamente** a remoção do nome do país no local de publicação (ex: "Rio de Janeiro, Brazil" → "Rio de Janeiro"). Os demais itens abaixo precisam de revisão manual.

#### O que verificar após importar por DOI

| Campo | Problema comum | O que corrigir |
|---|---|---|
| **Autor** | Sobrenome inclui nomes do meio (ex: `Cardoso De Castro Salgado, Luciana`) | Mover nomes do meio para o campo Nome: Sobrenome = `Salgado`, Nome = `Luciana Cardoso de Castro` |
| **Título** | Todo em MAIÚSCULAS (ex: `CULTURAL VIEWPOINT METAPHORS...`) | Reescrever em caixa normal: `Cultural viewpoint metaphors...` (manter siglas como estão) |
| **Tipo (Gênero)** | Formato errado ou em inglês (ex: `DOUTOR EM CIÊNCIAS - INFORMÁTICA`) | Corrigir para o formato UFC: `Doutorado em Informática` (para teses) ou `Mestrado em ...` (para dissertações) |
| **Editora (Universidade)** | Todo em MAIÚSCULAS (ex: `PONTIFÍCIA UNIVERSIDADE CATÓLICA DO RIO DE JANEIRO`) | Reescrever em caixa mista: `Pontifícia Universidade Católica do Rio de Janeiro` |
| **Local** | Inclui o país (ex: `Rio de Janeiro, Brazil`) | O plugin remove automaticamente. Se preferir, corrija para apenas a cidade: `Rio de Janeiro` |
| **Nota (Extra)** | Ausente | Para teses/dissertações, adicionar a faculdade/departamento com travessão: `Departamento de Informática – Pontifícia Universidade Católica do Rio de Janeiro` |

#### Exemplo: antes e depois da limpeza

**Importado por DOI (dados brutos):**
```
CARDOSO DE CASTRO SALGADO, Luciana. CULTURAL VIEWPOINT METAPHORS TO EXPLORE
AND COMMUNICATE CULTURAL PERSPECTIVES IN CROSS-CULTURAL HCI DESIGN. 2011.
DOUTOR EM CIÊNCIAS - INFORMÁTICA, PONTIFÍCIA UNIVERSIDADE CATÓLICA DO RIO DE
JANEIRO, Rio de Janeiro, Brazil, 2011. Disponível em: ...
```

**Após limpeza manual no Zotero:**
```
SALGADO, Luciana Cardoso de Castro. Cultural viewpoint metaphors to explore
and communicate cultural perspectives in cross-cultural HCI design. 2011.
Tese (Doutorado em Informática) – Departamento de Informática, Pontifícia
Universidade Católica do Rio de Janeiro, Rio de Janeiro, 2011. Disponível em: ...
```

> **Dica:** A limpeza leva poucos minutos por referência e garante que sua bibliografia fique 100% conforme o Guia UFC. Referências importadas por ISBN geralmente têm dados mais limpos.

---

### Tabela de mapeamento: Tipo UFC → Tipo Zotero → Campos

#### 3.1 Livros, folhetos e trabalhos acadêmicos

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.1.1.1 | Livro impresso | Livro | Autor, Título, Edição, Local, Editora, Data | **Subtítulo**: separe com `:` no campo Título (ex: `Educação escolar: políticas, estrutura e organização`). O plugin formata automaticamente o subtítulo fora do negrito |
| 3.1.1.2 | Livro eletrônico | Livro | Autor, Título, Edição, Local, Editora, Data, URL, Acesso | Para e-books, adicione o texto `E-book` no campo **Meio** (Format). Para CD-ROM, use `5 CD-ROM`, etc. |
| 3.1.1.3 | Capítulo de livro | Capítulo de livro | Autor do capítulo, Título do capítulo, Organizador(es), Título do livro, Edição, Local, Editora, Data, Páginas | Os organizadores vão no campo **Editor** do Zotero (aparecerão como "org." automaticamente) |
| 3.1.1.4 | Capítulo de livro eletrônico | Capítulo de livro | (mesmos do 3.1.1.3) + URL, Acesso | Para autoria institucional com subdivisão (ex: UFC. Biblioteca Universitária), preencha o autor com `literal`: `UNIVERSIDADE FEDERAL DO CEARÁ. Biblioteca Universitária` |
| 3.1.2.1 | Tese/Dissertação | Tese | Autor, Título, Data, Tipo (ex: Tese, Dissertação), Gênero (ex: Doutorado em Economia), Extra/Nota (ex: `Faculdade de Economia – Universidade Federal do Ceará`), Local | No campo **Nota** (Extra), use travessão `–` entre faculdade e universidade |
| 3.1.2.2 | Tese/Dissertação eletrônica | Tese | (mesmos do 3.1.2.1) + URL, Acesso | — |
| 3.1.2.3 | Parte de tese | Capítulo de livro | Autor, Título do capítulo, Título da tese, Data, Gênero, Nota, Local, Páginas | Preencha o campo **Gênero** com o tipo (ex: `Dissertação (Mestrado em Desenvolvimento e Meio Ambiente)`) |
| 3.1.2.4 | Parte de tese eletrônica | Capítulo de livro | (mesmos do 3.1.2.3) + URL, Acesso | — |

#### 3.2 Correspondência

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.2.1 | Carta, bilhete, cartão | Carta | Autor, Título (entre colchetes, ex: `[Carta para o filho]`), Destinatário, Local, Data, Tipo (ex: `1 carta`) | O título deve ficar entre colchetes `[ ]` no campo Título |
| 3.2.2 | Correspondência eletrônica | Carta | (mesmos do 3.2.1) + URL, Acesso | — |

#### 3.3 Publicações periódicas

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.3.1 | Coleção de periódico | Documento | Título (em CAIXA ALTA), Local, Editora, Nota (datas e ISSN) | O título deve ser digitado em MAIÚSCULAS pelo usuário. No campo **Nota** (Extra), insira as datas e ISSN (ex: `1943-2010. ISSN 0034-7272`) |
| 3.3.2 | Coleção de periódico eletrônico | Documento | (mesmos do 3.3.1) + URL, Acesso | — |
| 3.3.3 | Parte de coleção | Documento | Título, Local, Editora, Nota (período + ISSN) | No campo **Nota**, inclua o período específico (ex: `1997-2007. ISSN 0034-7329`) |
| 3.3.4 | Parte de coleção eletrônica | Documento | (mesmos do 3.3.3) + URL, Acesso | — |
| 3.3.5 | Fascículo/suplemento | Artigo de periódico | Título do fascículo, Periódico, Local, Volume, Data | Sem autor — o título do fascículo entra como título do item |
| 3.3.6 | Fascículo eletrônico | Documento | Título, Container-title, Local, Editora, Nota (volume, data, ISSN) | Use o campo **Nota** para informações adicionais de volume e data |
| 3.3.7 | Artigo de periódico | Artigo de periódico | Autor, Título do artigo, Periódico, Local, Volume, Número, Páginas, Data | O nome do periódico vai em **Publicação** (container-title) |
| 3.3.8 | Artigo de periódico eletrônico | Artigo de periódico | (mesmos do 3.3.7) + URL ou DOI, Acesso | Se disponível, preencha o **DOI** — o Zotero resolve automaticamente |
| 3.3.9 | Artigo/matéria de jornal | Artigo de jornal | Autor, Título, Jornal, Local, Ano (volume), Número, Data, Páginas, Seção | No campo **Volume**, use o ano do jornal (ex: `ano 43`). A seção vai no campo **Seção** |
| 3.3.10 | Artigo de jornal eletrônico | Artigo de jornal | (mesmos do 3.3.9) + URL, Acesso | — |

#### 3.4 Eventos

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.4.1.1 | Evento (anais) | Conferência | Título do evento (em CAIXA ALTA), Título dos anais (ex: `Anais [...]`), Local, Editora, Data | O nome do evento deve estar em MAIÚSCULAS. O título do anais vai no campo **Título** do livro/anais |
| 3.4.1.2 | Evento eletrônico | Conferência | (mesmos do 3.4.1.1) + URL, Acesso | — |
| 3.4.1.3 | Evento em periódico | Livro | Título do evento, Título dos anais, Periódico, Volume, Número, Local, Editora, Data | Use tipo **Livro** com volume e edição para que o plugin aplique bold corretamente |
| 3.4.1.4 | Evento em periódico eletrônico | Conferência | Título do evento, Anais, Periódico, Volume, Local, Editora, Data, URL, Acesso | — |
| 3.4.2.1 | Parte de evento (trabalho) | Conferência | Autor, Título do trabalho, Evento (CAIXA ALTA), Anais, Local, Editora, Data, Páginas | — |
| 3.4.2.2 | Parte de evento eletrônico | Conferência | (mesmos do 3.4.2.1) + URL, Acesso | — |
| 3.4.2.3 | Parte de evento em periódico | Artigo de periódico | Autor, Título, Periódico, Local, Volume, Número, Páginas, Data | Adicione no campo **Extra**: `Trabalho apresentado no [nome do evento], [nº], [ano], [local].` |
| 3.4.2.4 | Parte de evento em periódico eletrônico | Artigo de periódico | (mesmos do 3.4.2.3) + URL, Acesso | — |
| 3.4.2.5 | Trabalho não publicado | Tese | Autor, Título, Data, Extra (informações do evento) | Use tipo **Tese** — único tipo que posiciona o ano após o título |

#### 3.5 Patentes

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.5.1 | Patente impressa | Patente | Inventor, Título, Depositante (Editora), País (Local), Número, Data de depósito, Data de concessão | O depositante vai no campo **Editora** (publisher) e o país no campo **Local** (publisher-place) |
| 3.5.1e | Patente eletrônica | Patente | (mesmos do 3.5.1) + URL, Acesso | — |

#### 3.6 Documentos jurídicos

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.6.1 | Legislação | Legislação | Jurisdição (autor), Título, Nota (ex: `[Constituição (1988)]`), Publicação, Edição, Local, Editora, Data | Para constituições, preencha o campo **Nota** com `[Constituição (ano)]` |
| 3.6.2 | Legislação eletrônica | Legislação | (mesmos do 3.6.1) + URL, Acesso | — |
| 3.6.3 | Jurisprudência | Caso | Jurisdição, Tribunal (autor), Título da decisão, Publicação, Local, Volume, Páginas, Data | Súmulas em livro: preencha o campo **Editora** (publisher) |
| 3.6.4 | Jurisprudência eletrônica | Caso / Capítulo de livro | (mesmos do 3.6.3) + URL, Acesso | Para SISLEX (CD-ROM), use tipo **Capítulo de livro** com campo **Arquivo** |
| 3.6.5 | Atos administrativos | Legislação | Jurisdição, Título do ato, Local, Editora, Data | — |
| 3.6.6 | Atos administrativos eletrônicos | Legislação | (mesmos do 3.6.5) + URL, Acesso | — |

#### 3.7 Documentos civis e de cartórios

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.7.1 | Certidão impressa | Documento | Instituição (autor), Título, Local (`Registro em`), Data | O campo **Local** deve conter `Registro em` — o plugin converte a vírgula em dois-pontos |
| 3.7.2 | Certidão eletrônica | Documento | (mesmos do 3.7.1) + URL, Acesso | — |

#### 3.8 Documentos audiovisuais

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.8.1 | Filme/vídeo | Filme | Título, Diretor/Produtor, Local, Editora (distribuidora), Data, Meio (ex: `1 DVD (26 min)`) | Para filmes sem autor, o plugin coloca a primeira palavra do título em MAIÚSCULAS |
| 3.8.2 | Parte de filme | Filme | Título da parte, Diretor, Título do filme, Local, Editora, Data, Descrição (ex: `Disco 1, episódio 1`) | — |
| 3.8.3 | Documento sonoro (CD) | Documento sonoro | Título do álbum, Intérprete, Local, Gravadora, Data, Meio (ex: `1 CD`) | — |
| 3.8.4 | Parte de documento sonoro | Documento sonoro | Título da faixa, Intérprete, Compositor, Título do álbum, Local, Gravadora, Data, Faixa | — |

#### 3.9 Partituras

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.9.1 | Partitura impressa | Documento | Compositor, Título, Instrumento (Meio), Local, Editora, Data, Tipo (ex: `1 partitura`) | — |
| 3.9.2 | Partitura eletrônica | Documento | (mesmos do 3.9.1) + URL, Acesso | — |

#### 3.10 Documentos iconográficos

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.10.1 | Imagem/foto impressa | Obra de arte | Autor, Título (entre colchetes se atribuído), Data, Meio (ex: `1 fotografia, color., 17,5 x 13 cm`) | Se o título for atribuído, use colchetes: `[Biblioteca de Ciências e Tecnologia]` |
| 3.10.2 | Imagem eletrônica | Obra de arte | (mesmos do 3.10.1) + URL, Acesso | — |

#### 3.11 Documentos cartográficos

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.11.1 | Mapa/atlas impresso | Mapa | Autor, Título, Local, Editora, Data, Tipo (ex: `1 mapa, color.`), Escala | — |
| 3.11.2 | Mapa/atlas eletrônico | Mapa | (mesmos do 3.11.1) + URL, Acesso | — |

#### 3.13 Documentos de acesso exclusivo em meio eletrônico

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.13.1 | Base de dados | Documento | Responsável, Título da base, Local, Data, URL, Acesso | — |
| 3.13.2 | Lista de discussão | Conjunto de dados | Título da lista, Local, Data, URL (e-mail), Acesso | O campo **URL** deve conter o endereço de e-mail do grupo |
| 3.13.3 | Programa de computador | Programa de computador | Desenvolvedor, Título, Versão, Local, Data, Meio ou URL | — |
| 3.13.4 | Rede social | Post | Autor, Título, Local, Data, Extra (plataforma + @handle), URL, Acesso | No campo **Extra** (note), insira a plataforma: `Facebook: @handle` |
| 3.13.5 | Mensagem eletrônica | Carta | Remetente, Título, Destinatário, Local, Data, Tipo (ex: `1 mensagem eletrônica`) | — |
| 3.13.6 | Website | Página da web | Autor, Título, Local, Editora, Data, URL, Acesso | — |

#### 3.14 Outros documentos

| Seção UFC | Descrição | Tipo no Zotero | Campos obrigatórios | Dicas |
|---|---|---|---|---|
| 3.14.1 | Entrevista em periódico | Artigo de periódico | Entrevistado, Título, Periódico, Volume, Número, Páginas, Data | Para a expressão "Entrevista concedida a", inclua no título |
| 3.14.2 | Entrevista eletrônica | Artigo de periódico | (mesmos do 3.14.1) + URL, Acesso | — |
| 3.14.3 | Resenha | Artigo de periódico | Autor da resenha, Título, Periódico, Local, Volume, Número, Páginas, Data, Extra (obra resenhada) | No campo **Extra**, insira: `Resenha da obra de: SOBRENOME, Nome. Título. Local: Editora, ano.` |
| 3.14.4 | Resenha eletrônica | Capítulo de livro | Autor, Título, Blog/publicação, Local, Data, Extra (obra resenhada), URL, Acesso | — |
| 3.14.5 | Bula de remédio | Documento | Título do medicamento, Responsável técnico (autor), Local, Laboratório (editora), Data, Tipo (`1 bula de remédio`) | O responsável técnico vai no campo **Autor** |
| 3.14.6 | Bula eletrônica | Documento | (mesmos do 3.14.5) + URL, Acesso | — |
| 3.14.7 | Psicografia | Livro | Espírito (autor, ex: `Campos, Humberto de (Espírito)`), Título, Extra (`Psicografado por [médium]`), Local, Editora, Data | O espírito é o autor; o médium vai no campo **Extra** |
| 3.14.8 | Psicografia eletrônica | Livro | (mesmos do 3.14.7) + URL, Acesso | — |
| 3.14.9 | Bíblia | Livro | Autor (`BÍBLIA. Português`), Título, Edição, Local, Editora, Data | — |
| 3.14.10 | Bíblia eletrônica | Livro | (mesmos do 3.14.9) + URL, Acesso | — |
| 3.14.11 | Parte de bíblia | Capítulo de livro | Autor (`BÍBLIA. A. T. Eclesiastes`), Título do livro bíblico, Título da bíblia, Local, Editora, Data, Páginas | — |
| 3.14.12 | Parte de bíblia eletrônica | Capítulo de livro | (mesmos do 3.14.11) + URL, Acesso | — |

---

### Exemplos de referências

Para ver todas as 138 referências formatadas pelo plugin (comparadas com o esperado pelo Guia UFC), consulte o arquivo [`docs/referencias-ufc-exemplos.md`](docs/referencias-ufc-exemplos.md).

## Desenvolvimento

### Pré-requisitos

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Setup

```bash
git clone https://github.com/saviotp/ufc-zotero-plugin.git
cd ufc-zotero-plugin
npm install
```

### Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm test` | Executa os 137 testes CSL com citeproc-js |
| `npm run build` | Compila o plugin e gera o arquivo `.xpi` |
| `npm run dev` | Modo desenvolvimento com hot-reload |
| `npm run typecheck` | Verificação de tipos TypeScript |

### Estrutura do projeto

```
ufc-zotero-plugin/
├── addon/                  # Arquivos do complemento Zotero (manifest, bootstrap, locales)
├── src/
│   ├── hooks.ts            # Ciclo de vida do plugin (startup, shutdown)
│   ├── addon.ts            # Singleton do addon
│   ├── index.ts            # Entry point
│   └── modules/
│       ├── csl-manager.ts  # Instalação/atualização do estilo CSL
│       └── post-processor.ts # 18 correções de pós-processamento
├── tests/
│   └── test_csl.mjs        # Suite de testes com citeproc-js (137 testes)
├── docs/
│   ├── referencias-ufc-exemplos.md  # 138 referências do Guia UFC (imutável)
│   └── guias/              # PDFs dos guias originais da UFC
├── ufc.csl                 # Estilo CSL personalizado
└── package.json
```

### Arquitetura

O plugin opera em duas camadas:

1. **CSL (`ufc.csl`):** Estilo declarativo que cobre a maior parte da formatação ABNT/UFC. Contém 20 macros e 26 tipos de referência.

2. **Pós-processador (`post-processor.ts`):** Aplica 18 correções via monkey-patching na função `Zotero.Cite.makeFormattedBibliographyOrCitationList`. Isso é necessário porque certas regras da UFC (como subtítulo fora do negrito, en-dash → hífen em páginas, caixa alta em títulos sem autor) são impossíveis de expressar no CSL.

## Contribuição

Contribuições são bem-vindas! Para contribuir:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feat/minha-feature`)
3. Faça suas alterações
4. Execute os testes (`npm test`) e certifique-se de que todos passam
5. Faça commit seguindo a [convenção de commits](https://www.conventionalcommits.org/pt-br/v1.0.0/) do projeto
6. Abra um Pull Request

### Reportando problemas

Se uma referência não está sendo formatada corretamente:

1. Abra uma [issue](https://github.com/saviotp/ufc-zotero-plugin/issues)
2. Informe a **seção do Guia UFC** (ex: 3.1.1.1)
3. Inclua os **dados do item** no Zotero (campos preenchidos)
4. Inclua a **referência esperada** (conforme o Guia)
5. Inclua a **referência gerada** pelo plugin

## Licença

Este projeto contém dois componentes com licenças diferentes:

| Componente | Licença |
|---|---|
| Plugin (código TypeScript) | [AGPL v3](LICENSE) |
| Estilo CSL (`ufc.csl`) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

A licença **AGPL v3** é herdada do [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) de windingwind. A licença **CC BY-SA 3.0** é herdada do estilo ABNT original do [repositório Zotero Styles](https://www.zotero.org/styles).

## Créditos

- **Autor:** Sávio Teixeira Pacheco
- **Assistência de IA:** Claude Sonnet 4.6 e Claude Opus 4.6 (Anthropic)
- **Template:** [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) por windingwind
- **Toolkit:** [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit) por windingwind
- **Estilo CSL base:** Estilo ABNT do [repositório Zotero Styles](https://www.zotero.org/styles) (CC BY-SA 3.0)
- **Universidade Federal do Ceará:** [Biblioteca Universitária](https://biblioteca.ufc.br/pt/)

### Referências normativas

- [Guia de Normalização de Referências — UFC](https://biblioteca.ufc.br/wp-content/uploads/2023/12/guianormalizacaoreferencias.pdf)
- [Guia de Normalização de Citações — UFC](https://biblioteca.ufc.br/wp-content/uploads/2025/06/guianormalizacaocitacoes2025.pdf)

## Contato

Para dúvidas, sugestões ou problemas:

- **Issues:** [github.com/saviotp/ufc-zotero-plugin/issues](https://github.com/saviotp/ufc-zotero-plugin/issues)
- **Autor:** Sávio Teixeira Pacheco
