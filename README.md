# UP - Utilitários CPlug para Balança

Extensão para apoiar a preparação e o envio de cargas de balança no ConnectPlug. Automatiza tarefas repetitivas do arquivo de carga e organiza o envio em lotes menores.

## Problema que resolve

O processo de carga para balanças envolve renomear arquivos, manter validades por produto e respeitar limites de quantidade da API. Quando isso é feito manualmente, são comuns arquivos com validade incorreta, lotes grandes demais e a necessidade de repetir toda a operação após uma falha.

## Solução desenvolvida

A extensão centraliza as validades, ajusta o arquivo baixado e divide o envio em lotes de até 500 registros. O usuário acompanha o andamento pela interface e pode reutilizar a configuração salva, reduzindo erros operacionais e o tempo gasto na preparação de cada carga.

## Funcionalidades

- renomeia arquivos baixados conforme o fluxo operacional;
- ajusta informações de validade durante o download;
- mantém uma lista local de validades por produto;
- divide o envio em lotes de até 500 registros;
- apresenta o andamento e o resultado do processamento pela interface da extensão.

## Destaques técnicos

- extensão Manifest V3;
- uso das APIs de downloads e armazenamento do navegador;
- processamento em lotes para contornar limites da API;
- interface em HTML e JavaScript sem dependências externas.

## Instalação

Consulte [INSTALAÇÃO.md](./INSTALA%C3%87%C3%83O.md) para o passo a passo de instalação e configuração.

Tecnologias principais: JavaScript, HTML, Chrome Extensions API e JSON.

## Autoria

Desenvolvido por [math7x](https://github.com/math7x).
