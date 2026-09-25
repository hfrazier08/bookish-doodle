(() => {
  const { SOURCES, CATEGORIES, RESEARCH } = window.CarSources;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const money = (n) =>
    Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—";
  const num = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "—");

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  // localStorage can throw (private mode, blocked storage) — never let that break the page.
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    },
  };

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  // ======================= SEARCH =======================

  const POPULAR_MAKES = [
    "Acura", "Alfa Romeo", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Fiat",
    "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Land Rover",
    "Lexus", "Lincoln", "Lucid", "Maserati", "Mazda", "Mercedes-Benz", "Mini", "Mitsubishi", "Nissan",
    "Polestar", "Porsche", "Ram", "Rivian", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo",
  ];

  const form = $("#search-form");
  const FIELDS = ["condition", "make", "model", "zip", "radius", "yearMin", "yearMax", "priceMin", "priceMax", "milesMax", "clRegion"];
  const FILTER_LABELS = {
    condition: "Condition",
    make: "Make",
    model: "Model",
    zip: "ZIP",
    radius: "Distance",
    year: "Year",
    price: "Price",
    miles: "Mileage",
  };

  $("#makes").innerHTML = POPULAR_MAKES.map((m) => `<option value="${m}">`).join("");
  $("#source-count").textContent = SOURCES.length;

  // Category toggles
  const savedCats = store.get("carscout.categories", CATEGORIES.map((c) => c.id));
  $("#category-picks").innerHTML = CATEGORIES.map(
    (c) => `<label class="chip-toggle"><input type="checkbox" value="${c.id}" ${savedCats.includes(c.id) ? "checked" : ""}/> ${c.label}</label>`
  ).join("");
  const selectedCategories = () => $$("#category-picks input:checked").map((i) => i.value);

  // Model suggestions from NHTSA's free vPIC API (CORS-enabled).
  const modelCache = {};
  async function loadModels(make) {
    const dl = $("#models");
    if (!make) {
      dl.innerHTML = "";
      return;
    }
    const key = make.toLowerCase();
    try {
      if (!modelCache[key]) {
        // Cars, SUVs (NHTSA calls them MPVs) and pickups are separate vehicle types.
        const responses = await Promise.all(
          ["car", "mpv", "truck"].map((type) =>
            fetch(
              `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/vehicletype/${type}?format=json`
            )
          )
        );
        const all = [];
        for (const r of responses) {
          if (r.ok) all.push(...((await r.json()).Results || []).map((x) => x.Model_Name));
        }
        modelCache[key] = [...new Set(all)].sort((a, b) => a.localeCompare(b));
      }
      dl.innerHTML = modelCache[key].map((m) => `<option value="${escapeHtml(m)}">`).join("");
    } catch {
      dl.innerHTML = ""; // offline or blocked — free-text entry still works
    }
  }
  let makeTimer;
  form.make.addEventListener("input", () => {
    clearTimeout(makeTimer);
    makeTimer = setTimeout(() => loadModels(form.make.value.trim()), 400);
  });

  function readCriteria() {
    const c = {};
    for (const f of FIELDS) c[f] = (form[f].value || "").trim();
    // Swap reversed ranges so every site gets a sane query.
    for (const [lo, hi] of [["yearMin", "yearMax"], ["priceMin", "priceMax"]]) {
      if (c[lo] && c[hi] && Number(c[lo]) > Number(c[hi])) [c[lo], c[hi]] = [c[hi], c[lo]];
    }
    return c;
  }

  function writeCriteria(c) {
    for (const f of FIELDS) if (c[f] !== undefined) form[f].value = c[f];
  }

  // Which of the user's filters were actually set, as filter keys used in sources.js.
  function activeFilters(c) {
    const on = new Set();
    if (c.condition && c.condition !== "any") on.add("condition");
    if (c.make) on.add("make");
    if (c.model) on.add("model");
    if (c.zip) {
      on.add("zip");
      on.add("radius");
    }
    if (c.yearMin || c.yearMax) on.add("year");
    if (c.priceMin || c.priceMax) on.add("price");
    if (c.milesMax) on.add("miles");
    return on;
  }

  function summarize(c) {
    const parts = [];
    const cond = { used: "Used", cpo: "Certified", new: "New", any: "New & used" }[c.condition];
    parts.push(`${cond} ${[c.make, c.model].filter(Boolean).join(" ") || "cars"}`);
    if (c.yearMin || c.yearMax) parts.push(`${c.yearMin || "any"}–${c.yearMax || "now"}`);
    if (c.priceMin || c.priceMax) parts.push(`${c.priceMin ? money(+c.priceMin) : "$0"}–${c.priceMax ? money(+c.priceMax) : "any price"}`);
    if (c.milesMax) parts.push(`under ${num(+c.milesMax)} mi`);
    if (c.zip) parts.push(`within ${c.radius} mi of ${c.zip}`);
    return parts.join(" · ");
  }

  let currentLinks = [];

  function renderResults(c) {
    const cats = selectedCategories();
    const on = activeFilters(c);
    const groups = $("#result-groups");
    currentLinks = [];
    groups.innerHTML = "";

    for (const cat of CATEGORIES) {
      if (!cats.includes(cat.id)) continue;
      const sources = SOURCES.filter((s) => s.category === cat.id);
      const cards = sources
        .map((s) => {
          const url = s.url(c);
          currentLinks.push(url);
          const chips = [...on]
            .map((f) => {
              const applied = s.filters.includes(f);
              return `<span class="chip ${applied ? "on" : "off"}" title="${applied ? "Applied in link" : "Set this filter on the site"}">${FILTER_LABELS[f]}</span>`;
            })
            .join("");
          return `
            <article class="source-card">
              <div class="source-top">
                <h4>${escapeHtml(s.name)}</h4>
                <a class="btn small primary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>
              </div>
              <p class="muted">${escapeHtml(s.blurb)}</p>
              ${chips ? `<div class="chips">${chips}</div>` : ""}
              ${s.note ? `<p class="note">${escapeHtml(s.note)}</p>` : ""}
            </article>`;
        })
        .join("");
      groups.insertAdjacentHTML(
        "beforeend",
        `<div class="group">
           <div class="group-head">
             <h3>${cat.label}</h3>
             <button type="button" class="btn small ghost" data-open-cat="${cat.id}">Open these ${sources.length}</button>
           </div>
           <div class="cards">${cards}</div>
         </div>`
      );
    }

    $("#research-links").innerHTML = RESEARCH.map(
      (r) => `<a class="btn small ghost" href="${escapeHtml(r.url(c))}" target="_blank" rel="noopener noreferrer">${r.name} ↗</a>`
    ).join("");

    $("#result-count").textContent = currentLinks.length;
    $("#result-summary").textContent = summarize(c);
    $("#results").hidden = false;
  }

  function openMany(urls) {
    let blocked = 0;
    for (const u of urls) {
      // Not passing "noopener" so a blocked pop-up is detectable (null); we cut the opener link ourselves.
      const w = window.open(u, "_blank");
      if (w) w.opener = null;
      else blocked++;
    }
    toast(blocked ? "Some tabs were blocked — allow pop-ups for this site." : `Opening ${urls.length} tabs…`);
  }

  $("#result-groups").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-cat]");
    if (!btn) return;
    const c = readCriteria();
    openMany(SOURCES.filter((s) => s.category === btn.dataset.openCat).map((s) => s.url(c)));
  });
  $("#open-all").addEventListener("click", () => openMany(currentLinks));

  function criteriaToQuery(c) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(c)) if (v) p.set(k, v);
    return p.toString();
  }

  $("#copy-link").addEventListener("click", async () => {
    const link = `${location.origin}${location.pathname}?${criteriaToQuery(readCriteria())}#results`;
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied — share it or bookmark it.");
    } catch {
      prompt("Copy this link:", link);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const c = readCriteria();
    writeCriteria(c);
    store.set("carscout.lastSearch", c);
    store.set("carscout.categories", selectedCategories());
    history.replaceState(null, "", `?${criteriaToQuery(c)}#results`);
    renderResults(c);
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#reset-search").addEventListener("click", () => {
    form.reset();
    $("#results").hidden = true;
    history.replaceState(null, "", location.pathname);
    store.set("carscout.lastSearch", null);
  });

  // Restore from share link, else last search.
  (() => {
    const params = new URLSearchParams(location.search);
    const fromUrl = {};
    for (const f of FIELDS) if (params.has(f)) fromUrl[f] = params.get(f);
    const c = Object.keys(fromUrl).length ? fromUrl : store.get("carscout.lastSearch", null);
    if (c) {
      writeCriteria(c);
      if (c.make) loadModels(c.make);
      renderResults(readCriteria());
    }
  })();

  // ======================= PAYMENT =======================

  const payForm = $("#payment-form");

  function monthlyPayment(principal, aprPct, months) {
    if (principal <= 0) return 0;
    const r = aprPct / 100 / 12;
    if (r === 0) return principal / months;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
  }

  // Invert the amortization formula: the loan a given payment supports.
  function principalFor(payment, aprPct, months) {
    const r = aprPct / 100 / 12;
    if (r === 0) return payment * months;
    return (payment * (1 - Math.pow(1 + r, -months))) / r;
  }

  function payInputs() {
    const v = (n) => Math.max(0, parseFloat(payForm[n].value) || 0);
    return {
      price: v("price"),
      down: v("down"),
      trade: v("trade"),
      tax: v("tax"),
      fees: v("fees"),
      apr: v("apr"),
      term: parseInt(payForm.term.value, 10),
      budget: v("budget"),
    };
  }

  // Most US states tax the price after trade-in credit; we use that as the default model.
  function financeFor(price, p) {
    const taxable = Math.max(0, price - p.trade);
    const otd = price + taxable * (p.tax / 100) + p.fees;
    const financed = Math.max(0, otd - p.down - p.trade);
    const monthly = monthlyPayment(financed, p.apr, p.term);
    return { otd, financed, monthly, interest: monthly * p.term - financed };
  }

  function updatePayment() {
    const p = payInputs();
    const f = financeFor(p.price, p);
    $("#pay-monthly").textContent = money(f.monthly);
    $("#pay-otd").textContent = money(f.otd);
    $("#pay-financed").textContent = money(f.financed);
    $("#pay-interest").textContent = money(f.interest);
    $("#pay-total").textContent = money(f.otd + f.interest);

    // Solve for car price: financed = price*(1+tax) - trade*tax + fees - down - trade  (when price >= trade)
    const t = p.tax / 100;
    const maxFinanced = principalFor(p.budget, p.apr, p.term);
    const maxPrice = (maxFinanced + p.down + p.trade + p.trade * t - p.fees) / (1 + t);
    $("#pay-afford").textContent = p.budget ? money(Math.max(0, maxPrice)) : "—";

    store.set("carscout.payment", p);
    renderShortlist();
  }

  (() => {
    const saved = store.get("carscout.payment", null);
    if (saved) for (const [k, v] of Object.entries(saved)) if (payForm[k]) payForm[k].value = v;
  })();
  payForm.addEventListener("input", updatePayment);

  // ======================= SHORTLIST =======================

  let shortlist = store.get("carscout.shortlist", []);
  let sortKey = null;
  let sortDir = 1;

  function renderShortlist() {
    const p = payInputs();
    const rows = shortlist.map((item) => ({ ...item, monthly: financeFor(item.price, p).monthly }));
    if (sortKey) {
      rows.sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (typeof av === "string" || typeof bv === "string") return String(av || "").localeCompare(String(bv || "")) * sortDir;
        return ((av ?? Infinity) - (bv ?? Infinity)) * sortDir;
      });
    }
    const minPrice = Math.min(...rows.map((r) => r.price));
    $("#shortlist-table tbody").innerHTML = rows
      .map((r) => {
        let host = "";
        try {
          host = new URL(r.url).hostname.replace(/^www\./, "");
        } catch {}
        return `<tr>
          <td><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.title)}</a>
            <div class="muted small">${escapeHtml(host)}</div></td>
          <td class="num ${r.price === minPrice && rows.length > 1 ? "best" : ""}">${money(r.price)}</td>
          <td class="num">${num(r.miles)}</td>
          <td class="num">${r.year ?? "—"}</td>
          <td class="num">${r.distance ?? "—"}</td>
          <td class="num">${money(r.monthly)}</td>
          <td>${escapeHtml(r.notes || "")}</td>
          <td><button class="btn small ghost" data-remove="${r.id}" aria-label="Remove ${escapeHtml(r.title)}">✕</button></td>
        </tr>`;
      })
      .join("");
    $("#shortlist-empty").hidden = rows.length > 0;
    $$("#shortlist-table th[data-sort]").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.sort === sortKey);
      th.dataset.dir = th.dataset.sort === sortKey ? (sortDir > 0 ? "asc" : "desc") : "";
    });
  }

  const optNum = (v) => (v === "" || v == null ? null : Number(v));

  $("#shortlist-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    shortlist.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      url: f.url.value.trim(),
      title: f.title.value.trim(),
      price: Number(f.price.value),
      miles: optNum(f.miles.value),
      year: optNum(f.year.value),
      distance: optNum(f.distance.value),
      notes: f.notes.value.trim(),
    });
    store.set("carscout.shortlist", shortlist);
    f.reset();
    renderShortlist();
    toast("Added to shortlist.");
  });

  $("#shortlist-table").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) {
      shortlist = shortlist.filter((s) => s.id !== rm.dataset.remove);
      store.set("carscout.shortlist", shortlist);
      renderShortlist();
      return;
    }
    const th = e.target.closest("th[data-sort]");
    if (th) {
      if (sortKey === th.dataset.sort) sortDir = -sortDir;
      else {
        sortKey = th.dataset.sort;
        sortDir = 1;
      }
      renderShortlist();
    }
  });

  $("#export-csv").addEventListener("click", () => {
    if (!shortlist.length) return toast("Shortlist is empty.");
    const cols = ["title", "price", "miles", "year", "distance", "notes", "url"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...shortlist.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "car-shortlist.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ======================= VIN & RECALLS =======================

  const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/; // VINs never contain I, O or Q

  $("#vin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("#vin-result");
    const vin = e.target.vin.value.trim().toUpperCase();
    e.target.vin.value = vin;
    if (!VIN_RE.test(vin)) {
      out.innerHTML = `<p class="error">That isn't a valid VIN — it must be 17 letters/numbers and never contains I, O or Q.</p>`;
      return;
    }
    out.innerHTML = `<p class="muted">Decoding…</p>`;
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`);
      const d = (await res.json()).Results[0];
      const rows = [
        ["Year", d.ModelYear],
        ["Make", d.Make],
        ["Model", d.Model],
        ["Trim", [d.Trim, d.Series].filter(Boolean).join(" ")],
        ["Body", d.BodyClass],
        ["Engine", [d.DisplacementL && `${(+d.DisplacementL).toFixed(1)}L`, d.EngineCylinders && `${d.EngineCylinders}-cyl`, d.FuelTypePrimary].filter(Boolean).join(" · ")],
        ["Drive", d.DriveType],
        ["Transmission", d.TransmissionStyle],
        ["Built in", [d.PlantCity, d.PlantCountry].filter(Boolean).join(", ")],
      ].filter(([, v]) => v);
      const warn = d.ErrorCode && d.ErrorCode !== "0" ? `<p class="warn">NHTSA note: ${escapeHtml(d.ErrorText)}</p>` : "";
      out.innerHTML =
        warn +
        `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>` +
        (d.ModelYear && d.Make && d.Model
          ? `<button type="button" class="btn small ghost" id="vin-to-recall">Check recalls for this car →</button>`
          : "");
      const btn = $("#vin-to-recall");
      if (btn)
        btn.addEventListener("click", () => {
          const rf = $("#recall-form");
          rf.year.value = d.ModelYear;
          rf.make.value = d.Make;
          rf.model.value = d.Model;
          rf.requestSubmit();
        });
    } catch {
      out.innerHTML = `<p class="error">Couldn't reach NHTSA right now. Try again, or use
        <a href="https://vpic.nhtsa.dot.gov/decoder/Decoder?VIN=${vin}" target="_blank" rel="noopener">their decoder directly</a>.</p>`;
    }
  });

  $("#recall-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const out = $("#recall-result");
    const year = f.year.value.trim(), make = f.make.value.trim(), model = f.model.value.trim();
    out.innerHTML = `<p class="muted">Checking…</p>`;
    const qs = `make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
    try {
      const res = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?${qs}`);
      const data = await res.json();
      const list = data.results || [];
      if (!list.length) {
        out.innerHTML = `<p class="ok">No recalls found for a ${escapeHtml(`${year} ${make} ${model}`)}.</p>
          <p class="muted small">Model names must match NHTSA's (e.g. “CR-V”, “F-150”).</p>`;
        return;
      }
      out.innerHTML =
        `<p class="warn"><strong>${list.length} recall${list.length > 1 ? "s" : ""}</strong> for a ${escapeHtml(`${year} ${make} ${model}`)}.
          Ask the seller for proof each was fixed, or check the VIN at
          <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">nhtsa.gov/recalls</a>.</p>` +
        list
          .map(
            (r) => `<details class="recall">
              <summary><strong>${escapeHtml(r.Component)}</strong> <span class="muted small">${escapeHtml(r.ReportReceivedDate || "")} · #${escapeHtml(r.NHTSACampaignNumber)}</span></summary>
              <p>${escapeHtml(r.Summary)}</p>
              ${r.Remedy ? `<p><strong>Fix:</strong> ${escapeHtml(r.Remedy)}</p>` : ""}
            </details>`
          )
          .join("");
    } catch {
      out.innerHTML = `<p class="error">Couldn't reach NHTSA right now. Try
        <a href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">nhtsa.gov/recalls</a> directly.</p>`;
    }
  });

  // ======================= CHECKLIST =======================

  const CHECKLIST = [
    ["Budget", "Set a total budget — aim for all car costs (payment, insurance, fuel) under ~15–20% of take-home pay."],
    ["Budget", "Get pre-approved for a loan at a bank or credit union so you have a rate to beat."],
    ["Budget", "Get insurance quotes for the models you're considering."],
    ["Research", "Shortlist 2–3 models and check reliability, owner complaints and safety ratings."],
    ["Research", "Look up the fair market value (KBB, Edmunds) for the trim, year and mileage you want."],
    ["Search", "Search every site above and save good candidates to your shortlist."],
    ["Search", "Get your trade-in's value from CarMax, Carvana and KBB Instant Cash Offer before a dealer quotes it."],
    ["Vet the car", "Get the VIN and run a history report (NMVTIS / CARFAX / AutoCheck). Check for open recalls."],
    ["Vet the car", "Ask for maintenance records and confirm the title is clean and in the seller's name."],
    ["Vet the car", "Test drive: cold start, highway speed, braking, every button and the A/C."],
    ["Vet the car", "Pay for a pre-purchase inspection by an independent mechanic (~$100–200)."],
    ["Deal", "Negotiate the out-the-door price by email with several sellers — not the monthly payment."],
    ["Deal", "Decline add-ons you didn't ask for (paint protection, VIN etching, nitrogen, etc.)."],
    ["Deal", "Read every line of the contract; confirm the APR, term and price match what you agreed."],
    ["After", "Transfer title and registration, add the car to your insurance, and schedule any recall repairs."],
  ];

  let checked = store.get("carscout.checklist", []);

  function renderChecklist() {
    let lastGroup = "";
    $("#checklist-list").innerHTML = CHECKLIST.map(([group, text], i) => {
      const head = group !== lastGroup ? `<h4>${group}</h4>` : "";
      lastGroup = group;
      return `${head}<label class="check"><input type="checkbox" data-i="${i}" ${checked.includes(i) ? "checked" : ""}/> <span>${text}</span></label>`;
    }).join("");
    $("#checklist-bar").style.width = `${(checked.length / CHECKLIST.length) * 100}%`;
  }

  $("#checklist-list").addEventListener("change", (e) => {
    const i = Number(e.target.dataset.i);
    checked = e.target.checked ? [...new Set([...checked, i])] : checked.filter((x) => x !== i);
    store.set("carscout.checklist", checked);
    $("#checklist-bar").style.width = `${(checked.length / CHECKLIST.length) * 100}%`;
  });

  renderChecklist();
  updatePayment(); // also renders the shortlist
})();
