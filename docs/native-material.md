# Native desktop material checkpoints

- `v0.2.7-css-glass-baseline`: original shared workbench CSS; no native desktop blur.
- `v0.2.7-macos-material`: AppKit NSVisualEffectView inside the existing widget window, behind-window blending, shape mask and transparent shadow padding. Windows remains at the CSS baseline.

The original CSS blur, saturation, highlights and shadow parameters are retained. Native material only samples the desktop behind Glass (orb and card) and Nexus (expanded card). Other skins remove the material. Native Nexus masking approximates the SVG's 2px corner curves with straight segments.

macOS source requires an actual Mac/Xcode build and visual validation. Windows-hosted Rust tests do not compile Objective-C or prove macOS rendering. This checkpoint is implementation source, not a verified macOS installer.

Check on each OS: desktop text/background genuinely blurs; no rectangular solid background; rounded corners and Nexus cutout are clear; the 32px Glass padding remains clear; switching skins, collapsing, moving and changing DPI keep the material aligned. System accessibility/transparency settings can suppress native translucency.
