# Server contract

This repository does not prescribe FastAPI, Express, Go, Workers or a database.

It specifies the small contract the rest of the app should be able to implement.

## GET /api/push/status

Example:

~~~json
{
  "configured": true,
  "subscriptionCount": 1
}
~~~

Do not return private keys or subscription endpoints.

## GET /api/push/vapid-public-key

~~~json
{
  "publicKey": "BASE64URL_PUBLIC_KEY"
}
~~~

## POST /api/push/subscribe

Input:

~~~json
{
  "endpoint": "https://...",
  "expirationTime": null,
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
~~~

Server:

1. require JSON;
2. authenticate the caller when the app has user accounts;
3. apply CSRF/same-origin policy appropriate to that auth model;
4. validate HTTPS endpoint;
5. validate bounded keys;
6. upsert by endpoint;
7. bind the subscription to the authenticated owner/device when multi-user;
8. store privately.

**Same-origin is not authentication.** A typical cookie-session app should combine its normal authenticated session with CSRF protection / trusted Origin checks. A bearer-token API should authenticate the bearer and still validate request shape/origin policy as appropriate. Do not invent a second weak auth scheme just for push subscriptions.

Response:

~~~json
{
  "subscribed": true,
  "subscriptionCount": 1
}
~~~

## PushTransport.send

Logical input:

~~~json
{
  "eventId": "task-42-completed",
  "tag": "task-42",
  "title": "Task finished",
  "body": "Tap to view the result.",
  "target": "/tasks/42?from_push=1&task_id=42",
  "data": {
    "kind": "task-completed",
    "taskId": "42"
  },
  "ttl": 300
}
~~~

Logical result:

~~~json
{
  "eventId": "task-42-completed",
  "attempted": 2,
  "sent": 1,
  "failed": 1,
  "removed": 1,
  "retried": 0,
  "failures": []
}
~~~

## Declarative Web Push wire payload

For modern WebKit, convert the visible part to the standardized declarative shape.

The navigate URL must be absolute in the declarative notification.

~~~json
{
  "web_push": 8030,
  "notification": {
    "title": "Task finished",
    "body": "Tap to view the result.",
    "navigate": "https://app.example.com/tasks/42?from_push=1&task_id=42",
    "tag": "task-42",
    "silent": false,
    "data": {
      "eventId": "task-42-completed",
      "kind": "task-completed",
      "taskId": "42"
    }
  }
}
~~~

A newer WebKit browser can display/navigate this declaratively.

An original-Web-Push browser receives the same JSON in its Service Worker. The example Service Worker in this repository converts the notification object to showNotification().

That gives one payload format with progressive enhancement.

The intended migration is **not UA branching**:

~~~text
same declarative-compatible JSON
  -> modern WebKit: browser consumes declarative notification
  -> original Web Push browser: Service Worker receives JSON and calls showNotification()
~~~

Do not add a `supportsDeclarative` database flag unless a real compatibility case forces you to.

## TTL

Set TTL according to event meaning.

Examples:

~~~text
incoming chat reply       60-300 seconds, depending on product
agent approval required   short enough to avoid stale approval prompts
long task completion      can be longer
critical incident         product-specific
~~~

Do not blindly use the maximum TTL.

## Dead subscription policy

Remove subscription after permanent “gone” responses:

~~~text
404
410
~~~

## Retry policy

A reasonable bounded starting point:

~~~text
retry candidates:
  408
  425
  429
  5xx
  selected network errors

max retries:
  1-3

delay:
  small bounded backoff
~~~

Do not retry malformed/auth failures automatically.

Do not assume retry is exactly-once. A network timeout can occur after the push service accepted the first attempt. Treat:

~~~text
eventId = application identity / trace
tag     = notification replacement/grouping hint
attempt = transport evidence
~~~

as separate concepts, and make duplicate attempts harmless.

## Notification policy contract

Keep this above the transport:

~~~text
notificationFor(event, presence) -> payload | null
~~~

It should decide:

- whether the event deserves a push;
- which device/user;
- whether the target is visibly open already;
- target route;
- eventId;
- tag;
- TTL.

The Web Push transport should not decide business significance.

A useful application-level contract is:

~~~ts
type NotificationIntent = {
  eventId: string;
  recipientId: string;
  kind: string;
  context: {
    type: "chat" | "task" | "room" | string;
    id: string;
  };
  target: string;
  title: string;
  body: string;
  tag?: string;
  ttl: number;
  data?: Record<string, unknown>;
};
~~~

The exact type system is optional; the separation is not.

## Test send

If you expose a test-send route:

- localhost-only, authenticated admin-only, or local CLI;
- never a public arbitrary-notification endpoint.

## Health and observability

Useful diagnostics:

~~~json
{
  "configured": true,
  "subscriptionCount": 2,
  "lastSend": {
    "attempted": 2,
    "sent": 2,
    "failed": 0
  }
}
~~~

Do not expose:

- full endpoints;
- subscription keys;
- VAPID private key.

## Client reconciliation on startup/resume

If notification permission is already granted:

1. get the current subscription;
2. if missing, create a new one;
3. sync/upsert it to the backend every time the ensure step succeeds.

This repairs the common state where the browser has a subscription but an earlier backend upload failed.

For multi-user apps, also reconcile ownership on login/account switch/logout. A logout policy may either retire the device binding immediately or move it to an unaffiliated state, depending on product requirements; what matters is that a subscription is never silently inherited by the next account.
