# Usando o AgentForge com um plano limitado

[English](low-cost-usage.md) · **Português (Brasil)**

O AgentForge não altera os limites nem as cotas do seu plano. O que ele faz é manter cada pedido
pequeno: descrições curtas das Skills, instruções que carregam sob demanda e revisores que leem
de forma seletiva. Estes hábitos ajudam:

1. **Instale só o que você usa.** `agentforge install appsec-auditor --client claude --project --yes`
   instala um agente e as cinco Skills de que ele precisa, nada além. Cada Skill instalada
   acrescenta uma linha curta à lista de Skills que o cliente carrega sempre (as seis juntas têm
   cerca de 1.400 caracteres, medidos com `agentforge stats`).
2. **Peça um agente pelo nome.** "Use the appsec-auditor agent to ..." evita que o cliente tente
   vários. Use `review-planning` só para revisões realmente amplas.
3. **Escolha o perfil de propósito.**
   - `quick`: um arquivo ou pasta, uma suspeita para checar, uma olhada antes do commit. Até 5 achados.
   - `standard` (padrão): uma revisão normal de uma funcionalidade ou serviço.
   - `deep`: antes de um release, ou depois que o `quick`/`standard` encontrou algo que vale rastrear.
4. **Escolha o orçamento.** `economy` lê só os trechos encontrados e abre referências só quando um
   achado depende delas; `thorough` lê arquivos inteiros. Combine à vontade: `quick + economy` é a
   triagem mais barata; `deep + economy` rastreia amplamente, mas lê pouco em cada passo.
5. **Restrinja o escopo no pedido.** "Revise src/payments" é melhor que "revise o repositório".
6. **Evite cadeias de delegação.** Os agentes nunca iniciam outros agentes; não peça a um agente
   para "usar todos os revisores".
7. **Reaproveite o contexto.** Na mesma sessão, faça perguntas de acompanhamento em vez de
   recomeçar; o mapa do repositório é reaproveitado quando já existe.

Orçamentos e perfis são instruções: os modelos costumam segui-los, mas os clientes não impõem
limite de tokens por pedido. Para ver o consumo real, consulte o seu cliente (por exemplo, `/usage` no Claude
Code) ou importe uma execução com `agentforge eval import`
([evaluation.md](../evaluation.md), em inglês).
