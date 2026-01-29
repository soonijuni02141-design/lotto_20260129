const STORAGE_KEY = "lotto_recommender_history_v1";
const FIXED_SET_COUNT = 5;

function $(id) {
  return document.getElementById(id);
}

function clampInt(n, min, max) {
  const x = Number.parseInt(String(n), 10);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function formatDateTime(d) {
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ballClass(n) {
  if (n <= 10) return "yellow";
  if (n <= 20) return "blue";
  if (n <= 30) return "red";
  if (n <= 40) return "gray";
  return "green";
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Mulberry32 PRNG (seeded)
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeed() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  // yyyymmdd as number
  return y * 10000 + m * 100 + day;
}

function generateSetFromRng(rng, { sortMode }) {
  // 1..45
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  shuffleInPlace(pool, rng);
  const main = pool.slice(0, 6);
  const bonus = pool[6];
  if (sortMode === "asc") main.sort((a, b) => a - b);
  return { main, bonus };
}

function generateSets(count, opts) {
  // daily 모드일 때도 "세트별로" 달라지게 하려고 seed를 살짝 이동
  const sets = [];
  if (opts.seedMode === "daily") {
    const base = dailySeed();
    for (let i = 0; i < count; i++) {
      const rng = mulberry32((base + i * 101) >>> 0);
      sets.push(generateSetFromRng(rng, opts));
    }
    return sets;
  }

  for (let i = 0; i < count; i++) {
    sets.push(generateSetFromRng(Math.random, opts));
  }
  return sets;
}

function toText(sets) {
  return sets
    .map(
      (s, i) =>
        `${i + 1}세트: ${s.main.join(", ")} (보너스: ${s.bonus})`
    )
    .join("\n");
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x) =>
          x &&
          typeof x === "object" &&
          typeof x.when === "string" &&
          Array.isArray(x.sets)
      )
      .slice(0, 200);
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 200)));
}

let lastGenerated = null; // { when: string, seedMode, sortMode, sets: number[][] }

let toastTimer = null;
function showToast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 1800);
}

function renderResult() {
  const root = $("result");
  const btnCopy = $("btnCopy");
  const btnSave = $("btnSave");

  if (!lastGenerated) {
    root.innerHTML =
      '<div class="placeholder">아직 추천된 번호가 없어요. <strong>번호 추천</strong>을 눌러주세요.</div>';
    btnCopy.disabled = true;
    btnSave.disabled = true;
    return;
  }

  const { sets, seedMode, sortMode } = lastGenerated;
  const meta = `${seedMode === "daily" ? "오늘의 추천" : "완전 랜덤"} · ${
    sortMode === "asc" ? "오름차순" : "생성 순서"
  } · ${FIXED_SET_COUNT}세트`;

  const setsHtml = sets
    .map((set, idx) => {
      const mainBalls = set.main
        .map(
          (n) =>
            `<div class="ball ${ballClass(n)}" aria-label="번호 ${n}">${n}</div>`
        )
        .join("");
      const bonusBall = `<div class="bonusWrap" aria-label="보너스 번호">
          <div class="bonusLabel">보너스</div>
          <div class="ball ${ballClass(set.bonus)}" aria-label="보너스 번호 ${set.bonus}">${set.bonus}</div>
        </div>`;

      return `
        <div class="set">
          <div class="balls">${mainBalls}</div>
          ${bonusBall}
          <div class="setMeta">
            <div class="badge">${idx + 1}세트</div>
            <div class="metaLine">${meta}</div>
          </div>
        </div>
      `;
    })
    .join("");

  root.innerHTML = `<div class="sets">${setsHtml}</div>`;
  btnCopy.disabled = false;
  btnSave.disabled = false;
}

function renderHistory() {
  const root = $("history");
  const items = loadHistory();

  if (!items.length) {
    root.classList.add("empty");
    root.innerHTML = `<div class="historyEmpty">저장된 기록이 없습니다.</div>`;
    return;
  }

  root.classList.remove("empty");

  const html = items
    .map((item, idx) => {
      const setsHtml = item.sets
        .map((set) => {
          const mainBalls = (set.main ?? [])
            .map((n) => `<div class="ball ${ballClass(n)}">${n}</div>`)
            .join("");
          const bonus = set.bonus;
          const bonusHtml =
            typeof bonus === "number"
              ? `<div class="bonusWrap"><div class="bonusLabel">보너스</div><div class="ball ${ballClass(
                  bonus
                )}">${bonus}</div></div>`
              : "";
          return `<div class="set"><div class="balls">${mainBalls}</div>${bonusHtml}</div>`;
        })
        .join("");

      return `
        <div class="historyItem" data-idx="${idx}">
          <div class="historyTop">
            <div>
              <div class="historyWhen">${item.when}</div>
              <div class="metaLine">${item.meta}</div>
            </div>
            <div class="historyButtons">
              <button class="btn mini" data-action="copy">복사</button>
              <button class="btn mini danger" data-action="delete">삭제</button>
            </div>
          </div>
          <div class="historySets">${setsHtml}</div>
        </div>
      `;
    })
    .join("");

  root.innerHTML = html;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function wire() {
  const seedModeEl = $("seedMode");
  const sortModeEl = $("sortMode");
  const btnGenerate = $("btnGenerate");
  const btnCopy = $("btnCopy");
  const btnSave = $("btnSave");
  const btnClear = $("btnClear");
  const history = $("history");

  btnGenerate.addEventListener("click", () => {
    const seedMode = seedModeEl.value;
    const sortMode = sortModeEl.value;
    const count = FIXED_SET_COUNT;

    const sets = generateSets(count, { seedMode, sortMode });
    lastGenerated = {
      when: formatDateTime(new Date()),
      seedMode,
      sortMode,
      sets,
      meta: `${seedMode === "daily" ? "오늘의 추천" : "완전 랜덤"} · ${
        sortMode === "asc" ? "오름차순" : "생성 순서"
      } · ${count}세트 · 보너스 포함`,
    };

    renderResult();
    showToast("추천 번호를 생성했어요.");
  });

  btnCopy.addEventListener("click", async () => {
    if (!lastGenerated) return;
    const ok = await copyText(toText(lastGenerated.sets));
    showToast(ok ? "클립보드에 복사했어요." : "복사에 실패했어요.");
  });

  btnSave.addEventListener("click", () => {
    if (!lastGenerated) return;
    const items = loadHistory();
    items.unshift({
      when: lastGenerated.when,
      meta: lastGenerated.meta,
      sets: lastGenerated.sets,
    });
    saveHistory(items);
    renderHistory();
    showToast("기록을 저장했어요.");
  });

  btnClear.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
    showToast("기록을 모두 삭제했어요.");
  });

  history.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const itemEl = e.target.closest(".historyItem");
    if (!itemEl) return;
    const idx = clampInt(itemEl.getAttribute("data-idx"), 0, 9999);

    const items = loadHistory();
    const item = items[idx];
    if (!item) return;

    if (action === "copy") {
      const ok = await copyText(toText(item.sets));
      showToast(ok ? "클립보드에 복사했어요." : "복사에 실패했어요.");
      return;
    }
    if (action === "delete") {
      items.splice(idx, 1);
      saveHistory(items);
      renderHistory();
      showToast("기록을 삭제했어요.");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wire();
  renderResult();
  renderHistory();
});

