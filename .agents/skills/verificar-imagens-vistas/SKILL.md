---
name: verificar-imagens-vistas
description: Verifica que imagens lidas pelo Read (faixa "viewed images" e detalhe da ferramenta) carregam pelos bytes do resultado, inclusive em sessões Claude cloud, sem "Image unavailable". Use após mudar outputHasImage (WireProjection.ts, orchestrationV2.ts), workEntriesViewedImages/resolveViewedImageAsset (client-runtime work-log/presentation.ts), TimelineWorkEntryRow/TimelineWorkGroupRows (web) ou ThreadFeed/thread-work-log (mobile); também após mudar o download das imagens do SendUserFile (claudeCloud/ClaudeCloudQueryRunner.ts).
---

# Verificar imagens vistas

Com bytes no resultado, o cliente pede o asset `tool-output-image` {threadId, itemId, index}; sem bytes, cai para `media-file` pelo caminho no host. Em sessão cloud o arquivo só existe na VM remota, então o caminho sozinho dá "Image unavailable".

1. Suba `vp run dev` (skill `test-t3-app`) com dados reais. Pareie por `http://127.0.0.1:<porta>`, não `localhost` (cookie conflita com outros devs na máquina); token novo: `cd apps/server && node src/bin.ts pair --base-dir ../../.t3`.
2. Abra uma thread `claude-cloud:cse_...` em que o agente leu PNG com Read. Ache uma no banco (`.t3/userdata/statev2.sqlite`, `mode=ro`): `orchestration_events` com `stream_id` da thread e `payload_json` contendo `"type":"image"`.
3. Expanda o grupo "Worked for X" que contém as leituras (a timeline as recolhe; Ctrl+F não acha nomes de arquivo de ferramenta).
4. Esperado: cada miniatura carrega (`img.naturalWidth > 0`, `src` com `tool-output-image`), nenhum texto "Image unavailable". Abrir o detalhe do Read mostra a mesma imagem.
5. Regressão local: numa thread local com Read de imagem sem bytes (ou imagem acima de ~10 MiB), a miniatura ainda carrega pelo caminho (`media-file`).
6. Mobile: mesma thread no app (skill `test-t3-mobile`); faixa e detalhe carregam sem "Image unavailable".

7. SendUserFile em sessão cloud: peça ao agente que envie 2 prints. O servidor baixa cada arquivo (`/api/oauth/files/{uuid}/content`) e anexa as imagens ao `tool_result`; a faixa mostra um print por arquivo, cada um com seu `index` (0, 1…). Só entra se todos os arquivos forem imagem suportada, até 8 e dentro do limite de bytes; caso contrário, nenhum print (e um aviso no log se o download falhar). Teste rápido sem gastar uso: `vp test run apps/server/src/claudeCloud/ClaudeCloudQueryRunner.test.ts packages/client-runtime/src/work-log/presentation.test.ts`.

Falha típica: miniatura quebrada só em cloud → `outputHasImage` não chegou ao cliente (projeção ou schema do contrato) ou o `itemId` não foi repassado a `resolveViewedImageAsset`.
