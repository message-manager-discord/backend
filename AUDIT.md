# Repository audit — 2026-09-12

Scoped view of the `modernise` branch for `message-manager-backend`.
This branch is meant to get packages and code style into 2026 only.
No behavioral changes should be landing here unless they are an explicit side effect
of a version bump or dependency migration that has to change runtime code.

Everything below was verified from git diffs against `main`, `package.json`,
and the GitHub Actions workflow files.

**Status legend:** ✅ done · ⬜ next / not started

**Current verification:** `npm run build` ✅ · `npm run lint` ✅ 0 problems · `npm run format:check` ✅.
Toolchain in use during review: Node 24, npm with lockfile v3.

---

## Done

### Toolchain / project setup

- Node target moved to `>=24.0.0` in `package.json` `engines`.
- `tsconfig.json` modernised: NodeNext resolution, `es2025` target,
  `verbatimModuleSyntax`, `skipLibCheck`, explicit `include/exclude`.
- ESM cleanup: `--experimental-specifier-resolution` removed from `start`/`dev`,
  imports rewritten with `.js` extensions where required, and type-only imports
  narrowed across `src/`.
- ESLint moved to the flat `eslint.config.js` setup; old `.eslintrc.json` removed.
- `package.json` scripts modernised: lint uses `eslint .`, test runner switched to
  `vitest`, and build/dev scripts no longer pass experimental specifier-resolution flags.

### Dependencies bumped / reorganised

- All core runtime and dev dependencies bumped to modern 2026-era versions, including:
  - `fastify` ecosystem (`fastify`, `@fastify/auth`, `@fastify/cookie`, `@fastify/cors`,
    `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/swagger-ui`,
    `@fastify/type-provider-typebox`, `fastify-plugin`, `fastify-raw-body`)
  - `@prisma/client` / `prisma`
  - `@sentry/node`
  - `@discordjs/rest`
  - `ioredis`
  - `discord-api-types` (also reclassified from devDependencies to dependencies because
    runtime enum/Route values are imported in `src/`)
  - `@sinclair/typebox`, `axios`, `dotenv`, `env-schema`, `form-data-encoder`,
    `formdata-node`, `fuse.js`, `http-errors`, `prom-client`, `redis-discord-cache`,
    `tslib`, `uuid`, `typescript`, `tsc-watch`, `prettier`, `eslint`, `typescript-eslint`,
    `eslint-plugin-simple-import-sort`, `@eslint/js`, `eslint-config-prettier`
- Removed stale/stub types: `@types/uuid` removed, `@types/node` bumped to `^24.13.4`.
- Dropped `discord-interactions` and `@sentry/integrations` as part of the modernisation
  pass.
- Lockfile re-synced after the dependency changes.

### GitHub Actions / CI

- `actions/checkout@v2` → `actions/checkout@v7`.
- `actions/setup-node@v4` → `actions/setup-node@v6`.
- `docker/login-action` pinned to a real released version and
  `docker/build-push-action` bumped to the corresponding modern release.
- `github/codeql-action` init/autobuild/analyze updated off the dead `v1` pins.
- New `ci.yml` for typecheck-on-push/pr.
- `lint.yml` aligned to modern checkout/node action versions.
- `deploy-image.yml` cleaned up: dead `echo ${{ secrets.SENTRY_ORG }}` step removed,
  and the `build-args` block that duplicated Sentry secret mounts removed.

### Docker

- Base image moved off the EOL `node:17-buster` pin to a modern Node 24 image.
- `CMD` changed from `npm run start` to `node ./dist/index.js`.
- `.dockerignore` updated to exclude `.git`, `.github`, `.vscode`,
  `.wakatime-project`, and `*.md`.

### Sentry

- Sentry bootstrapping relocated from inline code in `src/index.ts` into
  `src/instrument.ts`.
- `RewriteFrames` from `@sentry/integrations` replaced with
  `rewriteFramesIntegration` from `@sentry/node`.
