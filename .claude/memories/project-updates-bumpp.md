---
name: project-releases-bumpp
description: Sistema de releases configurado — bumpp + release.yml com tag fixa "release" para update.json.
type: project
---

## Sistema de releases — CONFIGURADO

**Componentes:**
1. `bumpp` (devDependency) + `bump.config.ts` — versionamento interativo
2. `release.yml` — 2 releases por tag: versionada (.xpi) + fixa "release" (update.json)
3. `update.json` habilitado no scaffold — gerado automaticamente no build

**Fluxo:**
```
npm run release → bumpp (bump + commit + tag + push) → release.yml → 2 releases no GitHub
```

**URLs no build:**
- `manifest.json` → `update_url: .../releases/download/release/update.json` (fixo)
- `update.json` → `update_link: .../releases/download/vX.Y.Z/ufc-abnt.xpi` (versionado)

**Why:** Automatiza o processo de release e permite que o Zotero detecte atualizações automaticamente.
**How to apply:** Para publicar nova versão, basta rodar `npm run release` e seguir o prompt interativo.
