# Event implementation

The production implementation is in the separate [Marcolin repository](https://github.com/joshuaxbrull/marcolin/blob/main/docs/implementation.md) (local checkout: `marcolin-release/`), on branch `event-ready`, based on the current `joshuaxbrull/marcolin` repository. This `worldcup` repository is the old locator; only its landing page and service worker are changed to redirect to the canonical locator.

- [Card preview](https://github.com/joshuaxbrull/marcolin/blob/main/cards/proofs/preview.png)
- [Light-back PDF](https://github.com/joshuaxbrull/marcolin/blob/main/cards/proofs/card-light-back.pdf) / [dark-back PDF](https://github.com/joshuaxbrull/marcolin/blob/main/cards/proofs/card-dark-back.pdf)
- [Location audit](https://github.com/joshuaxbrull/marcolin/blob/main/docs/directory-audit.md)
- [Manager activation](https://github.com/joshuaxbrull/marcolin/blob/main/manager/README.md)
- [Cloudflare setup and connection status](https://github.com/joshuaxbrull/marcolin/blob/main/docs/cloudflare-setup.md)
- [Security and deployment status](https://github.com/joshuaxbrull/marcolin/blob/main/docs/security-review.md)
- [Implementation and validation](https://github.com/joshuaxbrull/marcolin/blob/main/docs/implementation.md)

The initial Cloudflare Worker is deployed at https://marcolin-manager.marcolin-event-locator.workers.dev. GitHub sign-in, App configuration and live verification are still needed to activate the manager and publish the prepared GitHub cleanup. The old exposed credential has been revoked, both local Git histories have been scanned, and security workflows are prepared. Card files are design proofs pending a higher-resolution copy of the selected photo and a physical print/QR check. Existing input documents and earlier proofs were preserved.
