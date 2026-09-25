---
name: Kiln
colors:
  primary: "#E68435"
  on-primary: "#231306"
  secondary: "#DFAE4E"
  on-secondary: "#000000"
  surface: "#1A1A1A"
  on-surface: "#EEECE9"
  surface-secondary: "#232323"
  surface-tertiary: "#2B2B2B"
  ink: "#111111"
  accent-text-dark: "#EA9557"
  accent-text-light: "#9E5019"
  muted: "#A3A3A3"
  subtle: "#999999"
  border: "#4D4D4D"
  focus-ring: "rgba(230, 132, 53, 0.4)"
gradients:
  brand: "linear-gradient(135deg, #EE9148 0%, #D8742C 100%)"
  brand-hover: "linear-gradient(135deg, #F29A52 0%, #E0803A 100%)"
  brand-active: "linear-gradient(135deg, #D57A33 0%, #C66A25 100%)"
  amber: "linear-gradient(135deg, #E8B85A 0%, #D6A241 100%)"
  amber-hover: "linear-gradient(135deg, #D6A241 0%, #CC9638 100%)"
  surface: "linear-gradient(180deg, #1C1C1C 0%, #161616 100%)"
  ink: "linear-gradient(180deg, #151515 0%, #0E0E0E 100%)"
  panel: "linear-gradient(180deg, #262626 0%, #1F1F1F 100%)"
  card: "linear-gradient(160deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.04) 100%)"
  ember-glow: "radial-gradient(circle at 80% 20%, rgba(230, 132, 53, 0.14) 0%, rgba(230, 132, 53, 0) 60%)"
  light: "linear-gradient(180deg, #FFFFFF 0%, #F6F4F1 100%)"
typography:
  display-hero:
    fontFamily: Unbounded
    fontSize: 72px
    fontWeight: 700
    lineHeight: 64.8px
  h1-large:
    fontFamily: Unbounded
    fontSize: 56px
    fontWeight: 700
    lineHeight: 48px
  h2-large:
    fontFamily: Unbounded
    fontSize: 48px
    fontWeight: 700
    lineHeight: 48px
  h3:
    fontFamily: Unbounded
    fontSize: 36px
    fontWeight: 400
    lineHeight: 36px
  body-large:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: 400
    lineHeight: 26px
  body-emphasis:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: 500
    lineHeight: 19.2px
  button-ui:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  h1-medium:
    fontFamily: Inter
    fontSize: 37.8px
    fontWeight: 600
    lineHeight: 42px
  h2-medium:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 700
    lineHeight: 26.4px
  h2-small:
    fontFamily: Inter
    fontSize: 16.8px
    fontWeight: 600
    lineHeight: 25.2px
  h3-ui:
    fontFamily: Inter
    fontSize: 14.7px
    fontWeight: 600
    lineHeight: 21px
  body-standard:
    fontFamily: Inter
    fontSize: 16.8px
    fontWeight: 400
    lineHeight: 25.2px
  button-small:
    fontFamily: Inter
    fontSize: 14.7px
    fontWeight: 400
    lineHeight: 25.2px
  input:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
rounded:
  sharp: 0px
  subtle: 8px
  standard: 12px
  rounded: 14px
  xrounded: 16px
  very: 48px
  max: 104px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  2xl: 32px
  3xl: 40px
  4xl: 48px
  5xl: 56px
  6xl: 80px
  8xl: 120px
---
# Kiln Design System

## 1. Visual Theme & Atmosphere

Kiln's design system embraces a warm, youthful, and energetic aesthetic centered around community and connection. The palette combines deep charcoal and near-black tones with a warm amber-orange ember accent and soft same-hue gradients, creating a calm yet approachable interface that is easy on the eyes. The brand exudes playfulness through rounded corners, generous spacing, and illustrative character elements, while maintaining a modern, tech-forward sensibility. The visual language is confident and bold—oversized typography commands attention, high contrast ensures legibility, and strategic use of transparency and subtle shadows create depth without clutter. This is a design system built for social engagement: every element invites interaction, every color choice energizes, and every space breathes with intentional whitespace.

**Key Characteristics:**
- Deep charcoal and near-black backgrounds with warm ember and amber accents, softened by two-stop gradients
- Bold, oversized typography with confident hierarchy
- Generous padding and margin creating spacious, uncluttered layouts
- Rounded corners ranging from subtle to highly pronounced
- High contrast between text and backgrounds for accessibility
- Playful, illustrative supplementary imagery
- Strategic use of transparency and semi-transparent elements
- Emphasis on interactive states and visual feedback

## 2. Color Palette & Roles

### Primary
- **Brand Orange** (`#E68435`): Core interactive elements, primary call-to-action buttons, brand identity (large fills use the Ember gradient below)
- **Ink Black** (`#111111`): Dominant text color on light grounds; deepest dark background

### Accent Colors
- **Copper Accent** (`#C98A5E`): Secondary interactive states, accent highlights
- **Safety Amber** (`#DFAE4E`): Success states, positive actions, link highlights
- **Orange Muted** (`#C27A45`): Subtle interactive elements, hover states for primary orange
- **Orange Text on Light** (`#9E5019`): Orange text, links and nav states on white or light grounds (5.8:1 on white)
- **Orange Text on Dark** (`#EA9557`): Soft ember for text, links, eyebrow labels, active nav and focus borders on every dark surface (6.0:1 or better)

### Interactive
- **Button Background Light** (`#FFFFFF`): Secondary buttons, light mode backgrounds
- **Button Overlay** (`rgba(255, 255, 255, 0.1)`): Ghost buttons, transparent interactive overlays
- **Input Background** (`rgba(0, 0, 0, 0)`): Transparent input fields with subtle borders

### Neutral Scale
- **Pure White** (`#FFFFFF`): Light backgrounds and light cards
- **On Ember** (`#231306`): Warm dark-brown labels and icons on orange fills and the Ember gradient
- **Soft White** (`#EEECE9`): Body text and headings on dark surfaces — softer than pure white to reduce glare (14.8:1 on `#1A1A1A`)
- **Pure Black** (`#000000`): Fallback text color, sharp contrast
- **Light Gray** (`#F6F4F1`): Subtle background tints, light section dividers
- **Medium Gray** (`#A3A3A3`): Secondary text, disabled states, metadata on dark surfaces (use Charcoal Gray on light grounds)
- **Dark Gray** (`#999999`): Tertiary text, captions on dark surfaces (4.9:1 or better on every dark surface)
- **Very Light Gray** (`#E0E0E0`): Minimal borders, dividers
- **Charcoal Gray** (`#333333`): Deep neutral for text on light backgrounds

