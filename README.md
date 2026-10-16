# Bloco a Bloco

Editor 3D pessoal para criar construções do Minecraft e exportar como `.schem` (Java, Sponge Schematic v3) e `.mcstructure` (Bedrock). Roda 100% no navegador, sem servidor.

O usuário joga **Minecraft Bedrock**, então o `.mcstructure` é o formato principal. O `.schem` é secundário.

## Como usar

Guia de uso com imagens: https://mooncake-cmd.github.io/Bloco-a-Bloco/guia/ (fonte em `guia/guia.html`; manter atualizado a cada implementação, ver `CLAUDE.md`).

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
src/worldio.js          Mundo do jogo (Bedrock .mcworld): leitor e gravador de LevelDB, sub-chunks, mapa, área, exportação
src/measure.js          Medidas (cotas X, Y e Z) na tela
src/world.js            Mundo em chunks esparsos com paleta, desfazer compacto, salvar no IndexedDB
src/symmetry.js         Simetria (espelho) em X, Y e Z
src/sculpt.js           Pincel de escultura de terreno
src/shapes2.js          Mais formas (cilindro, cone, pirâmide, cúpula, arco, arestas) e o balde (encher área fechada)
src/library.js          Biblioteca de construções (IndexedDB 'lib:'), miniatura, arquivo .biblioteca.json
src/walk.js             Primeira pessoa: pointer lock, WASD, pulo, voo, colisão 0,6 x 1,8, quebrar e colocar
src/ghost.js            Camada fantasma: blocos de uma camada de baixo, translúcidos, na altura da camada
src/history.js          Histórico em árvore: cada ação é um nó, ramos ao mudar depois de voltar, linha do tempo e versões marcadas
src/redstone.js         Redstone funcionando: pó, tochas, repetidores, comparadores, observadores, lâmpadas, portas, pistões, trilhos (tiques do jogo)
src/biome.js            Pincel de bioma: biomas por coluna (pintados e lidos do mundo), cor da grama/folhas/água pelo bioma, Transformar o terreno (receitas por bioma), placas coloridas, chave 0x2B (Data3D)
src/mixbrush.js         Pincel de mistura: 2 a 10 blocos com porcentagens (soma 100%), amostragem ponderada por voxel
src/palettes.js         Paletas: as do site editáveis (por cima de catOf) e as do usuário, no localStorage
src/maskbrush.js        Pincel de troca (pincel 3D com máscara)
src/fluids.js           Água e lava escorrendo (simulação como no Java)
src/trees.js            Árvores que crescem com Usar nas mudas (geradores por tipo)
src/selection.js        Selecionar, copiar, recortar, colar (com giro), apagar e substituir na área
scripts/gen_blocks.js   Regera blocks.json e bedrock_textures.json a partir de minecraft-data, minecraft-assets e Mojang/bedrock-samples (precisa de internet)
scripts/gen_shapes.js   Regera shapes.json (minecraft-assets 26.1, minecraft-data Java 1.21.11 e blocksJ2B do Bedrock 1.26)
data/biomes.json        89 biomas do Bedrock 1.26: id numérico, nome, nome em português, clima, cores (grama, folhas, água, mapa), dimensão, marcadores
scripts/gen_biomes.js   Regera biomes.json a partir do Mojang/bedrock-samples (BEDROCK_SAMPLES_DIR=pasta extraída)
data/leveldat-plano.dat level.dat de um mundo plano criativo gerado pelo servidor oficial 1.26.52 (modelo do mundo novo)
scripts/build.js        Junta template + exportadores + blocos e gera os dois HTML em dist/
tests/test_export.js    Gera um .schem e um .mcstructure e lê os dois de volta com prismarine-nbt
tests/test_world.js     Lê o mundo de teste (índice do LevelDB, sub-chunks, dados de blocos) e grava/relê um .log
tests/fixtures/mundo-teste.mcworld  Mundo pequeno do Bedrock para os testes e as capturas (scripts/gen_testworld.py)
scripts/gen_testworld.py  Gera o mundo de teste com o LevelDB da Mojang (pip install amulet-leveldb)
dist/bloco-a-bloco.html Versão local (Three.js embutido), downloads diretos
dist/artifact.html      Versão para publicar como artefato do Claude (Three.js via CDN)
```

## Comandos

```
npm install
npm run blocks   # opcional: regenera data/blocks.json
npm run build    # gera dist/*.html
npm test         # valida os exportadores e o leitor/gravador de mundos
```

## Como o editor funciona

- O mundo fica em chunks esparsos de 16 x 16 x 16 (`src/world.js`): um `Map` só com os chunks que têm blocos; cada chunk tem uma paleta de valores de célula e um índice por célula (`Uint8Array`, ou `Uint16Array` com mais de 256 valores); chunk de um valor só vira uniforme ao salvar. Célula = (índice do bloco + 1) + estado * 4096. Acesso por `gget(x, y, z)` / `gset(x, y, z, v)`; varreduras por `forEachBlock` e `blocksInBox`, que só passam pelos chunks ocupados. Limite de 16 384 x 4 096 x 16 384 de espaço; cerca de 1 byte por bloco em chunks cheios (134 milhões de blocos = cerca de 130 MB nos testes). Desfazer em `EditLog` (arrays tipados, 16 bytes por mudança, até 20 milhões de mudanças guardadas). Malha: só os chunks até a distância de desenho (padrão 384 blocos) do centro da câmera ficam montados (`updateView`). Salvamento automático no IndexedDB, só dos chunks que mudaram (`worldDirty`); projeto .json versão 2 por chunks (a versão 1, RLE, ainda abre). Exportação em pedaços de 64 x 384 x 64 num .zip quando a construção passa desse tamanho.
- Renderização em chunks de 16 x 16 x 16 com remoção de faces ocultas, oclusão ambiente por vértice e textura de ruído. Só os chunks alterados são refeitos.
- Alvo do mouse: varredura de voxels (DDA) mais interseção com o plano do chão ou da camada ativa.
- Desfazer e refazer guardam lotes de alterações `[índice, valorAntigo, valorNovo]`. Um traço de pincel é um lote. Os lotes formam uma árvore (`src/history.js`): cada lote é um nó filho do estado atual, então uma ação feita depois de voltar abre um ramo e o que vinha depois fica guardado. `histGoto(id)` desfaz até o ancestral comum e refaz o caminho até o nó; refazer segue o último filho visitado. O nome do nó vem de `beginBatch(rótulo)` ou da ferramenta. A árvore é gravada na mesma transação do salvamento automático (`h:meta` e `h:b:<id>`) e lida de volta ao abrir a página. Limite: os mesmos 20 milhões de mudanças e 1.000 nós; saem primeiro as folhas mais antigas fora do caminho atual (as marcadas por último), depois o começo do caminho.
- Clique na forma real (`shapeRayHit` em `src/shapes.js`): o raio de `castRay` que entra numa célula com forma é testado contra as faces do modelo (`shapeGeom`), alinhadas aos eixos; sem acerto, segue para a célula de trás. Modelos com faces giradas (plantas em X) usam a caixa que envolve todas as faces. A normal do acerto é a da face; o ponto (`pt`) vai para a colocação (laje em cima ou embaixo).
- Mapa da área do mundo: com "Destacar chunks não gerados", uma máscara de 1 pixel por chunk (`wioUngenMask`) pinta de vermelho o que não está no índice do mundo e de cinza o que está (mesmo sem sub-chunks, como o vazio do End).
- Redstone (`src/redstone.js`): depois de cada edição (`rsAfterBatch`, chamado por `endBatch`), a rede de redstone ligada às células mudadas é percorrida (componentes e os blocos sólidos encostados neles). O pó recebe a maior força direta (fontes vizinhas e blocos fortemente energizados) e perde 1 por pó numa busca em ordem de força. Lâmpadas, portas e trilhos mudam na hora; tochas, repetidores, comparadores, pistões, botões e observadores entram numa agenda em tiques do jogo (20 por segundo). A força do pó, o pistão estendido, o trilho energizado e o repetidor travado passam a ser estados guardados (`SP_EXTRA` em `src/shapes.js`, acrescentados por último para não mudar os estados já salvos). As mudanças entram no passo de desfazer que as causou (até 5.000 por passo).
- Paletas (`src/palettes.js`): as categorias de `catOf` continuam a regra; o usuário guarda por cima nome e lista de blocos (ids do Java) de cada paleta do site, as excluídas, a ordem e as próprias, em `localStorage['bloco-a-bloco-paletas']`. `palHas(id, bloco)` decide o que entra na lista.
- Salvamento automático no `localStorage` (RLE + paleta por nome Java). Projeto também pode ser salvo e aberto em `.json`.
- Texturas por face na ordem [cima, baixo, norte, sul, leste, oeste]. As do Java saem do modelo do bloco no estado exportado (cadeia de `parent`, rotação `x`/`y` do blockstate); as do Bedrock, do `blocks.json` vanilla.
- Direção: o mundo guarda em cada célula o índice do bloco + 1 (bits 0 a 11) e a direção (bits 12 a 15, índice na lista `ori.o` do bloco). 78 blocos giram: os com frente (fornalha, defumador, alto-forno, abóbora entalhada, lanterna de abóbora, dispensador, liberador, observador, crafter, tear, colmeia, ninho de abelha, estante entalhada, barril, terracota esmaltada) e os com eixo (troncos, madeiras, caules, colunas, basalto, feno, osso, ardósia profunda, luzes de sapo, bloco de bambu). O gerador acha a propriedade Java (`facing`, `axis`, `orientation`) e o estado Bedrock equivalente (`minecraft:cardinal_direction`, `direction`, `facing_direction`, `minecraft:facing_direction`, `pillar_axis`, `orientation`).
- Para cada direção, o gerador usa o blockstate Java (modelo, rotação `x`/`y`, `uvlock`) para saber de qual face do modelo vem cada face do mundo e quantos quartos de volta a textura gira nela (convenção do Minecraft: nas laterais o alto da imagem é +Y, no topo é o norte, embaixo é o sul; mais a `rotation` das faces do modelo, como na terracota esmaltada). As texturas Bedrock dos blocos com frente estão na tabela `DIR` na mesma posição do modelo Java (frente para o norte) e giram igual.
- Ao colocar, a frente fica virada para quem coloca (o observador olha para longe, como no jogo; dispensador, liberador, barril e observador também apontam para cima e para baixo) e os blocos com eixo seguem a face clicada. A ferramenta Girar (T) passa para a próxima direção; com Shift, para a anterior. Direção inicial (sem pista de câmera, projetos antigos, exemplo): frente para o sul nos blocos com frente, barril de pé, o padrão do Java nos demais.
- Exportação: `facing=…`/`axis=…`/`orientation=…` no `.schem`; no `.mcstructure`, os estados padrão completos do minecraft-data com o estado da direção trocado e a versão de esquema correspondente. No projeto salvo, a direção vai na paleta quando não é a inicial (ex.: `furnace[facing=east]`).
- Tipo do bloco: 0 opaco, 1 translúcido (vidro, gelo, slime, mel), 2 recortado (folhas: buracos sem transparência parcial).
- Seleção (`src/selection.js`, ferramenta Selecionar, V): caixa [mín, máx] marcada com dois cliques. Copiar guarda as células cruas (bloco + estado) num `Uint32Array` relativo ao canto mínimo; colar segue o mouse (centrada no ponto apontado), não sobrescreve com o ar da cópia e pode repetir. Girar a cópia (R) gira posições e estados 90° no sentido horário (`facing`, `axis`, `rotation`, trilhos, `orientation`, conexões norte/leste/sul/oeste). Substituir troca um tipo (ou todos) por outro dentro da área mantendo as propriedades em comum e pode preencher o ar. Cada operação é um lote de desfazer. A cópia fica na memória da aba e sobrevive a abrir outro projeto.
- Árvores (`src/trees.js`): Usar numa muda, propágulo, azaleia, cogumelo ou fungo chama `growAt`, que monta um plano (`TreePlan`: toras com eixo, folhas, cipós, cacau, raízes, musgo, vinhas) com um gerador por tipo que imita o do jogo, com variação aleatória. Shift faz a versão grande; 4 mudas em quadrado fazem as de tronco 2 x 2 (abeto e selva gigantes, carvalho-escuro e carvalho-pálido, que só crescem assim). O tronco precisa de espaço livre (atravessa folhas); folhas só entram no ar e em plantinhas; grama embaixo do tronco vira terra. Tudo num lote de desfazer.
- Água e lava (`src/fluids.js`): depois de cada edição, as células de fluido mudadas e vizinhas entram numa fila; a simulação segue o `FlowingFluid` do Java (nível novo pelos vizinhos, cair, espalhar para os lados na direção do buraco mais perto, fonte infinita, lava com água vira obsidiana/pedregulho/pedra) em ondas (água 100 ms, lava 450 ms). As mudanças entram no lote de desfazer do topo; desfazer/refazer param a simulação. Projeto > "Água e lava escorrem" liga e desliga (localStorage). A malha do fluido (`fluidGeom` em `src/shapes.js`) tem altura pelo nível e esconde faces entre células do mesmo fluido.
- Estante entalhada: forma com `facing` e `slot_0..5_occupied`; Usar no nicho clicado (ponto do clique na face da frente) põe ou tira o livro; Shift enche ou esvazia.
- Bloco de luz: `setRaw` mantém o conjunto das células de luz (`lightSet`); com a luz no espaço ativo da hotbar, `updateLightLabels` mostra o nível de cada uma num sprite (refeito quando muda a versão, a camada ou o bloco ativo).
- Formas: linha, caixa e caixa oca têm três cliques (`anchor`, `anchor2` e a altura); a altura vem de `heightAt`, o ponto da coluna vertical em (x, z) mais perto do raio do ponteiro. Borracha com `eraseSize` 1, 2 ou 3 (quadrado no plano da face clicada). Projeto > Preencher o chão cobre camadas inteiras do espaço.
- Pincel de troca (`src/maskbrush.js`, ferramenta M): `maskBrush(centro, raio, forma, máscara, destino)` varre a esfera (dx²+dy²+dz² ≤ (r+0,5)²) ou o cubo em volta do bloco atingido pelo raio do ponteiro e troca só as células cujo bloco é a máscara (`convertCell` mantém as propriedades em comum); ar e outros blocos ficam. As trocas entram no lote do traço (`editSet` marca os pedaços da malha); a prévia destaca os voxels que vão mudar.
- Pincel de mistura (`src/mixbrush.js`, ferramenta Q): `mixBrush(centro, raio, forma, mistura, modo, feitos)` usa o mesmo volume (`brushVolume`) e, para cada voxel aceito pelo modo (Pintar: só blocos; Superfície: só blocos com um vizinho vazio; Encher: só o vazio), sorteia o bloco com `mixSampler`: tabela acumulada das porcentagens (soma exatamente 100) e busca binária de `u·100`. O conjunto `feitos` (índices já sorteados no traço) evita sortear de novo ao arrastar. Ar na mistura apaga. A prévia pinta cada voxel com um sorteio fixo pela posição.
- Simetria (`src/symmetry.js`): `editSet` passa por `symPoints`, que gera as posições espelhadas (x' = P - x, P = dobro da posição do plano) e o estado espelhado (`mirrorCell`: lados, rotation de 16 passos, dobradiça, metade/topo no eixo Y). Desfazer e a água (que usam `setRaw`) não são espelhados.
- Esculpir terreno (`src/sculpt.js`): mapa de alturas por coluna com alturas fracionárias durante o traço; cada pincelada (clique e a cada 70 ms) aplica elevar/afundar/suavizar/aplainar com atenuação (1 - t²)² e converte as colunas de volta para voxels.
- Air (apagar): entrada extra no fim dos cubos (`AIR_BI`, categoria Técnicos); `mkCell(AIR_BI)` devolve 0, então qualquer ferramenta que põe o bloco da hotbar (pincel vira borracha, formas, preencher, pincel de troca) põe ar. Nunca fica guardado nem é exportado.
- União de faces (greedy meshing, `buildChunk`/`emitFace`): faces visíveis de cubos com sombra igual nos 4 cantos entram numa máscara por direção e camada (chave: bloco, textura de origem, giro, sombra, tipo de malha) e são fundidas em retângulos; o UV vai em unidades de bloco e o atributo `tileRect` diz o ladrilho no atlas, que o shader repete com `fract` (no WebGL2, `textureGrad` com a derivada do UV contínuo evita linhas nas emendas). Faces com sombra diferente nos cantos e as formas continuam uma a uma (formas com `tileRect` zero usam o UV do atlas direto). Sem pacote, a leve variação de cor por bloco saiu (a textura de ruído repete por bloco).
- Medidas (`src/measure.js`): cotas com setas e números em X, Z e Y da caixa da construção (`bbox`); com a Camada, X e Z dos blocos da camada (`sliceBounds`). Traços como caixas finas brancas sobre contorno escuro (sem teste de profundidade), números em sprite de tamanho fixo na tela. Refeitas quando muda a construção, a camada ou o zoom. Tecla D / Projeto > Mostrar medidas.
- Câmera orbital própria (botão direito gira, botão do meio ou Shift + direito move, roda dá zoom). Toque: um dedo gira, dois dedos movem e dão zoom.

## Blocos que não são cubos (formas)

Escadas, lajes, portas, alçapões, cercas, portões, muros, vidraças, barras, botões, alavancas, placas de pressão, pó de redstone, repetidor, comparador, tochas, trilhos, linha de armadilha e gancho, baús, placas, estandartes, camas, cabeças, moldura e portal do fim, plantas, flores, plantações, lanternas, correntes, bolo, bigorna, caldeirão e o resto: 738 blocos (61 são variantes de parede, escondidas da paleta). Também entram os técnicos (blocos de comando, estrutura, quebra-cabeça, vazio de estrutura, luz, rocha-mãe, água, lava, cabeça de pistão) e 11 blocos que só existem no Bedrock (`allow`, `deny`, `border_block`, `camera`, `glowingobsidian`, `netherreactor`, `invisible_bedrock`, `chemical_heat`, `hard_glass`, `hard_glass_pane`, `underwater_torch`), na categoria "Técnicos e só Bedrock". Ficam de fora só ar, barreira, gerador de monstros, cofre, blocos de teste e as estátuas de golem de cobre. Fornalha, defumador, alto-forno, lâmpada de redstone e âncora de renascimento saíram da lista de cubos e viraram formas, para poder acender (Usar) e carregar a âncora.

- **Só Bedrock** (`bo` em `scripts/gen_shapes.js`): cubos com a textura do pacote vanilla do Bedrock (os 4 da Education Edition usam cor média ou a textura do vidro/tocha), ou a forma de um bloco Java parecido com outra textura (`border_block` como muro, `hard_glass_pane` como vidraça, `underwater_torch` como tocha). Exportam normalmente no `.mcstructure` e ficam de fora do `.schem`, com aviso na tela de exportação.
- Bloco de comando e de estrutura saem sem comando/configuração (sem dados de entidade). Luz e vazio de estrutura aparecem como marcadores pequenos; água e lava como bloco translúcido.

- **Desenho**: o modelo Java do estado (variantes ou multipart do blockstate, cadeia de `parent`, elementos com `from`/`to`, `uv`, `rotation` da face e do elemento, `cullface`, `tintindex`, rotação `x`/`y` do blockstate). `uvlock` é ignorado. Blocos que o jogo desenha como entidade (baú, placa, estandarte, cama, cabeça, caixa de shulker, portal do fim) têm uma geometria simples própria em `entityGeometry` (`scripts/gen_shapes.js`); o baú usa a textura de entidade com o desdobramento do modelo do jogo.
- **Estado da célula**: cada célula é um inteiro de 32 bits; acima dos 12 bits do bloco fica o índice das propriedades guardadas (base mista, `stateIndex`). Cada propriedade Java é guardada (direção, metade, aberta, idade...), calculada pelos vizinhos (conexões de cerca, muro, vidraça, barras, pó de redstone, formato da escada, baú duplo, linha de armadilha, `in_wall` do portão, `attached` do gancho) ou fixa no padrão (`waterlogged`, `power` etc.).
- **Colocação**: como no jogo. Escada, porta, portão e cama ficam virados para onde você olha; baú, repetidor, comparador e afins ficam de frente para você; alçapão, laje e escada de cabeça para baixo dependem de clicar na metade de cima ou de baixo; tocha, placa, estandarte, cabeça e coral clicados na lateral viram a variante de parede; botão, alavanca e sino dependem da face (chão, teto, parede); placa, estandarte e cabeça no chão giram em 16 posições. Laje sobre laje igual vira laje dupla. Porta, planta alta e cama ocupam duas células, colocadas e apagadas juntas.
- **Usar (U)**: troca a primeira propriedade da lista `TOGGLE` (aberta, olho, aceso, ligada, modo, atraso, idade, pedaços do bolo, quantidade de velas...); com Shift, a segunda. **Girar (T)** passa pelas combinações de direção (`facing`, `half`, `hinge`, `type`, `face`, `axis`, `rotation`...). Porta e planta alta mudam junto com a outra metade.
- **Exportação**: estado Java completo no `.schem`. No `.mcstructure`, o nome e os estados Bedrock saem da tabela `blocksJ2B` do minecraft-data: para cada estado Bedrock, o gerador acha o menor conjunto de propriedades Java que o determina e guarda a tabela (ex.: `weirdo_direction` depende só de `facing`). Os estados que faltam vêm do padrão do Bedrock, com a versão de esquema do minecraft-data.
- **Texturas**: cada forma lista os nomes Java que usa. Para pacote Bedrock, o caminho sai de pares aprendidos dos cubos, do mesmo nome em `terrain_texture.json`, de regras (cor da vidraça, corais, caixas de shulker) e da tabela `BE_SYN`; 37 texturas raras ficam sem equivalente e usam a cor média. Texturas de entidade (baú, portal do fim) ocupam vários ladrilhos no atlas.

## Texturas

Menu Projeto > Texturas. A janela tem um link direto para o ZIP do Mojang/bedrock-samples (texturas padrão do Bedrock). O usuário escolhe um pacote de recursos e os blocos passam a aparecer com as texturas dele. Sem pacote, cada bloco usa a cor média com ruído.

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

## Mundo do jogo (.mcworld)

Projeto > Abrir mundo do jogo aceita o `.mcworld` exportado pelo Bedrock, um `.zip` com a pasta do mundo (em qualquer subpasta) ou um `.zip` com o `.mcworld` dentro. Tudo em `src/worldio.js`:

- **LevelDB da Mojang**: lê `CURRENT`, o `MANIFEST` (tabelas vivas, número do log, última sequência), as tabelas `.ldb` (blocos com deflate puro, tipo 4, ou zlib, tipo 2) e os `.log`. O índice guarda, para cada chave, onde está o valor mais novo; os blocos de dados são descomprimidos só quando pedidos (cache de 48 blocos). Chaves fora da borda do mundo (o jogo grava uma em −2³¹) são ignoradas.
- **Sub-chunks** (chave x, z, [dimensão], 0x2f, y; versões 8 e 9): camadas com paleta em NBT little-endian e índices empacotados em palavras de 32 bits (posição x·256 + z·16 + y). A paleta é guardada crua: blocos que o editor não conhece viram o bloco "Bloco do jogo" (`bab_preserved#n`, índice numa lista do mundo) e voltam com os bytes originais.
- **Área**: até 512 × 512, altura toda da dimensão (−64 a 319, 0 a 127, 0 a 255), alinhada a chunks. Camada 2 (água dentro do bloco) aparece quando a camada 1 está vazia. Cor da cama vem dos dados de blocos (0x31).
- **Gravação**: ao trocar de área ou exportar, cada pedaço editado é comparado, posição por posição, com o original (ou com a versão já gravada); só as posições diferentes mudam (camada 2 vira ar nelas). Dados de blocos das posições mudadas saem (camas novas ganham os seus), o mapa de alturas (0x2b, `z·16 + x`, altura − mínimo + 1) é refeito nas colunas mexidas e a soma de verificação antiga (0x3b) é apagada. Chunks não gerados pelo jogo não recebem nada.
- **Biomas** (chave 0x2B, Data3D): 512 bytes de mapa de alturas (int16, `z·16 + x`, relativo ao y mínimo) e depois um bloco por sub-chunk: `0xFF` repete o anterior, cabeçalho `1` traz um id só (int32), senão `(bits << 1) | 1`, palavras de 32 bits com os índices (posição x·256 + z·16 + y), a quantidade e os ids (int32, os números de `mojang-biomes.json`). Ao abrir uma área, o site guarda o bioma de cada coluna na altura do mapa de alturas (mostrado na barra de status e no mapa, modo Biomas). As colunas pintadas são gravadas em todas as alturas (todos os sub-chunks da coluna) ao trocar de área ou exportar.
- **Exportação**: copia as entradas do zip original sem descomprimir (só o cabeçalho é refeito, sem a pasta de cima) e acrescenta `db/NNNNNN.log` com as chaves novas (número de arquivo e sequência depois dos do banco, registros com CRC32C mascarado, lotes de até 1 MB cortados em blocos de 32 KB). O jogo aplica o log ao abrir.
- **Sessão**: o arquivo do mundo, as mudanças gravadas e a área ficam no IndexedDB (`wio:file`, `wio:patches`, `wio:meta`); o salvamento automático guarda só os pedaços editados da área (vazios incluídos), e ao recarregar a área é lida do mundo e os pedaços salvos vão por cima.
- **Validação**: o `.mcworld` exportado foi aberto com o LevelDB da Mojang (pacote `amulet-leveldb`, o mesmo código de recuperação do jogo) e comparado com o original: num mundo real de 94 mil chaves, só mudaram as posições editadas e o mapa de alturas dos dois chunks. Falta abrir no jogo.

