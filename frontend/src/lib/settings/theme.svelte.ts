import { createLogger } from "$lib/logger";

const logger = createLogger("theme");

const MODE_STORAGE_KEY = "mode";
const THEME_STORAGE_KEY = "theme";

export type ThemeMode = "light" | "dark" | "system";
type ResolvedMode = "light" | "dark";

export interface ThemeModeOption {
    id: ThemeMode;
    label: string;
}

export interface ThemeOption {
    id: string;
    label: string;
}

/** Must match the themes imported in `src/routes/layout.css`. */
export const THEMES: ThemeOption[] = [
    { id: "cerberus", label: "Cerberus" },
    { id: "catppuccin", label: "Catppuccin" },
    { id: "concord", label: "Concord" },
    { id: "dracula", label: "Dracula" },
    { id: "mona", label: "Mona" },
    { id: "rose", label: "Rose" },
    { id: "seafoam", label: "Seafoam" },
];

export const THEME_MODES: ThemeModeOption[] = [
    { id: "light", label: "Hell" },
    { id: "dark", label: "Dunkel" },
    { id: "system", label: "System" },
];

function getSystemMode(): ResolvedMode {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveMode(mode: ThemeMode): ResolvedMode {
    return mode === "system" ? getSystemMode() : mode;
}

class ThemeManager {
    mode = $state<ThemeMode>("system");
    theme = $state<string>(THEMES[0].id);

    #appliedOnce = false;

    constructor() {
        if (typeof window === "undefined") return;
        this.#load();

        $effect.root(() => {
            $effect(() => {
                this.#apply();
            });

            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
            const onSystemChange = () => {
                if (this.mode === "system") {
                    this.#apply();
                }
            };
            mediaQuery.addEventListener("change", onSystemChange);
            return () => mediaQuery.removeEventListener("change", onSystemChange);
        });
    }

    #load() {
        try {
            const storedMode = localStorage.getItem(MODE_STORAGE_KEY);
            if (storedMode === "light" || storedMode === "dark" || storedMode === "system") {
                this.mode = storedMode;
            }
            const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
            if (storedTheme && THEMES.some((t) => t.id === storedTheme)) {
                this.theme = storedTheme;
            }
        } catch (error) {
            logger.error("failed to load theme settings", { error: String(error) });
        }
    }

    /**
     * Applies the current theme + resolved mode to the document.
     * Uses the View Transitions API so the new theme is revealed through
     * the mask animation defined in `layout.css`.
     */
    #apply(): ResolvedMode {
        const resolved = resolveMode(this.mode);
        const nextTheme = this.theme;

        const applyAttributes = () => {
            document.documentElement.setAttribute("data-theme", nextTheme);
            document.documentElement.setAttribute("data-mode", resolved);
        };

        // Skip the transition animation on the initial application to avoid
        // replaying the reveal animation on every page load.
        if (this.#appliedOnce && document.startViewTransition) {
            document.startViewTransition(applyAttributes);
        } else {
            applyAttributes();
        }
        this.#appliedOnce = true;

        try {
            localStorage.setItem(MODE_STORAGE_KEY, this.mode);
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch (error) {
            logger.error("failed to persist theme settings", { error: String(error) });
        }

        return resolved;
    }
}

export const themeManager = new ThemeManager();