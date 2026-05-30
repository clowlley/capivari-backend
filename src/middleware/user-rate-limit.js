// Anti-spam: limita o número de ações por usuário dentro de uma janela de tempo.
// Em memória (suficiente para 1 instância). Deve rodar DEPOIS de authenticateUser.
function createUserRateLimit({ windowMs, max, message }) {
  const hits = new Map(); // userId -> number[] (timestamps)

  // Limpeza periódica para não vazar memória
  setInterval(() => {
    const now = Date.now();
    for (const [id, arr] of hits.entries()) {
      const fresh = arr.filter((t) => now - t < windowMs);
      if (fresh.length === 0) hits.delete(id);
      else hits.set(id, fresh);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const id = req.user?.id;
    if (!id) return next();
    const now = Date.now();
    const arr = (hits.get(id) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      const retryAfterMs = windowMs - (now - arr[0]);
      return res.status(429).json({
        error: message || 'Você está indo rápido demais. Aguarde um momento e tente novamente.',
        retryAfterMs,
      });
    }
    arr.push(now);
    hits.set(id, arr);
    next();
  };
}

module.exports = createUserRateLimit;
