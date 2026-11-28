# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Super admin: manages stores, accounts, subscriptions, platform settings, and store design.
- Store operators: create and update orders, manage their catalog, and serve customers.
- Customers: scan an order QR code and follow its status on mobile or desktop.

## Product Purpose

The application coordinates orders across multiple stores. Each store manages its current orders through a private account, while customers follow only an order card opened by scanning that order's QR code.

## Positioning

One multi-store workspace connects store-managed order status, a public order QR flow, and a configurable customer status card.

## Operating Context

Store operators use the dashboard during service to create orders, track active orders, and move orders through received, preparing, ready, and completed states. Customers typically open the status card from a phone after scanning the order QR code.

## Capabilities and Constraints

- Preserve authentication, store and order data, subscription rules, roles, APIs, QR scanning, direct messaging, and push notifications.
- Store and customer interfaces support Arabic and English.
- The super admin alone controls each store's Google Maps review URL.
- The requested theme system must keep drafts separate from published configuration and isolate each store's overrides.
- Stap logos and the supplied Thmanyah WOFF2 font family weights are included as first-party static assets under `public/assets/stap/` and `public/fonts/thmanyah/`.
- Stack: existing Node.js/Express server and static HTML, CSS, and JavaScript client.

## Brand Commitments

The application currently carries the configurable name Nawa. The user requests a single built-in store theme named “stap Default Theme” and a Stap identity, while providing the corresponding logo and original font files separately. Keep the platform identity independent from store themes.

## Evidence on Hand

- Existing production code in `server.js` and `public/`.
- User's pasted specification in the current request.
- Stap identity and Thmanyah font files are not yet present in the project.

## Product Principles

- Preserve operational data and existing order workflows.
- Isolate every store's unpublished and published design.
- Make visual changes reviewable before publication.
- Keep store, platform, and customer-facing controls understandable in Arabic and English.

## Accessibility & Inclusion

Support keyboard focus, readable contrast, reduced motion, responsive layouts, and accessible controls on mobile and desktop.
