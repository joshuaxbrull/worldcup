# Event implementation

The production implementation is in the separate [marcolin-release checkout](marcolin-release/docs/implementation.md), on branch `event-ready`, based on the current `joshuaxbrull/marcolin` repository. This `worldcup` repository is the old locator; only its landing page and service worker are changed to redirect to the canonical locator.

- [Card preview](marcolin-release/cards/proofs/preview.png)
- [Light-back PDF](marcolin-release/cards/proofs/card-light-back.pdf) / [dark-back PDF](marcolin-release/cards/proofs/card-dark-back.pdf)
- [Location audit](marcolin-release/docs/directory-audit.md)
- [Manager activation](marcolin-release/manager/README.md)
- [Cloudflare setup and connection status](marcolin-release/docs/cloudflare-setup.md)
- [Security and deployment status](marcolin-release/docs/security-review.md)
- [Implementation and validation](marcolin-release/docs/implementation.md)

The initial Cloudflare Worker is deployed at https://marcolin-manager.marcolin-event-locator.workers.dev. GitHub sign-in, App configuration and live verification are still needed to activate the manager and publish the prepared GitHub cleanup. The old exposed credential has been revoked, both local Git histories have been scanned, and security workflows are prepared. Card files are design proofs pending a higher-resolution copy of the selected photo and a physical print/QR check. Existing input documents and earlier proofs were preserved.
