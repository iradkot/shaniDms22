# iOS Pods regeneration (macOS)

This branch contains iOS CocoaPods/Xcode project fixes.
To regenerate the iOS generated artifacts (especially `ios/Podfile.lock`) in a clean way, run the following on a Mac.

## Prereqs

- Xcode installed (and command line tools)
- Ruby + Bundler available
- Node/Yarn installed

## Steps

From the repo root:

1. Install JS deps

   - `yarn install`

2. Install Ruby deps for iOS

   - `cd ios`
   - `bundle install`

3. (Recommended) Clean Pods + derived state

   - `rm -rf Pods`
   - `rm -f Podfile.lock`

4. Re-install pods

   - `bundle exec pod install`

5. Commit regenerated files

   - `git status`
   - `git add ios/Podfile.lock ios/Pods ios/*.xcworkspace ios/shaniDms22.xcodeproj/project.pbxproj`
   - `git commit -m "chore(ios): regenerate pods"`
   - `git push`

Notes:
- `ios/Pods` can be large; follow your team's repo policy (some teams do not commit it). If you do not commit it, remove it from the `git add` list above.
