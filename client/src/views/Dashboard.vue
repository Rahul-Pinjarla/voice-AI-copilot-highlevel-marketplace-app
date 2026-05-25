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
                {{ agent.name }}
                <span v-if="!agent.configured" class="agent-setup-tag">SETUP NEEDED</span>
              </div>
              <div class="agent-status">
                <svg v-if="agent.top_failing_kpi" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ agentStatus(agent) }}
              </div>
            </div>
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

      <!-- ── Action Items inbox ── -->
      <section v-if="humanFollowupActions.length" class="use-actions-section">
        <div class="section-label">
          Action Items Inbox
          <span class="section-label-hint">{{ humanFollowupActions.length }} pending</span>
          <div class="section-label-right">
            <router-link to="/dashboard" class="btn btn-ghost btn-sm">
              View all
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </router-link>
          </div>
        </div>
        <div class="use-actions-list">
          <div v-for="action in humanFollowupActions" :key="action.id" class="action-card">
            <div class="action-head">
              <span class="pill pill-amber">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {{ action.action_required === 'human_followup' ? 'needs human' : 'needs retraining' }}
              </span>
              <span class="pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
                {{ action.agent_name }}
              </span>
              <span class="action-time">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {{ action.transcript_timestamp ?? 'today' }}
              </span>
            </div>
            <div class="action-body">{{ action.reason }}</div>
            <hr class="divider" />
            <div class="action-foot">
              <div class="action-foot-left">
                <button class="btn btn-sm" @click="handleAction(action.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Mark done
                </button>
                <button class="btn btn-ghost btn-sm" @click="dismissAction(action.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Ignore
                </button>
              </div>
              <div class="action-foot-right">
                <button class="linkish" @click="router.push(`/agents/${action.agent_id}`)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
                  Open agent
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
                <button class="linkish" @click="router.push(`/calls/${action.call_id}`)">
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

const router = useRouter();
const { agents, useActions, loading, load } = useDashboard();

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
  await api.recommendations.handleUseAction(id);
  await load(true);
}

async function dismissAction(id: string) {
  await api.recommendations.dismissUseAction(id);
  await load(true);
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
  if (!agent.configured) return "configure KPIs to start analysis";
  if (agent.top_failing_kpi) return `KPI failing → "${agent.top_failing_kpi.replace(/_/g, " ")}"`;
  if (agent.pass_rate === null) return "no analysis yet";
  if (agent.active_recs > 0) return `${agent.active_recs} active recommendation${agent.active_recs > 1 ? "s" : ""}`;
  return "steady · all KPIs passing";
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
  grid-template-columns: 36px 1fr 76px 80px auto;
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
.agent-setup-tag { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: var(--ink-3); border: 1px solid var(--border); padding: 1px 6px; border-radius: 3px; text-transform: uppercase; }
.agent-status { font-size: 12px; color: var(--ink-3); display: flex; align-items: center; gap: 4px; }

.agent-health { display: flex; flex-direction: column; align-items: center; }
.health-score { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.health-label { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; color: var(--ink-3); margin-top: 2px; text-transform: uppercase; }

.agent-calls { font-size: 13px; color: var(--ink-2); display: flex; align-items: center; gap: 5px; }
.open-btn { flex-shrink: 0; }

/* ── Use Actions ── */
.use-actions-section {}
.use-actions-list { display: flex; flex-direction: column; gap: 10px; }

.action-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-head { display: flex; align-items: center; gap: 8px; }
.action-time { margin-left: auto; font-size: 12px; color: var(--ink-3); font-family: 'JetBrains Mono', monospace; display: flex; align-items: center; gap: 4px; }
.action-body { font-size: 13.5px; line-height: 1.5; color: var(--ink-1); font-weight: 500; }
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

.linkish {
  background: transparent; border: 0;
  font-family: inherit; font-size: 12.5px; color: var(--ink-2);
  cursor: pointer; padding: 4px 0;
  display: inline-flex; align-items: center; gap: 4px;
}
.linkish:hover { color: var(--ink-1); }

@media (max-width: 900px) {
  .snapshot-grid { grid-template-columns: repeat(2, 1fr); }
  .agent-row { grid-template-columns: 36px 1fr 60px auto; }
  .agent-calls { display: none; }
}
</style>
