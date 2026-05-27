import { ref } from "vue";

export interface Toast {
  id: number;
  message: string;
  type: "error" | "success" | "info";
}

const toasts = ref<Toast[]>([]);
let _nextId = 0;

export function useToast() {
  function show(message: string, type: Toast["type"] = "error") {
    const id = _nextId++;
    toasts.value.push({ id, message, type });
    setTimeout(() => {
      const idx = toasts.value.findIndex((t) => t.id === id);
      if (idx !== -1) toasts.value.splice(idx, 1);
    }, 4500);
  }

  function dismiss(id: number) {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx !== -1) toasts.value.splice(idx, 1);
  }

  return { toasts, show, dismiss };
}
