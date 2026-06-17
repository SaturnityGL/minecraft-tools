DROP-IN SLOTS — Nav buttons styled as Minecraft signs

sign-oak.png         rest state, ~200x80
sign-oak-hover.png   hover state, same dimensions
sign-oak-active.png  active page indicator, same dimensions

These render INSIDE each nav <a> as a background image.
Until they exist, the CSS shows a wooden-gradient fallback that
already looks like a sign, so the layout never breaks.

Tips:
- Transparent PNG, sign shape on a clear background.
- Vanilla oak sign texture from a resource pack works.
- Same width across all three so the hover doesn't shift.

When you drop them in, no code change is needed.
