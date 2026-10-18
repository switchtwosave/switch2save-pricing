# Smart Track

Your Swipe to Wealth Dashboard shows what recorded price changes and discounts added, what higher costs absorb, and the contribution remaining toward a goal. It also lets you plan future prices. Recorded results and projections are separate.

## Start with a business

1. Add the business name, address, MID and IANA time zone, such as `America/New_York`.
2. Enter the original baseline date and each item's original unit list price. Keep item IDs stable. Later increases and permanent reductions belong in applied price history.
3. Enter or import item-level sales and refunds. Record the actual unit list price before the transaction's promotional discounts.
4. Add matching finance periods with processing fees, earned and paid rebates, and comparable operating costs. Blank means unknown. Enter zero only when you have confirmed none.

The fictional demo is an example, not verified merchant data. Loading it does not connect to a POS.

## Neutral sales CSV

Download the template from **Sales & refunds**. It uses these columns:

| Column | Meaning |
| --- | --- |
| `id` | Stable, unique sales-line ID. Reuse the same ID to identify an existing line; duplicate imports are rejected. |
| `date` | Merchant-local reporting date, `YYYY-MM-DD`. |
| `priceDate` | Original sale date for a refund, otherwise blank. |
| `itemId` | An existing baseline item ID. |
| `quantity` | Units sold; negative units for a refund. |
| `unitPrice` | Actual unit list price before this line's promotion, excluding tax and tips. |
| `discountPct` | Percentage promotion, 0–100. |
| `discountAmount` | Additional flat line discount after the percentage discount. Positive on sales; negative to reverse a discount on refunds. |
| `tender` | `cash`, `card` or `unknown`. |

For example, 10 units at $12, with a 10% promotion and a further $3 line discount, yield `10 × 12 × 0.90 − 3 = $105`. A complete reversal uses quantity `-10`, the same unit price and percentage, flat discount `-3`, and the original sale date.

Use one row per item, price, promotion and tender. For mixed tender, allocate quantities and flat discounts consistently across rows so their totals equal the original line; never duplicate the full line for both tenders. Unknown tender remains unallocated. Include all relevant sales and refunds for the chosen period; a missing row cannot be inferred from an average ticket.

No vendor-specific POS format is assumed. Map your export to this schema locally. Tax, tips, surcharges and non-sales deposits must not be silently treated as item price increases. A permanent price reduction goes in price history and the actual unit price, not again as a promotional discount.

## Read the comparison correctly

The recorded comparison holds the recorded item quantities constant and reprices them at the original baseline list prices, before promotions. The detail panel separates the gross price effect, promotional discounts and their combined effect. It also identifies prices that do not match the recorded change history.

Example: original price $10, actual price $12, quantity 10, promotion 10%. Gross price effect is +$20; the promotion is −$12; combined effect against the original undiscounted $100 basket is +$8. Holding that same 10% promotion on both prices gives a separate price-only effect of +$18. These are different comparisons, not amounts to add together.

Successive changes use the difference from the preceding price. A sequence $10 → $12 → $11 contributes +$2 and −$1 per eligible unit, for +$1 total—not +$3. Refunds reverse the original sale's version when its date is supplied. These comparisons do not prove that pricing caused sales-volume or demand changes.

Contribution uses the combined price/promotion effect, the difference between comparable baseline and actual fees, the change in earned rebates, and incremental operating costs. For example: $2,000 effect − $1,200 added operating costs − $60 added processing = $740 contribution, before unentered costs and taxes.

Enter the same-period comparison basis for finance records. Named cost categories such as food, labor, rent and other compare baseline and actual amounts; only the difference is deducted, once per period. Finance periods cannot overlap. Monthly fees are not automatically spread into daily results, so a daily contribution may be unavailable even when the monthly total is known.

Total receipts, card proceeds after processing, funds actually settled, earned rebates and paid rebates are separate measures. Rebate payment does not create a second earning. Outstanding rebate needs an opening balance and continuous earned/paid records. Contribution is not a reconciled bank balance, full net profit or money available to withdraw.

## Plan toward a goal

Choose the historical period whose item quantities, promotions and tender mix should represent the plan. Enter a target such as “another $500 per month,” a purpose, proposed dated item prices, processing and rebate assumptions, and comparable monthly costs.

Uniform percentage/dollar changes and selective item prices can be positive or negative. Proposals stay separate from applied history. **Record effective steps as applied** records what you say has already happened; it does not change a POS or apply future steps automatically.

The projection normalizes the chosen historical basket to a 30.4375-day month, models scheduled prices on their dates, and shows monthly and cumulative estimates. It assumes no organic growth, seasonality, investment returns or automatic compounding. Volume-decline sensitivity reduces the basket and displays the lost-volume effect separately from the same-basket price effect. An uploaded historical period is not a guarantee of future quantities.

Funding purposes are allocations of the same projected contribution, not additional income streams. The total monthly allocation cannot exceed the lowest projected monthly contribution; unknown or negative contribution cannot fund an allocation. They do not transfer money. Reconcile settlements, taxes, operating reserves and all omitted expenses before deciding what to set aside. A goal called “investment” is only a label; this tool does not invest or forecast investment returns.

## Storage and backups

Smart Track stores data in this browser's local storage. There are no accounts, cloud database, shared merchant records, automatic POS imports or scheduled report deliveries. Changing browsers/devices, clearing site data or closing a private/Guest session can lose access. Browser storage quotas limit the size of the dataset; save errors must be resolved before relying on a change.

Download JSON backups regularly and before restoring another backup. Restore validates the file before replacement. Backups include business identity and financial inputs and are not encrypted; keep them private. Sales CSV and JSON files are read locally, not sent to a server. Downloaded reports retain the selected business identity and reporting period.

The existing calculator remains an estimate, and the original savings-report workflow remains separate. Smart Track does not turn those estimates into recorded actuals.
