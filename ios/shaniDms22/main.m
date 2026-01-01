#import <UIKit/UIKit.h>

#import <FirebaseCore/FirebaseCore.h>

#import "AppDelegate.h"

int main(int argc, char *argv[])
{
  @autoreleasepool {
    if ([FIRApp defaultApp] == nil) {
      [FIRApp configure];
    }
#if DEBUG
    NSLog(@"[Firebase] defaultApp=%@ allApps=%@", [FIRApp defaultApp], [FIRApp allApps]);
#endif
    return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
  }
}
