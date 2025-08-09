# iOS TestFlight Deployment Setup

Since iOS development on Windows has limitations, we've set up a GitHub Actions workflow for TestFlight deployment.

## Option 1: GitHub Actions (Recommended)

### Setup
1. Go to your GitHub repository settings
2. Navigate to "Secrets and variables" > "Actions"
3. Add the following secrets:
   - `FASTLANE_USER`: Your Apple ID email
   - `FASTLANE_PASSWORD`: Your Apple ID password
   - `FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD`: App-specific password from Apple
   - `FASTLANE_SESSION`: Fastlane session (optional, for 2FA)
   - `MATCH_PASSWORD`: Password for certificate matching

### Deploy
- Run: `yarn publish_testflight` (shows instructions)
- Or manually trigger the workflow at: https://github.com/iradkot/shaniDms22/actions

## Option 2: Local Setup (Advanced)

### Prerequisites
1. **macOS machine or VM required** - iOS apps cannot be built/signed on Windows
2. Xcode and Xcode Command Line Tools
3. Ruby and Bundler
4. Valid iOS Developer account

### Local Commands
```bash
cd ios
bundle install
bundle exec fastlane beta
```

## Option 3: Alternative Tools

### Using Expo EAS (if applicable)
```bash
npm install -g @expo/cli
eas build --platform ios
eas submit --platform ios
```

### Using React Native CLI with manual upload
```bash
# Build locally on macOS
cd ios
xcodebuild -workspace shaniDms22.xcworkspace -scheme shaniDms22 -configuration Release archive
# Then upload via Xcode or Application Loader
```

## Troubleshooting

### Common Windows Issues
- **"fastlane not found"**: iOS deployment requires macOS - use GitHub Actions
- **Ruby compilation errors**: Native extensions need development tools - use cloud CI
- **Certificate/provisioning issues**: Requires Xcode and Apple Developer tools

### Recommended Approach
For Windows development:
1. Develop and test Android locally
2. Use GitHub Actions for iOS builds and deployment
3. Test iOS builds on physical devices via TestFlight
