/**
 * zotero-plugin.config.ts — Configuração do zotero-plugin-scaffold
 *
 * Este arquivo diz ao scaffold COMO construir o plugin:
 *   - Qual é o nome, ID e versão do plugin
 *   - Quais placeholders substituir nos arquivos
 *   - Quais arquivos incluir no .xpi final
 *   - Como configurar o ESBuild para transpilação
 *
 * O scaffold lê este arquivo e executa o pipeline:
 *   1. ESBuild: src/index.ts → addon/content/index.js
 *   2. Substituição: __addonName__ → "UFC-ABNT" em todos os arquivos
 *   3. Empacotamento: addon/ + styles/ → build/ufc-zotero-plugin.xpi
 */

import { defineConfig } from "zotero-plugin-scaffold";

export default defineConfig({
  // ─── Source (prefixos de diretório) ─────────────────────
  //
  // O scaffold usa `source` para duas coisas:
  //   1. Saber onde o ESBuild procura arquivos TypeScript
  //   2. Remover prefixos de caminho ao copiar assets para o build
  //
  // Quando copia assets, o scaffold faz:
  //   caminho_original.replace(source, "") → caminho_no_build
  //
  // Sem isso, "addon/bootstrap.js" viraria "addon/addon/bootstrap.js"
  // no build (porque o destino já é .scaffold/build/addon/).
  //
  // Listamos todos os diretórios-fonte que serão copiados:
  //   "src"    → fontes TypeScript (ESBuild)
  //   "addon"  → arquivos estáticos do plugin (bootstrap, prefs, locales)
  //   "styles" → CSL embutido
  source: ["src", "addon", "styles"],
  // ─── Identificação do plugin ──────────────────────────────
  //
  // name: Nome legível que aparece no gerenciador de extensões do Zotero.
  name: "UFC-ABNT",

  // id: Identificador único no formato email-like.
  // O Gecko/Zotero usa isso para distinguir plugins instalados.
  // Deve ser único no mundo — por isso usa-se um domínio reverso
  // ou email. Este ID é escrito no manifest.json como "addonID".
  id: "ufc-zotero-plugin@saviotp",

  // namespace: Prefixo curto usado para:
  //   - chrome:// URLs (chrome://ufc-zotero-plugin/content/...)
  //   - Preferências (extensions.ufc-zotero-plugin.*)
  //   - Referências no bootstrap.js (Zotero.__addonRef__)
  // Sem espaços, sem caracteres especiais, lowercase.
  namespace: "ufc-zotero-plugin",

  build: {
    // ─── ESBuild ──────────────────────────────────────────────
    //
    // O ESBuild transpila TypeScript → JavaScript e faz bundling.
    // Configuramos o entry point (onde começa) e o target (para qual
    // versão do JS compilar).
    // ─── Define (substituição de placeholders) ─────────────
    //
    // O scaffold procura padrões __chave__ em todos os arquivos
    // dentro de addon/ e substitui pelo valor aqui definido.
    // Exemplo: __addonRef__ → "ufc-zotero-plugin"
    //
    // Essas substituições acontecem DEPOIS de copiar os assets
    // para o diretório de build, então os arquivos originais
    // em addon/ não são modificados.
    define: {
      addonName: "UFC-ABNT",
      addonID: "ufc-zotero-plugin@saviotp",
      addonRef: "ufc-zotero-plugin",
      buildVersion: "{{version}}",
      author: "Sávio Teixeira Pacheco",
      homepage: "https://github.com/saviotp/ufc-zotero-plugin",
      description: "Plugin para Zotero 8 — Referências UFC/ABNT",
      updateURL:
        "https://github.com/saviotp/ufc-zotero-plugin/releases/download/release/update.json",
    },

    esbuildOptions: [
      {
        // Entry point: o arquivo que o ESBuild processa primeiro.
        // A partir dele, o ESBuild segue os imports e inclui tudo
        // que é necessário em um único arquivo de saída.
        entryPoints: ["src/index.ts"],

        // Onde o arquivo compilado é gerado.
        // O bootstrap.js carrega via Services.scriptloader.loadSubScript().
        outdir: "addon/content",

        // IIFE (Immediately Invoked Function Expression):
        // loadSubScript() não suporta ES modules — precisa de IIFE.
        // O código é encapsulado em (function() { ... })() e executa
        // imediatamente quando carregado, registrando Zotero.__addonInstance__.
        format: "iife" as const,

        // Alvo: Firefox 115 (Gecko 115) = base do Zotero 8.
        target: "firefox115",

        // Bundle: junta todos os imports em um único arquivo.
        // Sem isso, cada arquivo .ts geraria um .js separado e
        // o Zotero teria que carregar múltiplos arquivos.
        bundle: true,

        // External: NÃO incluir o toolkit no bundle.
        // O toolkit é carregado separadamente pelo Zotero.
        external: ["zotero-plugin-toolkit"],
      },
    ],

    // ─── Preferências ─────────────────────────────────────────
    //
    // O scaffold processa o arquivo prefs.js, substituindo
    // __addonRef__ pelo namespace. O prefix define o prefixo
    // das chaves de preferência no sistema do Gecko.
    prefs: {
      prefix: "extensions.ufc-zotero-plugin",
      prefixPrefKeys: true,
    },

    // ─── Fluent (i18n) ────────────────────────────────────────
    //
    // O scaffold processa arquivos .ftl de tradução.
    // prefixFluentMessages: adiciona prefixo às mensagens para
    // evitar colisão com outros plugins.
    // prefixLocaleFiles: renomeia os arquivos .ftl com prefixo.
    // O scaffold pode prefixar IDs Fluent para evitar colisão entre
    // plugins. Desabilitamos porque nossos IDs (pref-*, startup-*)
    // já são específicos o suficiente, e o prefixo causa warnings
    // quando o scaffold não consegue renomear os IDs no XHTML.
    fluent: {
      prefixFluentMessages: false,
      prefixLocaleFiles: true,
    },

    // ─── Manifest ─────────────────────────────────────────────
    //
    // O scaffold gera o manifest.json final a partir de um template.
    // Ele substitui placeholders como __addonName__, __addonID__,
    // __buildVersion__ pelos valores reais.
    makeManifest: {
      enable: true,
      template: {
        manifest_version: 2,
        name: "__addonName__",
        version: "__buildVersion__",
        description: "Plugin para Zotero 8 — Referências UFC/ABNT",
        applications: {
          zotero: {
            id: "__addonID__",
            update_url: "__updateLink__",
            strict_min_version: "6.999",
            strict_max_version: "8.*",
          },
        },
      },
    },

    // Gera update.json para atualizações automáticas no Zotero.
    // O Zotero consulta este arquivo periodicamente para verificar
    // se há versões novas. O scaffold preenche a versão e o link
    // de download automaticamente a partir dos valores em `define`.
    makeUpdateJson: {
      enable: true,
    },

    // ─── Assets ───────────────────────────────────────────────
    //
    // Glob pattern dos arquivos a incluir no .xpi final.
    // O padrão "addon/**/*.*" copia tudo de addon/ para o pacote.
    // Adicionamos styles/ para incluir o CSL embutido.
    assets: ["addon/**/*.*", "styles/**/*.*"],
  },
});
