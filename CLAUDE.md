# Bloco a Bloco: instruções do projeto

O usuário fala português e joga Minecraft Bedrock (o `.mcstructure` é o formato principal; `.schem` é secundário).
Visão geral técnica no `README.md`.

## Guia de uso: atualizar a cada implementação nova

O site tem um guia de uso com capturas da própria tela. Ele existe em dois lugares, com o mesmo conteúdo:

- `guia/guia.html` + `guia/img/*.jpg` no repositório. O `npm run build` gera `guia/index.html`, e o GitHub Pages publica em https://mooncake-cmd.github.io/Bloco-a-Bloco/guia/ (link no menu Projeto → "Guia de uso completo" e na janela de ajuda).
- O artefato https://claude.ai/artifact/CY1TEZmZ2aNPjwekGPXEBr (publicar com a ferramenta Artifact passando esse `url`, `guia/guia.html` como página e `guia/img/*.jpg` em `files`).

**Toda vez que uma funcionalidade nova for implementada ou uma existente mudar**, antes de dar o trabalho por concluído:

1. Atualize `guia/guia.html` (o capítulo certo, a tabela de atalhos, os números da capa e da tabela de categorias, os limites conhecidos).
2. Refaça as capturas afetadas. `scripts/guia/cap.js` refaz todas (casa de exemplo em `scripts/guia/demo.inc`, pacote de texturas do Bedrock, um `.schem` grande para a captura de importação); `scripts/guia/menu.js` refaz só menu e ajuda; `scripts/guia/mob.js`, a do celular; `scripts/guia/arvores.js`, a das árvores; `scripts/guia/agua.js`, a da água e da estante entalhada; `scripts/guia/troca.js`, as do pincel de troca; `scripts/guia/esculpir.js`, as da escultura e da simetria; `scripts/guia/regua.js`, a da régua; `scripts/guia/mundo.js`, as do mundo do jogo (com `tests/fixtures/mundo-teste.mcworld`); `scripts/guia/formas.js`, as das formas novas, do balde, das arestas e da biblioteca; `scripts/guia/andar.js`, as da primeira pessoa e da camada fantasma (os oito: url, pacote, pasta). Use o Playwright global (`PLAYWRIGHT=/opt/node22/lib/node_modules/playwright` no `menu.js`; nos outros, o caminho está no `require`).
3. Rode `npm run build`, faça o commit junto com o código e envie para a `main`.
4. Republique o artefato do guia (mesmo `url`) e mande o link atualizado para o usuário na resposta final, dizendo o que mudou no guia.
