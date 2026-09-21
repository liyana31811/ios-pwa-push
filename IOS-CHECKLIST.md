# iPhone / iOS acceptance checklist

## Preconditions

- [ ] iOS/iPadOS 16.4+ for Home Screen Web Push
- [ ] HTTPS
- [ ] manifest linked
- [ ] app-like display mode (commonly standalone)
- [ ] stable app scope/start URL
- [ ] Service Worker available for original-Web-Push compatibility
- [ ] site added to iPhone Home Screen
- [ ] test launched from Home Screen web app, not only Safari tab
- [ ] notification permission requested from explicit user gesture

## Subscription

- [ ] Notification.permission is granted
- [ ] a PushManager is available
- [ ] VAPID public key loads
- [ ] subscription contains endpoint + p256dh + auth
- [ ] subscription reaches backend
- [ ] backend upserts rather than appending duplicates
- [ ] re-opening app with permission granted can ensure/resync the subscription

## Delivery

- [ ] VAPID private key is server-only
- [ ] VAPID subject is a real mailto: or https: contact
- [ ] test send returns a real push-service success
- [ ] dead 404/410 subscriptions are removed
- [ ] retries are bounded
- [ ] payload contains no secrets
- [ ] TTL matches event meaning

## Foreground UX

- [ ] exact visible mobile context follows intended suppression policy
- [ ] background app still gets push
- [ ] desktop presence does not accidentally suppress phone unless intended
- [ ] duplicate business events do not create duplicate alerts

## Notification activation

- [ ] target is same-origin / in app scope
- [ ] existing app client is focused/navigated when possible
- [ ] cold app opens target route
- [ ] URL itself contains enough recovery context
- [ ] recovery does not depend only on Service Worker postMessage
- [ ] app re-fetches latest server state
- [ ] old in-flight requests cannot overwrite fresh resume state

## Background / killed-app matrix

- [ ] app foreground
- [ ] app background
- [ ] phone locked
- [ ] app force-closed from App Switcher
- [ ] app resumed after several minutes
- [ ] temporary offline -> online with meaningful TTL
- [ ] WebSocket reconnect after resume
- [ ] stale long-poll/fetch response cannot win after resume

## iOS 18.4+ Declarative Web Push

- [ ] declarative payload uses web_push: 8030
- [ ] notification has non-empty title
- [ ] notification has valid navigate URL
- [ ] navigate stays within intended app origin/scope
- [ ] legacy Service Worker can parse the same JSON for older browsers
- [ ] no assumption that Declarative Web Push removes all platform bugs

## Troubleshooting

### PushManager missing

Check:

- iOS version;
- HTTPS;
- launched from installed Home Screen app;
- manifest/install identity;
- feature detection.

### Permission never prompts

Check that requestPermission happens synchronously from a direct user action.

### Apple 403 / authentication failure

Check:

- VAPID private/public key pair;
- JWT creation;
- VAPID subject/contact identity;
- applicationServerKey matches the subscription key.

### 410 Gone

Delete subscription and let the app create/resync a new one.

### Notification arrives but opens wrong context

Your push transport is working. Fix application routing.

Carry conversation/task/room identity in the target.

### App opens but shows old data

Your activation path is working. Fix recovery.

- re-fetch server state;
- cache-bust/no-store where necessary;
- cancel or generation-guard old requests.

### Works until app is backgrounded

You may be using WebSocket/timers as the notification channel.

Move user notification to Web Push and treat live connections as foreground-only.

### Notification display fails under resource pressure

On iOS/iPadOS 18.4+, consider Declarative Web Push so the visible notification does not require Service Worker JavaScript.

### Tap occasionally fails to route on a specific iOS build

Keep:

- URL-based cold-start recovery;
- Declarative Web Push navigate where supported;
- real-device regression tests.

Browser/OS bugs do exist; do not build critical recovery exclusively around one postMessage or one live JS process.
