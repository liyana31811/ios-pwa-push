# Self-hosted iOS Web Push

**Native iPhone notifications for a self-hosted web UI — without Bark, an App Store binary, or an Apple Developer account.**

This repository is for people who already run their own web frontend and save it to the iPhone Home Screen as a standalone web app.

It is not another Web Push library. It is a practical architecture guide for the full product path:

~~~text
self-hosted web app
  -> Add to Home Screen
  -> user enables notifications
  -> browser creates a PushSubscription
  -> your backend stores it
  -> a real app event sends Web Push
  -> iOS shows a native system notification
  -> user taps it
  -> the installed web app opens or focuses
  -> the exact chat/task/room is restored
  -> the app re-fetches current server state
~~~

The design here is based first on two unrelated self-hosted applications that have actually used the pattern on iPhone, then checked against Apple/WebKit documentation and public reference implementations.

One deployment was a Python/FastAPI AI chat app using pywebpush. A second, unrelated Node collaboration app reused the same architecture with web-push and added stricter storage, origin and retry hardening.

## The important idea

A lot of guides stop at:

> the notification appeared.

For a real self-hosted app, that is only half the feature.

The useful product loop is:

> **notification -> installed Home Screen web app -> correct business context -> fresh server state**

That final recovery path is where real-world bugs tend to hide.

## Why not just use Bark?

Bark is excellent for:

> “The job finished. Make my phone alert me.”

It is fast to wire up and often the shortest answer.

But if your self-hosted frontend is already installed to the iPhone Home Screen and used like an app, standard Web Push lets **that web app itself own the notification**.

That matters because the web app can control the activation lifecycle:

- focus an existing app window;
- navigate it to the exact route;
- cold-open a route if no app window exists;
- carry a conversation/task/room identifier;
- re-fetch the authoritative server state;
- suppress redundant pushes while the user is already looking at the target.

A useful shorthand is:

> **Bark can take you to a URL. Web Push can make the notification belong to the web app that owns that URL.**

Bark is not “wrong”; it solves a different product boundary.

## Do not fight iOS background suspension

This is the most important operational lesson in the repository.

**Do not build the design around keeping the PWA alive in the background.**

The working deployments did the opposite: they assumed the page, WebSocket and JavaScript process could disappear at any time.

Original Web Push already does not require your page to stay running. When a push arrives, the browser can launch the relevant Service Worker to handle it. When a notification is tapped, the browser can launch the Service Worker again for the click event.

Then the application is designed for cold resume:

~~~text
push service wakes notification path
  -> notification appears
  -> user taps
  -> route URL is durable recovery input
  -> existing app client: navigate + focus
     OR cold app: open target URL
  -> page startup/resume reconnects live transport
  -> page re-fetches server truth
  -> stale pre-suspend requests are ignored
~~~

That is why “iOS killed my background page” does not have to mean “notifications stop working”.

See [BACKGROUND-RESUME.md](BACKGROUND-RESUME.md).

## 2026 reliability upgrade: Declarative Web Push

For iOS/iPadOS 18.4+ and newer WebKit platforms, Apple ships **Declarative Web Push**.

It is especially relevant to background/resource-pressure reliability:

- the push payload itself contains a standardized visible notification;
- the browser can display it without running Service Worker JavaScript;
- the payload contains a required navigation URL;
- Service Worker processing becomes optional;
- if optional Service Worker processing fails, the declarative notification remains the fallback;
- WebKit states that this fallback can still work when the Service Worker was removed by privacy cleanup or cannot launch under resource pressure.

For a new 2026 implementation, this repository recommends:

1. keep the field-tested cold-resume architecture;
2. send the standardized declarative payload format when possible;
3. keep a small Service Worker as a backward-compatible fallback for browsers that still use original Web Push;
4. do not depend exclusively on Service Worker postMessage for activation recovery.

You normally do **not** need to maintain separate “Declarative” and “legacy” device lists. The useful migration pattern is one backward-compatible JSON contract: newer WebKit consumes the declarative notification directly, while an original-Web-Push browser can hand the same JSON to your fallback Service Worker, which calls `showNotification()`.

This is a **recommended modern enhancement**, not something we claim the older field deployment already used.

## Platform facts

Apple added standards-based Web Push to Home Screen web apps in iOS/iPadOS 16.4.

A Home Screen web app:

