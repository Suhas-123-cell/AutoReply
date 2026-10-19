# Contribution summary

AutoReply is a fork of [im-anishraj/instagram-comment-to-dm](https://github.com/im-anishraj/instagram-comment-to-dm).
This file records what changed in this fork, measured from git, so the numbers can be re-run.

## Fork point

The fork's history starts at `55f7ee9` ("Baseline commit before mobile app work", 2026-07-30), a
squashed snapshot that shares no commits with upstream. The closest upstream commit to that snapshot is
upstream `main`'s tip, `a29a6b1` ("Add SEO landing pages (#28)", 2026-05-24), so it is used as the
fork point. All 130 commits in this repository are by Suhas-123-cell.

## Measured changes (fork point `a29a6b1` to `main`)

TypeScript and TSX only; lockfiles excluded; no generated `.ts`/`.tsx` files were found in the diff.

| measure | value |
|---|---|
| TS/TSX lines added / removed | +13,232 / −6,700 |
| TS/TSX files touched | 172 (82 new, 43 deleted) |
| New TypeScript test files (Vitest) | 16 (13 at the fork point, 27 now) |
| Existing test files modified | 9 |
| CI workflow | inherited from upstream; extended by +44/−8 lines (mobile checks, Node 22/24) |

Outside TypeScript, the fork adds a React Native mobile app in JavaScript/JSX: 87 new files,
+9,164 lines, including 7 Jest test files.

The squashed baseline already differs from `a29a6b1` in 130 files. Counting only commits after the
baseline, the TS/TSX numbers are +9,996 / −8,982 lines, 72 new files and 14 new test files.

## Resume bullet

> Extended an open-source Instagram comment-to-DM tool (TypeScript, Next.js): +13.2K/−6.7K lines across
> 82 new TS files, 16 new Vitest suites, plus a 9.2K-line React Native mobile app with 7 Jest suites.

## Reproduce

```bash
git remote add upstream https://github.com/im-anishraj/instagram-comment-to-dm.git && git fetch upstream
git diff --numstat a29a6b1 HEAD -- '*.ts' '*.tsx' | awk '{a+=$1; d+=$2} END {print a, d}'
git diff --name-only --diff-filter=A a29a6b1 HEAD -- '*.ts' '*.tsx' | wc -l
git diff --name-only --diff-filter=A a29a6b1 HEAD -- '*.test.ts' '*.test.tsx' | wc -l
git diff --numstat a29a6b1 HEAD -- '*.js' '*.jsx' | awk '{a+=$1} END {print a}'
```
