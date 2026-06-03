<template>
  <div :class="['rec-card', rec.status !== 'pending' && 'rec-card--resolved']">
    <div class="rec-head">
      <span :class="['rec-priority-pill', `rec-priority-${rec.priority}`]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
        {{ rec.priority.toUpperCase() }}
      </span>
      <span class="rec-kpi">{{ titleCase(rec.target_kpi_name) }}</span>
      <span v-if="showTargetType" class="rec-target-type" :class="`rec-type-${rec.target_type}`">
        {{ rec.target_type.replace('_', ' ') }}
      </span>
      <span v-if="rec.status !== 'pending'" class="rec-status">
        <span :class="['pill', rec.status === 'applied' ? (rec.auto_applied ? 'pill-blue' : 'pill-green') : 'pill-muted']">
          <svg v-if="rec.status === 'applied'" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {{ rec.status === 'applied' && rec.auto_applied ? 'auto applied' : rec.status }}
        </span>
      </span>
    </div>

    <div class="rec-action">{{ rec.action }}</div>
    <div v-if="rec.suggested_change" class="rec-body">{{ rec.suggested_change }}</div>

    <!-- Agent config field diff (before → after) -->
    <div v-if="rec.agent_field && rec.current_value" class="rec-diff">
      <div class="diff-label">{{ rec.agent_field }}</div>
      <div class="diff-row">
        <div class="diff-before">{{ rec.current_value }}</div>
        <div class="diff-arrow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
        <div class="diff-after">{{ rec.suggested_value }}</div>
      </div>
    </div>

    <!-- Prompt diff viewer -->
    <div v-if="rec.target_type === 'prompt' && rec.updated_prompt" class="prompt-diff-wrap">
      <div class="prompt-diff-bar">
        <span class="prompt-diff-bar-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Prompt changes
        </span>
        <div class="diff-bar-right">
          <button v-if="!showDiff" class="dvt-btn dvt-btn--show" @click="showDiff = true">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            View diff
          </button>
          <template v-if="showDiff">
            <div v-if="hasDiff" class="diff-view-toggle">
              <button :class="['dvt-btn', diffView === 'diff' && 'dvt-btn--active']" @click="diffView = 'diff'">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                Diff
              </button>
              <button :class="['dvt-btn', diffView === 'full' && 'dvt-btn--active']" @click="diffView = 'full'">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Full prompt
              </button>
            </div>
            <button class="dvt-btn dvt-btn--hide" @click="showDiff = false">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Hide
            </button>
          </template>
        </div>
      </div>

      <!-- Diff view -->
      <div v-if="showDiff && hasDiff && diffView === 'diff'" class="diff-hunk">
        <template v-for="(line, i) in processedDiff" :key="i">
          <div v-if="line.type === 'collapsed'" class="diff-collapsed">
            <button class="diff-collapsed-btn" @click="expandAt(i)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>
              {{ line.count }} unchanged line{{ line.count !== 1 ? 's' : '' }}
            </button>
          </div>
          <div v-else :class="['diff-line', `diff-line--${line.type}`]">
            <span class="diff-gutter">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}</span>
            <span class="diff-text">{{ line.text }}</span>
          </div>
        </template>
      </div>

      <!-- Full prompt view -->
      <div v-if="showDiff && (!hasDiff || diffView === 'full')" class="full-prompt-pre">{{ rec.updated_prompt }}</div>
    </div>

    <div class="rec-foot">
      <template v-if="rec.status === 'pending'">
        <button class="btn btn-primary btn-sm" :disabled="applying || readonly" @click="$emit('apply')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {{ applying ? 'Applying…' : applyLabel }}
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="readonly" @click="$emit('dismiss')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Dismiss
        </button>
      </template>
      <button v-if="showCopyPrompt" class="btn btn-sm" @click="$emit('copyPrompt')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy updated prompt
      </button>
      <button v-if="showOpenCall && rec.call_id" class="btn btn-ghost btn-sm" @click="$emit('openCall', rec.call_id)">
        Open call
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { titleCase } from "@/lib/utils";

interface Rec {
  id: string;
  target_kpi_name: string;
  action: string;
  suggested_change: string | null;
  target_type: string;
  priority: string;
  status: string;
  auto_applied: boolean;
  agent_field: string | null;
  current_value: string | null;
  suggested_value: string | null;
  updated_prompt: string | null;
  base_prompt: string | null;
  call_id?: string;
}

