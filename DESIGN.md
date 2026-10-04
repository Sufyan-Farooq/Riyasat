---
name: Riyasat
description: A readable estate register with spatial building navigation.
colors:
  paper: "#f6f7f3"
  surface: "#fff"
  ink: "#192c26"
  muted: "#607069"
  green: "#234d3b"
  deep: "#173c2e"
  lime: "#d8ed9f"
  rule: "#e2e7df"
  danger: "#a43735"
  warning: "#805816"
  pale: "#edf3e9"
  focus: "#739851"
typography:
  headline:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-1px"
  title:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.3px"
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "14px"
    lineHeight: 1.55
  label:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  control: "7px"
  unit: "9px"
  card: "12px"
  panel: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "22px"
---

# Design System: Riyasat

## Overview

**Creative North Star: "Estate register"**

A readable property ledger with spatial building navigation. Light warm paper and deep green wayfinding suit an owner or manager reviewing finances on a laptop or phone in daylight. Plain financial language and restrained status treatments keep the records understandable.

The user chose code-first and delegated visual choices. The implemented system pairs an open summary strip with detailed financial rows and floor bands; visual density serves operational scanning and traceable balances.

**Key Characteristics:**
- Warm paper, white records and deep green navigation.
- Tabular financial numerals and explicit status words.
- Floor bands with selectable unit blocks and contextual details.

## Colors

### Primary
Green identifies primary actions and selected property tabs; deep green anchors desktop navigation. Lime marks the active navigation item and small brand accents. Pale green supports quiet secondary interaction states.

### Neutral
Paper is the page canvas; surface is the record panel. Ink carries primary text, muted carries secondary context, and rule separates rows and panels.

Warning marks amounts needing attention; danger marks destructive actions and errors. Focus outlines remain clearly visible. Occupied, vacant and balance-due treatments pair restrained colour with words and financial context.

**The Status Words Rule.** Colour supports an explicit label or readable record context; it never carries status alone.

## Typography

Manrope with Arial and sans-serif fallbacks serves headings and UI. Body text is (14px); dense tables use (11px), table headings (9px), labels (12px), and supporting captions (9–11px). Financial figures use tabular numerals.

Page headings are (30px) on desktop, (25px) at the intermediate breakpoint and (26px) on mobile. Section headings are (17px), generally (16px) on mobile. Large authentication headings are (56px), stepping down to (42px) and (36px). Summary values are (30px), (35px) on wide desktop and (26px) on smaller screens.

## Layout

Desktop uses fixed navigation (232px) and a content region capped at (1650px), with (34px) page gutters. Above (1500px), gutters grow to (48px). At (1200px) the sidebar becomes (205px), floor labels stack above units, and property cards and maintenance columns become two columns. At (960px), the sidebar becomes (185px), overview and settings panels stack, the unit detail panel moves below the schematic, and report navigation becomes a horizontal row.

At (700px) and below, the sidebar is hidden until the header menu opens a two-column navigation grid below the (60px) topbar. Page gutters become (16px), property cards and maintenance columns stack, and summary and tenant financial figures retain two columns. Property tabs, report navigation and dense tables scroll horizontally when needed. Unit blocks wrap within each floor; the schematic and detail panel remain in reading order.

## Elevation & Depth

Records use white surfaces, quiet borders and tonal layering. Panels and property cards have no shadow. Toasts use a small shadow (0 5px 15px #0002); the slide-over form uses a side shadow (-4px 0 20px #0001) and translucent backdrop. Depth signals transient UI.

## Shapes

Controls have gently curved corners (7px), unit blocks (9px), property cards (12px), and desktop panels (14px). Mobile panels use (12px). Quiet solid borders define records; dashed borders identify vacant units and add-unit affordances. Avatars and status dots are circular.

## Components

Buttons are compact and readable: primary green and secondary white, (10px 15px) padding and (40px) minimum height. Secondary hover uses pale green; primary hover darkens. Inputs use a white fill, quiet border, and (10px 12px) padding. Buttons and navigation show a (3px) focus outline; fields show (2px). Disabled buttons reduce opacity and suppress the action cursor.

Navigation uses icon-and-label rows, with lime for the active screen. Tags use small rounded tonal fills and explicit words. Financial tables retain readable record rows and hover feedback. Empty states explain the next useful action; errors appear near forms or in a dismissible banner, and successful changes use a status toast.

The floor schematic sorts floor levels from highest to lowest and units by their stored order. Selecting a unit opens its tenant, rent, outstanding amount, deposit and agreement context. Owners and managers can drag units between floors or use the keyboard-accessible floor select, left/right buttons and visual-width select (1–4). Width controls change relative flex growth, not measured floor-plan dimensions. Layout edits preserve the unit's financial identity. Viewers can select units and read statements without layout or recording controls.

All roles share the same visual shell and allowed-property context. Owners additionally see administration, membership, reserve and approval-decision controls; managers operate their assigned properties; viewers receive read-only financial views with sensitive tenant contact details and restricted documents withheld. Action visibility follows permissions.

Slide-over forms manage focus and Escape, use a two-column field grid with full-width fields where needed, and fill the available viewport on narrow screens. Button colour transitions take (150ms), and drawer entry takes (200ms). Reduced-motion disables transitions and animations. Printed reports remove navigation and forms, flatten the report layout and expose table content.

## Do's and Don'ts

- Do use tabular numerals for financial records.
- Do preserve property and unit context when opening detailed records.
- Do pair status colour with readable labels or record context.
- Do keep keyboard-accessible layout controls alongside unit dragging.
- Don't represent schematic visual width as measured building geometry.
- Don't present edit or administration controls to roles that cannot use them.
