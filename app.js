const state = {
  role: "student",
  data: [],
  loaded: false,
  error: "",
  paper: "all",
  category: "all",
  search: "",
};

const questionGrid = document.getElementById("questionGrid");
const paperFilter = document.getElementById("paperFilter");
const categoryFilter = document.getElementById("categoryFilter");
const searchInput = document.getElementById("searchInput");
const questionCount = document.getElementById("questionCount");
const paperCount = document.getElementById("paperCount");
const categoryCount = document.getElementById("categoryCount");
const roleButtons = document.querySelectorAll(".role-btn");
const solutionMap = window.MATHISFUN_SOLUTIONS || {};

const unique = (items) => Array.from(new Set(items)).sort();

const normalizeQuestions = (data, sourceLabel) => {
  if (!Array.isArray(data)) {
    throw new Error(`${sourceLabel} must be a JSON array of question objects.`);
  }
  return data;
};

const escapeHtml = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatMath = (text) => {
  let out = escapeHtml(String(text ?? ""));

  // nCk, nCk+1 -> nC_(k), nC_(k+1)
  out = out.replace(
    /\b([A-Za-z0-9]+)C([A-Za-z0-9+\-]+)\b/g,
    '<span class="math"><span class="math-base">$1</span>C<sub>$2</sub></span>'
  );

  // x^2, 2^2023 -> x<sup>2</sup>
  out = out.replace(
    /\b([A-Za-z0-9)\]])\^([A-Za-z0-9+\-]+)\b/g,
    '<span class="math">$1<sup>$2</sup></span>'
  );

  // sqrt(3) -> √(3)
  out = out.replace(
    /sqrt\(([^)]+)\)/g,
    '<span class="math">√($1)</span>'
  );

  // simple inline fractions: a/b
  out = out.replace(
    /\b([A-Za-z0-9+\-]+)\s*\/\s*([A-Za-z0-9+\-]+)\b/g,
    '<span class="frac"><span class="frac-top">$1</span><span class="frac-bar"></span><span class="frac-bottom">$2</span></span>'
  );

  return out;
};

const formatTextBlock = (text) => formatMath(text).replaceAll("\n", "<br>");

const getSolutionText = (item) => {
  const mapped = solutionMap[item.id];
  if (mapped) return mapped;
  return `Method:\n${item.hint}\n\nFinal answer: ${item.answer}`;
};

const updateStats = (data) => {
  questionCount.textContent = data.length;
  paperCount.textContent = unique(data.map((item) => item.paper)).length;
  categoryCount.textContent = unique(data.map((item) => item.category)).length;
};

const fillSelect = (select, label, items) => {
  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = `All ${label}`;
  select.appendChild(allOption);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
};

const matchesSearch = (item, query) => {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    item.id.toLowerCase().includes(needle) ||
    item.question.toLowerCase().includes(needle)
  );
};

