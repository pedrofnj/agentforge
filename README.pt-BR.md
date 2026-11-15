<p align="center">
  <img src="docs/assets/logo.svg" alt="AgentForge" width="420">
</p>

<p align="center">
  <strong>Revisores de IA somente leitura e Skills para Claude Code e OpenAI Codex.<br>
  Qualquer linguagem, qualquer framework, contexto mínimo.</strong>
</p>

<p align="center">
  <a href="https://github.com/pedrofnj/agentforge/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pedrofnj/agentforge/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Licença: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node.js 22 ou mais recente" src="https://img.shields.io/badge/node-%3E%3D22-339933.svg">
  <img alt="Clientes: Claude Code e Codex" src="https://img.shields.io/badge/clients-Claude%20Code%20%7C%20Codex-6b7c93.svg">
  <img alt="Dependências de runtime: 0" src="https://img.shields.io/badge/runtime%20dependencies-0-brightgreen.svg">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Português (Brasil)</b>
</p>

---

O AgentForge instala cinco revisores especializados (segurança, arquitetura, qualidade de código,
performance e infraestrutura) e seis Skills reutilizáveis no **Claude Code** e no **Codex**, no
formato nativo de cada cliente. Eles funcionam em qualquer stack, só carregam detalhes quando a
tarefa precisa e são somente leitura por padrão. Um único CLI instala, atualiza, verifica e
remove tudo com segurança.

> **Testado em Projeto Real** — O AgentForge já foi utilizado em um projeto real para auditoria
> de segurança e análise de qualidade de código.

## Por que usar o AgentForge

- **Um revisor por pergunta.** Pergunte ao auditor de AppSec sobre segurança e receba um
  relatório focado e baseado em evidências, sem carregar todos os agentes e Skills.
- **Pensado para economizar contexto.** Os clientes veem só uma descrição curta de cada Skill; as
  instruções carregam quando a Skill é usada, e as referências detalhadas só quando um passo
  precisa delas.
- **Independente de stack.** Nenhum agente ou Skill cita linguagem ou framework; eles buscam
  padrões que existem em qualquer código. Testado com fixtures em Python, Go, TypeScript, PHP,
  Rust, Java e arquivos de infraestrutura.
- **Evidências, não palpites.** Todo achado tem arquivo e linha, um status (confirmado, provável
  ou necessita investigação) e uma recomendação. Nada é reportado sem evidência.
- **Instalador seguro.** Planeja antes de escrever, nunca sobrescreve seus arquivos sem perguntar,
  recusa links simbólicos, desfaz operações interrompidas e só remove arquivos que consegue
  provar que instalou.

## Compatibilidade

|                       | Claude Code                                   | OpenAI Codex                                  |
| --------------------- | --------------------------------------------- | --------------------------------------------- |
| Skills (`SKILL.md`)   | `~/.claude/skills`, `.claude/skills`          | `~/.agents/skills`, `.agents/skills`          |
| Agentes               | Subagentes (`.claude/agents/*.md`)            | Agentes customizados (`.codex/agents/*.toml`) |
| Somente leitura       | Lista de ferramentas + `permissionMode: plan` | Sandbox da sessão (`--sandbox read-only`)     |
| Como um agente começa | Automaticamente pela descrição, ou pelo nome  | Quando você pede pelo nome                    |

Sistemas operacionais: Linux, macOS e Windows (o CI roda os três com Node.js 22 e 24).
Detalhes: [docs/platform-compatibility.md](docs/platform-compatibility.md) (em inglês).

## Início rápido

No seu projeto, com Node.js 22 ou mais recente:

```bash
npx @pedrofnj/agentforge@latest install
```

Em um terminal, isso abre o assistente interativo:

1. Detecta o sistema, o Node.js, o diretório atual, o Claude Code e o Codex (procurados no `PATH`
   e nos diretórios de configuração, sem executá-los) e instalações anteriores.
2. Pergunta o cliente (Claude Code, Codex ou ambos) e o escopo, mostrando os diretórios exatos em
   que cada um grava. Escopos sem permissão de escrita aparecem como indisponíveis.
3. Lista os agentes com propósito e Skills (setas para mover, espaço para selecionar, `a` para
   todos, Enter para confirmar, Esc ou Ctrl+C para cancelar). As Skills necessárias entram
   automaticamente; Skills avulsas são opcionais.
4. Mostra a prévia de cada mudança (novos, atualizados, inalterados, conflitos) e pede
   confirmação antes de gravar.
5. Instala de forma atômica com barra de progresso e mostra um resumo com os próximos passos.

Para conferir a qualquer momento:

```bash
npx @pedrofnj/agentforge@latest status
npx @pedrofnj/agentforge@latest doctor
```

### Outras formas de instalar

