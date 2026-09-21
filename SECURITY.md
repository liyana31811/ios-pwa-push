# Security baseline

## 1. VAPID private key

The private key is a server secret.

Do:

- generate it once;
- store it in a secret store, protected local state, environment secret, or private file;
- keep it out of client bundles, logs and repositories.

Only the public key belongs in browser code.

## 2. PushSubscription endpoint

The endpoint is a capability URL.

Treat the endpoint, p256dh and auth values as private operational data.

Do not publish real device subscriptions.

Redact logs.

## 3. Subscription writes

At minimum:

- require application/json;
- enforce same-origin browser writes or framework CSRF protection;
- validate endpoint as HTTPS;
- validate bounded non-empty key fields;
- limit body size.

A hardened local implementation allowed Origin-less maintenance calls only from loopback socket + loopback Host.

Adapt that to your authentication/reverse-proxy design.

## 4. Test-send authority

A test route is a real notification action.

Do not expose an unauthenticated arbitrary-send endpoint to the internet.

Prefer:

- localhost-only;
- authenticated admin route;
- local CLI;
- deployment smoke script.

Subscribe authority and send authority are different.

## 5. Notification navigation

Never trust payload input as an arbitrary URL.

Normalize relative to the application origin/scope and reject/fallback when:

- origin differs;
- scheme is not HTTPS/expected local route;
- path escapes intended app scope.

## 6. Payload privacy

A lock-screen notification may be visible to another person.

Do not place:

- API tokens;
- passwords;
- long private message archives;
- hidden prompts;
- secrets;
- sensitive database records

inside the push payload.

When necessary, display a generic body and fetch protected content after app authentication.

## 7. Business truth is separate

Push success/failure must not silently:

- resolve a task;
- mark a message read;
- close an incident;
- imply the user viewed anything.

Push is an auxiliary delivery channel.

## 8. State integrity

For file-backed subscription stores:

- write a temporary snapshot;
- validate it;
- atomically replace;
- read back;
- serialize concurrent mutation.

Use a database when multi-user/concurrent requirements justify it.

## 9. Dead subscription cleanup

Remove endpoints on permanent gone responses such as 404 and 410.

## 10. Retry

Retry only transient failures and cap attempts.

A reasonable starting policy:

- 408;
- 425;
- 429;
- 5xx;
- selected network errors.

Never infinite-loop delivery.

## 11. Abuse control

Consider:

- event dedupe;
- per-device rate limits;
- title/body/data size limits;
- TTL bounds;
- authenticated subscription ownership for multi-user services.

## 12. Reverse proxies

If deployed behind a reverse proxy:

- trust forwarded headers only from known proxies;
- derive public origin carefully;
- ensure Service Worker scope is correct;
- keep send/test/admin routes restricted.

## 13. Logging

Good:

~~~text
push event=task-42 attempted=2 sent=1 failed=1 removed=1 status=410
~~~

Bad:

~~~text
endpoint=https://web.push.apple.com/full-capability-url
privateVapid=...
keys=...
~~~

## 14. Pre-publication checklist

- no real subscriptions;
- no VAPID private keys;
- no personal private contact values;
- no private hostnames/tailnet names;
- no device identifiers;
- no production endpoints;
- no sensitive screenshots.
