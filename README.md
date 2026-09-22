# Field Connect Pro

Certo, vou montar uma descrição detalhada pra você copiar e colar no Lovable. Deixa eu estruturar isso bem:



---



## ESPECIFICAÇÃO TÉCNICA - MVP PROSEGUR FIELD APP



### 1. OBJETIVO GERAL

Criar uma web app mobile-first que transforma uma planilha Excel (10 folhas com ~300 clientes) em uma ferramenta operacional de campo. O app deve armazenar dados localmente, permitir trabalho offline, registrar status/observações, e exportar dados atualizados de volta para Excel.



### 2. DADOS E ESTRUTURA



**Modelo de Cliente (localStorage):**

```

{

  id: "uuid-ou-hash-do-contrato",

  contractNumber: string,

  name: string,

  phone: string,

  zipCode: string,

  address: string,

  type: "residential" | "commercial",

  status: "pending" | "withdrawn" | "refused" | "scheduled" | "analysis",

  

  // Para clientes agendados

  scheduledFor: ISO8601DateTime | null,

  

  // Histórico

  history: [

    {

      timestamp: ISO8601DateTime,

      status: string,

      note: string

    }

  ],

  

  // Metadata

  lastModified: ISO8601DateTime,

  originalData: object // cópia dos dados originais do Excel (pra preservar colunas extras)

}

```



**Storage Global (localStorage):**

```

{

  clients: [...],

  importedAt: ISO8601DateTime,

  importedFileName: string,

  originalExcelCopy: Blob (ou referência) // guarda o arquivo original pra exportação

}

```



### 3. FLUXOS PRINCIPAIS



#### 3.1 IMPORTAÇÃO (Menu → Importar)

1. Usuário clica no menu (3 pontinhos) → "Importar Excel"

2. Upload do arquivo .xlsx

3. App lê **todas as 10 folhas** usando SheetJS

4. Detecta coluna de contrato (identificador único)

5. Parseia: nome, telefone, CEP, endereço, tipo

6. **Merge strategy:** Se contrato já existe no localStorage, não sobrescreve status/observações, apenas atualiza dados de contato

7. Salva no localStorage + guarda cópia do arquivo original

8. Mostra resumo: "150 clientes novos, 50 atualizados"



#### 3.2 TELA PRINCIPAL (Dashboard)

Mostra:



- **Contador de status:** X Pendentes | Y Agendados Hoje | Z Em Análise | W Recusados | V Retirados

- **Próximos clientes:** Lista dos 3-5 pendentes mais próximos por CEP (ordenado)

- **Agendamentos de hoje:** Clientes que voltam hoje/amanhã

- Botão grande: **"Começar Trabalho"** → leva pro primeiro cliente pendente



#### 3.3 TELA DE CLIENTE (Main Working Screen)

Mostra:

```

[← voltar] [Detalhes do Cliente] [🔔 lembrete]

────────────────────────────────

CONTRATO: #12345-A

Nome do Cliente: João Silva

Tipo: Comercial

Telefone: +351 912 345 678  [LIGAR 📞]

CEP: 4700-003  [Ver no Maps 🗺️]

Endereço: Rua X, 123, Braga



Observações (histórico):

• 2025-09-21 14:30 - Retirado: "Equipamento desmontado sem problemas"

• 2025-09-20 10:15 - Agendado para: 2025-09-21 14:00

• 2025-09-19 09:45 - Pendente



────────────────────────────────

[Em Análise 🔍] [Retirado ✅] [Recusado ❌] [Agendar 📅]

```



**Botão Ligar:**

- Abre `tel:+351912345678` (discador nativo Android)



**Botão Ver no Maps:**

- Abre Google Maps com o endereço (intent: `https://maps.google.com/?q=rua+x+123+braga`)



#### 3.4 POPUPS DE STATUS (cada um diferente)



**Retirado:**

```

┌─────────────────────────┐

│ Equipamento Retirado    │

│                         │

│ Observação (opcional):  │

│ [________________]      │

│                         │

│ [Cancelar] [Confirmar]  │

└─────────────────────────┘

→ Salva status + obs + timestamp

→ Move pro próximo cliente

```



**Recusado:**

```

┌─────────────────────────┐

│ Cliente Recusado        │

│                         │

│ Observação (opcional):  │

│ [________________]      │

│                         │

│ [Cancelar] [Confirmar]  │

└─────────────────────────┘

→ Idem

```



**Em Análise:**



```

┌──────────────────────────┐

│ Enviado para Análise     │

│                          │

│ Motivo/Observação:       │

│ [_____________________]  │

│ Ex: "Cliente diz que     │

│ equipamento foi comprado"│

│                          │

│ [Cancelar] [Confirmar]   │

└──────────────────────────┘

→ Salva com obs obrigatória (ou avisa se deixar em branco)

→ Marca como "analysis"

→ Próximo cliente

```



