---
name: dependency-management
description: Use when installing, removing, upgrading, or troubleshooting npm packages, module resolution, bundle size, or Lambda package size in ImmiGO.
---

# Dependency Management

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/CHANGE_POLICY.md` section 6, `package.json`, `package-lock.json`.

Use this skill only when a dependency change is genuinely required. The default answer is no new runtime dependency.

## Project rules

- New runtime dependencies require explicit approval.
- Check the platform, standard library, and installed packages first.
- Use npm. Do not mix package managers or add global installs.
- Runtime packages go in `dependencies`; test, type, lint, and build tools in `devDependencies`.
- Review frontend bundle size, Lambda package size, cold starts, license, security, and maintenance.
- Do not upgrade unrelated packages in the same change.
- Do not add a package to avoid a small local helper.
- Never add a package that duplicates Supabase, Amplify, Bedrock, Polly, or browser APIs already in use.

## Workflow

1. Write down the concrete need and why existing tools cannot meet it.
2. Check the current version and peer compatibility.
3. Make the smallest package change.
4. Run `npm install` and commit the lockfile change with the package change.
5. Run `npm run verify`.
6. Record the bundle/Lambda-size impact in the change receipt.

## Done when

- [ ] The need is concrete and approved.
- [ ] The package is maintained, typed, and compatible.
- [ ] Runtime vs dev placement is correct.
- [ ] The lockfile is updated.
- [ ] `npm run verify` passes.
- [ ] Bundle and Lambda impact is documented.
