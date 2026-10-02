export function moodName(score: number) {
  return score < 20 ? "很难过" : score < 42 ? "有点失落" : score < 60 ? "平平常常" : score < 82 ? "挺开心" : "非常开心";
}
