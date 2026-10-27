import { env } from "../env";

type LogLevel = "error" | "warn" | "info" | "debug";

const LEVELS: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

export const configuredLevel: LogLevel =
    (env.LOG_LEVEL as LogLevel | undefined) ?? "info";
const currentThreshold = LEVELS[configuredLevel] ?? LEVELS.info;

function isEnabled(level: LogLevel): boolean {
    return LEVELS[level] <= currentThreshold;
}

function formatData(data: unknown): string {
    if (data === undefined) return "";
    try {
        return JSON.stringify(data);
    } catch {
        return String(data);
    }
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString("en-GB", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

export interface Logger {
    error(msg: string, data?: unknown): void;
    warn(msg: string, data?: unknown): void;
    info(msg: string, data?: unknown): void;
    debug(msg: string, data?: unknown): void;
}

export function createLogger(scope: string): Logger {
    const log = (level: LogLevel, msg: string, data?: unknown) => {
        if (!isEnabled(level)) return;

        const time = formatTime(new Date());
        const prefix = `[${time}] [${level}] [${scope}] ${msg}`;
        const formatted = data === undefined ? prefix : `${prefix} ${formatData(data)}`;

        // eslint-disable-next-line no-console
        console[level === "debug" ? "log" : level](formatted);
    };

    return {
        error: (msg, data?) => log("error", msg, data),
        warn: (msg, data?) => log("warn", msg, data),
        info: (msg, data?) => log("info", msg, data),
        debug: (msg, data?) => log("debug", msg, data),
    };
}