- is installed through Add to Home Screen;
- uses an app-like manifest display mode such as standalone;
- has a separate app-like identity from an ordinary Safari tab;
- can ask for notification permission from a direct user gesture;
- can receive native lock-screen / Notification Center alerts through standard Web Push;
- does not require Apple Developer Program membership.

Official references are collected in [REFERENCES.md](REFERENCES.md).

## Architecture

~~~text
                 HTTPS + manifest + app scope
                            |
                            v
                 Add to iPhone Home Screen
                            |
                            v
                +----------------------+
                | standalone web app   |
                +----------+-----------+
                           |
                    explicit user tap
                           v
                 notification permission
                           |
                           v
                PushManager.subscribe()
                           |
                      PushSubscription
                           |
                           v
                 POST /push/subscribe
                           |
                           v
              +-------------------------+
              | your application server |
              |                         |
              | VAPID identity          |
              | subscription registry   |
              | event policy            |
              +------------+------------+
                           |
                    business event
                 chat/task/agent/alarm
                           |
                           v
                    Web Push protocol
                           |
                           v
                  browser push service
                 (Apple for iOS/Safari)
                           |
                           v
                 native iOS notification
                           |
                       user taps
                           |
             +-------------+-------------+
             |                           |
      existing app client           no app client
       navigate + focus               cold open
             |                           |
             +-------------+-------------+
                           |
                           v
                  target app route
                           |
                           v
                 re-fetch server truth
                           |
                           v
                resume the real workflow
~~~

Detailed lifecycle: [ARCHITECTURE.md](ARCHITECTURE.md)

## Minimum implementation

### 1. Give the site an installable app identity

Serve over HTTPS and link a manifest.

A minimal manifest:

~~~json
{
  "name": "My Self-hosted App",
  "short_name": "MyApp",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
~~~

See [examples/manifest.webmanifest](examples/manifest.webmanifest).

### 2. Ask for notification permission from an explicit action

Do not request permission on page load.

~~~js
enableButton.addEventListener("click", async () => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  await ensurePushSubscription();
});
~~~

The real iPhone deployment moved permission behind an explicit user tap and removed the old page-load prompt path.

See [examples/subscribe.js](examples/subscribe.js).

### 3. Store the browser subscription on your server

A PushSubscription normally contains:

