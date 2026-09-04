# Blur skin handoff

## API-cost card reminder

Blur also supports the shared API-cost card variant. It is informational rather
than a remaining-allowance display: render the provider name, month currency
amount, day currency amount, and sync time. Do not render a percent sign,
progress bar, weekly quota, reset countdown, reset-credit row, or any
healthy/caution/critical state language.

Use Blur's rounded numeral treatment for currency amounts, but keep `USD` or
the returned currency symbol legible when an amount includes thousands or
decimals. The status artwork remains reserved for unavailable, stale, and
signed-out responses; a healthy API-cost source must not receive the green,
amber, or red quota artwork.

## Review checklist

1. Inspect a one-digit, two-digit, three-digit, and thousands-separated amount.
2. Inspect both light and dark appearances.
3. Confirm that a cost card has no visually implied balance, remaining quota, or
   reset time.
4. Confirm unavailable, stale, and signed-out cost states use provider-neutral
   copy and do not disclose a credential or report payload.
