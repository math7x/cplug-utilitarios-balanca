# 📦 Instalação da Extensão - UP Utilitários CPlug

## O que a extensão faz

1. **Renomeia downloads**: `carga_balanca.txt` → `ITENSMGV.txt`
2. **Paginação automática**: na tela *Periféricos → Carga para balança*, o seletor
   de itens por página já vem em **100** em vez de 20.
3. **Seleção em massa**: dois botões no topo do modal —
   **"✓ Marcar todas as páginas"** e **"Desmarcar todas"** — percorrem todas as
   páginas sozinhos.
4. **Correção da validade**: no momento do download, reescreve o campo de dias de
   validade (posições 16-18) de cada produto. O CPlug exporta esse campo sempre zerado.
5. **Tela de gestão**: clicando no ícone da extensão, dá para buscar qualquer produto
   e definir a validade — sem mexer em arquivo nenhum.

## Passo 1: Preparar os arquivos
Os arquivos já estão prontos nesta pasta:
- `manifest.json`
- `background.js`
- `content.js`
- `validade-mgv.js`
- `ponte.js`
- `popup.js`
- `validades.json`
- `popup.html`

## Passo 2: Abrir o Chrome em modo desenvolvedor

1. Abra o **Google Chrome**
2. Na barra de endereço, digite: `chrome://extensions/`
3. Você verá a página de extensões

## Passo 3: Ativar Modo de Desenvolvedor

- No canto superior direito, procure por **"Modo de desenvolvedor"**
- Clique para **ativar** (deve ficar azul)

## Passo 4: Carregar a extensão

1. Clique em **"Carregar extensão não empacotada"** (aparece no canto superior esquerdo)
2. Navegue até a pasta onde estão os arquivos (`upbalança (cbug)`)
3. **Selecione a pasta** e clique em "Selecionar pasta"

## ✅ Pronto!

A extensão deve aparecer agora na lista. Você verá um ícone dela no canto superior direito do Chrome.

## 🧪 Testando

1. Acesse qualquer site que permita download
2. Faça download de um arquivo chamado `carga_balanca.txt`
3. O arquivo **automaticamente será renomeado para `ITENSMGV.txt`**

## ⚙️ Se quiser editar o mapeamento

Abra `background.js` e altere a linha:
```javascript
const RENAME_MAP = {
  "carga_balanca.txt": "ITENSMGV.txt"
};
```

Exemplo: se quiser adicionar outro arquivo:
```javascript
const RENAME_MAP = {
  "carga_balanca.txt": "ITENSMGV.txt",
  "outro_arquivo.csv": "novo_nome.csv"
};
```

Depois, na página de extensões, clique no ícone de **atualizar** para aplicar as mudanças.

## ⚠️ Comportamento

- **Sem caixa de diálogo**: O navegador vai direto pra pasta de Downloads com o novo nome
- **Se o arquivo já existe**: O Chrome vai adicionar um número tipo `ITENSMGV (1).txt`
- **Funciona para múltiplos downloads**: Cada um que for `carga_balanca.txt` vira `ITENSMGV.txt`

## 🐛 Troubleshooting

**A extensão não está funcionando?**
- Verifique se o "Modo de desenvolvedor" está ativado
- Clique no botão de **atualizar** (🔄) na página de extensões
- Abra o console (F12 → Console) para ver mensagens de erro

**A extensão apareceu mas não renomeia?**
- Certifique-se que o nome do arquivo é **exatamente** `carga_balanca.txt`
- Nomes com maiúscula ou espaços diferentes não vão funcionar

---

## ⚙️ Ajustando a paginação automática (`content.js`)

No topo do arquivo:

```javascript
const ALVO = "100";              // 20, 50 ou 100 (opções que o CPlug oferece)
const SOMENTE_CARGA_BALANCA = true;  // false = vale para todas as listagens do CPlug
```

### Comportamento e limitações

- O CPlug é um SPA (não recarrega a página). O script usa um `MutationObserver`,
  então funciona ao abrir o modal, ao navegar entre telas e no F5.
- **Você verá o dropdown piscar** por uma fração de segundo: o PrimeVue só monta a
  lista de opções quando o seletor é aberto, então não há como trocar o valor "por
  baixo dos panos". É o comportamento esperado.
- Se você trocar manualmente para 20 ou 50 **depois** que o script agiu, ele não
  desfaz sua escolha. Mas ao fechar e reabrir o modal, volta a forçar 100.
- Se a CPlug mudar as classes CSS (`.p-paginator-rpp-dropdown`, `.p-select-label`)
  numa atualização, o script simplesmente para de agir — não quebra a tela. O
  console (F12) mostra o aviso.
- Com listas muito grandes (milhares de produtos), 100 por página deixa a tela mais
  pesada que 20. Se notar lentidão, reduza `ALVO` para `"50"`.

---

## ✓ Botões "Marcar todas as páginas" / "Desmarcar todas"

Aparecem no **topo do modal**, logo abaixo do filtro de Categoria e acima do
cabeçalho da tabela — sempre visíveis, sem precisar rolar até o fim da lista.

### Como funciona

1. Volta para a página 1.
2. Em cada página: clica no checkbox do cabeçalho e depois confere linha a linha
   (isso cobre o caso do checkbox ficar em estado "parcial").
3. Avança para a próxima página e repete, até o botão "próxima" ficar desabilitado.
4. Volta para a página 1 e mostra o total: `✓ 299 marcados (3 pág.)`.

A seleção do CPlug **persiste entre páginas** — isso foi verificado em teste real,
é o que faz o processo funcionar.

