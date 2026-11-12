// Local Android development over ADB; never used by release builds.
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.env.LOCALAPPDATA &&
    resolve(process.env.LOCALAPPDATA, "Android/Sdk"));
if (!sdk) throw new Error("Set ANDROID_HOME to your Android SDK directory.");
const adb = resolve(
  sdk,
  "platform-tools",
  process.platform === "win32" ? "adb.exe" : "adb",
);
if (!existsSync(adb))
  throw new Error("Android platform-tools were not found in " + sdk);
const run = (args) =>
  execFileSync(adb, args, { encoding: "utf8", windowsHide: true }).trim();
const devices = run(["devices"])
  .split(/\r?\n/)
  .slice(1)
  .filter((line) => /\tdevice$/.test(line))
  .map((line) => line.split("\t")[0]);
const serial =
  process.env.OFFERME_ANDROID_SERIAL ||
  (devices.length === 1 ? devices[0] : undefined);
if (!serial || !devices.includes(serial))
  throw new Error(
    "Start one Android emulator or connect a USB device. With multiple devices, set OFFERME_ANDROID_SERIAL.",
  );
const health = await fetch("http://127.0.0.1:4100/v1/health", {
  signal: AbortSignal.timeout(5000),
}).catch(() => null);
if (!health?.ok)
  throw new Error("Start the OFFERME backend on port 4100 first.");
run(["-s", serial, "reverse", "tcp:4100", "tcp:4100"]);
run(["-s", serial, "reverse", "tcp:8082", "tcp:8082"]);
console.info(
  "Android API connection ready through ADB. No LAN listener is required.",
);
const child = spawn(
  process.execPath,
  [
    "node_modules/expo/bin/cli",
    "start",
    "--android",
    "--localhost",
    "--port",
    "8082",
  ],
  {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ANDROID_HOME: sdk,
      ANDROID_SERIAL: serial,
      EXPO_PUBLIC_API_URL: "http://127.0.0.1:4100",
    },
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
