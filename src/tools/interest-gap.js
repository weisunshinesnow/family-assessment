const YEARS = 5;

function parseNumber(value) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function roundYuan(value) {
  return Math.round(value * 100) / 100;
}

export function interestGap(amountText, currentText, compareText) {
  const fields = [amountText, currentText, compareText].map((value) => String(value ?? "").trim());
  if (fields.some((value) => value === "")) return { status: "empty" };

  const amount = parseNumber(amountText);
  const currentRate = parseNumber(currentText);
  const compareRate = parseNumber(compareText);
  const ratesOk = currentRate !== null && compareRate !== null && currentRate <= 100 && compareRate <= 100;
  if (amount === null || amount <= 0 || amount > 1e12 || !ratesOk) return { status: "invalid" };

  const currentAnnual = roundYuan(amount * currentRate / 100);
  const compareAnnual = roundYuan(amount * compareRate / 100);
  const annualGap = roundYuan(compareAnnual - currentAnnual);
  return {
    status: "ok",
    currentAnnual,
    compareAnnual,
    annualGap,
    cumulativeGap: roundYuan(annualGap * YEARS),
    years: YEARS
  };
}

export function interestGapCopy(annualGap) {
  if (annualGap > 0) return { annual: "每年多获得", total: "五年累计多获得" };
  if (annualGap < 0) return { annual: "每年少获得", total: "五年累计少获得" };
  return { annual: "每年利息相同", total: "五年累计没有差额" };
}

export function formatYuan(value) {
  return `${Math.abs(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} 元`;
}
