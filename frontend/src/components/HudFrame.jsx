// Decorative corner brackets that give panels the "targeting frame" look
// common to sci-fi HUD interfaces. Purely visual — no interaction, so it's
// marked aria-hidden and never intercepts pointer events.
export default function HudFrame() {
  return (
    <div className="hud-frame" aria-hidden="true">
      <span className="hud-corner tl" />
      <span className="hud-corner tr" />
      <span className="hud-corner bl" />
      <span className="hud-corner br" />
    </div>
  );
}
