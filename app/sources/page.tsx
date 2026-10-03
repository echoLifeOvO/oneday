"use client";
import { LanguageSwitch, useLocale } from "@/components/locale-provider";
export default function Sources() {
  const {locale}=useLocale();
  if(locale==="en") return <main className="sources-page"><LanguageSwitch/>
    <h1>Credits & notes</h1>
    <p>A collection of everyday lives in different places, with different spending. Sources for the map and character are listed below.</p>
    <h2>Satellite imagery</h2>
    <p><a href="https://cloudless.eox.at">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024).</p>
    <p>This noncommercial prototype uses 2024 imagery under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>, with color adjustments and map overlays. It is not live imagery. <a href="https://cloudless.eox.at/license-non-commercial">Provider license</a>.</p>
    <h2>Administrative boundaries</h2>
    <p>Public datasets collected by <a href="https://www.geoboundaries.org/">geoBoundaries</a>. Some boundaries have been simplified or combined for different zoom levels. Sources include © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL), IGN-F / Etalab and the US Census, with different licenses by region.</p>
    <p><a href="/data/sources.json">Local boundaries: full sources and licenses</a></p><p><a href="/data/glow-sources.json">Regional boundaries: versions and processing</a></p>
    <p>Worldwide regional discovery shapes also use <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/">Natural Earth 5.1.2</a> (public domain). Where a town boundary is unavailable, the glow represents its wider region.</p>
    <h2>Place search and initial view</h2>
    <p><a href="https://github.com/komoot/photon">Photon</a> searches OpenStreetMap towns using the place names you type. Coordinates locate results; missing boundaries are not replaced with bounding boxes.</p>
    <p>On Vercel, the globe initially faces the approximate region of your request's IP address. We use coarse coordinates only for the initial view and do not store your IP or request GPS access. Diary locations remain your choice. If no region is available, the default globe view is used.</p>
    <h2>Anonymous use and content review</h2>
    <p>A signed, first-party browser cookie lasts up to 30 days and helps limit repeated requests. It is not an account or a hardware fingerprint. It is not attached to published diaries; clearing it creates a new anonymous identifier. Request counts stay temporarily in server memory.</p>
    <p>Before publication, diary text and selected place labels, or reply text, are sent to DeepSeek for automated review. The review does not receive this browser identifier, your IP, spending, or score. Rejected content is not published. Automated review can make mistakes.</p>
    <h2>Rating character</h2>
    <p>Nailoong is a character by <a href="https://www.nailoong.com/ipStar/Nailong/">Seventh Impression</a>. This local prototype uses six AI-generated poses based on the character, animated with WebGL. They are not official assets and do not imply authorization or partnership.</p>
    <p>Diaries and replies appear in their original language.</p><p><a href="/">Back to the globe</a></p>
  </main>;
  return <main className="sources-page">
    <LanguageSwitch/>
    <h1>特别声明</h1>
    <p>这里记录不同地方、不同花费下，人们怎样度过一天。地图和角色所用的素材来源如下。</p>
    <h2>卫星影像</h2>
    <p><a href="https://cloudless.eox.at">EOxCloudless</a> by EOX IT Services GmbH
      (Contains modified Copernicus Sentinel data 2024)。</p>
    <p>本非商业原型使用 2024 年影像，按 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a> 使用。
      页面进行了色彩调整与地块叠加，影像并非实时画面。
      <a href="https://cloudless.eox.at/license-non-commercial">供应方许可说明</a>。</p>
    <h2>行政边界</h2>
    <p>边界来自 <a href="https://www.geoboundaries.org/">geoBoundaries</a> 汇总的公开数据；为适应远近视图，部分边界经过简化、合并。
      包含 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>（ODbL）、IGN-F / Etalab、美国 Census 等来源。
      不同地区适用不同许可。</p>
    <p><a href="/data/sources.json">县市边界与区域边界：完整来源、原始链接与许可</a></p>
    <p><a href="/data/glow-sources.json">远景行政区：数据版本与处理记录</a></p>
    <p>全球区域高亮也使用 <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/">Natural Earth 5.1.2</a> 公共领域数据。尚未收录城镇细边界时，光晕表示它所在的较大区域。</p>
    <h2>城镇搜索</h2>
    <p>由 <a href="https://github.com/komoot/photon">Photon</a> 提供 OpenStreetMap 城镇检索。
      搜索只使用输入的地名，不读取设备位置。搜索结果的坐标用于定位，未收录的行政区轮廓不会以包围框代替。</p>
    <p>部署在 Vercel 时，地球初始朝向会参考请求 IP 的大致区域，只用于设置初始视角，不保存 IP，也不申请 GPS 定位权限。日记地点仍由你选择；无法取得区域时使用默认视角。</p>
    <h2>匿名使用与内容审核</h2>
    <p>网站用有效期最多 30 天的签名 Cookie 限制同一浏览器反复请求。它不是账户或硬件指纹，不关联到已发布日记；清除后会产生新的匿名标识。请求计数只临时保存在服务器内存。</p>
    <p>发布前，日记正文和所选地点的名称信息，或回应正文，会发送给 DeepSeek 自动审核；不会一同发送浏览器标识、IP、花费或评分。未通过的内容不会发布，自动审核可能出现误判。</p>
    <h2>评分角色</h2>
    <p>奶龙是<a href="https://www.nailoong.com/ipStar/Nailong/">第七印象</a>的角色。本地原型中的六种表情由 AI 参考该角色生成，网页动作由 WebGL 驱动；不代表官方素材、授权或合作。</p>
    <p>日记和回应保留作者的原文语言。</p>
    <p><a href="/">回到地球</a></p>
  </main>;
}
