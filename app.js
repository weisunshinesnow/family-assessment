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
