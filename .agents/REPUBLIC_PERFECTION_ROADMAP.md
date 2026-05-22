# Republic Perfection Roadmap

> **Status**: Modules CREATED, wiring PENDING
> **Last Updated**: 2026-03-17
> **Goal**: Elevate all Republic subsystems from ~6/10 to 10/10 reality score

---

## What Was Done ✅

Four new modules were created and type-checked (0 errors):

| File | Phase | Purpose |
|------|-------|---------|
| `src/republic/republic-sqlite.ts` | 1 | SQLite WAL-mode DB: 6 tables (state snapshots, goals, economy ledger, governance log, dialogue transcripts, events archive) |
| `src/republic/citizen-dialogue.ts` | 2 | LLM-powered citizen conversations (Groq→Gemini→OpenAI fallback, sentiment analysis, agreement detection, memory creation) |
| `src/republic/economy-ledger.ts` | 3 | Double-entry accounting: per-citizen LLM cost tracking, artifact rewards, salary system, GDP/Gini/inflation indicators |
| `src/republic/citizen-external-agent.ts` | 5 | External agency: GitHub commits, channel replies, constitutional approval, rate limiting, audit logging |
| `src/republic/types.ts` | — | Added `Dialogue` + `ExternalAction` to `EventType` union |

Phase 4 (Governance) is handled via `governance_log` table + `recordGovernanceVote()`/`getBillVotes()` APIs in `republic-sqlite.ts`.

---

## What Still Needs Wiring 🔴

The new modules are standalone. They need to be **imported and called** from existing files to become active.

### Phase 1 Wiring: SQLite Persistence

#### 1.1 Wire `memory.ts` → SQLite backup

**File**: `src/republic/memory.ts`
**What**: The `citizenMemories` Map (line 145) and `collectiveMemory` array (line 148) are in-memory only.
**How**:
```typescript
// At the top, import:
import { saveStateSnapshot, loadLatestSnapshot } from "./republic-sqlite.js";

// In exportMemoryState(), also save to SQLite:
// After building the state object, call:
// saveStateSnapshot(currentTick, citizenCount, genomeCount, JSON.stringify(state));

// In module initialization, try to restore from SQLite:
// const snapshot = await loadLatestSnapshot();
// if (snapshot) importMemoryState(JSON.parse(snapshot.stateJson));
```

#### 1.2 Wire `citizen-autonomy.ts` → SQLite goals

**File**: `src/republic/citizen-autonomy.ts`
**What**: `citizenGoals` Map + JSON file persistence → replace with SQLite `citizen_goals` table.
**How**:
```typescript
// Import:
import { upsertGoal, getActiveGoal, getAllActiveGoals } from "./republic-sqlite.js";

// Replace setCitizenGoal() to also call upsertGoal()
// Replace getCitizenGoal() to fall back to getActiveGoal() from SQLite
// Remove persistAutonomyState() / restoreAutonomyState() JSON logic
```

#### 1.3 Wire `state.ts` → snapshot on tick

**File**: `src/republic/state.ts` (or wherever state is initialized)
**What**: On startup, load from SQLite. Every 50 ticks, save snapshot.
**How**:
```typescript
import { saveStateSnapshot, loadLatestSnapshot } from "./republic-sqlite.js";

// During init:
const snapshot = await loadLatestSnapshot();
if (snapshot) {
  // Restore state from snapshot.stateJson
}

// Every 50 ticks (in tick orchestrator or state manager):
if (state.currentTick % 50 === 0) {
  await saveStateSnapshot(
    state.currentTick,
    state.citizens.length,
    state.genomePool.length,
    JSON.stringify(state)
  );
}
```

---

### Phase 2 Wiring: Citizen Dialogue

#### 2.1 Add `dialogueTick()` to tick orchestrator

**File**: `src/republic/agent-runtime.ts`
**What**: Call `dialogueTick(s)` every 5 ticks.
**How**:
```typescript
// Import at top:
import { dialogueTick } from "./citizen-dialogue.js";

// In the main agentTick() function or in the tick orchestrator handler registry:
if (s.currentTick % 5 === 0) {
  const dialogueResult = await dialogueTick(s);
  // Optionally log: dialogueResult.dialoguesCompleted conversations
}
```

#### 2.2 Add dialogue prompts to citizen-prompt.ts

**File**: `src/republic/citizen-prompt.ts`
**What**: Add `buildDialoguePrompt()` (already built into `citizen-dialogue.ts` inline, but could be extracted here for reuse).

#### 2.3 Replace probability interactions in social-life.ts

**File**: `src/republic/social-life.ts` (or `social-fabric.ts`)
**What**: Replace random social interaction probability with dialogue-driven outcomes.
**How**: After a dialogue tick runs, use its results to update friendship scores instead of pure random chance.

---

### Phase 3 Wiring: Living Economy

#### 3.1 Track LLM costs in agent-runtime.ts

**File**: `src/republic/agent-runtime.ts`
**What**: After every LLM call, debit the citizen's credits.
**How**:
```typescript
// Import:
import { debitLLMCost, creditArtifactReward } from "./economy-ledger.js";

// After cloud inference returns (in the agentTick flow):
const result = await aprCloudInference(citizen, state);
await debitLLMCost(citizen.id, "gemini", tokensUsed, state.currentTick);

// After successful tool execution that produces an artifact:
await creditArtifactReward(citizen.id, "code", qualityScore, state.currentTick);
```

