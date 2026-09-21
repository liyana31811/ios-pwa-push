# iOS PWA Push

**给已经保存到 iPhone 主屏幕的自建 Web App 加上原生系统通知，并让用户点通知以后直接回到对应的聊天 / 任务 / 房间。**

> 重点不是“让网页响一下”，而是把 **通知 → 回到自己的 PWA → 恢复正确现场** 这一整条做完整。

[English README](README.en.md)

**适合：** 已经有自己的 Web App / PWA，想把 iPhone 系统通知、点开回到对应页面、后台恢复这条链路做完整。  
**如果只是想让手机在任务结束时响一下，Bark 会更省事。**

---

# 30 秒看懂：这个仓库解决 3 件事

### ✅ 1. 让自建 PWA 自己拥有 iPhone 原生通知

不需要 App Store 原生 App，也不一定需要 Bark。

你的 Web 前端加到 iPhone 主屏幕后，可以像 App 一样出现在锁屏和通知中心。

### ✅ 2. 点通知不是“打开首页”，而是直接回到对应现场

例如：

~~~text
/chat?conversation_id=abc
/tasks/42
/rooms/construction
~~~

点通知以后，已有 PWA 窗口就 navigate + focus；没有窗口就 cold open。

页面起来后，再重新读取服务器最新状态。

### ✅ 3. 后台被 iOS 挂起或回收后，也能按“冷恢复”找回现场

我们不把 WebSocket、Timer、页面 JavaScript 当后台通知基础。

页面死了没关系：

~~~text
Web Push 到达
  → 系统 / 浏览器处理通知
  → 用户点击
  → PWA 冷启动或恢复
  → 根据 target URL 找回现场
  → re-fetch server truth
~~~

这也是后面整个架构最重要的设计原则。

---

# Bark 和 PWA Web Push 怎么选

乍看两种都能“给 iPhone 发通知”，但它们擅长的事情不一样。

| 你最关心的事 | Bark | PWA Web Push |
|---|---|---|
| 只想“跑完叫我一声” | ✅ **最省事** | ⚠️ 能做，但偏重 |
| 不想改现有前端 | ✅ **基本不用动** | 🛠️ **需要做一次前后端接入** |
| 已经有自己的桌面 PWA | ⚠️ 能用，但还是外置通知器 | ✅ **更自然** |
| 点通知直接回对应 chat / task / room | ⚠️ 靠外部 URL 跳转 | ✅ **应用自己的恢复路径** |
| 通知属于自己的 Web App | ❌ 否 | ✅ **是** |
| iOS suspend / kill 后恢复现场 | ⚠️ 与 PWA 生命周期分离 | ✅ **按 cold resume 设计** |
| App 正在看目标时自动不打扰 | ⚠️ 需要额外协调 | ✅ **应用自己判断最自然** |
| 想把 Web 前端真正当“App”用 | ⚠️ 更像外挂通知 | ✅ **更完整** |

**一句话判断：**

- 只是需要“任务完成手机响一下” → **Bark 更省事。**
- 已经有桌面 PWA，而且希望“通知属于自己的 App、点开回正确现场、杀后台后还能恢复” → **PWA Web Push 更合适。**

> **Bark 可以把你带到一个 URL；PWA Web Push 可以让通知属于你自己的 Web App，并由它负责恢复现场。**

---

# 完整链路长什么样

~~~text
你的自建前端
  → 保存到 iPhone 主屏幕
  → 像 App 一样运行
  → 后端发生新消息 / 任务完成 / Agent 求助
  → iPhone 锁屏和通知中心收到原生通知
  → 用户点通知
  → 回到原来那个桌面 Web App
  → 直接进入对应聊天 / 任务 / 房间
  → 重新读取服务器最新状态
~~~

如果你已经会自己搭 Web 前端，这个仓库主要帮你把 **iOS PWA Push 的架构、恢复逻辑，以及真正容易踩的坑一次讲清楚**。

---

# 为什么不怕 iOS“杀后台”

很多人担心：

> “iOS 会杀后台，那 Web App 推送不是不稳定吗？”

我们的实际做法刚好相反：

> **根本不要求 Web App 后台活着。**

页面、JavaScript、Timer、WebSocket 都可以随时被 iOS suspend，甚至进程被回收。

通知链和页面常驻不是一回事。

## Original Web Push 的思路

~~~text
你的页面活着？
  不重要

服务器发 Web Push
  ↓
浏览器 / 系统 Push 通道收到
  ↓
需要时启动 Service Worker
  ↓
显示系统通知
  ↓
用户点击
  ↓
再次启动 / 调用 Service Worker notificationclick
  ↓
