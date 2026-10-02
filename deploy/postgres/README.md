# PostgreSQL 部署

本目录是可公开的部署模板，不包含服务器地址、密码或私钥。当前测试部署使用独立的 PostgreSQL 17 Docker 容器；网站运行在 Vercel，浏览器只访问网站 API。

## 文件准备

将本目录复制到服务器的新目录（本次使用 `/opt/one-day`），根目录权限 0700。所需目录：

- `data/pgdata/`：数据库数据，UID/GID 999:999，0700。
- `secrets/{admin_password,owner_password,app_password}`：三个独立随机密码；至少 36 个随机字节，文件 0400、999:999。不要放入 Compose 环境变量、源码或命令行参数。
- `tls/server.crt`、`tls/server.key`：PEM 服务端证书和私钥；私钥 0400、999:999。证书 SAN 必须包含实际连接域名或 IP。
- 私有 CA 的签名私钥仅留服务器私有目录，不挂入数据库容器。CA 公钥证书交给应用校验。

本次部署使用私有 CA 签发证书；服务端证书有效期 825 天，需要到期前更新证书并 reload PostgreSQL。目录与密码必须在启动前准备，因为容器以 postgres 用户运行且删除了 Linux capabilities。

```sh
docker compose up -d
# 检查 healthy 状态与实际版本
docker compose ps
docker compose exec -u postgres postgres psql -U postgres -d postgres -c 'SELECT version();'
```

Compose 默认映射 TCP 5433。云安全组也需允许应用到该端口；`pg_hba.conf` 拒绝所有明文远程连接，只允许指定数据库的 owner/app 角色以 TLS + SCRAM 登录，远程 postgres 超级用户不开放。容器限制 512 MiB 内存和 1 CPU，数据保存在绑定目录，重建容器不会删除数据。

## 建表与运行角色

初始化脚本只在空数据目录执行，创建 `one_day` 数据库、`one_day_owner` 与 `one_day_app` 两个角色。用 owner 连接执行：

```sh
npm run db:migrate
```

将 owner 的 `DATABASE_URL` 与 CA 放到该迁移进程的环境中，不要覆盖运行应用的凭据。迁移之后在服务器本地执行：

```sh
docker compose exec -u postgres postgres psql -U postgres -d one_day \
  -c 'GRANT UPDATE (id) ON diaries TO one_day_app;'
```

应用默认只有表的 SELECT、INSERT；额外的单列 UPDATE 权限供 PostgreSQL `SELECT ... FOR SHARE` 使用，以保证评论检查父日记与插入的事务语义。应用代码没有修改日记 ID 的接口。应用角色没有 DDL、DELETE、全表 UPDATE 或超级用户权限。

## Vercel 服务端环境变量

- `DATABASE_URL`：app 角色的连接串，形如 `postgresql://USER:PASSWORD@HOST:5433/one_day`。
- `PGSSL_CA_BASE64`：CA PEM 文件的 base64 单行字符串，启用 `rejectUnauthorized: true`。连接串不再附加 SSL 查询参数。
- `MODERATION_API_KEY`、`MODERATION_BASE_URL`、`MODERATION_MODEL`：服务端审核服务。
- `ANONYMOUS_COOKIE_SECRET`：随机签名密钥，各实例相同。

这些变量都不能带 `NEXT_PUBLIC_`。owner/admin 密码及 CA 私钥不交给 Vercel。连接池每实例最多 3 条，服务端总连接上限 40；随实际实例数量评估连接代理。

首次部署验证了公网 TLS 1.3、证书校验、拒绝明文、迁移和 app 角色事务内日记/评论读写，验证写入全部 ROLLBACK。首次部署没有向共享库导入示例。之后用户明确要求手机测试，已执行迁移 004 并显式添加 10 条带 is_demo 标记的虚构数据。服务器与环境变量的实际值只保存在本机忽略的 `.deployment/` 和 `.env.local`。
