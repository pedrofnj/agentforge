# Guia de instalação

[English](installation.md) · **Português (Brasil)**

## 1. Obter o CLI

Requer Node.js 22+. Depois da primeira publicação no npm, este passo passa a ser
`npx @pedrofnj/agentforge@latest install` (ou `npm install --global @pedrofnj/agentforge`).
O pacote ainda não está no npm; gere-o a partir do código uma vez:

```bash
git clone https://github.com/pedrofnj/agentforge.git
cd agentforge
npm ci && npm run build && npm pack
npm install --global ./pedrofnj-agentforge-0.1.0.tgz
agentforge --version
```

Sem instalação global, use `node /caminho/para/agentforge/dist/cli/bin.js` no lugar de `agentforge`.

## 2. Escolher cliente e escopo

Rode os comandos **a partir do diretório do seu projeto** (o escopo de projeto usa o diretório atual).

| Objetivo                                        | Comando                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Guiado (pergunta cliente, escopo e componentes) | `agentforge install`                                                  |
| Claude Code, este projeto, tudo                 | `agentforge install --client claude --project --all --yes`            |
| Codex, este projeto, tudo                       | `agentforge install --client codex --project --all --yes`             |
| Os dois clientes, todos os seus projetos        | `agentforge install --client both --global --all --yes`               |
| Um agente e as Skills de que ele precisa        | `agentforge install appsec-auditor --client claude --project --yes`   |
| Uma Skill (e o que ela exige)                   | `agentforge install secure-code-review --client codex --global --yes` |
| Pré-visualizar sem escrever                     | acrescente `--dry-run`                                                |

Veja o que existe antes com `agentforge list` (`--type agent`, `--type skill`, `--domain appsec`,
`--verbose`).

Onde os arquivos ficam:

|             | Global                                                                          | Projeto                                           |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Claude Code | `~/.claude/skills/<id>/`, `~/.claude/agents/<id>.md`                            | `.claude/skills/<id>/`, `.claude/agents/<id>.md`  |
| Codex       | `~/.agents/skills/<id>/`, `~/.codex/agents/<id>.toml` (ou `$CODEX_HOME/agents`) | `.agents/skills/<id>/`, `.codex/agents/<id>.toml` |

No Windows, `~` é `%USERPROFILE%`. O AgentForge guarda seus próprios registros em `.agentforge/`
(projeto; versione o `manifest.json` se o time compartilhar a instalação) ou no diretório de
estado do usuário do sistema operacional (global). Ele nunca edita configurações dos clientes,
`CLAUDE.md` ou `AGENTS.md`.

## 3. Verificar

```bash
agentforge doctor            # os dois escopos e clientes
agentforge doctor --project --client codex --verbose
```

As linhas `OK`/`WARN`/`FAIL` cobrem Node.js, o catálogo, os diretórios dos clientes, operações
interrompidas, arquivos ausentes ou modificados e ressalvas de cada cliente (sandbox e projetos
confiáveis no Codex; modos de permissão do Claude Code que sobrescrevem o modo plan).

## 4. Usar

- **Claude Code:** abra uma nova sessão (reinicie se um diretório novo de nível superior foi
  criado) e peça "Use the appsec-auditor agent to review src/". O Claude Code também pode delegar
  sozinho quando o pedido combina com a descrição de um agente.
- **Codex:** abra uma sessão com `codex --sandbox read-only` e peça o agente pelo nome; o Codex
  não inicia agentes customizados por conta própria. Agentes de projeto só carregam em projetos
  confiáveis.

Se algo falhar, veja o [guia de solução de problemas](troubleshooting.md) (em inglês).
