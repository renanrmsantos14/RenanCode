import { RegistryContext } from "@effect/atom-react";
import type { Atom } from "effect/reactivity";
import { useContext, useRef, useSyncExternalStore } from "react";

/** Reads `atom` live while `visible`; otherwise keeps the last value and stops listening. */
export function useAtomValueWhileVisible<A>(atom: Atom.Atom<A>, visible: boolean): A {
  const registry = useContext(RegistryContext);
  const held = useRef<{ readonly value: A } | null>(null);
  const subscribe = (onChange: () => void) =>
    visible ? registry.subscribe(atom, onChange) : () => undefined;
  return useSyncExternalStore(subscribe, () => {
    if (visible || held.current === null) held.current = { value: registry.get(atom) };
    return held.current.value;
  });
}
