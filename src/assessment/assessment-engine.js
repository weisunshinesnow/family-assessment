function rankedAnswers(answers, model) {
  return model.questions
    .filter((question) => question.scored)
    .map((question, order) => ({
      question,
      answer: answers[question.id],
      score: answers[question.id].score,
      order
    }));
}

function highestScore(dimensions) {
  return Math.max(...Object.values(dimensions));
}

export function calculateDimensions(answers, model) {
  return Object.fromEntries(
    rankedAnswers(answers, model).map(({ question, score }) => [question.dimension, score])
  );
}

export function calculateScore(answers, model) {
  return rankedAnswers(answers, model).reduce((sum, item) => sum + item.score, 0);
}

export function resolveProfile(answers, model) {
  const dimensions = calculateDimensions(answers, model);
  const totalScore = calculateScore(answers, model);
  const dependencyScore = dimensions.family_dependency;
  let profileCode;
  if (totalScore >= 16) profileCode = "preparation_gap";
  else if (dependencyScore >= 2 && dependencyScore === highestScore(dimensions)) profileCode = "single_dependency";
  else if (totalScore <= 5) profileCode = "stable";
  else profileCode = "future_pressure";

  const profileTitle = model.storage.profiles[profileCode];
  return {
    profileCode,
    profileTitle,
    profile: model.profiles[profileTitle]
  };
}

export function resolveFocus(dimensions, model) {
  const top = highestScore(dimensions);
  const dimension = model.result.focusPriority.find((key) => dimensions[key] === top);
  return {
    dimension,
    focus: model.storage.dimensions[dimension]
  };
}

export function buildResult(answers, model) {
  const ranked = rankedAnswers(answers, model);
  const dimensions = calculateDimensions(answers, model);
  const totalScore = calculateScore(answers, model);
  const { profileCode, profileTitle, profile } = resolveProfile(answers, model);
  const { dimension, focus } = resolveFocus(dimensions, model);
  const focusItem = ranked.find((item) => item.question.dimension === dimension);
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
  const top = highestScore(dimensions);
  const look = top === 0
    ? ["下一步是把已经想过的几件事接在一起。"]
    : [...ranked]
      .sort((left, right) => right.score - left.score || left.order - right.order)
      .slice(0, 2)
      .map((item) => item.question.look);

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

function storedAnswers(answers, model) {
  return Object.fromEntries(model.questions.map((question) => {
    const answer = answers[question.id];
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

function attentionText(dimensions, model) {
  return Object.entries(model.storage.dimensions).map(([dimension, label]) => {
    const score = dimensions[dimension];
    const mark = score === 0 ? "先放着" : score === 1 ? "要看" : "先看";
    return `${label}：${mark}`;
  }).join("；");
}

export function buildLeadPayload(answers, model, contact = {}) {
  const result = buildResult(answers, model);
  const family = model.questions.find((question) => question.dimension === "family_stage");
  const retirement = model.questions.find((question) => question.dimension === "retirement");
  return {
    token: contact.token,
    name: (contact.name || "").trim().slice(0, 20),
    phone: (contact.phone || "").trim(),
    wechat: (contact.wechat || "").trim(),
    family: answers[family.id].text,
    parents: "",
    retirement: answers[retirement.id].text,
    medical: "",
    income: "",
    totalScore: result.totalScore,
    profileCode: result.profileCode,
    profileTitle: result.profileTitle,
    focus: result.focus,
    attention: attentionText(result.dimensions, model),
    next: result.next,
    answers: storedAnswers(answers, model),
    dimensions: Object.fromEntries(
      Object.entries(result.dimensions).map(([key, value]) => [key, String(value)])
    ),
    source: model.storage.source,
    campaign: (contact.campaign || "").trim(),
    channel: (contact.channel || "").trim(),
    modelId: model.modelId || model.id,
    modelVersion: model.version
  };
}