### Surface & Borders
- **Dark Surface Primary** (`#1A1A1A`): Dark mode primary surface
- **Dark Surface Secondary** (`#232323`): Dark mode secondary surface
- **Dark Surface Tertiary** (`#2B2B2B`): Dark mode tertiary surface
- **Dark Surface Quarternary** (`#262626`): Dark mode interactive surface
- **Border Gray** (`#4D4D4D`): Subtle borders, dividing lines

### Gradients
Two-stop, same-hue gradients replace flat fills wherever a surface is large enough to show one. They lower glare and add depth without new hues. Rules: fills only (never gradient text); any text on a gradient passes 4.5:1 at **both** stops; lightness shifts stay small; no multi-hue blends.
- **Ember** (`linear-gradient(135deg, #EE9148 0%, #D8742C 100%)`): Primary buttons, featured cards, CTA bands, brand panels — dark-brown `#231306` labels (5.5:1 to 7.5:1)
- **Ember Hover** (`linear-gradient(135deg, #F29A52 0%, #E0803A 100%)`) and **Ember Active** (`linear-gradient(135deg, #D57A33 0%, #C66A25 100%)`)
- **Amber** (`linear-gradient(135deg, #E8B85A 0%, #D6A241 100%)`): Action links, success fills — black labels (9.1:1 or better); hover `linear-gradient(135deg, #D6A241 0%, #CC9638 100%)`
- **Surface** (`linear-gradient(180deg, #1C1C1C 0%, #161616 100%)`): Dark page background
- **Ink** (`linear-gradient(180deg, #151515 0%, #0E0E0E 100%)`): Headers, footers, rails, banners
- **Panel** (`linear-gradient(180deg, #262626 0%, #1F1F1F 100%)`): Raised sections, pricing tiers, sidebars
- **Card** (`linear-gradient(160deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.04) 100%)`): Feature cards and stat tiles
- **Ember Glow** (`radial-gradient(circle at 80% 20%, rgba(230, 132, 53, 0.14) 0%, rgba(230, 132, 53, 0) 60%)`): Faint warmth over hero sections only
- **Light** (`linear-gradient(180deg, #FFFFFF 0%, #F6F4F1 100%)`): Light page grounds and light cards

## 3. Typography Rules

### Font Family
**Primary:** Manrope, Unbounded (display and heading emphasis)
Fallback: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

**Secondary:** DM Sans, Inter (body, navigation, and UI text)
Fallback: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|-----------------|-------|
| Display / Hero | Unbounded | 72px | 700 | 64.8px | Normal | Maximum impact, homepage hero titles |
| Heading 1 (Large) | Unbounded | 56px | 700 | 48px | Normal | Page section headers |
| Heading 1 (Medium) | Inter | 37.8px | 600 | 42px | Normal | Section introductions |
| Heading 2 (Large) | Unbounded | 48px | 700 | 48px | Normal | Major section breaks |
| Heading 2 (Medium) | Inter | 22px | 700 | 26.4px | Normal | Subsection titles |
| Heading 2 (Small) | Inter | 16.8px | 600 | 25.2px | Normal | Card titles, feature blocks |
| Heading 3 | Unbounded | 36px | 400 | 36px | Normal | Section accent headers |
| Heading 3 (UI) | Inter | 14.7px | 600 | 21px | Normal | Component labels |
| Body (Large) | Manrope | 20px | 400 | 26px | Normal | Hero copy, prominent descriptions |
| Body (Standard) | Inter | 16.8px | 400 | 25.2px | Normal | Main content, paragraphs |
| Body Emphasis | Manrope | 16px | 500 | 19.2px | Normal | Emphasized copy, callouts |
| Button / UI Text | DM Sans | 16px | 400 | 24px | Normal | Button labels, navigation items |
| Button (Small) | Inter | 14.7px | 400 | 25.2px | Normal | Compact button text |
| Input / Form | Inter | 14px | 400 | 20px | Normal | Form fields, input text |
| Caption / Metadata | Inter | 14px | 400 | 20px | Normal | Helper text, timestamps |

### Principles
- Typography follows a strict modular scale with clear hierarchy—each level is visibly distinct
- Display sizes (56px–72px) are reserved for hero moments and maximum impact
- Body copy defaults to 16.8px–20px for comfortable reading
- All interactive text (buttons, links, navigation) is explicitly weighted (600–700) for clear affordance
- Line height consistently exceeds font size for generous, readable spacing
- Font family changes signal semantic role: display fonts for hierarchy, sans-serif for neutral UI

## 4. Component Stylings

### Buttons

#### Primary Button (Large)
- **Background:** Ember gradient `linear-gradient(135deg, #EE9148 0%, #D8742C 100%)` (solid fallback `#E68435`)
- **Text Color:** `#231306` warm dark brown (7.5:1 at the light stop, 5.5:1 at the deep stop; white fails at 2.7:1)
- **Font:** Manrope, 20px, weight 400
- **Padding:** `19.5px 24px`
- **Border Radius:** `12px`
- **Line Height:** 26px
- **Height:** 65px
- **Hover State:** `background: linear-gradient(135deg, #F29A52 0%, #E0803A 100%)` (6.3:1 or better with the dark-brown label)
- **Active State:** `background: linear-gradient(135deg, #D57A33 0%, #C66A25 100%)` (4.7:1 or better with the dark-brown label)
- **Disabled State:** `opacity: 0.5; cursor: not-allowed`

#### Secondary Button (Light)
- **Background:** `#FFFFFF`
- **Text Color:** `#232323`
- **Font:** Manrope, 20px, weight 400
- **Padding:** `15px 24px`
- **Border Radius:** `12px`
- **Line Height:** 26px
- **Height:** 65px
- **Hover State:** `background: #F0F0F0`
- **Border:** `1px solid #E0E0E0`
- **Active State:** `background: #E8E8E8`

#### Ghost Button (Dark Overlay)
- **Background:** `rgba(255, 255, 255, 0.1)`
- **Text Color:** `#EEECE9`
- **Font:** Manrope, 16px, weight 400
- **Padding:** `17.5px 24px`
- **Border Radius:** `16px`
- **Line Height:** 24px
- **Height:** 56px
- **Border:** None
- **Hover State:** `background: rgba(255, 255, 255, 0.15)`
- **Active State:** `background: rgba(255, 255, 255, 0.2)`

