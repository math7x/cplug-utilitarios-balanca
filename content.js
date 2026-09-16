// ============================================================
//  UP - Utilitários CPlug
//  Tela: Periféricos > Carga para balança
//        (modal "Produtos para carga de balança")
//
//  1) Define automaticamente 100 itens por página
//  2) Adiciona botões "Marcar / Desmarcar todas as páginas"
// ============================================================

// --- Configuração ---------------------------------------------
const ALVO = "100"; // itens por página: "20", "50" ou "100"
const SOMENTE_CARGA_BALANCA = true; // false = vale para todas as listagens
const ROTA = "scale-load";
const MAX_PAGINAS = 200; // trava de segurança contra loop infinito
// --------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const naRotaCerta = () => !SOMENTE_CARGA_BALANCA || location.href.includes(ROTA);

// ==============================================================
// 1) PAGINAÇÃO AUTOMÁTICA = 100
// ==============================================================

const paginacaoFeita = new WeakSet();

function definirPaginacao(root) {
  if (paginacaoFeita.has(root)) return;

  const label = root.querySelector(".p-select-label");
  if (!label) return;

  if (label.textContent.trim() === ALVO) {
    paginacaoFeita.add(root);
    return;
  }

  paginacaoFeita.add(root);

  // PrimeVue só monta a lista de opções quando o seletor é aberto
  label.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  label.click();

  const listaId = label.getAttribute("aria-controls");
  let tentativas = 0;

  const timer = setInterval(() => {
    tentativas++;

    const lista =
      (listaId && document.getElementById(listaId)) ||
      document.querySelector('[role="listbox"]');

    if (lista) {
      const opcao = [...lista.querySelectorAll('[role="option"]')].find(
        (o) => o.textContent.trim() === ALVO
      );

      if (opcao) {
        opcao.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        opcao.click();
        console.log(`[UP CPlug] Itens por página = ${ALVO}`);
      } else {
        console.warn(`[UP CPlug] Opção "${ALVO}" não existe neste seletor.`);
        label.click(); // fecha o overlay
      }
      clearInterval(timer);
      return;
    }

    if (tentativas > 25) {
      console.warn("[UP CPlug] Não consegui abrir o seletor de paginação.");
      clearInterval(timer);
    }
  }, 100);
}

// ==============================================================
// 2) MARCAR / DESMARCAR TODAS AS PÁGINAS
// ==============================================================

// Assinatura da tabela: usada para detectar quando a página trocou de fato
function assinaturaTabela() {
  const linhas = document.querySelectorAll("tbody tr");
  const primeira = linhas[0] ? linhas[0].textContent.trim() : "";
  return linhas.length + "|" + primeira;
}

async function esperarTrocaDePagina(anterior, timeoutMs = 8000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    await sleep(150);
    const atual = assinaturaTabela();
    if (atual !== anterior && document.querySelectorAll("tbody tr").length > 0) {
      await sleep(250); // deixa o render assentar
      return true;
    }
  }
  return false;
}

function checkboxesDaPagina() {
  return [...document.querySelectorAll("tbody .p-checkbox input")];
}

// Aplica o estado desejado em TODAS as linhas da página atual
async function aplicarNaPagina(marcar) {
  const cabecalho = document.querySelector("thead .p-checkbox input");

  // Caminho rápido: usa o checkbox do cabeçalho
  if (cabecalho && cabecalho.checked !== marcar) {
    cabecalho.click();
    await sleep(350);
  }

  // Conferência linha a linha (cobre estado indeterminado e falhas do atalho)
  for (const cb of checkboxesDaPagina()) {
    if (cb.checked !== marcar) {
      cb.click();
      await sleep(20);
    }
  }

  return checkboxesDaPagina().filter((c) => c.checked === marcar).length;
}

let emExecucao = false;

