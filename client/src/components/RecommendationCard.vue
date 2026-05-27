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
import { computed } from "vue";
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
  call_id?: string;
}

const props = defineProps<{
  rec: Rec;
  applying?: boolean;
  showTargetType?: boolean;
  showOpenCall?: boolean;
  showCopyPrompt?: boolean;
  readonly?: boolean;
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

.rec-diff { display: flex; flex-direction: column; gap: 8px; }
.diff-label { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink-3); }
.diff-row { display: grid; grid-template-columns: 1fr 24px 1fr; gap: 10px; align-items: start; }
.diff-before { padding: 9px 11px; border-radius: 8px; font-size: 12.5px; line-height: 1.55; background: var(--red-soft); color: #991b1b; border: 1px solid rgba(220,38,38,0.18); }
.diff-after { padding: 9px 11px; border-radius: 8px; font-size: 12.5px; line-height: 1.55; background: var(--green-soft); color: #14532d; border: 1px solid rgba(22,163,74,0.18); }
.diff-arrow { display: flex; align-items: center; justify-content: center; color: var(--ink-3); padding-top: 9px; }

.rec-foot { display: flex; gap: 8px; padding-top: 4px; flex-wrap: wrap; }

/* Pills (for status in rec-head) */
.pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; padding: 2px 9px; border-radius: 99px; background: var(--surface-3); color: var(--ink-2); border: 1px solid var(--border); white-space: nowrap; }
.pill-green { background: var(--green-bg); color: #047857; border-color: rgba(22,163,74,0.18); }
.pill-blue { background: var(--blue-bg); color: var(--blue); border-color: rgba(37,99,235,0.18); }
.pill-muted { background: var(--surface-2); color: var(--ink-3); border-color: var(--border); }

@media (max-width: 900px) {
  .diff-row { grid-template-columns: 1fr 20px 1fr; }
}
</style>
