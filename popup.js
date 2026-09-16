// ============================================================
//  Tela de gestao da validade dos produtos.
//  Le e grava no chrome.storage atraves do service worker.
// ============================================================

let dados = { validades: {}, semValidade: {}, nomes: {}, pendentes: {} };

const $ = (id) => document.getElementById(id);

function msg(tipo, itens, dadosExtra) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ tipo, itens, dados: dadosExtra }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.ok) return reject(new Error((resp && resp.erro) || 'falhou'));
      resolve(resp);
    });
  });
}

// ------------------------------------------------------------ linha ----
function linha(cod, nome, opts) {
  opts = opts || {};
  const div = document.createElement('div');
  div.className = 'item';

  const info = document.createElement('div');
  info.className = 'info';
  const n = document.createElement('div');
  n.className = 'nome';
  n.textContent = nome || '(sem nome)';
  const c = document.createElement('div');
  c.className = 'cod';
  c.textContent = 'código ' + cod;
  info.appendChild(n); info.appendChild(c);

  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = '0'; inp.max = '999';
  inp.placeholder = 'dias';
  if (typeof dados.validades[cod] === 'number') inp.value = dados.validades[cod];

  const lab = document.createElement('label');
  lab.title = 'Nunca imprimir validade neste produto (sai com 000)';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = !!dados.semValidade[cod];
  inp.disabled = chk.checked;
  lab.appendChild(chk);
  lab.appendChild(document.createTextNode('sem validade'));

  const ok = document.createElement('span');
  ok.className = 'salvo';
  ok.textContent = '✓';

  function piscar() {
    ok.classList.add('on');
    setTimeout(() => ok.classList.remove('on'), 1200);
  }

  async function gravar(item) {
    try {
      await msg('definir', [item]);
      piscar();
      await carregar(false);
      if (opts.aoSalvar) opts.aoSalvar();
    } catch (e) {
      alert('Não consegui salvar: ' + e.message);
    }
  }

  chk.addEventListener('change', () => {
    inp.disabled = chk.checked;
    if (chk.checked) {
      inp.value = '';
      gravar({ cod, nome, semValidade: true });
    } else {
      gravar({ cod, nome, dias: '' });   // volta a ficar sem decisao
    }
  });

  let timer = null;
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const v = inp.value.trim();
      if (v === '') return gravar({ cod, nome, dias: '' });
      const d = parseInt(v, 10);
      if (isNaN(d) || d < 0 || d > 999) return;
      gravar({ cod, nome, dias: d });
    }, 600);
  });

  div.appendChild(info); div.appendChild(inp); div.appendChild(lab); div.appendChild(ok);
  return div;
}

// --------------------------------------------------------- desenhar ----
function desenharPendentes() {
  const alvo = $('listaPendentes');
  alvo.innerHTML = '';

  const cods = Object.keys(dados.pendentes)
    .sort((a, b) => Number(a) - Number(b));

  $('pinoPendentes').textContent = cods.length ? cods.length : '';

  if (!cods.length) {
    alvo.innerHTML =
      '<div class="vazio">Nenhum produto pendente.<br>' +
      'Todos os itens da última carga têm validade definida.</div>';
    return;
  }

  cods.forEach((cod) => {
    const nome = (dados.pendentes[cod] && dados.pendentes[cod].nome) || dados.nomes[cod] || '';
    alvo.appendChild(linha(cod, nome));
  });
}

function desenharTodos() {
  const alvo = $('listaTodos');
  const termo = $('busca').value.trim().toLowerCase();
  alvo.innerHTML = '';

  const todos = new Set([
    ...Object.keys(dados.validades),
    ...Object.keys(dados.semValidade),
    ...Object.keys(dados.pendentes),
    ...Object.keys(dados.nomes)
  ]);

  let lista = [...todos].map((cod) => ({
    cod,
    nome: dados.nomes[cod] || (dados.pendentes[cod] && dados.pendentes[cod].nome) || ''
  }));

  if (termo) {
    lista = lista.filter((x) =>
      x.cod.includes(termo) || x.nome.toLowerCase().includes(termo));
  }

  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (!lista.length) {
    alvo.innerHTML = '<div class="vazio">Nenhum produto encontrado.</div>';
    return;
  }

  const MAX = 300;
  lista.slice(0, MAX).forEach((x) => alvo.appendChild(linha(x.cod, x.nome)));

  if (lista.length > MAX) {
    const m = document.createElement('div');
    m.className = 'vazio';
    m.textContent = 'Mostrando ' + MAX + ' de ' + lista.length +
                    ' produtos. Use a busca para achar o que falta.';
    alvo.appendChild(m);
  }
}

