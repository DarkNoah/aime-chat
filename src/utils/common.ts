export const truncateText = (
  text: string,
  maxLength: number = 1000,
  unit: 'characters' | 'lines' = 'characters',
): string => {
  if (unit === 'lines') {
    const lines = text.split('\n');
    if (lines.length <= maxLength) return text;

    // Count the truncation marker as one line within the output limit.
    const headLength = Math.floor((maxLength - 1) / 2);
    const tailLength = maxLength - 1 - headLength;
    return [
      ...lines.slice(0, headLength),
      '...[truncated]...',
      ...lines.slice(lines.length - tailLength),
    ].join('\n');
  }

  if (text.length <= maxLength) {
    return text; // 如果原文本小于最大长度，则直接返回
  }

  // 计算前后部分的字符数
  const halfLength = Math.floor((maxLength - 100) / 2); // 保留前后各一半，留出省略的"..."

  // 获取前后字符和省略的部分
  const front = text.slice(0, halfLength);
  const back = text.slice(-halfLength);

  return `${front}\n...[truncated]...\n${back}`;
};
