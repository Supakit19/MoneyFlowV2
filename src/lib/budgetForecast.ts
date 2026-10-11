export type BudgetWeek = {
  limitSatang: number;
  spentSatang: number;
  daysElapsedInWeek?: number;
  daysLeftInWeek: number;
};
export type CoachTone = 'polite' | 'friend' | 'roast';
export function budgetProjection(week: BudgetWeek, tone: CoachTone = 'friend') {
  const limit = Number(week.limitSatang),
    spent = Number(week.spentSatang);
  if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(spent) || spent < 0)
    return null;
  const elapsed = Math.max(
    1,
    Math.min(7, Math.floor(week.daysElapsedInWeek || 7 - week.daysLeftInWeek)),
  );
  const remainingDays = Math.max(1, Math.min(7, 7 - elapsed + 1));
  const dailyRate = spent / elapsed;
  const projected = Math.round(dailyRate * 7);
  const remaining = limit - spent;
  const dailyAllowance = Math.max(0, Math.floor(remaining / remainingDays));
  const atRisk = projected > limit;
  const pace = elapsed > 0 ? Math.round((spent / limit) * 100) : 0;
  const futureOver = Math.max(0, projected - limit);
  const messages = {
    polite: atRisk
      ? 'หากใช้เงินเท่าช่วงที่ผ่านมา อาจเกินงบ ลองลดรายจ่ายที่ไม่จำเป็นครับ'
      : 'หากใช้เงินในระดับนี้ต่อไป มีแนวโน้มอยู่ในงบครับ',
    friend: atRisk
      ? 'เงินออกเร็วกว่างบนะเพื่อน ลองตั้งเพดานต่อวันกันหน่อย 💚'
      : 'จังหวะนี้ยังดูดีเลย ค่อย ๆ ใช้ตามแผนนะ 💚',
    roast: atRisk
      ? 'โห งบกำลังวิ่งหนีแล้ว! ให้กระเป๋าได้พักหน่อย 😂'
      : 'ตอนนี้คุมเกมได้อยู่ แต่อย่าเพิ่งฉลองด้วยการช้อปนะ 😂',
  };
  return {
    projectedSatang: projected,
    remainingSatang: remaining,
    dailyAllowanceSatang: dailyAllowance,
    overSatang: futureOver,
    atRisk,
    pacePercent: pace,
    elapsedDays: elapsed,
    remainingDays,
    message: messages[tone],
  };
}