## Exportação

- `.schem`: NBT gzip, Sponge v3, DataVersion 4671 (Java 1.21.11). Folhas saem com `persistent=true`.
- `.mcstructure`: NBT little-endian sem compressão, índices na ordem X, Y, Z, versão de bloco 18090528. Segunda camada toda -1. Opção "preservar terreno" usa `minecraft:structure_void` nas células vazias.
- Nomes Bedrock vêm de `minecraft-data` (edição bedrock 1.26.51), com tabela de apelidos em `scripts/gen_blocks.js` (ex.: `bricks` vira `brick_block`, `magma_block` vira `magma`). Blocos sem equivalente Bedrock são descartados da paleta.
- **Mundo novo** (`.mcworld`, sem mundo aberto): `level.dat` vem de `data/leveldat-plano.dat` (NBT lido e regravado com tipos, trocando nome, semente, data e nascimento); o banco sai com `CURRENT`, `MANIFEST-000002` (comparador, log 3, próximo arquivo 4) e `000003.log` com todas as chaves. Cada chunk do espaço do editor ganha os sub-chunks (chão plano de y −64 a −61: rocha-mãe, 2 terras e grama; a construção a partir de y −60), 0x2B (alturas e o bioma pintado de cada coluna, planície onde não há), 0x2C = 42 (versão do chunk), 0x36 = 2 (terminado) e 0x31 (camas). Conferido no servidor 1.26.52: blocos, estados e biomas no lugar.
- No artefato do Claude os downloads só aceitam algumas extensões, então `.schem` e `.mcstructure` saem dentro de um `.zip` (gerado por `makeZip` em `src/exporters.js`).

