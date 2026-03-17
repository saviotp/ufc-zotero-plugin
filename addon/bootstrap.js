// bootstrap.js — Ponto de entrada do plugin para o Zotero 8
//
// O Zotero 8 usa a arquitetura "bootstrapped extension" do Gecko/Firefox.
// Este arquivo é o PRIMEIRO código que o Zotero executa quando o plugin
// é carregado. Exporta 4 funções globais: startup, shutdown, install, uninstall.
//
// IMPORTANTE: Usa Services.scriptloader.loadSubScript() para carregar o
// código compilado. ChromeUtils.importESModule() NÃO funciona com o scheme
// "jar:" dos arquivos .xpi — o Gecko exige scheme "trusted" (resource://,
// chrome://) para ES modules.

var chromeHandle;

/**
 * startup() — Chamada quando o Zotero carrega o plugin.
 *
 * Usa loadSubScript() que:
 *   1. Aceita qualquer URI (incluindo jar: de dentro do .xpi)
 *   2. Executa o script em um contexto (ctx) que passamos
 *   3. O script compilado (IIFE) coloca o addon em Zotero.__addonRef__
 */
async function startup({ id, version, resourceURI, rootURI }, reason) {
  // Registra o esquema chrome:// para os arquivos do plugin.
  // Depois disso, chrome://ufc-zotero-plugin/content/... resolve para
  // os arquivos dentro de addon/content/.
  var aomStartup = Cc[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Ci.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "content/"],
    ["locale", "__addonRef__", "pt-BR", "locale/pt-BR/"],
    ["locale", "__addonRef__", "en-US", "locale/en-US/"],
  ]);

  // Carrega o código compilado via loadSubScript.
  // O formato IIFE (ESBuild) registra Zotero.__addonInstance__ globalmente.
  const ctx = { rootURI };
  ctx._globalThis = ctx;
  Services.scriptloader.loadSubScript(
    `${rootURI}content/index.js`,
    ctx,
  );

  // Delega o startup para o código TypeScript compilado.
  await Zotero.__addonInstance__.hooks.onStartup({ id, version, rootURI, reason });
}

/**
 * shutdown() — Chamada quando o plugin é descarregado.
 *
 * Para APP_SHUTDOWN (Zotero fechando), não limpamos nada.
 * Para outros casos, delegamos a limpeza para o TypeScript.
 */
async function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  await Zotero.__addonInstance__?.hooks.onShutdown({ id, version, rootURI, reason });

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function install(data, reason) {}

function uninstall(data, reason) {}
