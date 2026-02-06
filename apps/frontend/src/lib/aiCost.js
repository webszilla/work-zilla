export function estimateCostInr(aiReplies, avgTokensPerReply, usdPer1kTokens, usdToInr) {
  const replies = Number(aiReplies);
  const tokensPerReply = Number(avgTokensPerReply);
  const usdPer1k = Number(usdPer1kTokens);
  const rate = Number(usdToInr);

  if (!Number.isFinite(replies) || replies <= 0) {
    return null;
  }
  if (!Number.isFinite(tokensPerReply) || tokensPerReply <= 0) {
    return null;
  }
  if (!Number.isFinite(usdPer1k) || usdPer1k < 0) {
    return null;
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const tokensPerMonth = replies * tokensPerReply;
  const costUsd = (tokensPerMonth / 1000) * usdPer1k;
  const costInr = costUsd * rate;
  return {
    costInr,
    tokensPerReply,
    usdPer1k,
    usdToInr: rate
  };
}
