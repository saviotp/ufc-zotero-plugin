---
name: kanban
description: Estado atual do projeto — o que foi feito, o que está em andamento e o que será feito. Atualizar ao atingir 90% do limite de sessão ou quando auto-compact estiver iminente.
type: project
---

## Feito

### Fase 1+2: CSL — CONCLUÍDA
- Extração de 138 referências do PDF → `docs/referencias-ufc-exemplos.md`
- Validação e correção do `ufc.csl` — 7/13 testes passando (6 gaps requerem pós-processamento)

### Fase 3: Scaffolding — CONCLUÍDA
- Todos os arquivos do plugin criados (bootstrap, hooks, addon, index, prefs, locales, XHTML)
- Build gera `.xpi` válido
- `zotero-plugin.config.ts`, `.gitignore`, dependências configuradas

### Fase 4: Pós-processamento + testes — CONCLUÍDA
- 18 funções de pós-processamento implementadas
- 137/137 testes passando (138 referências − 1 duplicata)
- 67 seções do guia UFC cobertas
- `post-processor.ts` sincronizado com `test_csl.mjs`

### Fase 5: CI — CONCLUÍDA
- Workflow de integração contínua: `.github/workflows/ci.yml`
- Workflow de release automático: `.github/workflows/release.yml`
- `update.json` habilitado no `zotero-plugin.config.ts`

### Documentação — CONCLUÍDA
- `README.md` completo com guia de uso
- `LICENSES.md` explicando AGPL v3 (plugin) + CC BY-SA 3.0 (CSL)
- `package.json` com autor, licença, descrição, keywords

## A fazer
- **Fase 6:** Configurar bumpp para versionamento semântico automatizado
- **Fase 6:** Testar fluxo completo de release (tag → build → .xpi no GitHub Releases)
- Avaliar se `post-processor.ts` precisa de ajustes finais antes do primeiro release

## Decisões de design (acumuladas)
- **Mapeamento UFC → CSL padronizado:** cada tipo de referência UFC tem UM tipo CSL definido; não mudar sem justificativa
- **Trabalho não publicado (3.4.2.5):** usa `type: "thesis"` (único tipo que coloca ano após título)
- **Resenha em blog (3.14.4):** usa `type: "chapter"` + pós-processamento (opção A — aceita gap do CSL e corrige)
- **Artigos definidos/indefinidos:** fixFilmTitleCase e fixContainerTitleCase tratam O, A, OS, AS, UM, UMA, UNS, UMAS como artigos que acompanham a próxima palavra em MAIÚSCULAS
- **Apóstrofos:** citeproc-js converte `'` → `'` (U+2019); normalizamos de volta para ASCII no htmlToMarkdown
- **Ano duplicado em teses:** é proposital na ABNT (submissão + defesa); `original-date` no CSL permite diferenciar
- **Evento em periódico (3.4.1.3):** tipo `book` com volume+edition → bold no título + fixEventJournalBold para bold no periódico (via note)
- **Parte de tese (3.1.2.3/3.1.2.4):** tipo `chapter` com `genre` → ativa branch condicional que renderiza em formato tese
- **Certidão (3.7.1/3.7.2):** tipo `document` com publisher-place="Registro em" → fixCertidaoDate converte vírgula em dois-pontos
- **Redes sociais (3.13.4):** tipo `post` — note=local, container-title=plataforma (@handle)
- **Listas de discussão (3.13.2):** tipo `dataset` sem título — email como URL
- **Coleções de periódicos (3.3.1-4):** tipo `periodical`, título em CAPS, note carrega "datas. ISSN"
- **Jurisprudência (3.6.3/3.6.4):** legal_case com 3 branches (publisher, URL, else)
