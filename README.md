# CarScout — search every car site at once

A static website that makes car shopping easier: enter what you want once and get a pre-filled search on
28 car sites, plus tools to compare, vet and budget for the car.

## Features

- **One search, 28 sites** — Autotrader, Cars.com, CarGurus, TrueCar, Edmunds, KBB, AutoTempest, Autolist,
  CarsDirect, CARFAX, Carvana, CarMax, AutoNation, CarBravo, Facebook Marketplace, Craigslist, OfferUp,
  eBay Motors, PrivateAuto, Hertz / Enterprise / Avis Car Sales, Cars & Bids, Bring a Trailer, Copart, IAA,
  Hemmings and ClassicCars.com. Open them one by one, by category, or all at once.
- **Honest filter chips** — each site card shows which of your filters its link carries and which you need to
  set on that site.
- **Shareable searches** — the search is saved in the URL, so a link reopens it.
- **Research links** — KBB, Edmunds, NHTSA, IIHS, EPA fuel economy, CarComplaints and Reddit for the model.
- **Shortlist & compare** — save listings from any site, sort them by price, miles and more, see an estimated
  monthly payment for each, and export to CSV.
- **VIN decoder & recall check** — uses NHTSA's free public APIs.
- **Payment calculator** — out-the-door price, monthly payment, total interest, and the highest car price your
  monthly budget allows.
- **Buying checklist** — covers budget, research, inspection, negotiation and paperwork.

The shortlist, checklist and settings are saved in your browser's `localStorage`. Nothing is sent to a server.

## Why deep links instead of scraping?

Most car sites don't offer a public API. They also block scraping, both in their terms and technically.
Linking into each site's own search keeps the site legal, free to host and always up to date. Listings stay
on the original site, where the buyer contacts the seller anyway.

## Run it

It's plain HTML/CSS/JS with no build step:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

To host it for free, enable **GitHub Pages** (Settings → Pages → deploy from branch, root folder).

## Add or fix a site

Every site is one entry in [`js/sources.js`](js/sources.js). Each entry has a `url(criteria)` function and a
`filters` list naming the criteria that the URL carries. Sites change their URL formats from time to time.
If a link stops applying a filter, update that entry.
