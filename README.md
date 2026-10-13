# Bloco a Bloco

Editor 3D pessoal para criar construções do Minecraft e exportar como `.schem` (Java, Sponge Schematic v3) e `.mcstructure` (Bedrock). Roda 100% no navegador, sem servidor.

O usuário joga **Minecraft Bedrock**, então o `.mcstructure` é o formato principal. O `.schem` é secundário.

## Como usar

Abra `dist/bloco-a-bloco.html` no Chrome ou no Edge. Esse arquivo é autossuficiente (Three.js embutido). Só as fontes vêm do Google Fonts, com fallback do sistema.

## Estrutura

```
src/app.template.html   Interface e toda a lógica do editor (CSS + JS em um arquivo)
src/exporters.js        Exportadores .schem e .mcstructure, escritor NBT e ZIP mínimo (sem dependências)
data/blocks.json        Lista de blocos: [id java, nome, id bedrock, cor topo, cor lado, cor base, transparente?]
scripts/gen_blocks.js   Regera data/blocks.json a partir de minecraft-data e minecraft-assets
scripts/build.js        Junta template + exportadores + blocos e gera os dois HTML em dist/
tests/test_export.js    Gera um .schem e um .mcstructure e lê os dois de volta com prismarine-nbt
dist/bloco-a-bloco.html Versão local (Three.js embutido), downloads diretos
dist/artifact.html      Versão para publicar como artefato do Claude (Three.js via CDN)
```

## Comandos

```
npm install
npm run blocks   # opcional: regenera data/blocks.json
npm run build    # gera dist/*.html
npm test         # valida os exportadores
```

## Como o editor funciona

- O mundo é um `Uint16Array` (0 = vazio, n = índice do bloco + 1), indexado por `(y * SZ + z) * SX + x`. Tamanho padrão 32 x 32 x 32, até 128 por lado.
- Renderização em chunks de 16 x 16 x 16 com remoção de faces ocultas, oclusão ambiente por vértice e textura de ruído. Só os chunks alterados são refeitos.
- Alvo do mouse: varredura de voxels (DDA) mais interseção com o plano do chão ou da camada ativa.
- Desfazer e refazer guardam lotes de alterações `[índice, valorAntigo, valorNovo]`. Um traço de pincel é um lote.
- Salvamento automático no `localStorage` (RLE + paleta por nome Java). Projeto também pode ser salvo e aberto em `.json`.
- Câmera orbital própria (botão direito gira, botão do meio ou Shift + direito move, roda dá zoom). Toque: um dedo gira, dois dedos movem e dão zoom.

## Exportação

- `.schem`: NBT gzip, Sponge v3, DataVersion 4671 (Java 1.21.11). Folhas saem com `persistent=true`.
- `.mcstructure`: NBT little-endian sem compressão, índices na ordem X, Y, Z, versão de bloco 18090528. Segunda camada toda -1. Opção "preservar terreno" usa `minecraft:structure_void` nas células vazias.
- Nomes Bedrock vêm de `minecraft-data` (edição bedrock 1.26.51), com tabela de apelidos em `scripts/gen_blocks.js` (ex.: `bricks` vira `brick_block`, `magma_block` vira `magma`). Blocos sem equivalente Bedrock são descartados da paleta.
- No artefato do Claude os downloads só aceitam algumas extensões, então `.schem` e `.mcstructure` saem dentro de um `.zip` (gerado por `makeZip` em `src/exporters.js`).

## Não testado ainda

- Importar os arquivos dentro do jogo. Testar primeiro numa cópia criativa do mundo. Se o terreno for afetado de forma estranha, desmarcar "preservar terreno".
- A versão com Three.js via CDN (`dist/artifact.html`) em um navegador com internet.

## Ideias para as próximas versões

1. Blocos com estado: escadas, lajes, portas, troncos deitados, com orientação (hoje só cubos inteiros, estados padrão).
2. Importar `.schem` e `.mcstructure` existentes para editar.
3. Texturas reais carregadas pelo usuário a partir do próprio resource pack (hoje são cores médias com ruído).
4. Selecionar, copiar, colar, espelhar e girar trechos.
5. Preencher região, substituir um bloco por outro e cilindro.
