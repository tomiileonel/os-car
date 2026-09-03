---
name: Industrial Telemetry & Workshop Suite
colors:
  surface: '#131316'
  surface-dim: '#131316'
  surface-bright: '#39393c'
  surface-container-lowest: '#0e0e11'
  surface-container-low: '#1b1b1e'
  surface-container: '#1f1f22'
  surface-container-high: '#2a2a2d'
  surface-container-highest: '#353438'
  on-surface: '#e4e1e6'
  on-surface-variant: '#cec7ab'
  inverse-surface: '#e4e1e6'
  inverse-on-surface: '#303033'
  outline: '#979177'
  outline-variant: '#4b4732'
  surface-tint: '#e0c700'
  primary: '#fffbff'
  on-primary: '#383000'
  primary-container: '#fce006'
  on-primary-container: '#706300'
  inverse-primary: '#6b5f00'
  secondary: '#ffb3ad'
  on-secondary: '#68000a'
  secondary-container: '#a40217'
  on-secondary-container: '#ffaea8'
  tertiary: '#fbfcff'
  on-tertiary: '#00354a'
  tertiary-container: '#bde5ff'
  on-tertiary-container: '#006a90'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe317'
  primary-fixed-dim: '#e0c700'
  on-primary-fixed: '#201c00'
  on-primary-fixed-variant: '#514700'
  secondary-fixed: '#ffdad7'
  secondary-fixed-dim: '#ffb3ad'
  on-secondary-fixed: '#410004'
  on-secondary-fixed-variant: '#930013'
  tertiary-fixed: '#c4e7ff'
  tertiary-fixed-dim: '#7bd0ff'
  on-tertiary-fixed: '#001e2c'
  on-tertiary-fixed-variant: '#004c69'
  background: '#131316'
  on-background: '#e4e1e6'
  surface-variant: '#353438'
typography:
  display-lg:
    fontFamily: inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-md:
    fontFamily: inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  tech-data-xl:
    fontFamily: jetbrainsMono
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0.04em
  tech-data-lg:
    fontFamily: jetbrainsMono
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: 0.05em
  tech-data-md:
    fontFamily: jetbrainsMono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  tech-badge:
    fontFamily: jetbrainsMono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  touch-min: 48px
  touch-compact: 44px
  pad-xs: 4px
  pad-sm: 8px
  pad-md: 16px
  pad-lg: 24px
  pad-xl: 32px
  gutter-tablet: 16px
  gutter-desktop: 24px
  margin-screen: 24px
---

## Brand & Style

This design system delivers an industrial-utilitarian, precision-focused environment engineered specifically for mechanical workshops, heavy-duty diagnostics, and service bay management. It balances raw automotive workshop energy with modern, sober telemetry software aesthetics. 

Target users include workshop managers, service technicians, and front-desk receptionists operating on ruggedized tablets, shop-floor wall mounts, and desktop workstations. The visual tone evokes reliability, prompt critical action, and zero-latency operational efficiency under demanding lighting conditions (fluorescent bay lights, oil glare, outdoor direct sun).

The design movement combines **Industrial Utility** and **Tactile Dark UI**:
- High-contrast charcoal and asphalt backdrops to camouflage grime and reduce eye strain.
- Vibrant hazard/caution neon yellow and mechanic red accents derived from workshop warning lights and diagnostic status icons.
- Strict touch ergonomics engineered for gloved or greasy fingertips with deliberate touch targets (minimum 48px hit areas).
- High visual legibility pairing crisp geometric sans for workflows with monospaced data displays for telemetry, VINs, license plates, torque figures, and inventory SKUs.

## Colors

The system uses a dark palette optimized for operational environments with heavy contrast standards (WCAG AAA for all key readouts).

### Palette Roles & Hierarchy
- **Primary (`#FCE006` / `#EAB308`):** Industrial Hazard Yellow. Reserved for primary operational actions, active vehicle service timers, active focus states, and high-visibility state indicators. Text on yellow surfaces must strictly use `#0F172A` (deep asphalt) for maximum contrast.
- **Secondary (`#EF4444` / `#DC2626`):** Mechanic Warning Red. Reserved for diagnostic errors (Check Engine codes, critical brake/fluid levels), overdue services, unpaid invoices, and destructive deletion actions.
- **Tertiary (`#38BDF8`):** Telemetry Cyan. Applied to digital sensor readouts, OBD-II data flow states, and calibrated telemetry streams.
- **Neutrals & Surfaces:**
  - `Surface-0 / Root Canvas`: `#090D16` (Deepest shop floor dark).
  - `Surface-1 / Container Base`: `#0F172A` (Asphalt dark for panels and layout docks).
  - `Surface-2 / Elevated Card`: `#18181B` (Zinc graphite for individual work orders and inspection cards).
  - `Surface-3 / Interactive Hover & Inputs`: `#27272A` (Charcoal input fills and active card outlines).
  - `Border / Divider Subtle`: `#334155` (Slate steel divider).
  - `Border High-Contrast`: `#E2E8F0` or `#FCE006` for focus rings and selected rows.
- **Text & Icons:**
  - `Text-Primary`: `#FFFFFF` (pure white for critical data, headers, and values).
  - `Text-Secondary`: `#E2E8F0` (light steel for field labels and body text).
  - `Text-Muted`: `#94A3B8` (slate muted for secondary metadata, timestamps, and chassis specs).

## Typography

