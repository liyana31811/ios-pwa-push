# Background suspension and cold resume

## Short answer

If someone says:

> “iOS kills PWAs in the background, so Web Push is unreliable.”

The useful answer is:

> **Do not require the PWA page to remain alive.**

A correct push architecture treats the page process, WebSocket and in-flight requests as disposable.

The notification path and the app-resume path are separate.

## 1. What “killed in the background” can mean

People often mix together four different states.

### A. The visible page was suspended or terminated

Your page JavaScript stops. WebSocket dies. Timers stop.

This should **not** break the notification design.

Original Web Push is delivered through the browser's push infrastructure. WebKit describes the browser launching the appropriate Service Worker when a push arrives, and launching it again for notification activation if necessary.

The page itself does not have to be alive.

### B. The Service Worker is not currently running

Also normal.

Service Workers are event-driven, not permanent daemons.

The browser starts the worker for relevant events.

Do not write “keepalive” loops for this.

### C. The Service Worker registration itself was removed

This is different.

WebKit privacy cleanup can remove old website data, including Service Worker registrations.

Original Web Push was tightly coupled to that registration.

On iOS/iPadOS 18.4+, Declarative Web Push materially improves this case: the push subscription and visible notification can be handled without requiring a Service Worker, and WebKit explicitly describes the declarative notification as a fallback if Service Worker code was removed or cannot launch under resource pressure.

### D. The device is offline

This is a delivery/TTL problem, not an app-background problem.

Apple's Web Push endpoint supports TTL. If a notification cannot be delivered immediately, the service may store it for a bounded period and attempt delivery when the device becomes available.

Choose TTL according to product meaning. A stale “agent needs approval now” alert should not survive forever.

## 2. The field-tested strategy

The working self-hosted apps did not implement an iOS background daemon.

They used this architecture:

~~~text
server
  -> sends push independently of page connection

iOS/browser push service
  -> receives push

Service Worker or Declarative Web Push
  -> creates visible notification

user taps
  -> durable target URL
  -> existing app: navigate/focus
     OR cold app: open target URL

page starts/resumes
  -> reconnect live transport
  -> read target context
  -> fetch latest state
  -> ignore stale background responses
~~~

The design assumes every volatile browser runtime object may have disappeared.

## 3. Why a WebSocket keepalive is the wrong solution

A WebSocket is useful while the page is active.

It is not a reliable iOS background-notification transport.

When iOS suspends a Home Screen web app:

- timers may stop;
- socket activity may stop;
- the process may be reclaimed.

Trying to prevent that creates fragile, battery-hostile behavior and still does not give you a native background daemon.

Instead:

~~~text
WebSocket = foreground/live synchronization
Web Push  = out-of-process user notification
HTTP fetch = authoritative recovery
~~~

Those channels should complement each other rather than substitute for each other.

## 4. Cold activation must work without postMessage

A common implementation does this:

~~~text
notificationclick
  -> clients.openWindow(target)
  -> immediately postMessage(target)
~~~

That is convenient, but it should not be the only recovery channel.

Historically, WebKit has had cases where a newly opened Home Screen app client was not ready to receive the first Service Worker message immediately.

The durable fallback is the navigation URL itself:

~~~text
/chat?from_push=1&conversation_id=abc
~~~

Then page startup reads the URL and performs recovery.

postMessage can be an optimization, not the only source of activation intent.

## 5. Field-tested recovery layers

### Layer 1: Service Worker lifecycle

A real deployment used:

~~~js
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
~~~

This reduces the window where a new worker version exists but does not control current clients.

It is not a keepalive mechanism.

### Layer 2: client search + navigate + focus

On notification click:

~~~text
match existing window clients
  -> navigate target when needed
  -> focus
  -> otherwise openWindow(target)
~~~

This preserves the installed-app experience when an app client exists and still handles a cold start.

If your origin can be open in several window contexts at once, define a client-selection policy instead of assuming `clients.matchAll()` returns only one useful window. A small single-owner PWA may accept “first in-scope client”; a more complex app may prefer a visible/focused client or use application state to choose. Always keep the target URL as the cold-start fallback.

### Layer 3: URL as recovery state

Targets carried context such as:

