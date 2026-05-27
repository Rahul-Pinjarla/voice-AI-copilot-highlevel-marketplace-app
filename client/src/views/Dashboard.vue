<template>
  <div class="dashboard">
    <!-- Page header -->
    <div class="page-header">
      <div class="page-meta">{{ agents.length }} agent{{ agents.length !== 1 ? 's' : '' }} connected</div>
      <div class="header-actions">
      </div>
    </div>

    <div v-if="loading" class="loading-state"><div class="spinner" /></div>

    <!-- Auto-sync overlay shown on first load when no agents exist -->
    <div v-else-if="autoSyncing" class="sync-overlay">
      <div class="sync-card">
        <div class="spinner spinner-lg" />
        <div class="sync-title">Looking for your agents…</div>
        <div class="sync-sub">Fetching your Voice AI agents from GHL…</div>
      </div>
    </div>

    <template v-else>
      <!-- ── Snapshot ── -->
      <section class="snapshot-section">
        <div class="section-label">Snapshot</div>
        <div class="snapshot-grid">
          <div class="snap-card">
            <div class="snap-top">
              <span class="snap-ico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </span>
              <span class="snap-label">total calls</span>
            </div>
            <div class="snap-num">{{ totalCallsToday }}</div>
            <div class="snap-sub">across {{ agents.length }} agent{{ agents.length !== 1 ? 's' : '' }}</div>
          </div>
          <div class="snap-card snap-card--accent">
            <div class="snap-top">
              <span class="snap-ico snap-ico--red">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
              </span>
              <span class="snap-label">pass rate</span>
            </div>
            <div class="snap-num" :class="passRateClass">{{ overallPassRate }}</div>
            <div class="snap-sub">{{ overallPassRate === '—' ? 'no data yet' : passRateSubText }}</div>
          </div>
          <div class="snap-card">
            <div class="snap-top">
              <span class="snap-ico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
              </span>
              <span class="snap-label">action items</span>
            </div>
            <div class="snap-num">{{ humanFollowupActions.length }}</div>
            <div class="snap-sub">{{ humanFollowupActions.length ? 'pending followup' : 'none pending' }}</div>
          </div>
          <div class="snap-card">
            <div class="snap-top">
              <span class="snap-ico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><path d="M6 6l1.5 1.5"/><path d="M16.5 16.5L18 18"/><path d="M6 18l1.5-1.5"/><path d="M16.5 7.5L18 6"/><circle cx="12" cy="12" r="3"/></svg>
              </span>
              <span class="snap-label">active recs</span>
            </div>
            <div class="snap-num">{{ totalActiveRecs }}</div>
            <div class="snap-sub">across all agents</div>
          </div>
        </div>
      </section>

      <!-- ── Fresh install ── -->
      <template v-if="agents.length === 0">
        <div class="fresh-grid">
          <div class="fresh-card card">
            <div class="fresh-icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6 5a2 2 0 0 1 2-1.8h4.5l2 5.5-2.5 1.7a15.5 15.5 0 0 0 6.6 6.6l1.7-2.5 5.5 2V22a2 2 0 0 1-1.8 2C9.5 25 3 15.5 6 5z"/></svg>
            </div>
            <h3>Make your first call</h3>
            <p>Trigger a test call in GHL Voice AI. The agent and call will appear here automatically once the call ends.</p>
          </div>
          <div class="fresh-card card">
            <div class="fresh-icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <h3>No agents found</h3>
            <p>No Voice AI agents were found in your GHL account. Create one in GHL and reload this page.</p>
          </div>
        </div>
      </template>

      <!-- ── Your agents ── -->
      <section v-else class="agents-section">
        <div class="section-label">
          Your agents
          <span class="section-label-hint">{{ agents.length }} connected · click to drill in</span>
        </div>
        <div class="agents-card card">
          <div
            v-for="agent in agents"
            :key="agent.id"
            class="agent-row"
            @click="router.push(`/agents/${agent.id}`)"
          >
            <div class="agent-avatar">{{ agent.name.charAt(0).toUpperCase() }}</div>
            <div class="agent-info">
              <div class="agent-name">
                <span :class="['agent-active-dot', agent.active ? 'dot-on' : 'dot-off']" :title="agent.active ? 'Analysis on' : 'Analysis paused'" />
                {{ agent.name }}
                <span v-if="!agent.configured" class="agent-setup-tag">SETUP NEEDED</span>
              </div>
              <div class="agent-status">
                <svg v-if="agent.top_failing_kpi" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ agentStatus(agent) }}
              </div>
            </div>
            <div class="agent-last-call" v-if="agent.last_call_score !== null">
              <span class="last-call-score" :style="{ color: healthColor(agent.last_call_score) }">{{ healthScore(agent.last_call_score) }}</span>
              <span class="last-call-label">LAST CALL</span>
            </div>
            <div class="agent-last-call agent-last-call--empty" v-else />
            <div class="agent-health" :style="{ color: healthColor(agent.pass_rate) }">
              <span class="health-score">{{ healthScore(agent.pass_rate) }}</span>
              <span class="health-label">HEALTH</span>
            </div>
            <div class="agent-calls">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              {{ agent.calls_today }} <span style="color:var(--ink-3)">calls</span>
            </div>
            <button class="btn btn-secondary btn-sm open-btn" @click.stop="router.push(`/agents/${agent.id}`)">
              Open
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </div>
      </section>

      <!-- ── Pending Items ── -->
      <section v-if="humanFollowupActions.length || pendingRecs.length" class="pending-section">
        <div class="section-label">
          Pending Items
          <span class="section-label-hint">{{ humanFollowupActions.length + pendingRecs.length }} total</span>
        </div>
        <div class="pending-tabs">
          <button :class="['pending-tab', pendingActiveTab === 'actions' ? 'pending-tab--active' : '']" @click="pendingActiveTab = 'actions'">
            Action Items
            <span v-if="humanFollowupActions.length" class="pending-tab-badge">{{ humanFollowupActions.length }}</span>
          </button>
          <button :class="['pending-tab', pendingActiveTab === 'recs' ? 'pending-tab--active' : '']" @click="pendingActiveTab = 'recs'">
            Recommendations
            <span v-if="pendingRecs.length" class="pending-tab-badge">{{ pendingRecs.length }}</span>
          </button>
        </div>

        <!-- Action Items tab -->
        <div v-if="pendingActiveTab === 'actions'" class="pending-list">
          <div v-if="!humanFollowupActions.length" class="pending-empty">No pending action items</div>
          <ActionItemCard
            v-for="action in humanFollowupActions"
            :key="action.id"
            :action="action"
            :agent-name="action.agent_name"
            :agent-version="action.agent_version"
            :show-open-agent="true"
            :show-open-call="true"
            @handle="handleAction(action.id)"
            @dismiss="dismissAction(action.id)"
            @open-agent="router.push(`/agents/${action.agent_id}`)"
            @open-call="router.push(`/calls/${action.call_id}`)"
          />
        </div>

        <!-- Recommendations tab -->
        <div v-else class="pending-list">
          <div v-if="!pendingRecs.length" class="pending-empty">No pending recommendations</div>
          <div v-for="rec in pendingRecs" :key="rec.id" class="action-card">
            <div class="action-head">
              <span :class="['pill', rec.priority === 'high' ? 'pill-red' : rec.priority === 'medium' ? 'pill-amber' : '']">
                {{ rec.priority }}
              </span>
              <span class="pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
                {{ rec.agent_name }}
              </span>
              <span v-if="rec.agent_version != null" class="pill pill-version">v{{ rec.agent_version }}</span>
              <span class="pill pill-muted-dim">{{ rec.target_kpi_name.replace(/_/g, ' ') }}</span>
            </div>
            <div class="action-body">{{ rec.action }}</div>
            <div v-if="rec.suggested_change" class="action-why">
              <span class="action-why-label">Change</span>{{ rec.suggested_change }}
            </div>
            <hr class="divider" />
            <div class="action-foot">
              <div class="action-foot-left">
                <button class="btn btn-sm" @click="applyRec(rec.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Apply
                </button>
                <button class="btn btn-ghost btn-sm" @click="dismissRec(rec.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Dismiss
                </button>
              </div>
              <div class="action-foot-right">
                <button class="linkish" @click="router.push(`/agents/${rec.agent_id}`)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
                  Open agent
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
                <button class="linkish" @click="router.push(`/calls/${rec.call_id}`)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Open call
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { DashboardAgent } from "@/lib/api";
import { api } from "@/lib/api";
import { useDashboard } from "@/composables/useDashboard";
import { useToast } from "@/composables/useToast";
import ActionItemCard from "@/components/ActionItemCard.vue";

