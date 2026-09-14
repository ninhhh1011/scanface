---
version: alpha
name: Reviews.io
description: A clean, conversion-focused SaaS system with friendly teal accents, rounded pills, and strong editorial hierarchy.
colors:
  primary: "#067c74"
  secondary: "#111827"
  tertiary: "#f5f7f8"
  neutral: "#ffffff"
  surface: "#ffffff"
  on-surface: "#111827"
  muted: "#4b5563"
  border: "#e5e7eb"
  success: "#10b981"
  warning: "#f59e0b"
  error: "#dc2626"
  accent-soft: "#e6f7f5"
  accent-strong: "#045f59"
typography:
  headline-display:
    fontFamily: system-ui
    fontSize: 56px
    fontWeight: 500
    lineHeight: 61.6px
    letterSpacing: 0px
  headline-lg:
    fontFamily: system-ui
    fontSize: 48px
    fontWeight: 500
    lineHeight: 57.6px
    letterSpacing: 0px
  headline-md:
    fontFamily: system-ui
    fontSize: 24px
    fontWeight: 500
    lineHeight: 33.6px
    letterSpacing: 0px
  headline-sm:
    fontFamily: system-ui
    fontSize: 18px
    fontWeight: 500
    lineHeight: 22px
    letterSpacing: 0px
  body-lg:
    fontFamily: system-ui
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0px
  body-md:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  body-sm:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0px
  label-lg:
    fontFamily: system-ui
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0px
  label-md:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0px
  label-sm:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0px
  overline:
    fontFamily: system-ui
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.02em
  eyebrow:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0px
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 16px
  xl: 22px
  full: 9999px
spacing:
  xs: 2px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 64px
  gutter: 24px
  section: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 16px 28px
    height: 59px
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.full}"
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 16px 28px
    height: 59px
  button-secondary-hover:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.full}"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 0px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: 18px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 14px 16px
  chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: 6px 12px
---

## Overview

Reviews.io feels polished, trustworthy, and conversion-driven, with a friendly SaaS tone rather than a playful consumer tone. The page balances a strong editorial hero with soft, rounded UI elements and light pastel backgrounds, creating a calm but persuasive experience. It is spacious, modern, and designed for marketing sites that need to communicate credibility quickly.

## Colors