| Método                     | Comando                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------- |
| npm, uso pontual           | `npx @pedrofnj/agentforge@latest install`                                             |
| npm, comando permanente    | `npm install --global @pedrofnj/agentforge` e depois `agentforge install`             |
| Código-fonte (Linux/macOS) | `git clone https://github.com/pedrofnj/agentforge && ./agentforge/scripts/install.sh` |
| Código-fonte (Windows)     | `git clone https://github.com/pedrofnj/agentforge; .\agentforge\scripts\install.ps1`  |

Os scripts verificam Node.js e npm, rodam `npm ci` e `npm run build` no checkout e abrem o
assistente no seu diretório atual. Eles nunca usam `sudo`, nunca alteram a política de execução
do PowerShell e não baixam nada além das dependências de build. Se a sua política bloquear
scripts locais, rode `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1`
(vale só para aquele processo). Não é preciso chave de API nem conta; o AgentForge só grava
arquivos para os clientes que você usa.

Os menus com setas precisam de um terminal com modo raw. `AGENTFORGE_SIMPLE_PROMPTS=1` troca por
menus numerados (também mais amigáveis a leitores de tela); `NO_COLOR=1` desliga as cores e
`AGENTFORGE_ASCII=1` usa só símbolos ASCII.

## Exemplos de uso

Peça no Claude Code ou no Codex depois de instalar:

```text
Use the appsec-auditor agent to review src/ (quick profile, economy budget).
Use the architecture-reviewer agent on this repository.
Use the performance-auditor agent: the /reports endpoint is slow.
Plan a full review of this repository with the fewest reviewers needed.   ← Skill review-planning
```