~~~text
/chat?from_notification=main-chat&conv_id=<id>
/chatroom?from_notification=chatroom&room_id=<id>
~~~

This lets a newly launched page know what to restore even if no Service Worker message survives the launch.

### Layer 4: page re-fetch

The app reloads:

- conversation list;
- selected conversation;
- current room/task state.

The push message is not considered authoritative state.

### Layer 5: stale-request protection

One real bug looked like this:

~~~text
old request starts
  -> app backgrounds
  -> notification arrives
  -> app resumes and starts fresh request
  -> fresh request finishes
  -> old request finishes late
  -> old state overwrites fresh state
~~~

Fixes used request sequencing/cache-busting.

A second app made the pattern explicit:

~~~text
resume
  -> abort current poll
  -> increment generation
  -> start new poll
  -> discard any response from older generation
~~~

This is important background-suspension hardening even though it has nothing to do with the Web Push protocol.

### Layer 6: reconnect live synchronization

A chat deployment reconnects its WebSocket after close.

It also refreshes client visibility state on:

- focus;
- pageshow;
- visibilitychange.

Another app additionally resumes live updates on:

- online.

The principle:

> Live transport is rebuilt after resume. It is never assumed to have survived suspension.

## 6. 2026 recommendation: Declarative Web Push

Apple/WebKit introduced Declarative Web Push to reduce JavaScript dependence.

A declarative payload looks conceptually like:

~~~json
{
  "web_push": 8030,
  "notification": {
    "title": "Task finished",
    "body": "Tap to view the result.",
    "navigate": "https://example.com/tasks/42?from_push=1",
    "tag": "task-42",
    "silent": false
  }
}
~~~

For supported WebKit versions:

- the browser understands the visible notification directly;
- the browser understands the navigation target directly;
- Service Worker code is optional for the basic display path;
- if optional worker processing fails, the declared notification is the fallback.

WebKit specifically describes this as more reliable when:

- Service Worker JavaScript cannot launch;
- privacy cleanup removed the Service Worker;
- the device is under resource pressure.

### Backward compatibility

Use the same declarative JSON with a small legacy Service Worker fallback.

New WebKit:

~~~text
browser recognizes web_push: 8030
  -> browser displays notification
  -> browser handles navigate
~~~

Older/original Web Push browser:

~~~text
browser dispatches push event
  -> Service Worker parses the same JSON
  -> showNotification(...)
  -> notificationclick handles target
~~~

This makes Declarative Web Push a good progressive enhancement rather than a forked architecture.

## 7. Do not oversell “kill-proof”

No web platform implementation is immune to OS/browser bugs.

WebKit's issue tracker has documented cold-activation and notificationclick problems in some versions/states.

Therefore:

- test on real iPhones;
- keep URL-based cold recovery;
- prefer declarative navigate on supported versions;
- do not rely on a single Service Worker message;
- re-fetch state after the app is visible;
- keep the backend event available independently of push delivery.

“Works after normal suspension/termination by design” is a good claim.

“Impossible for iOS to break” is not.

## 8. Acceptance test for background termination

### Warm app

1. open the Home Screen web app;
2. enable notifications;
3. leave it open in foreground;
4. verify your foreground-notification policy.

### Backgrounded app

1. send app to background;
2. lock phone;
3. wait;
4. trigger real server event;
5. verify native notification;
6. tap it;
7. verify correct context and fresh state.

### Cold app

1. close the Home Screen web app from App Switcher;
2. trigger real server event;
3. verify notification;
4. tap it;
5. verify the installed web app opens;
6. verify target context is restored from URL;
7. verify current server state is fetched.

Treat this as a **cold-launch product test**, not proof that every internal WebKit process was literally destroyed. Background suspension, page termination, Service Worker process termination, Service Worker registration removal, and privacy-data cleanup are different states and can have different platform behavior.

### Network interruption

1. background app;
2. take device temporarily offline;
3. trigger notification with meaningful TTL;
4. restore network;
5. observe delivery policy;
6. verify stale TTL behavior matches expectations.

### Stale-request race

1. deliberately slow a foreground data request;
2. background/resume via notification;
3. start fresh recovery;
4. let the older request finish last;
5. verify it cannot overwrite the fresh state.

That final test catches a class of bugs most push demos never exercise.