#### Icon Button (Compact)
- **Background:** `rgba(255, 255, 255, 0.1)`
- **Text Color:** `#EEECE9`
- **Font:** DM Sans, 16px, weight 400
- **Padding:** `0px`
- **Border Radius:** `14px`
- **Width:** 40px
- **Height:** 40px
- **Hover State:** `background: rgba(255, 255, 255, 0.15)`

### Links

#### Primary Link (Action)
- **Background:** Amber gradient `linear-gradient(135deg, #E8B85A 0%, #D6A241 100%)`
- **Text Color:** `#000000`
- **Font:** Manrope, 16px, weight 500
- **Padding:** `13px 24px`
- **Border Radius:** `12px`
- **Line Height:** 22px
- **Height:** 48px
- **Hover State:** `background: linear-gradient(135deg, #D6A241 0%, #CC9638 100%)`
- **Active State:** `background: #C28C33`

#### Secondary Link (Text)
- **Background:** Transparent
- **Text Color:** `#333333`
- **Font:** DM Sans, 16px, weight 400
- **Padding:** `0px`
- **Border Radius:** `0px`
- **Line Height:** 24px
- **Height:** 40px
- **Hover State:** `text-decoration: underline; color: #9E5019`
- **Active State:** `color: #7E3F14`

#### Light Link (On Dark)
- **Background:** Transparent
- **Text Color:** `#EEECE9`
- **Font:** Manrope, 16px, weight 500
- **Padding:** `10px 16px`
- **Border Radius:** `12px`
- **Line Height:** 19.2px
- **Hover State:** `background: rgba(255, 255, 255, 0.1)`
- **Active State:** `background: rgba(255, 255, 255, 0.15)`

### Cards & Containers

#### Feature Card (Dark)
- **Background:** Card gradient `linear-gradient(160deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.04) 100%)`
- **Text Color:** `#EEECE9`
- **Font:** Inter, 16px, weight 400
- **Padding:** `56px`
- **Border Radius:** `48px`
- **Line Height:** 24px
- **Border:** None
- **Box Shadow:** Elevation Level 1 (see Section 6)
- **Hover State:** `background: rgba(255, 255, 255, 0.12)`

#### Large Container (Full Width)
- **Background:** Transparent
- **Text Color:** `#EEECE9`
- **Font:** Inter, 14px, weight 400
- **Padding:** `0px`
- **Border Radius:** `104px`
- **Line Height:** 20px
- **Border:** None
- **Width:** 1200px
- **Height:** Auto (variable content)

#### Content Card (Light)
- **Background:** `#FFFFFF`
- **Text Color:** `#000000`
- **Font:** Manrope, 24px, weight 500
- **Padding:** `40px`
- **Border Radius:** `0px`
- **Line Height:** 28.8px
- **Border:** None
- **Box Shadow:** None

### Inputs & Forms

#### Text Input (Dark Mode)
- **Background:** `rgba(0, 0, 0, 0)`
- **Text Color:** `#F2F2F2`
- **Font:** Inter, 14.7px, weight 400
- **Padding:** `10.5px 14.7px 10.5px 42px`
- **Border Radius:** `0px`
- **Border:** `1px solid #3A3A3A`
- **Line Height:** 21px
- **Height:** 63px
- **Width:** 384px
- **Placeholder:** `#999999`
- **Focus State:** `border-color: #EA9557; box-shadow: 0 0 0 3px rgba(230, 132, 53, 0.4)`
- **Disabled State:** `opacity: 0.5; cursor: not-allowed`

#### Text Input (Light Mode)
- **Background:** `rgba(0, 0, 0, 0)`
- **Text Color:** `#333333`
- **Font:** Inter, 14px, weight 400
- **Padding:** `0px`
- **Border Radius:** `0px`
- **Border:** None
- **Line Height:** 20px
- **Height:** 38px
- **Focus State:** `border-bottom: 2px solid #9E5019`

### Navigation

#### Main Navigation Item
- **Background:** Transparent
- **Text Color:** `#333333`
- **Font:** DM Sans, 16px, weight 400
- **Padding:** `0px`
- **Border Radius:** `0px`
- **Line Height:** 24px
- **Height:** Auto
- **Hover State:** `color: #9E5019; border-bottom: 2px solid #9E5019`
- **Active State:** `color: #9E5019; border-bottom: 2px solid #9E5019; font-weight: 600`

#### Dropdown Navigation
- **Background:** `#FFFFFF`
- **Text Color:** `#333333`
- **Font:** DM Sans, 16px, weight 400
- **Padding:** `12px 16px`
- **Border Radius:** `8px`
- **Line Height:** 21px
- **Border:** `1px solid #E0E0E0`
- **Box Shadow:** Elevation Level 2
- **Hover Item:** `background: #F6F4F1`

## 5. Layout Principles

### Spacing System

**Base Unit:** 4px

**Scale:**
- **Micro:** 4px (tight spacing within components)
- **Extra Small:** 8px (small padding, gaps)
- **Small:** 12px (standard button padding)
- **Medium:** 16px (standard gap between elements)
- **Large:** 20px (padding within cards)
- **Extra Large:** 24px (section margin)
- **2X Large:** 32px (major gap between sections)
- **3X Large:** 40px (substantial card padding)
- **4X Large:** 48px (large section spacing)
- **5X Large:** 56px (very large card/container padding)
- **6X Large:** 80px (major layout padding)
- **8X Large:** 120px (hero section padding)

**Usage Context:**
- Buttons use 12px–20px padding vertically and horizontally for touchable comfort
- Card interiors use 40px–56px padding for breathing room
- Section gaps use 24px–48px based on hierarchy importance
- Hero sections use 80px–120px for maximum visual impact

### Grid & Container

**Max Width:** 1200px (primary content container)

**Column Strategy:** 12-column flexible grid with gutter support

**Section Patterns:**
- Hero section spans full width with centered 1200px max-width content
- Feature sections stack 2–4 columns on desktop, collapse to single column on mobile
- Navigation sits fixed or sticky at 64px height, full width
- Footer regions use full-width sections with 1200px centered max-width content

### Whitespace Philosophy

Kiln's whitespace strategy creates breathing room and visual hierarchy. The system favors generous vertical spacing (56px–120px between major sections) over cramped layouts. Horizontal padding is consistent at 40px–80px for desktop, creating comfortable margins. Internal card padding (40px–56px) prevents content from feeling claustrophobic. This approach signals premium, high-confidence design—space equals value. Negative space is used strategically to guide the eye and separate concerns.

