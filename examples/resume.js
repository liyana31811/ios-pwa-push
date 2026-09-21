// Example page-side cold/warm resume helper.
//
// The important rules:
// 1. target URL is durable input;
// 2. Service Worker postMessage is optional optimization;
// 3. server state is authoritative;
// 4. old async responses cannot overwrite a newer resume.

let recoveryGeneration = 0;
let activeController = null;
let lastActivationKey = "";
let lastActivationAt = 0;

function activationTargetFromLocation() {
  const url = new URL(location.href);

  if (!url.searchParams.has("from_push")) return null;
  return url;
}

function duplicateActivation(target, eventId) {
  const now = Date.now();
  const key =
    String(eventId || "") +
    "|" +
    target.pathname +
    target.search;

  if (key === lastActivationKey && now - lastActivationAt < 2500) {
    return true;
  }

  lastActivationKey = key;
  lastActivationAt = now;
  return false;
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: "same-origin"
  });

  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

async function recoverTarget(target, eventId) {
  if (!(target instanceof URL)) target = new URL(target, location.origin);
  if (target.origin !== location.origin) return;

  if (duplicateActivation(target, eventId || null)) return;

  recoveryGeneration += 1;
  const generation = recoveryGeneration;

  if (activeController) activeController.abort();
  activeController = new AbortController();

  const signal = activeController.signal;

  try {
    // Replace these with your own routing contract.
    const conversationId = target.searchParams.get("conversation_id");
    const taskId = target.searchParams.get("task_id");
    const roomId = target.searchParams.get("room_id");

    let endpoint = "/api/state?_=" + Date.now();

    if (conversationId) {
      endpoint =
        "/api/conversations/" +
        encodeURIComponent(conversationId) +
        "?_=" +
        Date.now();
    } else if (taskId) {
      endpoint =
        "/api/tasks/" +
        encodeURIComponent(taskId) +
        "?_=" +
        Date.now();
    } else if (roomId) {
      endpoint =
        "/api/rooms/" +
        encodeURIComponent(roomId) +
        "?_=" +
        Date.now();
    }

    const freshState = await fetchJson(endpoint, signal);

    if (generation !== recoveryGeneration) return;

    renderRecoveredState(freshState, target);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Push recovery failed:", error);
  }
}

// Replace with your app renderer/router.
function renderRecoveredState(state, target) {
  console.log("Render current server state for", target.href, state);
}

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", event => {
    if (!event.data || event.data.type !== "push-open") return;

    recoverTarget(
      new URL(event.data.target, location.origin),
      event.data.eventId || null
    );
  });
}

// Cold-start fallback: the URL alone is enough.
const coldTarget = activationTargetFromLocation();
if (coldTarget) {
  recoverTarget(coldTarget, null);
}

// Rebuild volatile foreground state after iOS resumes the app.
for (const name of ["pageshow", "focus", "online"]) {
  window.addEventListener(name, () => {
    // reconnectWebSocket();
    // resumeLongPollWithNewGeneration();
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    // reconnectWebSocket();
    // resumeLongPollWithNewGeneration();
  }
});
