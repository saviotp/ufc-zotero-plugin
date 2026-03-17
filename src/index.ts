/**
 * index.ts — Entry point do plugin (carregado pelo bootstrap.js)
 *
 * O bootstrap.js carrega este arquivo via Services.scriptloader.loadSubScript().
 * Por isso, NÃO usamos export default — o loadSubScript não suporta ES modules.
 *
 * Em vez disso, registramos o plugin globalmente em Zotero.__addonInstance__,
 * expondo o objeto hooks para que o bootstrap possa chamar onStartup/onShutdown.
 *
 * O ESBuild compila isso como IIFE (Immediately Invoked Function Expression),
 * que executa automaticamente quando o script é carregado.
 */

import { onStartup, onShutdown } from "./hooks";

// Registra a instância do plugin no namespace global do Zotero.
// O bootstrap.js acessa via Zotero.__addonInstance__.hooks.onStartup().
// @ts-expect-error — __addonInstance__ não existe nos types do Zotero
Zotero.__addonInstance__ = {
  hooks: {
    onStartup,
    onShutdown,
  },
};
