# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Frontend: Next.js (latest, App Router, React 19), Tailwind CSS v4, Base UI (`@base-ui/react`) as headless primitives styled from scratch. Chosen over shadcn/ui and daisyUI deliberately: the owner uses shadcn everywhere and wants a look that is not recognizable as a stock kit.
- Backend: NestJS modular monolith, PostgreSQL + Prisma, Socket.IO gateway with Redis adapter (horizontal scale across 2+ API instances), Redis for presence/typing/rate limits, BullMQ for background jobs (link unfurls, notifications), SeaweedFS (S3-compatible) for uploads.
- Tooling: pnpm + Turborepo monorepo with shared Zod contracts; everything runs via Docker Compose.
- No microservices by decision: a scale-ready modular monolith is the architectural story.
- Not deployed. Lives in a public GitHub repo; must run with one `docker compose up`, with seeded demo data.

## Users

Primary: members of small-to-mid communities (hobby clubs, study groups, friend circles) who chat casually, drop in and out, and care who's around. Secondary and decisive: technical interviewers and hiring managers evaluating the owner for **full-stack** roles. They clone the repo or skim the README/screenshots, so first impression, code quality, and architecture explanation all matter.

## Product Purpose

Nook is a chat app for communities and clubs: a warm middle ground between Slack (work-oriented) and Discord (sprawling, gamer-oriented). Members join a community ("nook") via invite link and talk in channels, threads, and DMs. Success: it feels like a real, finished product someone would choose, and it demonstrates end-to-end full-stack craft.

## Positioning

A small, personal corner for your group, not a workplace tool and not a sprawling server. Lighter than Discord, friendlier than Slack. People and presence come first.

## Operating Context

- Communities (workspaces) → channels, DMs, threads.
- Realtime messaging, presence, typing indicators.
- Evaluated by interviewers running it locally from the repo; README with screenshots/GIFs carries the first impression.

## Capabilities and Constraints

Confirmed scope:
- Auth: custom JWT in NestJS (short-lived access token + rotating refresh token in httpOnly cookie).
- Communities, channels (public/private), DMs.
- Realtime messages, presence, typing indicators, optimistic sends, cursor pagination.
- Threads and emoji reactions.
- File and image uploads (drag and drop), link previews via background worker.
- @mentions, unread counts, notifications inbox.
- Message search (Postgres full-text) and a Cmd+K command palette.
- Invite links (optional expiry and max uses).
- Rich profiles: avatar, bio, pronouns, custom status, hover cards.

Out of scope (decided): roles/moderation, public community discovery, voice/video, deployment.

## Brand Commitments

- Name: **Nook**.
- Design must follow Impeccable rules (impeccable.style) and avoid its catalogued anti-patterns.
- Owner's ask: visually appealing and creative. The design is the main thing interviewers should remember.

## Evidence on Hand

None yet. No logo, users, or testimonials; seed data must be clearly fictional demo content.

## Product Principles

1. People before plumbing: presence, faces, and who's talking come before system chrome.
2. Calm by default: unread and mention signals are clear but never shouty.
3. Everything feels instant: optimistic UI, no spinners for routine actions.
4. Keyboard-first for power users, obvious for everyone else.
5. Every architectural choice is one an interviewer can ask about and get a crisp answer to.

## Accessibility & Inclusion

WCAG 2.2 AA: full keyboard operation, visible focus, screen-reader announcements for new messages, respects reduced motion.
