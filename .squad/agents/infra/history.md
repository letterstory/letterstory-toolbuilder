# Infra — History

## Project Context

- **Project:** letterstory-toolbuilder (Next.js + TypeScript, deployed on Porter)
- **Current focus:** Landing pages / "Landings" — branded micro-tool generation. Recent fixes: URL normalization UX, CardHeader layout, Porter nginx ingress 504 timeout (raised to 300s via dashboard).
- **User:** MirRaonaq
- **Team hired:** 2026-09-04

## Notes

(Append learnings, decisions affecting this role, and cross-agent context here.)

📌 Team update (2026-09-04T22:00:00.000Z): Production verification should use https://web-22301-57c6c7ab-4p0z458q.onporter.run; porter.yaml ingressAnnotations still do not match the live 300s dashboard values, and that drift was not fixed in this session. — decided by Squad Coordinator
