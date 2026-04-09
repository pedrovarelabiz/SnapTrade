# SnapTrade — Unified Project

Sistema de trading automatizado de opções binárias.

## Estrutura

```
snaptrade/
├── extension/    — Chrome Extension MV3 (TypeScript + React)
├── backend/      — Express API + Prisma + PostgreSQL (TypeScript)
├── frontend/     — React Web Dashboard (TypeScript)
├── listener/     — Telegram Signal Listener (Python)
├── analysis/     — Signal data, simulators, intelligence reports
└── archive/      — Old patches and versions (não usar)
```

## Fluxo do sistema

```
Telegram (7 canais) → listener/ → backend/ → extension/ → Pocket Option
                                     ↓
                                 frontend/ (dashboard)
```

## VPS (produção)

- Host: root@213.199.51.26
- Backend: https://snaptrade.faroldigital.pt/api (porta 3001)
- Paths: /opt/snaptrade/{backend,frontend,telegram,extension}

## Regras

- Imutabilidade: nunca mutar objectos
- Ficheiros < 800 linhas
- TDD obrigatório para features novas
- Code review antes de commit

## CRITICAL RULES FOR AUTOMATED EXECUTION
- NEVER run long-running server processes (servers, watchers, tails)
- Use build commands to verify, never start a server
- For testing, use test or build commands, never start a server
