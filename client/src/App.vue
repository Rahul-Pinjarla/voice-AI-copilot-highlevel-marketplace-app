<template>
  <div id="app-shell">
    <!-- ── State screens ───────────────────────────────────────────── -->
    <div v-if="sessionState === 'loading'" class="state-screen">
      <div class="spinner" />
      <p>Connecting to HighLevel…</p>
    </div>
    <div v-else-if="sessionState === 'not_embedded' && route.query.installed === 'true'" class="state-screen installed-screen">
      <div class="installed-check">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2>Installation successful</h2>
      <p>Go back to the GHL Marketplace app to open your Voice AI Copilot dashboard.</p>
    </div>
    <div v-else-if="sessionState === 'not_embedded'" class="state-screen not-embedded">
      <div class="state-icon">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="32" height="32" rx="6"/><path d="M13 20h14M20 13v14"/></svg>
      </div>
      <h2>Voice AI Copilot</h2>
      <p>This app must be opened from inside HighLevel as a Custom Page.</p>
    </div>
    <div v-else-if="sessionState === 'error'" class="state-screen error">
      <div class="state-icon">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="20" cy="20" r="16"/><path d="M20 12v10M20 28v1"/></svg>
      </div>
      <h2>Authentication failed</h2>
      <p>Could not verify your HighLevel session. Try reinstalling the app from the GHL Marketplace.</p>
    </div>

    <!-- ── App layout ─────────────────────────────────────────────── -->
    <template v-else>
      <aside class="sidebar">
        <!-- Brand -->
        <div class="sidebar-brand">
          <div class="sidebar-logo">
            <img src="/logo.png" alt="Voice AI Copilot" class="sidebar-logo-img" />
          </div>
          <div class="sidebar-app-name">Voice AI Copilot</div>
        </div>

        <!-- Primary nav -->
        <nav class="sidebar-nav">
          <router-link to="/dashboard" class="nav-item" :class="{ active: route.path === '/dashboard' }">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span>Dashboard</span>
            <span v-if="humanFollowupCount" class="nav-badge">{{ humanFollowupCount }}</span>
          </router-link>
        </nav>

        <!-- Agents -->
        <div class="sidebar-section-label">Agents</div>
        <nav class="sidebar-nav">
          <template v-if="loading && agents.length === 0">
            <div v-for="i in 3" :key="i" class="nav-item-skeleton" />
          </template>
          <router-link
            v-for="agent in agents"
            :key="agent.id"
            :to="`/agents/${agent.id}`"
            class="nav-agent"
            :class="{ active: route.path === `/agents/${agent.id}` }"
          >
            <span class="agent-dot" :style="{ background: agent.active ? '#16a34a' : '#9ca3af' }" />
            <span class="nav-agent-name">{{ agent.name }}</span>
            <span v-if="agent.pass_rate !== null" class="nav-agent-rate" :style="{ color: route.path === `/agents/${agent.id}` ? 'rgba(255,255,255,0.8)' : healthColor(agent.pass_rate) }">
              {{ pct(agent.pass_rate) }}
            </span>
          </router-link>
        </nav>
      </aside>

      <main class="app-main">
        <router-view />
      </main>
    </template>

    <!-- ── Toast notifications ──────────────────────────────────── -->
    <Teleport to="body">
      <div class="toast-stack">
        <TransitionGroup name="toast">
          <div
            v-for="t in toasts"
            :key="t.id"
            :class="['toast', `toast--${t.type}`]"
          >
            <svg v-if="t.type === 'error'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <svg v-else-if="t.type === 'success'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
            <span class="toast-msg">{{ t.message }}</span>
            <button class="toast-close" @click="dismiss(t.id)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useDashboard } from "@/composables/useDashboard";
import { initSession, sessionState } from "@/composables/useSession";
import { useToast } from "@/composables/useToast";

const route = useRoute();
const { agents, useActions, loading, load } = useDashboard();
const { toasts, dismiss } = useToast();

const humanFollowupCount = computed(() => useActions.value.filter((ua) => ua.action_required === "human_followup").length);

onMounted(() => {
  initSession();
  load();
});

