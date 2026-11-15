# Guia de instalação

[English](installation.md) · **Português (Brasil)**

## 1. Obter o CLI

Requer Node.js 22+. Rode sob demanda, sem instalar:

```bash
npx @pedrofnj/agentforge@latest install
```

Ou instale o comando `agentforge` uma vez:

```bash
npm install --global @pedrofnj/agentforge
agentforge --version
```

Ou compile a partir de um clone do repositório (os scripts verificam Node.js e npm, rodam
`npm ci` e `npm run build` no checkout e abrem o instalador no seu diretório atual; sem `sudo`,
sem alterar a política de execução, sem scripts remotos):

```bash
git clone https://github.com/pedrofnj/agentforge
cd meu-projeto
../agentforge/scripts/install.sh            # Linux, macOS
```

```powershell
git clone https://github.com/pedrofnj/agentforge
cd meu-projeto
..\agentforge\scripts\install.ps1          # Windows; se a política bloquear:
powershell -NoProfile -ExecutionPolicy Bypass -File ..\agentforge\scripts\install.ps1
```

Os exemplos abaixo usam `agentforge`; com npx, escreva `npx @pedrofnj/agentforge@latest` no lugar.
Para trabalhar no próprio AgentForge, veja [CONTRIBUTING.pt-BR.md](../../CONTRIBUTING.pt-BR.md).

## 2. Escolher cliente e escopo

Rode os comandos **a partir do diretório do seu projeto** (o escopo de projeto usa o diretório atual).

| Objetivo                                 | Comando                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Assistente guiado (pergunta tudo)        | `agentforge install`                                                          |
| Claude Code, este projeto, tudo          | `agentforge install --provider claude --scope project --all --yes`            |
| Codex, este projeto, tudo                | `agentforge install --provider codex --scope project --all --yes`             |
| Os dois clientes, todos os seus projetos | `agentforge install --provider both --scope global --all --yes`               |
| Um agente e as Skills de que ele precisa | `agentforge install appsec-auditor --provider claude --scope project --yes`   |
| Uma Skill (e o que ela exige)            | `agentforge install secure-code-review --provider codex --scope global --yes` |
| Pré-visualizar sem escrever              | acrescente `--dry-run`                                                        |

`--provider`/`--scope` são apelidos de `--client` e `--global`/`--project`; as duas formas funcionam.

O assistente mostra o sistema, a versão do Node.js, os clientes detectados (procurados no `PATH`
e nos diretórios de configuração, sem executá-los) e o que já está instalado. Depois pergunta o
cliente, o escopo (com os diretórios exatos; os sem permissão de escrita ficam indisponíveis), os
agentes (com propósito e Skills; as Skills necessárias entram automaticamente) e Skills avulsas
opcionais, mostra a prévia e pede confirmação antes de gravar. Teclas: setas para mover, espaço
para selecionar, `a` para todos, Enter para confirmar, Esc ou Ctrl+C para cancelar.

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
agentforge status            # o que está instalado, versões, integridade, atualizações
agentforge doctor            # os dois escopos e clientes
agentforge doctor --project --client codex --verbose
```

As linhas `OK`/`WARN`/`FAIL` cobrem Node.js, o catálogo, os diretórios e executáveis dos
clientes, permissões de escrita, operações interrompidas, arquivos ausentes ou modificados,
componentes que saíram do catálogo, arquivos de configuração do Claude Code inválidos e ressalvas de cada cliente (sandbox e projetos
confiáveis no Codex; modos de permissão do Claude Code que sobrescrevem o modo plan).

## 4. Usar

- **Claude Code:** abra uma nova sessão (reinicie se um diretório novo de nível superior foi
  criado) e peça "Use the appsec-auditor agent to review src/". O Claude Code também pode delegar
  sozinho quando o pedido combina com a descrição de um agente.
- **Codex:** abra uma sessão com `codex --sandbox read-only` e peça o agente pelo nome; o Codex
  não inicia agentes customizados por conta própria. Agentes de projeto só carregam em projetos
  confiáveis.

Se algo falhar, veja o [guia de solução de problemas](troubleshooting.md) (em inglês).
