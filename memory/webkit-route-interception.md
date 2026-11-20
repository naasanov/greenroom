---
name: webkit-route-interception
description: Playwright page.route does not reliably hold or fulfill requests in the WebKit (mobile) project; assert loading states with a MutationObserver and keep route-dependent specs desktop-only
type: project
applies-to: apps/e2e/**
---
In the `mobile` (WebKit) project, `page.route` handlers that hold a cross-origin API request (to observe a loading or pending state) or fulfill it with a synthetic error often do not take effect. Specs that depended on them failed only on mobile in CI: the skeleton chips spec (#126, two fix attempts spent) and the failed-save spec (#128, `waitForResponse` timed out and the alert never appeared).
**Why:** each cost CI rounds on a correct component; the failure only shows in CI because local WebKit crashes on the factory.
**How to apply:** to assert a transient state, install a `MutationObserver` with `page.addInitScript` and read what it recorded instead of racing a held route. A spec whose point is a held or fulfilled route gets `test.skip(isMobile, "WebKit does not reliably apply page.route")`; keep its assertions unchanged. Related: [[flaky-e2e-specs]].
