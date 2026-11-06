# Security

Suite Dev is developer tooling, not a shipped product. It stages local builds, starts them, and writes
their install records into `.dev/`.

- It never handles a real user document. Every run uses `suite-dev/.dev` for its apps, documents and
  `userData`.
- Staged builds loosen exactly one Electron fuse, `enableNodeCliInspectArguments`, so Playwright can
  attach. `pnpm apps:stage -- --strict-fuses` builds the shipped article instead.
- `pnpm link:local` writes `link:` specifiers into the consumer repositories. Never commit them;
  `pnpm unlink:local` restores the released specs and shows the diff.

## Reporting a vulnerability

Use GitHub's private security advisory for
[mr-rogers-neighborhood/suite-dev](https://github.com/mr-rogers-neighborhood/suite-dev/security/advisories/new).
Do not open a public issue for a vulnerability. Include the version, the platform, and the smallest
reproduction you can.
