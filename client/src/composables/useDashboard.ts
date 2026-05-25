import { ref } from "vue";
import type { DashboardAgent, UseActionWithContext } from "@/lib/api";
import { api } from "@/lib/api";

// Module-level reactive state — shared across sidebar + dashboard view
const agents = ref<DashboardAgent[]>([]);
const useActions = ref<UseActionWithContext[]>([]);
const loading = ref(true);
let _initialized = false;

async function load(force = false) {
  if (_initialized && !force) return;
  _initialized = true;
  try {
    const data = await api.dashboard.get();
    agents.value = data.agents;
    useActions.value = data.use_actions;
  } finally {
    loading.value = false;
  }
}

export function useDashboard() {
  return { agents, useActions, loading, load };
}
