# Temporary Build-Tool Advisory Exception

- Advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- Upstream issue: https://github.com/micromatch/braces/issues/70
- Verified on: 2026-10-03
- Expires automatically: 2026-10-10 00:00 UTC
- Version: braces 3.0.3 only. The npm registry and upstream advisory currently have no patched release.

This package is used by Tailwind's source globs and ESLint's local file checks, not by product requests. The animation plugin is a build-only dependency and must stay in devDependencies. Production build traces contain no braces or Tailwind runtime files. CI builds trusted, repository-owned glob configuration without deployment secrets. This limits exposure; it does not patch the upstream vulnerability.

The audit gate still runs npm audit for production dependencies and the complete dependency graph. Production advisories always fail. The only temporary exception is this exact advisory and its dependency chain, with every affected lockfile node marked development-only. New advisories, changed scope/version, registry failures, malformed reports and expiration fail closed. No audit threshold is raised, no force downgrade is used, and no other advisory is suppressed.

Both audit commands explicitly require online advisory checks and include optional/peer dependencies. The complete audit also explicitly includes development dependencies, regardless of NODE_ENV or inherited npm omit/offline configuration.

Replace the exception with the upstream patched version when available. Do not extend the deadline automatically or feed untrusted glob configuration into the build. Regression coverage is in scripts/test-dependency-audit.mjs.