打开或聚焦 PWA
~~~

所以正确设计不是：

> “想办法让 PWA 永远在后台跑。”

而是：

> **假设它随时会死，然后把“通知 + 冷恢复”设计完整。**

我们家一直比较稳，核心就在这里。

---

## 杀后台以后，怎么把现场恢复回来

单纯 showNotification() 远远不够。

真正可靠的恢复路径至少有下面几层。

### 1. 通知里必须带“可持久恢复”的目标 URL

例如：

~~~text
/chat?from_push=1&conversation_id=abc
/tasks/42?from_push=1
/rooms/construction?from_push=1
~~~

这个 URL 本身就是恢复线索。

不要只发：

~~~text
/
~~~

或者：

~~~text
/chat
~~~

否则用户虽然回到了 App，却不知道该回哪个现场。

---

### 2. 点通知时先找已有 PWA 窗口

Service Worker 的 notificationclick：

~~~text
已有窗口
  → navigate(target)
  → focus()

没有窗口
  → openWindow(target)
~~~

这样用户点的不是“随便打开一个网页”，而是尽量回到原来的 Web App 实例。

---

### 3. 不要把 postMessage 当唯一恢复手段

Service Worker 可以给页面发：

~~~text
notification_click
~~~

但这只能当优化。

冷启动时，新开的页面未必已经准备好接住第一条 Service Worker 消息。

所以：

> **URL 才是 durable recovery input。**

页面自己启动时也必须会读 URL 并恢复。

---

### 4. 回来以后重新读服务器真相

Push payload 只负责：

> “你该去哪。”

不要负责：

> “现在事情到底是什么状态。”

正确路径：

~~~text
通知
  ↓
定位 conversation / task / room
  ↓
重新 fetch server state
  ↓
渲染最新现场
~~~

---

### 5. 防止“后台旧请求”回来覆盖新状态

这个是实战里真的踩过的坑。

可能发生：

~~~text
请求 A 发出
  ↓
App 进后台
  ↓
通知唤醒 App
  ↓
请求 B 重新拉最新数据并完成
  ↓
老请求 A 迟到
  ↓
把 B 的新状态又覆盖成旧状态
~~~

所以恢复时最好使用：

- AbortController
- request sequence
- generation id
- cache bust / no-store
- revision check

例如：

~~~text
resume
  → abort old poll
  → generation + 1
  → start fresh request
  → older generation response 直接丢弃
~~~

这部分和 Web Push 协议本身无关，但对“iOS 杀后台后能不能稳定回来”非常重要。

---

### 6. WebSocket 只负责前台实时同步

不要把 WebSocket 当后台通知通道。

~~~text
WebSocket = 前台实时同步
Web Push  = 页面不活着时叫用户
HTTP fetch = 恢复后重新取真相
~~~

App 回来以后重新建 WebSocket / long-poll 即可。

我们实跑过的恢复触发包括：

- focus
- pageshow
- visibilitychange
- online

---

# 整体架构

~~~text
                 HTTPS + Web App Manifest
                           │
                           ▼
                 Add to Home Screen
                           │
                           ▼
               ┌────────────────────┐
               │ iPhone 桌面 PWA   │
               └─────────┬──────────┘
                         │
                 用户点击「开启通知」
                         │
                         ▼
               Notification permission
                         │
                         ▼
                PushManager.subscribe()
                         │
                  PushSubscription
                         │
                         ▼
               POST /push/subscribe
                         │
                         ▼
             ┌────────────────────────┐
             │ 你的 Application Server │
             │                        │
             │ VAPID                  │
             │ Subscription Store     │
             │ Notification Policy    │
             └───────────┬────────────┘
                         │
                 真实业务事件发生
              消息 / Task / Agent / Alarm
                         │
                         ▼
                    Web Push
                         │
                         ▼
                  iPhone 系统通知
                         │
                      用户点击
                         │
              ┌──────────┴───────────┐
              │                      │
          已有 PWA 窗口          没有 PWA 窗口
          navigate+focus            cold open
              │                      │
              └──────────┬───────────┘
                         ▼
               对应 chat/task/room
                         │
                         ▼
                re-fetch server truth
                         │
                         ▼
                    恢复现场
~~~

详细技术拆分见：

[ARCHITECTURE.md](ARCHITECTURE.md)

---

# 最小接入步骤

如果你已经有自己的 Web 前端，可以按这个顺序接。

## 1. 先把网页变成真正的 Home Screen Web App

至少需要：

- HTTPS
- Web App Manifest
- display: standalone
- 稳定的 id
- 稳定的 start_url
- 稳定的 scope
- 图标
- Service Worker（兼容 Original Web Push）

