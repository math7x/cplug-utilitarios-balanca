// ============================================================
//  UP Tecnologias - service worker
//
//  1) Renomeia o download carga_balanca.txt -> ITENSMGV.txt
//  2) Guarda a tabela de validades no chrome.storage e serve
//     ela para a tela de gestao (popup) e para a pagina do CPlug
// ============================================================

const RENAME_MAP = {
  "carga_balanca.txt": "ITENSMGV.txt"
};

const ARQUIVO_BASE = 'validades.json';

// ------------------------------------------------- renomear download ----
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  const filename = downloadItem.filename.split('/').pop();

  if (RENAME_MAP[filename]) {
    const novo = downloadItem.filename.replace(filename, RENAME_MAP[filename]);
    console.log('[UP] Renomeando: "' + filename + '" -> "' + RENAME_MAP[filename] + '"');
    suggest({ filename: novo });
  }
});

// ----------------------------------------------------------- tabela -----
async function lerArquivoBase() {
  const r = await fetch(chrome.runtime.getURL(ARQUIVO_BASE));
  return await r.json();
}

async function estado() {
  const s = await chrome.storage.local.get(
    ['validades', 'semValidade', 'nomes', 'pendentes', 'sedeado']);
  return {
    validades: s.validades || {},
    semValidade: s.semValidade || {},
    nomes: s.nomes || {},
    pendentes: s.pendentes || {},
    sedeado: !!s.sedeado
  };
}

// Semeia a partir do validades.json na primeira vez.
async function garantirSemente() {
  const s = await estado();
  if (s.sedeado) return s;
  return await restaurarDoArquivo();
}

// Reimpoe a tabela oficial do arquivo por cima do que esta salvo.
// Produtos cadastrados so no navegador continuam existindo.
async function restaurarDoArquivo() {
  const base = await lerArquivoBase();
  const atual = await estado();

  const validades   = Object.assign({}, atual.validades, base.validades || {});
  const semValidade = Object.assign({}, atual.semValidade);
  const nomes       = Object.assign({}, atual.nomes, base.nomes || {});

  for (const cod of (base.semValidade || [])) { semValidade[cod] = true; delete validades[cod]; }
  for (const cod in (base.validades || {}))   { delete semValidade[cod]; }

  await chrome.storage.local.set({
    validades: validades,
    semValidade: semValidade,
    nomes: nomes,
    pendentes: atual.pendentes,
    sedeado: true,
    restauradoEm: new Date().toISOString()
  });

  return await estado();
}

// ------------------------------------------------------- mensagens ------
chrome.runtime.onMessage.addListener(function (msg, sender, responder) {
  (async function () {
    try {
      switch (msg && msg.tipo) {

        case 'obterTabela': {
          const s = await garantirSemente();
          responder({ ok: true, validades: s.validades, semValidade: s.semValidade,
                      nomes: s.nomes, pendentes: s.pendentes });
          break;
        }

        // A pagina achou codigos que nao estao em nenhuma lista.
        case 'registrarPendentes': {
          const s = await estado();
          const p = Object.assign({}, s.pendentes);
          const nomes = Object.assign({}, s.nomes);

          (msg.itens || []).forEach(function (it) {
            const cod = String(it.cod);
            p[cod] = { nome: it.nome || (p[cod] && p[cod].nome) || '',
                       visto: new Date().toISOString() };
            if (it.nome && !nomes[cod]) nomes[cod] = it.nome;
          });

          await chrome.storage.local.set({ pendentes: p, nomes: nomes });
          atualizarBadge(Object.keys(p).length);
          responder({ ok: true, total: Object.keys(p).length });
          break;
        }

        // Define validade (ou marca como sem validade) para varios codigos.
        case 'definir': {
          const s = await estado();
          const validades   = Object.assign({}, s.validades);
          const semValidade = Object.assign({}, s.semValidade);
          const pendentes   = Object.assign({}, s.pendentes);
          const nomes       = Object.assign({}, s.nomes);

          (msg.itens || []).forEach(function (it) {
            const cod = String(it.cod);
            if (it.nome && !nomes[cod]) nomes[cod] = it.nome;

            if (it.semValidade) {
              delete validades[cod];
              semValidade[cod] = true;
            } else if (it.dias === null || it.dias === undefined || it.dias === '') {
              delete validades[cod];
              delete semValidade[cod];
              return;                       // volta a ser "sem decisao"
            } else {
              const d = parseInt(it.dias, 10);
              if (isNaN(d) || d < 0 || d > 999) return;
              validades[cod] = d;
              delete semValidade[cod];
            }
            delete pendentes[cod];
          });

          await chrome.storage.local.set({
            validades: validades, semValidade: semValidade,
            pendentes: pendentes, nomes: nomes
          });
          atualizarBadge(Object.keys(pendentes).length);
          responder({ ok: true });
          break;
        }

        // Substitui a tabela inteira por um validades.json importado.
        case 'importar': {
          const base = msg.dados || {};
          if (!base.validades || typeof base.validades !== 'object') {
            responder({ ok: false, erro: 'arquivo não parece um validades.json' });
            break;
          }

          const atual = await estado();
          const semValidade = {};
          (base.semValidade || []).forEach(function (c) { semValidade[c] = true; });

          const nomes = Object.assign({}, atual.nomes, base.nomes || {});
          const pendentes = Object.assign({}, atual.pendentes);
          Object.keys(base.validades).forEach(function (c) { delete pendentes[c]; });
          Object.keys(semValidade).forEach(function (c) { delete pendentes[c]; });

          await chrome.storage.local.set({
            validades: base.validades,
            semValidade: semValidade,
            nomes: nomes,
            pendentes: pendentes,
            sedeado: true,
            importadoEm: new Date().toISOString()
          });

          atualizarBadge(Object.keys(pendentes).length);
          responder({ ok: true });
          break;
        }

        case 'restaurar': {
          const s = await restaurarDoArquivo();
          responder({ ok: true, validades: s.validades, semValidade: s.semValidade,
                      nomes: s.nomes, pendentes: s.pendentes });
          break;
        }

        default:
          responder({ ok: false, erro: 'mensagem desconhecida' });
      }
    } catch (e) {
      console.error('[UP] erro no service worker:', e);
      responder({ ok: false, erro: String((e && e.message) || e) });
    }
  })();

  return true;   // resposta assincrona
});

// ---------------------------------------------------------- badge -------
function atualizarBadge(qtd) {
  try {
    chrome.action.setBadgeText({ text: qtd > 0 ? String(qtd) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
  } catch (e) {}
}

chrome.runtime.onStartup.addListener(async function () {
  const s = await estado();
  atualizarBadge(Object.keys(s.pendentes).length);
});

chrome.runtime.onInstalled.addListener(async function () {
  await garantirSemente();
  const s = await estado();
  atualizarBadge(Object.keys(s.pendentes).length);
  console.log('[UP] Extensao pronta.');
});
