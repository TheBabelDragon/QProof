# Hackathon demonstration guide

## 60-second pitch

QProof prepares the Bell state `(|00⟩+|11⟩)/√2` with a classical state-vector simulator, verifies it against an **independent analytic reference**, and emits a versioned JSON evidence report. The GitHub Pages UI renders that report — circuit, amplitudes, checks, and downloadable evidence.

**We do not claim quantum advantage or hardware execution.**

## Reproduce in 3 commands

```bash
git clone https://github.com/TheBabelDragon/QProof.git
cd QProof && pip install -e ".[dev]"
qproof run bell --shots 1024 --seed 42 --out report.json
```

Exit code 0 means status `passed`. Open `report.json` or visit the Pages site.

## What judges should look for

1. **Independent reference** — `qproof/reference.py` derives amplitudes analytically.
2. **Negative tests** — wrong expected state yields `failed` (see CI and `tests/test_experiment.py`).
3. **Evidence schema** — every check has name, status, detail, optional tolerance.
4. **Honest UI** — labels precomputed classical results; failure demo corrupts UI data only.

## Local frontend preview

```bash
cd web && python -m http.server 8000
# open http://localhost:8000
```