## Não testado ainda

- Abrir no jogo um `.mcworld` exportado pelo site (validado só com o LevelDB da Mojang). Baú colocado pelo site num mundo entra sem dados de entidade (o jogo costuma criar).
- Formas no jogo, principalmente no Bedrock: blocos com entidade (baú, placa, cama, estandarte, cabeça) saem sem os dados de entidade no `.mcstructure`; o jogo costuma criar os padrões, mas vale conferir. Baús lado a lado aparecem duplos no Java (`type=left/right`); no Bedrock o par depende da entidade e pode sair como dois baús simples.
- O clique numa forma acerta a célula inteira (o alvo não segue o formato da laje ou da escada).

- Importar os arquivos dentro do jogo. Testar primeiro numa cópia criativa do mundo. Se o terreno for afetado de forma estranha, desmarcar "preservar terreno".
- A versão com Three.js via CDN (`dist/artifact.html`) em um navegador com internet.
- Direções no jogo, principalmente no Bedrock. Os mais duvidosos: observador (se `minecraft:facing_direction` é o lado do rosto, como o `facing` do Java), terracota esmaltada (se o padrão gira igual ao Java para o mesmo `facing_direction`) e crafter.
- Texturas: testado com o pacote vanilla do Bedrock (bedrock-samples) e com as texturas vanilla do Java. Falta testar um pacote personalizado de verdade (HD, `.mcpack` baixado) e a escolha de pasta no Windows.