function healthColor(passRate: number | null): string {
  if (passRate === null) return "#9ca3af";
  if (passRate >= 0.75) return "#16a34a";
  if (passRate >= 0.5) return "#d97706";
  return "#dc2626";
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
</script>

<style>
/* ── Reset + tokens ─────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #fafafa;
  --surface: #ffffff;
  --surface-2: #f6f6f7;
  --surface-3: #f0f0f2;
  --border: #ececef;
  --border-strong: #d8d8dc;
  --ink-1: #0b0c0f;
  --ink-2: #535862;
  --ink-3: #8b8f99;
  --ink-4: #b0b3bb;

  --red: #dc2626;
  --red-bg: #fee2e2;
  --red-soft: #fef2f2;
  --green: #16a34a;
  --green-bg: #dcfce7;
  --green-soft: #f0fdf4;
  --amber: #d97706;
  --amber-bg: #fef3c7;
  --amber-soft: #fffbeb;
  --blue: #2563eb;
  --blue-bg: #dbeafe;
  --blue-soft: #eff6ff;
  --indigo-active: linear-gradient(180deg, #0c0e16 0%, #161a2a 100%);

  --radius: 10px;
  --radius-sm: 6px;
  --shadow-sm: 0 1px 0 0 rgba(0,0,0,0.04);
  --shadow: 0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04);

  /* Backward-compat aliases */
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-text: var(--ink-1);
  --color-text-muted: var(--ink-2);
  --color-text-faint: var(--ink-3);
  --color-primary: var(--ink-1);
  --color-primary-hover: #1c1e25;
  --color-accent: var(--green);
  --color-success: var(--green);
  --color-warning: var(--amber);
  --color-danger: var(--red);
  --color-badge-pass: var(--green-bg);
  --color-badge-pass-text: #166534;
  --color-badge-fail: var(--red-bg);
  --color-badge-fail-text: #991b1b;
  --color-sidebar-bg: #fcfcfd;
  --color-sidebar-border: var(--border);
  --sidebar-w: 224px;

  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  color: var(--ink-1);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

body { background: var(--bg); }

/* ── Shell ──────────────────────────────────────────────────────── */
#app-shell { min-height: 100vh; display: flex; }

/* ── Sidebar ────────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w);
  min-height: 100vh;
  background: #fcfcfd;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 14px;
}

.sidebar-logo {
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sidebar-logo-img { width: 28px; height: 28px; object-fit: contain; border-radius: 7px; }

.sidebar-app-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-1);
  letter-spacing: -0.01em;
}

.sidebar-section-label {
  padding: 12px 12px 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--ink-3);
  text-transform: uppercase;
}

.sidebar-nav { display: flex; flex-direction: column; gap: 1px; padding: 4px 8px 8px; }

.nav-item {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--ink-2);
  cursor: pointer;
  text-decoration: none;
  user-select: none;
}

.nav-item:hover { background: var(--surface-2); color: var(--ink-1); text-decoration: none; }
.nav-item.active {
  background: var(--indigo-active);
  color: #fff;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
}
.nav-item.active .nav-icon { opacity: 1; color: #fff; }

.nav-icon { width: 15px; height: 15px; flex-shrink: 0; color: var(--ink-3); opacity: 1; }

.nav-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 99px;
  background: #d1fae5;
  color: #047857;
}
.nav-item.active .nav-badge { background: rgba(255,255,255,0.2); color: #fff; }

/* Agent items in sidebar */
.nav-agent {
  display: grid;
  grid-template-columns: 8px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--ink-1);
  cursor: pointer;
  text-decoration: none;
  user-select: none;
}
.nav-agent:hover { background: var(--surface-2); text-decoration: none; }
.nav-agent.active {
  background: var(--indigo-active);
  color: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
}

