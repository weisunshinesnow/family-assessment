import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/supabase.js";

const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const DIMENSIONS = [
  "income_resilience",
  "family_dependency",
  "health_resilience",
  "parent_care",
  "retirement",
  "planning"
];

function failure(code, message) {
  return { success: false, code, message };
}

function clean(value) {
  return (value || "").trim();
}

function rpcBody(lead) {
  return {
    p_token: lead.token,
    p_name: clean(lead.name).slice(0, 20),
    p_phone: clean(lead.phone),
    p_wechat: clean(lead.wechat),
    p_family: lead.family,
    p_parents: lead.parents || "",
    p_retirement: lead.retirement,
    p_medical: lead.medical || "",
    p_income: lead.income || "",
    p_total_score: lead.totalScore,
    p_profile_code: lead.profileCode,
    p_profile_title: lead.profileTitle,
    p_focus: lead.focus,
    p_attention: lead.attention,
    p_next: lead.next,
    p_answers: lead.answers,
    p_dimensions: Object.fromEntries(
      DIMENSIONS.map((key) => [key, String(lead.dimensions[key])])
    ),
    p_source: clean(lead.source) || "family-assessment",
    p_campaign: clean(lead.campaign),
    p_channel: clean(lead.channel),
    p_model_id: clean(lead.modelId),
    p_model_version: clean(lead.modelVersion)
  };
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
  if (!lead.token || !clean(lead.modelId) || !clean(lead.modelVersion)) {
    return failure("VALIDATION_ERROR", "提交没有成功，请稍后再试。");
  }
  if (!Number.isInteger(lead.totalScore) || lead.totalScore < 0 || lead.totalScore > 18) {
    return failure("VALIDATION_ERROR", "提交没有成功，请稍后再试。");
  }
  if (!lead.answers || typeof lead.answers !== "object" || !lead.dimensions) {
    return failure("VALIDATION_ERROR", "提交没有成功，请稍后再试。");
  }
  const dimensionsReady = DIMENSIONS.every((key) => ["0", "1", "2", "3"].includes(String(lead.dimensions[key])));
  if (!dimensionsReady) {
    return failure("VALIDATION_ERROR", "提交没有成功，请稍后再试。");
  }
  return null;
}

export async function submitLead(lead) {
  const invalid = validate(lead || {});
  if (invalid) return invalid;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_lead_v2`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(rpcBody(lead))
    });
    if (!response.ok) {
      console.error("submit_lead_v2 failed", response.status);
      return failure("RPC_ERROR", "提交没有成功，请稍后再试。");
    }
    const body = await response.json();
    const token = body?.token || lead.token;
    return { success: true, leadId: token, token };
  } catch {
    console.error("submit_lead_v2 failed");
    return failure("RPC_ERROR", "提交没有成功，请稍后再试。");
  }
}
