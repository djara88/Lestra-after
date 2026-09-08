# Lestra After — Product and UI quality contract

This repository follows the Lestra Product DNA and the product-specific contract in `docs/PRODUCT-DNA-AFTER.md`.

When changing product, UI or UX:

1. Read `docs/PRODUCT-DNA-AFTER.md` before designing or modifying a surface.
2. Do not create a dashboard, LMS or enterprise calendar. Start from the user's temporal situation and the question “What comes next?”.
3. Organize the experience around Ahora → Después → Hoy → Mañana → Semana → Familia.
4. Prefer domain components (`DayRail`, `RoutineBlock`, `ConflictWarning`, `WeekFlow`, etc.) over generic dashboard/card compositions.
5. The main app experience is mobile-first. Prioritize quick recognition, short actions, large targets and minimal typing.
6. Time is the primary visual structure. Do not add KPI, charts or cards unless they directly help a decision.
7. Intelligence must be contextual and actionable, never an intrusive chatbot layer added by default.
8. Correct visual problems in the component or design contract that owns the surface. Do not add repair stylesheets or one-off override layers as the default solution.
9. Maintain contrast, accessible labels, focus-visible on web, adequate touch targets and state semantics that do not depend only on color.
10. Every relevant flow must define normal, loading, empty, disabled, error, warning, conflict and success states.
11. Do not invent data, schedules, families, usage metrics or capabilities to complete a design.
12. A build or deployment marked READY is not product validation. Validate the real temporal workflow on the target device before declaring PASS.
13. Apply the Anti-AI Review: if the screen looks like enterprise software with different copy, redesign it.
14. Preserve business rules, privacy, permissions and data integrity unless the task explicitly changes them.
15. Reduce cognitive load through hierarchy and progressive disclosure; do not remove information that the user needs to plan their day.

## Definition of Done

An After surface is complete only when its real flow, mobile behavior, accessibility, contrast, copy, loading/empty/error/disabled/conflict states and temporal identity have been validated.

> Do not generate a modern productivity dashboard. Design the clearest possible way for a person to understand and organize what happens next.