## Ideias para as próximas versões

1. Geometria real de cama, placa, estandarte e cabeça (hoje são caixas simples) e baú duplo sem a emenda no meio.
2. Importar `.schem` e `.mcstructure` existentes para editar.
3. Espelhar a cópia (girar 90° já existe) e copiar para a área de transferência do sistema, para levar entre abas.
4. Cilindro (preencher e substituir já existem na seleção).
5. Crafter apontando para cima e para baixo (hoje só as 4 direções horizontais).

## Teste com o servidor oficial do Bedrock (opcional)

`scripts/bds/` confere o site contra o jogo usando o Bedrock Dedicated Server (Linux, baixado de minecraft.net; não vai no repositório). Roda sem conta: em `server.properties`, `online-mode=false`, `allow-list=false`, `transport=nethernet` (o raknet precisa de IPv6) e `allow-cheats=true`; o console recebe comandos pela entrada padrão (`(sleep 30; cat comandos.txt; sleep 10; echo stop) | LD_LIBRARY_PATH=. ./bedrock_server`).

1. O servidor gera um mundo (`tickingarea add 0 0 0 95 0 95 gen` força a geração em volta do 0,0); a pasta do mundo, zipada, vira `.mcworld`.
2. `node scripts/bds/site.js <url do editor> <mundo.mcworld> <pasta>` abre o mundo no site, constrói blocos com estados e circuitos de redstone em y = 100, exporta desligado e ligado (`editado-off/on.mcworld`) e grava os `setblock` que ligam as alavancas (`cmds-on.json`).
3. O servidor abre `editado-off`, recebe os `setblock` e para; `python3 scripts/bds/cmp.py <pasta com leveldb e nbtle> <mundo A> <mundo B> A B` compara a região bloco a bloco (nome e estados). Os estados que o jogo acrescenta sozinho (`minecraft:corner` das escadas, `connection_*` de cercas e vidraças) não são erro.

