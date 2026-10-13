# Bloco a Bloco

Editor 3D pessoal para criar construções do Minecraft e exportar como `.schem` (Java, Sponge Schematic v3) e `.mcstructure` (Bedrock). Roda 100% no navegador, sem servidor.

O usuário joga **Minecraft Bedrock**, então o `.mcstructure` é o formato principal. O `.schem` é secundário.

## Como usar

Abra `dist/bloco-a-bloco.html` no Chrome ou no Edge. Esse arquivo é autossuficiente (Three.js embutido). Só as fontes vêm do Google Fonts, com fallback do sistema.

## Estrutura

```
src/app.template.html   Interface e toda a lógica do editor (CSS + JS em um arquivo)
src/exporters.js        Exportadores .schem e .mcstructure, escritor NBT e ZIP mínimo (sem dependências)
data/blocks.json        Lista de blocos: [id java, nome, id bedrock, cor topo, cor lado, cor base, tipo, texturas java, texturas bedrock, cor de bioma]
data/bedrock_textures.json  Nome curto de textura Bedrock -> caminho no pacote vanilla (terrain_texture.json)
scripts/gen_blocks.js   Regera os dois arquivos de data/ a partir de minecraft-data, minecraft-assets e Mojang/bedrock-samples (precisa de internet)
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
- Tipo do bloco: 0 opaco, 1 translúcido (vidro, gelo, slime, mel), 2 recortado (folhas: buracos sem transparência parcial).
- Câmera orbital própria (botão direito gira, botão do meio ou Shift + direito move, roda dá zoom). Toque: um dedo gira, dois dedos movem e dão zoom.

## Texturas

Menu Projeto > Texturas. O usuário escolhe um pacote de recursos e os blocos passam a aparecer com as texturas dele. Sem pacote, cada bloco usa a cor média com ruído.

- Aceita pacote Bedrock (`.mcpack`, `.zip`, `.mcaddon` ou a pasta) e Java (`.zip`). O editor procura dentro do arquivo a pasta com mais texturas de bloco (`textures/blocks/` no Bedrock, `assets/minecraft/textures/block/` no Java), então um `.zip` do repositório inteiro do bedrock-samples também funciona. O ZIP é lido sem bibliotecas: só o diretório central e as entradas usadas, com `DecompressionStream`.
- Bedrock: bloco -> nome curto (`blocks.json`) -> caminho (`textures/terrain_texture.json`) -> `.png` ou `.tga`. Se o pacote trouxer os próprios `blocks.json` ou `terrain_texture.json`, eles têm prioridade sobre o mapeamento vanilla embutido. Com várias variantes, vale a primeira (exceto blocos de cogumelo, que usam a casca).
- PNG e TGA têm decodificador próprio, porque o canvas pré-multiplica o alfa. A lateral da grama do Bedrock usa o alfa como máscara da cor do bioma (`overlay_color`).
- Topo da grama e folhas recebem a cor de bioma das planícies (tabela `TINT` em `scripts/gen_blocks.js`). As mesmas cores tingem as cores médias usadas sem pacote.
- Texturas animadas usam o primeiro quadro. Todas viram um atlas (`THREE.DataTexture`, potência de 2, filtro mais próximo) com ladrilhos de 16 a 256 px. Só as texturas usadas ficam guardadas no IndexedDB, então o pacote continua carregado ao reabrir a página. Com vários pacotes, o mais recente tem prioridade e os outros completam o que faltar.

## Exportação

- `.schem`: NBT gzip, Sponge v3, DataVersion 4671 (Java 1.21.11). Folhas saem com `persistent=true`.
- `.mcstructure`: NBT little-endian sem compressão, índices na ordem X, Y, Z, versão de bloco 18090528. Segunda camada toda -1. Opção "preservar terreno" usa `minecraft:structure_void` nas células vazias.
- Nomes Bedrock vêm de `minecraft-data` (edição bedrock 1.26.51), com tabela de apelidos em `scripts/gen_blocks.js` (ex.: `bricks` vira `brick_block`, `magma_block` vira `magma`). Blocos sem equivalente Bedrock são descartados da paleta.
- No artefato do Claude os downloads só aceitam algumas extensões, então `.schem` e `.mcstructure` saem dentro de um `.zip` (gerado por `makeZip` em `src/exporters.js`).

## Não testado ainda

- Importar os arquivos dentro do jogo. Testar primeiro numa cópia criativa do mundo. Se o terreno for afetado de forma estranha, desmarcar "preservar terreno".
- A versão com Three.js via CDN (`dist/artifact.html`) em um navegador com internet.
- Texturas: testado com o pacote vanilla do Bedrock (bedrock-samples) e com as texturas vanilla do Java. Falta testar um pacote personalizado de verdade (HD, `.mcpack` baixado) e a escolha de pasta no Windows.

## Ideias para as próximas versões

1. Blocos com estado: escadas, lajes, portas, troncos deitados, com orientação (hoje só cubos inteiros, estados padrão).
2. Importar `.schem` e `.mcstructure` existentes para editar.
3. Selecionar, copiar, colar, espelhar e girar trechos.
4. Preencher região, substituir um bloco por outro e cilindro.
5. Texturas diferentes por direção (frente da fornalha, abóbora entalhada) junto com os blocos com estado.
