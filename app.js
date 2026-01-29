const STORAGE_KEY_SAVED = "comfort_quotes_saved_v1";
const STORAGE_KEY_SESSION = "comfort_quotes_session_v1";
const STORAGE_KEY_THEME = "comfort_quotes_theme_v1";
const QUOTES_PER_PAGE = 5;

function $(id) {
  return document.getElementById(id);
}

function clampInt(n, min, max) {
  const x = Number.parseInt(String(n), 10);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function pad2(x) {
  return String(x).padStart(2, "0");
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateTime(d) {
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
    d.getSeconds()
  )}`;
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
  return y * 10000 + m * 100 + day; // yyyymmdd
}

const QUOTES = [
  { text: "오늘 하루, 잘 버틴 것만으로도 충분해요.", tag: "위로" },
  { text: "괜찮아. 지금 느끼는 감정은 틀린 게 아니에요.", tag: "마음" },
  { text: "조금 느려도 괜찮아. 멈추지 않았잖아요.", tag: "페이스" },
  { text: "할 수 있는 만큼만 해도 돼요. 지금은 그게 최선이에요.", tag: "자기연민" },
  { text: "오늘의 당신은, 어제의 당신이 간절히 바라던 사람일지도 몰라요.", tag: "성장" },
  { text: "아무것도 하지 못한 날도, 회복하는 날이에요.", tag: "회복" },
  { text: "문제는 당신이 아니라, 너무 많은 걸 혼자 안고 있었던 거예요.", tag: "정리" },
  { text: "괜찮아지는 속도는 사람마다 달라요.", tag: "비교금지" },
  { text: "지금 이 순간만큼은, 스스로를 편들어 주세요.", tag: "자기편" },
  { text: "오늘의 작은 한 걸음이, 내일의 숨을 만들어요.", tag: "한걸음" },
  { text: "완벽하지 않아도 괜찮아. 당신은 이미 충분히 애쓰고 있어요.", tag: "충분" },
  { text: "불안은 사라지지 않아도, 함께 견딜 수 있어요.", tag: "불안" },
  { text: "지금의 당신도 사랑받을 자격이 있어요.", tag: "자격" },
  { text: "쉬어도 돼요. 쉬는 건 포기가 아니라 정비예요.", tag: "쉼" },
  { text: "오늘은 오늘만큼만. 내일의 걱정은 내일의 나에게.", tag: "오늘" },
  { text: "‘잘’이 아니라 ‘다시’가 중요해요.", tag: "다시" },
  { text: "가끔은 아무 말 없이도 괜찮아요. 존재만으로도 충분하니까.", tag: "존재" },
  { text: "당신의 마음은, 늘 누군가의 속도에 맞출 필요 없어요.", tag: "속도" },
  { text: "지금은 작아 보이는 변화도, 계속되면 길이 돼요.", tag: "지속" },
  { text: "오늘의 당신을, 오늘의 기준으로 칭찬해요.", tag: "칭찬" },
];

function safeJsonParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function loadSaved() {
  const raw = localStorage.getItem(STORAGE_KEY_SAVED);
  const parsed = safeJsonParse(raw ?? "[]", []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof x.id === "string" &&
        typeof x.text === "string" &&
        typeof x.tag === "string" &&
        typeof x.savedAt === "string"
    )
    .slice(0, 500);
}

function saveSaved(items) {
  localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(items.slice(0, 500)));
}

function loadSession() {
  const raw = localStorage.getItem(STORAGE_KEY_SESSION);
  const parsed = safeJsonParse(raw ?? "{}", {});
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}

function saveSession(session) {
  localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session ?? {}));
}

function stableIdForQuote(text, tag) {
  // 간단한 안정 ID(충돌 가능성은 낮지만, 여기선 충분)
  const src = `${tag}::${text}`;
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `q_${(h >>> 0).toString(16)}`;
}

let toastTimer = null;
function showToast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 1700);
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

function getTodayKey() {
  return formatDate(new Date());
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getDailyPageDefault() {
  return 0;
}

function getCurrentPage() {
  const todayKey = getTodayKey();
  const session = loadSession();
  const today = session[todayKey];
  if (
    today &&
    typeof today === "object" &&
    Number.isInteger(today.page) &&
    today.page >= 0 &&
    today.page <= 5000
  ) {
    return today.page;
  }
  return getDailyPageDefault();
}

function setCurrentPage(page) {
  const todayKey = getTodayKey();
  const session = loadSession();
  session[todayKey] = {
    page: clampInt(page, 0, 5000),
    updatedAt: formatDateTime(new Date()),
  };
  saveSession(session);
}

function getQuoteIndicesForPage(page) {
  const safePage = clampInt(page, 0, 5000);
  const seed = (dailySeed() + safePage * 1009) >>> 0;
  const rng = mulberry32(seed);
  const indices = Array.from({ length: QUOTES.length }, (_, i) => i);
  shuffleInPlace(indices, rng);
  return indices.slice(0, Math.min(QUOTES_PER_PAGE, indices.length));
}

function renderQuote() {
  const todayMeta = $("todayMeta");
  const quoteWhen = $("quoteWhen");
  const quoteList = $("quoteList");

  const page = getCurrentPage();
  const indices = getQuoteIndicesForPage(page);

  if (todayMeta) {
    todayMeta.textContent = `${getTodayKey()} · 오늘의 문구 5개`;
  }
  if (quoteWhen) {
    quoteWhen.textContent =
      "마음에 드는 문구는 저장해두고, 필요할 때 다시 꺼내보세요.";
  }
  if (quoteList) {
    quoteList.innerHTML = indices
      .map((idx, i) => {
        const q = QUOTES[idx] ?? QUOTES[0];
        return `
          <div class="quoteItem" data-idx="${idx}">
            <div class="quoteItemTop">
              <span class="quoteTag">#${escapeHtml(q.tag)}</span>
              <div class="quoteItemActions">
                <button class="btn mini ghost" data-action="copy">복사</button>
                <button class="btn mini ghost" data-action="save">저장</button>
              </div>
            </div>
            <div class="quoteItemText">${escapeHtml(q.text)}</div>
          </div>
        `;
      })
      .join("");
  }
}

function renderSaved() {
  const root = $("savedList");
  if (!root) return;

  const items = loadSaved();
  if (!items.length) {
    root.classList.add("empty");
    root.innerHTML = `<div class="historyEmpty">저장된 문구가 없습니다.</div>`;
    return;
  }

  root.classList.remove("empty");
  root.innerHTML = items
    .map(
      (it, idx) => `
      <div class="historyItem" data-idx="${idx}">
        <div class="historyTop">
          <div>
            <div class="historyWhen">${escapeHtml(it.savedAt)}</div>
            <div class="metaLine">#${escapeHtml(it.tag)}</div>
          </div>
          <div class="historyButtons">
            <button class="btn mini" data-action="copy">복사</button>
            <button class="btn mini danger" data-action="delete">삭제</button>
          </div>
        </div>
        <div class="quoteText" style="font-size: 16px; font-weight: 700;">${escapeHtml(
          it.text
        )}</div>
      </div>
    `
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCurrentQuotes() {
  const page = getCurrentPage();
  const indices = getQuoteIndicesForPage(page);
  return indices.map((idx) => QUOTES[idx] ?? QUOTES[0]);
}

function formatQuotesForCopy(quotes) {
  return quotes.map((q, i) => `${i + 1}. ${q.text}  (#${q.tag})`).join("\n");
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "");
  if (t === "dark") document.documentElement.removeAttribute("data-theme");
  localStorage.setItem(STORAGE_KEY_THEME, t);
  const btn = $("btnTheme");
  if (btn) btn.textContent = t === "light" ? "다크모드" : "라이트모드";
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY_THEME);
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
    return;
  }
  const prefersLight =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(prefersLight ? "light" : "dark");
}

