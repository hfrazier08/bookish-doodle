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
    renderLinks(c);
    $("#results").hidden = false;
    loadListings(c, true);
  }

  // Rebuild every site link from the given criteria.
  function renderLinks(c) {
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
          currentLinks.push({ name: s.name, url });
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
  }

  // Keep the links in sync with the form, so a link never carries stale details
  // when the buyer edits the form after searching without pressing search again.
  let linkTimer;
  function syncLinks() {
    if ($("#results").hidden) return;
    clearTimeout(linkTimer);
    linkTimer = setTimeout(() => {
      const c = readCriteria();
      renderLinks(c);
      store.set("carscout.lastSearch", c);
      history.replaceState(null, "", `?${criteriaToQuery(c)}${location.hash}`);
    }, 200);
  }
  form.addEventListener("input", syncLinks);
  form.addEventListener("change", syncLinks);

  // ---------- Opening sites without fighting pop-up blockers ----------
  //
  // Browsers allow one new tab per click, and some (in-app browsers, sandboxed frames) allow none.
  // Every external link goes through tryOpen(): if the tab is blocked we explain how to allow
  // pop-ups and offer to open the site in this tab. "Open all" steps through sites one tap each.

  const opener = $("#opener");
  const openerState = { items: [], next: 0 };

  function tryOpen(url) {
    // Not passing "noopener" so a blocked tab is detectable (null); we cut the opener link ourselves.
    const w = window.open(url, "_blank");
    if (!w) return false;
    try {
      w.opener = null;
    } catch {}
    return true;
  }

  function openHere(url) {
    try {
      window.top.location.href = url; // escape any frame this page is shown in
    } catch {
      location.href = url;
    }
  }

  function popupHelpHtml() {
    const ua = navigator.userAgent;
    let steps;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
      steps = "On iPhone or iPad, open the <strong>Settings</strong> app → <strong>Apps</strong> → <strong>Safari</strong> and turn off <strong>Block Pop-ups</strong>.";
    } else if (/Android/.test(ua)) {
      steps = "In Chrome, tap <strong>Always show</strong> on the \u201cpop-up blocked\u201d message, or tap <strong>⋮</strong> → <strong>Settings</strong> → <strong>Site settings</strong> → <strong>Pop-ups and redirects</strong> and allow this site.";
    } else if (/Firefox\//.test(ua)) {
      steps = "Click <strong>Settings</strong> (or <strong>Options</strong>) on the yellow bar at the top of the page, then <strong>Allow pop-ups for this site</strong>.";
    } else if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) {
      steps = "Go to <strong>Safari</strong> → <strong>Settings</strong> → <strong>Websites</strong> → <strong>Pop-up Windows</strong> and set this site to <strong>Allow</strong>.";
    } else {
      steps = "Click the blocked pop-up icon at the right end of the address bar, choose <strong>Always allow pop-ups and redirects</strong> from this site, then <strong>Done</strong>.";
    }
    const framed = window.top !== window.self;
    return `<p><strong>Your browser blocked the new tab.</strong> ${steps}</p>
      ${framed ? `<p class="small">If you're viewing CarScout inside another app or page, open it directly in your browser instead.</p>` : ""}
      <p class="small">Or open the site in this tab instead. Press Back to return here.</p>`;
  }

  function renderOpener() {
    const { items, next } = openerState;
    const done = next >= items.length;
    $("#opener-next").textContent = done
      ? "All done ✓"
      : `Open ${items[next].name} ↗  (${next + 1} of ${items.length})`;
    $("#opener-next").disabled = done;
    $("#opener-list").innerHTML = items
      .map(
        (it, i) => `<li class="${i < next ? "done" : ""}">
          <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer" data-idx="${i}">${escapeHtml(it.name)}</a>
          <button type="button" class="btn small ghost" data-here="${i}">Open here</button>
        </li>`
      )
      .join("");
  }

  function showBlocked(show) {
    const help = $("#popup-help");
    help.hidden = !show;
    if (show) help.innerHTML = popupHelpHtml();
  }

  function showOpener(items, title) {
    openerState.items = items;
    openerState.next = 0;
    $("#opener-title").textContent = title;
    $("#opener-sub").hidden = items.length < 2;
    showBlocked(false);
    renderOpener();
    if (!opener.open) opener.showModal();
  }

  // Open the next site in the queue. Runs inside a click, so the browser allows exactly one tab.
  function openNext() {
    const it = openerState.items[openerState.next];
    if (!it) return;
    if (tryOpen(it.url)) {
      openerState.next++;
      showBlocked(false);
      renderOpener();
    } else {
      showBlocked(true);
    }
  }

  function openSites(items, title) {
    showOpener(items, title);
    openNext(); // the click that got us here can open the first site
  }

  $("#opener-next").addEventListener("click", openNext);
  opener.addEventListener("click", (e) => {
    if (e.target === opener || e.target.closest("[data-close]")) return opener.close();
    const here = e.target.closest("[data-here]");
    if (here) openHere(openerState.items[Number(here.dataset.here)].url);
  });
  $("#opener-copy").addEventListener("click", async () => {
    const text = openerState.items.map((it) => `${it.name}: ${it.url}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("Links copied.");
    } catch {
      prompt("Copy these links:", text);
    }
  });

  // Every new-tab link on the page goes through tryOpen so a blocked tab is never silent.
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[target="_blank"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const inOpener = opener.contains(a);
    if (tryOpen(a.href)) {
      if (inOpener && Number(a.dataset.idx) >= openerState.next) {
        openerState.next = Number(a.dataset.idx) + 1;
        renderOpener();
      }
      if (inOpener) showBlocked(false);
      return;
    }
    if (!inOpener) {
      const name = (a.closest(".source-card, .listing")?.querySelector("h4")?.textContent || a.textContent).replace("↗", "").trim();
      showOpener([{ name, url: a.href }], `Open ${name}`);
    }
    showBlocked(true);
  });

  $("#result-groups").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-cat]");
    if (!btn) return;
    const c = readCriteria();
    const cat = CATEGORIES.find((x) => x.id === btn.dataset.openCat);
    openSites(
      SOURCES.filter((s) => s.category === cat.id).map((s) => ({ name: s.name, url: s.url(c) })),
      cat.label
    );
  });
  $("#open-all").addEventListener("click", () => openSites(currentLinks, `Open all ${currentLinks.length} sites`));

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

  // ======================= LISTINGS (MarketCheck) =======================
  //
  // Car sites block other pages from reading their inventory, so real listings come from
  // MarketCheck's licensed API, which aggregates US dealer inventory and allows browser (CORS) calls.
  // The buyer supplies their own API key; it never leaves their browser except to MarketCheck.

  const MC_URL = "https://mc-api.marketcheck.com/v2/search/car/active";
  const PAGE_SIZE = 48;
  const listingsState = { criteria: null, start: 0, total: 0, items: [], requestId: 0 };

  const getKey = () => store.get("carscout.mcKey", "");

  function marketcheckParams(c, start) {
    const p = new URLSearchParams({ api_key: getKey(), rows: PAGE_SIZE, start });
    if (c.make) p.set("make", c.make);
    if (c.model) p.set("model", c.model);
    const carType = { used: "used", cpo: "certified", new: "new" }[c.condition];
    if (carType) p.set("car_type", carType);
    if (c.zip) {
      p.set("zip", c.zip);
      p.set("radius", c.radius || 50);
    }
    if (c.yearMin || c.yearMax) p.set("year_range", `${c.yearMin || 1900}-${c.yearMax || new Date().getFullYear() + 1}`);
    if (c.priceMin || c.priceMax) p.set("price_range", `${c.priceMin || 0}-${c.priceMax || 10000000}`);
    if (c.milesMax) p.set("miles_range", `0-${c.milesMax}`);
    const [sortBy, order] = $("#listings-sort").value.split(":");
    if (sortBy && !(sortBy === "dist" && !c.zip)) {
      p.set("sort_by", sortBy);
      p.set("sort_order", order);
    }
    return p;
  }

  function showKeyForm(show) {
    $("#key-form").hidden = !show;
    $("#key-remove").hidden = !getKey();
    if (show) $("#key-form").key.value = getKey();
  }

  async function loadListings(c, reset) {
    const status = $("#listings-status");
    const grid = $("#listings-grid");
    const more = $("#listings-more");

    if (reset) {
      listingsState.criteria = c;
      listingsState.start = 0;
      listingsState.items = [];
      grid.innerHTML = "";
    }
    more.hidden = true;

    if (!getKey()) {
      $("#listings-title").textContent = "Listings with photos";
      $("#listings-controls").hidden = true;
      status.textContent = "";
      showKeyForm(true);
      return;
    }
    showKeyForm(false);
    $("#listings-controls").hidden = false;

    // Ignore responses that arrive after a newer search started.
    const id = ++listingsState.requestId;
    status.textContent = reset ? "Loading listings…" : "Loading more…";
    if (reset) grid.innerHTML = Array.from({ length: 8 }, () => `<div class="listing skeleton"></div>`).join("");

    try {
      const res = await fetch(`${MC_URL}?${marketcheckParams(listingsState.criteria, listingsState.start)}`);
      if (id !== listingsState.requestId) return;
      if (res.status === 401 || res.status === 403) {
        grid.innerHTML = "";
        status.innerHTML = `<span class="error">MarketCheck didn't accept that API key.</span>`;
        showKeyForm(true);
        return;
      }
      if (res.status === 429) throw new Error("You've reached your MarketCheck plan's request limit. Try again later.");
      if (!res.ok) throw new Error(`MarketCheck returned an error (${res.status}).`);
      const data = await res.json();
      if (id !== listingsState.requestId) return;

      const fresh = (data.listings || []).map(normalizeListing);
      listingsState.items.push(...fresh);
      listingsState.total = data.num_found || listingsState.items.length;
      listingsState.start += PAGE_SIZE;
      renderListings();
    } catch (err) {
      if (id !== listingsState.requestId) return;
      if (reset) grid.innerHTML = "";
      status.innerHTML = `<span class="error">${escapeHtml(
        err instanceof TypeError ? "Couldn't reach MarketCheck. Check your connection and try again." : err.message
      )}</span>`;
    }
  }

  function normalizeListing(l) {
    const b = l.build || {};
    const d = l.dealer || {};
    return {
      id: l.id,
      vin: l.vin,
      title: l.heading || [b.year, b.make, b.model, b.trim].filter(Boolean).join(" "),
      year: b.year ?? null,
      make: b.make,
      model: b.model,
      trim: b.trim,
      price: Number(l.price) || null,
      miles: Number.isFinite(Number(l.miles)) && l.miles !== null ? Number(l.miles) : null,
      photo: (l.media && l.media.photo_links && l.media.photo_links[0]) || "",
      photoCount: (l.media && l.media.photo_links && l.media.photo_links.length) || 0,
      url: l.vdp_url,
      source: l.source || "",
      dealer: d.name || "",
      place: [d.city, d.state].filter(Boolean).join(", "),
      dist: Number.isFinite(Number(l.dist)) && l.dist !== null ? Math.round(Number(l.dist)) : null,
      daysOnMarket: l.dom ?? null,
      oneOwner: !!l.carfax_1_owner,
      cleanTitle: !!l.carfax_clean_title,
      specs: [b.body_type, b.drivetrain, b.transmission, b.fuel_type].filter(Boolean),
    };
  }

  // Compare each car to the median price of similar results (same year/make/model) to flag good deals.
  function dealBadges(items) {
    const groups = {};
    for (const it of items) {
      if (!it.price) continue;
      (groups[`${it.year}|${it.make}|${it.model}`] ||= []).push(it.price);
    }
    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const out = new Map();
    for (const it of items) {
      const prices = groups[`${it.year}|${it.make}|${it.model}`];
      if (!it.price || !prices || prices.length < 4) continue;
      const diff = it.price - median(prices);
      const pct = diff / median(prices);
      if (pct <= -0.05) out.set(it, { cls: "good", text: `${money(-diff)} below similar` });
      else if (pct >= 0.1) out.set(it, { cls: "high", text: `${money(diff)} above similar` });
    }
    return out;
  }

  function renderListings() {
    const { items, total } = listingsState;
    const grid = $("#listings-grid");
    const badges = dealBadges(items);

    $("#listings-title").textContent = total
      ? `${num(total)} listing${total === 1 ? "" : "s"} found`
      : "Listings";
    $("#listings-status").textContent = items.length
      ? `Showing ${num(items.length)} of ${num(total)} dealer listings. Photos and prices come from each dealer's own listing.`
      : "No dealer listings match. Try widening the distance, price or year range.";

    grid.innerHTML = items
      .map((it, i) => {
        const badge = badges.get(it);
        const tags = [
          it.oneOwner && `<span class="tag">1 owner</span>`,
          it.cleanTitle && `<span class="tag">Clean title</span>`,
          badge && `<span class="tag ${badge.cls}">${badge.text}</span>`,
        ].filter(Boolean).join("");
        const meta = [
          it.miles !== null && `${num(it.miles)} mi`,
          it.dist !== null && `${it.dist} mi away`,
          it.daysOnMarket !== null && `${it.daysOnMarket} days listed`,
        ].filter(Boolean).join(" · ");
        return `
          <article class="listing">
            <a class="listing-photo" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">
              ${it.photo
                ? `<img src="${escapeHtml(it.photo)}" alt="${escapeHtml(it.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'no-photo',textContent:'No photo'}))" />`
                : `<span class="no-photo">No photo</span>`}
              ${it.photoCount > 1 ? `<span class="photo-count">📷 ${it.photoCount}</span>` : ""}
            </a>
            <div class="listing-body">
              <div class="listing-price">${it.price ? money(it.price) : "Call for price"}</div>
              <h4><a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title)}</a></h4>
              <p class="muted small">${escapeHtml(meta)}</p>
              ${tags ? `<div class="tags">${tags}</div>` : ""}
              <p class="muted small listing-dealer">${escapeHtml([it.dealer, it.place].filter(Boolean).join(" — "))}</p>
              <div class="listing-actions">
                <a class="btn small primary" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">View listing ↗</a>
                <button type="button" class="btn small ghost" data-save="${i}">♡ Save</button>
              </div>
            </div>
          </article>`;
      })
      .join("");

    $("#listings-more").hidden = items.length >= total;
  }

  $("#listings-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-save]");
    if (!btn) return;
    const it = listingsState.items[Number(btn.dataset.save)];
    if (!it || !it.price) return toast("This listing has no price to compare.");
    addToShortlist({
      url: it.url,
      title: it.title,
      price: it.price,
      miles: it.miles,
      year: it.year,
      distance: it.dist,
      notes: [it.dealer, it.place, it.vin && `VIN ${it.vin}`].filter(Boolean).join(" · "),
    });
    btn.textContent = "♥ Saved";
    btn.disabled = true;
  });

  $("#listings-more").addEventListener("click", () => loadListings(listingsState.criteria, false));
  $("#listings-sort").addEventListener("change", () => {
    if (listingsState.criteria) loadListings(listingsState.criteria, true);
  });
  $("#listings-key-change").addEventListener("click", () => showKeyForm($("#key-form").hidden));

  $("#key-form").addEventListener("submit", (e) => {
    e.preventDefault();
    store.set("carscout.mcKey", e.target.key.value.trim());
    loadListings(listingsState.criteria || readCriteria(), true);
  });
  $("#key-remove").addEventListener("click", () => {
    store.set("carscout.mcKey", "");
    listingsState.requestId++;
    loadListings(listingsState.criteria || readCriteria(), true);
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

  function addToShortlist(item) {
    if (shortlist.some((s) => s.url === item.url)) return toast("Already on your shortlist.");
    shortlist.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...item });
    store.set("carscout.shortlist", shortlist);
    renderShortlist();
    toast("Added to shortlist.");
  }

  $("#shortlist-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    addToShortlist({
      url: f.url.value.trim(),
      title: f.title.value.trim(),
      price: Number(f.price.value),
      miles: optNum(f.miles.value),
      year: optNum(f.year.value),
      distance: optNum(f.distance.value),
      notes: f.notes.value.trim(),
    });
    f.reset();
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
