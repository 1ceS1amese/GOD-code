export interface TuiCycleDefinition {
  stateKey: string;
  values: readonly unknown[];
  fallback: unknown;
}

export type TuiCycleRegistry = Readonly<Record<string, TuiCycleDefinition>>;
export type TuiProfileCycleDefinition = TuiCycleDefinition;
export type TuiProfileCycleRegistry = TuiCycleRegistry;

export function cycleTuiValueFromRegistry<State extends object>(
  state: State,
  actionType: string,
  registry: TuiCycleRegistry,
  options: { enabled: boolean; patch?: Partial<State> }
): State | undefined {
  const definition = registry[actionType];
  if (!definition) {
    return undefined;
  }
  if (!options.enabled) {
    return state;
  }

  const currentValue = (state as Record<string, unknown>)[definition.stateKey];
  const currentIndex = definition.values.indexOf(currentValue);
  const nextValue = currentIndex < 0
    ? definition.fallback
    : definition.values[(currentIndex + 1) % definition.values.length] ?? definition.fallback;

  return {
    ...state,
    ...options.patch,
    [definition.stateKey]: nextValue
  };
}

export const cycleTuiProfileFromRegistry = cycleTuiValueFromRegistry;
