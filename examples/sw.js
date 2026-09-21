// Backward-compatible Service Worker.
//
// Newer WebKit can handle Declarative Web Push directly.
// Older/original-Web-Push browsers will dispatch the same JSON to this worker.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

function readPayload(data) {
  if (!data) return {};

  try {
    const value = data.json();
    return value && typeof value === "object" ? value : {};
  } catch {}

  try {
    const value = JSON.parse(data.text());
    return value && typeof value === "object" ? value : {};
  } catch {}

  return {};
}

function normalizeTarget(value) {
  const scope = new URL(self.registration.scope);

  try {
    const target = new URL(
      typeof value === "string" && value.trim() ? value.trim() : scope.href,
      scope.origin
    );

    if (target.origin !== scope.origin) return scope.href;
    if (!target.pathname.startsWith(scope.pathname)) return scope.href;

    return target.href;
  } catch {
    return scope.href;
  }
}

function originalNotificationFromPayload(payload) {
  // Declarative Web Push payload:
  // {
  //   web_push: 8030,
  //   notification: { title, body, navigate, tag, data, ... }
  // }
  //
  // On a browser that does not understand Declarative Web Push, this Service
  // Worker receives the JSON as an ordinary push message and displays it.

  if (payload && payload.web_push === 8030 && payload.notification) {
    const declared = payload.notification;
    const title = declared.title || "New notification";

    const options = {
      ...declared,
      data: {
        ...(declared.data || {}),
        target: normalizeTarget(declared.navigate)
      }
    };

    delete options.title;
    delete options.navigate;
    delete options.app_badge;
    delete options.mutable;

    return { title, options };
  }

  const title = payload.title || "New notification";

  return {
    title,
    options: {
      body: payload.body || "",
      tag: payload.tag || "default",
      icon: payload.icon,
      badge: payload.badge,
      data: {
        ...(payload.data || {}),
        eventId: payload.eventId || null,
        target: normalizeTarget(payload.target || payload.url || "/")
      }
    }
  };
}

self.addEventListener("push", event => {
  const payload = readPayload(event.data);
  const { title, options } = originalNotificationFromPayload(payload);

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = normalizeTarget(
    (event.notification && event.notification.data && event.notification.data.target) ||
    (event.notification && event.notification.data && event.notification.data.url) ||
    "/"
  );

  const eventId =
    (event.notification && event.notification.data && event.notification.data.eventId) ||
    null;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      let candidate;

      try {
        candidate = new URL(client.url);
      } catch {
        continue;
      }

      const scope = new URL(self.registration.scope);

      if (
        candidate.origin !== scope.origin ||
        !candidate.pathname.startsWith(scope.pathname)
      ) {
        continue;
      }

      if (typeof client.navigate === "function" && client.url !== target) {
        try {
          await client.navigate(target);
        } catch {}
      }

      if (typeof client.focus === "function") {
        await client.focus();
      }

      // Optimization only. The target URL remains the durable recovery path.
      try {
        client.postMessage({
          type: "push-open",
          target,
          eventId
        });
      } catch {}

      return;
    }

    await self.clients.openWindow(target);
  })());
});
