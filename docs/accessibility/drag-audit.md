# Dragging audit (SC 2.5.7)

SC 2.5.7 asks that anything done by dragging can also be done with a single pointer without
dragging, unless dragging is essential to the task.

Our criterion map said Canvas drag-and-drop had no keyboard equivalent. That was an assertion, not
a measurement, and it is wrong. This is the measurement.

## Method

Every `onPointerDown`, `onDragStart`, `beginDrag` and `beginBendDrag` in `apps/canvas` was read, and
each was checked against the card and section command menus (`board/menu/verbs.ts`) and the board
keyboard handler (`board/useBoardKeyboard.ts`) for a path that does not require a drag.

A menu item counts. SC 2.5.7 asks for "a single pointer without dragging", and pressing a menu item
is exactly that.

## What was found

| #   | Interaction                       | Mechanism                         | Non-drag path                                                                                | Verdict     |
| --- | --------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| 1   | Card repositioned on a board      | node drag                         | **Arrow keys** step 8 flow units, Shift 40 (`nudge.ts`), plus Arrange → align and distribute | Met         |
| 2   | Section moved                     | `startDrag`                       | **Arrow keys** — the nudge handler covers `selectedSectionIds`, not only nodes               | Met         |
| 3   | Card moved to another board       | drag onto a board                 | Menu → **Move to board → \<board\>**                                                         | Met         |
| 4   | Card also placed on another board | drag                              | Menu → **Also place on board**                                                               | Met         |
| 5   | Vault dropped on a recents row    | HTML drop                         | Row menu → **Import folder**, **Import .zip**                                                | Met         |
| 6   | Connector repositioned            | `startConnectorMove`              | Menu → **Reposition Connector**                                                              | Met         |
| 7   | Zoom                              | pinch / scroll                    | React Flow's own zoom buttons, plus **Zoom to selection**                                    | Met         |
| 8   | Pan                               | drag                              | React Flow controls; panning is the canvas itself rather than a document operation           | Met         |
| 9   | Section resized                   | `startResize`                     | Menu → **Shrink to fit** only                                                                | **Partial** |
| 10  | Section link endpoint re-pointed  | `beginDrag` in `SectionLinkLayer` | None found in the menu                                                                       | **Gap**     |
| 11  | Connector bend handle moved       | `beginBendDrag`                   | None found                                                                                   | **Gap**     |

## The three that need a decision

**9. Section resized.** "Shrink to fit" covers the common intent (make the frame hug its contents)
but not arbitrary sizing. Whether that is enough depends on what a section is for: if it is a
container that should hug its contents, "shrink to fit" _is_ the operation and the drag is a
convenience. If people use sections as arbitrary spatial regions, it is a real gap.

**10. Section link endpoint.** A link between sections can be dragged from one anchor to another.
No menu item does this. The likely fix is a "Reconnect" verb mirroring "Reposition Connector", which
already exists for edges.

**11. Connector bend handle.** Dragging a control point changes the curve's shape. The Path menu
offers Curved / Straight / Step / Smooth step / Avoid obstacles, which changes the family of the
curve but not an individual bend. This is fine-tuning, and the most defensible position may be that
the bend is decorative because the connector's meaning does not depend on where it bends.

## Correction to the map

`wcag-22-map.md` said 2.5.7 was a Gap with "Canvas vault drop and card drag have no single-pointer
alternative". Both of those are met. The row now reads **Manual**, with the three items above named,
and the statement no longer lists dragging as a known gap.

## What is not claimed

This audit reads code; it does not operate the app. Each "Met" row still needs the keyboard pass in
`manual-testing.md` step 1 to confirm the path is reachable in practice and does what the code
suggests. The three open items are recorded as work, not as resolved.