### Pontos de atenção

- **É deliberadamente manual.** Não marca sozinho ao abrir a tela: você precisa
  poder entrar no modal só para conferir sem alterar a carga. O botão "Desmarcar
  todas" existe justamente como desfazer.
- **Respeita o filtro de Categoria ativo.** Se houver filtro aplicado, marca só o
  que está filtrado. Confira o filtro antes de clicar.
- **Não clica em "Confirmar e Salvar".** Gravar a carga continua sendo decisão sua.
- Durante a execução os botões ficam desabilitados e mostram o progresso
  (`Marcando… página 2`). Não troque de página nem feche o modal nesse meio-tempo.
- Trava de segurança em `MAX_PAGINAS = 200`. Se a lista passar disso, aumente o
  valor no `content.js`.
- Se uma página demorar mais de 8 segundos para carregar, o script **para** em vez
  de continuar às cegas — o aviso vai para o console (F12).


---

## 🗓️ Correção automática da validade

### O problema

O CPlug exporta o arquivo de carga com o campo de validade **zerado** (`000` nas
posições 16-18). A etiqueta sairia com validade igual à data de embalagem.

### Como funciona

Quando você clica em **Confirmar e Salvar**, o CPlug baixa o `.txt` do servidor,
embrulha num `Blob` e dispara um `<a download>`. A extensão intercepta esse clique,
corrige o conteúdo em memória e baixa a versão corrigida.

Um aviso aparece no canto da tela:

| Cor | Significado |
|---|---|
| Verde | corrigiu tudo |
| Laranja | corrigiu, mas há produtos novos sem validade |
| Vermelho | não conseguiu corrigir — baixou o arquivo **original**, intacto |

### Por que é robusto

O gancho é numa **API padrão do navegador** (`<a download>` + `blob:`), não no HTML
do CPlug. A extensão confirma pelo **formato** do arquivo (linhas de 260 caracteres,
código numérico nas posições 4-9) antes de tocar em qualquer coisa. Se a CPlug
refizer a interface, isto continua funcionando.

---

## 🖥️ Tela de gestão (clique no ícone da extensão)

**Toda a configuração de validade é feita aqui.** Não precisa mexer em arquivo.

### Aba "Novos"

Produtos que apareceram numa carga e ainda não têm validade definida. Enquanto
estiverem nesta lista, saem com `000`. O ícone da extensão mostra um **número
laranja** com a quantidade pendente.

Basta digitar os dias — salva sozinho. Ou marcar **"sem validade"** para
industrializados, taxas e afins, que aí o produto some da lista de pendentes e
passa a sair com `000` de propósito, sem avisar mais.

### Aba "Todos os produtos"

Busca por nome ou código. Mesma edição: digitar os dias ou marcar "sem validade".

### Janela na hora da exportação

Se aparecer produto novo durante a carga, a extensão abre uma janela **antes** de
baixar, para preencher na hora. É opcional — se ela pular, os códigos ficam
registrados na aba "Novos" de qualquer jeito.

Acima de **40** produtos novos a janela não abre (preencher 40 campos na mão não é
fluxo de trabalho). Eles vão direto para a aba "Novos".

---

## 🔄 Onde os dados ficam — leia isto

A tabela vive no **`chrome.storage` do navegador**, não no arquivo. O
`validades.json` só serve de **semente**: ele é lido uma vez, na instalação.

Consequências:

- Depois da primeira carga, **editar o `validades.json` não muda mais nada** —
  a tela de gestão manda.
- Para reimpor a tabela oficial (por exemplo, quando você mandar uma versão nova
  do `validades.json`), use o botão **"Restaurar do arquivo"** no rodapé da tela.
  Ele reaplica o arquivo por cima; produtos cadastrados só naquela máquina
  continuam existindo.
- Os dados são **por navegador e por máquina**. Duas lojas = duas tabelas
  independentes. Não há sincronização.
- Desinstalar a extensão apaga tudo. Limpar dados de navegação, não.

### Botões do rodapé

| Botão | O que faz |
|---|---|
| **Exportar** | Baixa um `validades.json` com a configuração atual desta máquina |
| **Importar** | Carrega um `validades.json` e **substitui** a configuração desta máquina |
| **Restaurar** | Reaplica o `validades.json` que está na pasta da extensão |

### Levar a configuração para outro computador

A extensão **não consegue escrever na própria pasta** — o Chrome proíbe. Por isso o
caminho é exportar e substituir o arquivo na mão.

**Opção A — levar a pasta pronta (recomendado para máquina nova):**

1. Na máquina configurada: abra a extensão → **Exportar**
2. Pegue o `validades.json` que caiu em Downloads e **substitua** o da pasta da extensão
3. Copie a pasta inteira para o outro computador e carregue a extensão lá

Como a máquina nova tem o armazenamento vazio, ela lê o arquivo como semente e já
nasce com tudo configurado. Não precisa clicar em mais nada.

**Opção B — extensão já instalada do outro lado:**

1. **Exportar** na máquina configurada
2. Levar o `validades.json` (pendrive, e-mail, o que for)
3. Na outra máquina: abrir a extensão → **Importar** → escolher o arquivo

### Atualizar a tabela numa máquina que já roda

1. Substitua o `validades.json` na pasta da extensão
2. `chrome://extensions` → botão de atualizar (🔄)
3. Abra a extensão e clique em **"Restaurar"**

Sem o passo 3, a tabela antiga continua valendo — o arquivo só é lido sozinho na
primeira instalação.
