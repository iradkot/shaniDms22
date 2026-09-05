#import "AppDelegate.h"

#import <FirebaseCore/FirebaseCore.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTBridgeModule.h>

@interface ShaniDmsRuntimeConfig : NSObject <RCTBridgeModule>
@end

@implementation ShaniDmsRuntimeConfig

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSDictionary *)constantsToExport
{
  NSBundle *bundle = [NSBundle mainBundle];
  NSString *backendBaseUrl = [bundle objectForInfoDictionaryKey:@"ShaniBackendBaseURL"] ?: @"";
  id rulesSchemaVersion = [bundle objectForInfoDictionaryKey:@"ShaniFirestoreRulesSchemaVersion"] ?: @0;
  return @{
    @"backendBaseUrl": backendBaseUrl,
    @"firestoreRulesSchemaVersion": rulesSchemaVersion,
  };
}

@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
  }

  self.moduleName = @"shaniDms22";
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
