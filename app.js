const V21_WECHAT_ID = "wei_wei10_10";
const V21_QR_IMAGE = "wechat-qr.jpg";
const V21_MODEL_URL = "assessment-model.json";
const V21_SUPABASE_URL = "https://azfmivoamqbbptrojodo.supabase.co";
const V21_SUPABASE_ANON_KEY = "sb_publishable_MsnpBgTJLrPGjTvxj9G5pg_0rqxibr_";
const V21_PHONE_PATTERN = /^1[3-9]\d{9}$/;

const v21App = document.querySelector("#app");
const v21State = {
  model: null,
  answers: {},
  index: 0,
  page: "loading",
  name: "",
  phone: "",
  wechat: "",
  formError: "",
  submitting: false,
  assessment: null,
  copyHint: "",
  copyFallback: false
};

function v21El(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function v21ScoredQuestions() {
  return v21State.model.questions.filter((question) => question.scored);
}

function v21Calculate() {
  const model = v21State.model;
  const scored = v21ScoredQuestions();
  const ranked = scored.map((question, order) => ({
    question,
    answer: v21State.answers[question.id],
    score: v21State.answers[question.id].score,
    order
  }));
  const dimensions = Object.fromEntries(
    ranked.map(({ question, score }) => [question.dimension, score])
  );
  const totalScore = ranked.reduce((sum, item) => sum + item.score, 0);
  const highestScore = Math.max(...ranked.map((item) => item.score));
  const dependencyScore = dimensions.family_dependency;

  let profileCode;
  if (totalScore >= 16) profileCode = "preparation_gap";
  else if (dependencyScore >= 2 && dependencyScore === highestScore) profileCode = "single_dependency";
  else if (totalScore <= 5) profileCode = "stable";
  else profileCode = "future_pressure";

  const profileTitle = model.storage.profiles[profileCode];
  const profile = model.profiles[profileTitle];
  const focusDimension = model.result.focusPriority.find(
    (dimension) => dimensions[dimension] === highestScore
  );
  const focus = model.storage.dimensions[focusDimension];
  const focusItem = ranked.find((item) => item.question.dimension === focusDimension);
  const focusDetail = focusItem.question.why[focusItem.answer.letter] || focusItem.question.strength;

  const why = ranked
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, 3)
    .map((item) => item.question.why[item.answer.letter])
    .filter(Boolean);

  const lowest = [...ranked].sort(
    (left, right) => left.score - right.score || left.order - right.order
  )[0];
  const strength = lowest.score <= 1
    ? lowest.question.strength
    : "现在还没有一块已经安排清楚。";

  const highestTwo = [...ranked]
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, 2);
  const look = highestScore === 0
    ? ["下一步是把已经想过的几件事接在一起。"]
    : highestTwo.map((item) => item.question.look);

  return {
    dimensions,
    totalScore,
    profileCode,
    profileTitle,
    profile,
    focus,
    focusDetail,
    why,
    strength,
    look,
    next: model.result.nextByFocus[focus]
  };
}

function v21Attention(assessment) {
  return Object.entries(v21State.model.storage.dimensions).map(([dimension, label]) => {
    const score = assessment.dimensions[dimension];
    const mark = score === 0 ? "先放着" : score === 1 ? "要看" : "先看";
    return [label, mark];
  });
}

function v21Token() {
  const key = "xiaojang-lead-token";
  let token = sessionStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(key, token);
  }
  return token;
}

function v21AnswersPayload() {
  return Object.fromEntries(v21State.model.questions.map((question) => {
    const answer = v21State.answers[question.id];
    if (!question.scored) {
      return [question.id, { text: answer.text, dimension: question.dimension }];
    }
    return [question.id, {
      letter: answer.letter,
      text: answer.text,
      score: answer.score,
      dimension: question.dimension
    }];
  }));
}

