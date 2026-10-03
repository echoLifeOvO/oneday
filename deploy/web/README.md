# Docker 部署

构建使用项目根目录的 Dockerfile，运行 Next.js standalone 完整应用（包含 API），不是静态导出。数据库继续使用现有 PostgreSQL。反向代理 Caddy 自动申请和续期 HTTPS 证书。

当前站点是 `oneday.love` / `www.oneday.love`，运行目录 `/opt/one-day-web`，Compose 项目名 `one-day-web`。数据库另在 `/opt/one-day`，见 [PostgreSQL 部署](../postgres/README.md)。GitHub 推送只触发原 Vercel 备用部署，本方案目前由维护者手动发布。

## 首次准备

服务器需要 Docker Engine 与 Compose v2；应用在服务器上构建，镜像使用 Node.js 24。准备一个干净源码目录，例如 `/opt/one-day-web/source`：

```sh
git clone https://github.com/echoLifeOvO/oneday.git /opt/one-day-web/source
cd /opt/one-day-web/source
# 将占位符替换为已通过检查的完整提交 SHA
git checkout --detach <COMMIT_SHA>
ONE_DAY_RELEASE=$(git rev-parse --short=12 HEAD)
docker build -t "one-day-web:${ONE_DAY_RELEASE}" .
```

`.dockerignore` 只允许应用构建需要的文件，真实环境变量不能放入镜像或构建参数。Dockerfile 会自动生成 MapLibre Worker，并把 standalone、public、静态资源装入最终镜像。

只在首次安装时复制模板；已有部署更新时保留自己的配置：

```sh
install -m 0644 deploy/web/compose.yaml /opt/one-day-web/compose.yaml
install -m 0644 deploy/web/Caddyfile /opt/one-day-web/Caddyfile
install -m 0600 .env.example /opt/one-day-web/runtime.env
```

用编辑器填好 `runtime.env`：`DATABASE_URL` 必须使用 app 角色，配置 `PGSSL_CA_BASE64`、三个 `MODERATION_*` 变量和至少 32 位的 `ANONYMOUS_COOKIE_SECRET`，保持 `ONE_DAY_PREVIEW=0`。具体含义见 [环境变量表](../../docs/development/README.md#服务端环境变量)。该文件只能保存在私有部署目录；迁移使用单独的 owner 凭据，不能给网站使用。

```sh
cd /opt/one-day-web
printf 'ONE_DAY_IMAGE=one-day-web:%s\n' "$ONE_DAY_RELEASE" > .env
docker compose up -d --wait --wait-timeout 90
```

应用只绑定宿主机 `127.0.0.1:3107`，公网通过 Caddy 的 80/443 访问；云安全组需要放行 80/443。默认 Caddyfile 对应本项目域名，部署到其他域名时需先修改它。Caddy 的健康依赖只检查网站进程，数据库连通性还需单独验证 API。

## DNS 与证书

在 Dynadot 的 DNS 模式中将根域名 A 记录指向网站服务器公网 IPv4，www CNAME 指向 `oneday.love`，TTL 300 秒。不使用 URL 转发，也不再使用旧 Vercel IP。Caddy 自动申请和续期证书；保留 `caddy_data` / `caddy_config` 卷，不执行会删除这些卷的清理。

检查日志和真实 HTTPS；下面的 GET 只读，不会发帖或调用 AI 审核：

```sh
docker compose ps
docker compose logs --tail=50 caddy web
curl --fail --show-error --silent -o /dev/null -w '%{http_code}\n' https://oneday.love/
curl --fail --show-error --silent 'https://oneday.love/api/stream?limit=1'
curl --fail --show-error --silent 'https://oneday.love/api/places/recent?limit=1'
curl --fail --show-error --silent 'https://oneday.love/api/discovery?limit=1'
```

API 应返回真实数据库模式，不能通过开启演示模式掩盖连接故障。需要单独排除 DNS 时可临时使用 `curl --resolve oneday.love:443:<WEB_SERVER_IP> https://oneday.love/`；不要加 `-k`。本机存在代理/TUN 时需用独立网络复核，代理访问成功不代表普通用户能直连。

## 更新与回滚

在源码目录 `git fetch origin`，检出已验证提交，用提交 SHA 生成新镜像标签；复用首次准备中的构建命令。先完成所需迁移，再切换镜像，构建本身不会迁移数据库。运行目录保留已有 `runtime.env` 和证书卷：

```sh
cd /opt/one-day-web
cp .env .env.previous
printf 'ONE_DAY_IMAGE=one-day-web:%s\n' "$ONE_DAY_RELEASE" > .env
docker compose up -d --wait --wait-timeout 90 web
```

执行上述只读检查，核对 `docker compose images web` 中的版本，然后在浏览器验证地图、弹幕、列表、评论入口。更新会重建单个 web 容器，可能有短暂中断，当前不是零停机发布。

检查失败时保留旧镜像并回滚：

```sh
cd /opt/one-day-web
cp .env.previous .env
docker compose up -d --wait --wait-timeout 90 web
```

只回滚应用不会回滚数据库；有 schema 变更时先确认兼容性。不要删除数据库目录或证书卷。服务器管理入口、连接串、密码与密钥不写进公开仓库。

只有 Vercel 环境才注册 Fluid Compute 连接池清理。自部署反向代理必须覆盖 X-Forwarded-Proto，应用不可绕过代理暴露公网端口。设备签名、限流、内容审核继续生效。首次地球朝向目前仅支持 Vercel 地理请求头，自部署默认使用应用初始视角。

官方参考：[Next.js 自部署](https://nextjs.org/docs/app/guides/self-hosting)、[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)。公开版本记录见 [上线记录](../../docs/development/releases.md)；包含实际主机与私有细节的记录留在被忽略的 `.deployment/`。