示例：

[examples/manifest.webmanifest](examples/manifest.webmanifest)

---

## 2. 必须由用户主动点击开启通知

不要页面一加载就申请通知权限。

在 iPhone 上，权限申请必须绑在明确的用户交互上。

正确思路：

~~~js
enableButton.addEventListener("click", async () => {
  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    await ensurePushSubscription();
  }
});
~~~

示例：

[examples/subscribe.js](examples/subscribe.js)

---

## 3. 创建 PushSubscription

浏览器端：

~~~js
pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: vapidPublicKey
})
~~~

然后把：

~~~text
endpoint
p256dh
auth
~~~

POST 给自己的后端。

---

## 4. 后端保存 Subscription

最简单的单人自用项目：

~~~text
endpoint UNIQUE
p256dh
auth
created_at
updated_at
~~~

如果你的项目有多用户，还必须记录 ownership：

~~~text
user_id
device_id（可选）
~~~

不要出现：

> 用户 A 登出以后，同一个浏览器 Subscription 默默被用户 B 继承。

---

## 5. VAPID 私钥只放服务器

~~~text
public key  → 前端
private key → 后端
subject     → 真实 mailto: / https: 联系地址
~~~

我们自己真机接 Apple Push 时踩过一个坑：

> 使用占位 VAPID subject 时，Apple 返回过 403 BadJwtToken。

换成真实联系身份以后测试发送成功。

所以不要照教程随手留一个假的 placeholder 邮箱。

---

## 6. 业务事件先经过 Notification Policy

不要到处：

~~~text
业务代码 → sendPush()
~~~

最好统一成：

~~~text
业务事件
  ↓
notification policy
  ├─ 这件事值得通知吗？
  ├─ 通知谁？
  ├─ 用户现在是不是正在看同一页面？
  ├─ target 是什么？
  ├─ tag 是什么？
  └─ TTL 多久？
  ↓
Web Push Transport
~~~

例如：

- AI 回复完成
- 任务完成
- Agent 需要批准
- 会议室有 Must Action
- 报警
- 提醒事项

---

## 7. 点通知后定位具体业务对象

Payload 里至少应该有：

~~~json
{
  "eventId": "task-42-completed",
  "title": "Task finished",
  "body": "Tap to view result",
  "target": "/tasks/42?from_push=1",
  "tag": "task-42",
  "data": {
    "kind": "task-completed",
    "taskId": "42"
  }
}
~~~

示例 Service Worker：

[examples/sw.js](examples/sw.js)

---

## 8. 页面恢复后重新 fetch

示例：

[examples/resume.js](examples/resume.js)

重点不是照抄代码，而是保留这几个原则：

~~~text
URL 是恢复入口
服务器才是真相
旧请求不能覆盖新请求
WebSocket / long-poll 恢复后重建
~~~

---

# 进阶：iOS 18.4+ 的 Declarative Web Push

iOS / iPadOS 18.4+ 的 WebKit 已经支持 **Declarative Web Push**。

它特别适合这个场景。

以前的 Original Web Push 更依赖：

~~~text
Push
  → 启动 Service Worker JavaScript
  → JS 调 showNotification()
~~~

Declarative Web Push 则可以把“要显示什么通知、点了去哪里”直接写进标准 payload。

现代 WebKit 可以直接处理：

~~~text
Push payload
  → 系统理解 notification
  → 直接显示
  → 点击按 navigate URL 打开
~~~

这意味着即使：

- Service Worker 暂时拉不起来；
- Service Worker 被 privacy cleanup 清掉；
- 设备资源压力比较大；

声明式通知仍可以作为 fallback。

所以新项目推荐：

> **已验证的冷恢复架构 + Declarative Web Push 渐进增强。**

不是把 Service Worker 全删掉。

更实用的方式是：

~~~text
同一份兼容 payload
  → 新 WebKit：直接 declarative 处理
  → 老浏览器：Service Worker 读取同一 JSON 后 showNotification()
~~~

通常不需要为“新 / 旧浏览器”维护两套订阅表。

详细说明见：

[BACKGROUND-RESUME.md](BACKGROUND-RESUME.md)

---

---

# 最容易踩的坑：先看这张表

这些不是理论边界，很多都是实跑时真的踩过的。

