# Agent Manager - Design System

This document outlines the visual design principles and implementation details for the Agent Manager UI.

## Design Philosophy

### Core Principles

1. **Clarity First**: Information hierarchy is paramount. The most important data (session status, activity) should be immediately visible.

2. **Depth Through Subtlety**: Use soft shadows, gentle gradients, and layered backgrounds to create visual depth without overwhelming the interface.

3. **Motion with Purpose**: Animations serve functional purposes—indicating state changes, drawing attention, and providing feedback.

4. **Dark Mode Native**: Design for dark mode first, then adapt for light mode. Developer tools are often used in low-light environments.

5. **Information Density**: Support displaying multiple sessions and events efficiently while maintaining readability.

---

## Color System

### Semantic Colors

The design uses a semantic color system with CSS custom properties for dynamic theming.

```css
/* Status Colors */
--color-success: #10b981      /* Running, healthy */
--color-warning: #f59e0b      /* Waiting, needs attention */
--color-error: #ef4444        /* Errors, failures */
--color-info: #3b82f6         /* Information, links */

/* Role Colors */
--color-implementer: #8b5cf6  /* Purple - active coding */
--color-orchestrator: #06b6d4 /* Cyan - coordination */
```

### Background Layers

The UI uses layered backgrounds to create depth:

```
Layer 0: Page background (darkest)
Layer 1: Card backgrounds (slightly lighter)
Layer 2: Interactive elements (hover states)
Layer 3: Elevated components (modals, dropdowns)
```

### Accent Colors

Primary accent color is a vibrant blue (`#3b82f6`) used for:
- Primary buttons
- Active navigation items
- Links
- Focus states

---

## Typography

### Font Stack

```css
/* UI Text */
font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI',
             Roboto, Oxygen, Ubuntu, sans-serif;

/* Code/Monospace */
font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono',
             Consolas, monospace;
```

### Scale

| Name | Size | Weight | Use Case |
|------|------|--------|----------|
| Display | 2rem | 700 | Page titles |
| Heading | 1.25rem | 600 | Section headers |
| Body | 0.875rem | 400 | Primary content |
| Caption | 0.75rem | 500 | Labels, metadata |
| Micro | 0.625rem | 500 | Timestamps, badges |

---

## Components

### Cards

Cards are the primary container for content. They feature:

- **Subtle border**: 1px with low opacity
- **Background gradient**: Slight gradient from top to bottom
- **Shadow on hover**: Elevates on interaction
- **Border radius**: 12px for modern feel

```css
.card {
  background: linear-gradient(to bottom,
    var(--color-bg-elevated),
    var(--color-bg-card));
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: var(--color-border-hover);
}
```

### Buttons

Buttons use solid backgrounds with subtle gradients:

**Primary Button**
- Gradient background
- Slight shadow
- Scale transform on hover
- Loading state with spinner

**Secondary Button**
- Transparent with border
- Background fill on hover
- Used for less prominent actions

**Danger Button**
- Red gradient
- Used sparingly for destructive actions

### Badges

Status and role badges are pill-shaped indicators:

**Status Badge**
- Small circular indicator dot
- Pulsing animation for active states
- Color-coded by status
- Semi-transparent background matching status color

**Role Badge**
- Rounded rectangle shape
- Icon + text combination
- Subtle background matching role color

### Form Inputs

Inputs feature:
- Transparent background with visible border
- Color change on focus
- Ring effect on focus
- Placeholder with reduced opacity

---

## Layout

### Grid System

The app uses a responsive grid:

```
Mobile: 1 column
Tablet (768px+): 2 columns
Desktop (1024px+): 3 columns
Wide (1280px+): Container maxes out
```

### Spacing Scale

Based on 4px increments:

```
1: 4px   (micro spacing)
2: 8px   (compact elements)
3: 12px  (element padding)
4: 16px  (standard gap)
5: 20px  (section padding)
6: 24px  (large gaps)
8: 32px  (section margins)
```

### Container

Main content container:
- Max width: 1280px
- Horizontal padding: 24px (mobile: 16px)
- Centered with auto margins

---

## Motion & Animation

