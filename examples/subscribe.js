// Minimal subscription flow for an installed self-hosted PWA.
//
// Call enableNotifications() only from a direct user action.
//
// Expected backend endpoints:
//   GET  /api/push/vapid-public-key -> { publicKey: "..." }
//   POST /api/push/subscribe         <- PushSubscription JSON

export function supportsPush() {
  return (
    window.isSecureContext &&
    "Notification" in window &&
    (
      ("pushManager" in window && window.pushManager) ||
      ("serviceWorker" in navigator && "PushManager" in window)
    )
  );
}

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }

  return bytes;
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function resolvePushManager() {
  // Declarative Web Push on newer WebKit can expose PushManager on window.
  // Keep a Service Worker registered anyway for original-Web-Push browsers
  // and for optional app lifecycle behavior.
  const registration = await ensureServiceWorker();

  if ("pushManager" in window && window.pushManager) {
    return window.pushManager;
  }

  if (registration && registration.pushManager) {
    return registration.pushManager;
  }

  throw new Error("PushManager is unavailable. On iPhone, launch the installed Home Screen web app.");
}

async function getVapidPublicKey() {
  const response = await fetch("/api/push/vapid-public-key", {
    credentials: "same-origin",
    cache: "no-store"
  });

  if (!response.ok) throw new Error("Could not load VAPID public key");

  const data = await response.json();
  if (!data.publicKey) throw new Error("VAPID public key is missing");

  return data.publicKey;
}

async function syncSubscription(subscription) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON ? subscription.toJSON() : subscription)
  });

  if (!response.ok) throw new Error("Could not store push subscription");
}

export async function ensurePushSubscription() {
  if (!supportsPush()) {
    throw new Error("Web Push is not supported in this context");
  }

  const pushManager = await resolvePushManager();
  let subscription = await pushManager.getSubscription();

  if (!subscription) {
    const publicKey = await getVapidPublicKey();

    subscription = await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey)
    });
  }

  // Sync on every successful ensure. If a previous upload failed, gating on
  // "new subscription" can strand the browser with a subscription the backend
  // never received.
  await syncSubscription(subscription);

  return subscription;
}

export async function enableNotifications() {
  if (!supportsPush()) {
    throw new Error("Web Push is unavailable. On iPhone, add the site to the Home Screen and launch it there.");
  }

  let permission = Notification.permission;

  if (permission === "default") {
    // This function must be called directly from a user gesture.
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notification permission is denied"
        : "Notification permission was not granted"
    );
  }

  return ensurePushSubscription();
}

// On ordinary app startup, if permission is already granted, it is reasonable
// to re-ensure and re-sync the subscription without prompting again.
export async function refreshExistingPushSubscription() {
  if (!supportsPush() || Notification.permission !== "granted") return null;

  try {
    return await ensurePushSubscription();
  } catch (error) {
    console.warn("Push subscription refresh failed:", error);
    return null;
  }
}