.agent-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.nav-agent-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-agent-rate {
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.nav-agent.active .nav-agent-rate { color: rgba(255,255,255,0.8); }

.nav-item-skeleton {
  height: 30px;
  background: rgba(0,0,0,0.06);
  border-radius: 7px;
  margin: 1px 0;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }

/* ── Main content ───────────────────────────────────────────────── */
.app-main { flex: 1; min-width: 0; overflow: auto; background: var(--bg); }

/* ── State screens ──────────────────────────────────────────────── */
.state-screen {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 14px; padding: 48px 24px; text-align: center;
}
.state-icon { color: var(--color-text-muted); }
.state-screen h2 { font-size: 19px; font-weight: 600; letter-spacing: -.2px; }
.state-screen p { color: var(--color-text-muted); max-width: 360px; font-size: 13px; line-height: 1.5; }

.installed-screen { background: var(--bg); }
.installed-check {
  width: 60px; height: 60px; border-radius: 50%;
  background: #16a34a; color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 0 8px rgba(22,163,74,0.12);
}

/* ── Spinner ────────────────────────────────────────────────────── */
.spinner {
  width: 28px; height: 28px;
  border: 2.5px solid var(--color-border);
  border-top-color: var(--color-text);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner-sm { width: 14px; height: 14px; border-width: 2px; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Shared utilities ───────────────────────────────────────────── */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.badge {
  display: inline-flex; align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11.5px; font-weight: 500;
}
.badge-pass { background: var(--color-badge-pass); color: var(--color-badge-pass-text); }
.badge-fail { background: var(--color-badge-fail); color: var(--color-badge-fail-text); }
.badge-pending { background: #fef9c3; color: #854d0e; }
.badge-running { background: #dbeafe; color: #1e40af; }
.badge-skipped { background: #f3f4f6; color: var(--color-text-muted); }

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 11px;
  border-radius: 7px;
  font-size: 12.5px; font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--ink-1);
  line-height: 1;
  white-space: nowrap;
  font-family: inherit;
  -webkit-font-smoothing: antialiased;
}
.btn:hover:not(:disabled) { background: var(--surface-2); }
.btn:disabled { opacity: .45; cursor: not-allowed; pointer-events: none; }
.btn-primary { background: var(--ink-1); color: #fff; border-color: var(--ink-1); }
.btn-primary:hover:not(:disabled) { background: #1c1e25; }
.btn-secondary { background: var(--surface); color: var(--ink-1); border-color: var(--border-strong); }
.btn-secondary:hover:not(:disabled) { background: var(--surface-2); }
.btn-ghost { background: transparent; color: var(--ink-2); border-color: transparent; padding: 4px 8px; }
.btn-ghost:hover:not(:disabled) { color: var(--ink-1); background: var(--surface-2); }
.btn-sm { padding: 4px 9px; font-size: 12px; border-radius: 6px; }

a { color: inherit; text-decoration: none; }
a:hover { text-decoration: none; }
.text-muted { color: var(--color-text-muted); }

.empty-state {
  text-align: center; padding: 48px 24px;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}
.empty-state .icon { font-size: 28px; margin-bottom: 10px; opacity: .5; }

/* ── Auto-mode overlay (teleported to body) ─────────────────────── */
.auto-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(15, 15, 20, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.auto-overlay-card {
  background: #fff;
  border: 1px solid rgba(0,0,0,0.07);
  border-radius: 20px;
  padding: 36px 44px;
  display: flex; flex-direction: column; align-items: center; gap: 18px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.14);
}
.auto-overlay-spinner-ring {
  position: relative; width: 64px; height: 64px;
  display: flex; align-items: center; justify-content: center;
}
.auto-overlay-arc { width: 64px; height: 64px; position: absolute; inset: 0; }
.auto-overlay-arc-spin { animation: arc-spin 1s linear infinite; transform-origin: 22px 22px; }
@keyframes arc-spin { to { transform: rotate(360deg); } }
.auto-overlay-bolt { position: relative; z-index: 1; }
.auto-overlay-label { font-size: 14px; font-weight: 500; color: #111; margin: 0; letter-spacing: -0.01em; }

.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.2s ease; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }
.overlay-card-enter-active { transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
.overlay-card-enter-from { opacity: 0; transform: scale(0.95); }

/* ── Toast stack ────────────────────────────────────────────────── */
.toast-stack {
  position: fixed; bottom: 20px; right: 20px;
  display: flex; flex-direction: column; gap: 8px;
  z-index: 10000; pointer-events: none;
}
.toast {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px; font-weight: 500;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  max-width: 340px; pointer-events: all;
  border: 1px solid;
}
.toast--error   { background: #fff1f2; color: #991b1b; border-color: #fecaca; }
.toast--success { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.toast--info    { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
.toast-msg { flex: 1; line-height: 1.4; }
.toast-close {
  background: transparent; border: none; cursor: pointer;
  padding: 2px; color: inherit; opacity: 0.6; flex-shrink: 0;
  display: flex; align-items: center;
}
.toast-close:hover { opacity: 1; }
.toast-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toast-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-enter-from   { opacity: 0; transform: translateY(8px); }
.toast-leave-to     { opacity: 0; transform: translateX(20px); }
</style>