const router = useRouter();
const { agents, useActions, pendingRecs, loading, load } = useDashboard();
const { show: showToast } = useToast();
const pendingActiveTab = ref<"actions" | "recs">("actions");

const autoSyncing = ref(false);

onMounted(async () => {
  await load(true);
  if (agents.value.length === 0) {
    autoSyncing.value = true;
    try {
      await api.agents.sync();
      await load(true);
    } catch { /* non-fatal — fall through to empty state */ }
    finally { autoSyncing.value = false; }
  }
});
async function handleAction(id: string) {
  try {
    await api.recommendations.handleUseAction(id);
    await load(true);
  } catch (err) { showToast(err instanceof Error ? err.message : "Failed to mark action done"); }
}

async function dismissAction(id: string) {
  try {
    await api.recommendations.dismissUseAction(id);
    await load(true);
  } catch (err) { showToast(err instanceof Error ? err.message : "Failed to dismiss action"); }
}

async function applyRec(id: string) {
  try {
    await api.recommendations.apply(id);
    await load(true);
  } catch (err) { showToast(err instanceof Error ? err.message : "Failed to apply recommendation"); }
}

async function dismissRec(id: string) {
  try {
    await api.recommendations.dismiss(id);
    await load(true);
  } catch (err) { showToast(err instanceof Error ? err.message : "Failed to dismiss recommendation"); }
}

