# 奶龙评分图集

- 文件：`nailong-moods.png`，1536×1024 RGBA，3 列 × 2 行，每格 512×512；抹泪、失落、平静、微笑、开心、捧腹笑。
- 2026-10-03 使用 Codex imagegen，参考第七印象[官方角色页面](https://www.nailoong.com/ipStar/Nailong/)及[形象图](https://www.nailoong.com/_ipx/q_85/img/ipStar/image_nailoong.png)。参考图仅保存在忽略的 `.cache/nailong-reference/`。
- 生成原件：`/Users/zeyuan/.codex/generated_images/01a0fd20-5d26-7f80-a731-5d36d7e891a1/exec-95ef41c4-f750-481e-a34c-bb0d2e40ed0a.png`，逐字节复制到项目，无依赖用户目录运行的引用。
- 制作约束：统一模型和尺度、对齐脚底、透明背景、六种表情，保留黄皮肤、绿眼睛、奶油色腹部与棕色爪趾。前一版未经参考的 chibi 形象未采用。
- 角色名称和形象属于各自权利人；不是官方动画资源，也没有因生成过程取得角色授权或将其开源。仅本地原型验证；没有发布至外部平台。
- 渲染代码：`components/mood-character.tsx`。24×24 网格，姿态切换淡变，手部/腹部形变；GPU 纹理预乘 alpha；没有引入完整三维引擎。纹理约 6 MiB 解码数据；画布分辨率随显示尺寸变化且 DPR 上限 2。
