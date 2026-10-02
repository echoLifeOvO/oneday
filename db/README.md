# 数据库与 API

Next.js Route Handlers 负责后端，`pg` 负责参数化 SQL 和连接池。浏览器不连接 PostgreSQL。测试服务器数据库已建好并完成 001–004 迁移；构建和启动不会自动建表。

## 连接已有数据库

1. 将 `.env.example` 中的 `DATABASE_URL` 配置到本地 `.env.local` 或 Vercel 服务端环境变量；不要带 `NEXT_PUBLIC_` 前缀。地址形式为 `postgresql://USER:PASSWORD@HOST:5432/DB`。远程连接按实际证书配置 TLS；私有 CA 推荐用 `PGSSL_CA_BASE64` 保存 PEM 证书的 base64（适合 Vercel 环境变量），也可用 `PGSSLROOTCERT` 指向证书文件，代码不关闭证书验证。配置 CA 时连接串不能再带 `sslmode/sslcert/sslkey/sslrootcert`，避免驱动覆盖 CA 配置。
2. 配置服务端 `MODERATION_API_KEY`、`MODERATION_BASE_URL=https://api.deepseek.com`、`MODERATION_MODEL=deepseek-flash`；配置至少 32 位随机字符串 `ANONYMOUS_COOKIE_SECRET`，同一部署各实例共用这个签名密钥。真实 Key 仅保存在被 Git 忽略的本机 `.env.local`，不会随代码上传到 Vercel；部署时需单独配置环境变量。
3. 在已创建的空数据库上运行 `npm run db:migrate`（001–004）。迁移记录校验和，并在事务内执行；重复运行已应用的相同版本不做修改。
4. 启动或重新部署应用。首次发帖时写入地点元数据；不需要给日记表塞演示记录。

连接池每实例最多 3 条连接，连接等待 5 秒，单条 SQL 超时 8 秒。实例数量增加时需要结合实际 PG 连接数设置池化/代理；并非所有 Vercel 实例合计只有 3 条连接。

## 表与语义

- `places`：稳定地点 ID、经过结构校验的地点元数据（名称、坐标、范围、来源）。已有示范地点采用服务端目录；新地点接受符合 OSM ID 格式及坐标边界约束的 Photon 选择结果，不允许后来的帖子覆盖已有地点。当前尚未到上游逐条复核客户端传入的 OSM 元数据。
- `diaries`：地点外键、匿名随机昵称、当天日期/声明时区、正文、定点金额/币种、0–100 分、服务端发布时间、隐藏时间。UUID 同时作为重试键，请求摘要防止同键不同正文意外覆盖。
- `comments`：日记外键、随机昵称、正文、发布时间、隐藏时间。无账户关联，无“作者回复”身份；支持分页读取及匿名发布。

`created_at` 为真实发布时间，推荐和分页只依它排序；`day_date` 是服务器根据本次声明时区生成的当天日期，不接受客户端自选日期。金额以精确 `numeric` 保存并用 CHECK 限制 0–100,000,000、最多两位小数；前端状态及 JSON 为 number，空输入为 null。不同币种不直接合并金额。

## 接口

| 接口 | 内容 |
| --- | --- |
| `GET /api/places/recent?limit=5&cursor=…` | 最近发布过日记的不同地点，按 `max(created_at)` 倒序；相同时间按地点 ID 稳定排序；默认 5，最大 10。返回 `mode`、`places: [{place,count,latestPublishedAt}]` 和 `nextCursor`。 |
| `GET /api/discovery?limit=100&cursor=…` | 地点统计分页，默认 100、最多 200，返回 nextCursor；SQL 先取一页地点再聚合，不包含正文。 |
| `GET /api/stream?limit=12` | 最新 12 条弹幕元数据，最多 20；SQL LIMIT，不包含正文或评论。 |
| `GET /api/diaries/:id` | 点击弹幕后读取一篇正文及评论数量。 |
| `GET /api/diaries?placeId=…&limit=30&cursor=…` | 地点日记分页；最多 50 篇，返回 `diaries` 和 `nextCursor`。游标保留 PG 时间的微秒精度，时间相同时用 UUID 排序；不打包评论正文。 |
| `GET /api/diaries/:id/comments?limit=20&cursor=…` | 评论分页，默认 20、最多 50。 |
| `POST /api/diaries/:id/comments` | `body,locale,requestId`，200 字；首次 201、同内容重试 200、同键不同内容 409。 |
| `POST /api/diaries` | `place,body,cost,currency,score,timeZone,locale,requestId`。首次写入 201，同内容重试 200；同键不同内容 409。日期、昵称、发布时间由服务器生成。 |

请求体上限 8 KiB，包括没有 Content-Length 的流式请求，在解析 JSON 前检查实际字节数。非法字段/游标/分页大小返回 400，数据库未配置或不可用返回 503，限流返回 429 和 Retry-After。写入失败不转成本机保存，数据库错误和连接字符串不返回给浏览器。

