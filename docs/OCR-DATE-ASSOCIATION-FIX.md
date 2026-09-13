# OCR date association regression

## Problem
The local OCR parser previously fell back to the first date found in the whole document when an extracted item did not contain a nearby date. In multi-date school communications this could assign the same date to several unrelated items.

## Rule after this fix
An item may receive a date only from:
1. a date written in the same line;
2. an adjacent line that is clearly a date/detail line;
3. the nearest active date heading that appeared before it.

The parser may use a document-level month/year only as context for incomplete headings such as `lunes 14`; it must never use a document-level complete date as a candidate fallback.

If no local date can be resolved reliably, the candidate keeps its date empty so the user can review it instead of After inventing a date.
