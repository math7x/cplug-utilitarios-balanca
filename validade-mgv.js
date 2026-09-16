// ============================================================
//  UP Tecnologias - correcao da validade no download do CPlug
//
//  O CPlug exporta o arquivo de carga da balanca com o campo de
//  validade zerado (000 nas posicoes 16-18 de cada linha).
//
//  Roda no MAIN world, intercepta o clique do link de download,
//  corrige o conteudo em memoria e baixa a versao corrigida.
//
//  A tabela NAO fica mais neste arquivo: vem do chrome.storage
//  atraves da ponte (ponte.js), e e editavel na tela da extensao.
//
//  TRES SITUACOES POSSIVEIS PARA UM PRODUTO
//   1. Tem validade definida     -> corrige com o valor da tabela
//   2. Marcado "sem validade"    -> deixa 000 de proposito, calado
//   3. Nao esta em lugar nenhum  -> registra como PENDENTE e abre
//                                   a janela para digitar na hora
// ============================================================

(function () {
  'use strict';

  if (window.__UP_VALIDADE_MGV) return;
  window.__UP_VALIDADE_MGV = true;

  var LARGURA    = 260;   // largura da linha no layout MGV6
  var POS_COD    = 3;     // posicoes 4-9   -> indices 3..8
  var POS_NOME   = 18;    // posicoes 19-43 -> descricao
  var POS_VAL    = 15;    // posicoes 16-18 -> indices 15..17
  var MAX_JANELA = 40;    // acima disto nao adianta pedir para digitar

  var PEDIDO   = 'UP_PONTE_PEDIDO';
  var RESPOSTA = 'UP_PONTE_RESPOSTA';

  var origClick = HTMLAnchorElement.prototype.click;
  var nossos = new WeakSet();
  var seq = 0;

  // --------------------------------------------------------- ponte ----
  function pedir(tipo, itens, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var id = 'up' + (++seq) + '_' + performance.now();
      var pronto = false;

      function ouvinte(ev) {
        if (ev.source !== window) return;
        var d = ev.data;
        if (!d || d.canal !== RESPOSTA || d.id !== id) return;

        pronto = true;
        window.removeEventListener('message', ouvinte);
        if (d.ok) resolve(d.dados || {});
        else reject(new Error(d.erro || 'ponte respondeu com erro'));
      }

      window.addEventListener('message', ouvinte);
      window.postMessage({ canal: PEDIDO, id: id, tipo: tipo, itens: itens }, '*');

      setTimeout(function () {
        if (pronto) return;
        window.removeEventListener('message', ouvinte);
        reject(new Error('a ponte com a extensao nao respondeu'));
      }, timeoutMs || 5000);
    });
  }

  // ------------------------------------------------------ validacao ---
  function ehArquivoMGV(txt) {
    if (!txt || txt.length < LARGURA) return false;

    var linhas = txt.split('\n');
    var validas = 0, total = 0;

    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i];
      if (l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1);
      if (!l.length) continue;

      total++;
      if (l.length === LARGURA &&
          /^\d{6}$/.test(l.substr(POS_COD, 6)) &&
          /^\d{6}$/.test(l.substr(9, 6))) {
        validas++;
      }
    }
    return total > 0 && (validas / total) >= 0.9;
  }

  // ------------------------------------------------- desconhecidos ----
  function acharDesconhecidos(txt, validades, semValidade) {
    var vistos = {}, out = [];
    var partes = txt.split('\n');

    for (var i = 0; i < partes.length; i++) {
      var l = partes[i];
      if (l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1);
      if (l.length < 18) continue;

      var cod = parseInt(l.substr(POS_COD, 6), 10);
      if (isNaN(cod) || vistos[cod]) continue;
      vistos[cod] = true;

      if (Object.prototype.hasOwnProperty.call(validades, cod)) continue;
      if (semValidade[cod]) continue;

      out.push({ cod: cod, nome: l.substr(POS_NOME, 25).trim() });
    }
    return out;
  }

  // -------------------------------------------------------- correcao --
  function corrigir(txt, validades) {
    var partes = txt.split('\n');
    var corrigidos = 0, semRegra = 0, total = 0;

    for (var i = 0; i < partes.length; i++) {
      var l = partes[i], cr = '';

      if (l.charCodeAt(l.length - 1) === 13) { cr = '\r'; l = l.slice(0, -1); }
      if (l.length < 18) continue;

      total++;
      var cod = parseInt(l.substr(POS_COD, 6), 10);

      if (!isNaN(cod) && Object.prototype.hasOwnProperty.call(validades, cod)) {
        var dias = String(validades[cod]);
        while (dias.length < 3) dias = '0' + dias;

        if (l.substr(POS_VAL, 3) !== dias) {
          l = l.substring(0, POS_VAL) + dias + l.substring(POS_VAL + 3);
          partes[i] = l + cr;
          corrigidos++;
        }
      } else {
        semRegra++;
      }
    }
    return { texto: partes.join('\n'), corrigidos: corrigidos, semRegra: semRegra, total: total };
  }

  // ----------------------------------------------------------- aviso --
  function aviso(msg, cor) {
    try {
      var d = document.createElement('div');
      d.textContent = msg;
      d.style.cssText = [
        'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
        'max-width:400px', 'padding:12px 16px', 'border-radius:8px',
        'font:600 13px/1.45 system-ui,Segoe UI,Arial,sans-serif',
        'white-space:pre-line', 'color:#fff', 'background:' + (cor || '#16a34a'),
        'box-shadow:0 6px 24px rgba(0,0,0,.35)', 'opacity:0', 'transition:opacity .2s'
      ].join(';');

      (document.body || document.documentElement).appendChild(d);
      requestAnimationFrame(function () { d.style.opacity = '1'; });

      setTimeout(function () {
        d.style.opacity = '0';
        setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 300);
      }, 8000);
    } catch (e) {}
  }

  // ---------------------------------------------------------- janela --
  function pedirValidades(itens) {
    return new Promise(function (resolve) {
      var fundo = document.createElement('div');
      fundo.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483646',
        'background:rgba(0,0,0,.65)', 'display:flex',
        'align-items:center', 'justify-content:center',
        'font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif'
      ].join(';');

      var cx = document.createElement('div');
      cx.style.cssText = [
        'background:#18181b', 'color:#e4e4e7', 'border:1px solid #3f3f46',
        'border-radius:12px', 'width:min(580px,92vw)', 'max-height:86vh',
        'display:flex', 'flex-direction:column',
        'box-shadow:0 20px 60px rgba(0,0,0,.6)'
      ].join(';');

      var plural = itens.length > 1;
      var topo = document.createElement('div');
      topo.style.cssText = 'padding:18px 20px 12px;border-bottom:1px solid #27272a';
      topo.innerHTML =
        '<div style="font-size:16px;font-weight:700;color:#fafafa">' +
        (plural ? itens.length + ' produtos novos sem validade'
                : 'Produto novo sem validade') + '</div>' +
        '<div style="margin-top:6px;color:#a1a1aa;font-size:13px">' +
        'Digite os dias de validade, ou marque <b>sem validade</b> para itens ' +
        'industrializados e taxas. O que ficar em branco sai com 000 e continua ' +
        'pendente na tela da extensão.</div>';

      var meio = document.createElement('div');
      meio.style.cssText = 'padding:8px 20px;overflow:auto;flex:1';

      var campos = [];
      itens.forEach(function (it) {
        var linha = document.createElement('div');
        linha.style.cssText =
          'display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #27272a';

        var txt = document.createElement('div');
        txt.style.cssText = 'flex:1;min-width:0';
        txt.innerHTML =
          '<div style="font-weight:600;color:#fafafa;overflow:hidden;text-overflow:ellipsis;' +
          'white-space:nowrap">' + it.nome + '</div>' +
          '<div style="color:#71717a;font-size:12px">código ' + it.cod + '</div>';

        var inp = document.createElement('input');
        inp.type = 'number'; inp.min = '0'; inp.max = '999';
        inp.placeholder = 'dias';
        inp.style.cssText = [
          'width:80px', 'padding:7px 10px', 'text-align:center',
          'background:#27272a', 'color:#fafafa', 'border:1px solid #52525b',
          'border-radius:6px', 'font:600 14px system-ui,Arial,sans-serif'
        ].join(';');

        var lab = document.createElement('label');
        lab.title = 'Nunca imprimir validade neste produto';
        lab.style.cssText =
          'display:flex;align-items:center;gap:5px;color:#a1a1aa;font-size:12px;cursor:pointer;white-space:nowrap';
        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.style.cssText = 'width:14px;height:14px;cursor:pointer';
        chk.addEventListener('change', function () {
          inp.disabled = chk.checked;
          inp.style.opacity = chk.checked ? '.4' : '1';
        });
        lab.appendChild(chk);
        lab.appendChild(document.createTextNode('sem validade'));

        linha.appendChild(txt); linha.appendChild(inp); linha.appendChild(lab);
        meio.appendChild(linha);
        campos.push({ cod: it.cod, nome: it.nome, input: inp, chk: chk });
      });

      var rodape = document.createElement('div');
      rodape.style.cssText =
        'padding:14px 20px;border-top:1px solid #27272a;display:flex;' +
        'align-items:center;gap:10px;justify-content:flex-end';

      function botao(t, principal) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = t;
        b.style.cssText = [
          'padding:9px 16px', 'border-radius:7px', 'cursor:pointer',
          'font:600 13px system-ui,Arial,sans-serif',
          principal ? 'background:#16a34a;color:#fff;border:1px solid #16a34a'
                    : 'background:transparent;color:#a1a1aa;border:1px solid #52525b'
        ].join(';');
        return b;
      }

      var bPular = botao('Baixar sem preencher', false);
      var bOk = botao('Salvar e baixar', true);
      rodape.appendChild(bPular); rodape.appendChild(bOk);

      cx.appendChild(topo); cx.appendChild(meio); cx.appendChild(rodape);
      fundo.appendChild(cx);
      (document.body || document.documentElement).appendChild(fundo);

      setTimeout(function () { if (campos[0]) campos[0].input.focus(); }, 60);

      function fechar(res) {
        if (fundo.parentNode) fundo.parentNode.removeChild(fundo);
        resolve(res);
      }

      bOk.addEventListener('click', function () {
        var saida = [];
        campos.forEach(function (c) {
          if (c.chk.checked) {
            saida.push({ cod: c.cod, nome: c.nome, semValidade: true });
            return;
          }
          var v = c.input.value.trim();
          if (v === '') return;
          var n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0 && n <= 999) saida.push({ cod: c.cod, nome: c.nome, dias: n });
        });
        fechar(saida);
      });

      bPular.addEventListener('click', function () { fechar([]); });

      fundo.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') fechar([]);
        if (e.key === 'Enter') { e.preventDefault(); bOk.click(); }
      });
    });
  }

  // -------------------------------------------------------- download --
  function baixar(texto, nome) {
    var url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
    var a = document.createElement('a');
    a.href = url; a.download = nome; a.style.display = 'none';
    nossos.add(a);
    document.body.appendChild(a);
    origClick.call(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 5000);
  }

  // --------------------------------------------------- interceptacao --
  HTMLAnchorElement.prototype.click = function () {
    var self = this;

    try {
      var href = String(self.href || '');

      if (!self.download || href.indexOf('blob:') !== 0 || nossos.has(self)) {
        return origClick.apply(self, arguments);
      }

      var textoArquivo = null;

      fetch(href)
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          textoArquivo = txt;

          if (!ehArquivoMGV(txt)) {
            nossos.add(self);
            origClick.call(self);
            return null;
          }
          return pedir('obterTabela');
        })
        .then(function (tab) {
          if (!tab) return;   // nao era o arquivo da balanca

          var validades = tab.validades || {};
          var semValidade = tab.semValidade || {};
          var desconhecidos = acharDesconhecidos(textoArquivo, validades, semValidade);

          function finalizar(novos) {
            (novos || []).forEach(function (n) {
              if (!n.semValidade && typeof n.dias === 'number') validades[n.cod] = n.dias;
            });

            var r = corrigir(textoArquivo, validades);
            baixar(r.texto, self.download);

            console.log('[UP validade] ' + r.corrigidos + '/' + r.total +
                        ' corrigidos, ' + r.semRegra + ' sem validade (000).');

            var resolvidos = (novos || []).length;
            var pendentes = desconhecidos.length - resolvidos;

            if (resolvidos) {
              aviso('Validade corrigida em ' + r.corrigidos + ' de ' + r.total + ' itens.\n' +
                    resolvidos + ' produto(s) novo(s) cadastrado(s).' +
                    (pendentes ? '\n' + pendentes + ' ainda pendente(s) — veja o ícone da extensão.' : ''),
                    pendentes ? '#b45309' : '#16a34a');
            } else if (desconhecidos.length) {
              aviso('Validade corrigida em ' + r.corrigidos + ' de ' + r.total + ' itens.\n' +
                    desconhecidos.length + ' produto(s) novo(s) sairam com 000.\n' +
                    'Estão listados no ícone da extensão.', '#b45309');
            } else {
              aviso('Validade corrigida em ' + r.corrigidos + ' de ' + r.total + ' itens.', '#16a34a');
            }
          }

          if (!desconhecidos.length) { finalizar([]); return; }

          // Registra na extensao ANTES de perguntar: se ela pular a janela,
          // os codigos continuam listados na tela de gestao.
          pedir('registrarPendentes', desconhecidos).catch(function () {});

          if (desconhecidos.length > MAX_JANELA) {
            console.warn('[UP validade] ' + desconhecidos.length +
                         ' produtos sem cadastro:',
                         desconhecidos.map(function (d) { return d.cod; }).join(', '));
            aviso(desconhecidos.length + ' produtos novos sem validade — não abri a janela ' +
                  'porque são muitos.\nEstão listados no ícone da extensão.', '#b45309');
            finalizar([]);
            return;
          }

          pedirValidades(desconhecidos).then(function (novos) {
            if (!novos.length) { finalizar([]); return; }
            pedir('definir', novos)
              .catch(function (e) {
                console.error('[UP validade] nao consegui salvar:', e);
                aviso('Não consegui salvar o cadastro na extensão. A correção vale só para este download.', '#b45309');
              })
              .then(function () { finalizar(novos); });
          });
        })
        .catch(function (e) {
          console.error('[UP validade] Falhou, baixando o original:', e);
          aviso('Não consegui corrigir a validade:\n' + (e && e.message ? e.message : e) +
                '\nO arquivo foi baixado SEM correção.', '#b91c1c');
          try { nossos.add(self); origClick.call(self); } catch (e2) {}
        });

      return;   // cancela o clique original

    } catch (e) {
      console.error('[UP validade] Erro inesperado, seguindo normal:', e);
      return origClick.apply(self, arguments);
    }
  };

  console.log('[UP validade] Ativo (tabela vem da extensão).');
})();
