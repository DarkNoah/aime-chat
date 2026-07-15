# Slash Command Refresh Design

## Goal

Load the current slash-command list whenever the user opens slash-command mode by entering `/`, while avoiding repeated loads as the user continues typing the same command query.

## Design

`ChatSlashCommand` will expose an optional `onOpen` callback. It will invoke the callback when its slash query changes from inactive to active. Continuing from `/` to `/goal` remains within the same active session and does not invoke the callback again. Leaving slash-command mode and later entering `/` starts a new session and invokes it again.

`ChatInput` will pass its existing `getSlashCommands` function to `onOpen` and pass the `slashCommands` state to the component. The loader combines the static `ChatSlashCommandConfig` entries with currently available skill tools.

Each command may carry a `group` value. Built-in commands use the default command group, while dynamically loaded skill commands use the skills group. `ChatSlashCommand` renders non-empty groups under the translated `Slash Commands` and `Skills` headings while keeping filtering, selection, and completion over one flat command list.

## Failure Behavior

The command component does not wait for loading before handling input. If loading fails, the existing command state remains unchanged and the rejected callback is contained so it does not create an unhandled promise rejection.

## Verification

The user explicitly requested implementation without adding tests. Existing lint/type/build checks will verify the changed files. Manual behavior to inspect is: one load per slash-command session, a new load after reopening, and separate built-in and skill groups.

## Scope

This change only adds the trigger callback, grouping, and connects the already-present loader state. It does not add loading UI, caching, retries, or unrelated command refactoring.