const render = () => {
  if (!state.loaded && !state.error) {
    questionGrid.innerHTML = `
      <div class="card">
        <h3>Loading questions...</h3>
        <p>Reading <code>config.json</code> from this folder.</p>
      </div>
    `;
    return;
  }

  if (state.error) {
    questionGrid.innerHTML = `
      <div class="card">
        <h3>Failed to load questions</h3>
        <p>${state.error}</p>
        <p>If you opened this with <code>file://</code>, run a local server in this folder and open that URL.</p>
      </div>
    `;
    return;
  }

  const filtered = state.data.filter((item) => {
    const paperOk = state.paper === "all" || item.paper === state.paper;
    const categoryOk =
      state.category === "all" || item.category === state.category;
    const searchOk = matchesSearch(item, state.search);
    return paperOk && categoryOk && searchOk;
  });

  questionGrid.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML = `
      <h3>No matching questions</h3>
      <p>Try another paper, category, or search term.</p>
    `;
    questionGrid.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <span class="chip">${item.id}</span>
      <span class="chip">${item.paper}</span>
      <span class="chip">${item.category}</span>
    `;

    const question = document.createElement("h3");
    question.innerHTML = formatMath(item.question);

    card.appendChild(meta);
    card.appendChild(question);

    if (state.role === "admin") {
      const hint = document.createElement("p");
      hint.innerHTML = `<strong>Hint:</strong> ${formatMath(item.hint)}`;
      const answer = document.createElement("div");
      answer.className = "answer";
      answer.innerHTML = `<strong>Answer:</strong> ${formatMath(item.answer)}`;
      const details = document.createElement("details");
      details.className = "solution";
      details.innerHTML = `
        <summary>Show full solution</summary>
        <div class="solution__content">${formatTextBlock(getSolutionText(item))}</div>
      `;
      card.appendChild(hint);
      card.appendChild(answer);
      card.appendChild(details);
    }

    questionGrid.appendChild(card);
  });
};

const setRole = (role) => {
  state.role = role;
  roleButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.role === role);
  });
  localStorage.setItem("mathisfun-role", role);
  render();
};

const loadRole = () => {
  const saved = localStorage.getItem("mathisfun-role");
  if (saved === "admin" || saved === "student") {
    state.role = saved;
  }
};

const init = async () => {
  loadRole();
  setRole(state.role);
  render();

  try {
    // Direct file:// open: use local script data to avoid fetch restrictions.
    if (
      window.location.protocol === "file:" &&
      Array.isArray(window.MATHISFUN_QUESTIONS)
    ) {
      const localData = normalizeQuestions(
        window.MATHISFUN_QUESTIONS,
        "config-data.js"
      );
      state.data = localData;
      state.loaded = true;
      state.error = "";
      updateStats(localData);
      fillSelect(
        paperFilter,
        "papers",
        unique(localData.map((item) => item.paper))
      );
      fillSelect(
        categoryFilter,
        "categories",
        unique(localData.map((item) => item.category))
      );
      render();
      return;
    }

    const configUrl = new URL("./config.json", window.location.href);
    const response = await fetch(configUrl.href, { cache: "no-store" });

    // `file://` responses can report status 0 in some browsers.
    if (!response.ok && response.status !== 0) {
      throw new Error(`HTTP ${response.status} while reading ${configUrl.pathname}`);
    }

    const text = await response.text();
    const data = normalizeQuestions(JSON.parse(text), "config.json");

    state.data = data;
    state.loaded = true;
    state.error = "";

    updateStats(data);
    fillSelect(paperFilter, "papers", unique(data.map((item) => item.paper)));
    fillSelect(
      categoryFilter,
      "categories",
      unique(data.map((item) => item.category))
    );

    render();
  } catch (error) {
    // Server mode fallback if fetch fails but script data exists.
    if (Array.isArray(window.MATHISFUN_QUESTIONS)) {
      try {
        const fallbackData = normalizeQuestions(
          window.MATHISFUN_QUESTIONS,
          "config-data.js"
        );
        state.data = fallbackData;
        state.loaded = true;
        state.error = "";
        updateStats(fallbackData);
        fillSelect(
          paperFilter,
          "papers",
          unique(fallbackData.map((item) => item.paper))
        );
        fillSelect(
          categoryFilter,
          "categories",
          unique(fallbackData.map((item) => item.category))
        );
        render();
        return;
      } catch (fallbackError) {
        state.error = fallbackError.message;
      }
    } else {
      state.error = error.message;
    }

    state.loaded = false;
    updateStats([]);
    fillSelect(paperFilter, "papers", []);
    fillSelect(categoryFilter, "categories", []);
    render();
  }
};

roleButtons.forEach((btn) => {
  btn.addEventListener("click", () => setRole(btn.dataset.role));
});

paperFilter.addEventListener("change", (event) => {
  state.paper = event.target.value;
  render();
});

categoryFilter.addEventListener("change", (event) => {
  state.category = event.target.value;
  render();
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  render();
});

init();
