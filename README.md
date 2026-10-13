# Bloco a Bloco

Editor 3D pessoal para criar construções do Minecraft e exportar como `.schem` (Java, Sponge Schematic v3) e `.mcstructure` (Bedrock). Roda 100% no navegador, sem servidor.

O usuário joga **Minecraft Bedrock**, então o `.mcstructure` é o formato principal. O `.schem` é secundário.

## Como usar

Site: https://mooncake-cmd.github.io/Bloco-a-Bloco/ (GitHub Pages, publicado pelo fluxo `.github/workflows/pages.yml` a cada envio para a `main`; precisa do repositório público e de Settings > Pages > Source: GitHub Actions). Cada navegador guarda a própria construção e o próprio pacote de texturas; para levar uma construção para outro aparelho, use Projeto > Salvar projeto e Abrir projeto.

Também dá para abrir `dist/bloco-a-bloco.html` direto no Chrome ou no Edge. Esse arquivo é autossuficiente (Three.js embutido). Só as fontes vêm do Google Fonts, com fallback do sistema.

## Estrutura

```
src/app.template.html   Interface e toda a lógica do editor (CSS + JS em um arquivo)
src/exporters.js        Exportadores .schem e .mcstructure, escritor NBT e ZIP mínimo (sem dependências)
data/blocks.json        Lista de blocos: [id java, nome, id bedrock, cor topo, cor lado, cor base, tipo, texturas java, texturas bedrock, cor de bioma, estado java, estado bedrock]
data/bedrock_textures.json  Nome curto de textura Bedrock -> caminho no pacote vanilla (terrain_texture.json)
data/shapes.json        Blocos que não são cubos: modelos e blockstates Java, propriedades, tabela Java -> Bedrock, texturas
src/shapes.js           Formas no editor: modelo do estado, conexões pelos vizinhos, colocação, exportação
src/import.js           Importação de .mcstructure e .schem (leitor de NBT e correspondência de blocos)
scripts/gen_blocks.js   Regera blocks.json e bedrock_textures.json a partir de minecraft-data, minecraft-assets e Mojang/bedrock-samples (precisa de internet)
scripts/gen_shapes.js   Regera shapes.json (minecraft-assets 26.1, minecraft-data Java 1.21.11 e blocksJ2B do Bedrock 1.26)
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

- O mundo é um `Uint32Array` (0 = vazio; bits 0 a 11 = índice do bloco + 1; acima, o estado), indexado por `(y * SZ + z) * SX + x`. Tamanho padrão 32 x 32 x 32. Sem limite por lado (até 2048); o limite é de 64 milhões de células (256 MB), ex.: 400 x 400 x 400. Em espaços grandes, os pedaços da malha são refeitos aos poucos (até 25 ms por quadro), e o salvamento automático avisa se a construção não couber no armazenamento do navegador.
- Renderização em chunks de 16 x 16 x 16 com remoção de faces ocultas, oclusão ambiente por vértice e textura de ruído. Só os chunks alterados são refeitos.
- Alvo do mouse: varredura de voxels (DDA) mais interseção com o plano do chão ou da camada ativa.
- Desfazer e refazer guardam lotes de alterações `[índice, valorAntigo, valorNovo]`. Um traço de pincel é um lote.
- Salvamento automático no `localStorage` (RLE + paleta por nome Java). Projeto também pode ser salvo e aberto em `.json`.
- Texturas por face na ordem [cima, baixo, norte, sul, leste, oeste]. As do Java saem do modelo do bloco no estado exportado (cadeia de `parent`, rotação `x`/`y` do blockstate); as do Bedrock, do `blocks.json` vanilla.
- Direção: o mundo guarda em cada célula o índice do bloco + 1 (bits 0 a 11) e a direção (bits 12 a 15, índice na lista `ori.o` do bloco). 78 blocos giram: os com frente (fornalha, defumador, alto-forno, abóbora entalhada, lanterna de abóbora, dispensador, liberador, observador, crafter, tear, colmeia, ninho de abelha, estante entalhada, barril, terracota esmaltada) e os com eixo (troncos, madeiras, caules, colunas, basalto, feno, osso, ardósia profunda, luzes de sapo, bloco de bambu). O gerador acha a propriedade Java (`facing`, `axis`, `orientation`) e o estado Bedrock equivalente (`minecraft:cardinal_direction`, `direction`, `facing_direction`, `minecraft:facing_direction`, `pillar_axis`, `orientation`).
- Para cada direção, o gerador usa o blockstate Java (modelo, rotação `x`/`y`, `uvlock`) para saber de qual face do modelo vem cada face do mundo e quantos quartos de volta a textura gira nela (convenção do Minecraft: nas laterais o alto da imagem é +Y, no topo é o norte, embaixo é o sul; mais a `rotation` das faces do modelo, como na terracota esmaltada). As texturas Bedrock dos blocos com frente estão na tabela `DIR` na mesma posição do modelo Java (frente para o norte) e giram igual.
- Ao colocar, a frente fica virada para quem coloca (o observador olha para longe, como no jogo; dispensador, liberador, barril e observador também apontam para cima e para baixo) e os blocos com eixo seguem a face clicada. A ferramenta Girar (T) passa para a próxima direção; com Shift, para a anterior. Direção inicial (sem pista de câmera, projetos antigos, exemplo): frente para o sul nos blocos com frente, barril de pé, o padrão do Java nos demais.
- Exportação: `facing=…`/`axis=…`/`orientation=…` no `.schem`; no `.mcstructure`, os estados padrão completos do minecraft-data com o estado da direção trocado e a versão de esquema correspondente. No projeto salvo, a direção vai na paleta quando não é a inicial (ex.: `furnace[facing=east]`).
- Tipo do bloco: 0 opaco, 1 translúcido (vidro, gelo, slime, mel), 2 recortado (folhas: buracos sem transparência parcial).
- Câmera orbital própria (botão direito gira, botão do meio ou Shift + direito move, roda dá zoom). Toque: um dedo gira, dois dedos movem e dão zoom.

## Blocos que não são cubos (formas)

Escadas, lajes, portas, alçapões, cercas, portões, muros, vidraças, barras, botões, alavancas, placas de pressão, pó de redstone, repetidor, comparador, tochas, trilhos, linha de armadilha e gancho, baús, placas, estandartes, camas, cabeças, moldura e portal do fim, plantas, flores, plantações, lanternas, correntes, bolo, bigorna, caldeirão e o resto: 738 blocos (61 são variantes de parede, escondidas da paleta). Também entram os técnicos (blocos de comando, estrutura, quebra-cabeça, vazio de estrutura, luz, rocha-mãe, água, lava, cabeça de pistão) e 11 blocos que só existem no Bedrock (`allow`, `deny`, `border_block`, `camera`, `glowingobsidian`, `netherreactor`, `invisible_bedrock`, `chemical_heat`, `hard_glass`, `hard_glass_pane`, `underwater_torch`), na categoria "Técnicos e só Bedrock". Ficam de fora só ar, barreira, gerador de monstros, cofre, blocos de teste e as estátuas de golem de cobre. Fornalha, defumador, alto-forno, lâmpada de redstone e âncora de renascimento saíram da lista de cubos e viraram formas, para poder acender (Usar) e carregar a âncora.

- **Só Bedrock** (`bo` em `scripts/gen_shapes.js`): cubos com a textura do pacote vanilla do Bedrock (os 4 da Education Edition usam cor média ou a textura do vidro/tocha), ou a forma de um bloco Java parecido com outra textura (`border_block` como muro, `hard_glass_pane` como vidraça, `underwater_torch` como tocha). Exportam normalmente no `.mcstructure` e ficam de fora do `.schem`, com aviso na tela de exportação.
- Bloco de comando e de estrutura saem sem comando/configuração (sem dados de entidade). Luz e vazio de estrutura aparecem como marcadores pequenos; água e lava como bloco translúcido.

- **Desenho**: o modelo Java do estado (variantes ou multipart do blockstate, cadeia de `parent`, elementos com `from`/`to`, `uv`, `rotation` da face e do elemento, `cullface`, `tintindex`, rotação `x`/`y` do blockstate). `uvlock` é ignorado. Blocos que o jogo desenha como entidade (baú, placa, estandarte, cama, cabeça, caixa de shulker, portal do fim) têm uma geometria simples própria em `entityGeometry` (`scripts/gen_shapes.js`); o baú usa a textura de entidade com o desdobramento do modelo do jogo.
- **Estado da célula**: o mundo agora é `Uint32Array`; acima dos 12 bits do bloco fica o índice das propriedades guardadas (base mista, `stateIndex`). Cada propriedade Java é guardada (direção, metade, aberta, idade...), calculada pelos vizinhos (conexões de cerca, muro, vidraça, barras, pó de redstone, formato da escada, baú duplo, linha de armadilha, `in_wall` do portão, `attached` do gancho) ou fixa no padrão (`waterlogged`, `power` etc.).
- **Colocação**: como no jogo. Escada, porta, portão e cama ficam virados para onde você olha; baú, repetidor, comparador e afins ficam de frente para você; alçapão, laje e escada de cabeça para baixo dependem de clicar na metade de cima ou de baixo; tocha, placa, estandarte, cabeça e coral clicados na lateral viram a variante de parede; botão, alavanca e sino dependem da face (chão, teto, parede); placa, estandarte e cabeça no chão giram em 16 posições. Laje sobre laje igual vira laje dupla. Porta, planta alta e cama ocupam duas células, colocadas e apagadas juntas.
- **Usar (U)**: troca a primeira propriedade da lista `TOGGLE` (aberta, olho, aceso, ligada, modo, atraso, idade, pedaços do bolo, quantidade de velas...); com Shift, a segunda. **Girar (T)** passa pelas combinações de direção (`facing`, `half`, `hinge`, `type`, `face`, `axis`, `rotation`...). Porta e planta alta mudam junto com a outra metade.
- **Exportação**: estado Java completo no `.schem`. No `.mcstructure`, o nome e os estados Bedrock saem da tabela `blocksJ2B` do minecraft-data: para cada estado Bedrock, o gerador acha o menor conjunto de propriedades Java que o determina e guarda a tabela (ex.: `weirdo_direction` depende só de `facing`). Os estados que faltam vêm do padrão do Bedrock, com a versão de esquema do minecraft-data.
- **Texturas**: cada forma lista os nomes Java que usa. Para pacote Bedrock, o caminho sai de pares aprendidos dos cubos, do mesmo nome em `terrain_texture.json`, de regras (cor da vidraça, corais, caixas de shulker) e da tabela `BE_SYN`; 37 texturas raras ficam sem equivalente e usam a cor média. Texturas de entidade (baú, portal do fim) ocupam vários ladrilhos no atlas.

## Texturas

Menu Projeto > Texturas. O usuário escolhe um pacote de recursos e os blocos passam a aparecer com as texturas dele. Sem pacote, cada bloco usa a cor média com ruído.

- Aceita pacote Bedrock (`.mcpack`, `.zip`, `.mcaddon` ou a pasta) e Java (`.zip`). O editor procura dentro do arquivo a pasta com mais texturas de bloco (`textures/blocks/` no Bedrock, `assets/minecraft/textures/block/` no Java), então um `.zip` do repositório inteiro do bedrock-samples também funciona. O ZIP é lido sem bibliotecas: só o diretório central e as entradas usadas, com `DecompressionStream`.
- Bedrock: bloco -> nome curto (`blocks.json`) -> caminho (`textures/terrain_texture.json`) -> `.png` ou `.tga`. Se o pacote trouxer os próprios `blocks.json` ou `terrain_texture.json`, eles têm prioridade sobre o mapeamento vanilla embutido. Com várias variantes, vale a primeira (exceto blocos de cogumelo, que usam a casca).
- PNG e TGA têm decodificador próprio, porque o canvas pré-multiplica o alfa. A lateral da grama do Bedrock usa o alfa como máscara da cor do bioma (`overlay_color`).
- Topo da grama e folhas recebem a cor de bioma das planícies (tabela `TINT` em `scripts/gen_blocks.js`). As mesmas cores tingem as cores médias usadas sem pacote.
- Texturas animadas usam o primeiro quadro. Todas viram um atlas (`THREE.DataTexture`, potência de 2, filtro mais próximo) com ladrilhos de 16 a 256 px. Só as texturas usadas ficam guardadas no IndexedDB, então o pacote continua carregado ao reabrir a página. Com vários pacotes, o mais recente tem prioridade e os outros completam o que faltar.

## Importação

Projeto > Abrir projeto ou estrutura… aceita `.json` (projeto), `.mcstructure` e `.schem` (Sponge v2 e v3; o `.schematic` antigo do MCEdit não).

- **.schem**: cada entrada da paleta (`minecraft:oak_stairs[facing=east,...]`) vira o bloco do editor com as propriedades guardadas; as calculadas pelos vizinhos são recalculadas.
- **.mcstructure**: para cada entrada da paleta, os blocos do editor com o mesmo nome Bedrock são testados em todos os estados guardados, usando a mesma tabela da exportação; ganha o que bate com mais estados e, no empate (o Bedrock não guarda tudo, ex.: botão no chão), o mais perto do padrão. `structure_void` vira vazio. A cor da cama vem de `block_position_data` (a exportação agora grava esse dado).
- Ida e volta (exportar e importar de novo) testada: idêntica nos dois formatos, com escadas, portas, redstone, cercas, camas e cubos girados.
- O espaço passa a ter o tamanho da estrutura (sem cortar), respeitando o limite de células. Limites: nomes antigos (antes da 1.13 no Java, ou nomes Bedrock antigos como `wool` com estado de cor) ficam de fora, com aviso; conteúdo de baús, texto de placas e comandos não são importados; a segunda camada do `.mcstructure` (água dentro do bloco) é ignorada.

## Exportação

- `.schem`: NBT gzip, Sponge v3, DataVersion 4671 (Java 1.21.11). Folhas saem com `persistent=true`.
- `.mcstructure`: NBT little-endian sem compressão, índices na ordem X, Y, Z, versão de bloco 18090528. Segunda camada toda -1. Opção "preservar terreno" usa `minecraft:structure_void` nas células vazias.
- Nomes Bedrock vêm de `minecraft-data` (edição bedrock 1.26.51), com tabela de apelidos em `scripts/gen_blocks.js` (ex.: `bricks` vira `brick_block`, `magma_block` vira `magma`). Blocos sem equivalente Bedrock são descartados da paleta.
- No artefato do Claude os downloads só aceitam algumas extensões, então `.schem` e `.mcstructure` saem dentro de um `.zip` (gerado por `makeZip` em `src/exporters.js`).

## Não testado ainda

- Formas no jogo, principalmente no Bedrock: blocos com entidade (baú, placa, cama, estandarte, cabeça) saem sem os dados de entidade no `.mcstructure`; o jogo costuma criar os padrões, mas vale conferir. Baús lado a lado aparecem duplos no Java (`type=left/right`); no Bedrock o par depende da entidade e pode sair como dois baús simples.
- O clique numa forma acerta a célula inteira (o alvo não segue o formato da laje ou da escada).

- Importar os arquivos dentro do jogo. Testar primeiro numa cópia criativa do mundo. Se o terreno for afetado de forma estranha, desmarcar "preservar terreno".
- A versão com Three.js via CDN (`dist/artifact.html`) em um navegador com internet.
- Direções no jogo, principalmente no Bedrock. Os mais duvidosos: observador (se `minecraft:facing_direction` é o lado do rosto, como o `facing` do Java), terracota esmaltada (se o padrão gira igual ao Java para o mesmo `facing_direction`) e crafter.
- Texturas: testado com o pacote vanilla do Bedrock (bedrock-samples) e com as texturas vanilla do Java. Falta testar um pacote personalizado de verdade (HD, `.mcpack` baixado) e a escolha de pasta no Windows.

## Ideias para as próximas versões

1. Geometria real de cama, placa, estandarte e cabeça (hoje são caixas simples) e baú duplo sem a emenda no meio.
2. Importar `.schem` e `.mcstructure` existentes para editar.
3. Selecionar, copiar, colar, espelhar e girar trechos.
4. Preencher região, substituir um bloco por outro e cilindro.
5. Crafter apontando para cima e para baixo (hoje só as 4 direções horizontais).
