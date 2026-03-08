# Design System

Product-grade UI design system for CandidateMatch — Linear/Notion/Vercel quality.

## Overview

- **Design tokens**: `src/styles/design-tokens.css`
- **Tailwind**: Theme extended with token-based `brand` and `surface` colors.
- **Components**: `src/components/ui/` — Button, Card, Input, MetricCard, animations.

---

## Color Palette

### Brand (Deep Blue/Purple)

| Token        | Hex       | Usage                |
|-------------|-----------|----------------------|
| brand-50    | `#f5f3ff` | Light tint           |
| brand-100   | `#ede9fe` | Hover states         |
| brand-500   | `#8b5cf6` | Accent               |
| brand-600   | `#7c3aed` | Primary buttons      |
| brand-700   | `#6d28d9` | Primary hover        |
| brand-900   | `#4c1d95` | Dark accent          |

### Surface (Dark-Mode Scale)

| Token       | Hex       | Usage                |
|------------|-----------|----------------------|
| surface-bg | `#0a0a0f` | Page background      |
| surface-50 | `#1a1a24` | Elevated panels      |
| surface-100| `#2a2a3a` | Cards, tiles         |
| surface-200| `#3a3a4a` | Borders, dividers    |
| surface-400| `#6a6a7a` | Secondary text       |
| surface-600| `#aaaaba` | Muted text           |
| surface-800| `#e0e0e5` | Light text on dark   |
| surface-900| `#f5f5f7` | Primary text         |

### Semantic

- **Success**: `#10b981`
- **Warning**: `#f59e0b`
- **Error**: `#ef4444`
- **Info**: `#3b82f6`

---

## Typography

- **Display / Body**: `var(--font-display)` — Inter Variable, system fallback.
- **Mono**: `var(--font-mono)` — JetBrains Mono, Fira Code.

Use Tailwind: `font-display`, `font-sans`, `font-mono`. App globals may still use Satoshi/Cabinet; design-system components use token fonts where specified.

---

## Spacing Scale

| Token   | Value   | Tailwind |
|--------|---------|----------|
| space-1 | 0.25rem | `p-1`, `m-1` |
| space-2 | 0.5rem  | `p-2`, `gap-2` |
| space-4 | 1rem    | `p-4`, `gap-4` |
| space-6 | 1.5rem  | `p-6` |
| space-8 | 2rem    | `p-8` |

Use Tailwind spacing classes; tokens are in CSS for custom layouts.

---

## Border Radius

| Token     | Value   | Usage        |
|----------|---------|--------------|
| radius-sm | 0.375rem| Small chips  |
| radius-md | 0.5rem | Inputs       |
| radius-lg | 0.75rem | Buttons      |
| radius-xl | 1rem   | Cards        |
| radius-2xl| 1.5rem | Modals       |
| radius-full | 9999px | Pills, avatars |

Tailwind: `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`.

---

## Component Variants

### Button

- **Variants**: `primary`, `secondary`, `outline`, `ghost`, `danger`
- **Sizes**: `sm`, `md`, `lg`, `xl`
- **Props**: `loading`, `disabled`, standard button attributes

```tsx
import { Button } from '@/components/ui';

<Button variant="primary" size="md">Save</Button>
<Button variant="outline" size="sm" loading>Loading...</Button>
```

### Card

- **Card**: Container with border, shadow, backdrop blur.
- **CardHeader**: Flex row for title + actions.
- **CardTitle**: Heading (text-xl, font-semibold).
- **CardContent**: Body text (muted).

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

<Card>
  <CardHeader>
    <CardTitle>Section</CardTitle>
    <Button size="sm">Action</Button>
  </CardHeader>
  <CardContent>Content here.</CardContent>
</Card>
```

### Input

- **Props**: `label`, `error`, standard input attributes.
- **Accessibility**: `aria-invalid`, `aria-describedby` for error, `id`/`htmlFor` for label.

```tsx
import { Input } from '@/components/ui';

<Input label="Email" type="email" error={errors.email} placeholder="you@example.com" />
```

### MetricCard

- **Props**: `label`, `value`, `subtext`, `icon`, `gradient`, `href`, `trend`
- **gradient**: Tailwind gradient classes, e.g. `"from-brand-500 to-brand-700"`.

```tsx
import { MetricCard } from '@/components/ui';
import { Users } from 'lucide-react';

<MetricCard
  label="Active candidates"
  value={42}
  subtext="Last 30 days"
  icon={<Users className="w-5 h-5 text-white" />}
  gradient="from-brand-500 to-brand-700"
  href="/dashboard/candidates"
  trend={{ value: 12, direction: 'up' }}
/>
```

### Animations (Framer Motion)

- **FadeIn**: Fade + slide up.
- **SlideIn**: Fade + slide from `left` | `right` | `up` | `down`.
- **StaggerChildren**: Stagger child animations; use with `motion.div` and `variants={staggerItem}`.

```tsx
'use client';
import { FadeIn, SlideIn, StaggerChildren, staggerItem } from '@/components/ui';
import { motion } from 'framer-motion';

<FadeIn delay={0.2}>
  <h1>Title</h1>
</FadeIn>

<StaggerChildren>
  {items.map((item) => (
    <motion.div key={item.id} variants={staggerItem}>
      {item.name}
    </motion.div>
  ))}
</StaggerChildren>
```

---

## Usage Guidelines

1. **Use design tokens**: Prefer `bg-brand-600`, `text-surface-400`, `border-surface-300` over raw hex or generic gray.
2. **Focus states**: Buttons and links use `focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2`.
3. **Accessibility**: Labels, `aria-invalid`, `aria-describedby`, and keyboard navigation are built into Input and Button.
4. **Responsive**: Components use responsive-friendly spacing and typography; use Tailwind breakpoints for layout.
5. **Reduced motion**: Prefer Framer Motion’s `reduce` or disable animations when `prefers-reduced-motion: reduce` for critical UI.

---

## File Reference

| File | Purpose |
|------|---------|
| `src/styles/design-tokens.css` | CSS variables for colors, spacing, radius, shadows, transitions |
| `src/app/globals.css` | Imports design-tokens, Tailwind, role-themes |
| `tailwind.config.js` | `theme.extend.colors.brand` and `surface` from tokens |
| `src/components/ui/Button.tsx` | CVA-based button variants |
| `src/components/ui/Card.tsx` | Card, CardHeader, CardTitle, CardContent |
| `src/components/ui/Input.tsx` | Labeled input with error state |
| `src/components/ui/MetricCard.tsx` | KPI card with gradient border and optional link/trend |
| `src/components/ui/animations.tsx` | FadeIn, SlideIn, StaggerChildren (Framer Motion) |
| `src/components/ui/index.tsx` | Re-exports all UI components |

---

## Verification

- [x] Components use design tokens (brand, surface) from Tailwind.
- [x] Styling is consistent with a single token source.
- [x] Animations use Framer Motion with sensible duration/delay.
- [x] Accessible: keyboard nav, focus rings, labels, error IDs.
- [x] Layout and spacing work across screen sizes with Tailwind utilities.