| 症状 | 判断 | 建议 |
|---|---|---|
| 只在 Safari 标签页测 | ❌ 场景不对 | **一定从 Add to Home Screen 后的 PWA 真机测** |
| 页面一加载就申请通知权限 | ❌ iOS 容易不给 | **必须绑用户明确点击** |
| 通知能响，但点开只能回首页 | ⚠️ Push 通了，恢复没做完 | target 带 **conversation_id / task_id / room_id** |
| 点通知回来还是旧内容 | ⚠️ resume / cache / race 问题 | re-fetch + cache bust + request generation |
| 想靠 WebSocket 保后台 | ❌ 方向不对 | **WebSocket 前台同步，Web Push 后台叫人，HTTP 恢复真相** |
| 用户正在看当前聊天，还照样弹通知 | ⚠️ 体验问题 | 用短时 mobile/PWA visibility heartbeat 做前台抑制 |
| Subscription 已失效还一直发 | ❌ 会堆垃圾 | 404 / 410 直接清理 |
| 5xx / timeout 无限 retry | ❌ 可能重复通知 | 只做**有上限**的 transient retry |
| Push target 可以随便跳 URL | ❌ 安全问题 | 强制 **same-origin + in-scope** |
| 把 Push 成败当业务成败 | ❌ 分层错误 | Push 只是运输层，**服务器业务状态才是真相** |

其中两个尤其值得单独记住：

> **① 通知能响，不代表产品已经做完。点通知后能不能回到正确现场，才是完整闭环。**

> **② iOS 杀后台不是靠“保活”解决，而是靠 Web Push + durable target URL + cold resume + re-fetch。**

详细的真实踩坑记录见 [FIELD-NOTES.md](FIELD-NOTES.md)。

安全边界见 [SECURITY.md](SECURITY.md)。

后台 / 冷恢复专项见 [BACKGROUND-RESUME.md](BACKGROUND-RESUME.md)。

---

# 这套东西不是纸上架构

这套思路来自两个不同的自建 Web App。

## 第一套：AI Chat

实际使用：

- Python / FastAPI
- pywebpush
- iPhone Home Screen PWA
- WebSocket 实时同步

真机跑通过：

~~~text
sent: 1
failed: 0
total: 1
~~~

后来又继续处理了：

- Push 点入具体 conversation；
- Push 点入具体 chatroom；
- 前台抑制；
- iOS PWA 冷恢复；
- 缓存旧响应；
- 并发异步覆盖；
- WebSocket 断线重连。

---

## 第二套：协作 / 会议 Web App

后来把同一套架构迁到一个完全不同的 Node Web App。

额外补了：

- VAPID 私钥本机保护；
- Subscription 私有状态；
- 原子写入；
- 写后回读；
- same-origin subscribe；
- JSON-only 写入；
- localhost-only test send；
- 404 / 410 清理；
- 有限 retry；
- target URL scope 校验；
- resume generation；
- 丢弃旧 long-poll 返回。

这说明它不是某个聊天项目里的偶然 hack。

---

# 仓库内容

~~~text
.
├── README.md                  # 中文入口：先把事情讲清楚
├── README.en.md               # English version
├── ARCHITECTURE.md            # 完整架构
├── BACKGROUND-RESUME.md       # iOS 杀后台 / 冷恢复重点
├── FIELD-NOTES.md             # 两套真实项目踩坑记录
├── SECURITY.md                # 安全边界
├── IOS-CHECKLIST.md           # 真机验收 checklist
├── REFERENCES.md              # Apple / WebKit / MDN / 参考仓库
├── examples/
│   ├── manifest.webmanifest
│   ├── subscribe.js
│   ├── sw.js
│   ├── resume.js
│   └── server-contract.md
└── LICENSE
~~~

---

# 如果你明天就要接

最短顺序：

1. 把现有前端补成 HTTPS + standalone PWA；
2. Add to Home Screen 真机打开；
3. 加“开启通知”按钮；
4. 生成 VAPID key；
5. PushManager.subscribe()；
6. 后端保存 Subscription；
7. 先做 localhost/admin test push；
8. 真机锁屏确认系统通知；
9. 给通知加具体 target；
10. 做 navigate + focus / openWindow；
11. 页面回来后 re-fetch；
12. 加 stale request protection；
13. 再接真实业务事件；
14. 再做前台抑制、dead cleanup、retry；
15. iOS 18.4+ 再叠 Declarative Web Push。

---

# 一句话总结

> **这不是“让网页响一下”的教程。**
>
> **这是让一个已经保存到 iPhone 主屏幕的自建 Web App 拥有自己的系统通知，并在后台被挂起或回收后，点通知仍能按正确路径恢复到业务现场的一套参考架构。**

---

## 参考

Apple / WebKit / MDN / RFC 和公开参考仓库都整理在：

[REFERENCES.md](REFERENCES.md)

## License

MIT