// ── Computed ──────────────────────────────────────────────────────────────────
const humanFollowupActions = computed(() => useActions.value.filter((ua) => ua.action_required === "human_followup"));

const totalCallsToday = computed(() => agents.value.reduce((s, a) => s + a.calls_today, 0));

const overallPassRate = computed(() => {
  const withRate = agents.value.filter((a) => a.pass_rate !== null);
  if (!withRate.length) return "—";
  return pct(withRate.reduce((s, a) => s + (a.pass_rate ?? 0), 0) / withRate.length);
});

const passRateClass = computed(() => {
  const withRate = agents.value.filter((a) => a.pass_rate !== null);
  if (!withRate.length) return "";
  const avg = withRate.reduce((s, a) => s + (a.pass_rate ?? 0), 0) / withRate.length;
  return avg >= 0.6 ? "snap-num--good" : "snap-num--bad";
});

const passRateSubText = computed(() => {
  const withRate = agents.value.filter((a) => a.pass_rate !== null);
  if (!withRate.length) return "";
  const avg = withRate.reduce((s, a) => s + (a.pass_rate ?? 0), 0) / withRate.length;
  return avg >= 0.6 ? "above target" : "below target";
});

const totalActiveRecs = computed(() => agents.value.reduce((s, a) => s + a.active_recs, 0));

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(n: number) { return `${Math.round(n * 100)}%`; }

function healthColor(passRate: number | null): string {
  if (passRate === null) return "#9ca3af";
  if (passRate >= 0.75) return "#16a34a";
  if (passRate >= 0.5) return "#d97706";
  return "#dc2626";
}

