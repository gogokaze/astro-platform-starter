import { useState, useEffect, useCallback } from 'react';

type FlightMode = 'STABILIZE' | 'LOITER' | 'AUTO' | 'RTL' | 'LAND' | 'GUIDED';
type NozzleGroup = 'A' | 'B' | 'ALL';
type StatusLevel = 'ok' | 'warn' | 'error' | 'off';

interface TelemetryState {
  // Flight
  armed: boolean;
  mode: FlightMode;
  altitude: number;
  speed: number;
  heading: number;
  gpsStatus: 'NO FIX' | '2D FIX' | '3D FIX' | 'RTK FLOAT' | 'RTK FIXED';
  gpsSats: number;
  // Work
  workEnabled: boolean;
  pumpEnabled: boolean;
  nozzleGroup: NozzleGroup;
  flowRate: number;
  sprayPressure: number;
  tankLevel: number;
  // Safety
  obstacleDetected: boolean;
  motorOverload: boolean;
  lowTank: boolean;
  lowBattery: boolean;
  linkLoss: boolean;
  failSafe: boolean;
  // Sensors
  imuOk: boolean;
  baroAlt: number;
  baroTemp: number;
  flowSensor: number;
  pressureSensor: number;
  tankSensor: number;
  // Power
  vbat: number;
  current: number;
  pumpPower: number;
  rail5v: number;
  rail3v3: number;
  // Link
  rcRssi: number;
  telemetryRssi: number;
  videoLink: boolean;
  logging: boolean;
}

const MODES: FlightMode[] = ['STABILIZE', 'LOITER', 'AUTO', 'RTL', 'LAND', 'GUIDED'];

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

function jitter(val: number, delta: number, min: number, max: number) {
  return clamp(val + (Math.random() - 0.5) * 2 * delta, min, max);
}

function StatusDot({ level }: { level: StatusLevel }) {
  const colors: Record<StatusLevel, string> = {
    ok: 'bg-green-400 shadow-[0_0_6px_#4ade80]',
    warn: 'bg-yellow-400 shadow-[0_0_6px_#facc15]',
    error: 'bg-red-500 shadow-[0_0_6px_#ef4444]',
    off: 'bg-gray-600',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[level]}`} />;
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${color}`}>
      {children}
    </span>
  );
}

function PanelCard({ title, children, accent = 'border-cyan-700' }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className={`bg-[#0d1520] border ${accent} rounded-lg flex flex-col overflow-hidden`}>
      <div className={`px-3 py-1.5 border-b ${accent} bg-[#0a1118]`}>
        <span className="text-[10px] font-bold tracking-[0.2em] text-cyan-400 uppercase">{title}</span>
      </div>
      <div className="flex-1 p-3 space-y-2">{children}</div>
    </div>
  );
}

function DataRow({ label, value, unit = '', level }: { label: string; value: React.ReactNode; unit?: string; level?: StatusLevel }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-400 uppercase tracking-wide shrink-0">{label}</span>
      <div className="flex items-center gap-1.5">
        {level && <StatusDot level={level} />}
        <span className="text-[12px] font-mono font-semibold text-gray-100">{value}</span>
        {unit && <span className="text-[10px] text-gray-500">{unit}</span>}
      </div>
    </div>
  );
}

function ToggleRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</span>
      <button
        onClick={onClick}
        className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${active ? 'bg-green-500' : 'bg-gray-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${active ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

function ProgressBar({ value, max = 100, color = 'bg-cyan-500' }: { value: number; max?: number; color?: string }) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function FlightPanel({ t, onArm, onMode }: { t: TelemetryState; onArm: () => void; onMode: (m: FlightMode) => void }) {
  const gpsLevel: StatusLevel = t.gpsStatus === 'RTK FIXED' ? 'ok' : t.gpsStatus === 'RTK FLOAT' || t.gpsStatus === '3D FIX' ? 'warn' : 'error';
  return (
    <PanelCard title="Flight Panel" accent="border-blue-700">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">ARM</span>
        <button
          onClick={onArm}
          className={`px-3 py-1 rounded text-[11px] font-bold tracking-widest transition-colors ${t.armed ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
        >
          {t.armed ? 'ARMED' : 'DISARM'}
        </button>
      </div>
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide shrink-0">Mode</span>
        <div className="flex gap-1 flex-wrap justify-end">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider transition-colors ${t.mode === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <DataRow label="Altitude" value={t.altitude.toFixed(1)} unit="m" />
      <DataRow label="Speed" value={t.speed.toFixed(1)} unit="m/s" />
      <DataRow label="Heading" value={`${t.heading.toFixed(0)}°`} />
      <DataRow label="GPS" value={t.gpsStatus} level={gpsLevel} />
      <DataRow label="Sats" value={t.gpsSats} />
    </PanelCard>
  );
}

function WorkPanel({ t, onWorkEnable, onPumpEnable, onNozzle }: {
  t: TelemetryState;
  onWorkEnable: () => void;
  onPumpEnable: () => void;
  onNozzle: (g: NozzleGroup) => void;
}) {
  const tankColor = t.tankLevel < 20 ? 'bg-red-500' : t.tankLevel < 40 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <PanelCard title="Work Panel" accent="border-green-700">
      <ToggleRow label="Work Enable" active={t.workEnabled} onClick={onWorkEnable} />
      <ToggleRow label="Pump Enable" active={t.pumpEnabled} onClick={onPumpEnable} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Nozzle</span>
        <div className="flex gap-1">
          {(['A', 'B', 'ALL'] as NozzleGroup[]).map((g) => (
            <button
              key={g}
              onClick={() => onNozzle(g)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${t.nozzleGroup === g ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <DataRow label="Flow Rate" value={t.flowRate.toFixed(2)} unit="L/min" level={t.pumpEnabled ? 'ok' : 'off'} />
      <DataRow label="Pressure" value={t.sprayPressure.toFixed(2)} unit="bar" />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Tank Level</span>
        <div className="flex items-center gap-2">
          <ProgressBar value={t.tankLevel} color={tankColor} />
          <span className="text-[12px] font-mono font-semibold text-gray-100">{t.tankLevel.toFixed(0)}%</span>
        </div>
      </div>
    </PanelCard>
  );
}

function SafetyPanel({ t }: { t: TelemetryState }) {
  const items: { label: string; active: boolean; level: StatusLevel }[] = [
    { label: 'Obstacle', active: t.obstacleDetected, level: t.obstacleDetected ? 'error' : 'ok' },
    { label: 'Overload', active: t.motorOverload, level: t.motorOverload ? 'error' : 'ok' },
    { label: 'Low Tank', active: t.lowTank, level: t.lowTank ? 'warn' : 'ok' },
    { label: 'Low Batt', active: t.lowBattery, level: t.lowBattery ? 'warn' : 'ok' },
    { label: 'Link Loss', active: t.linkLoss, level: t.linkLoss ? 'error' : 'ok' },
    { label: 'FailSafe', active: t.failSafe, level: t.failSafe ? 'error' : 'ok' },
  ];
  return (
    <PanelCard title="Safety" accent="border-red-800">
      {items.map(({ label, active, level }) => (
        <div key={label} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot level={level} />
            <span className="text-[11px] text-gray-300 uppercase tracking-wide">{label}</span>
          </div>
          {active ? (
            <Badge color="bg-red-700 text-red-100 animate-pulse">ALERT</Badge>
          ) : (
            <Badge color="bg-gray-800 text-gray-500">CLEAR</Badge>
          )}
        </div>
      ))}
    </PanelCard>
  );
}

function SensorPanel({ t }: { t: TelemetryState }) {
  return (
    <PanelCard title="Sensor Panel" accent="border-purple-700">
      <DataRow label="IMU" value={t.imuOk ? 'HEALTHY' : 'FAULT'} level={t.imuOk ? 'ok' : 'error'} />
      <DataRow label="Baro Alt" value={t.baroAlt.toFixed(1)} unit="m" level="ok" />
      <DataRow label="Baro Temp" value={t.baroTemp.toFixed(1)} unit="°C" />
      <DataRow label="Flow Sensor" value={t.flowSensor.toFixed(2)} unit="L/min" level={t.pumpEnabled ? 'ok' : 'off'} />
      <DataRow label="Pressure" value={t.pressureSensor.toFixed(2)} unit="bar" />
      <DataRow label="Tank Sensor" value={t.tankSensor.toFixed(0)} unit="%" level={t.tankSensor < 20 ? 'warn' : 'ok'} />
    </PanelCard>
  );
}

function PowerPanel({ t }: { t: TelemetryState }) {
  const batLevel = t.vbat < 21.6 ? 'error' : t.vbat < 22.2 ? 'warn' : 'ok';
  const rail5vOk = Math.abs(t.rail5v - 5) < 0.1;
  const rail3v3Ok = Math.abs(t.rail3v3 - 3.3) < 0.05;
  return (
    <PanelCard title="Power Panel" accent="border-yellow-700">
      <DataRow label="VBAT" value={t.vbat.toFixed(2)} unit="V" level={batLevel} />
      <DataRow label="Current" value={t.current.toFixed(1)} unit="A" />
      <DataRow label="Pump Pwr" value={t.pumpPower.toFixed(0)} unit="W" level={t.pumpEnabled ? 'ok' : 'off'} />
      <div className="border-t border-gray-800 pt-1 mt-1" />
      <DataRow label="5V Rail" value={t.rail5v.toFixed(2)} unit="V" level={rail5vOk ? 'ok' : 'error'} />
      <DataRow label="3V3 Rail" value={t.rail3v3.toFixed(2)} unit="V" level={rail3v3Ok ? 'ok' : 'error'} />
    </PanelCard>
  );
}

function LinkPanel({ t }: { t: TelemetryState }) {
  const rssiLevel = (v: number): StatusLevel => v > 70 ? 'ok' : v > 40 ? 'warn' : 'error';
  return (
    <PanelCard title="Link Panel" accent="border-orange-700">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">RC RSSI</span>
        <div className="flex items-center gap-2">
          <ProgressBar value={t.rcRssi} color={t.rcRssi > 70 ? 'bg-green-500' : t.rcRssi > 40 ? 'bg-yellow-500' : 'bg-red-500'} />
          <span className="text-[12px] font-mono font-semibold text-gray-100">{t.rcRssi}%</span>
          <StatusDot level={rssiLevel(t.rcRssi)} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Telemetry</span>
        <div className="flex items-center gap-2">
          <ProgressBar value={t.telemetryRssi} color={t.telemetryRssi > 70 ? 'bg-green-500' : t.telemetryRssi > 40 ? 'bg-yellow-500' : 'bg-red-500'} />
          <span className="text-[12px] font-mono font-semibold text-gray-100">{t.telemetryRssi}%</span>
          <StatusDot level={rssiLevel(t.telemetryRssi)} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Video</span>
        <div className="flex items-center gap-1.5">
          <StatusDot level={t.videoLink ? 'ok' : 'error'} />
          <span className="text-[12px] font-mono font-semibold text-gray-100">{t.videoLink ? 'LIVE' : 'NO SIGNAL'}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Logging</span>
        <div className="flex items-center gap-1.5">
          <StatusDot level={t.logging ? 'ok' : 'off'} />
          <span className="text-[12px] font-mono font-semibold text-gray-100">{t.logging ? 'ACTIVE' : 'STOPPED'}</span>
          {t.logging && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
        </div>
      </div>
    </PanelCard>
  );
}

const initialState: TelemetryState = {
  armed: false,
  mode: 'LOITER',
  altitude: 15.0,
  speed: 5.0,
  heading: 270,
  gpsStatus: 'RTK FIXED',
  gpsSats: 18,
  workEnabled: false,
  pumpEnabled: false,
  nozzleGroup: 'ALL',
  flowRate: 0,
  sprayPressure: 0,
  tankLevel: 85,
  obstacleDetected: false,
  motorOverload: false,
  lowTank: false,
  lowBattery: false,
  linkLoss: false,
  failSafe: false,
  imuOk: true,
  baroAlt: 15.2,
  baroTemp: 28.5,
  flowSensor: 0,
  pressureSensor: 0,
  tankSensor: 85,
  vbat: 24.8,
  current: 18.5,
  pumpPower: 0,
  rail5v: 5.02,
  rail3v3: 3.31,
  rcRssi: 92,
  telemetryRssi: 88,
  videoLink: true,
  logging: true,
};

export default function MissionPlanner() {
  const [t, setT] = useState<TelemetryState>(initialState);
  const [tick, setTick] = useState(0);

  const update = useCallback((patch: Partial<TelemetryState>) => {
    setT((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setT((prev) => {
      const pumpEnabled = prev.pumpEnabled && prev.workEnabled;
      const flowRate = pumpEnabled ? jitter(prev.flowRate || 4.5, 0.15, 4.0, 5.2) : 0;
      const sprayPressure = pumpEnabled ? jitter(prev.sprayPressure || 2.8, 0.08, 2.5, 3.2) : 0;
      const tankLevel = pumpEnabled ? Math.max(0, prev.tankLevel - 0.05) : prev.tankLevel;
      const pumpPower = pumpEnabled ? jitter(prev.pumpPower || 180, 5, 150, 220) : 0;
      const lowTank = tankLevel < 20;
      const vbat = jitter(prev.vbat, 0.02, 21.0, 25.2);
      const current = prev.armed ? jitter(prev.current, 0.5, 12, 45) : jitter(prev.current, 0.1, 2, 4);
      const lowBattery = vbat < 22.0;
      const rcRssi = clamp(Math.round(jitter(prev.rcRssi, 2, 0, 100)), 0, 100);
      const telemetryRssi = clamp(Math.round(jitter(prev.telemetryRssi, 2, 0, 100)), 0, 100);
      const linkLoss = rcRssi < 20 || telemetryRssi < 20;
      const failSafe = linkLoss || lowBattery;
      const altitude = prev.armed ? jitter(prev.altitude, 0.1, 0, 120) : prev.altitude;
      const speed = prev.armed ? jitter(prev.speed, 0.1, 0, 15) : jitter(prev.speed, 0.05, 0, 1);
      const heading = prev.armed ? jitter(prev.heading, 1, 0, 360) : prev.heading;
      const baroAlt = jitter(prev.baroAlt, 0.05, 0, 120);
      const baroTemp = jitter(prev.baroTemp, 0.02, 15, 45);
      const gpsSats = Math.round(jitter(prev.gpsSats, 0.3, 10, 24));

      return {
        ...prev,
        flowRate,
        sprayPressure,
        tankLevel,
        pumpPower,
        lowTank,
        vbat,
        current,
        lowBattery,
        rcRssi,
        telemetryRssi,
        linkLoss,
        failSafe,
        altitude,
        speed,
        heading: heading < 0 ? heading + 360 : heading > 360 ? heading - 360 : heading,
        baroAlt,
        baroTemp,
        gpsSats,
        flowSensor: flowRate,
        pressureSensor: sprayPressure,
        tankSensor: tankLevel,
      };
    });
  }, [tick]);

  const anyAlert = t.obstacleDetected || t.motorOverload || t.lowTank || t.lowBattery || t.linkLoss || t.failSafe;

  return (
    <div className="min-h-screen bg-[#080e18] text-white flex flex-col font-mono">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a1220] border-b border-cyan-900">
        <div className="flex items-center gap-3">
          <span className="text-cyan-400 font-bold tracking-[0.3em] text-sm">YFL MISSION PLANNER</span>
          <Badge color="bg-green-800 text-green-300">AGRI WORK MODE</Badge>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          {anyAlert && (
            <span className="flex items-center gap-1.5 text-red-400 font-bold animate-pulse">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              ALERT ACTIVE
            </span>
          )}
          <span className="text-gray-500">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <div className="flex items-center gap-1.5">
            <StatusDot level={t.armed ? 'error' : 'ok'} />
            <span className={t.armed ? 'text-red-400 font-bold' : 'text-gray-400'}>{t.armed ? 'ARMED' : 'DISARMED'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">MODE:</span>
            <span className="text-blue-400 font-bold">{t.mode}</span>
          </div>
        </div>
      </div>

      {/* Panel grid */}
      <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3 p-3">
        <FlightPanel
          t={t}
          onArm={() => update({ armed: !t.armed })}
          onMode={(m) => update({ mode: m })}
        />
        <WorkPanel
          t={t}
          onWorkEnable={() => update({ workEnabled: !t.workEnabled })}
          onPumpEnable={() => update({ pumpEnabled: !t.pumpEnabled })}
          onNozzle={(g) => update({ nozzleGroup: g })}
        />
        <SafetyPanel t={t} />
        <SensorPanel t={t} />
        <PowerPanel t={t} />
        <LinkPanel t={t} />
      </div>

      {/* Footer status bar */}
      <div className="flex items-center gap-6 px-4 py-1.5 bg-[#0a1220] border-t border-cyan-900 text-[10px] text-gray-500">
        <span>GPS: <span className="text-cyan-400">{t.gpsStatus}</span> ({t.gpsSats} sats)</span>
        <span>BAT: <span className={t.lowBattery ? 'text-red-400' : 'text-green-400'}>{t.vbat.toFixed(2)}V</span></span>
        <span>TANK: <span className={t.lowTank ? 'text-yellow-400' : 'text-green-400'}>{t.tankLevel.toFixed(0)}%</span></span>
        <span>RC: <span className="text-cyan-400">{t.rcRssi}%</span></span>
        <span className="ml-auto text-gray-600">YFL Agri Systems · Sim Mode</span>
      </div>
    </div>
  );
}