async function percorrerTodasAsPaginas(marcar, botao, textoOriginal) {
  if (emExecucao) return;
  emExecucao = true;

  const botoes = [...document.querySelectorAll(".up-cplug-btn")];
  botoes.forEach((b) => (b.disabled = true));

  let total = 0;
  let pagina = 0;

  try {
    const nav = () => document.querySelector(".p-paginator");

    // Volta para a primeira página antes de começar
    const primeira = nav() && nav().querySelector('[aria-label="First Page"]');
    if (primeira && !primeira.disabled) {
      const antes = assinaturaTabela();
      primeira.click();
      await esperarTrocaDePagina(antes);
    }

    while (pagina < MAX_PAGINAS) {
      pagina++;
      botao.textContent = `${marcar ? "Marcando" : "Desmarcando"}… página ${pagina}`;

      total += await aplicarNaPagina(marcar);

      const proxima = nav() && nav().querySelector('[aria-label="Next Page"]');
      if (!proxima || proxima.disabled) break;

      const antes = assinaturaTabela();
      proxima.click();
      const trocou = await esperarTrocaDePagina(antes);
      if (!trocou) {
        console.warn("[UP CPlug] A página não trocou a tempo. Parando por segurança.");
        break;
      }
    }

    // Retorna para a primeira página
    const voltar = nav() && nav().querySelector('[aria-label="First Page"]');
    if (voltar && !voltar.disabled) {
      const antes = assinaturaTabela();
      voltar.click();
      await esperarTrocaDePagina(antes);
    }

    botao.textContent = `✓ ${total} ${marcar ? "marcados" : "desmarcados"} (${pagina} pág.)`;
    console.log(`[UP CPlug] ${marcar ? "Marcados" : "Desmarcados"}: ${total} em ${pagina} páginas`);
  } catch (e) {
    console.error("[UP CPlug] Erro ao percorrer páginas:", e);
    botao.textContent = "Erro — veja o console (F12)";
  } finally {
    botoes.forEach((b) => (b.disabled = false));
    emExecucao = false;
    setTimeout(() => {
      botao.textContent = textoOriginal;
    }, 4000);
  }
}

function criarBotao(texto, marcar) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "up-cplug-btn";
  b.textContent = texto;
  b.style.cssText = [
    "padding:6px 12px",
    "font-size:12px",
    "font-weight:600",
    "border-radius:6px",
    "cursor:pointer",
    "border:1px solid " + (marcar ? "#16a34a" : "#71717a"),
    "background:" + (marcar ? "#16a34a" : "transparent"),
    "color:" + (marcar ? "#ffffff" : "#a1a1aa"),
    "margin-right:8px",
  ].join(";");
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    percorrerTodasAsPaginas(marcar, b, texto);
  });
  return b;
}

function injetarBotoes() {
  // Só faz sentido se existir paginação (ou seja, a lista já carregou)
  if (!document.querySelector(".p-paginator")) return;
  if (document.querySelector("[data-up-cplug]")) return;

  // Âncora: logo acima da tabela, abaixo do filtro de Categoria
  const tabela = document.querySelector(".p-datatable");
  if (!tabela || !tabela.parentElement) return;

  const barra = document.createElement("div");
  barra.dataset.upCplug = "1";
  barra.style.cssText =
    "display:flex;align-items:center;gap:0;padding:0 0 8px 0;flex-wrap:wrap";

  barra.appendChild(criarBotao("✓ Marcar todas as páginas", true));
  barra.appendChild(criarBotao("Desmarcar todas", false));

  tabela.parentElement.insertBefore(barra, tabela);
  console.log("[UP CPlug] Botões de seleção em massa injetados (topo).");
}

// ==============================================================
// Observador do SPA
// ==============================================================

function varrer() {
  if (!naRotaCerta()) return;
  if (emExecucao) return; // não mexe enquanto o loop roda

  document
    .querySelectorAll(".p-paginator-rpp-dropdown")
    .forEach(definirPaginacao);

  injetarBotoes();
}

let debounce = null;
new MutationObserver(() => {
  clearTimeout(debounce);
  debounce = setTimeout(varrer, 250);
}).observe(document.documentElement, { childList: true, subtree: true });

varrer();
