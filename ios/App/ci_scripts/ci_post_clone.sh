#!/bin/sh
# Xcode Cloud: runs right after the repo is cloned, before Xcode builds.
# Capacitor apps keep their web bundle and plugin packages out of git, so build them here.
set -e
export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
command -v node >/dev/null 2>&1 || brew install node
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build --if-present      # builds www/ (and syncs iOS in apps where build includes it)
npx cap sync ios                # copies www/ into the iOS app and resolves plugin packages
# Capacitor's iOS code comes from CocoaPods (from node_modules, not a GitHub package), so
# Xcode Cloud never needs access to another repo. cap sync normally runs this; make sure.
cd ios/App && pod install
