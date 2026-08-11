const path = require("path");

const HOOK_TIMEOUT_MS = 2 * 60 * 1000;
const HOOK_LOG_PREFIX = "[config-update-hook]";
const HOOK_DEBOUNCE_MS = 500;
const HOOK_COMMAND_KEY = "configSessionChangeHook";
const STORAGE_ITEM = "__PT_LOCAL_STORAGE__";
const GLOBAL_PROFILE = "__GLOBAL_PROFILE__";

const hookDebounceTimers = new Map();
const runningHookCommands = new Set();

let fileStorageHandlerPromise = null;

async function getFileStorageHandler() {
    if (!fileStorageHandlerPromise) {
        fileStorageHandlerPromise = window.powertools.getService().createFileStorage();
    }

    return fileStorageHandlerPromise;
}

async function getHookCommand(configFilePath) {
    const service = window.powertools.getService();
    const handler = await getFileStorageHandler();
    const globalProfilePath = path.join(path.dirname(configFilePath), `${ STORAGE_ITEM }${ GLOBAL_PROFILE }`);
    const rawProfile = await service.callObject(handler, "read", globalProfilePath);
    const profile = rawProfile ? JSON.parse(rawProfile) : null;
    const hookCommand = profile?.storage?.[HOOK_COMMAND_KEY];
    return typeof hookCommand === "string" ? hookCommand.trim() : "";
}

async function runHookCommand(hookCommand, configFilePath) {
    const cwd = window.powertools.getProcessCwd();
    console.info(HOOK_LOG_PREFIX, "start configured hook", { hookCommand, configFilePath, cwd, timeoutMs: HOOK_TIMEOUT_MS });
    const pid = await window.powertools.runShellProcessWithTimeout(hookCommand, [configFilePath], cwd, HOOK_TIMEOUT_MS);
    return { hookCommand, pid };
}

export function triggerConfigUpdateHook(configFilePath) {
    if (!configFilePath) {
        console.debug(HOOK_LOG_PREFIX, "skip trigger because configFilePath is empty");
        return;
    }

    console.info(HOOK_LOG_PREFIX, "triggered", { configFilePath });

    const existingTimer = hookDebounceTimers.get(configFilePath);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
        try {
            hookDebounceTimers.delete(configFilePath);

            const hookCommand = await getHookCommand(configFilePath);
            if (!hookCommand) {
                console.debug(HOOK_LOG_PREFIX, "skip trigger because hook command is empty", { configFilePath });
                return;
            }

            const runningKey = `${ hookCommand }::${ configFilePath }`;

            if (runningHookCommands.has(runningKey)) {
                console.debug(HOOK_LOG_PREFIX, "skip trigger because hook is already running", { configFilePath, hookCommand });
                return;
            }

            runningHookCommands.add(runningKey);

            runHookCommand(hookCommand, configFilePath)
                .then(({ pid }) => {
                    console.info(HOOK_LOG_PREFIX, "hook process started", { hookCommand, pid });
                })
                .catch((error) => {
                    console.warn(HOOK_LOG_PREFIX, "run config update hook failed", error);
                })
                .finally(() => {
                    runningHookCommands.delete(runningKey);
                });
        } catch (error) {
            console.warn(HOOK_LOG_PREFIX, "resolve config update hook failed", error);
        }
    }, HOOK_DEBOUNCE_MS);

    hookDebounceTimers.set(configFilePath, timer);
}