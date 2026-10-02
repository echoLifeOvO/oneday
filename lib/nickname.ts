export function nickname(locale: "zh" | "en") {
  const adjectives = locale === "en" ? ["Wandering ", "Passing ", "Sunlit ", "Sleepy ", "Cloud-watching ", "Unhurried "] : ["慢慢走的", "路过的", "晒太阳的", "刚睡醒的", "看云的", "不赶路的"];
  const nouns = locale === "en" ? ["Otter", "Chestnut", "Mushroom", "Bear", "Potato", "Seagull"] : ["水獭", "栗子", "蘑菇", "小熊", "土豆", "海鸥"];
  const n = crypto.getRandomValues(new Uint32Array(2));
  return adjectives[n[0] % adjectives.length] + nouns[n[1] % nouns.length];
}
