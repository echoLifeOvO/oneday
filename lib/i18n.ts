import type { Place } from "./types";
export type Locale = "zh" | "en";
const zh = {
  contactCreator: "联系作者与参与项目", creatorX: "作者的 X 账户", email: "邮箱", shareIdea: "有想法？提个 Issue", pullRequestsWelcome: "，也欢迎 PR。", maintainerNote: "我来维护和合并，一起让它更好用。",
  title: "一天 · 看见世界的日常", searchPlaceholder: "搜个地方，看看大家的一天", searchLabel: "搜索地名", closeSearch: "关闭地点搜索",
  placePlaceholder: "输入城镇或区县名称", choosePlace: "选择地点", closePlace: "关闭地点选择", searchResults: "地点搜索结果",
  searching: "正在找这个地方…", searchFailed: "地点搜索暂时不可用，请稍后再试。", placeSaveFailed: "无法保留地点，请检查浏览器存储后重试。",
  noPlaces: "没有找到，试试完整的城镇或区县名称。", suggestions: "最近有人写下一天的地方", recentPlaces: "最近选过的地方", write: "写下一天", writeMine: "写下我的一天",
  globeLoading: "正在打开地球", globeWaiting: "地图正在准备，请稍等一下。", saved: "已发布到本机预览，尚未公开。", readFailed: "本机记录暂时无法读取，已有内容未被覆盖。",
  replyPlaceholder: "写下你的回应，最多 200 字", reply: "回应", rateLimited: "现在有点忙，请稍后再试。",
  published: "已发布。", publishing: "发布中…", dataLoading: "正在读取日记…", dataFailed: "日记暂时无法读取，请重试。", loadMore: "加载更多", retry: "重试",
  composeTitle: "今天过得怎么样？", todayIn: "今天我在", todayCost: "为今天的生活，我支付了", bodyPlaceholder: "描述你的生活，为其他人提供一些参考。", bodyLabel: "这一天的记录",
  costLabel: "这一天的花费", moodLabel: "这一天的感受", moodSlider: "今天的感受", currency: "币种", chooseCurrency: "选择币种", publish: "发布", localPreview: "仅本机预览",
  backHome: "返回主页", invalid: "请检查填写的内容", missingPlace: "请选择一个地点", missingBody: "写一点今天的事情吧", longBody: "正文最多 200 字", invalidCost: "请填写 0 到 100,000,000 之间的金额", moderationRejected: "未审核通过，发布失败", moderationUnavailable: "审核暂时不可用，请稍后重试", saveFailed: "没能发布，请重试。你写的内容还在这里。",
  example: "示例", fictional: "虚构示例", localRecord: "本机记录", points: "分", list: "列表", diaryList: "日记列表", diaryCard: "日记卡", closeList: "关闭日记列表", closeCard: "关闭日记卡", backList: "返回日记列表",
  deckHelp: "点列表项阅读完整日记，左右切换；返回列表后继续浏览。", emptyDiary: "这里还没有人留下一天。", responses: "公开回应", noResponses: "还没有回应。", showResponses: "查看回应", hideResponses: "收起回应", turnDiary: "切换日记", previous: "上一张", next: "下一张",
  stream: "正在流动的日记", sources: "特别声明", mapLabel: "三维地球，双指滑动或拖动旋转，捏合缩放，点击地表继续放大", mapFailed: "暂时无法显示地球，请使用支持 WebGL 的浏览器。", boundariesFailed: "地点暂时没能加载，请刷新重试。", score: "评分", spent: "花费",
};
const en: Record<keyof typeof zh, string> = {
  contactCreator: "Contact the creator and contribute", creatorX: "Creator on X", email: "Email", shareIdea: "Have an idea? Open an issue", pullRequestsWelcome: ". PRs are welcome too.", maintainerNote: "I maintain the project and merge contributions.",
  title: "One Day · Everyday lives around the world", searchPlaceholder: "Find a place. See a day there.", searchLabel: "Search places", closeSearch: "Close place search",
  placePlaceholder: "Enter a town or district", choosePlace: "Choose a place", closePlace: "Close place picker", searchResults: "Place results",
  searching: "Looking for this place…", searchFailed: "Place search is unavailable. Please try again.", placeSaveFailed: "Could not keep this place. Check browser storage and try again.",
  noPlaces: "No results. Try the full town or district name.", suggestions: "Recently shared days", recentPlaces: "Recently chosen places", write: "Write a day", writeMine: "Write my day",
  globeLoading: "Opening the globe", globeWaiting: "The map is getting ready. Just a moment.", saved: "Saved in this browser preview. Not published online.", readFailed: "Could not read local diaries. Existing records have been kept.",
  replyPlaceholder: "Write a reply, up to 200 characters", reply: "Reply", rateLimited: "A little busy right now. Please try again shortly.",
  published: "Published.", publishing: "Publishing…", dataLoading: "Loading diaries…", dataFailed: "Diaries are unavailable. Please try again.", loadMore: "Load more", retry: "Retry",
  composeTitle: "How was your day?", todayIn: "Today I was in", todayCost: "For today's life, I spent", bodyPlaceholder: "Describe your day and give others a glimpse of a different life.", bodyLabel: "Your day",
  costLabel: "Today's spending", moodLabel: "How the day felt", moodSlider: "How today felt", currency: "Currency", chooseCurrency: "Choose currency", publish: "Publish", localPreview: "Local preview only",
  backHome: "Back to the globe", invalid: "Please check the form.", missingPlace: "Choose a place.", missingBody: "Write a little about today.", longBody: "Keep your diary within 200 characters.", invalidCost: "Enter an amount from 0 to 100,000,000.", moderationRejected: "Not approved. Publishing failed.", moderationUnavailable: "Review is temporarily unavailable. Please try again later.", saveFailed: "Could not publish. Your words are still here. Please try again.",
  example: "Demo", fictional: "Fictional example", localRecord: "Local record", points: "pts", list: "List", diaryList: "Diary list", diaryCard: "Diary card", closeList: "Close diary list", closeCard: "Close diary", backList: "Back to diary list",
  deckHelp: "Choose a diary to read it. Browse left or right, or return to the list.", emptyDiary: "No one has left a day here yet.", responses: "Public replies", noResponses: "No replies yet.", showResponses: "Show replies", hideResponses: "Hide replies", turnDiary: "Browse diaries", previous: "Previous", next: "Next",
  stream: "Passing diaries", sources: "Credits & notes", mapLabel: "3D globe. Swipe or drag to rotate, pinch to zoom, click to explore.", mapFailed: "The globe could not load. Please use a browser with WebGL support.", boundariesFailed: "Places could not load. Please refresh and try again.", score: "Score", spent: "Spent",
};
export const messages = { zh, en };
export const currencyLabels = { zh: { CNY:"人民币",USD:"美元",EUR:"欧元",JPY:"日元",GBP:"英镑",HKD:"港币" }, en: { CNY:"CNY",USD:"USD",EUR:"EUR",JPY:"JPY",GBP:"GBP",HKD:"HKD" } };
export const moodLabels = { zh:["很难过","有点失落","平平常常","挺开心","非常开心"], en:["Very sad","A little low","An ordinary day","Pretty happy","Very happy"] };
export function moodLabel(score: number, locale: Locale) { return moodLabels[locale][score<20?0:score<42?1:score<60?2:score<82?3:4]; }
export function placeName(place: Place, locale: Locale) { return locale === "en" ? place.englishName || place.name : place.name; }
const regions: Record<string,string> = { "云南":"Yunnan","浙江 · 杭州":"Zhejiang · Hangzhou","江苏 · 南京":"Jiangsu · Nanjing","江苏 · 苏州":"Jiangsu · Suzhou","广西 · 桂林":"Guangxi · Guilin","神奈川县":"Kanagawa","京都府":"Kyoto Prefecture","东京都":"Tokyo","法兰西岛":"Île-de-France","加利福尼亚州":"California" };
export function placeRegion(place: Place, locale: Locale) { return locale === "en" ? regions[place.region] || place.region : place.region; }
export function placeCountry(place: Place, locale: Locale) {
  const code = ({CHN:"CN",JPN:"JP",FRA:"FR",USA:"US"} as Record<string,string>)[place.countryCode] || place.countryCode;
  try { return new Intl.DisplayNames([locale],{type:"region"}).of(code) || place.country; } catch { return place.country; }
}
export function formatMoney(amount: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {style:"currency",currency,maximumFractionDigits:amount%1===0?0:2}).format(amount);
}
export function diaryCount(count: number, locale: Locale) { return locale === "zh" ? `${count} 篇日记` : `${count} ${count === 1 ? "diary" : "diaries"}`; }
export function streamSentence(place: string, amount: string, score: number, locale: Locale) {
  return locale === "zh" ? `在${place}花费了${amount}，获得了${score}分的生活体验` : `A day in ${place}: spent ${amount}, rated the experience ${score}/100`;
}
