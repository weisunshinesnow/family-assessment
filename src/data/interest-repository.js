import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/supabase.js";

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

function failure(code, message) {
  return { success: false, code, message };
}

function clean(value) {
  return (value || "").trim();
}

function validate(lead) {
  const phone = clean(lead.phone);
  const wechat = clean(lead.wechat);
  if (!phone && !wechat) {
    return failure("VALIDATION_ERROR", "请至少填写手机号或微信号。");
  }
  if (phone && !PHONE_PATTERN.test(phone)) {
    return failure("VALIDATION_ERROR", "手机号格式不正确，请检查后再提交。");
  }
  if (wechat.length > 50) {
    return failure("VALIDATION_ERROR", "请检查微信号后再提交。");
  }
  if (!lead.token || !clean(lead.amount) || !clean(lead.currentRate) || !clean(lead.compareRate)) {
    return failure("VALIDATION_ERROR", "提交没有成功，请稍后再试。");
  }
  return null;
}

export async function submitInterestLead(lead) {
  const invalid = validate(lead || {});
  if (invalid) return invalid;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_interest_lead`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_token: lead.token,
        p_name: clean(lead.name).slice(0, 20),
        p_phone: clean(lead.phone),
        p_wechat: clean(lead.wechat),
        p_amount: clean(lead.amount),
        p_current_rate: clean(lead.currentRate),
        p_compare_rate: clean(lead.compareRate),
        p_campaign: clean(lead.campaign),
        p_channel: clean(lead.channel)
      })
    });
    if (!response.ok) {
      console.error("submit_interest_lead failed", response.status);
      return failure("RPC_ERROR", "提交没有成功，请稍后再试。");
    }
    const body = await response.json();
    return { success: true, token: body?.token || lead.token };
  } catch {
    console.error("submit_interest_lead failed");
    return failure("RPC_ERROR", "提交没有成功，请稍后再试。");
  }
}
