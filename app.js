import { buildLeadPayload, buildResult } from "./src/assessment/assessment-engine.js";
import { submitLead } from "./src/data/lead-repository.js";

const WECHAT_ID = "wei_wei10_10";
const QR_IMAGE = "wechat-qr.jpg";
const MODEL_URL = "assessment-model.json";
const TOKEN_KEY = "xiaojang-lead-token";
const SESSION_KEY = "xiaojang-assessment-session";

const app = document.querySelector("#app");
const state = {
  model: null,
  answers: {},
  index: 0,
  page: "loading",
  name: "",
  phone: "",
  wechat: "",
  campaign: "",
  channel: "",
  formError: "",
  submitting: false,
  assessment: null,
  copyHint: "",
  copyFallback: false
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function persistSession() {
  const saved = {
    index: state.index,
    page: state.page === "question" || state.page === "result" ? state.page : "home",
    answers: state.answers,
    campaign: state.campaign,
    channel: state.channel
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
}

function leadToken() {
  let token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

function rememberTraffic() {
  const params = new URLSearchParams(location.search);
  const saved = readSession();
  const incoming = (name) => (params.get(name) || "").trim();
  state.campaign = incoming("campaign") || saved.campaign || "";
  state.channel = incoming("channel") || saved.channel || "";
}

function restoreProgress() {
  const saved = readSession();
  state.answers = saved.answers && typeof saved.answers === "object" ? saved.answers : {};
  const complete = state.model.questions.every((question) => state.answers[question.id]);
  if (saved.page === "result" && complete) {
    state.index = state.model.questions.length - 1;
    state.assessment = buildResult(state.answers, state.model);
    state.page = "result";
    return;
  }
  const index = Number(saved.index);
  if (saved.page === "question" && index >= 0 && index < state.model.questions.length) {
    state.index = index;
    state.page = "question";
    return;
  }
  state.answers = {};
  state.index = 0;
  state.page = "home";
}

function cardAttention(assessment) {
  return Object.entries(state.model.storage.dimensions)
    .map(([dimension, label]) => {
      const score = assessment.dimensions[dimension];
      const mark = score === 0 ? "先放着" : score === 1 ? "要看" : "先看";
      return [label, mark];
    })
    .filter(([, mark]) => mark !== "先放着")
    .map(([label, mark]) => `${label}${mark}`)
    .join("，");
}

function resultCard() {
  const assessment = state.assessment;
  const who = state.name.trim() ? `我是${state.name.trim()}。` : "";
  const attention = cardAttention(assessment);
  return `备注家庭。${who}我做了家庭人生架构测评，画像是${assessment.profileTitle}，最值得关注的是${assessment.focus}。${attention ? `${attention}。` : ""}下一步：${assessment.next}。`;
}

async function copyCard() {
  try {
    await navigator.clipboard.writeText(resultCard());
    state.copyHint = "已经复制。发到微信里即可。";
    state.copyFallback = false;
  } catch {
    state.copyHint = "没有自动复制。长按下面这段文字，选复制。";
    state.copyFallback = true;
  }
  render();
}

async function submitContact() {
  state.formError = "";
  state.submitting = true;
  render();
  const lead = buildLeadPayload(state.answers, state.model, {
    token: leadToken(),
    name: state.name,
    phone: state.phone,
    wechat: state.wechat,
    campaign: state.campaign,
    channel: state.channel
  });
  const result = await submitLead(lead);
  state.submitting = false;
  if (result.success) {
    state.page = "submitted";
  } else {
    state.formError = result.message;
  }
  render();
}

function renderHome() {
  const { homepage } = state.model;
  app.replaceChildren(
    el("h1", "", homepage.headline),
    el("p", "sub", homepage.sub)
  );
  const start = el("button", "primary", homepage.start);
  start.type = "button";
  start.addEventListener("click", () => {
    state.answers = {};
    state.index = 0;
    state.assessment = null;
    state.page = "question";
    persistSession();
    render();
  });
  app.append(start);
}

function renderQuestion() {
  const questions = state.model.questions;
  const question = questions[state.index];
  const selected = state.answers[question.id];
  app.replaceChildren();

  const progress = el("div", "progress");
  const progressValue = el("span", "progress-value");
  progressValue.style.width = `${((state.index + 1) / questions.length) * 100}%`;
  progress.append(progressValue);
  app.append(
    el("p", "step", `第 ${state.index + 1} 题 / ${questions.length}`),
    progress,
    el("h2", "question", question.text)
  );

  const options = el("div", "options");
  question.options.forEach((option) => {
    const button = el("button", "option", question.scored ? `${option.letter}  ${option.text}` : option.text);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", selected?.text === option.text ? "true" : "false");
    button.addEventListener("click", () => {
      state.answers[question.id] = question.scored
        ? {
            letter: option.letter,
            text: option.text,
            score: state.model.scoreByLetter[option.letter],
            dimension: question.dimension
          }
        : { text: option.text, dimension: question.dimension };
      persistSession();
      renderQuestion();
    });
    options.append(button);
  });
  app.append(options);

  const next = el("button", "primary", state.index === questions.length - 1 ? "查看我的结果" : "下一题");
  next.type = "button";
  next.disabled = !selected;
  next.addEventListener("click", () => {
    if (state.index === questions.length - 1) {
      state.assessment = buildResult(state.answers, state.model);
      state.page = "result";
    } else {
      state.index += 1;
    }
    persistSession();
    render();
  });
  app.append(next);

  if (state.index > 0) {
    const back = el("button", "ghost", "上一题");
    back.type = "button";
    back.addEventListener("click", () => {
      state.index -= 1;
      persistSession();
      render();
    });
    app.append(back);
  }
}

function appendList(section, items) {
  const list = el("ul", "result-list");
  items.forEach((item) => list.append(el("li", "", item)));
  section.append(list);
}

function renderResult() {
  const model = state.model;
  const assessment = state.assessment;
  app.replaceChildren(
    el("p", "result-label", "你的家庭属于"),
    el("h1", "result-title", assessment.profileTitle),
    el("p", "portrait-mark", assessment.profile.mark),
    el("p", "detail", assessment.profile.summary)
  );

  const focus = el("section", "sheet");
  focus.append(
    el("p", "result-label", "你目前最值得关注的是"),
    el("h2", "focus-title", assessment.focus),
    el("p", "block-lead", assessment.focusDetail)
  );
  app.append(focus);

  const why = el("section", "sheet");
  why.append(el("h2", "block-title", "为什么得到这个结果"));
  if (assessment.why.length) appendList(why, assessment.why);
  else why.append(el("p", "block-lead", "目前没有明显需要优先处理的单项。"));
  app.append(why);

  const strength = el("section", "sheet");
  strength.append(el("h2", "block-title", "你的优势"), el("p", "block-lead", assessment.strength));
  app.append(strength);

  const look = el("section", "sheet");
  look.append(el("h2", "block-title", "下一步看什么"));
  appendList(look, assessment.look);
  app.append(look);

  const view = el("section", "sheet");
  view.append(el("h2", "block-title", "小蒋怎么看？"), el("p", "block-lead", model.note));
  app.append(view, el("p", "note", model.result.disclaimer));

  const lead = el("section", "lead-form");
  lead.append(el("h2", "block-title", model.lead.cta), el("p", "block-lead", model.lead.intro));
  [
    ["name", "怎么称呼你", "可以不填", 20],
    ["phone", "手机号", "手机号和微信号至少填一个", 11],
    ["wechat", "微信号", "手机号和微信号至少填一个", 50]
  ].forEach(([key, labelText, placeholder, maxLength]) => {
    const label = el("label", "name-line", labelText);
    const input = document.createElement("input");
    input.type = key === "phone" ? "tel" : "text";
    input.inputMode = key === "phone" ? "numeric" : "text";
    input.maxLength = maxLength;
    input.placeholder = placeholder;
    input.value = state[key];
    input.addEventListener("input", () => {
      state[key] = input.value;
      state.formError = "";
    });
    label.append(input);
    lead.append(label);
  });
  if (state.formError) lead.append(el("p", "form-error", state.formError));
  const submit = el("button", "primary", state.submitting ? "正在提交…" : model.lead.cta);
  submit.type = "button";
  submit.disabled = state.submitting;
  submit.addEventListener("click", submitContact);
  lead.append(submit);
  app.append(lead);
}

function appendWechat() {
  const box = el("section", "wechat-box");
  box.append(
    el("h2", "block-title", "加微信"),
    el("p", "block-lead", "接下来可以直接加微信，和我聊聊刚才最值得关注的这一块。"),
    el("p", "", `微信号：${WECHAT_ID}`),
    el("p", "", "添加微信时备注：家庭")
  );
  const image = document.createElement("img");
  image.className = "qr";
  image.alt = "扫这个二维码添加小蒋微信";
  image.src = QR_IMAGE;
  box.append(image);
  const copy = el("button", "primary", "复制结果卡片");
  copy.type = "button";
  copy.addEventListener("click", copyCard);
  box.append(copy);
  if (state.copyHint) box.append(el("p", "copied", state.copyHint));
  if (state.copyFallback) {
    const fallback = el("div", "send-text");
    fallback.append(el("p", "quote", resultCard()));
    box.append(fallback);
  }
  app.append(box);
}

function renderSubmitted() {
  app.replaceChildren(
    el("h1", "", "你的完整分析已经提交给小蒋。"),
    el("p", "sub", `你目前最值得关注的是：${state.assessment.focus}。`)
  );
  appendWechat();
}

function render() {
  if (state.page === "loading") {
    app.replaceChildren(el("p", "sub", "正在加载测评…"));
  } else if (state.page === "home") {
    renderHome();
  } else if (state.page === "question") {
    renderQuestion();
  } else if (state.page === "result") {
    renderResult();
  } else {
    renderSubmitted();
  }
}

async function init() {
  render();
  try {
    const response = await fetch(MODEL_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("assessment model failed");
    state.model = await response.json();
    rememberTraffic();
    leadToken();
    restoreProgress();
    persistSession();
    render();
  } catch {
    app.replaceChildren(el("p", "form-error", "测评暂时无法加载，请稍后再试。"));
  }
}

init();
