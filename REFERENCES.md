# References

## Primary platform references

### Apple Developer: Sending web push notifications in web apps and browsers

https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

Key points:

- standards-based Web Push;
- Home Screen web apps on iOS 16.4+;
- direct user gesture for subscription permission;
- Service Worker handling for original Web Push;
- TTL, Topic and Urgency semantics;
- no Apple Developer Program requirement.

### WebKit: Web Push for Web Apps on iOS and iPadOS

https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

Key points:

- Home Screen app identity;
- standalone/fullscreen manifest behavior;
- native-style notification integration;
- APNs-backed standards Web Push.

### WebKit: Meet Declarative Web Push

https://webkit.org/blog/16535/meet-declarative-web-push/

Key points:

- iOS/iPadOS 18.4+;
- visible notification without requiring an installed Service Worker;
- window.pushManager;
- standard web_push: 8030 payload;
- required navigate URL;
- fallback when Service Worker processing fails;
- resilience if Service Worker was removed or cannot launch under resource pressure.

### Apple WWDC25: Learn more about Declarative Web Push

https://developer.apple.com/videos/play/wwdc2025/235/

Especially useful for:

- original Web Push launch lifecycle;
- browser relaunching Service Worker for push/notificationclick;
- declarative fallback behavior;
- backward-compatible payload migration.

### MDN Push API

https://developer.mozilla.org/en-US/docs/Web/API/Push_API

### RFC 8292: Voluntary Application Server Identification (VAPID)

https://www.rfc-editor.org/rfc/rfc8292.html

## Public implementation references

### andreinwald/webpush-ios-example

https://github.com/andreinwald/webpush-ios-example

A mature iOS-focused sample covering:

- Add to Home Screen;
- standalone manifest;
- VAPID;
- subscription;
- Service Worker;
- backend send;
- Declarative Web Push reference.

### Cheiineeey/ios-web-push

https://github.com/Cheiineeey/ios-web-push

A compact Chinese Python/pywebpush example aimed directly at:

- self-hosted HTTPS site;
- Add to Home Screen;
- explicit enable button;
- iPhone system notification.

### MMMikeM/web-push

https://github.com/MMMikeM/web-push

A modern Web Crypto implementation with useful library-level ideas such as:

- subscribe helper;
- server send;
- VAPID;
- endpoint upsert guidance;
- multi-runtime support.

## Useful WebKit bug history

### Cold-open Service Worker client message timing

https://bugs.webkit.org/show_bug.cgi?id=252544

Historical example of why a newly opened PWA should not depend solely on an immediate Service Worker postMessage.

### notificationclick / terminated-state issues

https://bugs.webkit.org/show_bug.cgi?id=268797

Current issue history showing why public documentation should avoid claiming absolute “kill-proof” behavior across every iOS/WebKit build.

The architecture in this repository reduces dependence on fragile runtime state but cannot eliminate platform bugs.
