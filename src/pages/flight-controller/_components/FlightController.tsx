import { useState, useEffect, useRef, useCallback } from "react";
import {
  updatePID,
  createPIDState,
  DEFAULT_ANGLE_PID,
  DEFAULT_RATE_PID,
  type PIDConfig,
  type PIDState,
  type PIDOutput,
} from "../../../utils/pid";
import { mixQuadX, motorPercent, type ControlCommands } from "../../../utils/mixer";

interface Axis {
  targetAngle: number;
  currentAngle: number;
  targetRate: number;
  currentRate: number;
  cmd: number;
  anglePID: PIDOutput;
  ratePID: PIDOutput;
}

const AXES = ["roll", "pitch", "yaw"] as const;
type AxisName = (typeof AXES)[number];

const INITIAL_AXIS: Axis = {
  targetAngle: 0,
  currentAngle: 0,
  targetRate: 0,
  currentRate: 0,
  cmd: 0,
  anglePID: { output: 0, pTerm: 0, iTerm: 0, dTerm: 0, error: 0 },
  ratePID: { output: 0, pTerm: 0, iTerm: 0, dTerm: 0, error: 0 },
};

interface SimState {
  roll: Axis;
  pitch: Axis;
  yaw: Axis;
  throttle: number;
}

function Bar({ value, max = 1, color = "bg-primary" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.abs(value / max) * 100);
  return (
    <div className="w-full bg-base-300 rounded h-2 overflow-hidden">
      <div
        className={`h-full rounded transition-all duration-100 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PIDBreakdown({ pid, label }: { pid: PIDOutput; label: string }) {
  return (
    <div className="text-xs space-y-0.5">
      <div className="font-semibold text-base-content/70">{label}</div>
      <div className="flex gap-3">
        <span className="text-info">P:{pid.pTerm.toFixed(3)}</span>
        <span className="text-success">I:{pid.iTerm.toFixed(3)}</span>
        <span className="text-warning">D:{pid.dTerm.toFixed(3)}</span>
        <span className="font-bold">→{pid.output.toFixed(3)}</span>
      </div>
    </div>
  );
}

function MotorDiagram({ m1, m2, m3, m4 }: { m1: number; m2: number; m3: number; m4: number }) {
  const cell = (label: string, val: number, spin: string) => (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-14 h-14 rounded-full border-4 border-primary flex items-center justify-center text-sm font-bold transition-all duration-100"
        style={{ opacity: 0.4 + val * 0.6, borderWidth: `${2 + val * 4}px` }}
      >
        {motorPercent(val)}%
      </div>
      <span className="text-xs text-base-content/60">
        {label} {spin}
      </span>
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-6 place-items-center p-4">
      {cell("FL", m1, "↺")}
      {cell("FR", m2, "↻")}
      {cell("RL", m4, "↻")}
      {cell("RR", m3, "↺")}
    </div>
  );
}

export default function FlightController() {
  const [running, setRunning] = useState(false);
  const [throttle, setThrottle] = useState(0.5);
  const [targets, setTargets] = useState({ roll: 0, pitch: 0, yaw: 0 });
  const [sim, setSim] = useState<SimState>({
    roll: { ...INITIAL_AXIS },
    pitch: { ...INITIAL_AXIS },
    yaw: { ...INITIAL_AXIS },
    throttle: 0.5,
  });
  const [anglePIDCfg] = useState<PIDConfig>({ ...DEFAULT_ANGLE_PID });
  const [ratePIDCfg] = useState<PIDConfig>({ ...DEFAULT_RATE_PID });

  const stateRef = useRef<{
    anglePIDStates: Record<AxisName, PIDState>;
    ratePIDStates: Record<AxisName, PIDState>;
    currentAngles: Record<AxisName, number>;
    currentRates: Record<AxisName, number>;
    lastTime: number;
  }>({
    anglePIDStates: {
      roll: createPIDState(),
      pitch: createPIDState(),
      yaw: createPIDState(),
    },
    ratePIDStates: {
      roll: createPIDState(),
      pitch: createPIDState(),
      yaw: createPIDState(),
    },
    currentAngles: { roll: 0, pitch: 0, yaw: 0 },
    currentRates: { roll: 0, pitch: 0, yaw: 0 },
    lastTime: 0,
  });

  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const throttleRef = useRef(throttle);
  throttleRef.current = throttle;

  const tick = useCallback(() => {
    const now = performance.now();
    const s = stateRef.current;
    const dt = s.lastTime === 0 ? 0.01 : Math.min((now - s.lastTime) / 1000, 0.05);
    s.lastTime = now;

    const newAxes: Partial<SimState> = {};

    for (const axis of AXES) {
      const target = targetsRef.current[axis];

      // Cascade: angle PID → target rate
      const anglePIDOut = updatePID(
        anglePIDCfg,
        s.anglePIDStates[axis],
        target,
        s.currentAngles[axis],
        dt
      );
      const targetRate = anglePIDOut.output;

      // Rate PID → command
      const ratePIDOut = updatePID(
        ratePIDCfg,
        s.ratePIDStates[axis],
        targetRate,
        s.currentRates[axis],
        dt
      );
      const cmd = ratePIDOut.output;

      // Simulate plant: rate integrates to angle (simple first-order)
      s.currentRates[axis] += (cmd * 300 - s.currentRates[axis]) * dt * 5;
      s.currentAngles[axis] += s.currentRates[axis] * dt;

      newAxes[axis] = {
        targetAngle: target,
        currentAngle: s.currentAngles[axis],
        targetRate,
        currentRate: s.currentRates[axis],
        cmd,
        anglePID: anglePIDOut,
        ratePID: ratePIDOut,
      };
    }

    setSim({
      ...(newAxes as Pick<SimState, AxisName>),
      throttle: throttleRef.current,
    });
  }, [anglePIDCfg, ratePIDCfg]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(tick, 20);
    return () => clearInterval(id);
  }, [running, tick]);

  const reset = () => {
    stateRef.current = {
      anglePIDStates: {
        roll: createPIDState(),
        pitch: createPIDState(),
        yaw: createPIDState(),
      },
      ratePIDStates: {
        roll: createPIDState(),
        pitch: createPIDState(),
        yaw: createPIDState(),
      },
      currentAngles: { roll: 0, pitch: 0, yaw: 0 },
      currentRates: { roll: 0, pitch: 0, yaw: 0 },
      lastTime: 0,
    };
    setSim({ roll: { ...INITIAL_AXIS }, pitch: { ...INITIAL_AXIS }, yaw: { ...INITIAL_AXIS }, throttle });
    setTargets({ roll: 0, pitch: 0, yaw: 0 });
  };

  const motorCmds: ControlCommands = {
    throttle: sim.throttle,
    roll: sim.roll.cmd,
    pitch: sim.pitch.cmd,
    yaw: sim.yaw.cmd,
  };
  const motors = mixQuadX(motorCmds);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              className={`btn ${running ? "btn-error" : "btn-success"}`}
              onClick={() => setRunning((r) => !r)}
            >
              {running ? "Stop" : "Start"} Simulation
            </button>
            <button className="btn btn-ghost" onClick={reset}>
              Reset
            </button>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Throttle</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={throttle}
                onChange={(e) => setThrottle(parseFloat(e.target.value))}
                className="range range-primary range-sm w-32"
              />
              <span className="text-sm w-10">{Math.round(throttle * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Target setpoints */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <h2 className="card-title text-sm">Target Angles (degrees)</h2>
          <div className="grid grid-cols-3 gap-4">
            {AXES.map((axis) => (
              <div key={axis} className="space-y-1">
                <label className="text-sm font-medium capitalize">{axis}</label>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="1"
                  value={targets[axis]}
                  onChange={(e) =>
                    setTargets((t) => ({ ...t, [axis]: parseFloat(e.target.value) }))
                  }
                  className="range range-primary range-xs w-full"
                />
                <div className="text-center text-xs font-mono">{targets[axis]}°</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {AXES.map((axis) => {
          const a = sim[axis];
          return (
            <div key={axis} className="card bg-base-200 shadow">
              <div className="card-body space-y-3">
                <h2 className="card-title capitalize">{axis}</h2>

                {/* Angle */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Target angle</span>
                    <span className="font-mono">{a.targetAngle.toFixed(1)}°</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Current angle</span>
                    <span className="font-mono">{a.currentAngle.toFixed(1)}°</span>
                  </div>
                  <Bar value={a.currentAngle} max={45} color="bg-info" />
                </div>

                <div className="divider my-0 text-xs">Angle PID</div>
                <PIDBreakdown pid={a.anglePID} label="→ target rate" />

                {/* Rate */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Target rate</span>
                    <span className="font-mono">{a.targetRate.toFixed(1)} °/s</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Current rate</span>
                    <span className="font-mono">{a.currentRate.toFixed(1)} °/s</span>
                  </div>
                </div>

                <div className="divider my-0 text-xs">Rate PID</div>
                <PIDBreakdown pid={a.ratePID} label="→ cmd" />

                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold">cmd</span>
                  <span className="font-mono text-primary font-bold">
                    {a.cmd.toFixed(4)}
                  </span>
                </div>
                <Bar value={a.cmd} max={1} color="bg-primary" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mixer outputs */}
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <h2 className="card-title">Mixer → Motor Outputs</h2>
          <div className="flex flex-wrap gap-8 items-center">
            <div className="space-y-1 text-sm">
              <div className="font-semibold mb-2">Commands</div>
              {(["roll", "pitch", "yaw"] as const).map((a) => (
                <div key={a} className="flex gap-2 items-center">
                  <span className="w-12 capitalize">{a}</span>
                  <Bar value={sim[a].cmd} max={1} color="bg-secondary" />
                  <span className="font-mono w-16 text-right">{sim[a].cmd.toFixed(4)}</span>
                </div>
              ))}
              <div className="flex gap-2 items-center mt-1">
                <span className="w-12">throttle</span>
                <Bar value={throttle} max={1} color="bg-accent" />
                <span className="font-mono w-16 text-right">{throttle.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex-1 min-w-48">
              <div className="font-semibold mb-2 text-sm">Motor PWM (X-frame)</div>
              <MotorDiagram m1={motors.m1} m2={motors.m2} m3={motors.m3} m4={motors.m4} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
