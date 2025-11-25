
# Install dependencies (this should work in the actual repo)
cd ../
pnpm install

# Build the core package first
cd packages/core
pnpm build

# Build the browser package
cd ../browser
pnpm build

# Verify dist files exist
ls -la dist/

npm pack

cp posthog-js-1.298.1.tgz  ./PATH_TO_LIMY_SDK_FOLDER/packages/