function wire() {
  const btnNew = $("btnNew");
  const btnCopy = $("btnCopy");
  const btnSave = $("btnSave");
  const btnShare = $("btnShare");
  const btnTheme = $("btnTheme");
  const btnClearSaved = $("btnClearSaved");
  const savedList = $("savedList");
  const quoteCard = $("quoteCard");

  btnNew?.addEventListener("click", () => {
    const next = getCurrentPage() + 1;
    setCurrentPage(next);
    renderQuote();
    showToast("다른 문구를 가져왔어요.");
  });

  btnCopy?.addEventListener("click", async () => {
    const quotes = getCurrentQuotes();
    const ok = await copyText(formatQuotesForCopy(quotes));
    showToast(ok ? "클립보드에 복사했어요." : "복사에 실패했어요.");
  });

  btnSave?.addEventListener("click", () => {
    const quotes = getCurrentQuotes();
    const items = loadSaved();

    let added = 0;
    for (const q of quotes) {
      const id = stableIdForQuote(q.text, q.tag);
      if (items.some((x) => x.id === id)) continue;
      items.unshift({
        id,
        text: q.text,
        tag: q.tag,
        savedAt: formatDateTime(new Date()),
      });
      added++;
    }
    saveSaved(items);
    renderSaved();
    showToast(added ? `${added}개 저장했어요.` : "이미 저장된 문구들이에요.");
  });

  btnShare?.addEventListener("click", async () => {
    const quotes = getCurrentQuotes();
    const text = formatQuotesForCopy(quotes);
    try {
      if (navigator.share) {
        await navigator.share({
          title: "하루 위로 문구",
          text,
        });
        showToast("공유했어요.");
        return;
      }
    } catch {
      // 사용자가 취소한 경우 등은 조용히 넘어감
    }
    const ok = await copyText(text);
    showToast(ok ? "공유 대신 복사했어요." : "복사에 실패했어요.");
  });

  btnTheme?.addEventListener("click", () => {
    const cur = localStorage.getItem(STORAGE_KEY_THEME) === "light" ? "light" : "dark";
    applyTheme(cur === "light" ? "dark" : "light");
  });

  btnClearSaved?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY_SAVED);
    renderSaved();
    showToast("저장한 문구를 모두 삭제했어요.");
  });

  savedList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const itemEl = e.target.closest(".historyItem");
    if (!itemEl) return;
    const idx = clampInt(itemEl.getAttribute("data-idx"), 0, 9999);

    const items = loadSaved();
    const item = items[idx];
    if (!item) return;

    if (action === "copy") {
      const ok = await copyText(item.text);
      showToast(ok ? "클립보드에 복사했어요." : "복사에 실패했어요.");
      return;
    }
    if (action === "delete") {
      items.splice(idx, 1);
      saveSaved(items);
      renderSaved();
      showToast("삭제했어요.");
    }
  });

  quoteCard?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const itemEl = e.target.closest(".quoteItem");
    if (!itemEl) return;
    const idx = clampInt(itemEl.getAttribute("data-idx"), 0, QUOTES.length - 1);
    const q = QUOTES[idx];
    if (!q) return;

    if (action === "copy") {
      const ok = await copyText(q.text);
      showToast(ok ? "클립보드에 복사했어요." : "복사에 실패했어요.");
      return;
    }

    if (action === "save") {
      const id = stableIdForQuote(q.text, q.tag);
      const items = loadSaved();
      if (items.some((x) => x.id === id)) {
        showToast("이미 저장된 문구예요.");
        return;
      }
      items.unshift({
        id,
        text: q.text,
        tag: q.tag,
        savedAt: formatDateTime(new Date()),
      });
      saveSaved(items);
      renderSaved();
      showToast("저장했어요.");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderQuote();
  renderSaved();
  wire();
});