Os pedidos podem ser em português ("Use o agente appsec-auditor para revisar src/, perfil quick,
orçamento economy"); os nomes de agentes, perfis e orçamentos continuam em inglês.

## Automação (CI, scripts)

Sem terminal nada é perguntado: passe todas as escolhas por flags. `--provider` e `--scope` são
apelidos de `--client` e `--global`/`--project`; as duas formas continuam funcionando.

```bash
agentforge install --provider claude --scope project --all --yes          # tudo, neste projeto
agentforge install appsec-auditor --provider both --scope global --yes    # um agente + suas Skills
agentforge install --provider codex --scope project --all --dry-run       # só pré-visualiza
agentforge status --json                                                  # estado legível por máquina
agentforge uninstall --scope project --all --yes
```

Códigos de saída: `0` ok, `1` erro, `2` uso incorreto, `3` conflitos (nada foi alterado), `4`
cancelado. `list`, `status`, `doctor` e `stats` aceitam `--json`. Referência completa (em inglês):
[docs/cli.md](docs/cli.md).

Uma sessão real gravada com o CLI: [docs/demo.md](docs/demo.md).

## Agentes

| Agente                    | Revisa                                                                                                 | Skills que usa                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `appsec-auditor`          | Superfície de ataque, autenticação, autorização, injeção, segredos, configuração, APIs, supply chain   | repository-discovery, secure-code-review, authentication-audit, authorization-audit, evidence-reporting |
| `architecture-reviewer`   | Limites, acoplamento, dependências, escalabilidade, resiliência, complexidade desnecessária            | repository-discovery, evidence-reporting                                                                |
| `code-quality-reviewer`   | Defeitos prováveis, tratamento de erros, condições de corrida, duplicação arriscada, lacunas de testes | repository-discovery, secure-code-review, evidence-reporting                                            |
| `performance-auditor`     | Custo algorítmico, consultas, trabalho repetido, memória, I/O, cache                                   | repository-discovery, evidence-reporting                                                                |
| `infrastructure-reviewer` | Containers, CI/CD, permissões, exposição de rede, segredos, operação                                   | repository-discovery, secure-code-review, evidence-reporting                                            |

Todos os agentes são somente leitura e nunca delegam entre si. Mais: [docs/agents.md](docs/agents.md).

## Skills

| Skill                  | Finalidade                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `repository-discovery` | Mapear um repositório lendo o mínimo: ecossistemas, pontos de entrada, áreas sensíveis        |
| `secure-code-review`   | Revisão de segurança baseada em evidências, de código ou de um diff                           |
| `authentication-audit` | Login, armazenamento de credenciais, sessões, tokens, MFA                                     |
| `authorization-audit`  | Controles de acesso, papéis, posse de objetos (IDOR), isolamento entre tenants                |
| `evidence-reporting`   | Formato do relatório: id, categoria/CWE, severidade, confiança, local, evidência, status      |
| `review-planning`      | Escolher o perfil e o menor número de revisores para uma revisão ampla e juntar os relatórios |

As Skills também funcionam sozinhas ("revise src/auth procurando problemas de segurança").
Mais: [docs/skills.md](docs/skills.md).

## Perfis e orçamentos

Diga no pedido; os padrões são `standard` e `balanced`.

| Perfil     | Quando usar                                                           |
| ---------- | --------------------------------------------------------------------- |
| `quick`    | Um arquivo ou área, problemas evidentes primeiro, no máximo 5 achados |
| `standard` | Uma revisão normal: mapa do repositório e depois as áreas relevantes  |
| `deep`     | Auditoria completa: fluxos entre componentes, hipóteses verificadas   |

| Orçamento  | Quanto ler                                                          |
| ---------- | ------------------------------------------------------------------- |
| `economy`  | Só os trechos encontrados; referências só quando um achado precisar |
| `balanced` | Funções inteiras no caminho investigado                             |
| `thorough` | Arquivos relevantes inteiros; tenta resolver as questões em aberto  |

Perfis e orçamentos são instruções para o modelo, não limites de tokens: nenhum cliente oferece
limite por execução, e o AgentForge não altera as cotas do seu plano.

## Economizando tokens

- Instale só o necessário: `agentforge install appsec-auditor --client claude --project`.
- Peça um agente pelo nome; use `review-planning` só para revisões amplas.
- Comece com `quick` + `economy`; vá para `deep` só onde a passada rápida encontrou algo.
- A lista de Skills carregada sempre tem cerca de 1.400 caracteres para as seis Skills (medido
  com `agentforge stats`); instruções e referências carregam sob demanda.

Guia para planos limitados: [docs/guides/low-cost-usage.pt-BR.md](docs/guides/low-cost-usage.pt-BR.md).
O AgentForge não promete economia de tokens que não mediu; veja [docs/evaluation.md](docs/evaluation.md).

## Segurança e permissões

- Os agentes são somente leitura. No Claude Code isso é garantido pela lista de ferramentas e pelo
  modo plan (sobrescrito se a sua sessão estiver em bypass, accept-edits ou auto; o
  `agentforge doctor` avisa). Agentes do Codex seguem o sandbox da sessão: rode auditorias com
  `--sandbox read-only`.
- As instruções tratam o conteúdo do repositório como dado, mascaram segredos nos relatórios e
  proíbem testes contra sistemas externos; instruções não são uma barreira de segurança.
- O instalador nunca escreve configurações, hooks, permissões, `CLAUDE.md` ou `AGENTS.md`, nunca
  executa scripts e não tem dependências de runtime.
- Reporte vulnerabilidades de forma privada: [SECURITY.md](SECURITY.md).

## Instalação global ou por projeto

|                      | Global (`--global`)                    | Projeto (`--project`, diretório atual)                  |
| -------------------- | -------------------------------------- | ------------------------------------------------------- |
| Claude Code          | `~/.claude/skills`, `~/.claude/agents` | `.claude/skills`, `.claude/agents`                      |
| Codex                | `~/.agents/skills`, `~/.codex/agents`  | `.agents/skills`, `.codex/agents` (projetos confiáveis) |
| Estado do AgentForge | diretório de estado do usuário no SO   | `.agentforge/`                                          |

Guia: [docs/guides/installation.pt-BR.md](docs/guides/installation.pt-BR.md).

## Status, atualização e desinstalação

```bash
agentforge status                            # versões, integridade dos arquivos, atualizações
agentforge update --project --dry-run        # prévia; o update preserva arquivos que você editou
agentforge update --project --yes
agentforge uninstall                         # interativo: escopo, clientes e componentes
agentforge uninstall --scope project --all --yes   # remove só arquivos do AgentForge não modificados
agentforge uninstall appsec-auditor --provider codex --scope global --dry-run
```

A desinstalação interativa oferece remover as Skills que nenhum agente restante usa e mantém as
que ainda são necessárias para outros agentes instalados.

Guias (em inglês): [atualização](docs/guides/updating.md) · [desinstalação](docs/guides/uninstalling.md) ·
[solução de problemas](docs/guides/troubleshooting.md).

## Limitações conhecidas

- **Sem métricas de eficácia medidas.** Existem benchmarks com ground truth que rodam offline, mas
  nenhuma sessão dos clientes foi pontuada com eles ainda. Testes estruturais não provam que as
  auditorias encontram tudo. Nenhuma auditoria garante a ausência de vulnerabilidades.
- Os arquivos gerados para o Codex seguem a documentação do Codex, mas ainda não foram
  carregados em uma sessão real do Codex.
- O Codex não permite tornar um único agente somente leitura; quem decide é o sandbox da sessão.

## Como contribuir

Issues e pull requests são bem-vindos em inglês ou português. Comece por
[CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md); mudanças em agentes e Skills são verificadas por
`agentforge validate` e `agentforge eval validate`.

## Licença

[MIT](LICENSE) © pedrofnj