function v21Payload() {
  const assessment = v21State.assessment;
  const attention = v21Attention(assessment)
    .map(([label, mark]) => `${label}：${mark}`)
    .join("；");
  return {
    p_token: v21Token(),
    p_name: v21State.name.trim().slice(0, 20),
    p_phone: v21State.phone.trim(),
    p_wechat: v21State.wechat.trim(),
    p_family: v21State.answers.q1.text,
    p_parents: "",
    p_retirement: v21State.answers.q6.text,
    p_medical: "",
    p_income: "",
    p_total_score: assessment.totalScore,
    p_profile_code: assessment.profileCode,
    p_profile_title: assessment.profileTitle,
    p_focus: assessment.focus,
    p_attention: attention,
    p_next: assessment.next,
    p_answers: v21AnswersPayload(),
    p_dimensions: Object.fromEntries(
      Object.entries(assessment.dimensions).map(([key, value]) => [key, String(value)])
    ),
    p_source: v21State.model.storage.source
  };
}

async function v21SubmitLead() {
  const phone = v21State.phone.trim();
  const wechat = v21State.wechat.trim();
  v21State.formError = "";
  if (!phone && !wechat) {
    v21State.formError = "请至少填写手机号或微信号。";
    v21Render();
    return;
  }
  if (phone && !V21_PHONE_PATTERN.test(phone)) {
    v21State.formError = "手机号格式不正确，请检查后再提交。";
    v21Render();
    return;
  }

  v21State.submitting = true;
  v21Render();
  try {
    const response = await fetch(`${V21_SUPABASE_URL}/rest/v1/rpc/submit_lead`, {
      method: "POST",
      headers: {
        apikey: V21_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${V21_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(v21Payload())
    });
    if (!response.ok) {
      throw new Error(`submit_lead failed: ${response.status} ${await response.text()}`);
    }
    v21State.page = "submitted";
  } catch (error) {
    console.error(error);
    v21State.formError = "提交没有成功，请稍后再试。";
  } finally {
    v21State.submitting = false;
    v21Render();
  }
}

function v21ResultCard() {
  const assessment = v21State.assessment;
  const who = v21State.name.trim() ? `我是${v21State.name.trim()}。` : "";
  const attention = v21Attention(assessment)
    .filter(([, mark]) => mark !== "先放着")
    .map(([label, mark]) => `${label}${mark}`)
    .join("，");
  return `备注家庭。${who}我做了家庭人生架构测评，画像是${assessment.profileTitle}，最值得关注的是${assessment.focus}。${attention ? `${attention}。` : ""}下一步：${assessment.next}。`;
}

async function v21CopyCard() {
  const text = v21ResultCard();
  try {
    await navigator.clipboard.writeText(text);
    v21State.copyHint = "已经复制。发到微信里即可。";
    v21State.copyFallback = false;
  } catch {
    v21State.copyHint = "没有自动复制。长按下面这段文字，选复制。";
    v21State.copyFallback = true;
  }
  v21Render();
}

function v21RenderHome() {
  const { homepage } = v21State.model;
  v21App.replaceChildren(
    v21El("h1", "", homepage.headline),
    v21El("p", "sub", homepage.sub)
  );
  const start = v21El("button", "primary", homepage.start);
  start.type = "button";
  start.addEventListener("click", () => {
    v21State.answers = {};
    v21State.index = 0;
    v21State.page = "question";
    v21Render();
  });
  v21App.append(start);
}

function v21RenderQuestion() {
  const questions = v21State.model.questions;
  const question = questions[v21State.index];
  const selected = v21State.answers[question.id];
  v21App.replaceChildren();

  const progressLabel = v21El(
    "p",
    "step",
    `第 ${v21State.index + 1} 题 / ${questions.length}`
  );
  const progress = v21El("div", "progress");
  const progressValue = v21El("span", "progress-value");
  progressValue.style.width = `${((v21State.index + 1) / questions.length) * 100}%`;
  progress.append(progressValue);
  v21App.append(progressLabel, progress, v21El("h2", "question", question.text));

  const options = v21El("div", "options");
  question.options.forEach((option, optionIndex) => {
    const button = v21El(
      "button",
      "option",
      question.scored ? `${option.letter}  ${option.text}` : option.text
    );
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", selected?.text === option.text ? "true" : "false");
    button.addEventListener("click", () => {
      v21State.answers[question.id] = question.scored
        ? {
            letter: option.letter,
            text: option.text,
            score: v21State.model.scoreByLetter[option.letter],
            dimension: question.dimension
          }
        : { text: option.text, dimension: question.dimension };
      v21RenderQuestion();
    });
    options.append(button);
  });
  v21App.append(options);

  const next = v21El(
    "button",
    "primary",
    v21State.index === questions.length - 1 ? "查看我的结果" : "下一题"
  );
  next.type = "button";
  next.disabled = !selected;
  next.addEventListener("click", () => {
    if (v21State.index === questions.length - 1) {
      v21State.assessment = v21Calculate();
      v21State.page = "result";
    } else {
      v21State.index += 1;
    }
    v21Render();
  });
  v21App.append(next);

  if (v21State.index > 0) {
    const back = v21El("button", "ghost", "上一题");
    back.type = "button";
    back.addEventListener("click", () => {
      v21State.index -= 1;
      v21Render();
    });
    v21App.append(back);
  }
}

function v21AppendList(section, items) {
  const list = v21El("ul", "result-list");
  items.forEach((item) => list.append(v21El("li", "", item)));
  section.append(list);
}

function v21RenderResult() {
  const model = v21State.model;
  const assessment = v21State.assessment;
  v21App.replaceChildren(
    v21El("p", "result-label", "你的家庭属于"),
    v21El("h1", "result-title", assessment.profileTitle),
    v21El("p", "portrait-mark", assessment.profile.mark),
    v21El("p", "detail", assessment.profile.summary)
  );

  const focus = v21El("section", "sheet");
  focus.append(
    v21El("p", "result-label", "你目前最值得关注的是"),
    v21El("h2", "focus-title", assessment.focus),
    v21El("p", "block-lead", assessment.focusDetail)
  );
  v21App.append(focus);

  const why = v21El("section", "sheet");
  why.append(v21El("h2", "block-title", "为什么得到这个结果"));
  if (assessment.why.length) v21AppendList(why, assessment.why);
  else why.append(v21El("p", "block-lead", "目前没有明显需要优先处理的单项。"));
  v21App.append(why);

  const strength = v21El("section", "sheet");
  strength.append(
    v21El("h2", "block-title", "你的优势"),
    v21El("p", "block-lead", assessment.strength)
  );
  v21App.append(strength);

  const look = v21El("section", "sheet");
  look.append(v21El("h2", "block-title", "下一步看什么"));
  v21AppendList(look, assessment.look);
  v21App.append(look);

  const view = v21El("section", "sheet");
  view.append(
    v21El("h2", "block-title", "小蒋怎么看？"),
    v21El("p", "block-lead", model.note)
  );
  v21App.append(view, v21El("p", "note", model.result.disclaimer));

  const lead = v21El("section", "lead-form");
  lead.append(
    v21El("h2", "block-title", model.lead.cta),
    v21El("p", "block-lead", model.lead.intro)
  );
  [
    ["name", "怎么称呼你", "可以不填", 20],
    ["phone", "手机号", "手机号和微信号至少填一个", 11],
    ["wechat", "微信号", "手机号和微信号至少填一个", 50]
  ].forEach(([key, labelText, placeholder, maxLength]) => {
    const label = v21El("label", "name-line", labelText);
    const input = document.createElement("input");
    input.type = key === "phone" ? "tel" : "text";
    input.inputMode = key === "phone" ? "numeric" : "text";
    input.maxLength = maxLength;
    input.placeholder = placeholder;
    input.value = v21State[key];
    input.addEventListener("input", () => {
      v21State[key] = input.value;
      v21State.formError = "";
    });
    label.append(input);
    lead.append(label);
  });
  if (v21State.formError) lead.append(v21El("p", "form-error", v21State.formError));
  const submit = v21El(
    "button",
    "primary",
    v21State.submitting ? "正在提交…" : model.lead.cta
  );
  submit.type = "button";
  submit.disabled = v21State.submitting;
  submit.addEventListener("click", v21SubmitLead);
  lead.append(submit);
  v21App.append(lead);
}

function v21AppendWechat() {
  const box = v21El("section", "wechat-box");
  box.append(
    v21El("h2", "block-title", "加微信"),
    v21El("p", "block-lead", "接下来可以直接加微信，和我聊聊刚才最值得关注的这一块。"),
    v21El("p", "", `微信号：${V21_WECHAT_ID}`),
    v21El("p", "", "添加微信时备注：家庭")
  );
  const image = document.createElement("img");
  image.className = "qr";
  image.alt = "扫这个二维码添加小蒋微信";
  image.src = V21_QR_IMAGE;
  box.append(image);
  const copy = v21El("button", "primary", "复制结果卡片");
  copy.type = "button";
  copy.addEventListener("click", v21CopyCard);
  box.append(copy);
  if (v21State.copyHint) box.append(v21El("p", "copied", v21State.copyHint));
  if (v21State.copyFallback) {
    const fallback = v21El("div", "send-text");
    fallback.append(v21El("p", "quote", v21ResultCard()));
    box.append(fallback);
  }
  v21App.append(box);
}

function v21RenderSubmitted() {
  v21App.replaceChildren(
    v21El("h1", "", "你的完整分析已经提交给小蒋。"),
    v21El("p", "sub", `你目前最值得关注的是：${v21State.assessment.focus}。`)
  );
  v21AppendWechat();
}

function v21Render() {
  if (v21State.page === "loading") {
    v21App.replaceChildren(v21El("p", "sub", "正在加载测评…"));
  } else if (v21State.page === "home") {
    v21RenderHome();
  } else if (v21State.page === "question") {
    v21RenderQuestion();
  } else if (v21State.page === "result") {
    v21RenderResult();
  } else {
    v21RenderSubmitted();
  }
}

async function v21Init() {
  v21Render();
  try {
    const response = await fetch(V21_MODEL_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`assessment model failed: ${response.status}`);
    v21State.model = await response.json();
    v21State.page = "home";
    v21Render();
  } catch (error) {
    console.error(error);
    v21App.replaceChildren(v21El("p", "form-error", "测评暂时无法加载，请稍后再试。"));
  }
}

window.__familyAssessmentV21 = {
  state: v21State,
  calculate: v21Calculate,
  payload: v21Payload,
  submit: v21SubmitLead
};

v21Init();

/*
 * 以下保留 V1 实现作为本地迁移参考。V2.1 代码在上方运行。
 *
const WECHAT_ID = "wei_wei10_10";
const QR_IMAGE = "wechat-qr.jpg";
const SUPABASE_URL = "https://azfmivoamqbbptrojodo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MsnpBgTJLrPGjTvxj9G5pg_0rqxibr_";

const QUESTIONS = [
  {
    id: "family",
    text: "你现在的家庭是？",
    options: ["单身", "已婚无孩", "已婚有孩子", "孩子已经成年"]
  },
  {
    id: "parents",
    text: "父母大概处于哪个年龄？",
    options: ["50以下", "50～60", "60～70", "70+"]
  },
  {
    id: "retirement",
    text: "你有没有认真算过，退休以后每月需要多少钱？",
    options: ["想过", "没算过", "不知道"]
  },
  {
    id: "medical",
    text: "如果家里有人得了重大疾病，你觉得家庭承受得住吗？",
    options: ["基本没问题", "有压力", "压力很大", "没想过"]
  },
  {
    id: "income",
    text: "家庭一年的收入大概在哪个区间？",
    options: ["20万以下", "20～50万", "50～100万", "100万+"]
  }
];

const app = document.querySelector("#app");
const answers = {};
let step = "home";
let index = 0;
let copyHint = "";
let copyFailed = false;
let visitorName = "";
let savedLead = false;
let saveTimer = 0;

function focusOf(data) {
  const found = [];
  if (data.parents === "60～70" || data.parents === "70+") {
    found.push({ title: "父母养老", detail: "父母养老和照护还没被单独看过。" });
  }
  if (data.retirement === "没算过" || data.retirement === "不知道") {
    found.push({ title: "养老准备", detail: "养老资金还没有一个明确目标。" });
  }
  if (data.medical === "有压力" || data.medical === "压力很大" || data.medical === "没想过") {
    found.push({ title: "医疗安排", detail: "重大疾病时家里能不能接住，还没想清楚。" });
  }
  if (found.length === 0) {
    return {
      title: "这几件事的衔接",
      detail: "这几件你都想过了。值得再看一眼的是，它们能不能接在一起。",
      also: []
    };
  }
  return {
    title: found[0].title,
    detail: found[0].detail,
    also: found.slice(1).map((item) => item.title)
  };
}

function attention(data) {
  const parents = data.parents === "70+" || data.parents === "60～70"
    ? "先看"
    : data.parents === "50～60"
      ? "要看"
      : "先放着";
  const retirement = data.retirement === "没算过" || data.retirement === "不知道" ? "先看" : "先放着";
  const medical = data.medical === "压力很大" || data.medical === "有压力"
    ? "先看"
    : data.medical === "没想过"
      ? "要看"
      : "先放着";
  return [
    ["父母养老", parents],
    ["自己退休", retirement],
    ["医疗安排", medical]
  ];
}

function nextStep(focus) {
  if (focus.title === "这几件事的衔接") return "先看这几件事能不能接在一起";
  return `先聊${focus.title}`;
}

function leadSentence(data, focus) {
  const name = visitorName.trim();
  const who = name ? `我是${name}。` : "";
  const levels = attention(data).map(([label, mark]) => `${label}${mark}`).join("，");
  return `${who}我做了家庭人生架构测评。下一步：${nextStep(focus)}。家庭${data.family}，父母${data.parents}，收入${data.income}。${levels}。`;
}

function leadToken() {
  const key = "xiaojang-lead-token";
  let token = sessionStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(key, token);
  }
  return token;
}

function saveLead(data, focus) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const levels = attention(data).map(([label, mark]) => `${label}${mark}`).join("，");
  fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_lead`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_token: leadToken(),
      p_name: visitorName.trim().slice(0, 20),
      p_family: data.family,
      p_parents: data.parents,
      p_retirement: data.retirement,
      p_medical: data.medical,
      p_income: data.income,
      p_focus: focus.title,
      p_attention: levels,
      p_next: nextStep(focus)
    })
  }).catch(() => {});
}

function remember(data, focus, immediate) {
  const key = "xiaojang-assessment-leads";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  const entry = {
    at: new Date().toISOString(),
    focus: focus.title,
    name: visitorName.trim(),
    answers: data
  };
  if (savedLead && list.length) list[list.length - 1] = entry;
  else list.push(entry);
  savedLead = true;
  localStorage.setItem(key, JSON.stringify(list));
  if (immediate) {
    clearTimeout(saveTimer);
    saveLead(data, focus);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveLead(data, focus), 500);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderHome() {
  app.replaceChildren();
  app.append(
    el("h1", "", "3分钟，看一看你家的“人生下半场”准备得怎么样？"),
    el("p", "sub", "不是保险测评，也不是产品推荐。只是帮你从家庭、养老、医疗和收入几个角度，快速看一下自己家还有哪些问题没有认真想过。")
  );
  const start = el("button", "primary", "开始测评");
  start.type = "button";
  start.addEventListener("click", () => {
    index = 0;
    step = "question";
    render();
  });
  app.append(start);
}

function renderQuestion() {
  const question = QUESTIONS[index];
  app.replaceChildren();
  app.append(
    el("p", "step", `第 ${index + 1} 题，共 ${QUESTIONS.length} 题`),
    el("h2", "question", question.text)
  );
  const options = el("div", "options");
  question.options.forEach((label) => {
    const button = el("button", "option", label);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", answers[question.id] === label ? "true" : "false");
    button.addEventListener("click", () => {
      answers[question.id] = label;
      renderQuestion();
    });
    options.append(button);
  });
  app.append(options);
  const next = el("button", "primary", index === QUESTIONS.length - 1 ? "提交" : "下一题");
  next.type = "button";
  next.disabled = !answers[question.id];
  next.addEventListener("click", () => {
    if (index === QUESTIONS.length - 1) {
      const snapshot = { ...answers };
      const focus = focusOf(snapshot);
      remember(snapshot, focus, true);
      step = "result";
      render();
      return;
    }
    index += 1;
    render();
  });
  app.append(next);
  if (index > 0) {
    const back = el("button", "ghost", "上一题");
    back.type = "button";
    back.addEventListener("click", () => {
      index -= 1;
      render();
    });
    app.append(back);
  }
}

function renderResult() {
  const snapshot = { ...answers };
  const focus = focusOf(snapshot);
  const sentence = leadSentence(snapshot, focus);
  app.replaceChildren();
  app.append(
    el("p", "result-label", "你的结果"),
    el("p", "result-kicker", "你目前最值得关注的是"),
    el("h1", "result-title", focus.title),
    el("p", "detail", focus.detail)
  );

  app.append(el("p", "note", "这不是保险推荐，也不是投资建议。只是把家庭目前可能存在的问题先找出来。"));
  app.append(el("p", "detail", "如果你愿意，我可以和你聊20分钟，把这个问题具体拆开看看。"));

  const add = el("section", "wechat-box");
  add.append(el("h2", "block-title", "1. 加微信"));
  add.append(el("p", "block-lead", "扫这个二维码加我。"));
  add.append(el("p", "block-lead", "添加时，备注填「家庭」。"));
  add.append(el("p", "", `微信号：${WECHAT_ID}`));
  const img = document.createElement("img");
  img.className = "qr";
  img.alt = "扫这个二维码添加小蒋微信";
  img.src = QR_IMAGE;
  add.append(img);
  add.append(el("p", "block-lead", "加完后，做第 2 步。"));
  app.append(add);

  const sheet = el("section", "sheet");
  sheet.append(el("h2", "block-title", "2. 发给小蒋的卡片"));
  sheet.append(el("p", "block-lead", "加上微信后，点「复制这张卡片」，把文字发到微信里。"));
  const nameLabel = el("label", "name-line", "怎么称呼你");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 20;
  nameInput.placeholder = "可以不填";
  nameInput.value = visitorName;
  nameInput.addEventListener("input", () => {
    visitorName = nameInput.value;
    const quote = app.querySelector(".quote");
    if (quote) quote.textContent = leadSentence(snapshot, focusOf(snapshot));
    remember(snapshot, focusOf(snapshot));
  });
  nameLabel.append(nameInput);
  sheet.append(nameLabel);
  attention(snapshot).forEach(([label, mark]) => {
    const row = el("div", "row");
    row.append(el("span", "", label), el("strong", mark === "先看" ? "mark now" : "mark", mark));
    sheet.append(row);
  });
  sheet.append(el("p", "facts", `家庭：${snapshot.family}。父母：${snapshot.parents}。收入：${snapshot.income}。`));
  sheet.append(el("p", "next", `下一步：${nextStep(focus)}。`));
  const copy = el("button", "primary", "复制这张卡片");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    const text = `备注家庭。${leadSentence(snapshot, focusOf(snapshot))}`;
    try {
      await navigator.clipboard.writeText(text);
      copyHint = "已经复制。发到微信里即可。";
      copyFailed = false;
    } catch {
      copyHint = "没有自动复制。长按下面这段文字，选复制。";
      copyFailed = true;
    }
    render();
  });
  sheet.append(copy);
  if (copyHint) sheet.append(el("p", "copied", copyHint));
  if (copyFailed) {
    const send = el("div", "send-text");
    send.append(el("p", "quote", `备注家庭。${sentence}`));
    sheet.append(send);
  }
  app.append(sheet);
}

function render() {
  if (step === "home") renderHome();
  else if (step === "question") renderQuestion();
  else renderResult();
}

render();
*/