### Border Radius Scale

- **Sharp (0px):** Input fields, text links, minimal UI (horizontal rules, dividers)
- **Subtle (8px):** Dropdown menus, small modals
- **Standard (12px):** Buttons, small cards, badges
- **Rounded (14px):** Icon buttons, compact interactive elements
- **Extra Rounded (16px):** Ghost buttons, medium cards
- **Very Rounded (48px):** Large feature cards, container accents
- **Maximum (104px):** Full-width hero containers, section backgrounds

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Base | No shadow | Body text, primary backgrounds, neutral states |
| Elevation 1 | `0px 0px 0px 2px rgba(0, 0, 0, 0.05)` | Subtle focus rings, small cards |
| Elevation 2 | `0px 0px 0px 1px oklab(0.442733 0 0 / 0.3)` | Buttons, hover states, interactive elements |
| Elevation 3 | `0px 0px 0px 1px oklab(0.376763 0 0 / 0.25), 0px 1px 2px 0px rgba(0, 0, 0, 0.05)` | Elevated cards, modals, dropdowns |

**Shadow Philosophy:**
Kiln minimizes heavy shadows in favor of subtle border and opacity-based depth. This creates a flatter, more modern aesthetic while maintaining visual separation. Shadows are used sparingly—primarily for interactive feedback (hover, focus) and modal layering. The system relies on color contrast, transparency, and careful spacing to establish hierarchy rather than dramatic shadow work. When shadows do appear, they are soft and subtle, never harsh or posterizing.

### Opacity Levels

- **10%** (`0.10`): Barely perceptible overlays, minimal visual weight
- **50%** (`0.50`): Moderate transparency, semi-visible (disabled states)
- **65%** (`0.65`): Significant transparency, clearly visible but secondary
- **89%** (`0.89`): Nearly opaque, subtle transparency
- **90%** (`0.90`): Nearly full opacity, slight transparency for refinement
- **Disabled:** 50% opacity with `cursor: not-allowed`
- **Hover Overlay:** 10–15% opacity increase from base state
- **Focus Ring:** 10–20% opacity for non-intrusive visual feedback

### Z-index / Layering

- **Base Layer (1–3):** Body content, primary sections, standard cards
- **Lifted Layer (4–5):** Floating elements, semi-sticky components, elevated cards
- **Sticky Layer (6–7):** Fixed navigation, sticky headers
- **Dropdown Layer (10):** Dropdown menus, select lists, popovers
- **Modal Layer (20+):** Modals, overlays, critical interruptions
- **Toast Layer (30+):** Notifications, toasts, temporary messages

Stacking context is managed carefully to prevent unexpected layering conflicts. Each layer type has explicit z-index ranges to maintain predictable visual hierarchy.

## 7. Do's and Don'ts

### Do

- **Use the Ember gradient** (`#EE9148` → `#D8742C`) with dark-brown `#231306` labels for all primary call-to-action buttons and key interactive moments
- **Prefer gradients over flat fills** on any surface large enough to show one—two stops, same hue, text checked at both ends
- **Maintain generous spacing** between sections—minimum 24px gaps, preferably 40px–80px for major sections
- **Prioritize high contrast** for readability—always ensure WCAG AA compliance (4.5:1 for body text)
- **Apply rounded corners consistently** using the defined scale (12px for buttons, 48px for cards, 104px for containers)
- **Use the Manrope font** for display/hero content and emphasis, **Inter** for neutral UI and body copy
- **Follow the modular typography scale**—never introduce arbitrary font sizes between defined roles
- **Implement hover states** on all interactive elements with visual feedback (color shift, background change, shadow)
- **Use opacity-based transparency** (10%–20%) for subtle depth rather than heavy shadows
- **Group related navigation items** in dropdowns with consistent padding and hover states
- **Reserve bright accent colors** (`#DFAE4E`, `#C98A5E`) for success states, positive actions, or secondary emphasis

### Don't

