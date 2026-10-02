# CloudBase frontend release

The backend release and frontend release are separate. `CloudBase Frontend
Release` publishes the successful `Competition static build` artifact directly
to the original site's existing static hosting bucket. No ZIP upload in the
console is needed once the deployment account has hosting permissions.

## First setup

1. Keep the existing `cloudbase-production` protected environment and its main
   branch restriction. Use its existing Tencent deployment secrets; never put
   credentials in the frontend artifact.
2. Set environment variable `CLOUDBASE_FRONTEND_RELEASE_AUTHORIZED` to `true`
   only after the owner authorizes frontend publishing.
3. Run `CloudBase Frontend Release` on main with mode `inspect`. Approve its
   normal protected deployment. It reads `DescribeStaticStore` and
   `DescribeHTTPServiceRoute`, checks the original domain's root route, and
   reports the exact COS object resource required. It never grants permissions.
4. If CAM denies inspection, add only those two TCB read actions to the
   deployment account. Use the console's supported resource granularity; do not
   substitute an administrator or full-access preset policy.
5. Authorize only `cos:GetObject` and `cos:PutObject` for the object resource
   reported by inspection. It includes the real bucket and any shared-storage
   or website path prefix. No bucket creation, deletion, policy editing, or
   function configuration permission is required.
6. Run mode `deploy`. The latest successful push build of competition-static
   must match the current branch commit; stale artifacts are rejected.
7. After the first successful verified deployment, set repository variable
   `CLOUDBASE_FRONTEND_AUTO_DEPLOY` to `true`. Later successful push builds
   trigger publishing, retaining the normal production review gate.

## Safety and acceptance

- Release code always comes from main, never from the downloaded artifact.
- COS requests use the public `tencentcos.cn` domain, matching the official
  CloudBase manager SDK. An existing homepage read verifies object access
  before backup. Failures expose only the operation, public file key, status,
  request ID and a known diagnostic category, never provider headers or keys.
- COS requests have a 60-second network timeout. Each file logs its operation,
  public key, byte count and completion time, not its contents or credentials.
  If a release stalls, inspect the last started file before retrying; do not
  assume a green backup means uploads or public verification have completed.
- Back up every overwritten file before the first write. Backups are encrypted
  using the existing 32-byte Base64 `CLOUDBASE_BACKUP_KEY` and retained as a
  GitHub artifact for 30 days. Losing this key loses access to those backups.
- Upload assets before pages and the version marker last. Keep old hashed
  assets for cached pages. No object deletion occurs.
- Check every uploaded object's SHA-256, then check `frontend-release.json`
  on the original public URL. A green build alone is not deployment evidence.
- The script does not change API routing, backend configuration, CAM policies,
  or domain names. It rejects secret files and symlinks in the artifact.
- Failed uploads keep the encrypted backup. Restore is deliberately not
  automatic: inspect the failure before overwriting a potentially newer site.
  The backup JSON records the target, previous file contents as Base64 and
  content/cache headers; use the existing `decryptBackup` helper in
  `scripts/release-cloudbase.mjs` offline to recover it. Never publish decrypted
  backups or key material as artifacts.
- Public HTTP version verification is not a browser interaction test. Check
  key product workflows separately after deployment.

Run offline regressions with `npm run test:cloudbase-static-release`.
