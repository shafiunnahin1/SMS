# Draft Decision D181: edit embedded images, tables, graphs and diagrams in paper preview

> Owner review draft only. It does not change `LOCKED-DECISIONS.md`, the guard, or application code. To approve this exact scope, run `owner\approve-D181.ps1` after reviewing this file. The script creates two local commits and does not push.

## 1. Owner request (2026-10-28)

In the question-paper preview, images, tables, graphs and diagrams embedded in questions cannot currently be selected to change their position, size or border. The owner wants those objects editable for the paper's print view.

## 2. Proposed contract

1. In the preview, a teacher/admin can select an embedded image, table, graph or diagram and adjust its position/alignment, size and border. Images and diagrams preserve their aspect ratio; tables may change width. Image/table/diagram content and question wording are not edited by these controls.
2. Objects may be placed inline or in the existing preview flow (left/right wrap or top/bottom); no object can overlap question text in the exported page. Resizing is bounded by the selected paper's content area. Border controls are off/on with 1–3pt thickness and use the print's current text color; no arbitrary hex color is accepted.
3. These are per-paper, per-set preview overrides stored only in this browser, alongside the existing wording and text-box settings. They never update the question bank, uploaded media, question rich text, or another paper/set. Resetting an object restores the question-bank rendering.
4. The preview, browser print, PDF and JPG use the same object position, dimensions, wrapping and border. Page breaking keeps the containing question and its objects together unless their total height exceeds a page (D179).
5. The same controls apply to D171 stimulus MCQ child content and D118/D115 graph/diagram renderings. Existing question-bank answer visibility and media authorization are unchanged; editing an object's layout never reveals hidden answers or media.
6. Screens only: no route, API, table/column, package or server-side write. Task QBO.3 follows QBO.1 and carries `Change-Request: D181`.

## 3. Acceptance examples

- Select an inline image, resize it and move it to the next question gap; preview, print, PDF and JPG agree, and the original question/media record is unchanged.
- Select a table, change width, alignment and border thickness; cell content/order stays unchanged and the table is not clipped at a page edge.
- Select a rendered graph/diagram and resize/move it; the payload, renderer mode, answer visibility and original question remain unchanged.
- Reload the same paper/set restores its layout; a different set, paper or user does not inherit it.
- Screen-only handles/controls never appear in print/PDF/JPG; page boundaries and question integrity remain correct.

## 4. Proposed locked-decision row

| D181 | Paper preview: local layout controls for embedded images, tables, graphs and diagrams | Owner approved (2026-10-28). (1) The preview may select embedded images/tables/graphs/diagrams and adjust position/alignment, bounded size and border; images/diagrams preserve aspect ratio, tables may resize width, borders are off/on at 1–3pt using current text color. (2) Position/wrap, size and border are paper/set-local browser overrides only; reset restores source rendering; no question text/media/payload/answer changes. (3) Browser print, PDF and JPG reproduce preview layout; screen handles never print; question+objects stay together unless taller than a page. (4) Apply to D171 stimulus children and D118/D115 graph/diagram renderers without weakening answer/media access. (5) Screens only: no route, API, table/column or package. Task QBO.3 after QBO.1; commits carry `Change-Request: D181`. |
