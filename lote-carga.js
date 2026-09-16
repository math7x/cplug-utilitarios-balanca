// ============================================================
//  UP Tecnologias - carga de balanca em lotes (CPlug)
//
//  PROBLEMA
//  A API do CPlug limita a 500 itens por chamada:
//     POST /api/v3/bulks/items-add  ->  422
//     {"field":"items","validations":[{"type":"Max","value":["500"],
//      "message":"O campo items deve ter no maximo 500 itens."}]}
//  O front manda TODOS os produtos selecionados numa unica
//  requisicao, sem fatiar, e ainda engole o motivo: mostra so
//  "Erro ao salvar carga de balanca".
//
//  SOLUCAO
//  O endpoint items-add e CUMULATIVO: chamadas seguidas somam no
//  MESMO bulk pendente (identificado por "kind", nao por id).
//  Verificado ao vivo em 18/08/2026:
//     add([3072,3073])       -> 201  bulk 33584  total_items = 2
//     add([3074,3075,3076])  -> 200  bulk 33584  total_items = 5
//  Entao basta quebrar a lista em blocos de ate 500.
//
//  ESTRATEGIA
//  Os blocos 1..n-1 vao por fetch interno. O ULTIMO bloco e
//  entregue ao proprio front (fetch/XHR original). Assim a tela
//  recebe uma resposta de verdade, com o total acumulado, e nao
//  precisamos fabricar Response falsa nenhuma.
//
//  SEGURANCA
//  Se um bloco falhar no meio, o bulk pendente ficaria com itens
//  parciais e o PROXIMO save somaria em cima, em silencio. Por
//  isso, em caso de falha, desfazemos com items-remove antes de
//  deixar o erro chegar na tela.
//
//  Roda no MAIN world (precisa enxergar o fetch/XHR da pagina).
// ============================================================

