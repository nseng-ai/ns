type PiExtension<Pi> = (pi: Pi) => void;

export function composeCodeExtensions<SmartRestackPi, StackSquashPi>(
  smartRestackExtension: PiExtension<SmartRestackPi>,
  stackSquashExtension: PiExtension<StackSquashPi>,
): PiExtension<SmartRestackPi & StackSquashPi> {
  return function codeExtension(pi): void {
    smartRestackExtension(pi);
    stackSquashExtension(pi);
  };
}