### Timing

```css
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 300ms;

--ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

### Patterns

**Hover Transitions**
- Background color: 150ms
- Transform/shadow: 200ms
- Border color: 150ms

**Loading States**
- Spinner: 1s linear infinite
- Pulse: 2s ease-in-out infinite
- Skeleton: 1.5s ease-in-out infinite

**Status Changes**
- Badge color transitions smoothly
- Running status pulses gently
- Waiting status has attention-grabbing animation

---

## Iconography

### Style

- Outline icons (not filled) for most UI elements
- Consistent 24px viewBox
- 2px stroke width
- Current color for flexibility

### Common Icons

| Context | Icon | Description |
|---------|------|-------------|
| Repository | Folder | Document storage |
| Session | Terminal | Code execution |
| Running | Circle | Filled, pulsing |
| Waiting | Clock | Needs input |
| Error | X in circle | Alert state |
| Add | Plus | Create action |
| Back | Chevron left | Navigation |
| External | Arrow diagonal | Opens new tab |

---

## Dark Mode Implementation

### Strategy

Dark mode is the primary design target with light mode as an adaptation.

### Color Mapping

| Element | Dark Mode | Light Mode |
|---------|-----------|------------|
| Background | #0f172a | #ffffff |
| Card | #1e293b | #f8fafc |
| Text | #f1f5f9 | #0f172a |
| Text muted | #94a3b8 | #64748b |
| Border | #334155 | #e2e8f0 |

### Automatic Detection

Uses `prefers-color-scheme` media query for automatic theme selection:

```css
@media (prefers-color-scheme: dark) {
  :root {
    /* Dark mode values */
  }
}
```

---

## Timeline Design

The session timeline is a key component displaying real-time events.

### Event Styling

Events are differentiated by source using left border color:

| Source | Border Color | Icon |
|--------|--------------|------|
| Claude | Blue (#3b82f6) | Robot |
| Runner | Green (#10b981) | Gear |
| Manager | Slate (#64748b) | Clipboard |
| User | Amber (#f59e0b) | User |

### Visual Structure

```
┌─────────────────────────────────────────┐
│ 🤖 claude.message           10:23:45 AM │
│────────────────────────────────────────│
│ Event content displayed in monospace   │
│ with proper word wrapping and syntax   │
│ highlighting for code blocks.          │
└─────────────────────────────────────────┘
```

### Auto-scroll Behavior

- Automatically scrolls to new events
- Pauses auto-scroll when user scrolls up
- Resumes when user scrolls to bottom

---

## Page-Specific Design

### Home Page (Repository List)

- Grid of repository cards
- Each card shows:
  - Repository name (prominent)
  - Default branch (subtle)
  - Activity indicator (status dot)
  - Session counts
  - Last activity time
- Empty state with illustration and CTA
- Add button in page header

### Repository Detail

- Back navigation with breadcrumb
- Repository name and metadata in header
- GitHub link button
- Two-column layout:
  - Left: Sessions (active + past)
  - Right: Documentation tabs
- Start session modal with role selection

### Session Detail

- Compact header with status info
- Full-height timeline (viewport minus header)
- Sticky input area at bottom
- Real-time WebSocket updates
- Context-aware input placeholder

---

## Accessibility

### Requirements

- Color contrast ratio: 4.5:1 minimum
- Focus indicators visible on all interactive elements
- Keyboard navigation support
- ARIA labels for icon-only buttons
- Reduced motion support

### Focus States

```css
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### Motion Preferences

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Implementation Notes

### CSS Architecture

- Tailwind CSS for utilities
- CSS custom properties for theming
- Semantic class names for complex components
- BEM-inspired naming for custom classes

### Performance

- Use `transform` and `opacity` for animations
- Avoid layout-triggering properties in transitions
- Lazy load heavy components
- Virtualize long event lists (future)

### File Organization

```
src/
├── app.css                 # Global styles, design tokens
├── lib/components/         # Reusable UI components
│   ├── StatusBadge.svelte
│   ├── RoleBadge.svelte
│   └── TimeAgo.svelte
└── routes/                 # Page-specific styles inline
```