(function () {
  'use strict';

  if (window.__UP_LOTE_CARGA) return;
  window.__UP_LOTE_CARGA = true;

  var LIMITE   = 500;                       // teto imposto pela API
  var ALVO     = '/api/v3/bulks/items-add';
  var REMOVER  = 'https://api.connectplug.com.br/api/v3/bulks/items-remove';

  var fetchOrig = window.fetch;
  var xhrOpen   = XMLHttpRequest.prototype.open;
  var xhrSend   = XMLHttpRequest.prototype.send;
  var xhrHeader = XMLHttpRequest.prototype.setRequestHeader;

  function log() {
    var a = ['[UP lote]'].concat([].slice.call(arguments));
    console.log.apply(console, a);
  }
  function aviso() {
    var a = ['[UP lote]'].concat([].slice.call(arguments));
    console.warn.apply(console, a);
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  // ---------------------------------------------------------- util ---
  // Le o corpo e devolve {payload, items} so quando vale a pena fatiar.
  function analisar(url, metodo, corpo) {
    if (!url || String(url).indexOf(ALVO) === -1) return null;
    if (String(metodo || '').toUpperCase() !== 'POST') return null;
    if (typeof corpo !== 'string') return null;

    var payload;
    try { payload = JSON.parse(corpo); } catch (e) { return null; }
    if (!payload || !Array.isArray(payload.items)) return null;
    if (payload.items.length <= LIMITE) return null;   // cabe: nao mexe

    return { payload: payload, items: payload.items };
  }

  function fatiar(items) {
    var blocos = [];
    for (var i = 0; i < items.length; i += LIMITE) {
      blocos.push(items.slice(i, i + LIMITE));
    }
    return blocos;
  }

  function corpoCom(payload, bloco) {
    var copia = {};
    for (var k in payload) if (payload.hasOwnProperty(k)) copia[k] = payload[k];
    copia.items = bloco;
    return JSON.stringify(copia);
  }

  // Cada chamada precisa de Idempotency-Key NOVO. Repetir a chave faz
  // o servidor descartar o bloco como duplicata - falha silenciosa.
  function cabecalhos(base) {
    var h = {};
    for (var k in base) if (base.hasOwnProperty(k)) h[k] = base[k];
    var temCT = false;
    Object.keys(h).forEach(function (n) {
      var l = n.toLowerCase();
      if (l === 'content-type') temCT = true;
      if (l === 'idempotency-key') delete h[n];
    });
    if (!temCT) h['Content-Type'] = 'application/json';
    h['Idempotency-Key'] = uuid();
    return h;
  }

  function normalizarHeaders(hs) {
    var out = {};
    if (!hs) return out;
    if (typeof Headers !== 'undefined' && hs instanceof Headers) {
      hs.forEach(function (v, k) { out[k] = v; });
    } else if (Array.isArray(hs)) {
      hs.forEach(function (par) { out[par[0]] = par[1]; });
    } else {
      for (var k in hs) if (hs.hasOwnProperty(k)) out[k] = hs[k];
    }
    return out;
  }

  // ------------------------------------------------------ rollback ---
  function desfazer(url, headers, enviados) {
    if (!enviados.length) return Promise.resolve();
    aviso('desfazendo ' + enviados.length + ' itens ja enviados');
    return fetchOrig.call(window, REMOVER, {
      method: 'POST',
      credentials: 'include',
      headers: cabecalhos(headers),
      body: JSON.stringify({ kind: 'product-scales', items: enviados })
    }).then(function (r) {
      if (!r.ok) aviso('rollback devolveu HTTP ' + r.status + ' - confira a carga antes de salvar de novo');
      else log('rollback ok');
    }).catch(function (e) {
      aviso('rollback falhou:', e, '- confira a carga antes de salvar de novo');
    });
  }

  // Envia os blocos iniciais. Resolve quando so sobrar o ultimo.
  function enviarIniciais(url, headers, payload, blocos) {
    var enviados = [];
    var p = Promise.resolve();

    blocos.forEach(function (bloco, i) {
      p = p.then(function () {
        return fetchOrig.call(window, url, {
          method: 'POST',
          credentials: 'include',
          headers: cabecalhos(headers),
          body: corpoCom(payload, bloco)
        }).then(function (r) {
          if (!r.ok) {
            return r.text().then(function (t) {
              throw new Error('bloco ' + (i + 1) + ' HTTP ' + r.status + ' ' + t.slice(0, 300));
            });
          }
          enviados = enviados.concat(bloco);
          log('bloco ' + (i + 1) + '/' + (blocos.length + 1) + ' ok (' + bloco.length + ' itens)');
        });
      });
    });

    return p.catch(function (err) {
      aviso('falhou:', err.message);
      return desfazer(url, headers, enviados).then(function () { throw err; });
    });
  }

  // --------------------------------------------------------- fetch ---
  window.fetch = function (entrada, init) {
    var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url);
    var metodo = (init && init.method) || (entrada && entrada.method) || 'GET';
    var corpo = init && init.body;

    var info = analisar(url, metodo, corpo);
    if (!info) return fetchOrig.apply(this, arguments);

    var headers = normalizarHeaders((init && init.headers) || (entrada && entrada.headers));
    var blocos = fatiar(info.items);
    var ultimo = blocos.pop();

    log(info.items.length + ' itens -> ' + (blocos.length + 1) + ' blocos de ate ' + LIMITE);

    var self = this;
    return enviarIniciais(url, headers, info.payload, blocos).then(function () {
      // O ultimo bloco vai pelo caminho normal: a tela recebe uma
      // resposta real, com o total_items ja acumulado.
      var novoInit = {};
      for (var k in init) if (init.hasOwnProperty(k)) novoInit[k] = init[k];
      novoInit.body = corpoCom(info.payload, ultimo);
      return fetchOrig.call(self, entrada, novoInit);
    }, function (err) {
      // Ja desfizemos o que tinha ido. Devolve o mesmo 422 que a API
      // devolveria, para a tela mostrar o erro em vez de fingir sucesso.
      var corpoErro = JSON.stringify({
        code: 'unprocessable_entity',
        message: 'Invalid Validation',
        meta: [{ field: 'items', validations: [{ type: 'UP', value: [], message: String(err && err.message || err) }] }]
      });
      return new Response(corpoErro, {
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: { 'Content-Type': 'application/json' }
      });
    });
  };

  // ----------------------------------------------------------- XHR ---
  XMLHttpRequest.prototype.open = function (metodo, url) {
    this.__upUrl = url;
    this.__upMetodo = metodo;
    this.__upHeaders = {};
    return xhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    if (this.__upHeaders) this.__upHeaders[nome] = valor;
    return xhrHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (corpo) {
    var info = analisar(this.__upUrl, this.__upMetodo, corpo);
    if (!info) return xhrSend.apply(this, arguments);

    var self = this;
    var url = String(this.__upUrl);
    if (url.indexOf('http') !== 0) url = location.origin + url;

    var headers = this.__upHeaders || {};
    var blocos = fatiar(info.items);
    var ultimo = blocos.pop();

    log(info.items.length + ' itens -> ' + (blocos.length + 1) + ' blocos de ate ' + LIMITE + ' (XHR)');

    // send() e sincrono para quem chama, mas a resposta ja e assincrona:
    // adiar o disparo real ate os blocos anteriores terminarem e seguro.
    enviarIniciais(url, headers, info.payload, blocos).then(function () {
      xhrSend.call(self, corpoCom(info.payload, ultimo));
    }, function () {
      xhrSend.call(self, corpo);   // deixa falhar de verdade na tela
    });
  };

  log('interceptador de lotes ativo (limite ' + LIMITE + ' itens/chamada)');
})();
