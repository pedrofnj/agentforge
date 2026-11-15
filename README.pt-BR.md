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
  <img alt="Node.js >= 22" src="https://img.shields.io/badge/node-%3E%3D22-339933.svg">
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

> **Status: pré-lançamento (0.1.0).** O CLI e o catálogo estão completos e testados; o pacote
> **ainda não está no npm** (veja [Limitações conhecidas](#limitações-conhecidas)). Até lá,
> instale a partir de um pacote local, como mostrado abaixo.

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

> **Com a primeira publicação no npm (ainda não publicado):**
>
> ```bash
> npx @pedrofnj/agentforge@latest install
> ```
>
> Este comando vai funcionar quando a versão 0.1.0 estiver no npm. Até lá, use os passos abaixo.

**Hoje (a partir do código).** Requer Node.js 22 ou mais recente:

```bash
git clone https://github.com/pedrofnj/agentforge.git
cd agentforge
npm ci && npm run build && npm pack
npm install --global ./pedrofnj-agentforge-0.1.0.tgz
```

Depois, **no seu projeto**:

```bash
agentforge install     # pergunta: Claude Code, Codex ou ambos; este projeto ou global; quais agentes e Skills
agentforge doctor      # verifica a instalação
```

O instalador mostra o plano e pede confirmação antes de escrever qualquer coisa. O comando é
sempre `agentforge`, seja qual for a forma de instalação.

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

Instalação não interativa (CI, scripts):

```bash
agentforge install appsec-auditor --client claude --project --yes   # um agente + suas Skills
agentforge install --client both --global --all --yes               # tudo, para todos os projetos
agentforge install --client codex --project --all --dry-run         # só pré-visualiza
```

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

## Atualização e desinstalação

```bash
agentforge update --project --yes            # preserva arquivos que você editou
agentforge uninstall --project --all --yes   # remove só arquivos do AgentForge não modificados
agentforge uninstall appsec-auditor --client codex --global --dry-run
```

Guias (em inglês): [atualização](docs/guides/updating.md) · [desinstalação](docs/guides/uninstalling.md) ·
[solução de problemas](docs/guides/troubleshooting.md).

## Limitações conhecidas

- **Ainda não publicado no npm.** O pacote será `@pedrofnj/agentforge` (o comando é
  `agentforge`).
- **Eficácia ainda não medida.** Existem benchmarks com ground truth que rodam offline, mas nenhuma
  sessão real do Claude Code ou do Codex foi avaliada. Testes estruturais não provam que as
  auditorias encontram tudo. Nenhuma auditoria garante a ausência de vulnerabilidades.
- Os arquivos gerados seguem a documentação dos clientes, mas ainda não foram carregados em
  sessões reais dos dois clientes.
- O Codex não permite tornar um único agente somente leitura; quem decide é o sandbox da sessão.

## Como contribuir

Issues e pull requests são bem-vindos em inglês ou português. Comece por
[CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md); mudanças em agentes e Skills são verificadas por
`agentforge validate` e `agentforge eval validate`.

## Licença

[MIT](LICENSE) © pedrofnj
