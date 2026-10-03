# 开发与部署

项目的动机和使用方式见[主 README](../../README.md)。

## 当前部署（2026-10-03）

`oneday.love` 和 `www.oneday.love` 当前使用独立服务器上的 **Docker + Caddy**。Next.js 同时运行网页和 API，PostgreSQL 使用独立容器。运行目录为 `/opt/one-day-web`，数据库目录为 `/opt/one-day`。

- [网站部署、更新与回滚](../../deploy/web/README.md)
- [PostgreSQL、TLS 与运行角色](../../deploy/postgres/README.md)
- [数据库迁移与 API](../../db/README.md)
- [上线变更与验证记录](releases.md)

Vercel 保留备用部署；GitHub `main` 推送会触发它的构建。**当前 Docker 主站没有自动 CI/CD，推送 GitHub 不会更新 Docker 主站。** 已上线的应用修复本次补入 Git，后续按提交版本构建镜像。

## 本地开发

TypeScript、Next.js App Router、React、MapLibre GL JS 与 PostgreSQL。使用 Node.js 22.18 或更新版本。

```sh
npm ci
cp .env.example .env.local
npm run dev
# http://127.0.0.1:3107
```

未配置数据库的本地开发提供有标记的预览数据；生产环境需要真实数据库。发布功能还需配置审核服务。填写服务端变量时，参照 [数据库与审核说明](../../db/README.md)。

```sh
npm test
npm run build
npm run typecheck

# standalone 构建需同时携带静态资源
cp -R public .next/standalone/
cp -R .next/static .next/standalone/.next/
HOSTNAME=127.0.0.1 PORT=3107 node --env-file=.env.local .next/standalone/server.js

# 手机与电脑连接同一局域网，使用生产构建检查手感
HOSTNAME=0.0.0.0 PORT=3107 node --env-file=.env.local .next/standalone/server.js
# http://电脑的局域网IP:3107
```

局域网开发热更新使用 `npm run dev:lan`，并在 `DEV_ALLOWED_ORIGINS` 填入电脑的局域网 IP。生产预览修改代码后需要重新构建、启动。

MapLibre Worker 在 `predev` / `prebuild` 时从已安装依赖生成，无需提交 `public/vendor/maplibre/`。地图边界、远景瓦片与处理脚本随项目提供；具体街区影像按需加载。

## 服务端环境变量

Docker 在独立的 `runtime.env` 中配置以下变量；Vercel 在项目 **Production** 环境中配置。模板见 [`.env.example`](../../.env.example)。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 应用角色连接串，包含主机、端口、库名、用户名和密码 |
| `PGSSL_CA_BASE64` | 自建 PostgreSQL 的 CA 公钥证书，base64 PEM，启用服务端证书校验 |
| `MODERATION_API_KEY` | 审核服务 API Key |
| `MODERATION_BASE_URL` | 兼容 OpenAI 的审核服务地址 |
| `MODERATION_MODEL` | 审核模型名称 |
| `ANONYMOUS_COOKIE_SECRET` | 至少 32 位的随机签名密钥，各实例保持一致 |

这些变量均为服务端配置，不能使用 `NEXT_PUBLIC_` 前缀，也不能作为 Docker 构建参数。数据库迁移由维护者使用 owner 角色显式执行，不在构建中自动执行；运行网站使用权限有限的 app 角色。外部 PR 的 Preview 不使用生产数据库和审核密钥。生产保留 `ONE_DAY_PREVIEW=0`。

自建 PostgreSQL 的 Docker、TLS 与角色配置见 [部署模板](../../deploy/postgres/README.md)。2026-10-03 上线前已删除测试数据；之后的用户记录是正式内容。启动、构建、迁移均不会自动运行种子脚本。

## 自定义域名

DNS 由 Dynadot 管理，当前使用「Dynadot DNS」，TTL 为 5 分钟：

| 类型 | 主机记录 | 值 |
| --- | --- | --- |
| A | `@` | Docker 网站服务器的公网 IPv4 |
| CNAME | `www` | `oneday.love` |

DNS 填 IP 或域名，不填 `https://` 地址，不使用 URL 转发。Caddy 负责当前主站的证书申请与续期，80/443 需要能从公网访问，证书卷必须保留。

2026-10-03 更正：早期文档记录的 Vercel A `216.198.79.1` 和 www CNAME `30c14ee2de4d0903.vercel-dns-017.com` 属于旧部署方案，不是当前应使用的记录。当日 15:19 HKT 复查中，服务器直连 Vercel 备用网址仍失败，自定义域名临时指定 Vercel IP 后 HTTP 可用、HTTPS 握手失败；未切回，未认定具体 TLS 根因。当前 DNS 指向自己的服务器时，Vercel 的 Invalid Configuration 提示符合现状。

## Vercel 备用部署

导入 GitHub 仓库，选择 Next.js、根目录 `./`、构建命令 `npm run build`，生产分支为 `main`。备用网址为 `oneday-bice.vercel.app`，可能受访问网络影响，且其构建版本应单独核对。

未来若迁回 Vercel，需要先将最新提交部署成功，验证只读 API、数据库连接与自定义域名 HTTPS，再变更正式 DNS；所需记录以项目控制台当时的值为准。不能把代理网络下的一次访问成功当作国内直连验证。参考 [Vercel 域名排查](https://vercel.com/docs/domains/troubleshooting)。


## 搜索地点的地图高亮（2026-10-03）

预置地点与搜索地点都使用地图填色，不添加常驻文字 Marker。动态地点按坐标和范围匹配区域，远景显示周边区域；近景优先使用已收录县市轮廓。缺少细边界时显示所在大区，不能把这个区域理解为每个县市都有日记。

- `lib/discovery-boundaries.ts`：国家代码映射、轮廓匹配、共享区域的地点集合、按需加载与有限缓存。
- `public/data/discovery-v1/`：按国家和所属区域拆分的静态边界；浏览器只加载当前有日记或正在查看的地点所需文件。
- `scripts/prepare-discovery-boundaries.py`：从固定版本的 Natural Earth 5.1.2 与已有 geoBoundaries 缓存重建。原始数据留在 `.cache`；生成目录可公开再分发，许可和来源见特别声明。中国区概览约 228 KB，gzip 约 78 KB；县市细节再按所属区域请求。
- 全球收录 240 个国家/地区的大区轮廓；CN/JP/FR/US 同时使用已有县市级数据。尚未收录全球所有城镇细边界，不宣称全球县市精确覆盖。
- 相同高亮区域保留所有地点 ID，不能只选其中一个。弹窗打开时暂缓更新地图数据，关闭后再应用。

定向回归：`node --test scripts/test-discovery-boundaries.mjs scripts/test-discovery.mjs scripts/test-earth-gestures.mjs`。覆盖真实 Photon 北京标识、直辖市与中心城区区分、共享区域多地点、孔洞、多边形、清除数据后的高亮移除，以及现有手势。
