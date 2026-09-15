#import <AppKit/AppKit.h>
#import <objc/runtime.h>

// Owned by the content view, never a separate NSWindow or an input target.
@interface QuotaMaterialView : NSVisualEffectView
@end
@implementation QuotaMaterialView
- (NSView *)hitTest:(NSPoint)point { return nil; }
@end

static char materialKey;

void quota_update_material(void *handle, double x, double y, double width,
                           double height, double radius, const double *points, size_t count) {
    @autoreleasepool {
        NSWindow *window = (__bridge NSWindow *)handle;
        NSView *content = window.contentView;
        QuotaMaterialView *material = objc_getAssociatedObject(window, &materialKey);
        if (width == 0 || height == 0) {
            [material removeFromSuperview];
            objc_setAssociatedObject(window, &materialKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            return;
        }
        if (!material) {
            material = [[QuotaMaterialView alloc] initWithFrame:NSZeroRect];
            material.material = NSVisualEffectMaterialHUDWindow;
            material.blendingMode = NSVisualEffectBlendingModeBehindWindow;
            material.state = NSVisualEffectStateFollowsWindowActiveState;
            [content addSubview:material positioned:NSWindowBelow relativeTo:nil];
            objc_setAssociatedObject(window, &materialKey, material, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        CGFloat nativeY = content.isFlipped ? y : NSHeight(content.bounds) - y - height;
        material.frame = NSMakeRect(x, nativeY, width, height);
        NSImage *mask = [[NSImage alloc] initWithSize:NSMakeSize(width, height)];
        [mask lockFocus];
        [[NSColor whiteColor] setFill];
        NSBezierPath *path;
        if (radius > 0) {
            path = [NSBezierPath bezierPathWithRoundedRect:NSMakeRect(0, 0, width, height)
                                                 xRadius:radius yRadius:radius];
        } else {
            path = [NSBezierPath bezierPath];
            for (size_t i = 0; i < count; ++i) {
                NSPoint p = NSMakePoint(points[i * 2], height - points[i * 2 + 1]);
                if (i == 0) [path moveToPoint:p]; else [path lineToPoint:p];
            }
            [path closePath];
        }
        [path fill];
        [mask unlockFocus];
        material.maskImage = mask;
    }
}