- **Avoid mixing font families** within a single component—use either display or sans-serif, not both
- **Never use font sizes** outside the defined typography hierarchy (no random 18px or 42px text)
- **Don't apply shadows** heavier than Elevation Level 3—Kiln favors flatness and subtle visual separation
- **Avoid low-contrast combinations** like dark gray text on charcoal backgrounds (always test with WCAG tools)
- **Don't use the primary orange** for secondary or passive elements—reserve it for highest-priority CTAs
- **Never cramped spacing**—padding below 12px or section gaps below 24px feel cheap and claustrophobic
- **Avoid inconsistent border radius**—stick to the defined scale (0px, 8px, 12px, 14px, 16px, 48px, 104px)
- **Don't introduce colors outside the palette** without careful documentation and cross-team approval
- **Avoid opacity values** outside the defined range (don't invent 75% or 85% opacity)
- **Don't layer elements** with z-index values between the defined ranges—stick to the stacking strategy (1–3, 4–5, 6–7, 10, 20+, 30+)

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|------------|
| Mobile | 320px–479px | Single column, 16px padding, 32px section gap, 40px button height |
| Tablet | 480px–767px | 2 columns, 20px padding, 40px section gap, 48px button height |
| Small Desktop | 768px–1023px | 3 columns, 24px padding, 48px section gap, 56px button height |
| Desktop | 1024px–1199px | 4 columns, 40px padding, 56px section gap, 65px button height |
| Large Desktop | 1200px+ | 1200px max-width centered, full spacing scale applied |

### Touch Targets

- **Minimum Height:** 48px (button, link, clickable area)
- **Minimum Width:** 48px (square interactive elements)
- **Minimum Padding:** 12px around touch target content
- **Spacing Between Targets:** 16px minimum gap to prevent accidental clicks
- **Icon Buttons:** 40px–56px (square), centered icon within
- **Form Inputs:** 44px–63px height for comfortable touch interaction
- **Navigation Items:** 48px min-height with 12px–16px horizontal padding

### Collapsing Strategy

**Typography:**
- Display heading (72px) → 56px (tablet) → 48px (mobile)
- Heading 1 (56px) → 48px (tablet) → 36px (mobile)
- Heading 2 (48px) → 40px (tablet) → 32px (mobile)
- Body (20px) → 18px (tablet) → 16px (mobile)

**Spacing:**
- Hero padding: 120px (desktop) → 80px (tablet) → 40px (mobile)
- Section gap: 56px (desktop) → 40px (tablet) → 24px (mobile)
- Card padding: 56px (desktop) → 40px (tablet) → 24px (mobile)

**Layout:**
- Cards: 4-column (desktop) → 2-column (tablet) → 1-column (mobile)
- Navigation: Horizontal menu (desktop) → Hamburger menu (tablet/mobile)
- Buttons: Full-width primary buttons below 768px, side-by-side above
- Max-width: 1200px (desktop) → 100% (tablet/mobile with 20px margin)

**Images & Media:**
- Scale proportionally down from desktop size
- Maintain aspect ratios across all breakpoints
- Lazy-load below-the-fold images on mobile

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA Button:** Ember gradient (`#EE9148` → `#D8742C`) with `#231306` label
- **Secondary CTA Button:** Amber gradient (`#E8B85A` → `#D6A241`), black label
- **Background (Light):** Pure White (`#FFFFFF`)
- **Background (Dark):** Surface gradient (`#1C1C1C` → `#161616`); Ink gradient for headers and footers
- **Body Text (Dark Background):** Soft White (`#EEECE9`)
- **Body Text (Light Background):** Ink Black (`#111111`)
- **Heading Text:** Ink Black (`#111111`) or Soft White (`#EEECE9`)
- **Secondary Text:** Medium Gray (`#A3A3A3`)
- **Border:** Very Light Gray (`#E0E0E0`)
- **Hover/Focus:** Orange Text on Dark (`#EA9557`)
- **Success/Accent:** Safety Amber (`#DFAE4E`)
- **Secondary Accent:** Copper Accent (`#C98A5E`)
- **Transparent Overlay (Light):** `rgba(255, 255, 255, 0.1)`
- **Transparent Overlay (Dark):** `rgba(0, 0, 0, 0.1)`

### Iteration Guide

1. **Color Application:** Every primary CTA uses the Ember gradient with dark-brown text (`#231306`); orange text uses `#EA9557` on dark grounds and `#9E5019` on light grounds. Secondary CTAs use the Amber gradient with black text. Use gradients instead of flat fills wherever the surface is large enough. All interactive elements need hover state color shifts (10% darker or +10% opacity change).

2. **Typography Foundation:** All display/hero text uses Manrope or Unbounded at 56px–72px, weight 700. Body copy defaults to Inter at 16px–20px, weight 400. Navigation and UI labels use DM Sans at 16px, weight 400–500.

3. **Spacing Discipline:** Never add padding below 12px or section gaps below 24px. Use the defined scale: 4px (micro) → 8px → 12px → 16px → 20px → 24px → 32px → 40px → 48px → 56px → 80px → 120px. This creates visual harmony and prevents the design from feeling inconsistent.

4. **Border Radius Consistency:** Apply `0px` (none) for minimal UI, `12px` for buttons and small cards, `16px` for ghost buttons, `48px` for feature cards, `104px` for hero containers. Never introduce arbitrary radius values.

5. **Interactive Feedback:** Every button, link, and interactive element must have a distinct hover state (color shift, opacity change, or subtle shadow). Focus states require a 3px outline or inset box-shadow at `0 0 0 3px rgba(230, 132, 53, 0.4)` for accessibility.

6. **Elevation & Depth:** Avoid heavy shadows—use subtle borders (1px), opacity shifts (+10%), or color shifts instead. Maximum shadow is Level 3: `0px 1px 2px 0px rgba(0, 0, 0, 0.05)`. Most interactive elements need only a 2px border focus ring.

7. **Responsive Breakpoints:** Build mobile-first: start at 320px with single column, 16px padding, 32px gaps. Scale up progressively: 480px (2-col), 768px (3-col), 1024px (4-col), 1200px (fixed max-width). Font sizes and spacing contract on mobile, expand on desktop.

8. **Contrast & Accessibility:** All text must pass WCAG AA (4.5:1 contrast) minimum. Test dark text on light backgrounds and light text on dark backgrounds. Use the defined neutral scale to ensure sufficient separation. Never use low-contrast combos like `#999999` on `#A3A3A3`, white or soft-white text on the Ember gradient (2.7:1 — use `#231306`), or any orange fill color used as text.

9. **Component Consistency:** Buttons are always 40px–65px height with clear padding. Cards use 40px–56px padding, always with rounded corners. Inputs are always 38px–63px height with left-aligned text and 12px padding. Follow these minimums—don't shrink components below legibility.

10. **Animation & Microinteraction:** All hover and focus states complete in 200ms–300ms. Use ease-in-out timing functions. Transitions apply to color, background, and opacity—never animate position or layout (no jank). Disabled states get 50% opacity + `cursor: not-allowed`.

## As shipped in Tournament Tracker

Recorded from the built code (`frontend/src/index.css` and the components listed in the sidecar), not from the plan. The sections above are the Kiln reference. Where this build differs from them, this section describes what actually shipped. Scope: the app shell on every page, the tournament page (`/tournaments/:id`), the courts list (`/tournaments/:id/courts`) and the court view (`/tournaments/:id/courts/:court`). Machine-readable copy: `frontend/.impeccable/design.json`.

### Tokens (`:root` in `frontend/src/index.css`)

Dark is the default. When the device is in light mode (`prefers-color-scheme: light`), the Kiln light grounds replace the dark ones, because they read better in direct sun.

| Token | Dark (default) | Light override | Role |
|---|---|---|---|
| `--ground` | `linear-gradient(180deg, #1c1c1c, #161616)` | `linear-gradient(180deg, #ffffff, #f6f4f1)` | Page body (fixed) |
| `--ink` | `linear-gradient(180deg, #151515, #0e0e0e)` | none, stays dark | App bar, board-head band, court strip, flip cards and score chips |
| `--panel` | `linear-gradient(180deg, #262626, #1f1f1f)` | `linear-gradient(180deg, #ffffff, #f6f4f1)` | Cards: pool, bracket, result, setup note, scoreboard columns, court tiles |
| `--surface` | `#1a1a1a` | `#ffffff` | Drawer, modal, root background |
| `--surface-2` | `#232323` | `#f6f4f1` | Team chips, code, loading bars, series game rows, Up next rows |
| `--surface-3` | `#2b2b2b` | `#e0e0e0` | Bracket match boxes, loading shimmer, the +1 button |
| `--text` | `#eeece9` | `#111111` | Body and headings |
| `--muted` | `#a3a3a3` | `#333333` | Labels, table heads, notes |
| `--subtle` | `#999999` | `#333333` | Placeholders |
| `--accent-text` | `#ea9557` | `#9e5019` | Links, disclosure summaries, focused field edge, save errors, court tile hover ring |
| `--border` | `#4d4d4d` | `#e0e0e0` | Bracket connectors, scrollbar |
| `--hairline` | `rgba(255,255,255,.1)` | `rgba(0,0,0,.1)` | Table rules, drawer edges, box strokes, outlines on −1, disabled Finish match and free courts |
| `--field-border` | `#4d4d4d` | `#4d4d4d` | Input and select edges. Kept heavy in light mode so they survive glare |
| `--ghost`, `--ghost-hover`, `--ghost-active` | white at .10, .15, .20 | black at .10, .15, .20 | Default (secondary) button fills |
| `--amber` | `#dfae4e` | same | Amber as a mark |
| `--amber-tint` | `rgba(223,174,78,.1)` | `rgba(223,174,78,.2)` | Background of advancing rows |
| `--amber-text` | `#dfae4e` | `#9e5019` | Amber as text: advancing places, winning scores, the champion label. In light mode it becomes the copper-brown `#9e5019`, because `#dfae4e` is not legible on white |
| `--ember`, `--ember-hover`, `--ember-active` | 135deg `#ee9148`→`#d8742c`, `#f29a52`→`#e0803a`, `#d57a33`→`#c66a25` | same | The primary action only |
| `--on-ember` | `#231306` | same | Label on ember |
| `--ember-solid` | `#e68435` | same | Caret and `accent-color`; the caret in a flip card being typed into |
| `--ember-glow` | radial at 80% 20%, `rgba(230,132,53,.14)` fading out by 60% | same | Board-head band only |
| `--selection` | `rgba(230,132,53,.4)` | same | `::selection` background |
| `--focus` | `0 0 0 3px rgba(230,132,53,.4)` | same | Every focus-visible ring |
| `--elevation-3` | 1px white ring at .1 plus `0 1px 2px rgba(0,0,0,.05)` | ring in black at .1 | Cards, scoreboard columns, court tiles, modal |
| `--shadow-float` | `0 8px 24px rgba(0,0,0,.3)` | same | Toasts only, under their ring |
| `--scrim` | `rgba(0,0,0,.5)` | same | Behind the open Manage drawer and the modal |
| `--band-text`, `--band-muted` | `#eeece9`, `#a3a3a3` | same | Text on ink, whatever the device theme: bands, strips, flip-card numerals, score chips |
| `--band-accent` | `#ea9557` | same | Accent on ink: stage-chip dot, Courts and All courts links, health error dot, pressed Swap sides edge, typing ring on a flip card, toast error edge |
| `--band-ghost`, `--band-ghost-hover` | white at .10, .15 | same | Ghost fills on ink (nav, Manage toggle, stage chip, Swap sides, toast ring); `--band-ghost` is also the top-half lift on a score chip |
| `--band-divider` | `rgba(255,255,255,.08)` | same | The app bar's bottom rule |
| `--toast` | `#232323` | same | Toast fill. Toasts stay dark in both themes, like the band |
| `--status-idle` | `#999999` | same | The health dot before the first check |
| `--error-ring` | `rgba(234,149,87,.3)` | same | The 3px halo on the health error dot |
| `--flip-top` | `rgba(255,255,255,.06)` | same | The lighter top half of a flip card, laid over `--ink` |
| `--flip-seam` | `rgba(0,0,0,.7)` | same | The dark hinge seam across a flip card and a score chip |
| `--gutter` | 16px | 24px from 768px, 40px from 1024px | Horizontal page padding |
| `--section-gap` | 32px | 48px from 768px, 56px from 1024px | Space between page sections |
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | same | Drawer, toast, disclosure and new-match motion |

Content max-width is 1200px. The court view's scoreboard, Finish match and Up next share a 640px centered column. No literal colors remain in the stylesheet outside `:root`.

### Type roles as used

Loaded from Google Fonts: Unbounded 400/700, Inter 400 to 700, Manrope 500/700, DM Sans 500.

- **Unbounded 700 (`--display`)** is used for names, section heads and scoreboard numerals:
  - Tournament name (`h2.board-title`): 32/36, and 48/48 from 768px, tracking -0.02em.
  - Section heads (`h3`: Standings, Playoffs, Results, Up next): 24/28, and 28/32 from 768px, tracking -0.01em.
  - Card heads (`.pool-card-head h4`): pool and bracket names at 22/26.4.
  - Also at 22/26.4: the champion's name on a result card, the Manage drawer title, modal titles.
  - Court names: 28/32 on the court strip (`.court-strip h2`, also "Courts"), 24/28 on a courts-list tile.
  - **Scoreboard numerals** (`.flip-half`): sized by digit count with container query units, so they fill the card at any width. One digit is `min(84cqi, 168px)`, two digits `min(56cqi, 128px)`; line height 1.3, `tabular-nums`, tracking -0.02em (-0.04em for two digits). The card itself is at least `min(112cqi, 220px)` tall, measured against its column (`.flip-column` is the inline-size container). While a score is being typed, the overlaid input shows its digits at `min(54cqi, 128px)`.
  - Score chips on a courts-list tile: 28/40, `tabular-nums`, tracking -0.02em.
  - Up next order numbers: 16px, `tabular-nums`, in `--muted`.
  - The brand word: 16px.
- **Inter (`--ui`)** is the working face:
  - Root body: 16.8/25.2.
  - Tables: 16/24, headers 600 at 14/20.
  - Labels: 600 at 14.7/21. Court labels and the save status line use 500 at 14.7/21.
  - Fields: 16/24.
  - Notes and captions: 14/20 (including the Finish match notes).
  - Plain `h4` (drawer sections, result-card tier): 600 at 16.8/25.2.
  - Series tally: 600 at 16/24 in `--muted`. Series game lines and Up next rows: 500 at 16/24.
  - Numbers use `tabular-nums` in tables, number inputs, the bracket, the series tally and game lines.
- **DM Sans 500 (`--nav`)**: buttons, nav links, the board meta line, disclosure summaries, the Manage toggle and the court strip's links, all at 16/24.
- **Manrope 700 (`--emphasis`)** sets the court's hands-on text:
  - The primary action (`.btn-primary`, `button[type=submit]`), at 16/24.
  - Team names over each scoreboard column (`.flip-team`): 18/24, centered.
  - +1 at 24px and −1 at 18px, each an SVG glyph plus the digit, with `tabular-nums`.

### Components

- **App bar** (`.app-bar`):
  - Sticky, z-index 6, `--ink` fill, 1px `--band-divider` bottom rule.
  - The inner row is at least 64px tall and at most 1200px wide.
  - The brand is a 28px ember tile (8px radius) holding a 16px SVG mark in `--on-ember`, next to the Unbounded word.
  - Nav links and buttons are at least 48px tall with 12px radius and `--band-ghost` fills.
  - Icon buttons are 48px square (44px on phones) with 14px radius.
  - Health is an 8px dot with a visually hidden label: `--status-idle` before the first check; the error state is `--band-accent` with a 3px `--error-ring` halo.
  - Below 640px the bar stays one row, the brand word is visually hidden, and the Home link is dropped.
- **Board-head band** (`.board-head`):
  - A full-bleed ink band pulled up under the app bar, filled with `--ember-glow` over `--ink`.
  - At 1200px and wider, the bottom corners round to 16px.
  - It holds the tournament name, a meta line in `--band-muted`, and the Manage toggle on the right. The meta line has the stage chip and a Courts link in `--band-accent` that is at least 48px tall.
- **Stage chip** (`.stage-chip`):
  - 12px radius, `--band-ghost` fill, `--band-text`, Inter 600 at 14.7/21, padding 4px 12px.
  - Leads with an 8px `--band-accent` dot.
- **Pool and bracket cards** (`.pool-grid` and `.pool-card`):
  - The grid is `repeat(auto-fit, minmax(min(100%, 340px), 1fr))` with a 16px gap: side by side on a laptop, stacked on a phone.
  - Each card has a `--panel` fill, 16px radius, `--elevation-3`, 20px padding and a 12px internal gap.
  - The head row pairs the Unbounded name with a DM Sans link that is at least 48px tall.
  - The playoffs panel uses the same card for each bracket tier. Its diagram scrolls sideways inside the card (`.bracket-scroll`).
- **Standings** (`table[aria-label='Standings']`):
  - Full width with `--hairline` row rules. Numbers are right-aligned, the team name is left-aligned at weight 600, and the rank is in `--muted`.
  - Advancing rows (`tr.advancing`) get a full-row `--amber-tint` background, and their rank switches to `--amber-text` at 700. They have no side stripe or border accent.
  - The footer (`.standings-foot`) holds a key and a transparent refresh button in `--accent-text`. The key (`.advance-note`) is a 14px tinted swatch with an `--amber-text` edge plus "Top N advance to the playoffs".
- **Results cards** (`.results-list`):
  - The same grid and card treatment as the pool cards, with a 6px internal gap.
  - Each card has the tier head in Inter 600, a "Champion:" label in `--amber-text` (Inter 600 at 14/20), the champion's name in Unbounded 22, the runner-up as a muted note, and a "Full placings" link.
- **Manage drawer** (`details.manage`):
  - The summary is a DM Sans toggle on the band, with a 20px SVG and a `--band-ghost` fill.
  - When open, `--scrim` covers the page and a fixed right-hand panel opens, `min(480px, 100%)` wide, in `--surface` with a hairline left edge.
  - The panel slides in over 300ms (`drawer-in`, a 24px translate on `--ease`), with a 32px gap between sections.
  - The panel head is sticky, with an Unbounded 22 title and an icon close button.
  - The danger zone sits last, above a hairline, with its button text in `--accent-text`.
- **Toasts**: `--toast` fill in both themes, a `--band-ghost` ring plus `--shadow-float`; an error toast swaps the ring for a `--band-accent` edge. They enter over 300ms (`toast-in`) on `--ease`.
- **Bracket diagram** (`.bracket-svg`):
  - Inter 16/22 with tabular numerals. Team names are 16px; meta lines (`.bracket-meta`) are 14px in `--muted`.
  - The winning score (`.bracket-score-won`) is in `--amber-text`.
  - Match boxes are 176px wide on `--surface-3` with a hairline stroke. Connectors are `--border` at 1.5px, and rounds are 60px apart.
  - Match action buttons are a compact 32px variant, used only inside the diagram.
- **Court strip** (`.court-strip`, court view and courts list):
  - An ink band like the board head but without the glow: `--ink` fill, `--band-text`, pulled up under the app bar (margin-top -24px), padding 12px `--gutter`. At 1200px and wider its bottom corners round to 16px.
  - Holds the court name (Unbounded 28/32), the court label in `--band-muted` (Inter 500 at 14.7/21), and on the right a DM Sans link in `--band-accent`, at least 48px tall ("All courts" on the court view, "Back to tournament" on the list).
  - On the court view (`.court-strip-narrow`) the strip's content is inset to the 640px scoreboard column: `padding-inline: max(var(--gutter), calc((100% - 640px) / 2))`. Below 768px it stays one row.
  - **Swap sides** (`.swap-sides`, only while a match is on): a `--band-ghost` toggle (hover `--band-ghost-hover`) with a 20px SVG and the label. `aria-pressed="true"` adds a 1px inset `--band-accent` edge. Below 768px it is a 48px icon-only square with the label visually hidden. It reverses the columns on screen only; scores stay with their teams, and the choice is remembered per court on the device (`localStorage`, `court-sides:<tournament>:<court>`).
- **Flip scoreboard** (`.flip-board`, `FlipBoard.jsx`):
  - Two equal columns, 12px apart, in the 640px centered column. Each column (`.flip-column`) is a `--panel` card, 16px radius, `--elevation-3`, 12px padding and a 10px internal gap (12px 4px 4px on phones, so the card takes the full width). The team name sits on top in Manrope 700 18/24, at least 48px tall.
  - **Flip card** (`.flip-card`): `--ink` in both themes, 12px radius, the numeral in `--band-text`. The top half is lighter (`--flip-top` over `--ink`); a 3px `--flip-seam` seam crosses the middle. Each half is the whole numeral clipped to its half, stacked in one grid cell so they line up exactly.
  - **The flip**: when a score changes (a tap, a typed value or another device), the old top half folds down over the hinge (`flip-fold`, 90ms ease-in, `rotateX` 0 to -90deg) and then the new bottom half drops into place (`flip-drop`, 90ms ease-out after a 90ms delay, from `rotateX(90deg)`): 180ms in all, with `perspective: 600px`. Reduced motion skips both, and the new number simply shows.
  - **Typing**: a number input lies over the card with transparent text. On focus it shows its digits in `--band-text` on `--ink`, with an `--ember-solid` caret and a 2px inset `--band-accent` ring.
  - A new match comes onto the board with `match-in`: 320ms on `--ease`, from opacity .4 and 24px lower.
  - Spectators (signed out) get the same board read-only, with no buttons, under a sign-in line and, for a series, the tally.
- **+1 / −1** (`.flip-plus`, `.flip-minus`), full column width under each card:
  - +1: `--surface-3` fill, 72px tall (88px on phones), hover `--ghost-hover`, active `--ghost-active`, 22px SVG plus.
  - −1: 48px tall, transparent with a 1px inset `--hairline` outline, `--muted` text, 18px SVG minus. Disabled at 0.
  - On phones a scorekeeper's board fills the first view (`min-height: calc(100svh - 176px)`) and the cards stretch, so +1 sits in the thumb zone and Finish match at the bottom.
- **Save status line** (`.save-status`, `SaveStatus.jsx`, `role="status"`): centered Inter 500 at 14.7/21 in `--muted`, at least 24px tall so the board does not jump. It reads "Saving…" (points are sent 600ms after the last tap, as one running score), then "Saved"; nothing before the first change. A failed save ("Couldn’t save the score…") and a version conflict ("Someone else updated this match.") switch to `--accent-text` with a Try again or Refetch latest ghost button.
- **Finish match** (`.btn-primary.finish-match`, also "Record game N" on a series board): full width of the 640px column, at least 56px tall. It is ember only when it can be pressed. Disabled (tied, saving, finishing or in conflict) it is a ghost outline: `--ghost` fill, `--muted` text, a 1px inset `--hairline` edge, full opacity. A tie shows "A match can’t finish tied." as a `.finish-note` (Inter 14/20, `--muted`) above it. Finishing asks for confirmation in the modal first.
- **Series on the board** (`.series-board`, `SeriesForm` with `board`):
  - The tally (`.series-tally`) on top: "A vs B · best of N · x–y", Inter 600 16/24 in `--muted`, centered, tabular.
  - Then the game in play on the flip scoreboard, its save status and Record game N.
  - Then the games so far (`.series-games`), each a `--surface-2` row with 12px radius, padding 8px 8px 8px 16px: "Game N: a–b" in Inter 500 16/24, with the winning side's score (`.game-won`) in `--amber-text` at 700, and a Fix game N button. Empty lists are hidden.
- **Up next** (`.up-next`): below the fold on phones, in the 640px column. An Unbounded section head, a playoff note when the matches go to the next free court of that kind, then an ordered list: each row a `--surface-2` block, 12px radius, at least 56px tall, padding 8px 16px, Inter 500 16/24, led by its number in Unbounded 700 16 `--muted`.
- **Empty court**: the setup-note card ("Nothing left to play on this court right now.").
- **Courts list** (`.court-list`, `CourtsPage.jsx`):
  - A grid of `repeat(auto-fill, minmax(min(100%, 300px), 1fr))` with a 12px gap; each whole tile is the link to that court.
  - A busy court's tile (`.court-link`): `--panel`, 16px radius, `--elevation-3`, 16px padding, 8px gap. Hover swaps the elevation for a 1px inset `--accent-text` ring (200ms). The head is the court name in Unbounded 24/28 and its label in Inter 500 14.7/21; a series adds "Best of N · Games x–y" in the same label style.
  - One line per team: the name at weight 600 in `--text`, and a **score chip** (`.court-link-chip`), a small flip card: `--ink` with a `--band-ghost` top half (stronger than `--flip-top`, so it reads at chip size), a 1px `--flip-seam` seam at .7, a `--hairline` ring, 8px radius, at least 64px wide, padding 4px 10px, the score in Unbounded 700 28/40 `--band-text`.
  - A free court (`[data-free]`) has no board: one outlined line, transparent with a 1px inset `--hairline` edge (hover `--accent-text`), and "Free" pushed to the right in Inter 500 14.7/21.
- **Buttons and fields**:
  - The default button is a ghost fill with 12px radius, at least 48px tall, padding 12px 20px, in DM Sans 500.
  - Disabled buttons drop to opacity .5 with a `not-allowed` cursor (Finish match overrides this, above).
  - Inputs and selects are square (0 radius) with a 1px `--field-border`. On focus the edge turns `--accent-text` and gets the `--focus` ring.
- **Radii in use**:
  - 0 for fields
  - 4 for focus rings and code
  - 8 for the brand tile, loading bars and score chips
  - 12 for buttons, chips, toasts, flip cards, series game rows and Up next rows
  - 14 for icon buttons
  - 16 for cards, scoreboard columns, court tiles, the modal and the band and strip corners

  The reference's 48px and 104px radii do not appear in this build.

### Named rules

1. **Amber means advancing or winning, and nothing else.** It marks advancing standings rows (tint plus amber rank), the advance key, winning bracket scores, the champion label, and the winning side's score in each finished game of a series. It is never used for decoration, status or emphasis; the live scoreboard itself carries no amber.
2. **The ember gradient is for the one primary action on a view.** Only `.btn-primary` and submit buttons use it; the brand tile carries it as the product mark. On the court view that action is Finish match, or Record game on a series board, and it wears ember only once it can be pressed. Secondary actions stay ghost, and +1 is a plain surface fill, not ember.
3. **The ember glow is for the board-head band only.** No other surface uses `--ember-glow`; the court strip is plain ink.
4. **Ink is for bands and boards.** `--ink` fills the app bar, board head, court strip, flip cards and score chips in both themes. Text and accents on it use the `--band-*` tokens, not the theme tokens.
5. **Standings are the page.** Organizer tools live in the Manage drawer or behind disclosures and never sit at equal weight with the board.
6. **Targets work at arm's length.** Every interactive element is at least 48px tall, except the compact bracket match actions (32px) and the standings refresh button (40px). On the court view the targets grow: +1 is 72px (88px on phones) and Finish match 56px.
7. **The score comes first on a court.** The two columns and their numerals own the first view on a phone; the save status, Finish match and Up next follow in that order, and nothing sits above the board but the court strip.

### Not yet overhauled

These pages still use the default `.app-main > section` spacing and have not had a Kiln pass:

- Bracket page (`BracketPage`). Its champion line in `BracketDiagram.jsx` still shows a 🏆 emoji. It is due to be replaced and is not part of the system.
- Pool page (`PoolPage`, `PoolSchedule`).
- The others: team page, main page, account and login pages, the tournament create form, and the score and correction forms. `SeriesForm` has had a pass only in its court-board mode; its plain form (fix-game fields, conflict and error lines) has not.

Treat how those pages look today as a gap to close, not as a pattern to copy.
