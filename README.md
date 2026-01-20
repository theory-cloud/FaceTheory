# FaceTheory — Streaming SSR on AWS Lambda (Function URL)

FaceTheory is a planned SSR system for delivering fast, modern web apps on AWS with **streaming HTML rendering** and a
**single SSR “shape”** across multiple front-end technologies (React, Vue, Svelte) via a per-app adapter.

FaceTheory is designed to build on:
- AppTheory (serverless runtime contract + request/response normalization)
- TableTheory (DynamoDB contract/ORM) for ISR metadata, locks, and other state where needed

Status: **planning / design docs first**.

## Docs

- `docs/ARCHITECTURE.md` — deployment + runtime design (Lambda Function URL + streaming)
- `docs/ROADMAP.md` — milestones (SSR + SSG/ISR)
- `docs/WISHLIST.md` — AppTheory/TableTheory wishlist to support FaceTheory on AWS