## 预览与上线边界

没有 `DATABASE_URL` 的本地开发保留旧本机预览：旧日记留在 localStorage，推荐接口只用服务器上的虚构示例，不自动上传旧记录。新发布必须先由服务端审核，通过后返回 `preview: true` 才保存到本机；本机预览也需要审核配置。生产缺数据库则报 503；可显式配置 `ONE_DAY_PREVIEW=1` 运行演示。设置真实连接后不混入演示或旧本机记录，数据库故障也不退回演示。

日记、公开评论、分页和进程内限流已完成。举报/管理隐藏/删除界面尚未实现。地图统计目前按地点 ID 分页，客户端依次合并轻量统计，未来可进一步按视野加载。

## 验证

`npm test` 运行契约、校验及已有前端计算测试。`PG_TEST_BIN=/path/to/postgres/bin npm run test:db` 会创建一个新的临时本机集群，忽略现有 `DATABASE_URL`，测试后关闭并清理；不会使用云服务器。运行过 `npm run build` 后，可加 `TEST_HTTP=1` 验证真正的 Next.js HTTP 接口；默认端口 3108，可用 `TEST_HTTP_PORT` 调整。

本轮用 PostgreSQL 17.11 实测。实现参考（2026-10-03 访问）：[node-postgres 参数化查询](https://node-postgres.com/features/queries)、[连接池](https://node-postgres.com/apis/pool)、[PostgreSQL 索引](https://www.postgresql.org/docs/current/indexes.html)，以及当前安装 Next.js 的 Route Handlers 文档。

## 2026-10-03：三层约束、轮询与进程限流

正文和评论最多 200 个 Unicode 码点；输入时截住新内容，后端校验，PG char_length 约束拒绝直接 SQL 超长写入。旧本机长日记仍可读取，旧长编辑缓冲先备份到 one-day-composer-before-200-limit。迁移新增 002，保留 001 的校验和；已有数据不合格时迁移失败并回滚，不截断用户内容。

地点不用枚举限制名称。ID 最多 100，地点名/英文名各 200，行政区说明/别名各 500，国家名 100，来源 ID 200；整份紧凑 JSON 和 PG JSONB 文本分别最多 4096 bytes。PG 格式化空格及数字可能让临界值更早被拒绝。结构、坐标、范围和键名也有约束。金额输入为 type=number/valueAsNumber，状态 number 或 null；API 拒绝字符串金额；PG numeric + CHECK 拒绝负数、非有限值、超过一亿元及超过两位小数，不采用会先静默四舍五入的固定精度类型。金额增减按钮保持隐藏。

浏览器每 5 秒取最近 12 条轻量弹幕，两行各 6 条。没有变化时不更新；新批次在各行动画循环边界替换，不重启动画。隐藏页签、阅读/写作时暂停，恢复时立即请求。慢请求不重叠；429 遵守 Retry-After，其他失败退避至最多 60 秒，保留原批次。地图统计、正文不随弹幕每 5 秒拉取。

[限流实现](../lib/server/rate-limit.ts)只维护四个固定 token bucket，全访客共享，没有 IP/User 键或增长队列；同时限制在途请求。额度检查在正文解析和数据库访问之前。

| 类别 | 每秒补充 | 突发额度 | 在途上限 |
| --- | --- | --- | --- |
| 搜索 | 1 | 8 | 3 |
| 发日记 | 1 | 10 | 3 |
| 发评论 | 2 | 20 | 4 |
| 查询 | 30 | 120 | 12 |

这些值是初始工程配置，不是压测得出的容量结论。每个 Vercel 进程独立计算，冷启动重置，扩容后各实例额度相加。用户明确要求进程内限流，没有引入 Redis 或跨实例计数。

Vercel 的[自动 DDoS 防护](https://vercel.com/docs/vercel-firewall/ddos-mitigation)与[自定义业务限流](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)不同；没有声称平台已自动设置本应用的业务频率阈值。核验日期 2026-10-03。

## 2026-10-03：匿名浏览器限流与发布审核

用户询问设备指纹及脚本攻击，并要求使用 OpenAI 兼容格式调用 DeepSeek Flash，关闭 thinking，JSON 输出内容判断，拒绝时显示“未审核通过，发布失败”。当前实现增加签名的匿名浏览器 Cookie，并未采集硬件指纹或部署人机验证。

Cookie 为 128 位随机值 + 过期时间 + HMAC-SHA256 签名；HttpOnly、SameSite=Lax、30 天有效期，HTTPS/Vercel 使用 Secure 和 __Host- 前缀。它不写入日记或评论表，不用于作者识别。生产缺少签名密钥会拒绝请求，本地开发可用临时密钥。各实例共享签名密钥不等于共享计数。

原四类全局额度保留，并叠加每个匿名浏览器的额度：

| 类别 | 补充速度 | 突发额度 | 在途上限 |
| --- | --- | --- | --- |
| 搜索 | 每 3 秒 1 次 | 5 | 2 |
| 发日记 | 每分钟 1 次 | 2 | 1 |
| 发评论 | 每 20 秒 1 次 | 3 | 1 |
| 查询 | 每秒 2 次 | 30 | 6 |

计数只在进程内保存，最多 10,000 个浏览器，闲置超过一小时回收；容量满时拒绝新标识，不淘汰尚有效的额度。签名能阻止伪造既有标识，但清 Cookie、换浏览器或脚本重新领 Cookie 仍可绕过单浏览器额度。**不是唯一设备身份，也不是反机器人认证。** 更强的脚本防护可以加入 Turnstile；本轮没有该服务的 site key/secret，未接入、不宣称已启用。

发布路径：全局与浏览器限流 → 8 KiB/字段校验 → 已成功请求的幂等查询 → 审核调用额度 → 模型判断 → 严格校验 JSON → 写入 PG。评论先确认目标日记存在，再同样审核。模型调用期间不持有写事务；拒绝、超时、错误都不写日记/评论/新地点，也不存拒绝原文。

[审核实现与 system prompt](../lib/server/moderation.ts)使用 `/chat/completions`，`response_format: {type: "json_object"}`、`thinking: {type: "disabled"}`、非流式、最多 128 输出 tokens、12 秒超时，不自动重试。输入只发送正文及可见地点名称信息；不发送 Cookie、IP、金额、评分。拒绝类为 nonsense、abuse、sexual、gore、violence、politics；普通无聊、短小、低落的生活记录及国庆假期等非政治生活表述允许通过。

输出只接受 `{"approved":true,"category":"allowed"}` 或 `{"approved":false,"category":"规定的拒绝类别"}`，不接受字符串布尔值、缺失字段、额外字段、矛盾结论、截断输出、空内容或 refusal；JSON mode 本身不保证字段语义，因此必须二次校验。拒绝返回 422/MODERATION_REJECTED；模型错误返回 503/MODERATION_UNAVAILABLE，并保留用户输入供重试，绝不默认通过。

审核另有进程共享预算：每 5 秒补充一次（12 次/分钟）、突发 3、并发 2。相同材料按模型/策略/输入哈希合并在途请求，最多缓存 256 个有效判断 10 分钟；失败不缓存，不保存原文。成功请求重试从 PG 返回，不再调用模型。上述模型预算仍不是跨实例账单硬上限。

迁移 003 在日记/评论增加审核时间、模型及策略版本，已存在记录保留 NULL，不假称经过新审核。公开 API 不接受客户端“已审核”标志。没有重审旧记录、管理员复核或申诉界面。AI 可能误判、漏判，提示词对注入的约束不是可证明的安全边界。

验证：42 项自动测试；真实 PG/HTTP 验证审核通过才入库、拒绝零写入、成功重试不重复调用模型、审核字段及签名 Cookie。实际同 Cookie 连续三次无效发帖得到 400、400、429/Retry-After=60。真实 DeepSeek 用 10 个自拟测试样本（不含用户私人日记）验证日常/英文无聊日记/国庆假期/短评论通过，乱码/注入/色情/血腥/暴力/政治拒绝；耗时约 0.3–0.8 秒，首批响应 reasoning_content 为空。样本验证不能等同于总体准确率。浏览器在隔离临时 PG 和测试审核服务上验证拒绝提示、保留输入、修改后成功发布。生产构建通过。本机 3107 预览接口也用真实模型验证正常日记返回 preview:true、乱码返回 422；只调用审核，没有向用户 localStorage 写测试日记。

来源（2026-10-03）：[OpenAI JSON mode 与 Schema 校验](https://developers.openai.com/api/docs/guides/structured-outputs)、[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、[DeepSeek thinking 开关](https://api-docs.deepseek.com/guides/thinking_mode/)、[DeepSeek Chat Completions 参数](https://api-docs.deepseek.com/api/create-chat-completion/)、[MDN：浏览器指纹与隐私](https://developer.mozilla.org/en-US/docs/Web/Privacy)、[Turnstile 服务端验证](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)。

测试服务器容器、权限与证书配置见 [部署说明](../deploy/postgres/README.md)。应用连接角色与执行迁移的 owner 角色分离，不要将 owner 密码配置到 Vercel。

2026-10-03 后续按用户要求新增 004 的 `diaries.is_demo` 字段，并显式写入 10 条手机弹幕测试记录。接口只从数据库返回此标记，普通发布不接受客户端指定。测试示例无 AI 审核字段，不伪称模型通过。种子命令见项目 README；以后隐藏测试样例可由 owner 执行 `UPDATE diaries SET hidden_at=now() WHERE is_demo AND hidden_at IS NULL`，本轮未隐藏。