~~~json
{
  "endpoint": "https://...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
~~~

Upsert by endpoint. Treat the endpoint and keys as private operational data.

For a single-owner self-hosted app, that may be enough. For a multi-user app, `endpoint` uniqueness is only the storage rule — you also need ownership:

~~~text
subscription
  endpoint UNIQUE
  user_id
  optional device_id / device label
  p256dh
  auth
  created_at
  updated_at
  last_success_at
~~~

On login/logout/account switch, reconcile that ownership explicitly. Never let “same browser has a valid subscription” imply “it still belongs to the previous user.”

### 4. Keep one stable VAPID identity

The public VAPID key goes to the browser. The private key stays on the server.

Use a real contact URI for the VAPID subject, for example:

~~~text
mailto:ops@example.com
~~~

One real iPhone deployment hit Apple 403 BadJwtToken until a placeholder contact identity was replaced with a real one. Treat that as a field observation, not a universal browser rule, but avoid dummy VAPID subjects.

### 5. Send an application event, not just a string

Recommended logical payload:

~~~json
{
  "eventId": "task-42-completed",
  "tag": "task-42",
  "title": "Task finished",
  "body": "Tap to open the result.",
  "target": "/tasks/42?from_push=1",
  "data": {
    "kind": "task-completed",
    "taskId": "42"
  },
  "ttl": 300
}
~~~

For modern Declarative Web Push, encode the visible notification in the standardized declarative form. See [examples/server-contract.md](examples/server-contract.md).

### 6. Route the click back into the app

The legacy/backward-compatible Service Worker should:

- parse the payload;
- show the notification on original Web Push browsers;
- validate the route;
- find an existing app client;
- navigate/focus it when possible;
- otherwise open the route.

See [examples/sw.js](examples/sw.js).

### 7. Re-fetch after activation

Do **not** trust the push payload as the final state.

After a notification opens:

1. parse the target context;
2. select the correct conversation/task/room;
3. fetch current state;
4. ignore old requests that were started before resume;
5. render the fresh result.

See [examples/resume.js](examples/resume.js).

## Field-tested hardening

The two real deployments surfaced these practical rules:

### Foreground suppression

If the exact mobile app context is already visible, do not also send a system notification.

A working implementation used a short-lived mobile/PWA visibility heartbeat and suppressed only when the matching chat/room was visibly open. Its freshness window was about **45 seconds**; treat that as field data, not a universal constant.

A practical rule is:

~~~text
visible matching context + heartbeat still fresh -> suppress
hidden / wrong context / stale heartbeat           -> allow push
~~~

Send a final hidden-state update on `visibilitychange` when possible, but still expire presence server-side because iOS may suspend the page before cleanup code runs.

Do not let “a desktop tab is connected” suppress the phone unless that is explicitly your product rule.

### WebSocket / live connection is not notification authority

A live socket can disappear when iOS suspends or kills the page.

That is fine.

Use Web Push for the notification channel and reconnect WebSocket/polling when the app returns.

One field deployment used:

~~~text
WebSocket close -> reconnect after 2 seconds
focus/pageshow/visibilitychange -> refresh client state
~~~

The second deployment went further:

~~~text
resume signal
  -> abort old long-poll
  -> increment request generation
  -> start a fresh poll
  -> ignore late responses from previous generations
~~~

That protects the UI from “old background request arrived after the new foreground request” races.

### Dead subscription cleanup

Delete endpoints when the push service returns 404 or 410.

### Bounded retry

Retry only transient failures and cap attempts. A hardened implementation treated 408, 425, 429 and 5xx as retry candidates.

### Same-origin route safety

Do not let a notification payload navigate your app to arbitrary external URLs.

### Delivery is not exactly-once

Web Push should be treated as an **at-least-once-ish user notification channel**, not an exactly-once transaction.

Keep the roles separate:

- `eventId` — application trace/idempotency identity;
- `tag` — OS/browser notification replacement or grouping hint;
- transport attempt record — what this send attempt did;
- business object revision/state — the actual truth.

A timeout can be ambiguous: the first attempt may have reached the push service before the sender saw an error. Bounded retry must therefore tolerate a duplicate user-visible attempt. Do not promise exactly-once notification delivery.

### Delivery is not business truth

A failed notification does not close/open/resolve the underlying task, incident or message.

## Bark vs PWA-owned Web Push

| Requirement | External notifier such as Bark | Web Push owned by your PWA |
|---|---:|---:|
| Alert the phone | Excellent | Excellent |
| Very fast setup | Excellent | More work |
| Another notification app required | Yes | No |
| Notification belongs to the installed web app | No | Yes |
| App controls activation lifecycle | Indirect URL handoff | Yes |
| Focus/navigate existing PWA window | Not the notifier's lifecycle | Yes |
| Restore chat/task/room and refresh state | App must recover after generic handoff | Native design goal |
| “Job finished, ping me” | Great fit | Often overkill |
| “My self-hosted frontend already is my app” | Works, but indirect | Best fit |

## Repository map

~~~text
.
├── README.md
├── ARCHITECTURE.md
├── BACKGROUND-RESUME.md
├── FIELD-NOTES.md
├── SECURITY.md
├── IOS-CHECKLIST.md
├── REFERENCES.md
├── examples/
│   ├── manifest.webmanifest
│   ├── subscribe.js
│   ├── sw.js
│   ├── resume.js
│   └── server-contract.md
└── LICENSE
~~~

## Five things to remember

1. **Install identity matters.** This is a Home Screen web-app feature on iPhone.
2. **Ask on a tap.** Permission/subscription belongs behind explicit user action.
3. **Do not keep the app alive.** Design notifications and resume to work after suspension.
4. **Route, then re-fetch.** Notification data gets you to the object; the server tells you what is true now.
5. **Use Declarative Web Push as a 2026 progressive enhancement.** It reduces dependence on Service Worker execution under resource pressure.

## 中文一句话

如果你已经有一个自建网页前端，并把它添加到 iPhone 主屏幕当 App 用，那么你不一定需要 Bark：**标准 PWA Web Push 可以让这个桌面 Web App 自己拥有系统通知；正确的架构不是保活后台，而是让通知在页面不活着时照样到达，点开后再冷恢复到正确的聊天 / 任务 / 房间并重新读取最新状态。**

## License

MIT.
