# Building posthog-js for the Limy SDK

> Fork-specific (limyai/posthog-js). Do not upstream.

Set `LIMY_SDK_DIR` to the path of your local Limy SDK checkout, then run from the repository root:

```bash
: "${LIMY_SDK_DIR:?set LIMY_SDK_DIR}"

pnpm install

# Build core first, then browser (browser depends on core)
pnpm --filter=@posthog/core build
pnpm --filter=posthog-js build

# pnpm pack (not npm pack) rewrites workspace:* deps to real versions
(cd packages/browser && pnpm pack --pack-destination "$LIMY_SDK_DIR/packages/")
```
