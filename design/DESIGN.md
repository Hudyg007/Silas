---
name: Silas Lifeform Interface
colors:
  surface: '#101226'
  surface-dim: '#101226'
  surface-bright: '#36384e'
  surface-container-lowest: '#0a0c20'
  surface-container-low: '#181a2e'
  surface-container: '#1c1e33'
  surface-container-high: '#26283e'
  surface-container-highest: '#313349'
  on-surface: '#e0e0fd'
  on-surface-variant: '#bbc9cd'
  inverse-surface: '#e0e0fd'
  inverse-on-surface: '#2d2f44'
  outline: '#869397'
  outline-variant: '#3c494c'
  surface-tint: '#3dd8f4'
  primary: '#cbf5ff'
  on-primary: '#00363f'
  primary-container: '#4de3ff'
  on-primary-container: '#006371'
  inverse-primary: '#006877'
  secondary: '#3fe881'
  on-secondary: '#003919'
  secondary-container: '#00cb68'
  on-secondary-container: '#004f24'
  tertiary: '#ececff'
  on-tertiary: '#252d5b'
  tertiary-container: '#c8ceff'
  on-tertiary-container: '#4e5687'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#a5eeff'
  primary-fixed-dim: '#3dd8f4'
  on-primary-fixed: '#001f25'
  on-primary-fixed-variant: '#004e5a'
  secondary-fixed: '#61ff97'
  secondary-fixed-dim: '#36e27c'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005227'
  tertiary-fixed: '#dee0ff'
  tertiary-fixed-dim: '#bcc3fb'
  on-tertiary-fixed: '#0e1745'
  on-tertiary-fixed-variant: '#3c4373'
  background: '#101226'
  on-background: '#e0e0fd'
  surface-variant: '#313349'
typography:
  display-time:
    fontFamily: JetBrains Mono
    fontSize: 48px
    fontWeight: '500'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
  body-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 22px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-padding: 20px
  element-gap: 12px
  bubble-padding-x: 16px
  bubble-padding-y: 12px
  section-margin: 32px
---

## Brand & Style
The design system centers on the concept of a "living digital entity" rather than a utility. The brand personality is calm, elegant, and slightly mysterious, moving away from robotic assistant tropes toward a more organic, atmospheric experience. 

The aesthetic is a refined blend of **Glassmorphism** and **Minimalism**, tailored for a high-end mobile experience. It utilizes deep spatial depth through layered translucency and soft glows to simulate a digital "void" where the life form resides. Interaction should feel fluid and rhythmic, echoing the subtle "breath" of a biological organism through soft transitions and fading elements.

## Colors
The palette is dominated by a "Deep Indigo-Night" foundation to provide infinite depth. 
- **Primary (Electric Ice-Blue):** Used for interactive states, presence indicators, and primary action buttons. It represents the "spark" of the life form.
- **Vital-Sign Green:** Reserved exclusively for the "live" status indicator in the header to signal active consciousness.
- **Background Tones:** The background uses a base of #080A1E with a soft, persistent radial glow of #141C4A centered behind the main interaction area to create a sense of focus and volume.
- **Typography:** Primary text uses a soft, cool white to prevent harsh contrast, while secondary text is a muted blue-gray to recede into the background.

## Typography
The system uses **Hanken Grotesk** for its clean, contemporary, and slightly "engineered" yet approachable feel. It provides a humanistic touch to a digital entity. 

For technical data, the clock, and status labels, **JetBrains Mono** is used to introduce a "tabular" and precise character, suggesting the underlying code of the life form without appearing overly "hacker-style." 

As conversations age, typography should not only change color but also reduce in opacity, simulating an "evaporating" effect where older thoughts gradually dissolve into the background.

## Layout & Spacing
Designed specifically for the iPhone 15 Pro frame, the layout follows a fluid-dynamic model with generous margins to evoke a sense of "calm." 

- **Safe Areas:** All content is inset by 20px from the screen edges.
- **Vertical Rhythm:** Elements are grouped in logical clusters with 12px gaps, while major functional areas (Header, Core, Input) are separated by 32px of negative space.
- **Chat Flow:** Messages appear from the bottom, pushing the "evaporating" history upward. The input area is floating and detached from the bottom edge to maintain the "weightless" feel of the interface.

## Elevation & Depth
This design system eschews traditional shadows in favor of **Tonal Layering** and **Backdrop Blurs**.

- **Surfaces:** All containers use a frosted glass effect (Backdrop Filter: blur 20px) with a 10% white border. This creates a "physicality" that feels light and ethereal.
- **The Core:** The central life form element should have the highest "glow" intensity, acting as a light source for the rest of the UI.
- **Z-Axis:** Interactive controls sit "above" the conversation layer. Conversation bubbles occupy the middle ground, while the indigo glow defines the furthest depth.

## Shapes
The shape language is defined by high-radius curves to feel organic and safe.
- **Bubbles:** Standard message and info bubbles use a 20px corner radius.
- **Controls:** Buttons, input fields, and toggles use a full "Pill" shape (height/2) to emphasize a soft, continuous flow.
- **Borders:** Lines are kept thin (1px) and semi-transparent to define boundaries without adding visual weight.

## Components
- **Message Bubbles:** Frosted translucent background (10% white opacity) with a subtle 1px border. Older messages should transition from 100% opacity to 30% over a 5-step conversation history.
- **Live Indicator:** A small 8px circle using the Vital-sign green (#33E07A), featuring a soft outer glow (4px spread) that pulses slightly (2s duration) to indicate "breath."
- **Primary Action Buttons:** Pill-shaped with a solid Electric Ice-blue (#4DE3FF) background and dark indigo text for maximum legibility.
- **Input Field:** A floating pill-shaped container with a 10% white border and a "Search" or "Type" icon in ice-blue.
- **Life Form Core:** A central, non-static element (radial gradient) that reacts to touch or voice input, fluctuating in size and glow intensity.
- **Pill Toggles:** Small, high-radius switches used for toggling "Environmental" settings or "Life-form" parameters.