function desenharResumo() {
  const comV = Object.keys(dados.validades).length;
  const semV = Object.keys(dados.semValidade).length;
  const pend = Object.keys(dados.pendentes).length;

  $('resumo').textContent =
    comV + ' com validade · ' + semV + ' sem validade' +
    (pend ? ' · ' + pend + ' pendente' + (pend > 1 ? 's' : '') : '');

  $('rodape').textContent = (comV + semV + pend) + ' produtos no total';
}

// ---------------------------------------------------------- carregar ---
async function carregar(redesenhar = true) {
  const r = await msg('obterTabela');
  dados = {
    validades: r.validades || {},
    semValidade: r.semValidade || {},
    nomes: r.nomes || {},
    pendentes: r.pendentes || {}
  };
  desenharResumo();
  if (redesenhar) {
    desenharPendentes();
    desenharTodos();
  } else {
    $('pinoPendentes').textContent =
      Object.keys(dados.pendentes).length || '';
  }
}

// ------------------------------------------------------------ eventos --
document.querySelectorAll('.aba').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach((x) => x.classList.remove('ativa'));
    document.querySelectorAll('.painel').forEach((x) => x.classList.remove('ativo'));
    b.classList.add('ativa');
    $('painel-' + b.dataset.painel).classList.add('ativo');
    if (b.dataset.painel === 'todos') $('busca').focus();
  });
});

let tBusca = null;
$('busca').addEventListener('input', () => {
  clearTimeout(tBusca);
  tBusca = setTimeout(desenharTodos, 180);
});

// ---------------------------------------------------- exportar/importar --
$('btnExportar').addEventListener('click', () => {
  const semValidade = Object.keys(dados.semValidade)
    .map(Number).sort((a, b) => a - b);

  const validades = {};
  Object.keys(dados.validades)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((k) => { validades[k] = dados.validades[k]; });

  const nomes = {};
  [...Object.keys(validades), ...semValidade.map(String)]
    .forEach((k) => { nomes[k] = dados.nomes[k] || ''; });

  const saida = {
    versao: 1,
    gerado: new Date().toISOString().slice(0, 10),
    validades,
    semValidade,
    nomes
  };

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(saida, null, 1)], { type: 'application/json' }));

  const a = document.createElement('a');
  a.href = url;
  a.download = 'validades.json';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
});

$('btnImportar').addEventListener('click', () => $('arquivoImport').click());

$('arquivoImport').addEventListener('change', async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;

  try {
    const texto = await f.text();
    const json = JSON.parse(texto);

    if (!json || typeof json.validades !== 'object') {
      throw new Error('o arquivo não tem a lista "validades"');
    }

    const qtd = Object.keys(json.validades).length;
    const ok = confirm(
      'Importar ' + qtd + ' produtos de "' + f.name + '"?\n\n' +
      'A configuração atual desta máquina será SUBSTITUÍDA.'
    );
    if (!ok) return;

    await msg('importar', undefined, json);
    await carregar();
    alert('Importado. ' + qtd + ' produtos com validade.');
  } catch (e) {
    alert('Não consegui importar: ' + e.message);
  }
});

$('btnRestaurar').addEventListener('click', async () => {
  const ok = confirm(
    'Reaplicar a tabela oficial que veio com a extensão?\n\n' +
    'As validades do arquivo voltam a valer, por cima do que foi editado aqui.\n' +
    'Produtos cadastrados só nesta máquina continuam existindo.'
  );
  if (!ok) return;

  try {
    await msg('restaurar');
    await carregar();
    alert('Tabela oficial reaplicada.');
  } catch (e) {
    alert('Não consegui restaurar: ' + e.message);
  }
});

carregar().catch((e) => {
  $('resumo').textContent = 'Erro ao carregar: ' + e.message;
});
