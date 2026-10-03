const WECHAT_ID = "";
const QR_IMAGE = "wechat-qr.png";

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

function leadSentence(data, focus) {
  return `我做了家庭人生架构测评。最值得关注的是${focus.title}。家庭${data.family}，父母${data.parents}，退休花费${data.retirement}，医疗承受${data.medical}，收入${data.income}。`;
}

function remember(data, focus) {
  const key = "xiaojang-assessment-leads";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  list.push({ at: new Date().toISOString(), focus: focus.title, answers: data });
  localStorage.setItem(key, JSON.stringify(list));
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
      remember(snapshot, focus);
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
  app.append(el("p", "result-label", "你的结果"), el("h1", "result-title", `你目前最值得关注的是：${focus.title}`), el("p", "detail", focus.detail));
  if (focus.also.length) {
    app.append(el("p", "also", `另外也值得看一眼：${focus.also.join("、")}。`));
  }
  app.append(el("p", "note", "这不是保险推荐，也不是投资建议。只是把家庭目前可能存在的问题先找出来。"));
  app.append(el("p", "detail", "如果你愿意，我可以和你聊20分钟，把这个问题具体拆开看看。"));

  const box = el("div", "wechat-box");
  box.append(el("p", "", "添加小蒋微信时，备注「家庭」，并把下面这句话发给我。"));
  if (WECHAT_ID) box.append(el("p", "", `微信号：${WECHAT_ID}`));
  else box.append(el("p", "", "打开公众号「小蒋聊人生架构」，在菜单里点「加微信」。"));
  box.append(el("p", "quote", sentence));
  const img = document.createElement("img");
  img.className = "qr";
  img.alt = "小蒋微信二维码";
  img.src = QR_IMAGE;
  img.addEventListener("error", () => img.remove());
  box.append(img);
  const copy = el("button", "primary", "复制这句话，去加微信");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    const text = `备注家庭。${sentence}`;
    try {
      await navigator.clipboard.writeText(text);
      copyHint = "已经复制。发到微信里即可。";
    } catch {
      copyHint = "没有自动复制。长按上面那句话，选复制。";
    }
    render();
  });
  box.append(copy);
  if (copyHint) box.append(el("p", "copied", copyHint));
  app.append(box);
}

function render() {
  if (step === "home") renderHome();
  else if (step === "question") renderQuestion();
  else renderResult();
}

render();