The type system creates a split between human narrative instructions and structured mechanical data:
1. **Operational UI & Workflow Typography (Inter):** Clean, robust neo-grotesque sans-serif providing instant optical recognition across wide angles and tablets held at arm's length. Bold weights are leveraged for vehicle brand names, customer contacts, and diagnostic steps.
2. **Technical Telemetry & Industrial Codes (JetBrains Mono):** Monospaced type family for vehicle license plates, chassis/VIN identifiers, odometer mileages, part SKUs, torque specs, fault codes (DTC codes e.g., `P0300`), and currency values. The uniform character widths ensure perfectly aligned column grids across repair orders, invoice tables, and stock tallies.

## Layout & Spacing

The layout is built upon an ergonomic touch-first 8pt grid tailored for tablet devices (10" to 12.9" iPads and rugged Android field tablets) and wide desktop diagnostic monitors:

- **Touch Target Integrity:** Every clickable, tappable, or togglable component has an enforced minimum hit box of `48px × 48px` (falling back to `44px` only on extremely dense desktop-only parts tables). Spacing between interactive touch targets is never under `8px` to prevent accidental bay mis-taps.
- **Tablet Responsive Architecture (768px – 1180px):** 
  - Dual-pane split layouts: Fixed left rail for active bay queues (320px) and wide flexible workspace (fluid) for vehicle inspection sheets and part addition.
  - Sticky bottom action bars with oversized primary yellow triggers for finalizing work orders or requesting stock.
- **Desktop Architecture (1280px+):**
  - 12-column responsive fluid grid with 24px gutters.
  - Multi-column telemetry dashboard spanning diagnostic scanner feeds, service kanban columns, parts catalog lookups, and customer accounts.

## Elevation & Depth

This system avoids soft, decorative blur shadows that wash out under shop lights. Depth is achieved via **Tonal Surface Layering** reinforced with **High-Contrast Structural Keylines**:

- **Level 0 (Canvas Base):** Deep `#090D16` matte tone.
- **Level 1 (Dock & Sidebars):** `#0F172A` with a 1px solid border of `#1E293B`.
- **Level 2 (Workstation Cards & Work Orders):** `#18181B` with a 1px solid border of `#334155`.
- **Level 3 (Popovers, Modals & Inspection Overlays):** `#27272A` with a prominent 2px perimeter border of `#475569` and a deep, tight perimeter shadow (`0 12px 32px rgba(0, 0, 0, 0.75)`).
- **Focus & Critical Active States:** High-visibility highlight borders using 2px solid Industrial Yellow (`#FCE006`) with zero blur or ambient glow to maintain strict industrial crispness.

## Shapes

The design system embraces a **Soft/Industrial Chiseled** geometry (`roundedness: 1`):
- Default buttons, cards, and input fields utilize `4px` (`rounded-sm` / `0.25rem`) border radii.
- Modals, large surface panels, and floating control bars utilize `8px` (`rounded-lg` / `0.5rem`).
- Status chips, vehicle badges, and telemetry pill counters retain strict `2px` to `4px` corners, maintaining an equipment-label aesthetic that mimics physical metal tags, diagnostic tools, and machine faceplates. Rounded circular pills are explicitly forbidden except for numeric count indicators.

## Components

### Buttons
- **Primary Industrial:** Solid `#FCE006` background, `#0F172A` heavy typography (`font-weight: 700`), 48px minimum height, uppercase tracking. Active state drops to `#EAB308`.
- **Secondary Warning / Stop:** Solid `#EF4444` background with `#FFFFFF` text for vehicle reject, emergency stop, or inspection failure.
- **Outline Workstation:** `#18181B` surface with 1.5px `#475569` border, hover border `#E2E8F0`, `#FFFFFF` label.
- **Ghost Utility:** Transparent surface, minimum 48px tap box, with `#94A3B8` icon/text brightening to `#FCE006` on press.

### Inputs & Number Steppers
- Height of 48px to 52px.
- Background `#0F172A` with 1.5px `#334155` border. On focus, 2px `#FCE006` border with no ambient blur.
- Number inputs for quantities, kilometer counters, and hours incorporate oversized `+` and `-` touch tap ends (48px wide each).

### License Plate & Tech Badges
- Vehicle Plate Container: Bold `#FFFFFF` or `#F8FAFC` background with black JetBrains Mono typography, wrapped in a 2px `#000000` rim and 2px `#334155` outer keyline.
- DTC Fault Badges: JetBrains Mono uppercase, `#2A0E11` dark red fill with `#EF4444` border and `#FCA5A5` text.

### Cards & Service Bays
- Contained in `#18181B` with top color-coded edge bar (4px thick): Yellow for "In Progress / Active Bay", Red for "Awaiting Parts / Blocker", Green for "Ready for Delivery", Blue for "Scheduled".
- Clean division between vehicle identity (top), mechanic assignment (middle), and technician checklists (bottom).

### Checkboxes & Segmented Radios
- Minimum 24px visual box centered within a 48px transparent hit zone.
- Heavy checkmark icon with `#FCE006` filled state and `#0F172A` glyph.
- Segmented pass/fail toggle: Dual large pill buttons for rapid inspection (`APROBADO` green tint vs `RECHAZADO` solid red).

### Data Tables (Parts, Invoicing & Diagnostic Codes)
- Alternating row zebra styling between `#0F172A` and `#131C2E`.
- Numeric and monospaced values right-aligned using JetBrains Mono.
- Compact vertical padding on desktop (12px), expanding to 16px on tablet for touch accuracy.