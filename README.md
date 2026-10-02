# 一天 · One Day

[打开网站](https://oneday-bice.vercel.app/) · [提出想法](https://github.com/echoLifeOvO/oneday/issues)

看看不同地方的人，花了多少钱，怎样度过一天。

一天是一个免费的匿名生活分享网站。转动地球、搜索城镇，或点开一条流动的日记，看看另一个人的一天；也可以留下自己的日常、花费和感受。

## 功能

- 三维地球与卫星影像，支持鼠标、触控板和手机触屏；有日记的地方持续点亮。
- 从地区列表阅读日记，按日期分页；弹幕每 5 秒读取最近 12 条记录。
- 无账户、无私聊；每次发布使用随机昵称，公开留言。
- 正文最多 200 字，必填金额、币种与 0–100 分的主观感受，日期自动取提交当天。
- 中英文界面、手机布局、未发布内容自动续写。
- 日记和留言在保存前通过兼容 OpenAI 格式的内容审核服务。

日记地点由用户自行选择，不读取 GPS。部署在 Vercel 时，仅地球初始朝向参考请求 IP 的粗略区域。项目中的示例均明确标注为虚构内容。

## 开发

TypeScript、Next.js App Router、React、MapLibre GL JS 与 PostgreSQL。使用 Node.js 22.18 或更新版本。

```sh
npm ci
cp .env.example .env.local
npm run dev
# http://127.0.0.1:3107
```

未配置数据库的本地开发提供有标记的预览数据；生产环境需要真实数据库。发布功能还需配置审核服务。填写服务端变量时，参照 [数据库与审核说明](db/README.md)。

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

自建 PostgreSQL 的 Docker、TLS 与角色配置见 [部署模板](deploy/postgres/README.md)。当前共享测试库中的 `is_demo` 数据均有示例标记，种子脚本不会自动运行。

## 参与

有想法可以直接 [提 Issue](https://github.com/echoLifeOvO/oneday/issues)，也欢迎 Fork 后提交 PR。由 [echoLifeOvO](https://github.com/echoLifeOvO) 维护并更新主分支；公开访问不授予写入或合并权限。详见 [参与说明](CONTRIBUTING.md)。

联系作者：[X](https://x.com/echolifeovo) · [Email](mailto:echoLifeOvO@gmail.com)

## 素材与来源

地图影像、行政边界与角色素材分别适用其来源和许可说明，不能从代码公开推定所有素材都能自由商用。页面中的 [特别声明](app/sources/page.tsx)、[地区来源](public/data/sources.json)、[远景影像许可](public/imagery/2024/README.md) 保留了具体出处。

## In English

One Day is a free, anonymous collection of everyday lives. Explore a globe to see where people live, what a day costs them, and how it feels. Share up to 200 characters with a location, spending and a personal score. Ideas and pull requests are welcome; the maintainer reviews and merges contributions.