#### 3.2 Wire salary + economy tick

**File**: `src/republic/economy-engine.ts`
**What**: Call `economyLedgerTick(s)` every tick.
**How**:
```typescript
import { economyLedgerTick } from "./economy-ledger.js";

// In the economy engine tick:
await economyLedgerTick(state);
```

---

### Phase 4 Wiring: Deliberative Governance

#### 4.1 LLM-reasoned voting in government.ts

**File**: `src/republic/government.ts`
**What**: When a bill is proposed, instead of random weighted voting, send the bill to 5-7 citizens for LLM review.
**How**:
```typescript
import { recordGovernanceVote, getBillVotes } from "./republic-sqlite.js";

// When voting on a bill:
// 1. Select 5-7 diverse citizens
// 2. For each: build prompt with bill text + citizen personality + goals
// 3. LLM returns: { vote: "approve"|"reject"|"abstain", rationale: "...", confidence: 0.8 }
// 4. Record: await recordGovernanceVote({ bill_id, citizen_id, citizen_name, vote, rationale, confidence, tick })
// 5. Tally votes from getBillVotes(billId)
```

#### 4.2 LLM-reasoned adjudication in judicial-system.ts

**File**: `src/republic/judicial-system.ts`
**What**: Judge citizens use LLM to reason about disputes with precedent analysis.

---

### Phase 5 Wiring: External Agency

#### 5.1 Register external tools in tool registry

**File**: `src/republic/tools.ts`
**What**: Add `github_commit`, `channel_reply`, `research_publish` as available citizen tools.
**How**:
```typescript
import { requestExternalAction } from "./citizen-external-agent.js";

// Register tools:
REPUBLIC_TOOLS.set("external_publish", {
  name: "external_publish",
  description: "Publish work externally (GitHub, channels)",
  execute: async (params, ctx) => {
    return requestExternalAction(ctx.state, ctx.citizen, params.type, params.target, params.content);
  }
});
```

#### 5.2 Wire HPICS intelligence into citizen tools

**File**: `src/republic/tools.ts` or `src/republic/real-execution.ts`
**What**: Allow citizens with `IntelligenceAnalyst` specialization to call HPICS endpoints.

---

## Verification Commands

After each wiring step, run:

```bash
# Type check (use tsgo, NOT tsc — tsc crashes on Node.js v25)
npx tsgo --noEmit

# Unit tests
npx vitest run --config vitest.unit.config.ts

# Build
pnpm build
```

---

## Reality Score Tracking

| Subsystem | Before | After Modules | After Full Wiring |
|-----------|:------:|:------------:|:-----------------:|
| Persistence | 4/10 | 7/10 | **10/10** |
| Social Fabric | 4/10 | 7/10 | **9/10** |
| Citizen Identity | 3/10 | 5/10 | **8/10** |
| Economy | 5/10 | 7/10 | **9/10** |
| Governance | 5/10 | 7/10 | **9/10** |
| External Comms | 3/10 | 7/10 | **9/10** |
| Agent Reproduction | 9/10 | 9/10 | **10/10** |
| Tool Production | 9/10 | 9/10 | **10/10** |
| Tick Orchestrator | 10/10 | 10/10 | **10/10** |

---

## Key Files Reference

| Module | Path | Lines | Description |
|--------|------|:-----:|-------------|
| Republic SQLite | `src/republic/republic-sqlite.ts` | ~595 | WAL-mode DB, 6 tables, full CRUD |
| Citizen Dialogue | `src/republic/citizen-dialogue.ts` | ~420 | LLM conversations, sentiment, memories |
| Economy Ledger | `src/republic/economy-ledger.ts` | ~230 | Double-entry accounting, GDP/Gini |
| External Agent | `src/republic/citizen-external-agent.ts` | ~300 | GitHub, channels, constitutional gate |
| Agent Runtime | `src/republic/agent-runtime.ts` | ~1740 | **Wire phases here** |
| Memory System | `src/republic/memory.ts` | ~635 | **Wire Phase 1 here** |
| Citizen Autonomy | `src/republic/citizen-autonomy.ts` | ~800 | **Wire Phase 1 here** |
| Government | `src/republic/government.ts` | — | **Wire Phase 4 here** |
| Tick Orchestrator | `src/republic/tick-orchestrator.ts` | ~1377 | DAG scheduler, circuit breakers |
| Genetics | `src/republic/genetics.ts` | ~398 | Neural genomes, crossover, mutation |
| Evolution | `src/republic/evolution.ts` | ~567 | Fitness eval, citizen breeding |
| Self-Replication | `src/republic/self-replication.ts` | ~834 | Process forking, code review |
| Real Execution | `src/republic/real-execution.ts` | ~3529 | 40+ tool executors |
| Cloud Inference | `src/republic/cloud-inference.ts` | ~620 | 5-provider LLM chain |

---

## Agent Reproduction: CONFIRMED REAL

- **`genetics.ts`**: Xavier-initialized neural genomes, magnitude-based crossover, Gaussian mutation
- **`evolution.ts`**: 7-component fitness from REAL action data → tournament selection → `reproduceCitizens()` creates genuine child citizens
- **`self-replication.ts`**: `child_process.fork()` spawns actual OS processes
- **`real-execution.ts`**: 40+ tool executors write real files, run real shell commands, provision real Docker containers
