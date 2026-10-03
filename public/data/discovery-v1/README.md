# 搜索地点的区域轮廓

这些静态 JSON 用于让搜索产生的地点沿真实地理轮廓发光。它们随源码发布，浏览器按需加载，不是数据库内容，也不包含日记、昵称或用户位置记录。

- `countries.json`：已收录的 240 个国家/地区代码。
- `<国家代码>.json`：大区名称、范围、轮廓、远景扩展轮廓和细节文件名。
- `<国家代码>-<区域ID>.json`：CN、JP、FR、US 的下级轮廓。
- 共 391 个 JSON，约 39.4 MiB；单个最大约 1.43 MiB，不能理解为每次访问都会下载全部文件。

匹配与缓存实现见 [`lib/discovery-boundaries.ts`](../../../lib/discovery-boundaries.ts)。县市细轮廓没有全球覆盖；缺失时使用所在大区，远景光晕只是发现入口，不表示区域内每个地方都有日记。

## 来源和许可

- 全球大区来自 [Natural Earth 5.1.2](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2)，具体文件为 `geojson/ne_10m_admin_1_states_provinces.geojson`；[Public Domain](https://www.naturalearthdata.com/about/terms-of-use/)。
- CN/JP/FR/US 使用 geoBoundaries 固定版本 `9469f09` 的大区和下级数据覆盖。各数据作者、许可和原始下载地址见 [`sources.json`](../sources.json) 与 [`glow-sources.json`](../glow-sources.json)。它们的许可不同，不能把本目录整体当作 Natural Earth 的 Public Domain。
- 生成时对轮廓做简化、坐标取整和远景缓冲；网页署名见 [`app/sources/page.tsx`](../../../app/sources/page.tsx)。

## 重建

正常构建直接使用本目录，无需下载上游或安装 Python。需要重建时，在仓库根目录执行；本次生成使用 Shapely 2.0.7：

```sh
python3 -m venv .cache/geo-env
.cache/geo-env/bin/pip install shapely==2.0.7
.cache/geo-env/bin/python scripts/prepare-boundaries.py
.cache/geo-env/bin/python scripts/prepare-glow-regions.py
.cache/geo-env/bin/python scripts/prepare-discovery-boundaries.py
```

前两个脚本会同时重建已有预置地点与远景数据，请检查其 diff；上游原始文件缓存于 `.cache/`，不会提交。细节脚本下载 Natural Earth 固定版本，并复用前两个脚本准备的 geoBoundaries 缓存。修改生成逻辑后运行 `node --test scripts/test-discovery-boundaries.mjs`，并在地球仪中实际点击验证；球面整屏要素查询为空不能单独证明该区域没有绘制。
