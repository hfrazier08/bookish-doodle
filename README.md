# CarScout — search every car site at once

A static website that makes car shopping easier: enter what you want once and get a pre-filled search on
28 car sites, plus tools to compare, vet and budget for the car.

## Features

- **One search, 28 sites** — Autotrader, Cars.com, CarGurus, TrueCar, Edmunds, KBB, AutoTempest, Autolist,
  CarsDirect, CARFAX, Carvana, CarMax, AutoNation, CarBravo, Facebook Marketplace, Craigslist, OfferUp,
  eBay Motors, PrivateAuto, Hertz / Enterprise / Avis Car Sales, Cars & Bids, Bring a Trailer, Copart, IAA,
  Hemmings and ClassicCars.com. Open them one by one, by category, or all at once.
- **Listings with photos in one place**: dealer listings from across the US appear in a photo grid on the
  page, with price, mileage, distance, days listed, 1-owner and clean-title flags, and a "below / above
  similar" price tag. You can sort them, load more, and save any of them to your shortlist in one click.
  They come from the [MarketCheck API](https://www.marketcheck.com/apis): paste your own API key into the
  page and it's stored only in your browser.
- **Best-deal ranking**: each car's price is compared with a market estimate built from similar listings
  (same make and model, adjusted for year and mileage). Cars are rated Great deal, Good deal, Fair price or
  Above market, sorted by best deal, with Top picks for best deal, lowest price, lowest miles and closest.
- **Make an offer**: suggests an opening offer and a target price for any listing, lists your leverage
  (days listed, price drops, cheaper comparable cars), and writes a ready-to-send message to the dealer.
- **Recall warnings** on every listing (NHTSA). Tap one to see the recalls and check that car's VIN.
- **Real monthly cost** on every card, using your payment calculator settings.
- **New & price-drop badges**: listings that are new since your last visit or have dropped in price.
- **Finer filters** for the photo listings: body style, drivetrain, fuel, transmission, color, trim,
  1-owner and clean title.
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

The shortlist, checklist, settings and API key are saved in your browser's `localStorage`. There is no CarScout server: searches go straight from your browser to MarketCheck and NHTSA.

## Where the listings come from

Car sites don't offer a public API, and they block scraping in their terms and technically. So the photo
grid uses MarketCheck, a licensed service that collects US dealer inventory and allows requests straight
from the browser. Private-seller sites (Facebook Marketplace, Craigslist, OfferUp), auctions and classic
sites aren't in MarketCheck's data. For those, the page still builds a search link on each site.

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
