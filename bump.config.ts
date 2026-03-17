/**
 * bump.config.ts — Configuração do Bumpp (versionamento de releases)
 *
 * O Bumpp automatiza o ciclo de release:
 *   1. Pergunta qual tipo de bump (major/minor/patch)
 *   2. Atualiza a versão no package.json
 *   3. Cria um commit com mensagem padronizada
 *   4. Cria uma tag git (vX.Y.Z)
 *   5. Faz push do commit + tag para o GitHub
 *
 * O push da tag dispara o workflow release.yml, que:
 *   - Roda os testes
 *   - Builda o .xpi
 *   - Cria a Release no GitHub com .xpi + update.json
 *
 * Uso: npm run release
 */

import { defineConfig } from "bumpp";

export default defineConfig({
  // Pergunta ao usuário qual tipo de bump fazer.
  // Opções: major (1.0.0), minor (0.2.0), patch (0.1.1), etc.
  release: "prompt",

  // Pede confirmação antes de executar o bump.
  // Exibe a versão atual e a nova para o usuário confirmar.
  confirm: true,

  // Mensagem de commit segue a convenção do projeto (tipo chore).
  // O %s é substituído pela nova versão (ex: "0.2.0").
  commit: "chore(release): publish v%s",

  // Formato da tag git. O %s é substituído pela versão.
  // Deve bater com o trigger do release.yml ("v*").
  tag: "v%s",

  // Push automático do commit + tag para o remote.
  // É isso que dispara o workflow de release no GitHub.
  push: true,

  // Não pular hooks de pre-commit.
  // Se houver hooks configurados, eles devem rodar normalmente.
  noVerify: false,

  // Arquivos onde a versão será atualizada.
  // O package.json é atualizado automaticamente pelo bumpp.
  // Se houver outros arquivos com versão hardcoded, listar aqui.
  files: ["package.json"],
});