- **Primary (#067C74):** A saturated teal used for key CTAs, accent badges, and trust-building highlights. It signals action and reliability without feeling aggressive.
- **Secondary (#111827):** A deep charcoal used for major headings, body copy, and navigation text. It provides the strong contrast needed for a high-clarity hero.
- **Surface (#FFFFFF):** The dominant canvas color for the page and card surfaces. It keeps the interface airy and easy to scan.
- **Muted (#4B5563):** A softer slate tone for supporting copy and secondary metadata. Use it for explanatory text that should not compete with headlines.
- **Border (#E5E7EB):** A light neutral rule color for subtle separators, outlined buttons, and card edges. It supports structure without visual heaviness.
- **Accent-soft (#E6F7F5):** A pale mint used for chips, badges, and gentle callouts. It gives the brand a fresh, approachable feel.
- **Accent-strong (#045F59):** A darker teal for hover and active states. It preserves the brand identity while adding depth on interaction.
- **Tertiary (#F5F7F8):** A very light neutral background tint for low-emphasis fills and hover contrast. It helps distinguish secondary actions.
- **Success (#10B981), Warning (#F59E0B), Error (#DC2626):** Utility colors for status communication. Keep them sparing and functional so they do not dilute the core teal-led identity.

## Typography

The type system is built on `system-ui`, keeping the interface crisp, familiar, and performance-friendly. Headings are medium weight rather than ultra-bold, which gives the brand a confident but not overly aggressive voice. Body copy stays regular weight for readability, while labels and buttons use semibold treatment for clear action hierarchy.

`headline-display` and `headline-lg` are reserved for primary marketing statements like the hero headline. `headline-md` and `headline-sm` support section titles, cards, and UI summaries. `body-md` is the default reading size for paragraphs, with `body-sm` for fine print, captions, and metadata. `label-md` is the main button and control style; `label-sm` is suitable for compact chips, navigation, and subtle utility text.

Uppercase treatment is not a defining feature here; the source relies more on size, weight, and spacing than on letter-case changes. Small labels use slightly tighter, cleaner spacing, but the overall system avoids heavy tracking so the interface feels contemporary and legible.

## Layout & Spacing

The layout follows a wide, centered marketing grid with a generous hero split between text and imagery. Content sits in a strong left-right composition, with plenty of white space to reduce friction and let the main value proposition breathe. Sections are separated by large vertical intervals, giving the page a spacious and premium rhythm.

Spacing should use a simple scale anchored around 8px, 16px, 24px, 32px, and 64px. Use smaller values for internal control spacing and larger values for section separation, card padding, and feature groupings. Cards and feature modules should keep comfortable internal padding rather than dense stacks, because the brand depends on clarity and ease of scanning.

## Elevation & Depth

Depth is subtle and primarily achieved through contrast, borders, and soft shadow rather than dramatic elevation. Buttons use light shadowing and inset detail to feel tactile, while large hero cards and preview panels rely on tonal layering and rounded shapes. The overall system stays closer to “soft flat” than “heavy material.”

Use shadows sparingly for emphasis: primary buttons, floating cards, and standout previews. Most surfaces should remain clean and lightly bordered, so hierarchy comes from scale, color, and spacing instead of stacked layers.

## Shapes

The shape language is rounded, friendly, and approachable. Pills and fully rounded buttons are a signature pattern, especially for CTAs and chips. Larger cards use medium-to-large radii, with `rounded.xl` giving larger visual modules a soft, premium feel.

Use `rounded.full` for interactive controls that should feel inviting and touch-friendly. Use `rounded.md` for inputs and small containers, and `rounded.xl` for hero cards, media frames, and testimonial or content modules. Avoid sharp geometry unless a component is purely structural and meant to recede.

## Components

Buttons are the most important interactive element in the system. `button-primary` is the main CTA: solid teal, white text, semibold label, and fully rounded shape. `button-secondary` is the outlined/light alternative for lower-priority actions, using a white background or transparent feel with dark text and soft borders. `button-tertiary` should stay minimal and text-like for utility links. Keep button sizing comfortable and consistent; the observed pattern uses a tall, prominent CTA with generous horizontal padding.

Cards should feel clean, rounded, and lightly elevated, with `card` acting as the base surface token. In marketing compositions, cards may hold imagery, mini dashboards, or testimonial-like content; keep internal spacing balanced and avoid overcrowding. Maintain strong contrast between surface and background so cards read as deliberate modules rather than random boxes.

Inputs should follow the same calm surface language as cards, using `input` with subtle borders, moderate radius, and clear text contrast. Focus states should lean on teal rather than harsh outlines. Placeholder and helper text should remain muted so the actual input content stands out.

Chips and badges, like the trial prompt in the hero, should use `chip` with soft mint backgrounds and teal text. These are small but important for signaling freshness, status, and guidance without interrupting the main CTA flow. Keep them compact and pill-shaped.

Navigation items should feel lightweight and text-first, with visible hierarchy only where necessary. Use understated separators and modest weight changes rather than heavy nav bars. Icons and dropdown indicators should remain small and secondary to the words they accompany.

## Do's and Don'ts

- Do keep CTAs bold, rounded, and teal so the conversion path is always obvious.
- Do use generous whitespace around headlines, buttons, and feature imagery.
- Do prefer medium-weight headings over extremely heavy or condensed type.
- Do keep supporting text in muted slate tones for readability and hierarchy.
- Don't introduce sharp corners on primary marketing components.
- Don't use loud gradients, neon accents, or excessive shadow stacking.
- Don't crowd cards or forms with dense spacing; the brand depends on openness.
- Don't let secondary UI compete with the main CTA or headline.