**Agendar:**

```

┌──────────────────────────┐

│ Agendar Retorno          │

│                          │

│ Data: [DD/MM/YYYY]       │

│ Hora: [HH:MM]           │

│                          │

│ Observação (opcional):   │

│ [_____________________]  │

│ Ex: "Cliente atendeu,   │

│ agendou pra amanhã 10h" │

│                          │

│ [Cancelar] [Confirmar]   │

└──────────────────────────┘

→ Salva com data/hora

→ Status = "scheduled"

→ Próximo cliente

→ Cliente volta pra fila de pendentes quando passa a hora

```



#### 3.5 FLUXO DE AGENDADOS

- Clientes com `scheduledFor` no passado → voltam automaticamente pra "pending" quando app abre

- Dashboard mostra: "Você tem 2 clientes agendados para hoje"

- Seção especial: "Agendados" (filtrável)



#### 3.6 EXPORTAÇÃO (Menu → Exportar)

1. Usuário clica "Exportar"

2. App lê o arquivo Excel original (salvo no localStorage)

3. **Adiciona/atualiza colunas no final:**

   - `Status_Prosegur` (pending|withdrawn|refused|scheduled|analysis)

   - `Status_Data` (ISO datetime da última mudança)

   - `Observacao_Ultima` (última obs registrada)

   - `Agendado_Para` (se status = scheduled, mostra data/hora)

   - `Historico_Resumido` (últimas 3 mudanças em texto)

4. **NÃO toca nas colunas originais** — só adiciona no final

5. Gera novo arquivo .xlsx

6. Faz download (ou opção de copiar pra clipboard)



### 4. BUSCA E FILTROS



**Busca (topo):**

- Campo de texto que filtra por: nome, contrato, telefone, CEP

- Resultado instantâneo (tipo autocomplete)



**Filtros (menu ou sidebar):**

- Status (Pendente, Retirado, Recusado, Em Análise, Agendado)

- Tipo (Residencial, Comercial)

- CEP range (opcional pra V1)

- Data de retorno (para agendados)



### 5. TECNOLOGIA RECOMENDADA



**Frontend:**

- React + TypeScript (ou Svelte se quiser mais leve)

- Vite (build rápido)

- TailwindCSS (styling mobile-first)



**Libraries:**

- `SheetJS` (xlsx) — importar/exportar Excel

- `date-fns` — manipular datas

- `zustand` ou `pinia` — state management simples

- `lucide-react` — ícones



**Storage:**

- localStorage (nativo do browser) — 5-10MB é suficiente pra 300 clientes



**Deployment:**

- Web pura (HTML + JS), roda em qualquer browser

- Acesso via URL no celular

- Se depois virar APK Android, usa Capacitor ou Cordova



### 6. FLUXO DE TRABALHO DIA A DIA



```

1. Abre app no celular

2. Dashboard mostra: "5 pendentes, 2 agendados pra hoje"

3. Clica "Começar" → primeira tela de cliente (ordenado por CEP)

4. Vê contrato, nome, telefone, endereço

5. Clica "LIGAR" → discador Android abre

6. Fala com cliente

7. Clica "Retirado" → popup com campo de obs

8. Digita: "Desmontado, sem problemas" (ou deixa em branco)

9. Clica "OK" → **próximo cliente aparece automaticamente**

10. Repete até acabar

11. No final do dia, clica Menu → "Exportar"

12. Baixa novo Excel com status + obs

13. Envia pro coordenador ou sistema da Prosegur

```



### 7. CONSIDERAÇÕES DE UX (MOBILE)



- **Botões grandes** — mínimo 44px × 44px (toque confortável)

- **Texto em contraste alto** — lê no sol do carro

- **Sem scrolls desnecessários** — informação crítica acima da dobra

- **Feedback visual** — quando clica em algo, pisca/muda cor

- **Sem confirmações chatas** — um OK, pronto

- **Voltar fácil** — seta no topo pra voltar pra lista



### 8. SEGURANÇA E PRIVACIDADE (MVP)



- Dados armazenados em localStorage (local só, sem servidor)

- Se celular for roubado: dados estão lá, mas é app do próprio usuário

- Sem login necessário (é app pessoal)

- Se virar produto (depois): adiciona autenticação + backend



### 9. PRÓXIMAS ITERAÇÕES (pós-MVP)



- Geocoding real (se precisar mesmo)

- Notificações push pra horários agendados

- Sincro com servidor da Prosegur

- Modo offline melhorado

- Relatórios de produtividade (X clientes visitados/dia)

- Rota otimizada por mapa real

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b22beb6c-718a-4a7c-8ed9-ef7c69c76bc2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