function healthScore(passRate: number | null): string {
  if (passRate === null) return "—";
  return Math.round(passRate * 100).toString();
}

function agentStatus(agent: DashboardAgent): string {
  if (!agent.configured) return "configure Goals to start analysis";
  if (agent.top_failing_kpi) return `Goal failing → "${agent.top_failing_kpi.replace(/_/g, " ")}"`;
  if (agent.pass_rate === null) return "no analysis yet";
  if (agent.active_recs > 0) return `${agent.active_recs} active recommendation${agent.active_recs > 1 ? "s" : ""}`;
  return "steady · all Goals passing";
}
</script>

<style scoped>
.dashboard { padding: 24px 32px 40px; max-width: 960px; display: flex; flex-direction: column; gap: 22px; }

/* Header */
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 4px; }
.breadcrumb b { color: var(--ink-2); font-weight: 600; }
h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 8px 0 0; }
.page-meta { margin-top: 4px; font-size: 12px; color: var(--ink-3); }
.header-actions { display: flex; align-items: center; gap: 8px; padding-top: 6px; }

.loading-state { display: flex; justify-content: center; padding: 60px 0; }
.backfill-banner { display: flex; align-items: center; gap: 10px; background: var(--blue-soft); border: 1px solid var(--blue-bg); border-radius: var(--radius); padding: 10px 16px; font-size: 13px; color: var(--blue); }

/* ── Auto-sync overlay ── */
.sync-overlay {
  display: flex; align-items: center; justify-content: center;
  padding: 80px 32px;
}
.sync-card {
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 48px 40px;
  box-shadow: var(--shadow-sm); max-width: 380px; text-align: center;
}
.sync-title { font-size: 16px; font-weight: 600; color: var(--ink-1); }
.sync-sub { font-size: 13px; color: var(--ink-3); line-height: 1.5; }
.spinner-lg { width: 32px; height: 32px; border-width: 3px; }

/* ── Section labels ── */
.section-label { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink-1); display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.section-label-hint { font-weight: 400; color: var(--ink-3); font-size: 12px; }
.section-label-right { margin-left: auto; display: flex; gap: 6px; align-items: center; }

/* ── Snapshot ── */
.snapshot-section {}
.snapshot-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }

.snap-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: var(--shadow-sm);
}
.snap-top { display: flex; align-items: center; gap: 8px; }
.snap-ico {
  width: 28px; height: 28px;
  border-radius: 7px;
  background: var(--surface-2);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ink-2); flex-shrink: 0;
}
.snap-ico--red { background: var(--red-bg); color: var(--red); }
.snap-label { font-size: 12px; color: var(--ink-3); font-weight: 500; }
.snap-num { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; margin-top: 4px; }
.snap-num--bad { color: var(--red); }
.snap-num--good { color: var(--green); }
.snap-sub { font-size: 11.5px; color: var(--ink-3); }

/* ── Fresh install ── */
.fresh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.fresh-card { padding: 28px 24px; display: flex; flex-direction: column; gap: 10px; }
.fresh-icon { color: var(--ink-3); }
.fresh-card h3 { font-size: 15px; font-weight: 600; }
.fresh-card p { font-size: 13px; color: var(--ink-2); line-height: 1.5; }

/* ── Agents ── */
.agents-section {}
.agents-card { overflow: hidden; }

.agent-row {
  display: grid;
  grid-template-columns: 36px 1fr 76px 76px 80px auto;
  gap: 14px;
  padding: 14px 16px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.1s;
}
.agent-row:last-child { border-bottom: none; }
.agent-row:hover { background: var(--surface-2); }

.agent-avatar {
  width: 36px; height: 36px;
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--ink-2);
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 13px;
  flex-shrink: 0;
}

