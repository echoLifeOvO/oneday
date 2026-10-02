# 开发与部署

项目的动机和使用方式见[主 README](../../README.md)。

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
npm start

# 手机与电脑连接同一局域网，使用生产构建检查手感
npm run start:lan
# http://电脑的局域网IP:3107
```

局域网开发热更新使用 `npm run dev:lan`，并在 `DEV_ALLOWED_ORIGINS` 填入电脑的局域网 IP。生产预览修改代码后需要重新构建、启动。

MapLibre Worker 在 `predev` / `prebuild` 时从已安装依赖生成，无需提交 `public/vendor/maplibre/`。地图边界、远景瓦片与处理脚本随项目提供；具体街区影像按需加载。

## 部署到 Vercel

导入此 GitHub 仓库，选择 Next.js、根目录 `./`，构建命令使用 `npm run build`。`main` 为生产分支，推送或合并后由 Vercel 自动构建部署。

在项目 **Production** 环境配置以下变量：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 应用角色连接串，包含主机、端口、库名、用户名和密码 |
| `PGSSL_CA_BASE64` | 自建 PostgreSQL 的 CA 公钥证书，base64 PEM，启用服务端证书校验 |
| `MODERATION_API_KEY` | 审核服务 API Key |
| `MODERATION_BASE_URL` | 兼容 OpenAI 的审核服务地址 |
| `MODERATION_MODEL` | 审核模型名称 |
| `ANONYMOUS_COOKIE_SECRET` | 至少 32 位的随机签名密钥，各实例保持一致 |

这些变量均为服务端配置，不能使用 `NEXT_PUBLIC_` 前缀。数据库迁移由维护者显式执行，不在构建中自动执行；Vercel 使用权限有限的应用角色。生产凭据仅配置到 Production，外部 PR 的 Preview 不使用生产数据库和审核密钥。

自建 PostgreSQL 的 Docker、TLS 与角色配置见 [部署模板](../../deploy/postgres/README.md)。当前共享测试库中的 `is_demo` 数据均有示例标记，种子脚本不会自动运行。

## 自定义域名

正式域名为 `oneday.love`，Vercel 提供的 `oneday-bice.vercel.app` 保留为备用地址。先在项目 Domains 中将域名连接到 Production，再在域名商处设置 DNS。

2026-10-03 项目控制台给出的记录如下；后续应以控制台当时的值为准：

| 类型 | 主机记录 | 值 |
| --- | --- | --- |
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `30c14ee2de4d0903.vercel-dns-017.com` |

TTL 可保持默认。DNS 记录填写域名或 IP，不填写带 `https://` 的网址。域名商保存后，回 Vercel 检查配置和证书状态；添加到项目本身不代表 DNS 已经生效。步骤见 [Vercel 官方文档](https://vercel.com/docs/domains/working-with-domains/add-a-domain)。
