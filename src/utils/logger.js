function createLogger(scope = "app") {
  const write = (level, message, meta) => {
    const entry = {
      ts: new Date().toISOString(),
      level,
      scope,
      message,
      ...(meta && typeof meta === "object" ? meta : {}),
    };

    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  };

  return {
    debug: (message, meta) => {
      if (process.env.LOG_LEVEL === "debug") {
        write("debug", message, meta);
      }
    },
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}

module.exports = {
  createLogger,
};
