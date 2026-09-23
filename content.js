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

const SEL_TABELA = ".p-datatable, [data-testid='full-table-card'], table";
const SEL_PAGINADOR =
  ".p-paginator, [data-testid='full-table-pagination'], nav[aria-label='Pagination'], nav[aria-label*='Pagination' i]";
const SEL_CHECKBOX = "input[type='checkbox'], button[role='checkbox']";

function texto(el) {
  return (el && (el.innerText || el.textContent || el.value) || "").trim();
}

function desabilitado(el) {
  return !el || !!el.disabled || el.getAttribute("aria-disabled") === "true";
}

function marcado(el) {
  if (!el) return false;
  if ("checked" in el) return !!el.checked;
  return el.getAttribute("aria-checked") === "true" ||
         el.getAttribute("data-state") === "checked";
}

function clicar(el) {
  if (!el) return;
  const disparar = (tipo, detalhes = {}) => {
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      ...detalhes,
    };

    try {
      const Evento = tipo.startsWith("pointer") && typeof window.PointerEvent === "function"
        ? window.PointerEvent
        : window.MouseEvent;
      el.dispatchEvent(new Evento(tipo, base));
    } catch (e) {
      try {
        el.dispatchEvent(new window.MouseEvent(tipo, base));
      } catch (e2) {
        if (typeof document.createEvent === "function") {
          const evt = document.createEvent("MouseEvents");
          evt.initMouseEvent(
            tipo,
            true,
            true,
            window,
            1,
            0,
            0,
            0,
            0,
            false,
            false,
            false,
            false,
            0,
            null
          );
          el.dispatchEvent(evt);
        }
      }
    }
  };

  ["pointerover", "pointermove", "pointerdown", "pointerup"].forEach((tipo) => {
    disparar(tipo, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
  });
  ["mouseover", "mousemove", "mousedown", "mouseup"].forEach((tipo) => {
    disparar(tipo);
  });
  try {
    el.click();
  } catch (e) {}
}

function enviarMensagemExtensao(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        const erro = chrome.runtime.lastError;
        if (erro) resolve({ ok: false, erro: erro.message });
        else resolve(resp || { ok: false });
      });
    } catch (e) {
      resolve({ ok: false, erro: String(e && e.message || e) });
    }
  });
}

async function clicarReal(el) {
  if (!el) return false;

  try {
    el.scrollIntoView({ block: "center", inline: "center" });
  } catch (e) {}

  await sleep(120);

  const r = el.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) return false;

  const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 2);
  const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 2);
  const resp = await enviarMensagemExtensao({ tipo: "cliqueReal", x, y });
  await sleep(140);
  return !!(resp && resp.ok);
}

async function acionar(el) {
  if (await clicarReal(el)) return true;
  clicar(el);
  await sleep(140);
  return false;
}

async function soltarCliquesReais() {
  await enviarMensagemExtensao({ tipo: "soltarDebugger" });
}

function primeiroDentro(root, seletores) {
  for (const seletor of seletores) {
    const achado = root.querySelector(seletor);
    if (achado) return achado;
  }
  return null;
}

function controlePaginacao() {
  return document.querySelector(".p-paginator-rpp-dropdown, [data-testid='full-table-per-page']");
}

function labelPaginacao(root) {
  if (!root) return null;

  const antigo = root.querySelector && root.querySelector(".p-select-label");
  const novo = root.matches && root.matches("[role='combobox']")
    ? root
    : (root.querySelector && root.querySelector("[role='combobox']"));

  return antigo || novo;
}

function opcaoComValor(lista, valor) {
  const opcoes = [
    ...lista.querySelectorAll('[role="option"], .p-select-option, .p-dropdown-item, *')
  ];
  return opcoes.find((o) =>
    texto(o) === valor &&
    ![...o.children].some((filho) => texto(filho) === valor)
  );
}

function listaComValor(listaId, valor) {
  const listas = [
    ...(listaId && document.getElementById(listaId)
      ? [document.getElementById(listaId)]
      : []),
    ...document.querySelectorAll('[role="listbox"], [data-testid="select-box-panel"]'),
  ];

  return listas.find((lista) => opcaoComValor(lista, valor));
}

