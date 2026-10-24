---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the guidelines in `command.md` (see below)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Read the rules from `command.md` next to this file: a reviewed copy of
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`, taken on 2026-10-22
(vercel-labs/agent-skills, MIT). Fetch the source again only when someone asks for the rules to be refreshed, and
read the new copy before replacing this one. The file contains all the rules and the output format.

## Usage

When a user provides a file or pattern argument:
1. Read the guidelines in `command.md`
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
