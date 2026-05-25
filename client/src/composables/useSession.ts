import { ref } from "vue";
import { api } from "@/lib/api";

export type SessionState = "loading" | "ready" | "not_embedded" | "error";

export const sessionState = ref<SessionState>("loading");
export const locationId = ref<string>("");

export async function initSession(): Promise<void> {
  sessionState.value = "loading";

  // Retry-loop: poll REQUEST_USER_DATA every 300ms for up to 5 seconds
  const encrypted = await new Promise<string | null>((resolve) => {
    const deadline = Date.now() + 5000;
    let timer: ReturnType<typeof setInterval>;

    const handler = (e: MessageEvent) => {
      if (!/gohighlevel|leadconnectorhq|msgsndr/.test(e.origin)) return;
      if (e.data?.message === "REQUEST_USER_DATA_RESPONSE") {
        clearInterval(timer);
        window.removeEventListener("message", handler);
        resolve(e.data.payload as string);
      }
    };
    window.addEventListener("message", handler);

    const poll = () => {
      window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
      if (Date.now() >= deadline) {
        clearInterval(timer);
        window.removeEventListener("message", handler);
        resolve(null);
      }
    };
    poll();
    timer = setInterval(poll, 300);
  });

  if (!encrypted) {
    sessionState.value = "not_embedded";
    return;
  }

  try {
    const result = await api.sso.verify(encrypted);
    locationId.value = result.locationId;
    if (result.token) {
      sessionStorage.setItem("sso_token", result.token);
    }
    sessionState.value = "ready";
  } catch (err) {
    console.error("[session] SSO verify failed:", err);
    sessionState.value = "error";
  }
}