// ==============================================================
// 1) PAGINAÇÃO AUTOMÁTICA = 100
// ==============================================================

const paginacaoFeita = new WeakSet();

async function ajustarPaginacao(root, timeoutMs = 5000) {
  const controle = root || controlePaginacao();
  const label = labelPaginacao(controle);
  if (!label) return;

  if (texto(label) === ALVO) return true;

  // PrimeVue só monta a lista de opções quando o seletor é aberto
  await acionar(label);

  const listaId = label.getAttribute("aria-controls");
  const antes = assinaturaTabela();
  const inicio = Date.now();

  while (Date.now() - inicio < timeoutMs) {
    await sleep(100);

    const lista = listaComValor(listaId, ALVO);
    if (!lista) continue;

    const opcao = opcaoComValor(lista, ALVO);
    if (!opcao) {
      console.warn(`[UP CPlug] Opção "${ALVO}" não existe neste seletor.`);
      label.click(); // fecha o overlay
      return false;
    }

    await acionar(opcao);

    const assentou = await esperarValorOuTroca(label, antes);
    if (assentou) console.log(`[UP CPlug] Itens por página = ${ALVO}`);
    return assentou;
  }

  console.warn("[UP CPlug] Não consegui abrir o seletor de paginação.");
  return false;
}

function definirPaginacao(root) {
  if (paginacaoFeita.has(root)) return;

  const label = labelPaginacao(root);
  if (!label) return;

  if (texto(label) === ALVO) {
    paginacaoFeita.add(root);
    return;
  }

  ajustarPaginacao(root).then((ok) => {
    if (ok) paginacaoFeita.add(root);
  });
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

async function esperarValorOuTroca(label, assinaturaAnterior, timeoutMs = 8000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    await sleep(150);
    if (texto(label) === ALVO) {
      await sleep(250);
      return true;
    }

    if (assinaturaTabela() !== assinaturaAnterior && checkboxesDaPagina().length > 0) {
      await sleep(250);
      return texto(label) === ALVO || texto(label) === "";
    }
  }
  return texto(label) === ALVO;
}

function checkboxesDaPagina() {
  const corpo = document.querySelector("tbody");
  if (!corpo) return [];
  return [...corpo.querySelectorAll(SEL_CHECKBOX)];
}

function checkboxCabecalho() {
  const cabecalhoRoot = document.querySelector("thead");
  return cabecalhoRoot && primeiroDentro(cabecalhoRoot, [
    ".p-checkbox input",
    "button[role='checkbox']",
    "input[type='checkbox']",
  ]);
}

async function colocarCheckbox(cb, marcar) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (marcado(cb) === marcar) return true;
    await acionar(cb);
    await sleep(60);
  }
  return marcado(cb) === marcar;
}

async function registrarLinhaMarcada(cb) {
  // O CPlug so libera o salvar quando cada linha dispara seu proprio
  // toggle. O cabecalho e rapido, mas pode deixar o estado interno incompleto.
  await colocarCheckbox(cb, false);
  await sleep(20);
  return await colocarCheckbox(cb, true);
}

async function registrarLinhasDaPagina(botaoStatus) {
  const checks = checkboxesDaPagina();
  if (!checks.length) return 0;

  botaoStatus.textContent = "Confirmando página…";

  await registrarLinhaMarcada(checks[0]);
  await esperarEstadoDaPagina(true, 2500);

  return checkboxesDaPagina().filter((c) => marcado(c)).length;
}

async function esperarEstadoDaPagina(marcar, timeoutMs = 4000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const checks = checkboxesDaPagina();
    if (checks.length && checks.every((c) => marcado(c) === marcar)) return true;
    await sleep(100);
  }
  return false;
}

