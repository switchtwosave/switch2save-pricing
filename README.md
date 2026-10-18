# Switch2Save Pricing Tool

Price Increase Planner, Review QR cards, Smart Track, terminals and build flow.

The site is static HTML/CSS/JavaScript, published with the existing GitHub Pages workflow.

- `index.html`: pricing estimates, including current-program comparison, the monthly rebate assumption and added cash revenue before other costs.
- `review.html`: four independent card designs with Smart Review generation and local Google/Zelle QR-image modes. See [QR notes](QR-LOCAL-NOTES.md).
- `smart-track.html`: merchant baselines, recorded price changes and discounts, sales, period costs and rebates, contribution goals and projections. See the [Smart Track guide](SMART-TRACK-GUIDE.md).

Smart Track has no backend or POS integration. Merchant records stay in browser local storage; use JSON backups. Its demo data is fictional.

For development, serve this directory on a stable localhost origin, for example `python3 -m http.server 4173 --bind 127.0.0.1`, then open `http://127.0.0.1:4173/smart-track.html`. Storage on localhost is separate from the live site. Do not commit merchant backups or sales exports.
