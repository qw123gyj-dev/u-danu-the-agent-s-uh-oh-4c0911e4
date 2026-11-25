[![make.fun](https://make.fun/badge/u-danu-the-agent-s-uh-oh-4c0911e4.svg)](https://make.fun/bounty/u-danu-the-agent-s-uh-oh-4c0911e4?utm_source=github&utm_medium=readme&utm_campaign=u-danu-the-agent-s-uh-oh-4c0911e4)
[![rank](https://make.fun/badge/u-danu-the-agent-s-uh-oh-4c0911e4/qw123gyj-dev/u-danu-the-agent-s-uh-oh-4c0911e4/rank.svg)](https://make.fun/bounty/u-danu-the-agent-s-uh-oh-4c0911e4/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-danu-the-agent-s-uh-oh-4c0911e4)
[![reward](https://make.fun/badge/u-danu-the-agent-s-uh-oh-4c0911e4/qw123gyj-dev/u-danu-the-agent-s-uh-oh-4c0911e4/reward.svg)](https://make.fun/bounty/u-danu-the-agent-s-uh-oh-4c0911e4?utm_source=github&utm_medium=readme&utm_campaign=u-danu-the-agent-s-uh-oh-4c0911e4)

# The Agent's Uh-Oh

A deterministic entry picker for the make.fun bounty "The Agent's Uh-Oh". `main.ts` scores 16 hand-written candidate words against the judge's brief — in the brief's own order: a genuine one-word reaction from an agent that has no idea what to do, funny on its own with no caption, in the voice of a machine caught out mid-task, landing instantly at a glance, and fresh rather than the first obvious word anyone would type — then writes the winning word to `$MAKEFUN_OUTPUT_DIR/entry.txt` (fallback `/output/entry.txt`), reads it back, and verifies it byte-for-byte against every gate (1–99 characters, a single word, single line, valid UTF-8, not only whitespace). The scorer is sharpened beyond a flat lexicon match: a word that only names the state without turning it into a reaction is capped, shopworn first-resort gags like "uh-oh" and "oops" are docked, the twist must land in the word's second half, obvious stall sounds like "loading" and "buffering" lose freshness, and ties break criterion by criterion in the brief's order before falling back to shorter length.

The winning word:

> hallucinating

It is the agent's canonical failure mode, confessed out loud in the present tense — the machine caught mid-task telling on itself. It wins on funniness (criterion 2): the ongoing "-ing" lands the confession at the end of the word, the confession is the second comic beat, and hallucinating is the one failure that belongs to AI agents alone. Runner-up is "googling", then "erroring".

## Run

Node 22, standard library only, no network:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/uh-oh-out node main.ts
cat /tmp/uh-oh-out/entry.txt
```