// Aplica o estado desejado em TODAS as linhas da página atual
async function aplicarNaPagina(marcar, botaoStatus) {
  const cabecalho = checkboxCabecalho();
  const checksAntes = checkboxesDaPagina();

  if (cabecalho && checksAntes.some((c) => marcado(c) !== marcar)) {
    await acionar(cabecalho);
    await esperarEstadoDaPagina(marcar);
  }

  // Fallback: se o select-all visual falhar em alguma linha, corrige só o
  // que ficou pendente. Normalmente não roda, mantendo o fluxo rápido.
  for (let rodada = 0; rodada < 2; rodada++) {
    const pendentes = checkboxesDaPagina().filter((c) => marcado(c) !== marcar);
    if (!pendentes.length) break;
    for (const cb of pendentes) {
      await colocarCheckbox(cb, marcar);
      await sleep(5);
    }
    await sleep(150);
  }

  if (marcar) return await registrarLinhasDaPagina(botaoStatus);

  return checkboxesDaPagina().filter((c) => marcado(c) === marcar).length;
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
    const nav = () => document.querySelector(SEL_PAGINADOR);
    const botaoNav = (rotulos) => {
      const paginador = nav();
      if (!paginador) return null;
      const alvos = rotulos.map((r) => r.toLowerCase());
      return [...paginador.querySelectorAll("button")].find((b) => {
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        const txt = texto(b).toLowerCase();
        return alvos.includes(aria) || alvos.includes(txt);
      });
    };
    const botaoPagina = (numero) => {
      const paginador = nav();
      if (!paginador) return null;
      return [...paginador.querySelectorAll("button")].find((b) =>
        texto(b) === String(numero)
      );
    };
    const irParaPrimeiraPagina = async () => {
      const primeira = botaoNav(["First Page", "First page", "Primeira pagina", "Primeira página"]);
      const paginaUm = botaoPagina(1);
      const alvo = primeira && !desabilitado(primeira) ? primeira : paginaUm;
      if (!alvo || desabilitado(alvo)) return false;

      const antes = assinaturaTabela();
      await acionar(alvo);
      await esperarTrocaDePagina(antes);
      return true;
    };

    botao.textContent = `Ajustando para ${ALVO} por página…`;
    await ajustarPaginacao(controlePaginacao());

    // Volta para a primeira página antes de começar
    await irParaPrimeiraPagina();

    while (pagina < MAX_PAGINAS) {
      pagina++;
      botao.textContent = `${marcar ? "Marcando" : "Desmarcando"}… página ${pagina}`;

      total += await aplicarNaPagina(marcar, botao);

      const proxima = botaoNav(["Next Page", "Next page", "Proxima pagina", "Próxima página"]);
      if (!proxima || desabilitado(proxima)) break;

      const antes = assinaturaTabela();
      await acionar(proxima);
      const trocou = await esperarTrocaDePagina(antes);
      if (!trocou) {
        console.warn("[UP CPlug] A página não trocou a tempo. Parando por segurança.");
        break;
      }
    }

    // Retorna para a primeira página
    await irParaPrimeiraPagina();

    if (marcar && total > 0) {
      botao.textContent = "Conferindo primeira página…";
      await aplicarNaPagina(true, botao);
    }

    botao.textContent = `✓ ${total} ${marcar ? "marcados" : "desmarcados"} (${pagina} pág.)`;
    console.log(`[UP CPlug] ${marcar ? "Marcados" : "Desmarcados"}: ${total} em ${pagina} páginas`);
  } catch (e) {
    console.error("[UP CPlug] Erro ao percorrer páginas:", e);
    botao.textContent = "Erro — veja o console (F12)";
  } finally {
    await soltarCliquesReais();
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
  // Só faz sentido se a lista já carregou.
  if (!checkboxesDaPagina().length) return;
  if (document.querySelector("[data-up-cplug]")) return;

  // Âncora: logo acima da tabela, abaixo do filtro de Categoria
  const tabela = document.querySelector(SEL_TABELA);
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
    .querySelectorAll(".p-paginator-rpp-dropdown, [data-testid='full-table-per-page']")
    .forEach(definirPaginacao);

  injetarBotoes();
}

let debounce = null;
new MutationObserver(() => {
  clearTimeout(debounce);
  debounce = setTimeout(varrer, 250);
}).observe(document.documentElement, { childList: true, subtree: true });

varrer();
