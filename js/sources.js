// Car marketplaces and research sites, with a URL builder for each.
//
// Most sites don't offer a public search API and block cross-origin requests,
// so instead of scraping we build a deep link into each site's own search,
// pre-filled with as many of the buyer's filters as that site accepts in its URL.
//
// `filters` lists which criteria each link actually carries, so the UI can be
// honest about which results still need refining on the destination site.

const slug = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleCase = (s) =>
  String(s || "")
    .trim()
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

const enc = encodeURIComponent;

// Build a query string, dropping empty values.
function qs(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${k}=${enc(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// "Honda Civic" / "Honda" / "cars" — used by keyword-only sites.
function keywords(c) {
  const q = [c.make, c.model].filter(Boolean).join(" ").trim();
  return q || "cars";
}

function conditionPath(c, { used = "used", new: nw = "new", any = "all" } = {}) {
  if (c.condition === "used" || c.condition === "cpo") return used;
  if (c.condition === "new") return nw;
  return any;
}

const CATEGORIES = [
  { id: "aggregator", label: "Big marketplaces & aggregators" },
  { id: "online", label: "Online retailers (delivery / no haggle)" },
  { id: "private", label: "Private sellers" },
  { id: "rental", label: "Ex-rental & fleet sellers" },
  { id: "auction", label: "Auctions & enthusiast" },
  { id: "classic", label: "Classic & collector" },
];

const SOURCES = [
  // ---------- Aggregators ----------
  {
    id: "autotempest",
    name: "AutoTempest",
    category: "aggregator",
    blurb: "Meta-search across many listing sites at once.",
    filters: ["make", "model", "zip", "radius", "year", "price", "miles"],
    url: (c) =>
      "https://www.autotempest.com/results" +
      qs({
        make: slug(c.make),
        model: slug(c.model),
        zip: c.zip,
        radius: c.radius,
        minyear: c.yearMin,
        maxyear: c.yearMax,
        minprice: c.priceMin,
        maxprice: c.priceMax,
        maxmiles: c.milesMax,
      }),
  },
  {
    id: "autotrader",
    name: "Autotrader",
    category: "aggregator",
    blurb: "One of the largest dealer + private inventories.",
    filters: ["condition", "make", "model", "zip", "radius", "year", "price", "miles"],
    url: (c) => {
      const path = [conditionPath(c, { used: "used-cars", new: "new-cars", any: "all-cars" })];
      if (c.make) path.push(slug(c.make));
      if (c.make && c.model) path.push(slug(c.model));
      return (
        `https://www.autotrader.com/cars-for-sale/${path.join("/")}` +
        qs({
          zip: c.zip,
          searchRadius: c.radius,
          startYear: c.yearMin,
          endYear: c.yearMax,
          minPrice: c.priceMin,
          maxPrice: c.priceMax,
          mileage: c.milesMax,
        })
      );
    },
  },
  {
    id: "carscom",
    name: "Cars.com",
    category: "aggregator",
    blurb: "Huge dealer inventory with price-drop history.",
    filters: ["condition", "make", "model", "zip", "radius", "year", "price", "miles"],
    url: (c) => {
      const stock = { used: "used", cpo: "cpo", new: "new" }[c.condition] || "all";
      const p = [
        ["stock_type", stock],
        ["zip", c.zip],
        ["maximum_distance", c.radius],
        ["year_min", c.yearMin],
        ["year_max", c.yearMax],
        ["list_price_min", c.priceMin],
        ["list_price_max", c.priceMax],
        ["mileage_max", c.milesMax],
      ];
      if (c.make) p.push(["makes[]", slug(c.make)]);
      if (c.make && c.model) p.push(["models[]", `${slug(c.make)}-${slug(c.model)}`]);
      const q = p.filter(([, v]) => v).map(([k, v]) => `${k}=${enc(v)}`).join("&");
      return `https://www.cars.com/shopping/results/?${q}`;
    },
  },
  {
    id: "cargurus",
    name: "CarGurus",
    category: "aggregator",
    blurb: "Rates every listing from Great Deal to Overpriced.",
    filters: ["zip", "radius", "price", "miles", "year"],
    note: "Pick make/model on CarGurus — it uses internal IDs.",
    url: (c) =>
      "https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action" +
      qs({
        zip: c.zip,
        distance: c.radius,
        startYear: c.yearMin,
        endYear: c.yearMax,
        minPrice: c.priceMin,
        maxPrice: c.priceMax,
        maxMileage: c.milesMax,
      }),
  },
  {
    id: "truecar",
    name: "TrueCar",
    category: "aggregator",
    blurb: "Shows what others near you actually paid.",
    filters: ["condition", "make", "model", "zip", "radius", "year", "price"],
    url: (c) => {
      const base = c.condition === "new" ? "new-cars-for-sale" : "used-cars-for-sale";
      const path = ["listings"];
      if (c.make) path.push(slug(c.make));
      if (c.make && c.model) path.push(slug(c.model));
      if (c.zip) path.push(`location-${c.zip}`);
      return (
        `https://www.truecar.com/${base}/${path.join("/")}/` +
        qs({
          searchRadius: c.radius,
          yearLow: c.yearMin,
          yearHigh: c.yearMax,
          priceLow: c.priceMin,
          priceHigh: c.priceMax,
          mileageHigh: c.milesMax,
        })
      );
    },
  },
  {
    id: "edmunds",
    name: "Edmunds",
    category: "aggregator",
    blurb: "Inventory plus expert reviews and True Market Value.",
    filters: ["condition", "make", "model", "zip", "radius"],
    url: (c) =>
      "https://www.edmunds.com/inventory/srp.html" +
      qs({
        inventorytype: { used: "used", cpo: "cpo", new: "new" }[c.condition] || "used,cpo,new",
        make: slug(c.make),
        model: c.make && c.model ? `${slug(c.make)}|${slug(c.model)}` : "",
        zip: c.zip,
        radius: c.radius,
      }),
  },
  {
    id: "kbb",
    name: "Kelley Blue Book",
    category: "aggregator",
    blurb: "Listings side-by-side with KBB fair price ranges.",
    filters: ["condition", "make", "model", "zip", "radius", "year", "price", "miles"],
    url: (c) => {
      const path = [conditionPath(c, { used: "used", new: "new", any: "all" })];
      if (c.make) path.push(slug(c.make));
      if (c.make && c.model) path.push(slug(c.model));
      return (
        `https://www.kbb.com/cars-for-sale/${path.join("/")}` +
        qs({
          zip: c.zip,
          searchRadius: c.radius,
          startYear: c.yearMin,
          endYear: c.yearMax,
          minPrice: c.priceMin,
          maxPrice: c.priceMax,
          mileage: c.milesMax,
        })
      );
    },
  },
  {
    id: "autolist",
    name: "Autolist",
    category: "aggregator",
    blurb: "Clean aggregator with price history on listings.",
    filters: ["make", "model", "zip", "radius", "year", "price", "miles"],
    url: (c) =>
      "https://www.autolist.com/listings#" +
      qs({
        make: titleCase(c.make),
        model: titleCase(c.model),
        zip: c.zip,
        radius: c.radius,
        year_min: c.yearMin,
        year_max: c.yearMax,
        price_min: c.priceMin,
        price_max: c.priceMax,
        mileage_max: c.milesMax,
      }).slice(1),
  },
  {
    id: "carsdirect",
    name: "CarsDirect",
    category: "aggregator",
    blurb: "Dealer listings plus current incentives.",
    filters: ["make", "model", "zip"],
    url: (c) => {
      const path = ["used_cars", "listings"];
      if (c.make) path.push(slug(c.make));
      if (c.make && c.model) path.push(slug(c.model));
      return `https://www.carsdirect.com/${path.join("/")}` + qs({ zipcode: c.zip });
    },
  },
  {
    id: "carfax",
    name: "CARFAX Used Cars",
    category: "aggregator",
    blurb: "Every listing comes with a free CARFAX report.",
    filters: [],
    note: "Enter your search on CARFAX.",
    url: () => "https://www.carfax.com/cars-for-sale",
  },

  // ---------- Online retailers ----------
  {
    id: "carvana",
    name: "Carvana",
    category: "online",
    blurb: "Buy online, 7-day return, home delivery.",
    filters: ["make", "model"],
    url: (c) => {
      if (c.make && c.model) return `https://www.carvana.com/cars/${slug(c.make)}-${slug(c.model)}`;
      if (c.make) return `https://www.carvana.com/cars/${slug(c.make)}`;
      return "https://www.carvana.com/cars";
    },
  },
  {
    id: "carmax",
    name: "CarMax",
    category: "online",
    blurb: "No-haggle prices, 30-day money-back guarantee.",
    filters: ["make", "model"],
    url: (c) => {
      const path = ["cars"];
      if (c.make) path.push(slug(c.make));
      if (c.make && c.model) path.push(slug(c.model));
      return `https://www.carmax.com/${path.join("/")}`;
    },
  },
  {
    id: "autonation",
    name: "AutoNation",
    category: "online",
    blurb: "Largest US dealer group, online buying.",
    filters: ["condition", "make", "model"],
    url: (c) => {
      const cond = c.condition === "new" ? "new" : "used";
      const path = [`${cond}-cars`];
      if (c.make) path.push(slug(c.make));
      if (c.make && c.model) path.push(slug(c.model));
      return `https://www.autonation.com/${path.join("/")}`;
    },
  },
  {
    id: "carbravo",
    name: "CarBravo (GM)",
    category: "online",
    blurb: "GM's certified used marketplace, all brands.",
    filters: [],
    note: "Enter your search on CarBravo.",
    url: () => "https://www.carbravo.com/",
  },

  // ---------- Private sellers ----------
  {
    id: "fbmarketplace",
    name: "Facebook Marketplace",
    category: "private",
    blurb: "Largest source of private-party cars.",
    filters: ["make", "model", "year", "price", "miles"],
    note: "Set your location on Facebook.",
    url: (c) =>
      "https://www.facebook.com/marketplace/category/search/" +
      qs({
        query: keywords(c),
        category_id: "vehicles",
        minYear: c.yearMin,
        maxYear: c.yearMax,
        minPrice: c.priceMin,
        maxPrice: c.priceMax,
        maxMileage: c.milesMax,
        exact: "false",
      }),
  },
  {
    id: "craigslist",
    name: "Craigslist",
    category: "private",
    blurb: "Local private and dealer ads.",
    filters: ["make", "model", "zip", "radius", "year", "price", "miles"],
    note: "Uses the Craigslist region you set under More options.",
    url: (c) => {
      const region = slug(c.clRegion);
      if (!region) return "https://www.craigslist.org/about/sites";
      return (
        `https://${region}.craigslist.org/search/cta` +
        qs({
          query: keywords(c) === "cars" ? "" : keywords(c),
          postal: c.zip,
          search_distance: c.radius,
          min_auto_year: c.yearMin,
          max_auto_year: c.yearMax,
          min_price: c.priceMin,
          max_price: c.priceMax,
          max_auto_miles: c.milesMax,
        })
      );
    },
  },
  {
    id: "offerup",
    name: "OfferUp",
    category: "private",
    blurb: "Local marketplace app with many private cars.",
    filters: ["make", "model", "price"],
    url: (c) =>
      "https://offerup.com/search" +
      qs({ q: keywords(c), PRICE_MIN: c.priceMin, PRICE_MAX: c.priceMax }),
  },
  {
    id: "ebaymotors",
    name: "eBay Motors",
    category: "private",
    blurb: "Nationwide auctions and Buy It Now.",
    filters: ["make", "model", "zip", "radius", "price"],
    url: (c) =>
      "https://www.ebay.com/sch/Cars-Trucks/6001/i.html" +
      qs({
        _nkw: keywords(c) === "cars" ? "" : keywords(c),
        _udlo: c.priceMin,
        _udhi: c.priceMax,
        _stpos: c.zip,
        _sadis: c.zip ? c.radius : "",
        _fspt: c.zip ? "1" : "",
      }),
  },
  {
    id: "privateauto",
    name: "PrivateAuto",
    category: "private",
    blurb: "Private sales with built-in secure payments.",
    filters: [],
    note: "Enter your search on PrivateAuto.",
    url: () => "https://privateauto.com/buy",
  },

  // ---------- Ex-rental / fleet ----------
  {
    id: "hertz",
    name: "Hertz Car Sales",
    category: "rental",
    blurb: "Well-maintained ex-rental cars, no-haggle.",
    filters: ["make", "model"],
    url: (c) =>
      "https://www.hertzcarsales.com/used-cars-for-sale.htm" +
      qs({ make: titleCase(c.make), model: titleCase(c.model) }),
  },
  {
    id: "enterprise",
    name: "Enterprise Car Sales",
    category: "rental",
    blurb: "Ex-rental fleet, 7-day buyback.",
    filters: [],
    note: "Enter your search on Enterprise.",
    url: () => "https://www.enterprisecarsales.com/list/buy-a-car/",
  },
  {
    id: "avis",
    name: "Avis Car Sales",
    category: "rental",
    blurb: "Ex-rental cars from Avis Budget Group.",
    filters: [],
    note: "Enter your search on Avis Car Sales.",
    url: () => "https://www.aviscarsales.com/",
  },

  // ---------- Auctions & enthusiast ----------
  {
    id: "carsandbids",
    name: "Cars & Bids",
    category: "auction",
    blurb: "Enthusiast auctions for modern cars (1980s+).",
    filters: ["make", "model"],
    url: (c) => "https://carsandbids.com/search" + qs({ q: keywords(c) === "cars" ? "" : keywords(c) }),
  },
  {
    id: "bat",
    name: "Bring a Trailer",
    category: "auction",
    blurb: "Curated enthusiast auctions with full sale history.",
    filters: ["make", "model"],
    url: (c) => "https://bringatrailer.com/search/" + qs({ s: keywords(c) === "cars" ? "" : keywords(c) }),
  },
  {
    id: "copart",
    name: "Copart",
    category: "auction",
    blurb: "Salvage & clean-title auctions (experienced buyers).",
    filters: ["make", "model"],
    url: (c) => `https://www.copart.com/lotSearchResults?free=true&query=${enc(keywords(c))}`,
  },
  {
    id: "iaai",
    name: "IAA",
    category: "auction",
    blurb: "Insurance auto auctions (often salvage titles).",
    filters: ["make", "model"],
    url: (c) => "https://www.iaai.com/Search" + qs({ Keyword: keywords(c) }),
  },

  // ---------- Classic ----------
  {
    id: "hemmings",
    name: "Hemmings",
    category: "classic",
    blurb: "The classic-car marketplace.",
    filters: ["make", "model"],
    url: (c) => {
      const path = ["classifieds", "cars-for-sale"];
      if (c.make) path.push(slug(c.make));
      if (c.make && c.model) path.push(slug(c.model));
      return `https://www.hemmings.com/${path.join("/")}`;
    },
  },
  {
    id: "classiccars",
    name: "ClassicCars.com",
    category: "classic",
    blurb: "Large classic and collector listings.",
    filters: ["make", "model"],
    url: (c) => {
      const path = ["listings", "find"];
      if (c.make) path.push(slug(c.make));
      if (c.make && c.model) path.push(slug(c.model));
      return `https://classiccars.com/${path.join("/")}`;
    },
  },
];

// Research links shown next to the results — not listings, but where to check
// value, reliability, safety and running costs before buying.
const RESEARCH = [
  {
    name: "KBB value & reviews",
    url: (c) =>
      c.make && c.model
        ? `https://www.kbb.com/${slug(c.make)}/${slug(c.model)}/`
        : "https://www.kbb.com/whats-my-car-worth/",
  },
  {
    name: "Edmunds reviews",
    url: (c) =>
      c.make && c.model
        ? `https://www.edmunds.com/${slug(c.make)}/${slug(c.model)}/`
        : "https://www.edmunds.com/car-reviews/",
  },
  {
    name: "NHTSA safety ratings",
    url: () => "https://www.nhtsa.gov/ratings",
  },
  {
    name: "IIHS crash tests",
    url: (c) =>
      c.make && c.model
        ? `https://www.iihs.org/ratings/vehicle/${slug(c.make)}/${slug(c.model)}`
        : "https://www.iihs.org/ratings",
  },
  {
    name: "Fuel economy (EPA)",
    url: (c) =>
      "https://www.fueleconomy.gov/feg/PowerSearch.do" +
      qs({
        action: "noform",
        path: "1",
        year1: c.yearMin || "",
        year2: c.yearMax || "",
        make: titleCase(c.make),
        baseModel: titleCase(c.model),
        srchtyp: "ymm",
      }),
  },
  {
    name: "Owner complaints (CarComplaints)",
    url: (c) =>
      c.make && c.model
        ? `https://www.carcomplaints.com/${titleCase(c.make).replace(/\s+/g, "_")}/${titleCase(c.model).replace(/\s+/g, "_")}/`
        : "https://www.carcomplaints.com/",
  },
  {
    name: "Reddit owner opinions",
    url: (c) =>
      "https://www.reddit.com/search/" + qs({ q: `${keywords(c)} reliability buying advice` }),
  },
];

window.CarSources = { SOURCES, CATEGORIES, RESEARCH, slug, titleCase };