.agent-info { min-width: 0; }
.agent-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.agent-active-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot-on { background: #16a34a; box-shadow: 0 0 0 2px rgba(22,163,74,0.2); }
.dot-off { background: var(--ink-4, #c4c4c4); }
.agent-setup-tag { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: var(--ink-3); border: 1px solid var(--border); padding: 1px 6px; border-radius: 3px; text-transform: uppercase; }
.agent-status { font-size: 12px; color: var(--ink-3); display: flex; align-items: center; gap: 4px; }

.agent-last-call { display: flex; flex-direction: column; align-items: center; }
.agent-last-call--empty { visibility: hidden; }
.last-call-score { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.last-call-label { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; color: var(--ink-3); margin-top: 2px; text-transform: uppercase; white-space: nowrap; }

.agent-health { display: flex; flex-direction: column; align-items: center; }
.health-score { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.health-label { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; color: var(--ink-3); margin-top: 2px; text-transform: uppercase; }

.agent-calls { font-size: 13px; color: var(--ink-2); display: flex; align-items: center; gap: 5px; }
.open-btn { flex-shrink: 0; }

/* ── Pending Items ── */
.pending-section {}
.pending-tabs {
  display: flex; gap: 0; border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  background: var(--surface-2); margin-bottom: 12px;
  width: fit-content;
}
.pending-tab {
  background: transparent; border: 0;
  font-family: inherit; font-size: 13px; font-weight: 500;
  color: var(--ink-3); padding: 7px 18px;
  cursor: pointer; display: flex; align-items: center; gap: 6px;
  transition: background 0.1s, color 0.1s;
}
.pending-tab:hover { color: var(--ink-1); }
.pending-tab--active {
  background: var(--surface); color: var(--ink-1);
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
}
.pending-tab-badge {
  font-size: 11px; font-weight: 600;
  background: var(--surface-3); color: var(--ink-2);
  padding: 1px 6px; border-radius: 99px;
  border: 1px solid var(--border);
}
.pending-tab--active .pending-tab-badge {
  background: var(--accent-soft, #e0edff); color: var(--blue);
  border-color: var(--blue-bg);
}
.pending-list { display: flex; flex-direction: column; gap: 10px; }
.pending-empty { font-size: 13px; color: var(--ink-3); padding: 20px 0; text-align: center; }

/* ── Pending rec cards (recs tab) ── */
.action-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 14px 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.action-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.action-body { font-size: 13.5px; line-height: 1.5; color: var(--ink-1); font-weight: 600; }
.action-why { font-size: 12.5px; color: var(--ink-3); line-height: 1.5; display: flex; align-items: baseline; gap: 6px; }
.action-why-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-4); flex-shrink: 0; }
.divider { border: 0; border-top: 1px solid var(--border); margin: 0; }
.action-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.action-foot-left { display: flex; gap: 4px; }
.action-foot-right { display: flex; gap: 12px; }

.pill {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11.5px; font-weight: 500;
  padding: 2px 9px;
  border-radius: 99px;
  background: var(--surface-3);
  color: var(--ink-2);
  border: 1px solid var(--border);
  white-space: nowrap;
}
.pill-amber { background: var(--amber-bg); color: var(--amber); border-color: rgba(217,119,6,0.18); }
.pill-red { background: var(--red-bg); color: var(--red); border-color: rgba(220,38,38,0.18); }
.pill-version { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; background: #ede9fe; color: #5b21b6; border-color: rgba(109,40,217,0.18); }
.pill-muted-dim { font-size: 11px; color: var(--ink-3); text-transform: capitalize; }

.linkish {
  background: transparent; border: 0;
  font-family: inherit; font-size: 12.5px; color: var(--ink-2);
  cursor: pointer; padding: 4px 0;
  display: inline-flex; align-items: center; gap: 4px;
}
.linkish:hover { color: var(--ink-1); }

@media (max-width: 900px) {
  .snapshot-grid { grid-template-columns: repeat(2, 1fr); }
  .agent-row { grid-template-columns: 36px 1fr 76px auto; }
  .agent-last-call, .agent-calls { display: none; }
}
</style>
