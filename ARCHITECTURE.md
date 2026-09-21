# Architecture

## Product boundary

The target user already owns a self-hosted web UI.

The problem is not:

> “How do I invent a push protocol?”

The problem is:

> “How do I make my installed iPhone web app receive native notifications and return to the right live workflow?”

The architecture has eight separable layers:

1. app/install identity;
2. explicit user consent;
3. push subscription;
4. subscription/VAPID storage;
5. business notification policy;
6. Web Push transport;
7. notification activation;
8. application-state recovery.

Keeping these layers separate prevents the notification transport from becoming a second business-state system.

## 1. Install identity

Recommended minimum:

- HTTPS secure context;
- Web App Manifest;
- manifest display mode such as standalone;
- stable start URL / scope / id;
- Service Worker for original-Web-Push compatibility and app lifecycle hooks;
- site added to iPhone Home Screen.

A Home Screen web app is the product target, not a normal Safari tab.

## 2. Permission state machine

~~~text
unsupported
  -> explain requirement

supported + permission=denied
  -> explain Settings recovery

supported + permission=default
  -> render explicit Enable notifications action
     -> user taps
     -> requestPermission()
     -> subscribe

supported + permission=granted
  -> ensure subscription exists
  -> sync it to backend
~~~

Do not repeatedly nag or request on page load.

## 3. Push subscription

Normalized record:

~~~json
{
  "endpoint": "https://push-provider.example/opaque-capability-url",
  "keys": {
    "p256dh": "base64url",
    "auth": "base64url"
  },
  "createdAt": "2026-09-21T00:00:00Z",
  "updatedAt": "2026-09-21T00:00:00Z"
}
~~~

Endpoint is a useful upsert key for a small implementation.

The endpoint is also a capability URL. Treat it as private.

## 4. VAPID

Keep one stable application keypair.

~~~text
public key  -> frontend subscription
private key -> server only
subject     -> real mailto: or https: contact identity
~~~

Do not rotate keys casually.

One real deployment observed Apple 403 BadJwtToken while using a placeholder contact identity; replacing it with a real contact identity fixed delivery. That is field experience, not a claim that every 403 has the same cause.

## 5. Business event before transport

Avoid:

~~~text
random backend function -> sendPush()
~~~

Prefer:

~~~text
business event
  -> notification policy
       should notify?
       target device/user?
       exact business context?
       already visible?
       duplicate?
       tag?
       TTL?
  -> transport
~~~

Examples:

- assistant reply;
- long-running task finished;
- agent needs a decision;
- incident requires attention;
- scheduled reminder.

## 6. Foreground suppression

For chat/agent products, a strong default is:

> If the user is visibly looking at the exact target context on the phone, suppress the system notification.

A field-tested server received short-lived state such as:

~~~json
{
  "isPwa": true,
  "isIos": true,
  "visible": true,
  "route": "/chat",
  "contextId": "conversation-123",
  "updatedAt": 1780000000
}
~~~

Important boundaries:

- expire presence quickly;
- match the context, not just “app open”;
- decide separately whether desktop presence suppresses mobile alerts;
- treat presence as a hint, not durable truth.

## 7. Payload

Logical application payload:

~~~json
{
  "eventId": "event-123",
  "tag": "task-42",
  "title": "Task finished",
  "body": "Tap to view the result.",
  "target": "/tasks/42?from_push=1",
  "data": {
    "kind": "task-completed",
    "taskId": "42"
  },
  "ttl": 300
}
~~~

Keep payload data non-sensitive.

## 8. Declarative Web Push envelope

For 2026 implementations, prefer sending the visible part using the standardized declarative shape on supported platforms:

~~~json
{
  "web_push": 8030,
  "notification": {
    "title": "Task finished",
    "body": "Tap to view the result.",
    "navigate": "https://app.example.com/tasks/42?from_push=1",
    "tag": "task-42",
    "silent": false,
    "data": {
      "eventId": "event-123",
      "kind": "task-completed",
      "taskId": "42"
    }
  }
}
~~~

Why:

- modern WebKit can display it without Service Worker JavaScript;
- navigate is part of the notification definition;
- the same JSON can be handled by your Service Worker on original-Web-Push browsers.

Keep a fallback Service Worker for backward compatibility.

## 9. Transport result

A transport result is delivery evidence only.

~~~json
{
  "eventId": "event-123",
  "attempted": 2,
  "sent": 1,
  "failed": 1,
  "removed": 1,
  "retried": 0
}
~~~

It must not become the source of truth for the task/message/incident itself.

## 10. Dead endpoints

Delete subscriptions after permanent gone responses:

- 404;
- 410.

Do not endlessly retry them.

## 11. Transient retry

A hardened deployment used bounded retry for:

- 408;
- 425;
- 429;
- 5xx;
- selected network errors without permanent classification.

Bound the attempt count and delay.

## 12. Original-Web-Push Service Worker

For legacy/backward-compatible handling:

~~~text
push
  -> parse payload
  -> showNotification

notificationclick
  -> validate target
  -> find window clients
  -> navigate/focus matching app
  -> otherwise openWindow(target)
~~~

Use the target URL as durable activation state.

postMessage is optional optimization.

## 13. Application recovery

Page activation is not complete until server state is fresh.

~~~text
read target
  -> refresh list/index
  -> choose target object
  -> fetch latest target state
  -> reject stale earlier requests
  -> render fresh state
~~~

### Race example

~~~text
request A starts
  -> page backgrounds
  -> push opens page
  -> request B starts and finishes
  -> request A finishes late
  -> BUG: old A overwrites B
~~~

Use:

- request sequence/generation IDs;
- AbortController;
- no-store/cache-busting where appropriate;
- object revisions where available.

## 14. Live transport after resume

Do not assume WebSocket/long-poll survives background suspension.

Recommended:

~~~text
on socket close
  -> bounded reconnect

on focus/pageshow/visibilitychange/online
  -> refresh app/live state

on explicit resume
  -> abort stale long poll
  -> new generation
  -> ignore old generation response
~~~

This is a general PWA resilience pattern, not a Web Push protocol requirement.

## 15. Storage

A single-user app can use private JSON if it is implemented carefully:

- private file permissions;
- serialized mutations;
- temporary-file write;
- parse/read-back verification;
- atomic replacement;
- committed read-back.

Use a database when concurrency or multi-user ownership grows.

## 16. Suggested module boundaries

~~~text
frontend/
  subscribe.js
  resume.js
  sw.js

backend/
  push-store
  push-transport
  notification-policy
  business-events
~~~

Interfaces:

~~~text
PushStore
  status()
  publicKey()
  upsert(subscription)
  list()
  removeDead(endpoints)

PushTransport
  send({ eventId, tag, title, body, target, data, ttl })

NotificationPolicy
  fromBusinessEvent(event, presence) -> payload | null
~~~

## 17. Meaningful acceptance

Do not stop at a desktop test.

A real acceptance run:

1. production-like HTTPS;
2. real iPhone;
3. Add to Home Screen;
4. launch from Home Screen;
5. explicit notification opt-in;
6. confirm subscription stored;
7. background/lock phone;
8. trigger a real application event;
9. receive native notification;
10. tap;
11. installed web app opens/focuses;
12. correct chat/task/room is selected;
13. current server state is visible;
14. force-close app and repeat;
15. simulate stale request race;
16. verify dead subscriptions are pruned.

That proves the product path.