- Release no longer computed with `child_process.execSync("git rev-parse HEAD")`;
  now takes `GIT_REVISION` from `process.env.GIT_REVISION`.
- `@sentry/integrations` removed from `package.json` as a result.
- Sentry init still present; moved, not removed.

### Runtime / API hygiene that is not a package bump

- PII `console.log` calls removed from `src/authRoutes.ts`.
- Debug-ish logs removed from `src/interactions/shared/message-generation.ts` and
  `src/lib/permissions/interactionCache.ts`.
- `src/v1/routes/internal.ts` preHandler now returns after sending `Unauthorized`.
- Token comparisons in `src/v1/routes/internal.ts` and `src/plugins/metrics.ts`
  switched to the new constant-time `src/lib/secureCompare.ts` helper.
- CORS `origin` in `src/index.ts` pinned to `SITE_URL` instead of reflecting every origin.
- `src/plugins/envCheck.ts` now requires non-empty `METRICS_AUTH_TOKEN` and
  `INTERNAL_TOKEN`.

### Docs / config hygiene

- `.env.example` brought back in sync: added `DISCORD_INTERACTIONS_PUBLIC_KEY`,
  `DISCORD_CACHE_REDIS_HOST`, `DISCORD_CACHE_REDIS_PORT`, and fixed the malformed
  `METRICS_AUTH_TOKEN` value.
- `README.md` updated so it no longer references the old `.eslintrc.js` and reflects
  that tests are not fully set up.

### Verification state on the branch

- Build passes.
- ESLint reports 0 problems.
- Prettier check passes.
- Test runner is now `vitest`, but meaningful test coverage is not in place yet.

---

## Next

### 1. Tests

- `npm test` is meaningful again only if there are real tests.
- The old commented-out `src/tests/messages/permissions.ts` is tap-based and references
  symbols that are no longer exported as-is.
- If the goal is to keep this branch behavior-neutral, the first step is a small
  vitest suite that covers non-behavioral surfaces: signature verification,
  constant-time token comparison, and `envCheck` validation.

### 2. Sentry release value

- `src/instrument.ts` uses `process.env.GIT_REVISION` and has a `// TODO Fix` note.
- Decide how `GIT_REVISION` is supplied in production/CI so Sentry release tagging
  does not silently degrade compared with the old inline `git rev-parse HEAD` path.

### 3. Remaining dependency majors

These are bigger migrations, not plain version bumps. They are out of scope unless
someone explicitly wants to expand this branch beyond package/style modernisation:

- `discord-api-types` v9 → v10
- `@prisma/client` / `prisma` major
- `@sentry/node` major
- `ioredis` major
- `env-schema` major
- `uuid` major
- `dotenv` major
- `typescript` major
- `tsc-watch` major
- `@fastify/rate-limit` major
- `@fastify/swagger-ui` major
- `@fastify/type-provider-typebox` major
- `fastify-plugin` major
- `fastify-raw-body` major
- `eslint-plugin-simple-import-sort` major

### 4. Dependency-only audit debt

Any remaining `npm audit` result that cannot be resolved without a breaking major bump
is tied to the dependency majors above. It is not a separate modernization item by itself.

### 5. Docs / leftovers

- `todo.md` is a stale scratch file; decide whether to prune it or move items into issues.
- `.vscode/settings.json` is a tracked empty object; decide whether to keep it tracked.

---

## Out of scope for this branch

- Hardcoded bot id / avatar / invite URL touch-ups.
- Replacing `axios` with native `fetch`.
- Dropping `formdata-node` / `form-data-encoder` in favor of Node native `FormData`/`Blob`.
- Docker multi-stage build, non-root runtime, or rewriting the `@sentry/cli` build steps.
- Swagger UI exposure cleanup unless it is part of a deliberate security pass.
- Any change that alters message sending / editing / deleting / permission / reporting
  behavior beyond what is forced by a dependency migration.
