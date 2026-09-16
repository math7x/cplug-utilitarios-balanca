// ============================================================
//  Ponte entre a pagina do CPlug (MAIN world) e a extensao.
//
//  O script que corrige a validade roda no MAIN world, onde nao
//  existe chrome.storage. Este content script roda no mundo
//  isolado, enxerga a extensao, e conversa com o MAIN por
//  window.postMessage.
// ============================================================

(function () {
  'use strict';

  var PEDIDO = 'UP_PONTE_PEDIDO';
  var RESPOSTA = 'UP_PONTE_RESPOSTA';

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;

    var d = ev.data;
    if (!d || d.canal !== PEDIDO) return;

    chrome.runtime.sendMessage({ tipo: d.tipo, itens: d.itens }, function (resp) {
      var erro = chrome.runtime.lastError;
      window.postMessage({
        canal: RESPOSTA,
        id: d.id,
        ok: !erro && resp && resp.ok,
        erro: erro ? erro.message : (resp && resp.erro) || null,
        dados: resp || null
      }, '*');
    });
  });

  // Avisa o MAIN que a ponte esta de pe (caso ele tenha carregado antes)
  window.postMessage({ canal: RESPOSTA, id: 'pronta', ok: true, pronta: true }, '*');
})();
