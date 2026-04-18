export interface ControlCommands {
  throttle: number; // 0..1
  roll: number;     // -1..1
  pitch: number;    // -1..1
  yaw: number;      // -1..1
}

export interface MotorOutputs {
  m1: number; // front-left
  m2: number; // front-right
  m3: number; // rear-right
  m4: number; // rear-left
}

// X-frame quadcopter mixer
// Motor spin directions:
//   M1 (FL) CCW   M2 (FR) CW
//   M4 (RL) CW    M3 (RR) CCW
export function mixQuadX(cmd: ControlCommands): MotorOutputs {
  const { throttle, roll, pitch, yaw } = cmd;

  const m1 = throttle - roll + pitch + yaw;
  const m2 = throttle + roll + pitch - yaw;
  const m3 = throttle + roll - pitch + yaw;
  const m4 = throttle - roll - pitch - yaw;

  return {
    m1: clamp(m1, 0, 1),
    m2: clamp(m2, 0, 1),
    m3: clamp(m3, 0, 1),
    m4: clamp(m4, 0, 1),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function motorPercent(v: number): number {
  return Math.round(v * 100);
}
