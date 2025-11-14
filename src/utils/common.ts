export const truncateText = (
  text: string,
  maxLength: number = 1000,
): string => {
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
