import { parseSSHMarkdown } from './chat-tool-ssh-preview';

describe('ChatToolSSHPreview Markdown parser', () => {
  it('parses SSH metadata and dynamic fenced terminal sections', () => {
    const markdown = `# SSH Session

| Field | Value |
| --- | --- |
| Connection ID | ssh-1 |
| Target | root@[::1]:22 |
| State | running |
| Cursor | 2:4 |

## Screen

\`\`\`\`text
contains \`\`\` fence
\`\`\`\``;

    expect(parseSSHMarkdown(markdown)).toEqual(
      expect.objectContaining({
        connectionId: 'ssh-1',
        target: 'root@[::1]:22',
        state: 'running',
        cursor: '2:4',
        screen: 'contains ``` fence',
      }),
    );
  });

  it('ignores unrelated Markdown', () => {
    expect(parseSSHMarkdown('# Other output')).toBeNull();
  });

  it('parses a completed foreground file transfer', () => {
    const markdown = `# SSH Transfer

| Field | Value |
| --- | --- |
| Connection ID | ssh-2 |
| Target | config:production |
| Direction | download |
| Local path | C:\\\\Users\\\\Noah\\\\file.txt |
| Remote path | /tmp/file.txt |
| State | exited |
| Cursor | 0:12 |
| Exit code | 0 |

## Screen

\`\`\`text
file.txt 100%
\`\`\``;

    expect(parseSSHMarkdown(markdown)).toEqual(
      expect.objectContaining({
        connectionId: 'ssh-2',
        direction: 'download',
        localPath: 'C:\\Users\\Noah\\file.txt',
        remotePath: '/tmp/file.txt',
        state: 'exited',
        screen: 'file.txt 100%',
      }),
    );
  });
});
