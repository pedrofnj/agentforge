# Como contribuir com o AgentForge

[English](CONTRIBUTING.md) · **Português (Brasil)**

Obrigado por ajudar. Issues, discussões e pull requests são bem-vindos em **inglês ou
português**; código, documentação técnica e o texto dos componentes são escritos em inglês.

## Regras básicas

- Independência de stack: agentes e Skills não podem depender de linguagem ou framework.
  Conhecimento de tecnologias específicas vai em referências opcionais (`appliesWhen`), não no
  texto principal.
- Honestidade: nada de economia de tokens não medida, de afirmar que uma auditoria é completa, de
  CVEs, arquivos ou saídas de ferramentas inventados, nem de configurações não documentadas dos
  clientes.
- Simplicidade: zero dependências de runtime; dependências de desenvolvimento só com motivo claro.
- Segurança em primeiro lugar: nunca enfraqueça o padrão somente leitura, as checagens de
  caminho ou a regra do instalador de não sobrescrever arquivos.
- Siga o [Código de Conduta](CODE_OF_CONDUCT.md).

## Ambiente

```bash
git clone https://github.com/pedrofnj/agentforge.git
cd agentforge
npm ci
npm run check     # typecheck, lint, formatação, testes
npm run smoke     # build, empacota e testa o CLI empacotado em diretório temporário
```

Os testes nunca tocam seus `~/.claude`, `~/.codex` ou `~/.agents` reais. Para rodar o CLI a partir
do código, use `node dist/cli/bin.js` depois de `npm run build`, dentro de um projeto descartável.

## O que mudar e onde

| Mudança                     | Onde                                                        | Como verificar                                                       |
| --------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Uma Skill                   | `skills/<grupo>/<id>/` (manifesto, instruções, referências) | `agentforge validate`, [docs/skills.md](docs/skills.md)              |
| Um agente                   | `agents/<grupo>/<id>/`                                      | `agentforge validate`, [docs/agents.md](docs/agents.md)              |
| Um adaptador de cliente     | `src/adapters/<cliente>/`                                   | [docs/adapters.md](docs/adapters.md)                                 |
| Comportamento do instalador | `src/installer/`                                            | testes em `tests/installer/`                                         |
| Um caso de benchmark        | `evals/cases/*.json` + `evals/fixtures/`                    | `agentforge eval validate`, [docs/evaluation.md](docs/evaluation.md) |

Ao mudar um agente ou Skill, aumente a `version` no `manifest.json` e rode
`agentforge eval validate`. Se ele apontar crescimento de contexto ou mudança de alcance que você
quer de propósito, atualize as baselines conscientemente (veja docs/evaluation.md) e explique o
motivo no PR.

## Pull requests

1. Abra uma issue antes para mudanças maiores.
2. PRs focados; inclua testes para mudanças de comportamento e regressões.
3. `npm run check` e `npm run smoke` precisam passar; o CI roda os dois em Linux, macOS e Windows.
4. Adicione uma linha no `CHANGELOG.md` em `[Unreleased]`.
5. Descreva o que você verificou e o que não conseguiu verificar (por exemplo, o comportamento em
   sessões reais dos clientes).

## Problemas de segurança

Não abra issues públicas para vulnerabilidades. Veja [SECURITY.md](SECURITY.md).
