# Event implementation

The production implementation is published on `main` in the separate [Marcolin repository](https://github.com/joshuaxbrull/marcolin/blob/main/docs/implementation.md) (local checkout: `marcolin-release/`). This `worldcup` repository's landing page and service worker now redirect to the canonical locator. Both release pull requests, security workflows and Pages deployments completed successfully.

- [Card preview](https://github.com/joshuaxbrull/marcolin/blob/main/cards/proofs/preview.png)
- [Light-back PDF](https://github.com/joshuaxbrull/marcolin/blob/main/cards/proofs/card-light-back.pdf) / [dark-back PDF](https://github.com/joshuaxbrull/marcolin/blob/main/cards/proofs/card-dark-back.pdf)
- [Location audit](https://github.com/joshuaxbrull/marcolin/blob/main/docs/directory-audit.md)
- [Manager activation](https://github.com/joshuaxbrull/marcolin/blob/main/manager/README.md)
- [Cloudflare setup and connection status](https://github.com/joshuaxbrull/marcolin/blob/main/docs/cloudflare-setup.md)
- [Security and deployment status](https://github.com/joshuaxbrull/marcolin/blob/main/docs/security-review.md)
- [Implementation and validation](https://github.com/joshuaxbrull/marcolin/blob/main/docs/implementation.md)

The configured manager is deployed at https://marcolin-manager.marcolin-event-locator.workers.dev. Its private GitHub App and Cloudflare secrets are ready; the owner still needs to confirm installation on only `marcolin`, manager sign-in and a real save/second-device check. The old exposed credential is revoked, its public files return 404, both Git histories passed redacted scans, and owner 2FA is enabled. Dependency alerts, secret push protection, restricted Actions permissions and guards against force pushes/deletion of `main` are verified in both repositories. The merged release branches were removed. Card files remain design proofs pending a physical print/QR check; see the [card specifications](https://github.com/joshuaxbrull/marcolin/blob/main/cards/README.md) for the current photo and resolution. Existing input documents and earlier proofs were preserved.
