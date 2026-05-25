import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    {
      path: "/dashboard",
      component: () => import("@/views/Dashboard.vue"),
    },
    {
      path: "/agents/:id",
      component: () => import("@/views/AgentDetail.vue"),
    },
    {
      path: "/calls/:id",
      component: () => import("@/views/CallDetail.vue"),
    },
  ],
});

export default router;
