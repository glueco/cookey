/**
 * Structured Logging System
 *
 * Provides consistent, structured logging across the proxy application.
 * Supports different log levels and can be configured for different environments.
 *
 * Features:
 * - Structured JSON output in production
 * - Human-readable output in development
 * - Request correlation via requestId
 * - Context tagging for filtering
 */

// ============================================
// TYPES
// ============================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Unique request ID for correlation */
  requestId?: string;
  /** Resource being accessed (e.g., llm:groq) */
  resourceId?: string;
  /** Action being performed (e.g., chat.completions) */
  action?: string;
  /** App ID making the request */
  appId?: string;
  /** HTTP method */
  method?: string;
  /** Request path */
  path?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** HTTP status code */
  status?: number;
  /** Error code */
  errorCode?: string;
  /** Any additional context */
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context: LogContext;
}

// ============================================
// CONFIGURATION
// ============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Environment-based configuration
const isDev = process.env.NODE_ENV === "development";
const logLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (isDev ? "debug" : "info");
const minLevel = LOG_LEVELS[logLevel];

// ============================================
// LOGGER CLASS
// ============================================

class Logger {
  private context: LogContext = {};

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const child = new Logger();
    child.context = { ...this.context, ...context };
    return child;
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  /**
   * Log at info level
   */
  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  /**
   * Log at error level
   */
  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  /**
   * Log an error object with stack trace
   */
  errorWithStack(message: string, error: Error, context?: LogContext): void {
    this.log("error", message, {
      ...context,
      errorName: error.name,
      errorMessage: error.message,
      stack: isDev ? error.stack : undefined,
    });
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVELS[level] < minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message: redactSecrets(message),
      context: redactContext({ ...this.context, ...context }),
    };

    if (isDev) {
      this.logDev(entry);
    } else {
      this.logProd(entry);
    }
  }

  /**
   * Development-friendly console output
   */
  private logDev(entry: LogEntry): void {
    const { level, message, context } = entry;
    const timestamp = new Date().toLocaleTimeString();

    const levelColors: Record<LogLevel, string> = {
      debug: "\x1b[90m", // Gray
      info: "\x1b[36m", // Cyan
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
    };
    const reset = "\x1b[0m";
    const color = levelColors[level];

    // Build context string
    const contextParts: string[] = [];
    if (context.requestId)
      contextParts.push(`req=${context.requestId.slice(0, 8)}`);
    if (context.appId) contextParts.push(`app=${context.appId.slice(0, 8)}`);
    if (context.resourceId) contextParts.push(`resource=${context.resourceId}`);
    if (context.action) contextParts.push(`action=${context.action}`);
    if (context.durationMs !== undefined)
      contextParts.push(`${context.durationMs}ms`);
    if (context.status) contextParts.push(`status=${context.status}`);
    if (context.errorCode) contextParts.push(`error=${context.errorCode}`);

    const contextStr =
      contextParts.length > 0 ? ` [${contextParts.join(" ")}]` : "";

    console.log(
      `${color}[${timestamp}] ${level.toUpperCase().padEnd(5)}${reset} ${message}${contextStr}`,
    );

    // Log additional context in debug mode
    const {
      requestId,
      appId,
      resourceId,
      action,
      durationMs,
      status,
      errorCode,
      ...extra
    } = context;
    if (Object.keys(extra).length > 0) {
      console.log(`  ${JSON.stringify(extra)}`);
    }
  }

  /**
   * Production JSON output (for log aggregators)
   */
  private logProd(entry: LogEntry): void {
    // Clean up undefined values for cleaner JSON
    const cleanContext = Object.fromEntries(
      Object.entries(entry.context).filter(([, v]) => v !== undefined),
    );

    const output = {
      ...entry,
      context: cleanContext,
    };

    // Use appropriate console method for log level
    switch (entry.level) {
      case "error":
        console.error(JSON.stringify(output));
        break;
      case "warn":
        console.warn(JSON.stringify(output));
        break;
      default:
        console.log(JSON.stringify(output));
    }
  }
}

// ============================================
// SECRET REDACTION
// Grant tokens (ck_…), pairing strings, and obvious API-key shapes must
// never reach log output. There is a test asserting this — keep it green.
// ============================================

const SECRET_PATTERNS = [
  /ck_[0-9A-Za-z]{10,}/g, // grant tokens
  /pair::[^\s"']+/g, // pairing strings (embed the connect code)
  /(sk|gsk|re|sk-or|sk-ant)[-_][0-9A-Za-z_-]{16,}/g, // common provider key shapes
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        redactValue(v),
      ]),
    );
  }
  return value;
}

function redactContext(context: LogContext): LogContext {
  return redactValue(context) as LogContext;
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const logger = new Logger();

// ============================================
// REQUEST LOGGING HELPERS
// ============================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a logger for a specific request
 */
export function createRequestLogger(requestId: string): Logger {
  return logger.child({ requestId });
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

export default logger;
