export interface PIDConfig {
  kp: number;
  ki: number;
  kd: number;
  outputMin: number;
  outputMax: number;
  integralMax: number;
}

export interface PIDState {
  integral: number;
  prevError: number;
  prevTime: number;
}

export interface PIDOutput {
  output: number;
  pTerm: number;
  iTerm: number;
  dTerm: number;
  error: number;
}

export function createPIDState(): PIDState {
  return { integral: 0, prevError: 0, prevTime: 0 };
}

export function updatePID(
  config: PIDConfig,
  state: PIDState,
  setpoint: number,
  measurement: number,
  dt: number
): PIDOutput {
  const error = setpoint - measurement;

  state.integral = Math.max(
    -config.integralMax,
    Math.min(config.integralMax, state.integral + error * dt)
  );

  const derivative = dt > 0 ? (error - state.prevError) / dt : 0;
  state.prevError = error;

  const pTerm = config.kp * error;
  const iTerm = config.ki * state.integral;
  const dTerm = config.kd * derivative;

  const output = Math.max(
    config.outputMin,
    Math.min(config.outputMax, pTerm + iTerm + dTerm)
  );

  return { output, pTerm, iTerm, dTerm, error };
}

export const DEFAULT_ANGLE_PID: PIDConfig = {
  kp: 4.5,
  ki: 0.05,
  kd: 0.8,
  outputMin: -500,
  outputMax: 500,
  integralMax: 100,
};

export const DEFAULT_RATE_PID: PIDConfig = {
  kp: 0.15,
  ki: 0.01,
  kd: 0.005,
  outputMin: -1,
  outputMax: 1,
  integralMax: 50,
};
