# Field notes from two real self-hosted apps

These notes separate observed experience from platform requirements.

## Deployment A: self-hosted AI chat

Stack:

- Python / FastAPI;
- pywebpush;
- WebSocket live synchronization;
- iPhone Home Screen PWA;
- self-hosted HTTPS access.

### Real iPhone delivery

The local project log recorded successful Apple Web Push after VAPID identity correction:

~~~text
sent: 1
failed: 0
total: 1
~~~

### VAPID BadJwtToken

Observed:

- Apple returned 403 BadJwtToken while a placeholder contact identity was used;
- replacing it with a real contact identity fixed the test send.

Lesson:

- use a real mailto: or https: VAPID subject;
- do not copy dummy placeholder identities into production.

### The first click target was too generic

Initial:

~~~text
/chat?from_notification=main-chat
~~~

Later, multi-conversation recovery required:

~~~text
/chat?from_notification=main-chat&conv_id=<id>
~~~

Room notifications used:

~~~text
/chatroom?from_notification=chatroom&room_id=<id>
~~~

Lesson:

> Route to the business object, not merely to the app homepage.

### Resume was a real bug surface

The right route could open while the visible content was still old.

Observed causes included:

- cached/reused reads during iOS resume;
- competing async conversation loads;
- duplicate activation signals.

Fixes included:

- cache-busting the notification-triggered read;
- request sequencing so older results cannot overwrite newer ones;
- short-window duplicate click suppression;
- full server re-fetch after activation.

### Live connection was treated as disposable

WebSocket behavior included:

~~~text
onclose -> reconnect after 2 seconds
~~~

Client state was refreshed on:

- focus;
- pageshow;
- visibilitychange.

This is one reason background suspension was not treated as catastrophic.

### Foreground suppression

The server suppressed push only if a fresh mobile/PWA state said the relevant chat was visibly open.

The deployed freshness check was approximately **45 seconds**. That number is not a platform requirement; it is useful field data showing the intended scale: long enough to survive normal heartbeat jitter, short enough that a suspended page does not suppress phone notifications for minutes.

A desktop browser being connected did not automatically suppress phone push.

### Duplicate product alerts

A scheduled reminder and a higher-level AI reaction could both alert.

The notification policy was simplified so only the intended user-facing event owned the push.

Lesson:

> Deduplicate at the business-event layer, not only with notification tags.

## Deployment B: self-hosted collaboration UI

Stack:

- Node;
- web-push;
- same Home Screen PWA architecture;
- different business domain.

The important evidence was portability: the pattern was not accidentally tied to the AI chat implementation.

### Additional hardening

The second implementation added:

- VAPID private material protected with local OS secret protection;
- private subscription state;
- atomic write and read-back verification;
- serialized state mutations;
- explicit eventId and tag;
- 404/410 dead endpoint cleanup;
- bounded transient retry;
- same-origin subscription-write checks;
- JSON-only subscription writes;
- local-only test send;
- target URL restricted to app origin/scope.

### Resume hardening

The mobile live-update path did not trust a frozen long-poll after returning from background.

It used a generation model:

~~~text
resume signal
  -> cancel/abandon old request
  -> increment generation
  -> start fresh request
  -> ignore late results from older generation
~~~

Resume triggers included:

- visibilitychange;
- pageshow;
- focus;
- online.

Lesson:

> Background resilience is partly a data-race problem, not just a push-delivery problem.

## Platform fact vs product choice

### Platform/spec facts

Supported by Apple/WebKit/MDN/RFC:

- iOS/iPadOS 16.4+ supports Web Push for Home Screen web apps;
- original Web Push uses Push API + Notifications API + Service Worker;
- notification permission must be driven by user interaction;
- push endpoints and encryption keys come from PushSubscription;
- VAPID identifies the application server;
- the browser can launch a Service Worker for push/click events;
- iOS 18.4+ supports Declarative Web Push for Home Screen web apps;
- declarative push can display a fallback notification without Service Worker execution.

### Field-tested product choices

- context-specific notification target;
- re-fetch after click;
- stale-request protection;
- duplicate activation suppression;
- foreground suppression;
- WebSocket reconnect after resume;
- dead subscription cleanup;
- bounded retry;
- same-origin target validation;
- local/admin-only test send;
- notification delivery separated from business truth.

## Why both matter

A standards-only guide can be correct and still produce a bad product.

A copied production module can work and still teach accidental details.

The useful middle is:

~~~text
standard protocol
+ field-tested lifecycle
+ explicit security boundaries
- private application code
~~~
