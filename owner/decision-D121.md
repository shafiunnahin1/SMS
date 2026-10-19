# D121 — draft for the owner (copy the row below into docs/LOCKED-DECISIONS.md right after the D120 row)

| D121 | Photo search in the question finder: a local tesseract.js with Bangla + English language data (amends D114 (3)/(4), G7 exception for these files only) | Owner approved (2026-10-19). qbank's question finder reads the text of a question photo with tesseract.js 5 loaded from cdn.jsdelivr.net, which downloads its engine and language data at run time; D114 (4) rules out calling outside services. SMS keeps its own copy instead: tesseract.js 5.1.1 (`tesseract.min.js`, `worker.min.js`) and tesseract.js-core 5.1.1 (the wasm engine), both Apache-2.0, plus the `ben` and `eng` language files from tesseract-ocr/tessdata_fast (Apache-2.0), copied unchanged into `frontend/public/vendor/tesseract/` with a `MANIFEST.sha256` (same rule as D119) and the licence files. The finder page loads them only when someone opens the photo step, with workerPath/corePath/langPath pointing at that folder, so the photo never leaves the browser and no outside server is called. The text read from the photo is shown for checking and editing before searching, exactly as qbank does (step 1 photo, step 2 check the text, then results). Not added to package.json or any lockfile; SMS's own code does not import it. Implementation commits carry `Change-Request: D121`. |

## How to add it (Windows PowerShell, one command per line)

    cd "E:\Projects\School Management"
    git checkout claude/elegant-cori-gw2mw5
    git pull --no-rebase origin claude/elegant-cori-gw2mw5
    notepad owner\decision-D121.md
    notepad docs\LOCKED-DECISIONS.md
    # Ctrl+F "| D120 |", click at the end of that line, Enter, paste the row, Ctrl+S, close
    git status
    # must show only: modified: docs/LOCKED-DECISIONS.md
    git add docs/LOCKED-DECISIONS.md
    git commit -m "decision: D121 local tesseract.js for photo search" -m "Change-Request: D121"
    git push origin claude/elegant-cori-gw2mw5
