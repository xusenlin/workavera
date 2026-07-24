# Workavera Privacy Policy

_Last updated: 2026-07-24_

Workavera is a client app for **self-hosted Workavera servers**. You connect the
app to a server that **you or your organization operate**. The app developer does
not run a central backend and does not receive, store, or have access to your
account or content data.

## 1. Who controls your data

All account and content data (profile, projects, tasks, documents, calendar
events, reading items, chat history, contacts, notifications, API keys, and model
configurations) is stored on the **self-hosted server you choose**. The operator
of that server — you or your organization — is the data controller. This app is
only a client that talks to that server on your behalf.

## 2. Data the app stores on your device

To function, the app stores the following **locally on your device only**:

- **Authentication token** — kept in the iOS Keychain, scoped per server, used to
  keep you signed in. Removed when you sign out.
- **Preferences** — the server address, appearance theme, and your last-used login
  email, stored in the app's local settings (UserDefaults).
- **A local cache** — recently loaded API responses, stored in the app's Caches
  directory with file protection enabled, to speed up the interface and support
  limited offline viewing. Cleared by the system as needed or on reinstall.

None of this is transmitted to the app developer.

## 3. Network connections

The app connects **only to the Workavera server address you configure**. It sends
your requests to that server over HTTPS. Plain HTTP is refused unless you
explicitly enable it for a local-network address, and the app warns you about the
risk before doing so. The app contains **no analytics, no advertising, and no
third-party tracking SDKs**, and does not track you across apps or websites.

## 4. AI / chat features

When you use Chat or AI summaries, your messages and the relevant content are sent
to **your** server, which then calls the large-language-model provider you have
configured there. The app developer is not a party to those requests. Review your
server configuration and your chosen model provider's terms to understand how that
provider handles the data. Before a user sends data to a model for the first time,
the app displays that model's address and asks for permission. The permission is
stored locally for that user and model configuration.

## 5. Account management and deletion

The app does not offer account registration and does not automatically create
accounts. Accounts are provisioned and managed by the administrator of the
self-hosted Workavera server you choose.

The app developer cannot access or delete accounts or content on independently
operated servers. To request deletion of your account and associated data, contact
your Workavera server administrator. Deletion timing, backup retention, and any
data that must be retained are determined by that server's policy and applicable
law.

## 6. Children

Workavera is a productivity tool intended for general and business audiences and
is not directed at children under 13.

## 7. Changes to this policy

We may update this policy from time to time. Material changes will be reflected by
updating the "Last updated" date above.

## 8. Contact

For questions about this policy or the app, contact the developer at
**wumulaozu@gmail.com** or via the project page at
https://github.com/xusenlin/workavera.

---

# Workavera 隐私政策

_最后更新：2026-07-24_

Workavera 是**自托管 Workavera 服务器**的客户端 App。你将 App 连接到**由你本人或
你的组织运营**的服务器。App 开发者不运营任何中心化后端，也不会接收、存储或访问你的
账号与内容数据。

## 1. 谁掌控你的数据

所有账号与内容数据（资料、项目、任务、文档、日历事件、阅读条目、聊天记录、联系人、
通知、API 密钥、模型配置）都存储在**你所选择的自托管服务器**上。该服务器的运营者——
你本人或你的组织——是数据控制者。本 App 只是代表你与该服务器通信的客户端。

## 2. App 在你设备上保存的数据

为正常运行，App 仅在**你的设备本地**保存以下内容：

- **登录令牌** —— 存于 iOS Keychain，按服务器隔离，用于保持登录状态，退出登录时删除。
- **偏好设置** —— 服务器地址、外观主题、上次登录邮箱，存于 App 本地设置（UserDefaults）。
- **本地缓存** —— 最近加载的接口响应，存于 App 缓存目录并启用文件保护，用于加速界面与
  有限的离线查看；系统会按需清理，重装即清除。

以上均不会传输给 App 开发者。

## 3. 网络连接

App **仅连接你所配置的 Workavera 服务器地址**，通过 HTTPS 发送请求。除非你为局域网地址
显式开启，否则拒绝明文 HTTP，且开启前会提示风险。App **不含任何分析、广告或第三方追踪
SDK**，不会跨 App 或网站追踪你。

## 4. AI / 聊天功能

使用聊天或 AI 摘要时，你的消息与相关内容会发送到**你自己的**服务器，再由该服务器调用你
在其中配置的大语言模型服务商。App 开发者不参与这些请求。请查阅你的服务器配置及所选模型
服务商的条款，以了解其数据处理方式。用户首次向某个模型发送数据前，App 会显示该模型地址
并请求授权；授权记录按用户和模型配置保存在本机。

## 5. 账号管理与删除

App 不提供账号注册，也不会自动创建账号。账号由你所选择的自托管 Workavera 服务器管理员
创建和管理。

App 开发者无法访问或删除由他人独立运营的服务器上的账号或内容。如需删除账号及相关数据，
请联系你的 Workavera 服务器管理员。删除所需时间、备份保留期限及依法必须保留的数据，由
该服务器的政策和适用法律决定。

## 6. 儿童

Workavera 是面向普通及商业用户的效率工具，不面向 13 岁以下儿童。

## 7. 政策变更

我们可能不时更新本政策。重大变更将通过更新上方"最后更新"日期体现。

## 8. 联系方式

有关本政策或 App 的问题，请联系开发者 **wumulaozu@gmail.com**，或访问项目页
https://github.com/xusenlin/workavera 。
