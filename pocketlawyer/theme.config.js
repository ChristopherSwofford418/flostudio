/** @type {const} */
const themeColors = {
  // Deep midnight navy backgrounds
  primary:    { light: '#C9A84C', dark: '#D4AF5A' },       // Antique gold
  background: { light: '#0A0E1A', dark: '#0A0E1A' },       // Deep midnight (same both modes)
  surface:    { light: '#111827', dark: '#111827' },        // Elevated card surface
  surface2:   { light: '#1A2235', dark: '#1A2235' },        // Second-level surface
  foreground: { light: '#F0EAD6', dark: '#F0EAD6' },       // Warm parchment white
  muted:      { light: '#8A9BB5', dark: '#8A9BB5' },        // Cool slate muted
  border:     { light: '#1E2D45', dark: '#1E2D45' },        // Subtle navy border
  gold:       { light: '#C9A84C', dark: '#D4AF5A' },        // Gold alias
  goldLight:  { light: '#F0D98A', dark: '#F0D98A' },        // Light gold highlight
  goldDim:    { light: '#C9A84C30', dark: '#C9A84C30' },    // Translucent gold
  navy:       { light: '#0A0E1A', dark: '#0A0E1A' },        // Deep navy alias
  success:    { light: '#2ECC8F', dark: '#2ECC8F' },        // Emerald success
  warning:    { light: '#F0B429', dark: '#F0B429' },        // Amber warning
  error:      { light: '#E05252', dark: '#E05252' },        // Muted red error
  tint:       { light: '#C9A84C', dark: '#D4AF5A' },        // Tab tint = gold
};

module.exports = { themeColors };
