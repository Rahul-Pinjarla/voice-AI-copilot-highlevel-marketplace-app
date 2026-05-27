<template>
  <div class="action-card">
    <div class="ac-head">
      <span :class="['ac-pill', action.action_required === 'human_followup' ? 'ac-pill--followup' : 'ac-pill--retrain']">
        <span class="ac-dot" />
        {{ action.action_required === 'human_followup' ? 'human followup' : 'needs retraining' }}
      </span>
      <span v-if="agentName" class="pill">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
        {{ agentName }}
      </span>
      <span v-if="agentVersion != null" class="pill pill-version">v{{ agentVersion }}</span>
      <span v-if="action.transcript_timestamp" class="ac-ts">@ {{ action.transcript_timestamp }}</span>
    </div>

    <div class="ac-body">{{ action.what_to_change ?? action.reason }}</div>

    <div v-if="action.why" class="ac-why">
      <span class="ac-why-label">Why</span>{{ action.why }}
    </div>

    <template v-if="showOpenAgent || showOpenCall">
      <hr class="ac-divider" />
      <div class="ac-foot">
        <div class="ac-foot-left">
          <button class="btn btn-sm" :disabled="readonly" @click="$emit('handle')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Mark done
          </button>
          <button class="btn btn-ghost btn-sm" @click="$emit('dismiss')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Ignore
          </button>
        </div>
        <div class="ac-foot-right">
          <button v-if="showOpenAgent" class="linkish" @click="$emit('openAgent')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
            Open agent
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
          <button v-if="showOpenCall" class="linkish" @click="$emit('openCall')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Open call
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="ac-foot-inline">
        <button class="btn btn-secondary btn-sm" :disabled="readonly" @click="$emit('handle')">Mark handled</button>
        <button class="btn btn-ghost btn-sm" @click="$emit('dismiss')">Ignore</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface ActionItem {
  id: string;
  reason: string;
  what_to_change: string | null;
  why: string | null;
  transcript_timestamp: string | null;
  action_required: string;
  status: string;
}

defineProps<{
  action: ActionItem;
  agentName?: string;
  agentVersion?: number | null;
  showOpenCall?: boolean;
  showOpenAgent?: boolean;
  readonly?: boolean;
}>();

defineEmits<{
  handle: [];
  dismiss: [];
  openCall: [];
  openAgent: [];
}>();
</script>

<style scoped>
.action-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 14px 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.ac-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ac-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 500; padding: 2px 9px;
  border-radius: 99px; border: 1px solid; white-space: nowrap;
}
.ac-pill--followup { background: var(--amber-bg); color: var(--amber); border-color: rgba(217,119,6,0.25); }
.ac-pill--retrain { background: var(--blue-bg); color: var(--blue); border-color: rgba(37,99,235,0.18); }
.ac-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.ac-ts { font-size: 12px; color: var(--ink-3); margin-left: auto; }

.pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; padding: 2px 9px; border-radius: 99px; background: var(--surface-3); color: var(--ink-2); border: 1px solid var(--border); white-space: nowrap; }
.pill-version { background: #ede9fe; color: #5b21b6; border-color: rgba(109,40,217,0.18); font-size: 11px; font-family: 'JetBrains Mono', monospace; }

.ac-body { font-size: 13.5px; font-weight: 600; line-height: 1.5; color: var(--ink-1); }
.ac-why { font-size: 12.5px; color: var(--ink-3); line-height: 1.5; display: flex; align-items: baseline; gap: 6px; }
.ac-why-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-4); flex-shrink: 0; }

.ac-divider { border: none; border-top: 1px solid var(--border); margin: 0; }
.ac-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ac-foot-left { display: flex; gap: 6px; }
.ac-foot-right { display: flex; gap: 10px; }
.ac-foot-inline { display: flex; gap: 6px; }

.linkish {
  display: inline-flex; align-items: center; gap: 5px;
  background: none; border: none; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 500;
  color: var(--ink-3);
}
.linkish:hover { color: var(--ink-1); }
</style>