Biomas, na 1.26.52: pintar planície nevada num chunk de planície faz nascer errantes só nele (o jogo trata o bioma pintado como natural). Áreas de nascimento de estruturas (registros 0x77 do chunk: posto avançado, cabana da bruxa) copiadas de uma estrutura real para outro lugar não funcionam: em 10 rodadas de 30 s, 0 saqueadores na cópia e 30 no posto real (zumbis nasceram normalmente na cópia).

Resultado na 1.26.52: desligado igual; ligado igual em todos os circuitos (só a metade de cima da porta: o jogo guarda `open_bit` só na de baixo). O teste achou e corrigiu a alavanca no chão/teto exportada invertida e o funil exportado travado.

## Gerar os blocos (`npm run blocks`)

`scripts/gen_blocks.js` (cubos) e `scripts/gen_shapes.js` (formas) montam `data/blocks.json` e `data/shapes.json` a partir do minecraft-data (Java 1.21.11 e 26.1, Bedrock 1.26.51), do minecraft-assets 26.1 e do pacote oficial do Bedrock. O `gen_shapes.js` precisa de `BEDROCK_SAMPLES_DIR` apontando para o bedrock-samples 1.26.50 ou mais novo extraído (`resource_pack/textures/blocks`, `resource_pack/textures/terrain_texture.json`, `metadata/vanilladata_modules/mojang-blocks.json`): de lá saem as texturas e os estados dos blocos que só o Bedrock tem e que o minecraft-data ainda não traz.

Os blocos acrescentados entram sempre no fim da lista (o índice dos que já existiam não muda: o histórico guarda células cruas). Os novos do Bedrock (choupo, enxofre, cinábrio, lajes e escadas de lã e de concreto, molduras...) são cópias da forma de um bloco parecido do Java (abeto, tufo, laje e escada de tufo) com as texturas e os nomes Bedrock trocados (`copyOf`), marcados `bo` (fora do .schem) e `nb` (seguem as categorias normais da paleta); `fc` marca cubo inteiro e opaco feito como forma (conta como sólido). A lista foi conferida com `mojang-blocks.json` (1.463 blocos): faltam só os 160 da química da Education Edition. Cada bloco novo foi exportado num mundo, aberto e regravado pelo servidor oficial 1.26.52 e aberto de volta no site sem desconhecidos.
