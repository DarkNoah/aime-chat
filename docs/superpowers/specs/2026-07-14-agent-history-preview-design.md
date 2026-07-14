# Agent History Preview Design

## Goal

Show the complete persisted conversation for an `Agent` or `Task` tool call in the tool-result preview. The history loads when the preview opens and refreshes only when the user presses a refresh button.

## Scope

This change covers sub-agent thread identity, history lookup through the existing Mastra renderer API, and a new read-only history component under `src/renderer/components/chat-ui/chat-preview`.

It does not add polling, push events, a new IPC channel, or changes to the parent chat message format.

## Architecture

Each sub-agent execution has a stable Mastra thread ID derived from its tool call ID:

```text
subagent:${toolCallId}
```

A shared `getSubAgentThreadId(toolCallId)` helper will be used by both the main-process Agent tool and the renderer. This keeps the persisted thread key and the lookup key identical without exposing any additional IPC contract.

The renderer will reuse the existing preload method:

```ts
window.electron.mastra.getThreadMessages({
  threadId: getSubAgentThreadId(toolCallId),
  perPage: false,
});
```

`getThreadMessages` already resolves the resource ID from the stored thread and returns converted `UIMessage[]`, so the renderer does not need the root chat thread ID or root resource ID.

## Components

### Shared thread identity

Create `src/utils/subagent-thread.ts` with a single pure helper that rejects an empty tool call ID and returns `subagent:${toolCallId}`.

Update `src/main/tools/common/agent.ts` to use this helper when creating and executing the sub-agent memory thread. The existing resource ID remains unique to the root resource and tool call. The thread title and metadata remain unchanged.

### Agent history UI

Create `src/renderer/components/chat-ui/chat-preview/chat-tool-agent-history-preview.tsx`.

The component accepts `toolCallId` and:

- loads all persisted messages once when mounted or when `toolCallId` changes;
- renders user and assistant text using the existing message presentation primitives;
- renders reasoning parts and tool-call parts with the existing reasoning and tool-message components;
- renders file attachments with the existing attachment component;
- exposes a refresh button that repeats the same query;
- disables and animates the refresh button while a request is in flight;
- ignores a stale response if the component switches to another tool call before the previous request resolves.

Update `src/renderer/components/chat-ui/chat-preview/chat-tool-result-preview.tsx` to mount this component only for `Agent` and `Task` tool results. The existing input and final-output sections remain intact so older tool calls without persisted sub-agent history still retain their current preview.

## Data Flow

1. `Agent.execute` derives `subagent:${toolCallId}` and saves the sub-agent conversation to that Mastra thread.
2. The user opens the parent `Agent` or `Task` tool-result preview.
3. `ChatToolAgentHistoryPreview` derives the same thread ID and calls the existing `getThreadMessages` preload method with `perPage: false`.
4. The main process returns the complete conversation as `UIMessage[]`.
5. The component renders the messages in stored order.
6. Pressing refresh repeats steps 3 through 5. No background request runs after the initial load.

## States and Errors

- Initial load: show a compact loading indicator.
- Loaded with messages: show the read-only conversation and an enabled refresh button.
- Loaded with no messages: show an empty-history message and keep refresh available.
- Query failure: show an error alert and keep refresh available as the retry action.
- Refresh failure after a successful load: retain the previously loaded messages and show the error, rather than clearing useful history.
- Missing `toolCallId`: do not query and show the empty-history state.

## Testing

Add focused tests that verify:

- the shared helper produces `subagent:${toolCallId}` and rejects an empty ID;
- the new component queries `getThreadMessages` with the derived thread ID and `perPage: false`;
- persisted user and assistant messages render after the initial query;
- pressing refresh issues a second query and replaces the rendered history;
- empty and failed queries render their corresponding states;
- changing `toolCallId` cannot allow an older pending response to overwrite the newer history.

No broad refactor of the existing chat panel or IPC layer is included.

Per the requested verification boundary, implementation will not run a compile, build, or `tsc` check. Verification is limited to focused Jest tests for this feature and a lightweight diff sanity check.