const props = defineProps<{
  rec: Rec;
  applying?: boolean;
  showTargetType?: boolean;
  showOpenCall?: boolean;
  showCopyPrompt?: boolean;
  readonly?: boolean;
  currentPrompt?: string;
}>();

defineEmits<{
  apply: [];
  dismiss: [];
  copyPrompt: [];
  openCall: [callId: string];
}>();

const applyLabel = computed(() =>
  props.rec.target_type === "script_step" ? "Create Action Item" : "Apply to Agent",
);

// ── Diff engine ───────────────────────────────────────────────────────────────

type RawLine = { type: 'same' | 'added' | 'removed'; text: string };
type CollapsedLine = { type: 'collapsed'; count: number; startIdx: number };
type DiffLine = RawLine | CollapsedLine;

const CONTEXT = 3; // lines of context around each change

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function computeRawDiff(oldText: string, newText: string): RawLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const dp = lcsTable(oldLines, newLines);
  const result: RawLine[] = [];
  let i = oldLines.length, j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'same', text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

function collapseUnchanged(raw: RawLine[]): DiffLine[] {
  // Mark which lines are near a change (within CONTEXT lines)
  const near = new Set<number>();
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].type !== 'same') {
      for (let k = Math.max(0, i - CONTEXT); k <= Math.min(raw.length - 1, i + CONTEXT); k++) {
        near.add(k);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  while (i < raw.length) {
    if (near.has(i) || raw[i].type !== 'same') {
      result.push(raw[i]);
      i++;
    } else {
      // Collect consecutive hidden same lines
      let count = 0;
      const startIdx = result.length;
      while (i < raw.length && !near.has(i) && raw[i].type === 'same') {
        count++;
        i++;
      }
      result.push({ type: 'collapsed', count, startIdx });
    }
  }
  return result;
}

const showDiff = ref(false);

// Expanded collapsed sections (by index in processedDiff)
const expanded = ref(new Set<number>());

// Use the prompt that was in effect when this recommendation was generated (base_prompt),
// falling back to the live current prompt for older records that predate this field.
const diffFrom = computed(() => props.rec.base_prompt ?? props.currentPrompt ?? null);

const hasDiff = computed(() => !!diffFrom.value && !!props.rec.updated_prompt);

const rawDiff = computed<RawLine[]>(() => {
  if (!hasDiff.value) return [];
  return computeRawDiff(diffFrom.value!, props.rec.updated_prompt!);
});

const processedDiff = computed<DiffLine[]>(() => {
  const collapsed = collapseUnchanged(rawDiff.value);
  // Re-expand any sections the user has expanded
  if (expanded.value.size === 0) return collapsed;

  const result: DiffLine[] = [];
  for (let i = 0; i < collapsed.length; i++) {
    const line = collapsed[i];
    if (line.type === 'collapsed' && expanded.value.has(i)) {
      // Inline the raw lines that were hidden
      const raw = rawDiff.value;
      let rawIdx = 0;
      // Count how many raw lines come before this collapsed block
      for (let k = 0; k < i; k++) {
        const cl = collapsed[k];
        if (cl.type === 'collapsed') rawIdx += cl.count;
        else rawIdx++;
      }
      for (let k = 0; k < line.count; k++) {
        result.push(raw[rawIdx + k]);
      }
    } else {
      result.push(line);
    }
  }
  return result;
});

function expandAt(idx: number) {
  expanded.value = new Set([...expanded.value, idx]);
}

const diffView = ref<'diff' | 'full'>('diff');
</script>

<style scoped>
.rec-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 16px 18px;
  display: flex; flex-direction: column; gap: 12px;
}
.rec-card--resolved { opacity: 0.6; }
.rec-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.rec-priority-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; padding: 2px 9px; border-radius: 99px; }
.rec-priority-high { background: var(--red-bg); color: var(--red); border: 1px solid rgba(220,38,38,0.18); }
.rec-priority-medium { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(217,119,6,0.18); }
.rec-priority-low { background: var(--surface-3); color: var(--ink-3); border: 1px solid var(--border); }
.rec-kpi { font-weight: 600; font-size: 13.5px; flex: 1; }
.rec-target-type { font-size: 10.5px; font-weight: 600; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 5px; text-transform: capitalize; }
.rec-type-prompt { background: #f0f9ff; color: #0369a1; border: 1px solid #bae6fd; }
.rec-type-agent_config { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.rec-type-script_step { background: #fdf4ff; color: #7c3aed; border: 1px solid #e9d5ff; }
.rec-type-knowledge_base { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
.rec-status { margin-left: auto; }
.rec-action { font-weight: 600; font-size: 14px; line-height: 1.5; color: var(--ink-1); }
.rec-body { font-size: 13px; line-height: 1.6; color: var(--ink-2); background: var(--surface-2); padding: 12px 14px; border-radius: 8px; }

/* ── Agent config diff (before → after) ── */
.rec-diff { display: flex; flex-direction: column; gap: 8px; }
.diff-label { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink-3); }
.diff-row { display: grid; grid-template-columns: 1fr 24px 1fr; gap: 10px; align-items: start; }
.diff-before { padding: 9px 11px; border-radius: 8px; font-size: 12.5px; line-height: 1.55; background: var(--red-soft); color: #991b1b; border: 1px solid rgba(220,38,38,0.18); }
.diff-after { padding: 9px 11px; border-radius: 8px; font-size: 12.5px; line-height: 1.55; background: var(--green-soft); color: #14532d; border: 1px solid rgba(22,163,74,0.18); }
.diff-arrow { display: flex; align-items: center; justify-content: center; color: var(--ink-3); padding-top: 9px; }

/* ── Prompt diff viewer ── */
.prompt-diff-wrap {
  display: flex; flex-direction: column; gap: 0;
  border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
}

.prompt-diff-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.prompt-diff-bar-label {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em;
  color: var(--ink-2); text-transform: uppercase;
}

.diff-bar-right {
  display: inline-flex; align-items: center; gap: 6px;
}

.diff-view-toggle {
  display: inline-flex; border: 1px solid var(--border);
  border-radius: 6px; overflow: hidden; background: var(--surface);
}
.dvt-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 11px; font-size: 12px; font-weight: 500;
  font-family: inherit; background: transparent; border: 0;
  color: var(--ink-3); cursor: pointer; transition: background 0.1s, color 0.1s;
}
.dvt-btn:hover { color: var(--ink-1); }
.dvt-btn--active {
  background: var(--surface-3); color: var(--ink-1);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.06);
}
.dvt-btn--show {
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink-2);
}
.dvt-btn--show:hover { color: var(--ink-1); background: var(--surface-2); }
.dvt-btn--hide { color: var(--ink-3); }
.dvt-btn--hide:hover { color: var(--red); }

/* ── Diff hunk (line-by-line) ── */
.diff-hunk {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px; line-height: 1.6;
  max-height: 420px; overflow-y: auto;
  background: var(--surface);
}

.diff-line {
  display: grid; grid-template-columns: 22px 1fr;
  padding: 0 12px 0 0; min-height: 22px;
  white-space: pre-wrap; word-break: break-word;
}
.diff-line--same  { background: var(--surface); color: var(--ink-2); }
.diff-line--added { background: #f0fdf4; color: #14532d; }
.diff-line--removed { background: #fef2f2; color: #991b1b; }

.diff-gutter {
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 2px;
  font-size: 12px; font-weight: 700; user-select: none; flex-shrink: 0;
}
.diff-line--added   .diff-gutter { color: #16a34a; }
.diff-line--removed .diff-gutter { color: var(--red); }
.diff-line--same    .diff-gutter { color: var(--ink-4); }

.diff-text { padding: 2px 0; }

.diff-collapsed {
  background: #f1f5f9; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
  padding: 3px 10px;
}
.diff-collapsed-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: 'JetBrains Mono', monospace; font-size: 11.5px;
  color: var(--ink-3); background: transparent; border: 0;
  cursor: pointer; padding: 0;
}
.diff-collapsed-btn:hover { color: var(--ink-1); }

/* ── Full prompt view ── */
.full-prompt-pre {
  margin: 0; padding: 14px 16px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12.5px; line-height: 1.7; color: var(--ink-1);
  background: var(--surface); white-space: pre-wrap; word-break: break-word;
  max-height: 420px; overflow-y: auto;
}

.rec-foot { display: flex; gap: 8px; padding-top: 4px; flex-wrap: wrap; }

/* Pills */
.pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; padding: 2px 9px; border-radius: 99px; background: var(--surface-3); color: var(--ink-2); border: 1px solid var(--border); white-space: nowrap; }
.pill-green { background: var(--green-bg); color: #047857; border-color: rgba(22,163,74,0.18); }
.pill-blue { background: var(--blue-bg); color: var(--blue); border-color: rgba(37,99,235,0.18); }
.pill-muted { background: var(--surface-2); color: var(--ink-3); border-color: var(--border); }

@media (max-width: 900px) {
  .diff-row { grid-template-columns: 1fr 20px 1fr; }
}
</style>
