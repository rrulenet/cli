export function renderServiceTemplate(input: {
  target: "launchd" | "systemd-user";
  rrulenetBin: string;
  dataDir: string;
  intervalMs: number;
  label: string;
}): string {
  if (input.target === "launchd") {
    return renderLaunchdTemplate(input);
  }

  return renderSystemdUserTemplate(input);
}

function renderLaunchdTemplate(input: {
  rrulenetBin: string;
  dataDir: string;
  intervalMs: number;
  label: string;
}): string {
  const seconds = Math.max(1, Math.floor(input.intervalMs / 1000));

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${input.label}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${escapeXml(input.rrulenetBin)}</string>
      <string>local</string>
      <string>run</string>
      <string>--interval-ms</string>
      <string>${input.intervalMs}</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
      <key>RRULENET_DATA_DIR</key>
      <string>${escapeXml(input.dataDir)}</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>${seconds}</integer>

    <key>StandardOutPath</key>
    <string>${escapeXml(input.dataDir)}/rrulenet-runner.out.log</string>

    <key>StandardErrorPath</key>
    <string>${escapeXml(input.dataDir)}/rrulenet-runner.err.log</string>
  </dict>
</plist>
`;
}

function renderSystemdUserTemplate(input: {
  rrulenetBin: string;
  dataDir: string;
  intervalMs: number;
  label: string;
}): string {
  return `[Unit]
Description=rrulenet local runner
After=network.target

[Service]
Type=simple
Environment=RRULENET_DATA_DIR=${input.dataDir}
ExecStart=${input.rrulenetBin} local run --interval-ms ${input.intervalMs}
Restart=always
RestartSec=5
WorkingDirectory=${input.dataDir}
StandardOutput=append:${input.dataDir}/rrulenet-runner.out.log
StandardError=append:${input.dataDir}/rrulenet-runner.err.log

[Install]
WantedBy=default.target
`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
