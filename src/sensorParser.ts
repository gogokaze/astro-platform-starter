export type SensorReading = {
  time_ms: number;
  target_count: number;
  detect_threshold: number;
  tracking_state: 0 | 1;
  warn_flag: 0 | 1;
  battery_mv: number;
};

export function parseSensorLine(line: string): SensorReading {
  const fields: Record<string, string> = {};
  for (const pair of line.split(',')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    fields[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
  }
  return {
    time_ms: parseInt(fields.time_ms, 10),
    target_count: parseInt(fields.target_count, 10),
    detect_threshold: parseInt(fields.detect_threshold, 10),
    tracking_state: parseInt(fields.tracking_state, 10) as 0 | 1,
    warn_flag: parseInt(fields.warn_flag, 10) as 0 | 1,
    battery_mv: parseInt(fields.battery_mv, 10),
  };
}

export function parseSensorData(raw: string): SensorReading[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseSensorLine);
}
